// Messaging client. Talks to the Express API (server/index.js) like db.js does.
import { api } from './db';

export const MAX_MESSAGE = 1000;
export const MAX_MESSAGE_IMAGE_BYTES = 200 * 1024;

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
  return api('GET', `/api/conversations/${conversationId}/messages`);
}

export async function markConversationRead(conversationId) {
  await api('POST', `/api/conversations/${conversationId}/read`);
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
