// HeyChat data layer. Every call goes to the Express API (server/index.js),
// which talks to Supabase Postgres. The UI imports the same names as before.

const TOKEN_KEY = 'heychat-token';
const API = import.meta.env.VITE_API_URL ?? '';

export const EMOJIS = ['🔥', '😂', '❤️', '💯'];
export const PAGE_SIZE = 20;
export const MAX_POST_IMAGE_BYTES = 200 * 1024;
export const MAX_BIO = 160;
export const MAX_AVATAR_BYTES = 60 * 1024;
export const MAX_GRANT = 10000;
export const DAILY_BONUS = 50;
export const CREATOR_DAYS = 14;
export const GIFT_TIERS = [
  { id: 'social', label: 'Social' },
  { id: 'premium', label: 'Premium' },
  { id: 'luxury', label: 'Luxury' },
];

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

export function fetchAdminUsers() {
  return api('GET', '/api/admin/users');
}

export function fetchRecentPosts() {
  return api('GET', '/api/admin/posts');
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

export async function createPost(userId, body, image = null) {
  await api('POST', '/api/posts', { body, image });
}

export async function deletePost(postId) {
  await api('DELETE', `/api/posts/${postId}`);
}

export async function toggleReaction(postId, userId, emoji) {
  await api('POST', `/api/posts/${postId}/reactions`, { emoji });
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

export async function updateBio(userId, bio) {
  await api('PUT', '/api/me/bio', { bio });
}

export async function updateAvatar(userId, dataUrl) {
  await api('PUT', '/api/me/avatar', { dataUrl });
}

/* ---------- wallet ---------- */

export function fetchWallet() {
  return api('GET', '/api/wallet');
}

export async function claimDailyBonus() {
  const data = await api('POST', '/api/wallet/daily-bonus');
  return data.claimed;
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
