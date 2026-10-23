// Real-time layer on the same HTTP server as the API (no second service).
//
// The socket only carries events. Writes still go through the HTTP routes, which
// persist first and then call broadcast*(). If the socket is down, clients keep
// polling, so nothing depends on the socket for correctness.
//
// Rooms: `user:<id>` for every connected tab of a user, `conv:<id>` for every
// member who has the conversation open or in the list. Membership is checked
// against conversation_members at join time and again on every typing event.
import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';

const TYPING_TTL_MS = 4000;

export function createRealtime(server, { jwtSecret, one, q }) {
  const wss = new WebSocketServer({ noServer: true, path: '/ws', maxPayload: 16 * 1024 });
  const sockets = new Map(); // userId -> Set<ws>
  const rooms = new Map(); // roomName -> Set<ws>
  // Typing is ephemeral: conversation id -> userId -> timer.
  const typingTimers = new Map();

  function join(ws, room) {
    if (!rooms.has(room)) rooms.set(room, new Set());
    rooms.get(room).add(ws);
    ws.rooms.add(room);
  }

  function leaveAll(ws) {
    for (const room of ws.rooms) {
      const set = rooms.get(room);
      if (set) {
        set.delete(ws);
        if (!set.size) rooms.delete(room);
      }
    }
    ws.rooms.clear();
  }

  function send(ws, payload) {
    if (ws.readyState === 1) ws.send(JSON.stringify(payload));
  }

  function emitToRoom(room, payload) {
    for (const ws of rooms.get(room) ?? []) send(ws, payload);
  }

  // Authenticate the upgrade with the same JWT the HTTP API uses. The user row is
  // re-read so banned accounts are rejected even with an unexpired token.
  async function authenticate(token) {
    if (!token) return null;
    let payload;
    try {
      payload = jwt.verify(token, jwtSecret);
    } catch {
      return null;
    }
    const u = await one('SELECT id, banned FROM users WHERE id = ?', [Number(payload.sub)]);
    if (!u || u.banned) return null;
    return Number(u.id);
  }

  server.on('upgrade', async (req, socket, head) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== '/ws') return socket.destroy();
    // Token comes in the query string because browsers cannot set headers on WebSocket.
    const userId = await authenticate(url.searchParams.get('token')).catch(() => null);
    if (!userId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.userId = userId;
      ws.rooms = new Set();
      ws.isAlive = true;
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', async (ws) => {
    const userId = ws.userId;
    if (!sockets.has(userId)) sockets.set(userId, new Set());
    sockets.get(userId).add(ws);
    join(ws, `user:${userId}`);

    // Join every conversation the user is a member of, so message and read events arrive
    // without the client having to subscribe one by one.
    const convs = await q('SELECT conversation_id FROM conversation_members WHERE user_id = ?', [userId]).catch(() => []);
    for (const c of convs) join(ws, `conv:${Number(c.conversation_id)}`);
    send(ws, { type: 'ready', userId });

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg?.type === 'typing') {
        const convId = Number(msg.conversationId);
        if (!Number.isInteger(convId)) return;
        // Membership check on every event, not only at connect time.
        if (!ws.rooms.has(`conv:${convId}`)) return;
        emitToRoom(`conv:${convId}`, {
          type: 'typing',
          conversationId: convId,
          userId,
          active: !!msg.active,
        });
      }
    });

    ws.on('close', () => {
      leaveAll(ws);
      const set = sockets.get(userId);
      if (set) {
        set.delete(ws);
        if (!set.size) sockets.delete(userId);
      }
    });
    ws.on('error', () => {});
  });

  // Heartbeat: drop sockets that stopped answering pings so rooms don't leak.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30_000);
  heartbeat.unref();

  // Called after a route has written to the database.
  function broadcastMessage(convId, message) {
    emitToRoom(`conv:${convId}`, { type: 'message', conversationId: convId, message });
  }

  function broadcastRead(convId, userId, lastReadId) {
    emitToRoom(`conv:${convId}`, { type: 'read', conversationId: convId, userId, lastReadId });
  }

  // Adds a user's socket to a conversation room, e.g. right after they join a group or start a DM.
  function joinConversation(userId, convId) {
    for (const ws of sockets.get(userId) ?? []) join(ws, `conv:${convId}`);
  }

  function leaveConversation(userId, convId) {
    for (const ws of sockets.get(userId) ?? []) {
      const room = `conv:${convId}`;
      ws.rooms.delete(room);
      const set = rooms.get(room);
      if (set) {
        set.delete(ws);
        if (!set.size) rooms.delete(room);
      }
    }
  }

  function isConnected(userId) {
    return (sockets.get(userId)?.size ?? 0) > 0;
  }

  return {
    wss,
    broadcastMessage,
    broadcastRead,
    joinConversation,
    leaveConversation,
    isConnected,
    TYPING_TTL_MS,
  };
}
