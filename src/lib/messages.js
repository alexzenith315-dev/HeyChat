// Messaging client. Talks to the Express API (server/index.js) like db.js does.
import { api, MAX_UPLOAD_BYTES } from './db';
import { sendSocketEvent } from './socket';

export const MAX_MESSAGE = 1000;
export const MAX_MESSAGE_IMAGE_BYTES = MAX_UPLOAD_BYTES;

// Schema lives in Postgres now. Kept so existing callers keep working.
export function ensureMessagesSchema() {
  return Promise.resolve(true);
}

export function listUsers(viewerId) {
  return api('GET', '/api/users');
}

export function listConversations(viewerId) {
  return api('GET', '/api/conversations');
}

export async function totalUnread(viewerId) {
  const data = await api('GET', '/api/conversations/unread-count');
  return data.count;
}

export function getConversation(id, viewerId) {
  return api('GET', `/api/conversations/${id}`).catch(() => null);
}

export function updateConversation(id, { title, description }) {
  const body = {};
  if (title !== undefined) body.title = title;
  if (description !== undefined) body.description = description;
  return api('PATCH', `/api/conversations/${id}`, body);
}

export function removeConversationMember(id, userId) {
  return api('DELETE', `/api/conversations/${id}/members/${userId}`);
}

export function fetchMessages(conversationId) {
  return api('GET', `/api/conversations/${conversationId}/messages`).then((r) => r.messages ?? r);
}

// Messages plus each other member's read position, from one request.
export function fetchMessagesWithReads(conversationId) {
  return api('GET', `/api/conversations/${conversationId}/messages`).then((r) => ({
    messages: r.messages ?? r,
    readBy: r.readBy ?? [],
  }));
}

// Typing is sent over the socket only; the server relays it to the other members.
export function sendTyping(conversationId, active) {
  sendSocketEvent({ type: 'typing', conversationId, active });
}

export async function markConversationRead(conversationId) {
  const r = await api('POST', `/api/conversations/${conversationId}/read`);
  return r?.lastReadId ?? null;
}

export async function setMuted(conversationId, viewerId, muted) {
  await api('POST', `/api/conversations/${conversationId}/mute`, { muted });
}

export async function sendMessage(conversationId, viewerId, body, image = null) {
  await api('POST', `/api/conversations/${conversationId}/messages`, { body, image });
}

export async function createConversation({ kind, title = null, creatorId, memberIds }) {
  const data = await api('POST', '/api/conversations', { kind, title, memberIds });
  return Number(data.id);
}
