import { useEffect, useRef, useState } from 'react';
import { PhoneDisconnect, Phone, VideoCamera, VideoCameraSlash, Microphone, MicrophoneSlash } from '@phosphor-icons/react';
import Avatar from './Avatar';
import { CallSession, describeMediaError } from '../lib/calls';

const RING_LIMIT_MS = 30_000;

function fmt(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// Attach a MediaStream to a <video> without re-running on every render.
function Feed({ stream, muted, className }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream ?? null;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />;
}

// Plays remote audio for voice calls, where there is no video element to carry it.
function RemoteAudio({ stream }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream ?? null;
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}

const btn = 'focus-ring grid size-14 place-items-center rounded-full text-white transition active:scale-[0.94] disabled:opacity-40';

/**
 * Full-screen call UI. Owns one CallSession. role 'outgoing' rings the peer,
 * 'incoming' answers an existing ring. onClose runs once the call is over.
 */
export function ActiveCall({ conv, kind, role, incoming, onClose }) {
  const sessionRef = useRef(null);
  const [state, setState] = useState({ stage: role === 'outgoing' ? 'starting' : 'connecting', message: '' });
  const [local, setLocal] = useState(null);
  const [remote, setRemote] = useState(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [ringing, setRinging] = useState(role === 'outgoing');
  const [ringStartedAt] = useState(() => Date.now());
  const endedRef = useRef(false);

  useEffect(() => {
    const session = new CallSession((patch) => {
      if (patch.stage) setState((s) => ({ ...s, stage: patch.stage, message: patch.message ?? s.message, connectedAt: patch.connectedAt ?? s.connectedAt }));
      if (patch.message) setState((s) => ({ ...s, message: patch.message }));
      if ('local' in patch) setLocal(patch.local);
      if ('remote' in patch) setRemote(patch.remote);
      if (patch.stage === 'ended') {
        setRinging(false);
        if (!endedRef.current) {
          endedRef.current = true;
          // Keep the end reason visible briefly, then close.
          setTimeout(() => onClose?.(), 1800);
        }
      }
    });
    sessionRef.current = session;
    const start = async () => {
      try {
        if (role === 'outgoing') await session.startOutgoing(conv.id, kind);
        else await session.accept(incoming);
      } catch (err) {
        session.finish(describeMediaError(err, kind));
      }
    };
    start();
    return () => session.cleanup();
    // The session is created once per mount; the parent remounts for a new call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One clock drives both the ring timeout and the call timer.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  // Stop ringing on our side after 30s with no answer. The server rings out too.
  useEffect(() => {
    if (role !== 'outgoing' || state.stage !== 'ringing') return;
    if (now - ringStartedAt < RING_LIMIT_MS) return;
    setRinging(false);
    sessionRef.current?.hangUp('No answer');
  }, [now, role, state.stage, ringStartedAt]);

  const isLive = state.stage === 'connected';
  const elapsed = isLive && state.connectedAt ? now - state.connectedAt : 0;
  const ended = state.stage === 'ended';
  const label = ended
    ? state.message
    : state.stage === 'starting'
      ? 'Starting...'
      : state.stage === 'ringing'
        ? 'Ringing...'
        : state.stage === 'connecting'
          ? 'Connecting...'
          : isLive
            ? fmt(elapsed)
            : '';

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    sessionRef.current?.setMuted(next);
  };
  const toggleCamera = () => {
    const next = !cameraOff;
    setCameraOff(next);
    sessionRef.current?.setCameraOff(next);
  };
  const hangUp = () => sessionRef.current?.hangUp(role === 'outgoing' && state.stage === 'ringing' ? 'Call cancelled' : 'Call ended');

  const videoCall = kind === 'video';
  const showRemoteVideo = videoCall && remote;

  return (
    <div role="dialog" aria-modal="true" aria-label={`${videoCall ? 'Video' : 'Voice'} call with ${conv.title}`} className="fixed inset-0 z-50 flex flex-col bg-[#0b0d10] text-white">
      {showRemoteVideo && <Feed stream={remote} className="absolute inset-0 size-full object-cover" />}
      {!showRemoteVideo && remote && <RemoteAudio stream={remote} />}

      {videoCall && local && !cameraOff && (
        <Feed stream={local} muted className="absolute bottom-28 right-4 z-10 h-36 w-24 rounded-2xl border border-white/15 object-cover shadow-soft" />
      )}

      {/* Center: avatar and status. Hidden behind remote video once it arrives. */}
      <div className={`relative z-[1] flex flex-1 flex-col items-center justify-center gap-4 px-6 ${showRemoteVideo ? 'bg-gradient-to-b from-black/50 via-transparent to-black/60' : ''}`}>
        {!showRemoteVideo && <Avatar name={conv.title} src={conv.avatar} size="size-28" text="text-3xl" />}
        <h2 className="font-display text-2xl font-bold tracking-tight">{conv.title}</h2>
        <p role="status" aria-live="polite" className="text-base text-white/70 tabular-nums">{label}</p>
        {ringing && state.stage === 'ringing' && <p className="text-xs text-white/40">This call will end if nobody answers in 30 seconds.</p>}
      </div>

      <div className="relative z-[1] flex items-center justify-center gap-6 px-6 pb-10 pt-4">
        {!ended && isLive && (
          <button type="button" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? 'Unmute microphone' : 'Mute microphone'} className={`${btn} ${muted ? 'bg-white text-black' : 'bg-white/15'}`}>
            {muted ? <MicrophoneSlash size={24} aria-hidden="true" /> : <Microphone size={24} aria-hidden="true" />}
          </button>
        )}
        {!ended && videoCall && isLive && (
          <button type="button" onClick={toggleCamera} aria-pressed={cameraOff} aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'} className={`${btn} ${cameraOff ? 'bg-white text-black' : 'bg-white/15'}`}>
            {cameraOff ? <VideoCameraSlash size={24} aria-hidden="true" /> : <VideoCamera size={24} aria-hidden="true" />}
          </button>
        )}
        {!ended && (
          <button type="button" onClick={hangUp} aria-label={role === 'outgoing' && state.stage === 'ringing' ? 'Cancel call' : 'Hang up'} className={`${btn} bg-danger`}>
            <PhoneDisconnect size={26} weight="fill" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Full-screen ringer for an incoming call. Polled from the parent. Accept
 * starts the connection; decline tells the caller.
 */
export function IncomingCall({ call, onAccept, onDecline, busy, error }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={`Incoming ${call.kind} call from ${call.caller.name}`} className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-[#0b0d10] px-6 py-16 text-white">
      <div className="flex flex-col items-center gap-4">
        <Avatar name={call.caller.name} src={call.caller.avatar} size="size-28" text="text-3xl" />
        <h2 className="font-display text-2xl font-bold tracking-tight">{call.caller.name}</h2>
        <p className="text-base text-white/70">{call.kind === 'video' ? 'Incoming video call' : 'Incoming voice call'}</p>
        {error && <p role="alert" className="max-w-xs text-center text-sm text-danger">{error}</p>}
      </div>
      <div className="flex w-full max-w-xs items-center justify-around">
        <button type="button" onClick={onDecline} disabled={busy} aria-label="Decline call" className={`${btn} bg-danger`}>
          <PhoneDisconnect size={26} weight="fill" aria-hidden="true" />
        </button>
        <button type="button" onClick={onAccept} disabled={busy} aria-label="Accept call" className={`${btn} bg-success`}>
          {call.kind === 'video' ? <VideoCamera size={26} weight="fill" aria-hidden="true" /> : <Phone size={26} weight="fill" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
