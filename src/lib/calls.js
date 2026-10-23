// 1:1 WebRTC calls over the existing HTTP API. Signaling goes through /api/calls,
// which stores SDP and ICE on the call row. Both sides poll it about once a second.
import { api } from './db';

// Public STUN only, so peers can find each other's addresses. No TURN relay,
// so calls behind strict NATs can fail. That case ends with "Connection lost".
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
const POLL_MS = 1000;
const MAX_POLL_FAILURES = 20;

export const startCallApi = (convId, kind, offer) => api('POST', `/api/conversations/${convId}/call`, { kind, offer });
export const getIncomingCallApi = () => api('GET', '/api/calls/incoming').then((d) => d.call);
export const getCallStateApi = (id) => api('GET', `/api/calls/${id}`);
export const answerCallApi = (id, answer) => api('POST', `/api/calls/${id}/answer`, { answer });
export const signalCallApi = (id, candidate) => api('POST', `/api/calls/${id}/signal`, { candidate });
export const endCallApi = (id) => api('POST', `/api/calls/${id}/end`);

export function describeMediaError(err, kind) {
  const what = kind === 'video' ? 'camera and microphone' : 'microphone';
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return `Permission denied. Allow ${what} for this site in your browser settings, then try again.`;
    case 'NotFoundError':
    case 'OverconstrainedError':
      return `No ${what} found on this device.`;
    case 'NotReadableError':
    case 'AbortError':
      return `Your ${what} is in use by another app. Close it and try again.`;
    case 'NotSupported':
      return err.message;
    default:
      return err?.message && err.message.length < 140 && !/^Request failed/.test(err.message)
        ? err.message
        : `Could not access your ${what}.`;
  }
}

export async function getLocalMedia(kind) {
  if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
    throw Object.assign(new Error('This browser cannot make calls. Try Safari, Chrome or Firefox.'), { name: 'NotSupported' });
  }
  return navigator.mediaDevices.getUserMedia({
    audio: true,
    video: kind === 'video' ? { facingMode: 'user' } : false,
  });
}

const ENDED_TEXT = {
  ended: 'Call ended',
  declined: 'Call declined',
  cancelled: 'Call cancelled',
  missed: 'No answer',
};

/**
 * One call from one device's point of view. It owns the peer connection, the
 * local media, and the polling loop, and it reports changes through onUpdate.
 * finish() releases every track, listener, timer and the peer connection.
 */
export class CallSession {
  constructor(onUpdate) {
    this.onUpdate = onUpdate;
    this.pc = null;
    this.local = null;
    this.remote = null;
    this.callId = null;
    this.role = null;
    this.kind = null;
    this.pendingIce = [];
    this.appliedRemoteIce = 0;
    this.answerApplied = false;
    this.timer = null;
    this.polling = false;
    this.pollFailures = 0;
    this.closed = false;
  }

  emit(patch) {
    if (!this.closed) this.onUpdate(patch);
  }

  makePeer() {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = (e) => {
      if (!e.candidate || this.closed) return;
      if (this.callId) signalCallApi(this.callId, e.candidate.toJSON()).catch(() => {});
      else this.pendingIce.push(e.candidate.toJSON());
    };
    pc.ontrack = (e) => {
      if (this.closed) return;
      this.remote = e.streams?.[0] ?? new MediaStream([e.track]);
      this.emit({ remote: this.remote });
    };
    pc.onconnectionstatechange = () => {
      if (this.closed) return;
      const s = pc.connectionState;
      if (s === 'connected') this.emit({ stage: 'connected', connectedAt: this.connectedAt ?? (this.connectedAt = Date.now()) });
      else if (s === 'failed') this.finish('Connection lost. The call ended.');
    };
    return pc;
  }

  flushPendingIce() {
    const list = this.pendingIce.splice(0);
    for (const c of list) signalCallApi(this.callId, c).catch(() => {});
  }

  addLocalTracks() {
    this.local.getTracks().forEach((t) => this.pc.addTrack(t, this.local));
    this.emit({ local: this.local });
  }

  // Caller: grab media first so a permission error never creates a ringing call.
  async startOutgoing(convId, kind) {
    this.role = 'caller';
    this.kind = kind;
    this.local = await getLocalMedia(kind);
    if (this.closed) return;
    this.pc = this.makePeer();
    this.addLocalTracks();
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    const res = await startCallApi(convId, kind, { type: 'offer', sdp: this.pc.localDescription.sdp });
    this.callId = res.id;
    this.flushPendingIce();
    this.emit({ id: res.id, stage: 'ringing' });
    this.startPolling();
  }

  // Callee: take the offer, answer it, then poll for the caller's ICE.
  async accept(incoming) {
    this.role = 'callee';
    this.kind = incoming.kind;
    this.callId = incoming.id;
    this.local = await getLocalMedia(incoming.kind);
    if (this.closed) return;
    this.pc = this.makePeer();
    this.addLocalTracks();
    await this.pc.setRemoteDescription({ type: 'offer', sdp: incoming.offer.sdp });
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await answerCallApi(incoming.id, { type: 'answer', sdp: this.pc.localDescription.sdp });
    this.flushPendingIce();
    this.emit({ id: incoming.id, stage: 'connecting' });
    this.startPolling();
  }

  startPolling() {
    this.timer = setInterval(() => this.tick(), POLL_MS);
    this.tick();
  }

  async tick() {
    if (this.polling || this.closed || !this.callId) return;
    this.polling = true;
    try {
      const s = await getCallStateApi(this.callId);
      this.pollFailures = 0;
      if (this.closed) return;
      if (ENDED_TEXT[s.status]) return this.finish(ENDED_TEXT[s.status]);
      if (this.role === 'caller' && s.answer && !this.answerApplied && this.pc) {
        this.answerApplied = true;
        await this.pc.setRemoteDescription(s.answer);
        this.emit({ stage: 'connecting' });
      }
      // Only apply the other side's candidates once a remote description exists.
      if (this.pc?.remoteDescription) {
        const list = s.remoteCandidates ?? [];
        while (this.appliedRemoteIce < list.length) {
          await this.pc.addIceCandidate(list[this.appliedRemoteIce]).catch(() => {});
          this.appliedRemoteIce += 1;
        }
      }
    } catch {
      this.pollFailures += 1;
      if (this.pollFailures >= MAX_POLL_FAILURES) this.finish('Connection lost. The call ended.');
    } finally {
      this.polling = false;
    }
  }

  setMuted(muted) {
    this.local?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }

  setCameraOff(off) {
    this.local?.getVideoTracks().forEach((t) => (t.enabled = !off));
  }

  // Local hang up, cancel, or decline. Tear down at once so the UI never waits
  // on the network; tell the server in the background.
  async hangUp(message = 'Call ended') {
    const id = this.callId;
    this.finish(message);
    if (id) endCallApi(id).catch(() => {});
  }

  finish(message) {
    if (this.closed) return;
    this.emit({ stage: 'ended', message });
    this.cleanup();
  }

  cleanup() {
    this.closed = true;
    clearInterval(this.timer);
    this.timer = null;
    for (const stream of [this.local, this.remote]) stream?.getTracks().forEach((t) => t.stop());
    this.local = null;
    this.remote = null;
    if (this.pc) {
      this.pc.onicecandidate = null;
      this.pc.ontrack = null;
      this.pc.onconnectionstatechange = null;
      this.pc.close();
      this.pc = null;
    }
  }
}
