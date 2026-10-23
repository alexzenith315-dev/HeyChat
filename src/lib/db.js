// HeyChat data layer. Every call goes to the Express API (server/index.js),
// which talks to Supabase Postgres. The UI imports the same names as before.

const TOKEN_KEY = 'heychat-token';
const API = import.meta.env.VITE_API_URL ?? '';

export const PAGE_SIZE = 20;
// One upload cap for images, videos and attachments: 30 MB on the raw file.
export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
export const MAX_POST_IMAGE_BYTES = MAX_UPLOAD_BYTES;
export const MAX_BIO = 160;
export const MAX_AVATAR_BYTES = MAX_UPLOAD_BYTES;
export const MAX_GRANT = 10000;
export const CREATOR_DAYS = 14;
export const GIFT_TIERS = [
  { id: 'social', label: 'Social' },
  { id: 'premium', label: 'Premium' },
  { id: 'luxury', label: 'Luxury' },
];

// Reads an uploaded file as-is (no recompression) after checking type and size.
export function readUploadDataUrl(file, kind = 'image') {
  const ok = kind === 'video' ? /^video\/(mp4|webm)$/.test(file.type) : file.type.startsWith('image/');
  if (!ok) return Promise.reject(new Error(kind === 'video' ? 'Videos must be mp4 or webm.' : 'Pick an image file.'));
  if (file.size > MAX_UPLOAD_BYTES) return Promise.reject(new Error('That file is too large (30 MB max).'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.readAsDataURL(file);
  });
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    if (res.status === 401 && token) setToken(null);
    throw new Error(data?.error || `Request failed (${res.status}).`);
  }
  return data;
}

// Kept for the app's startup call. The schema lives in Postgres now.
export async function ensureSchema() {
  return true;
}

/* ---------- auth ---------- */

export async function getUserById() {
  // Session restore: the token is the session. Null means signed out.
  if (!getToken()) return null;
  try {
    const me = await api('GET', '/api/me');
    return { id: me.id, name: me.name, isAdmin: !!me.isAdmin };
  } catch {
    return null;
  }
}

export async function signup({ name, password, invite }) {
  const data = await api('POST', '/api/auth/signup', { name, password, invite });
  setToken(data.token);
  return { id: data.user.id, name: data.user.name, isAdmin: data.user.isAdmin, isFirst: data.user.isAdmin };
}

export async function login({ name, password }) {
  const data = await api('POST', '/api/auth/login', { name, password });
  setToken(data.token);
  return { id: data.user.id, name: data.user.name, isAdmin: data.user.isAdmin };
}

export function logout() {
  setToken(null);
}

/* ---------- admin ---------- */

export function fetchAdminStats() {
  return api('GET', '/api/admin/stats');
}

export function fetchAdminUsers({ q = '', offset = 0 } = {}) {
  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  if (offset) params.set('offset', String(offset));
  const qs = params.toString();
  return api('GET', `/api/admin/users${qs ? `?${qs}` : ''}`);
}

export function fetchRecentPosts({ before = null } = {}) {
  return api('GET', `/api/admin/posts${before ? `?before=${Number(before)}` : ''}`);
}

export async function setUserBanned(adminId, userId, banned) {
  await api('POST', `/api/admin/users/${userId}/ban`, { banned });
}

export async function grantCoins(adminId, userId, amount) {
  await api('POST', `/api/admin/users/${userId}/grant`, { amount });
}

/* ---------- invites (owner) ---------- */

export function listInvites() {
  return api('GET', '/api/admin/invites');
}

export async function createInvite() {
  const data = await api('POST', '/api/admin/invites');
  return data.code;
}

/* ---------- feed ---------- */

// No authorId: home feed (own posts + followed). With authorId: that author's posts.
export function fetchFeed(viewerId, beforeId = null, authorId = null) {
  const qs = new URLSearchParams();
  if (beforeId) qs.set('before', String(beforeId));
  if (authorId) qs.set('author', String(authorId));
  const suffix = qs.toString() ? `?${qs}` : '';
  return api('GET', `/api/feed${suffix}`);
}

export async function createPost(userId, body, image = null, video = null) {
  await api('POST', '/api/posts', { body, image, video });
}

export async function deletePost(postId) {
  await api('DELETE', `/api/posts/${postId}`);
}

// Records one view per viewer. Fire-and-forget: a failed view should never break the feed.
export function recordView(postId) {
  return api('POST', `/api/posts/${postId}/view`).catch(() => {});
}

export function toggleSave(postId, saved) {
  return api('PUT', `/api/posts/${postId}/save`, { saved });
}

export function recordStatusView(statusId) {
  return api('POST', `/api/statuses/${statusId}/view`).catch(() => {});
}

export function toggleStatusSave(statusId, saved) {
  return api('PUT', `/api/statuses/${statusId}/save`, { saved });
}

export function fetchSaved() {
  return api('GET', '/api/saved');
}

export async function toggleLike(postId) {
  await api('POST', `/api/posts/${postId}/like`);
}

export async function addComment(postId, userId, body) {
  await api('POST', `/api/posts/${postId}/comments`, { body });
}

export async function deleteComment(commentId) {
  await api('DELETE', `/api/comments/${commentId}`);
}

/* ---------- notifications ---------- */

export async function fetchUnreadCount() {
  const data = await api('GET', '/api/notifications/unread-count');
  return data.count;
}

export function fetchNotifications() {
  return api('GET', '/api/notifications');
}

export async function markNotificationsRead() {
  await api('POST', '/api/notifications/read');
}

/* ---------- follows & profiles ---------- */

export async function followUser(followerId, followeeId) {
  await api('POST', `/api/users/${followeeId}/follow`, { followed: false });
}

export async function unfollowUser(followerId, followeeId) {
  await api('POST', `/api/users/${followeeId}/follow`, { followed: true });
}

export async function toggleFollowUser(followerId, followeeId, currentlyFollowed) {
  const data = await api('POST', `/api/users/${followeeId}/follow`, { followed: currentlyFollowed });
  return data.followed;
}

export function fetchProfile(id) {
  return api('GET', `/api/users/${id}`);
}

export function fetchFollowList(id, kind) {
  return api('GET', `/api/users/${id}/follows/${kind}`);
}

export async function updateName(userId, name) {
  const data = await api('PUT', '/api/me/name', { name });
  return data.name;
}

export async function updateEmail(email) {
  const data = await api('PUT', '/api/me/email', { email });
  return data.email;
}

export async function fetchStatuses() {
  return api('GET', '/api/statuses');
}

export async function createStatus(body, images = []) {
  const list = Array.isArray(images) ? images : images ? [images] : [];
  await api('POST', '/api/statuses', { body, images: list });
}

export async function fetchStatusViewers(statusId) {
  return api('GET', `/api/statuses/${statusId}/viewers`);
}

export async function updateBio(userId, bio) {
  await api('PUT', '/api/me/bio', { bio });
}

export async function updateAvatar(userId, dataUrl) {
  await api('PUT', '/api/me/avatar', { dataUrl });
}

export async function updateCover(dataUrl) {
  const data = await api('PUT', '/api/me/cover', { dataUrl });
  return data.cover;
}

// The signed-in user's own record (includes email, which public profiles don't expose).
export function fetchMe() {
  return api('GET', '/api/me');
}

/* ---------- wallet ---------- */

export function fetchWallet() {
  return api('GET', '/api/wallet');
}

export function fetchTransactions() {
  return api('GET', '/api/transactions');
}

/* ---------- gifts ---------- */

export function fetchGifts() {
  return api('GET', '/api/gifts');
}

export async function sendGift({ giftId, recipientId, postId }) {
  await api('POST', '/api/gifts/send', { giftId, recipientId, postId });
}

/* ---------- creator ---------- */

export function fetchCreatorStats() {
  return api('GET', '/api/creator');
}
