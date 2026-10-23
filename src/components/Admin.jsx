import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { fetchAdminStats, fetchAdminUsers, fetchRecentPosts, setUserBanned, grantCoins, deletePost, MAX_GRANT } from '../lib/db';
import { timeAgo } from '../lib/time';
import Avatar from './Avatar';

const spring = { type: 'spring', stiffness: 420, damping: 34 };
const fmt = (n) => Number(n).toLocaleString('en-US');
const joined = (ms) => new Date(Number(ms)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function Stat({ label, value }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tracking-tight text-ink tabular-nums">{value}</p>
    </div>
  );
}

function GrantForm({ user, onDone, onError }) {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await grantCoins(null, user.id, Number(amount));
      onDone(`Granted ${fmt(amount)} coins to ${user.name}.`);
    } catch (err) {
      setError(err.message);
      onError?.(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 flex items-start gap-2">
      <label className="min-w-0 flex-1">
        <span className="sr-only">Coins to grant to {user.name}</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_GRANT}
          step={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Coins"
          required
          aria-invalid={!!error}
          className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:shadow-focus"
        />
        {error && (
          <span role="alert" className="mt-1 block text-xs text-danger">
            {error}
          </span>
        )}
      </label>
      <button
        type="submit"
        disabled={busy}
        className="focus-ring shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? 'Granting…' : 'Grant'}
      </button>
    </form>
  );
}

export default function Admin() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState(null);
  const [usersMore, setUsersMore] = useState(false);
  const [posts, setPosts] = useState(null);
  const [postsMore, setPostsMore] = useState(false);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [grantingId, setGrantingId] = useState(null);
  const [pending, setPending] = useState(null);
  const reduce = useReducedMotion();
  const reqSeq = useRef(0);

  // Debounced search: the user list is filtered on the server.
  useEffect(() => {
    const t = setTimeout(() => setSearch(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  async function loadStats() {
    try {
      setStats(await fetchAdminStats());
    } catch (e) {
      setLoadError(e.message);
    }
  }

  async function loadUsers(term, offset = 0) {
    const seq = ++reqSeq.current;
    try {
      const data = await fetchAdminUsers({ q: term, offset });
      if (seq !== reqSeq.current) return;
      setUsers((prev) => (offset && prev ? [...prev, ...data.users] : data.users));
      setUsersMore(data.hasMore);
    } catch (e) {
      setLoadError(e.message);
    }
  }

  async function loadPosts(before = null) {
    try {
      const data = await fetchRecentPosts({ before });
      setPosts((prev) => (before && prev ? [...prev, ...data.posts] : data.posts));
      setPostsMore(data.hasMore);
    } catch (e) {
      setLoadError(e.message);
    }
  }

  useEffect(() => {
    setLoadError('');
    loadStats();
    loadPosts();
  }, []);

  useEffect(() => {
    loadUsers(search, 0);
  }, [search]);

  async function run(key, fn, success) {
    setActionError('');
    setNotice('');
    setPending(key);
    try {
      await fn();
      if (success) setNotice(success);
      await Promise.all([loadStats(), loadUsers(search, 0), loadPosts()]);
    } catch (e) {
      setActionError(e.message);
    } finally {
      setPending(null);
    }
  }

  function toggleBan(u) {
    const next = !u.banned;
    if (next && !window.confirm(`Suspend ${u.name}? They lose access immediately.`)) return;
    run(`ban-${u.id}`, () => setUserBanned(null, u.id, next), next ? `${u.name} is suspended.` : `${u.name} can log in again.`);
  }

  function removePost(p) {
    if (!window.confirm('Delete this post for everyone?')) return;
    run(`post-${p.id}`, () => deletePost(p.id), 'Post deleted.');
  }

  const loading = stats === null && users === null && !loadError;

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-4 sm:pt-8">
      <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Admin</h1>

      {loadError && (
        <div role="alert" className="card mt-6 flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-danger">{loadError}</p>
          <button
            onClick={() => {
              setLoadError('');
              loadStats();
              loadUsers(search, 0);
              loadPosts();
            }}
            className="focus-ring rounded-full px-3 py-1.5 text-sm text-primary hover:bg-primary/10"
          >
            Try again
          </button>
        </div>
      )}

      {loading && (
        <div className="mt-6 grid grid-cols-2 gap-3" aria-label="Loading admin stats">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card h-20 animate-pulse bg-ink/[0.03]" />
          ))}
        </div>
      )}

      {stats && (
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Stat label="Total users" value={fmt(stats.users)} />
          <Stat label="Total posts" value={fmt(stats.posts)} />
          <Stat label="Total messages" value={fmt(stats.messages)} />
          <Stat label="Coins in circulation" value={fmt(stats.coins)} />
        </div>
      )}

      <AnimatePresence initial={false}>
        {actionError && (
          <motion.p
            key="action-error"
            role="alert"
            initial={reduce ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {actionError}
          </motion.p>
        )}
        {notice && (
          <motion.p
            key={notice}
            role="status"
            initial={reduce ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={spring}
            className="mt-4 rounded-lg bg-success/15 px-3 py-2 text-sm text-success"
          >
            {notice}
          </motion.p>
        )}
      </AnimatePresence>

      <div className="mt-8 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink-muted">Users</h2>
        <label className="w-44">
          <span className="sr-only">Search users by name</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name"
            className="w-full rounded-full border border-hairline bg-canvas px-3 py-1.5 text-sm text-ink outline-none focus:border-primary focus:shadow-focus"
          />
        </label>
      </div>
      {users?.length === 0 && <p className="mt-3 text-ink-faint">{search ? `No one matches “${search}”.` : 'No accounts yet.'}</p>}
      {users?.length > 0 && (
        <ul className="mt-3 space-y-3">
          {users.map((u) => {
            const granting = grantingId === u.id;
            return (
              <li key={u.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                  <Avatar name={u.name} src={u.avatar} size="size-10" text="text-sm" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                      <span className="truncate">{u.name}</span>
                      {u.isAdmin && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Admin</span>}
                      {u.banned && <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">Suspended</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-faint">
                      Joined {joined(u.created_at)} · {fmt(u.postCount)} {u.postCount === 1 ? 'post' : 'posts'} · {fmt(u.coins)} coins
                    </p>
                  </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => setGrantingId(granting ? null : u.id)}
                      aria-expanded={granting}
                      className="focus-ring rounded-full px-3 py-1.5 text-sm text-primary hover:bg-primary/10"
                    >
                      Grant coins
                    </button>
                    {!u.isAdmin && (
                      <button
                        onClick={() => toggleBan(u)}
                        disabled={pending === `ban-${u.id}`}
                        className={`focus-ring rounded-full px-3 py-1.5 text-sm transition active:scale-[0.97] disabled:opacity-60 ${
                          u.banned ? 'bg-ink text-canvas' : 'text-danger hover:bg-danger/10'
                        }`}
                      >
                        {u.banned ? 'Unban' : 'Ban'}
                      </button>
                    )}
                  </div>
                </div>
                <AnimatePresence initial={false}>
                  {granting && (
                    <motion.div
                      key="grant"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={reduce ? { duration: 0 } : spring}
                      className="overflow-hidden"
                    >
                      <GrantForm
                        user={u}
                        onError={setActionError}
                        onDone={(msg) => {
                          setGrantingId(null);
                          setActionError('');
                          setNotice(msg);
                          loadStats();
                          loadUsers(search, 0);
                        }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      )}
      {usersMore && (
        <button
          onClick={() => loadUsers(search, users.length)}
          className="focus-ring mt-4 w-full rounded-full border border-hairline bg-canvas py-2 text-sm font-medium text-ink-secondary hover:bg-ink/5"
        >
          Load more users
        </button>
      )}

      <h2 className="mt-8 text-sm font-semibold text-ink-muted">Recent posts</h2>
      {posts?.length === 0 && <p className="mt-3 text-ink-faint">No posts yet.</p>}
      {posts?.length > 0 && (
        <ul className="mt-3 space-y-3">
          {posts.map((p) => (
            <li key={p.id} className="card flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-sm text-ink-secondary">
                  <span className="font-semibold text-ink">{p.author}</span> · {timeAgo(p.created_at)}
                </p>
                <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-ink">{p.body || 'Picture post'}</p>
              </div>
              <button
                onClick={() => removePost(p)}
                disabled={pending === `post-${p.id}`}
                className="focus-ring shrink-0 rounded-full px-3 py-1.5 text-sm text-danger transition hover:bg-danger/10 disabled:opacity-60"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      {postsMore && (
        <button
          onClick={() => loadPosts(posts[posts.length - 1].id)}
          className="focus-ring mt-4 w-full rounded-full border border-hairline bg-canvas py-2 text-sm font-medium text-ink-secondary hover:bg-ink/5"
        >
          Load older posts
        </button>
      )}
    </div>
  );
}
