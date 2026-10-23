import { query, batch } from './folkdb';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS conversations (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     kind TEXT NOT NULL,
     title TEXT,
     created_by INTEGER NOT NULL,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS conversation_members (
     conversation_id INTEGER NOT NULL,
     user_id INTEGER NOT NULL,
     muted INTEGER NOT NULL DEFAULT 0,
     last_read_id INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (conversation_id, user_id)
   )`,
  `CREATE TABLE IF NOT EXISTS messages (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     conversation_id INTEGER NOT NULL,
     sender_id INTEGER NOT NULL,
     body TEXT,
     image TEXT,
     created_at INTEGER NOT NULL
   )`,
];

export const MAX_MESSAGE = 1000;
export const MAX_MESSAGE_IMAGE_BYTES = 200 * 1024;
const HISTORY_LIMIT = 100;

let ready = null;
export function ensureMessagesSchema() {
  if (!ready) {
    ready = batch(SCHEMA.map((sql) => ({ sql }))).catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

export async function listUsers(viewerId) {
  const { rows } = await query(
    'SELECT id, name, avatar FROM users WHERE COALESCE(banned, 0) = 0 AND id <> ? ORDER BY name COLLATE NOCASE',
    [viewerId],
  );
  return rows.map((u) => ({ id: Number(u.id), name: u.name, avatar: u.avatar ?? null }));
}

// Each row is one conversation the viewer belongs to. DM titles are the other
// person's name. Unread counts skip muted conversations so the badge only
// reflects the ones the viewer wants to hear about.
export async function listConversations(viewerId) {
  const { rows } = await query(
    `SELECT c.id, c.kind, c.created_by,
       COALESCE(c.title, (
         SELECT u.name FROM conversation_members m JOIN users u ON u.id = m.user_id
         WHERE m.conversation_id = c.id AND m.user_id <> ? LIMIT 1
       )) AS title,
       cm.muted, cm.last_read_id,
       (SELECT COUNT(*) FROM messages x
         WHERE x.conversation_id = c.id AND x.id > cm.last_read_id AND x.sender_id <> ?) AS unread,
       (SELECT COALESCE(body, '') FROM messages y WHERE y.conversation_id = c.id ORDER BY y.id DESC LIMIT 1) AS last_body,
       (SELECT MAX(created_at) FROM messages z WHERE z.conversation_id = c.id) AS last_at
     FROM conversations c
     JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
     ORDER BY COALESCE(last_at, c.created_at) DESC, c.id DESC`,
    [viewerId, viewerId, viewerId],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    kind: r.kind,
    title: r.title ?? 'Untitled',
    createdBy: Number(r.created_by),
    muted: !!Number(r.muted),
    unread: Number(!Number(r.muted) ? r.unread : 0),
    lastBody: r.last_body ?? '',
    lastAt: r.last_at == null ? null : Number(r.last_at),
  }));
}

export async function totalUnread(viewerId) {
  const list = await listConversations(viewerId);
  return list.reduce((sum, c) => sum + c.unread, 0);
}

export async function getConversation(id, viewerId) {
  const { rows } = await query(
    `SELECT c.id, c.kind, c.title, c.created_by, cm.muted
     FROM conversations c
     JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
     WHERE c.id = ?`,
    [viewerId, id],
  );
  const c = rows[0];
  if (!c) return null;
  const { rows: members } = await query(
    `SELECT u.id, u.name FROM conversation_members m JOIN users u ON u.id = m.user_id
     WHERE m.conversation_id = ? ORDER BY u.name COLLATE NOCASE`,
    [id],
  );
  const names = members.map((m) => m.name);
  const title =
    c.kind === 'dm'
      ? members.find((m) => Number(m.id) !== viewerId)?.name ?? 'Direct message'
      : c.title ?? 'Untitled';
  return {
    id: Number(c.id),
    kind: c.kind,
    title,
    createdBy: Number(c.created_by),
    muted: !!Number(c.muted),
    members: names,
  };
}

export async function fetchMessages(conversationId) {
  const { rows } = await query(
    `SELECT * FROM (
       SELECT m.id, m.body, m.image, m.created_at, m.sender_id, u.name AS sender, u.avatar AS sender_avatar
       FROM messages m LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = ? ORDER BY m.id DESC LIMIT ?
     ) ORDER BY id ASC`,
    [conversationId, HISTORY_LIMIT],
  );
  return rows.map((m) => ({
    id: Number(m.id),
    body: m.body ?? '',
    image: m.image ?? null,
    createdAt: Number(m.created_at),
    senderId: Number(m.sender_id),
    sender: m.sender ?? 'Someone',
    senderAvatar: m.sender_avatar ?? null,
  }));
}

export async function markConversationRead(conversationId, viewerId) {
  await query(
    `UPDATE conversation_members
     SET last_read_id = (SELECT COALESCE(MAX(id), 0) FROM messages WHERE conversation_id = ?)
     WHERE conversation_id = ? AND user_id = ?`,
    [conversationId, conversationId, viewerId],
  );
}

export async function setMuted(conversationId, viewerId, muted) {
  await query('UPDATE conversation_members SET muted = ? WHERE conversation_id = ? AND user_id = ?', [
    muted ? 1 : 0,
    conversationId,
    viewerId,
  ]);
}

export async function sendMessage(conversationId, viewerId, body, image = null) {
  const text = body.trim();
  if (!text && !image) throw new Error('Write something first.');
  if (text.length > MAX_MESSAGE) throw new Error(`Keep it under ${MAX_MESSAGE} characters.`);
  if (image && image.length > MAX_MESSAGE_IMAGE_BYTES) throw new Error('That picture is too large.');

  const { rows } = await query(
    `SELECT c.kind, c.created_by, cm.user_id FROM conversations c
     JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
     WHERE c.id = ?`,
    [viewerId, conversationId],
  );
  const c = rows[0];
  if (!c) throw new Error('You are not in this conversation.');
  if (c.kind === 'channel' && Number(c.created_by) !== viewerId) {
    throw new Error('Only the creator can post in this channel.');
  }
  await query(
    'INSERT INTO messages (conversation_id, sender_id, body, image, created_at) VALUES (?, ?, ?, ?, ?)',
    [conversationId, viewerId, text, image, Date.now()],
  );
}

// kind is 'dm' | 'group' | 'channel'. A DM reuses the existing two-person
// conversation between the pair, so opening one twice lands in the same thread.
export async function createConversation({ kind, title = null, creatorId, memberIds }) {
  const others = [...new Set(memberIds.map(Number))].filter((id) => id !== creatorId);
  if (kind === 'dm') {
    if (others.length !== 1) throw new Error('Pick one person to message.');
    const existing = await query(
      `SELECT c.id FROM conversations c
       JOIN conversation_members a ON a.conversation_id = c.id AND a.user_id = ?
       JOIN conversation_members b ON b.conversation_id = c.id AND b.user_id = ?
       WHERE c.kind = 'dm' LIMIT 1`,
      [creatorId, others[0]],
    );
    if (existing.rows[0]) return Number(existing.rows[0].id);
  } else if (kind === 'group') {
    if (others.length < 1) throw new Error('Add at least one other person.');
    if (!title?.trim()) throw new Error('Give the group a name.');
  } else if (kind === 'channel') {
    if (!title?.trim()) throw new Error('Give the channel a name.');
  } else {
    throw new Error('Unknown conversation type.');
  }

  const { lastInsertId } = await query(
    'INSERT INTO conversations (kind, title, created_by, created_at) VALUES (?, ?, ?, ?)',
    [kind, title?.trim() || null, creatorId, Date.now()],
  );
  const id = Number(lastInsertId);
  await batch(
    [creatorId, ...others].map((uid) => ({
      sql: 'INSERT INTO conversation_members (conversation_id, user_id, muted, last_read_id) VALUES (?, ?, 0, 0)',
      args: [id, uid],
    })),
  );
  return id;
}
