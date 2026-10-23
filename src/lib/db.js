import { query, batch } from './folkdb';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT UNIQUE NOT NULL,
     password_hash TEXT NOT NULL,
     is_admin INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS invites (
     code TEXT PRIMARY KEY,
     created_by INTEGER NOT NULL,
     used_by INTEGER,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS posts (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id INTEGER NOT NULL,
     body TEXT NOT NULL,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS reactions (
     post_id INTEGER NOT NULL,
     user_id INTEGER NOT NULL,
     emoji TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     PRIMARY KEY (post_id, user_id, emoji)
   )`,
  `CREATE TABLE IF NOT EXISTS comments (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     post_id INTEGER NOT NULL,
     user_id INTEGER NOT NULL,
     body TEXT NOT NULL,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS follows (
     follower_id INTEGER,
     followee_id INTEGER,
     created_at INTEGER,
     PRIMARY KEY (follower_id, followee_id)
   )`,
  `CREATE TABLE IF NOT EXISTS notifications (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id INTEGER,
     actor_id INTEGER,
     kind TEXT,
     post_id INTEGER,
     read INTEGER DEFAULT 0,
     created_at INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS transactions (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id INTEGER,
     kind TEXT,
     amount INTEGER,
     counterpart_id INTEGER,
     post_id INTEGER,
     gift_id INTEGER,
     created_at INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS gifts (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT,
     tier TEXT,
     coin_cost INTEGER,
     emoji TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS gift_sends (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     gift_id INTEGER,
     sender_id INTEGER,
     recipient_id INTEGER,
     post_id INTEGER,
     created_at INTEGER
   )`,
];

// Explicit ids make INSERT OR IGNORE idempotent across launches.
const GIFT_SEEDS = [
  [1, 'Wave', 'social', 5, '👋'],
  [2, 'Sparkle', 'social', 10, '✨'],
  [3, 'Coffee', 'social', 15, '☕'],
  [4, 'Heart', 'premium', 50, '❤️'],
  [5, 'Rocket', 'premium', 100, '🚀'],
  [6, 'Crown', 'luxury', 500, '👑'],
  [7, 'Yacht', 'luxury', 2000, '🛥️'],
];

// Columns added after launch. Each runs alone so a column that already exists
// fails without blocking the rest, which keeps re-runs safe.
const MIGRATIONS = [
  'ALTER TABLE users ADD COLUMN bio TEXT',
  'ALTER TABLE users ADD COLUMN avatar TEXT',
  'ALTER TABLE users ADD COLUMN banned INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN coins INTEGER DEFAULT 100',
  'ALTER TABLE users ADD COLUMN last_daily_bonus TEXT',
  'ALTER TABLE posts ADD COLUMN image TEXT',
];

let ready = null;
export function ensureSchema() {
  if (!ready) {
    ready = batch(SCHEMA.map((sql) => ({ sql })))
      .then(async () => {
        for (const sql of MIGRATIONS) {
          try {
            await query(sql);
          } catch {
            /* column already exists */
          }
        }
        await query('UPDATE users SET coins = 100 WHERE coins IS NULL');
        await batch(
          GIFT_SEEDS.map(([id, name, tier, cost, emoji]) => ({
            sql: 'INSERT OR IGNORE INTO gifts (id, name, tier, coin_cost, emoji) VALUES (?, ?, ?, ?, ?)',
            args: [id, name, tier, cost, emoji],
          })),
        );
      })
      .catch((err) => {
        ready = null;
        throw err;
      });
  }
  return ready;
}

export const EMOJIS = ['🔥', '😂', '❤️', '💯'];
export const PAGE_SIZE = 20;
const MAX_POST = 280;
export const MAX_POST_IMAGE_BYTES = 200 * 1024;

// PBKDF2-SHA256 with a random salt. Only "salt:hash" (hex) is ever stored.
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => Uint8Array.from(hex.match(/../g).map((h) => parseInt(h, 16)));

async function derive(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' },
    key,
    256,
  );
  return toHex(bits);
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `${toHex(salt)}:${await derive(password, salt)}`;
}

async function verifyPassword(password, stored) {
  const [saltHex, hash] = stored.split(':');
  return (await derive(password, fromHex(saltHex))) === hash;
}

const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function makeInviteCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join('');
}

const publicUser = (u) => ({ id: u.id, name: u.name, isAdmin: !!u.is_admin });

export async function getUserById(id) {
  const { rows } = await query('SELECT id, name, is_admin, banned FROM users WHERE id = ?', [id]);
  if (!rows[0] || rows[0].banned) return null;
  return publicUser(rows[0]);
}

export async function signup({ name, password, invite }) {
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 24) throw new Error('Names need 1–24 characters.');
  if (password.length < 6) throw new Error('Password needs at least 6 characters.');

  const { rows: countRows } = await query('SELECT COUNT(*) AS n FROM users');
  const isFirst = Number(countRows[0].n) === 0;
  const code = invite.trim().toUpperCase();

  if (!isFirst) {
    const { rows } = await query('SELECT code, used_by FROM invites WHERE code = ?', [code]);
    if (!rows[0]) throw new Error('That invite code doesn’t exist.');
    if (rows[0].used_by != null) throw new Error('That invite code was already used.');
  }

  const { rows: taken } = await query('SELECT id FROM users WHERE name = ?', [cleanName]);
  if (taken[0]) throw new Error('Someone already has that name.');

  const passwordHash = await hashPassword(password);
  const { lastInsertId } = await query(
    'INSERT INTO users (name, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?)',
    [cleanName, passwordHash, isFirst ? 1 : 0, Date.now()],
  );
  if (!isFirst) {
    await query('UPDATE invites SET used_by = ? WHERE code = ? AND used_by IS NULL', [lastInsertId, code]);
  }
  return { id: Number(lastInsertId), name: cleanName, isAdmin: isFirst, isFirst };
}

export async function login({ name, password }) {
  const { rows } = await query('SELECT * FROM users WHERE name = ?', [name.trim()]);
  const u = rows[0];
  if (!u || !(await verifyPassword(password, u.password_hash))) {
    throw new Error('Name or password is off.');
  }
  if (u.banned) throw new Error('Your account is suspended.');
  return publicUser(u);
}

/* ---------- admin ---------- */

export async function fetchAdminStats() {
  const [{ rows: users }, { rows: posts }, { rows: messages }, { rows: coins }] = await batch([
    { sql: 'SELECT COUNT(*) AS n FROM users' },
    { sql: 'SELECT COUNT(*) AS n FROM posts' },
    { sql: 'SELECT COUNT(*) AS n FROM messages' },
    { sql: 'SELECT COALESCE(SUM(coins), 0) AS total FROM users' },
  ]);
  return {
    users: Number(users[0].n),
    posts: Number(posts[0].n),
    messages: Number(messages[0].n),
    coins: Number(coins[0].total),
  };
}

export async function fetchAdminUsers() {
  const { rows } = await query(
    `SELECT u.id, u.name, u.created_at, u.coins, u.banned, u.is_admin,
        (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id) AS post_count
     FROM users u ORDER BY u.created_at DESC, u.id DESC LIMIT 200`,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    created_at: Number(r.created_at),
    coins: Number(r.coins ?? 0),
    banned: !!Number(r.banned ?? 0),
    isAdmin: !!Number(r.is_admin),
    postCount: Number(r.post_count),
  }));
}

export async function fetchRecentPosts() {
  const { rows } = await query(
    `SELECT p.id, p.body, p.created_at, u.name AS author
     FROM posts p JOIN users u ON u.id = p.user_id
     ORDER BY p.id DESC LIMIT 25`,
  );
  return rows.map((r) => ({ ...r, id: Number(r.id), created_at: Number(r.created_at) }));
}

export async function setUserBanned(adminId, userId, banned) {
  if (adminId === userId) throw new Error('You can’t suspend your own account.');
  await query('UPDATE users SET banned = ? WHERE id = ?', [banned ? 1 : 0, userId]);
}

export const MAX_GRANT = 10000;

export async function grantCoins(adminId, userId, amount) {
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_GRANT) {
    throw new Error(`Enter a whole number from 1 to ${MAX_GRANT.toLocaleString('en-US')}.`);
  }
  const now = Date.now();
  const { affectedRows } = await query('UPDATE users SET coins = COALESCE(coins, 0) + ? WHERE id = ?', [amount, userId]);
  if (!affectedRows) throw new Error('That account no longer exists.');
  await query(
    'INSERT INTO transactions (user_id, kind, amount, counterpart_id, created_at) VALUES (?, ?, ?, ?, ?)',
    [userId, 'admin_grant', amount, adminId, now],
  );
}

/* ---------- invites (owner) ---------- */

export async function listInvites() {
  const { rows } = await query(
    `SELECT i.code, i.created_at, i.used_by, u.name AS used_by_name
     FROM invites i LEFT JOIN users u ON u.id = i.used_by
     ORDER BY i.created_at DESC LIMIT 100`,
  );
  return rows;
}

export async function createInvite(adminId) {
  const code = makeInviteCode();
  await query('INSERT INTO invites (code, created_by, used_by, created_at) VALUES (?, ?, NULL, ?)', [
    code,
    adminId,
    Date.now(),
  ]);
  return code;
}

/* ---------- feed ---------- */

// Without authorId this is the viewer's home feed: their own posts plus posts
// from people they follow. With authorId it is that author's profile posts.
export async function fetchFeed(viewerId, beforeId = null, authorId = null) {
  const where = [];
  const args = [];
  if (beforeId) {
    where.push('p.id < ?');
    args.push(beforeId);
  }
  if (authorId) {
    where.push('p.user_id = ?');
    args.push(authorId);
  } else {
    where.push('(p.user_id = ? OR p.user_id IN (SELECT followee_id FROM follows WHERE follower_id = ?))');
    args.push(viewerId, viewerId);
  }
  args.push(PAGE_SIZE + 1);
  const { rows: posts } = await query(
    `SELECT p.id, p.body, p.image, p.created_at, p.user_id, u.name AS author, u.avatar AS author_avatar
     FROM posts p JOIN users u ON u.id = p.user_id
     WHERE ${where.join(' AND ')}
     ORDER BY p.id DESC LIMIT ?`,
    args,
  );

  const hasMore = posts.length > PAGE_SIZE;
  const page = posts.slice(0, PAGE_SIZE);
  if (page.length === 0) return { posts: [], hasMore: false };

  const ids = page.map((p) => p.id);
  const marks = ids.map(() => '?').join(',');

  const authorIds = [...new Set(page.map((p) => p.user_id))];
  const authorMarks = authorIds.map(() => '?').join(',');

  const [{ rows: reactRows }, { rows: commentRows }, { rows: followRows }] = await batch([
    {
      sql: `SELECT post_id, emoji, COUNT(*) AS n,
              MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS mine
            FROM reactions WHERE post_id IN (${marks}) GROUP BY post_id, emoji`,
      args: [viewerId, ...ids],
    },
    {
      sql: `SELECT c.id, c.post_id, c.body, c.created_at, c.user_id, u.name AS author
            FROM comments c JOIN users u ON u.id = c.user_id
            WHERE c.post_id IN (${marks}) ORDER BY c.id ASC`,
      args: ids,
    },
    {
      sql: `SELECT followee_id FROM follows WHERE follower_id = ? AND followee_id IN (${authorMarks})`,
      args: [viewerId, ...authorIds],
    },
  ]);

  const followed = new Set(followRows.map((f) => Number(f.followee_id)));

  const reactions = {};
  for (const r of reactRows) {
    (reactions[r.post_id] ??= {})[r.emoji] = { count: Number(r.n), mine: !!Number(r.mine) };
  }
  const comments = {};
  for (const c of commentRows) (comments[c.post_id] ??= []).push(c);

  return {
    hasMore,
    posts: page.map((p) => ({
      ...p,
      reactions: reactions[p.id] ?? {},
      comments: comments[p.id] ?? [],
      followed: followed.has(Number(p.user_id)),
    })),
  };
}

export async function createPost(userId, body, image = null) {
  const text = body.trim();
  if (!text && !image) throw new Error('Write something first.');
  if (text.length > MAX_POST) throw new Error(`Keep it under ${MAX_POST} characters.`);
  if (image && image.length > MAX_POST_IMAGE_BYTES) throw new Error('That picture is too large.');
  await query('INSERT INTO posts (user_id, body, image, created_at) VALUES (?, ?, ?, ?)', [
    userId,
    text,
    image,
    Date.now(),
  ]);
}

export async function deletePost(postId) {
  await batch([
    { sql: 'DELETE FROM reactions WHERE post_id = ?', args: [postId] },
    { sql: 'DELETE FROM comments WHERE post_id = ?', args: [postId] },
    { sql: 'DELETE FROM posts WHERE id = ?', args: [postId] },
  ]);
}

export async function toggleReaction(postId, userId, emoji) {
  const { affectedRows } = await query(
    'DELETE FROM reactions WHERE post_id = ? AND user_id = ? AND emoji = ?',
    [postId, userId, emoji],
  );
  if (!affectedRows) {
    await query('INSERT INTO reactions (post_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)', [
      postId,
      userId,
      emoji,
      Date.now(),
    ]);
  }
}

export async function addComment(postId, userId, body) {
  const text = body.trim();
  if (!text) throw new Error('Say something first.');
  if (text.length > MAX_POST) throw new Error(`Keep it under ${MAX_POST} characters.`);
  const now = Date.now();
  const { rows } = await query('SELECT user_id FROM posts WHERE id = ?', [postId]);
  const statements = [
    {
      sql: 'INSERT INTO comments (post_id, user_id, body, created_at) VALUES (?, ?, ?, ?)',
      args: [postId, userId, text, now],
    },
  ];
  if (rows[0] && Number(rows[0].user_id) !== userId) {
    statements.push({
      sql: 'INSERT INTO notifications (user_id, actor_id, kind, post_id, read, created_at) VALUES (?, ?, ?, ?, 0, ?)',
      args: [rows[0].user_id, userId, 'comment', postId, now],
    });
  }
  await batch(statements);
}

export async function toggleLike(postId, userId, authorId) {
  const { affectedRows } = await query(
    'DELETE FROM reactions WHERE post_id = ? AND user_id = ? AND emoji = ?',
    [postId, userId, 'like'],
  );
  const notifiesAuthor = Number(authorId) !== userId;
  if (!affectedRows) {
    const now = Date.now();
    const statements = [
      {
        sql: 'INSERT OR IGNORE INTO reactions (post_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)',
        args: [postId, userId, 'like', now],
      },
    ];
    if (notifiesAuthor) {
      statements.push(
        {
          sql: 'DELETE FROM notifications WHERE kind = ? AND post_id = ? AND actor_id = ? AND user_id = ?',
          args: ['like', postId, userId, authorId],
        },
        {
          sql: 'INSERT INTO notifications (user_id, actor_id, kind, post_id, read, created_at) VALUES (?, ?, ?, ?, 0, ?)',
          args: [authorId, userId, 'like', postId, now],
        },
      );
    }
    await batch(statements);
  } else if (notifiesAuthor) {
    await query('DELETE FROM notifications WHERE kind = ? AND post_id = ? AND actor_id = ? AND user_id = ?', [
      'like',
      postId,
      userId,
      authorId,
    ]);
  }
}

/* ---------- notifications ---------- */

export async function fetchUnreadCount(userId) {
  const { rows } = await query('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0', [userId]);
  return Number(rows[0].n);
}

export async function fetchNotifications(userId) {
  const { rows } = await query(
    `SELECT n.id, n.kind, n.post_id, n.read, n.created_at, n.actor_id, u.name AS actor
     FROM notifications n LEFT JOIN users u ON u.id = n.actor_id
     WHERE n.user_id = ? ORDER BY n.created_at DESC, n.id DESC LIMIT 100`,
    [userId],
  );
  return rows;
}

export async function markNotificationsRead(userId) {
  await query('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0', [userId]);
}

export async function followUser(followerId, followeeId, postId) {
  await batch([
    {
      sql: 'INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)',
      args: [followerId, followeeId, Date.now()],
    },
    {
      sql: 'INSERT INTO notifications (user_id, actor_id, kind, post_id, read, created_at) VALUES (?, ?, ?, NULL, 0, ?)',
      args: [followeeId, followerId, 'follow', Date.now()],
    },
  ]);
}

export async function unfollowUser(followerId, followeeId) {
  await query('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?', [followerId, followeeId]);
}

export async function deleteComment(commentId) {
  await query('DELETE FROM comments WHERE id = ?', [commentId]);
}

/* ---------- profiles & settings ---------- */

export const MAX_BIO = 160;
export const MAX_AVATAR_BYTES = 60 * 1024;

export async function fetchProfile(id, viewerId) {
  const { rows } = await query(
    `SELECT u.id, u.name, u.bio, u.avatar,
       (SELECT COUNT(*) FROM follows WHERE followee_id = u.id) AS followers,
       (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) AS following,
       (SELECT COUNT(*) FROM follows WHERE follower_id = ? AND followee_id = u.id) AS followed
     FROM users u WHERE u.id = ?`,
    [viewerId, id],
  );
  const u = rows[0];
  if (!u) return null;
  return {
    id: Number(u.id),
    name: u.name,
    bio: u.bio ?? '',
    avatar: u.avatar ?? null,
    followers: Number(u.followers),
    following: Number(u.following),
    followed: Number(u.followed) > 0,
  };
}

export async function toggleFollowUser(followerId, followeeId, currentlyFollowed) {
  if (currentlyFollowed) {
    await unfollowUser(followerId, followeeId);
    return false;
  }
  const { affectedRows } = await query(
    'INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)',
    [followerId, followeeId, Date.now()],
  );
  if (affectedRows) {
    await query(
      'INSERT INTO notifications (user_id, actor_id, kind, post_id, read, created_at) VALUES (?, ?, ?, NULL, 0, ?)',
      [followeeId, followerId, 'follow', Date.now()],
    );
  }
  return true;
}

export async function updateBio(userId, bio) {
  const text = bio.trim();
  if (text.length > MAX_BIO) throw new Error(`Keep your bio under ${MAX_BIO} characters.`);
  await query('UPDATE users SET bio = ? WHERE id = ?', [text, userId]);
}

export async function updateAvatar(userId, dataUrl) {
  if (dataUrl && dataUrl.length > MAX_AVATAR_BYTES) throw new Error('That picture is too large.');
  await query('UPDATE users SET avatar = ? WHERE id = ?', [dataUrl, userId]);
}

/* ---------- wallet ---------- */

export const DAILY_BONUS = 50;

const dayKey = (d = new Date()) => d.toLocaleDateString('en-CA');

export async function fetchWallet(userId) {
  const { rows } = await query('SELECT coins, last_daily_bonus FROM users WHERE id = ?', [userId]);
  const u = rows[0];
  return {
    coins: Number(u?.coins ?? 0),
    lastDailyBonus: u?.last_daily_bonus ?? null,
    today: dayKey(),
  };
}

// Only the conditional UPDATE can match, so two tabs claiming at once grant once.
export async function claimDailyBonus(userId) {
  const today = dayKey();
  const { affectedRows } = await query(
    `UPDATE users SET coins = COALESCE(coins, 0) + ?, last_daily_bonus = ?
     WHERE id = ? AND (last_daily_bonus IS NULL OR last_daily_bonus != ?)`,
    [DAILY_BONUS, today, userId, today],
  );
  if (!affectedRows) return false;
  await query('INSERT INTO transactions (user_id, kind, amount, created_at) VALUES (?, ?, ?, ?)', [
    userId,
    'daily_bonus',
    DAILY_BONUS,
    Date.now(),
  ]);
  return true;
}

export async function fetchTransactions(userId) {
  const { rows } = await query(
    'SELECT id, kind, amount, counterpart_id, post_id, gift_id, created_at FROM transactions WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100',
    [userId],
  );
  return rows;
}

/* ---------- gifts ---------- */

export const GIFT_TIERS = [
  { id: 'social', label: 'Social' },
  { id: 'premium', label: 'Premium' },
  { id: 'luxury', label: 'Luxury' },
];

export async function fetchGifts() {
  const { rows } = await query('SELECT id, name, tier, coin_cost, emoji FROM gifts ORDER BY coin_cost ASC, id ASC');
  return rows.map((g) => ({ ...g, id: Number(g.id), coin_cost: Number(g.coin_cost) }));
}

// The conditional UPDATE is the only gate, so an overspend can't slip through
// when two gifts land at once.
export async function sendGift({ giftId, senderId, recipientId, postId, cost, name }) {
  if (senderId === recipientId) throw new Error('You can’t gift your own post.');
  const now = Date.now();
  const { affectedRows } = await query(
    'UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?',
    [cost, senderId, cost],
  );
  if (!affectedRows) throw new Error(`Not enough coins for ${name}.`);
  try {
    await batch([
      { sql: 'UPDATE users SET coins = COALESCE(coins, 0) + ? WHERE id = ?', args: [cost, recipientId] },
      {
        sql: 'INSERT INTO transactions (user_id, kind, amount, counterpart_id, post_id, gift_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [senderId, 'gift_sent', -cost, recipientId, postId, giftId, now],
      },
      {
        sql: 'INSERT INTO transactions (user_id, kind, amount, counterpart_id, post_id, gift_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [recipientId, 'gift_received', cost, senderId, postId, giftId, now],
      },
      {
        sql: 'INSERT INTO gift_sends (gift_id, sender_id, recipient_id, post_id, created_at) VALUES (?, ?, ?, ?, ?)',
        args: [giftId, senderId, recipientId, postId, now],
      },
      {
        sql: 'INSERT INTO notifications (user_id, actor_id, kind, post_id, read, created_at) VALUES (?, ?, ?, ?, 0, ?)',
        args: [recipientId, senderId, 'gift', postId, now],
      },
    ]);
  } catch (e) {
    await query('UPDATE users SET coins = coins + ? WHERE id = ?', [cost, senderId]);
    throw e;
  }
}

/* ---------- creator ---------- */

export const CREATOR_DAYS = 14;

export async function fetchCreatorStats(userId) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (CREATOR_DAYS - 1));

  const [
    { rows: earnedRows },
    { rows: recent },
    { rows: daily },
    { rows: followerRows },
    { rows: postRows },
    { rows: likeRows },
  ] = await batch([
    {
      sql: "SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE user_id = ? AND kind = 'gift_received'",
      args: [userId],
    },
    {
      sql: `SELECT gs.id, gs.created_at, g.name, g.emoji, u.name AS sender
            FROM gift_sends gs
            JOIN gifts g ON g.id = gs.gift_id
            JOIN users u ON u.id = gs.sender_id
            WHERE gs.recipient_id = ?
            ORDER BY gs.created_at DESC, gs.id DESC LIMIT 20`,
      args: [userId],
    },
    {
      sql: "SELECT created_at, amount FROM transactions WHERE user_id = ? AND kind = 'gift_received' AND created_at >= ?",
      args: [userId, start.getTime()],
    },
    { sql: 'SELECT COUNT(*) AS n FROM follows WHERE followee_id = ?', args: [userId] },
    { sql: 'SELECT COUNT(*) AS n FROM posts WHERE user_id = ?', args: [userId] },
    {
      sql: `SELECT COUNT(*) AS n FROM reactions r
            JOIN posts p ON p.id = r.post_id
            WHERE p.user_id = ? AND r.emoji = 'like'`,
      args: [userId],
    },
  ]);

  const days = [];
  for (let i = 0; i < CREATOR_DAYS; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push({ key: dayKey(d), date: d, coins: 0 });
  }
  const byKey = Object.fromEntries(days.map((d) => [d.key, d]));
  for (const t of daily) {
    const bucket = byKey[dayKey(new Date(Number(t.created_at)))];
    if (bucket) bucket.coins += Number(t.amount);
  }

  return {
    totalEarned: Number(earnedRows[0].total),
    recent: recent.map((r) => ({ ...r, created_at: Number(r.created_at) })),
    daily: days.map(({ date, coins }) => ({
      label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      coins,
    })),
    followers: Number(followerRows[0].n),
    posts: Number(postRows[0].n),
    likes: Number(likeRows[0].n),
  };
}
