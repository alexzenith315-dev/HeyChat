import 'dotenv/config';
import express from 'express';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { DATABASE_URL, JWT_SECRET } = process.env;
if (!DATABASE_URL || !JWT_SECRET) {
  console.error('DATABASE_URL and JWT_SECRET must be set (see .env.example).');
  process.exit(1);
}

// Postgres int8 / numeric come back as strings by default. Timestamps and counts
// fit safely in JS numbers, so parse them.
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 5,
  ssl: { rejectUnauthorized: false },
});

// The SQL below uses ? placeholders (portable style from the original app). Convert to $n.
const toPg = (sql) => {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
};
const q = async (sql, args = []) => (await pool.query(toPg(sql), args)).rows;
const one = async (sql, args = []) => (await q(sql, args))[0] ?? null;
const exec = async (sql, args = []) => pool.query(toPg(sql), args);

// Sequential statements inside a transaction, used where the old code used batch().
async function tx(statements) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const results = [];
    for (const { sql, args = [] } of statements) {
      results.push((await client.query(toPg(sql), args)).rows);
    }
    await client.query('COMMIT');
    return results;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

class UserError extends Error {}
const bad = (msg) => {
  throw new UserError(msg);
};
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ---------- password hashing ---------- */

// Accounts migrated from the old app use PBKDF2-SHA256 "salt:hash" (hex, 150k iterations).
// Verify those once, then rehash to bcrypt on the next successful login.
function verifyLegacyPbkdf2(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const derived = crypto.pbkdf2Sync(password, Buffer.from(saltHex, 'hex'), 150000, 32, 'sha256');
  const a = Buffer.from(derived.toString('hex'));
  const b = Buffer.from(hashHex);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function checkPassword(user, password) {
  if (user.password_hash.startsWith('$2')) return bcrypt.compare(password, user.password_hash);
  if (verifyLegacyPbkdf2(password, user.password_hash)) {
    const upgraded = await bcrypt.hash(password, 12);
    await exec('UPDATE users SET password_hash = ? WHERE id = ?', [upgraded, user.id]);
    return true;
  }
  return false;
}

const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function makeInviteCode() {
  const bytes = crypto.randomBytes(6);
  return [...bytes].map((b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join('');
}

const issueToken = (user) =>
  jwt.sign({ sub: String(user.id) }, JWT_SECRET, { expiresIn: '30d' });

const publicUser = (u) => ({ id: Number(u.id), name: u.name, isAdmin: !!u.is_admin });

/* ---------- auth middleware ---------- */

// Every /api route except signup and login goes through this. It reloads the user
// so banned or deleted accounts lose access immediately, even with an old token.
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Sign in first.' });
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Your session expired. Sign in again.' });
    }
    const u = await one('SELECT id, name, is_admin, banned FROM users WHERE id = ?', [Number(payload.sub)]);
    if (!u || u.banned) return res.status(401).json({ error: 'Sign in first.' });
    req.user = { id: Number(u.id), name: u.name, isAdmin: !!u.is_admin };
    next();
  } catch (e) {
    next(e);
  }
}

function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Owner only.' });
  next();
}

/* ---------- app ---------- */

const app = express();
app.use(express.json({ limit: '400kb' }));

// Auth (public)
app.post(
  '/api/auth/signup',
  wrap(async (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    const password = String(req.body?.password ?? '');
    const invite = String(req.body?.invite ?? '').trim().toUpperCase();
    if (!name || name.length > 24) bad('Names need 1–24 characters.');
    if (password.length < 6) bad('Password needs at least 6 characters.');

    const count = await one('SELECT COUNT(*) AS n FROM users');
    const isFirst = Number(count.n) === 0;

    if (!isFirst) {
      const inv = await one('SELECT code, used_by FROM invites WHERE code = ?', [invite]);
      if (!inv) bad('That invite code doesn’t exist.');
      if (inv.used_by != null) bad('That invite code was already used.');
    }
    if (await one('SELECT id FROM users WHERE name = ?', [name])) bad('Someone already has that name.');

    const passwordHash = await bcrypt.hash(password, 12);
    const created = await one(
      'INSERT INTO users (name, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?) RETURNING id, name, is_admin',
      [name, passwordHash, isFirst, Date.now()],
    );
    if (!isFirst) {
      await exec('UPDATE invites SET used_by = ? WHERE code = ? AND used_by IS NULL', [created.id, invite]);
    }
    const user = publicUser(created);
    res.json({ user, token: issueToken(created) });
  }),
);

app.post(
  '/api/auth/login',
  wrap(async (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    const password = String(req.body?.password ?? '');
    const u = await one('SELECT * FROM users WHERE name = ?', [name]);
    if (!u || !(await checkPassword(u, password))) bad('Name or password is off.');
    if (u.banned) bad('Your account is suspended.');
    res.json({ user: publicUser(u), token: issueToken(u) });
  }),
);

// Public: lets the signup screen know whether it should create the owner account.
app.get(
  '/api/setup',
  wrap(async (req, res) => {
    const row = await one('SELECT COUNT(*) AS n FROM users');
    res.json({ firstRun: Number(row.n) === 0 });
  }),
);

// Everything below requires a valid session.
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/')) return next();
  requireAuth(req, res, next);
});

const me = (req) => req.user.id;

app.get('/api/me', (req, res) => res.json(req.user));

/* ---- users & profiles ---- */

app.get(
  '/api/users',
  wrap(async (req, res) => {
    const rows = await q(
      'SELECT id, name, avatar FROM users WHERE banned = false AND id <> ? ORDER BY lower(name)',
      [me(req)],
    );
    res.json(rows.map((u) => ({ id: u.id, name: u.name, avatar: u.avatar ?? null })));
  }),
);

app.get(
  '/api/users/:id',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const u = await one(
      `SELECT u.id, u.name, u.bio, u.avatar,
         (SELECT COUNT(*) FROM follows WHERE followee_id = u.id) AS followers,
         (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) AS following,
         (SELECT COUNT(*) FROM follows WHERE follower_id = ? AND followee_id = u.id) AS followed
       FROM users u WHERE u.id = ?`,
      [me(req), id],
    );
    if (!u) return res.status(404).json({ error: 'No such person.' });
    res.json({
      id: u.id,
      name: u.name,
      bio: u.bio ?? '',
      avatar: u.avatar ?? null,
      followers: Number(u.followers),
      following: Number(u.following),
      followed: Number(u.followed) > 0,
    });
  }),
);

app.post(
  '/api/users/:id/follow',
  wrap(async (req, res) => {
    const followerId = me(req);
    const followeeId = Number(req.params.id);
    if (followerId === followeeId) bad('You can’t follow yourself.');
    const target = await one('SELECT id FROM users WHERE id = ?', [followeeId]);
    if (!target) return res.status(404).json({ error: 'No such person.' });
    const { followed } = req.body ?? {};
    if (followed) {
      await exec('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?', [followerId, followeeId]);
      return res.json({ followed: false });
    }
    const inserted = await exec(
      'INSERT INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING',
      [followerId, followeeId, Date.now()],
    );
    if (inserted.rowCount) {
      await exec(
        'INSERT INTO notifications (user_id, actor_id, kind, post_id, read, created_at) VALUES (?, ?, ?, NULL, false, ?)',
        [followeeId, followerId, 'follow', Date.now()],
      );
    }
    res.json({ followed: true });
  }),
);

app.put(
  '/api/me/bio',
  wrap(async (req, res) => {
    const text = String(req.body?.bio ?? '').trim();
    if (text.length > 160) bad('Keep your bio under 160 characters.');
    await exec('UPDATE users SET bio = ? WHERE id = ?', [text, me(req)]);
    res.json({ ok: true });
  }),
);

app.put(
  '/api/me/avatar',
  wrap(async (req, res) => {
    const dataUrl = req.body?.dataUrl ?? null;
    if (dataUrl && dataUrl.length > 60 * 1024) bad('That picture is too large.');
    await exec('UPDATE users SET avatar = ? WHERE id = ?', [dataUrl, me(req)]);
    res.json({ ok: true });
  }),
);

/* ---- feed & posts ---- */

const PAGE_SIZE = 20;

app.get(
  '/api/feed',
  wrap(async (req, res) => {
    const viewer = me(req);
    const beforeId = req.query.before ? Number(req.query.before) : null;
    const authorId = req.query.author ? Number(req.query.author) : null;
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
      args.push(viewer, viewer);
    }
    args.push(PAGE_SIZE + 1);
    const posts = await q(
      `SELECT p.id, p.body, p.image, p.created_at, p.user_id, u.name AS author, u.avatar AS author_avatar
       FROM posts p JOIN users u ON u.id = p.user_id
       WHERE ${where.join(' AND ')}
       ORDER BY p.id DESC LIMIT ?`,
      args,
    );
    const hasMore = posts.length > PAGE_SIZE;
    const page = posts.slice(0, PAGE_SIZE);
    if (!page.length) return res.json({ posts: [], hasMore: false });

    const ids = page.map((p) => p.id);
    const marks = ids.map(() => '?').join(',');
    const authorIds = [...new Set(page.map((p) => p.user_id))];
    const authorMarks = authorIds.map(() => '?').join(',');

    const [reactRows, commentRows, followRows] = await Promise.all([
      q(
        `SELECT post_id, emoji, COUNT(*) AS n,
           MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS mine
         FROM reactions WHERE post_id IN (${marks}) GROUP BY post_id, emoji`,
        [viewer, ...ids],
      ),
      q(
        `SELECT c.id, c.post_id, c.body, c.created_at, c.user_id, u.name AS author
         FROM comments c JOIN users u ON u.id = c.user_id
         WHERE c.post_id IN (${marks}) ORDER BY c.id ASC`,
        ids,
      ),
      q(
        `SELECT followee_id FROM follows WHERE follower_id = ? AND followee_id IN (${authorMarks})`,
        [viewer, ...authorIds],
      ),
    ]);

    const followed = new Set(followRows.map((f) => Number(f.followee_id)));
    const reactions = {};
    for (const r of reactRows) {
      (reactions[r.post_id] ??= {})[r.emoji] = { count: Number(r.n), mine: !!Number(r.mine) };
    }
    const comments = {};
    for (const c of commentRows) (comments[c.post_id] ??= []).push(c);

    res.json({
      hasMore,
      posts: page.map((p) => ({
        ...p,
        reactions: reactions[p.id] ?? {},
        comments: comments[p.id] ?? [],
        followed: followed.has(Number(p.user_id)),
      })),
    });
  }),
);

app.post(
  '/api/posts',
  wrap(async (req, res) => {
    const text = String(req.body?.body ?? '').trim();
    const image = req.body?.image ?? null;
    if (!text && !image) bad('Write something first.');
    if (text.length > 280) bad('Keep it under 280 characters.');
    if (image && image.length > 200 * 1024) bad('That picture is too large.');
    await exec('INSERT INTO posts (user_id, body, image, created_at) VALUES (?, ?, ?, ?)', [
      me(req),
      text,
      image,
      Date.now(),
    ]);
    res.json({ ok: true });
  }),
);

// Only the author or the owner (admin) can delete a post.
app.delete(
  '/api/posts/:id',
  wrap(async (req, res) => {
    const post = await one('SELECT id, user_id FROM posts WHERE id = ?', [Number(req.params.id)]);
    if (!post) return res.status(404).json({ error: 'That post is gone.' });
    if (post.user_id !== me(req) && !req.user.isAdmin) {
      return res.status(403).json({ error: 'You can only delete your own posts.' });
    }
    await tx([
      { sql: 'DELETE FROM reactions WHERE post_id = ?', args: [post.id] },
      { sql: 'DELETE FROM comments WHERE post_id = ?', args: [post.id] },
      { sql: 'DELETE FROM posts WHERE id = ?', args: [post.id] },
    ]);
    res.json({ ok: true });
  }),
);

app.post(
  '/api/posts/:id/reactions',
  wrap(async (req, res) => {
    const postId = Number(req.params.id);
    const emoji = String(req.body?.emoji ?? '');
    const allowed = ['🔥', '😂', '❤️', '💯'];
    if (!allowed.includes(emoji)) bad('Unknown reaction.');
    const post = await one('SELECT id FROM posts WHERE id = ?', [postId]);
    if (!post) return res.status(404).json({ error: 'That post is gone.' });
    const deleted = await exec('DELETE FROM reactions WHERE post_id = ? AND user_id = ? AND emoji = ?', [
      postId,
      me(req),
      emoji,
    ]);
    if (!deleted.rowCount) {
      await exec(
        'INSERT INTO reactions (post_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING',
        [postId, me(req), emoji, Date.now()],
      );
    }
    res.json({ ok: true });
  }),
);

// Like is a single reaction type; the author is looked up on the server, not trusted from the client.
app.post(
  '/api/posts/:id/like',
  wrap(async (req, res) => {
    const postId = Number(req.params.id);
    const post = await one('SELECT id, user_id FROM posts WHERE id = ?', [postId]);
    if (!post) return res.status(404).json({ error: 'That post is gone.' });
    const userId = me(req);
    const notifiesAuthor = post.user_id !== userId;
    const removed = await exec(
      'DELETE FROM reactions WHERE post_id = ? AND user_id = ? AND emoji = ?',
      [postId, userId, 'like'],
    );
    if (!removed.rowCount) {
      const now = Date.now();
      const statements = [
        {
          sql: 'INSERT INTO reactions (post_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING',
          args: [postId, userId, 'like', now],
        },
      ];
      if (notifiesAuthor) {
        statements.push(
          {
            sql: 'DELETE FROM notifications WHERE kind = ? AND post_id = ? AND actor_id = ? AND user_id = ?',
            args: ['like', postId, userId, post.user_id],
          },
          {
            sql: 'INSERT INTO notifications (user_id, actor_id, kind, post_id, read, created_at) VALUES (?, ?, ?, ?, false, ?)',
            args: [post.user_id, userId, 'like', postId, now],
          },
        );
      }
      await tx(statements);
    } else if (notifiesAuthor) {
      await exec('DELETE FROM notifications WHERE kind = ? AND post_id = ? AND actor_id = ? AND user_id = ?', [
        'like',
        postId,
        userId,
        post.user_id,
      ]);
    }
    res.json({ ok: true });
  }),
);

/* ---- comments ---- */

app.post(
  '/api/posts/:id/comments',
  wrap(async (req, res) => {
    const postId = Number(req.params.id);
    const text = String(req.body?.body ?? '').trim();
    if (!text) bad('Say something first.');
    if (text.length > 280) bad('Keep it under 280 characters.');
    const post = await one('SELECT id, user_id FROM posts WHERE id = ?', [postId]);
    if (!post) return res.status(404).json({ error: 'That post is gone.' });
    const now = Date.now();
    const statements = [
      {
        sql: 'INSERT INTO comments (post_id, user_id, body, created_at) VALUES (?, ?, ?, ?)',
        args: [postId, me(req), text, now],
      },
    ];
    if (post.user_id !== me(req)) {
      statements.push({
        sql: 'INSERT INTO notifications (user_id, actor_id, kind, post_id, read, created_at) VALUES (?, ?, ?, ?, false, ?)',
        args: [post.user_id, me(req), 'comment', postId, now],
      });
    }
    await tx(statements);
    res.json({ ok: true });
  }),
);

// Commenter, the post author, or the owner can delete a comment.
app.delete(
  '/api/comments/:id',
  wrap(async (req, res) => {
    const c = await one(
      `SELECT c.id, c.user_id, p.user_id AS post_author FROM comments c
       JOIN posts p ON p.id = c.post_id WHERE c.id = ?`,
      [Number(req.params.id)],
    );
    if (!c) return res.status(404).json({ error: 'That comment is gone.' });
    if (c.user_id !== me(req) && c.post_author !== me(req) && !req.user.isAdmin) {
      return res.status(403).json({ error: 'You can only delete your own comments.' });
    }
    await exec('DELETE FROM comments WHERE id = ?', [c.id]);
    res.json({ ok: true });
  }),
);

/* ---- notifications ---- */

app.get(
  '/api/notifications',
  wrap(async (req, res) => {
    const rows = await q(
      `SELECT n.id, n.kind, n.post_id, n.read, n.created_at, n.actor_id, u.name AS actor
       FROM notifications n LEFT JOIN users u ON u.id = n.actor_id
       WHERE n.user_id = ? ORDER BY n.created_at DESC, n.id DESC LIMIT 100`,
      [me(req)],
    );
    res.json(rows);
  }),
);

app.get(
  '/api/notifications/unread-count',
  wrap(async (req, res) => {
    const row = await one('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = false', [me(req)]);
    res.json({ count: Number(row.n) });
  }),
);

app.post(
  '/api/notifications/read',
  wrap(async (req, res) => {
    await exec('UPDATE notifications SET read = true WHERE user_id = ? AND read = false', [me(req)]);
    res.json({ ok: true });
  }),
);

/* ---- wallet & gifts ---- */

const DAY = (d = new Date()) => d.toLocaleDateString('en-CA');

app.get(
  '/api/wallet',
  wrap(async (req, res) => {
    const u = await one('SELECT coins FROM users WHERE id = ?', [me(req)]);
    res.json({ coins: Number(u?.coins ?? 0) });
  }),
);

app.get(
  '/api/transactions',
  wrap(async (req, res) => {
    const rows = await q(
      'SELECT id, kind, amount, counterpart_id, post_id, gift_id, created_at FROM transactions WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100',
      [me(req)],
    );
    res.json(rows);
  }),
);

app.get(
  '/api/gifts',
  wrap(async (req, res) => {
    const rows = await q('SELECT id, name, tier, coin_cost, emoji FROM gifts ORDER BY coin_cost ASC, id ASC');
    res.json(rows);
  }),
);

// Price comes from the gifts table, never from the client.
app.post(
  '/api/gifts/send',
  wrap(async (req, res) => {
    const senderId = me(req);
    const recipientId = Number(req.body?.recipientId);
    const giftId = Number(req.body?.giftId);
    const postId = req.body?.postId ? Number(req.body.postId) : null;
    if (senderId === recipientId) bad('You can’t gift your own post.');
    const gift = await one('SELECT id, name, coin_cost FROM gifts WHERE id = ?', [giftId]);
    if (!gift) bad('That gift is gone.');
    const recipient = await one('SELECT id FROM users WHERE id = ? AND banned = false', [recipientId]);
    if (!recipient) bad('That person is gone.');
    const cost = Number(gift.coin_cost);
    const now = Date.now();
    const debit = await exec('UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?', [cost, senderId, cost]);
    if (!debit.rowCount) bad(`Not enough coins for ${gift.name}.`);
    try {
      await tx([
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
          sql: 'INSERT INTO notifications (user_id, actor_id, kind, post_id, read, created_at) VALUES (?, ?, ?, ?, false, ?)',
          args: [recipientId, senderId, 'gift', postId, now],
        },
      ]);
    } catch (e) {
      await exec('UPDATE users SET coins = coins + ? WHERE id = ?', [cost, senderId]);
      throw e;
    }
    res.json({ ok: true });
  }),
);

app.get(
  '/api/creator',
  wrap(async (req, res) => {
    const userId = me(req);
    const CREATOR_DAYS = 14;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (CREATOR_DAYS - 1));

    const earned = await one(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE user_id = ? AND kind = 'gift_received'",
      [userId],
    );
    const recent = await q(
      `SELECT gs.id, gs.created_at, g.name, g.emoji, u.name AS sender
       FROM gift_sends gs JOIN gifts g ON g.id = gs.gift_id JOIN users u ON u.id = gs.sender_id
       WHERE gs.recipient_id = ? ORDER BY gs.created_at DESC, gs.id DESC LIMIT 20`,
      [userId],
    );
    const daily = await q(
      "SELECT created_at, amount FROM transactions WHERE user_id = ? AND kind = 'gift_received' AND created_at >= ?",
      [userId, start.getTime()],
    );
    const followers = await one('SELECT COUNT(*) AS n FROM follows WHERE followee_id = ?', [userId]);
    const posts = await one('SELECT COUNT(*) AS n FROM posts WHERE user_id = ?', [userId]);
    const likes = await one(
      `SELECT COUNT(*) AS n FROM reactions r JOIN posts p ON p.id = r.post_id
       WHERE p.user_id = ? AND r.emoji = 'like'`,
      [userId],
    );

    const days = [];
    for (let i = 0; i < CREATOR_DAYS; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push({ key: DAY(d), date: d, coins: 0 });
    }
    const byKey = Object.fromEntries(days.map((d) => [d.key, d]));
    for (const t of daily) {
      const bucket = byKey[DAY(new Date(Number(t.created_at)))];
      if (bucket) bucket.coins += Number(t.amount);
    }

    res.json({
      totalEarned: Number(earned.total),
      recent: recent.map((r) => ({ ...r, created_at: Number(r.created_at) })),
      daily: days.map(({ date, coins }) => ({
        label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        coins,
      })),
      followers: Number(followers.n),
      posts: Number(posts.n),
      likes: Number(likes.n),
    });
  }),
);

/* ---- messaging ---- */

async function requireMember(conversationId, userId) {
  const row = await one('SELECT conversation_id FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [
    conversationId,
    userId,
  ]);
  return !!row;
}

app.get(
  '/api/conversations',
  wrap(async (req, res) => {
    const viewer = me(req);
    const rows = await q(
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
       ORDER BY COALESCE((SELECT MAX(created_at) FROM messages z WHERE z.conversation_id = c.id), c.created_at) DESC, c.id DESC`,
      [viewer, viewer, viewer],
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        title: r.title ?? 'Untitled',
        createdBy: r.created_by,
        muted: !!r.muted,
        unread: r.muted ? 0 : Number(r.unread),
        lastBody: r.last_body ?? '',
        lastAt: r.last_at == null ? null : Number(r.last_at),
      })),
    );
  }),
);

app.get(
  '/api/conversations/unread-count',
  wrap(async (req, res) => {
    const rows = await q(
      `SELECT COUNT(*) AS n FROM messages x
       JOIN conversation_members cm ON cm.conversation_id = x.conversation_id AND cm.user_id = ?
       WHERE cm.muted = false AND x.id > cm.last_read_id AND x.sender_id <> ?`,
      [me(req), me(req)],
    );
    res.json({ count: Number(rows[0].n) });
  }),
);

app.get(
  '/api/conversations/:id',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!(await requireMember(id, me(req)))) return res.status(404).json({ error: 'Not in this conversation.' });
    const c = await one('SELECT c.id, c.kind, c.title, c.created_by, cm.muted FROM conversations c JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ? WHERE c.id = ?', [
      me(req),
      id,
    ]);
    const members = await q(
      `SELECT u.id, u.name FROM conversation_members m JOIN users u ON u.id = m.user_id
       WHERE m.conversation_id = ? ORDER BY lower(u.name)`,
      [id],
    );
    const title =
      c.kind === 'dm'
        ? members.find((m) => Number(m.id) !== me(req))?.name ?? 'Direct message'
        : c.title ?? 'Untitled';
    res.json({
      id: c.id,
      kind: c.kind,
      title,
      createdBy: c.created_by,
      muted: !!c.muted,
      members: members.map((m) => m.name),
    });
  }),
);

app.get(
  '/api/conversations/:id/messages',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!(await requireMember(id, me(req)))) return res.status(404).json({ error: 'Not in this conversation.' });
    const rows = await q(
      `SELECT * FROM (
         SELECT m.id, m.body, m.image, m.created_at, m.sender_id, u.name AS sender, u.avatar AS sender_avatar
         FROM messages m LEFT JOIN users u ON u.id = m.sender_id
         WHERE m.conversation_id = ? ORDER BY m.id DESC LIMIT 100
       ) t ORDER BY id ASC`,
      [id],
    );
    res.json(
      rows.map((m) => ({
        id: m.id,
        body: m.body ?? '',
        image: m.image ?? null,
        createdAt: Number(m.created_at),
        senderId: m.sender_id,
        sender: m.sender ?? 'Someone',
        senderAvatar: m.sender_avatar ?? null,
      })),
    );
  }),
);

app.post(
  '/api/conversations/:id/read',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!(await requireMember(id, me(req)))) return res.status(404).json({ error: 'Not in this conversation.' });
    await exec(
      `UPDATE conversation_members
       SET last_read_id = (SELECT COALESCE(MAX(id), 0) FROM messages WHERE conversation_id = ?)
       WHERE conversation_id = ? AND user_id = ?`,
      [id, id, me(req)],
    );
    res.json({ ok: true });
  }),
);

app.put(
  '/api/conversations/:id/mute',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!(await requireMember(id, me(req)))) return res.status(404).json({ error: 'Not in this conversation.' });
    await exec('UPDATE conversation_members SET muted = ? WHERE conversation_id = ? AND user_id = ?', [
      !!req.body?.muted,
      id,
      me(req),
    ]);
    res.json({ ok: true });
  }),
);

app.post(
  '/api/conversations/:id/messages',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const text = String(req.body?.body ?? '').trim();
    const image = req.body?.image ?? null;
    if (!text && !image) bad('Write something first.');
    if (text.length > 1000) bad('Keep it under 1000 characters.');
    if (image && image.length > 200 * 1024) bad('That picture is too large.');
    const c = await one(
      `SELECT c.kind, c.created_by FROM conversations c
       JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
       WHERE c.id = ?`,
      [me(req), id],
    );
    if (!c) return res.status(404).json({ error: 'Not in this conversation.' });
    if (c.kind === 'channel' && c.created_by !== me(req)) bad('Only the creator can post in this channel.');
    await exec('INSERT INTO messages (conversation_id, sender_id, body, image, created_at) VALUES (?, ?, ?, ?, ?)', [
      id,
      me(req),
      text,
      image,
      Date.now(),
    ]);
    res.json({ ok: true });
  }),
);

app.post(
  '/api/conversations',
  wrap(async (req, res) => {
    const creatorId = me(req);
    const kind = String(req.body?.kind ?? '');
    const title = req.body?.title ? String(req.body.title).trim() : null;
    const memberIds = [...new Set((req.body?.memberIds ?? []).map(Number))].filter((x) => x && x !== creatorId);

    if (kind === 'dm') {
      if (memberIds.length !== 1) bad('Pick one person to message.');
      const existing = await one(
        `SELECT c.id FROM conversations c
         JOIN conversation_members a ON a.conversation_id = c.id AND a.user_id = ?
         JOIN conversation_members b ON b.conversation_id = c.id AND b.user_id = ?
         WHERE c.kind = 'dm' LIMIT 1`,
        [creatorId, memberIds[0]],
      );
      if (existing) return res.json({ id: existing.id });
    } else if (kind === 'group') {
      if (memberIds.length < 1) bad('Add at least one other person.');
      if (!title) bad('Give the group a name.');
    } else if (kind === 'channel') {
      if (!title) bad('Give the channel a name.');
    } else {
      bad('Unknown conversation type.');
    }

    const created = await one(
      'INSERT INTO conversations (kind, title, created_by, created_at) VALUES (?, ?, ?, ?) RETURNING id',
      [kind, title, creatorId, Date.now()],
    );
    await tx(
      [creatorId, ...memberIds].map((uid) => ({
        sql: 'INSERT INTO conversation_members (conversation_id, user_id, muted, last_read_id) VALUES (?, ?, false, 0)',
        args: [created.id, uid],
      })),
    );
    res.json({ id: created.id });
  }),
);

/* ---- admin (owner only) ---- */

app.get(
  '/api/admin/stats',
  requireAdmin,
  wrap(async (req, res) => {
    const u = await one('SELECT COUNT(*) AS n FROM users');
    const p = await one('SELECT COUNT(*) AS n FROM posts');
    const m = await one('SELECT COUNT(*) AS n FROM messages');
    const c = await one('SELECT COALESCE(SUM(coins), 0) AS total FROM users');
    res.json({ users: Number(u.n), posts: Number(p.n), messages: Number(m.n), coins: Number(c.total) });
  }),
);

app.get(
  '/api/admin/users',
  requireAdmin,
  wrap(async (req, res) => {
    const rows = await q(
      `SELECT u.id, u.name, u.created_at, u.coins, u.banned, u.is_admin,
         (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id) AS post_count
       FROM users u ORDER BY u.created_at DESC, u.id DESC LIMIT 200`,
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        created_at: Number(r.created_at),
        coins: Number(r.coins ?? 0),
        banned: !!r.banned,
        isAdmin: !!r.is_admin,
        postCount: Number(r.post_count),
      })),
    );
  }),
);

app.get(
  '/api/admin/posts',
  requireAdmin,
  wrap(async (req, res) => {
    const rows = await q(
      `SELECT p.id, p.body, p.created_at, u.name AS author
       FROM posts p JOIN users u ON u.id = p.user_id ORDER BY p.id DESC LIMIT 25`,
    );
    res.json(rows);
  }),
);

app.post(
  '/api/admin/users/:id/ban',
  requireAdmin,
  wrap(async (req, res) => {
    const userId = Number(req.params.id);
    if (userId === me(req)) bad('You can’t suspend your own account.');
    await exec('UPDATE users SET banned = ? WHERE id = ?', [!!req.body?.banned, userId]);
    res.json({ ok: true });
  }),
);

app.post(
  '/api/admin/users/:id/grant',
  requireAdmin,
  wrap(async (req, res) => {
    const userId = Number(req.params.id);
    const amount = Number(req.body?.amount);
    if (!Number.isInteger(amount) || amount < 1 || amount > 10000) bad('Enter a whole number from 1 to 10,000.');
    const updated = await exec('UPDATE users SET coins = COALESCE(coins, 0) + ? WHERE id = ?', [amount, userId]);
    if (!updated.rowCount) bad('That account no longer exists.');
    await exec('INSERT INTO transactions (user_id, kind, amount, counterpart_id, created_at) VALUES (?, ?, ?, ?, ?)', [
      userId,
      'admin_grant',
      amount,
      me(req),
      Date.now(),
    ]);
    res.json({ ok: true });
  }),
);

app.get(
  '/api/admin/invites',
  requireAdmin,
  wrap(async (req, res) => {
    const rows = await q(
      `SELECT i.code, i.created_at, i.used_by, u.name AS used_by_name
       FROM invites i LEFT JOIN users u ON u.id = i.used_by ORDER BY i.created_at DESC LIMIT 100`,
    );
    res.json(rows);
  }),
);

app.post(
  '/api/admin/invites',
  requireAdmin,
  wrap(async (req, res) => {
    const code = makeInviteCode();
    await exec('INSERT INTO invites (code, created_by, used_by, created_at) VALUES (?, ?, NULL, ?)', [
      code,
      me(req),
      Date.now(),
    ]);
    res.json({ code });
  }),
);

// Unknown API routes are rejected, not served the SPA.
app.use('/api', (req, res) => res.status(404).json({ error: 'No such route.' }));

/* ---------- static frontend ---------- */

const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

// Error handler: user-facing messages go back as-is, anything else is generic.
app.use((err, req, res, next) => {
  if (err instanceof UserError) return res.status(400).json({ error: err.message });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Bad request.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Try again.' });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`HeyChat API on :${PORT}`));
