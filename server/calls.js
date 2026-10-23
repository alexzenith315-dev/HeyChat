// 1:1 call signaling for DMs. WebRTC offers, answers and ICE candidates are
// stored on a call row and polled by both sides, the same way messages are.
// No sockets. Mounted from index.js after requireAuth, so every route here is
// authenticated and every read/write is limited to the two participants.

export const RING_MS = 30_000;
// A live call is one where at least one side has polled within this window.
// Clients poll every second while in a call, so 20s means a side is really gone.
const STALE_MS = 20_000;
const MAX_CANDIDATES = 60;
const MAX_SDP = 20_000;
const MAX_CANDIDATE = 2_000;

export async function migrateCalls(exec) {
  await exec(`CREATE TABLE IF NOT EXISTS calls (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL,
    caller_id INTEGER NOT NULL,
    callee_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    offer TEXT,
    answer TEXT,
    caller_ice TEXT NOT NULL DEFAULT '[]',
    callee_ice TEXT NOT NULL DEFAULT '[]',
    created_at BIGINT NOT NULL,
    answered_at BIGINT,
    ended_at BIGINT,
    caller_seen BIGINT,
    callee_seen BIGINT
  )`);
  await exec('CREATE INDEX IF NOT EXISTS calls_status_created ON calls (status, created_at)');
  await exec('CREATE INDEX IF NOT EXISTS calls_callee_status ON calls (callee_id, status)');
  await exec('CREATE INDEX IF NOT EXISTS calls_caller_status ON calls (caller_id, status)');
}

export function registerCallRoutes(app, { wrap, bad, one, q, exec, me, requireMember }) {
  // Ring-outs and dead live calls are settled lazily on every call request,
  // so nothing needs a background timer.
  async function settle(now) {
    await exec("UPDATE calls SET status = 'missed', ended_at = ? WHERE status = 'ringing' AND created_at < ?", [
      now,
      now - RING_MS,
    ]);
    await exec(
      `UPDATE calls SET status = 'ended', ended_at = ? WHERE status = 'active'
       AND GREATEST(COALESCE(caller_seen, 0), COALESCE(callee_seen, 0)) < ?`,
      [now, now - STALE_MS],
    );
  }

  const isSdp = (d, type) =>
    d && typeof d === 'object' && d.type === type && typeof d.sdp === 'string' && d.sdp.length > 0 && d.sdp.length <= MAX_SDP;

  const parseList = (s) => {
    try {
      const v = JSON.parse(s || '[]');
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };

  // Loads a call the viewer is part of, or null.
  async function loadForParticipant(id, viewer) {
    if (!Number.isInteger(id)) return null;
    const c = await one(
      `SELECT c.*, cu.name AS caller_name, cu.avatar AS caller_avatar, ce.name AS callee_name, ce.avatar AS callee_avatar
       FROM calls c
       JOIN users cu ON cu.id = c.caller_id
       JOIN users ce ON ce.id = c.callee_id
       WHERE c.id = ? AND (c.caller_id = ? OR c.callee_id = ?)`,
      [id, viewer, viewer],
    );
    return c ?? null;
  }

  // Start a call in a DM. Body: { kind: 'voice'|'video', offer: RTCSessionDescriptionInit }
  app.post(
    '/api/conversations/:id/call',
    wrap(async (req, res) => {
      const now = Date.now();
      await settle(now);
      const convId = Number(req.params.id);
      const viewer = me(req);
      if (!(await requireMember(convId, viewer))) return res.status(404).json({ error: 'Not in this conversation.' });
      const kind = req.body?.kind;
      if (kind !== 'voice' && kind !== 'video') bad('Choose a voice or video call.');
      if (!isSdp(req.body?.offer, 'offer')) bad('Could not start the call. Try again.');
      const conv = await one('SELECT kind FROM conversations WHERE id = ?', [convId]);
      if (!conv || conv.kind !== 'dm') bad('Calls are only for direct messages.');
      const peer = await one('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id <> ?', [
        convId,
        viewer,
      ]);
      if (!peer) bad('Calls are only for direct messages.');
      const peerId = Number(peer.user_id);

      const busyMe = await one(
        "SELECT id FROM calls WHERE status IN ('ringing', 'active') AND (caller_id = ? OR callee_id = ?) LIMIT 1",
        [viewer, viewer],
      );
      if (busyMe) bad('You are already on a call.', 409);
      const busyPeer = await one(
        "SELECT id FROM calls WHERE status IN ('ringing', 'active') AND (caller_id = ? OR callee_id = ?) LIMIT 1",
        [peerId, peerId],
      );
      if (busyPeer) bad('They are on another call right now.', 409);

      const row = await one(
        `INSERT INTO calls (conversation_id, caller_id, callee_id, kind, status, offer, created_at, caller_seen)
         VALUES (?, ?, ?, ?, 'ringing', ?, ?, ?) RETURNING id`,
        [convId, viewer, peerId, kind, JSON.stringify(req.body.offer), now, now],
      );
      res.json({ id: Number(row.id), status: 'ringing', kind });
    }),
  );

  // The callee's ringer polls this. Returns the one call currently ringing for them, or null.
  app.get(
    '/api/calls/incoming',
    wrap(async (req, res) => {
      await settle(Date.now());
      const viewer = me(req);
      const row = await one(
        `SELECT c.id, c.kind, c.offer, c.created_at, c.conversation_id, u.name AS caller_name, u.avatar AS caller_avatar
         FROM calls c JOIN users u ON u.id = c.caller_id
         WHERE c.callee_id = ? AND c.status = 'ringing' ORDER BY c.id DESC LIMIT 1`,
        [viewer],
      );
      if (!row) return res.json({ call: null });
      res.json({
        call: {
          id: Number(row.id),
          kind: row.kind,
          offer: JSON.parse(row.offer),
          createdAt: Number(row.created_at),
          conversationId: Number(row.conversation_id),
          caller: { name: row.caller_name, avatar: row.caller_avatar ?? null },
        },
      });
    }),
  );

  // Both sides poll this. It returns status plus the other side's signaling.
  app.get(
    '/api/calls/:id',
    wrap(async (req, res) => {
      await settle(Date.now());
      const viewer = me(req);
      const c = await loadForParticipant(Number(req.params.id), viewer);
      if (!c) return res.status(404).json({ error: 'No such call.' });
      const isCaller = Number(c.caller_id) === viewer;
      if (c.status === 'active') {
        await exec(
          `UPDATE calls SET ${isCaller ? 'caller_seen' : 'callee_seen'} = ? WHERE id = ?`,
          [Date.now(), c.id],
        );
      }
      res.json({
        id: Number(c.id),
        kind: c.kind,
        status: c.status,
        role: isCaller ? 'caller' : 'callee',
        peer: isCaller
          ? { name: c.callee_name, avatar: c.callee_avatar ?? null }
          : { name: c.caller_name, avatar: c.caller_avatar ?? null },
        offer: !isCaller && c.offer ? JSON.parse(c.offer) : null,
        answer: isCaller && c.answer ? JSON.parse(c.answer) : null,
        remoteCandidates: parseList(isCaller ? c.callee_ice : c.caller_ice),
        answeredAt: c.answered_at ? Number(c.answered_at) : null,
        endedAt: c.ended_at ? Number(c.ended_at) : null,
      });
    }),
  );

  // Callee accepts. Body: { answer: RTCSessionDescriptionInit }
  app.post(
    '/api/calls/:id/answer',
    wrap(async (req, res) => {
      const now = Date.now();
      await settle(now);
      const viewer = me(req);
      const id = Number(req.params.id);
      const c = await loadForParticipant(id, viewer);
      if (!c) return res.status(404).json({ error: 'No such call.' });
      if (Number(c.callee_id) !== viewer) bad('Only the person being called can answer.', 403);
      if (!isSdp(req.body?.answer, 'answer')) bad('Could not connect the call. Try again.');
      const done = await q(
        `UPDATE calls SET answer = ?, status = 'active', answered_at = ?, callee_seen = ?, caller_seen = ?
         WHERE id = ? AND status = 'ringing' AND callee_id = ? RETURNING id`,
        [JSON.stringify(req.body.answer), now, now, now, id, viewer],
      );
      if (!done.length) bad('That call already ended.', 409);
      res.json({ ok: true, status: 'active' });
    }),
  );

  // Trickle ICE. Body: { candidate: RTCIceCandidateInit }. Either side, own column only.
  app.post(
    '/api/calls/:id/signal',
    wrap(async (req, res) => {
      await settle(Date.now());
      const viewer = me(req);
      const c = await loadForParticipant(Number(req.params.id), viewer);
      if (!c) return res.status(404).json({ error: 'No such call.' });
      if (c.status !== 'ringing' && c.status !== 'active') return res.json({ ok: true, ignored: true });
      const cand = req.body?.candidate;
      if (!cand || typeof cand !== 'object') bad('Bad candidate.');
      const json = JSON.stringify(cand);
      if (json.length > MAX_CANDIDATE) bad('Bad candidate.');
      const isCaller = Number(c.caller_id) === viewer;
      const col = isCaller ? 'caller_ice' : 'callee_ice';
      const list = parseList(isCaller ? c.caller_ice : c.callee_ice);
      if (list.length < MAX_CANDIDATES) {
        list.push(cand);
        await exec(`UPDATE calls SET ${col} = ? WHERE id = ?`, [JSON.stringify(list), c.id]);
      }
      res.json({ ok: true });
    }),
  );

  // Anyone in the call can end it. What "end" means depends on state:
  // caller while ringing = cancelled, callee while ringing = declined, live = ended.
  app.post(
    '/api/calls/:id/end',
    wrap(async (req, res) => {
      const now = Date.now();
      await settle(now);
      const viewer = me(req);
      const id = Number(req.params.id);
      const c = await loadForParticipant(id, viewer);
      if (!c) return res.status(404).json({ error: 'No such call.' });
      const isCallee = Number(c.callee_id) === viewer;
      await exec(
        `UPDATE calls SET ended_at = ?, status = CASE
           WHEN status = 'active' THEN 'ended'
           WHEN ? THEN 'declined'
           ELSE 'cancelled' END
         WHERE id = ? AND status IN ('ringing', 'active')`,
        [now, isCallee, id],
      );
      const after = await one('SELECT status FROM calls WHERE id = ?', [id]);
      res.json({ ok: true, status: after?.status ?? c.status });
    }),
  );
}
