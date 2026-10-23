import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X, ImageSquare } from '@phosphor-icons/react';
import { api, createPost, fetchFeed, readUploadDataUrl, createStatus, fetchStatuses } from '../lib/db';
import { timeAgo } from '../lib/time';
import Post from './Post';
import Avatar from './Avatar';

const MAX = 280;
const spring = { type: 'spring', stiffness: 420, damping: 34 };

// Scales the picture down to fit within 1024px, then re-encodes as JPEG at
// decreasing quality until the data URL is under the storage cap.
const TABS = [
  { id: 'foryou', label: 'For you' },
  { id: 'following', label: 'Following' },
  { id: 'latest', label: 'Latest' },
  { id: 'reels', label: 'Reels' },
];

function StatusComposer({ onClose, onPosted }) {
  const [body, setBody] = useState('');
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      setImage(await readUploadDataUrl(file, 'image'));
    } catch (err) {
      setError(err.message);
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (busy || (!body.trim() && !image)) return;
    setBusy(true);
    setError('');
    try {
      await createStatus(body.trim(), image);
      onPosted();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mt-3 space-y-3 p-4" aria-label="Post a status">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-ink">New status</p>
        <button type="button" onClick={onClose} className="focus-ring rounded-full px-2 py-1 text-sm text-ink-muted hover:bg-ink/5">
          Cancel
        </button>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={280}
        rows={2}
        placeholder="What's happening? (disappears in 24h)"
        className="focus-ring w-full resize-none rounded-xl border border-hairline bg-canvas p-3 text-ink"
      />
      {image && (
        <div className="relative">
          <img src={image} alt="Status attachment" className="max-h-48 w-full rounded-xl object-cover" />
          <button
            type="button"
            onClick={() => setImage(null)}
            aria-label="Remove picture"
            className="focus-ring absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/70 text-white"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="focus-ring flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-ink-secondary hover:bg-ink/5"
        >
          <ImageSquare size={18} aria-hidden="true" /> Picture
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={pick} className="sr-only" tabIndex={-1} />
        <button
          type="submit"
          disabled={busy || (!body.trim() && !image)}
          className="focus-ring rounded-full bg-ink px-4 py-2 text-sm font-medium text-canvas disabled:opacity-50"
        >
          {busy ? 'Posting...' : 'Post status'}
        </button>
      </div>
    </form>
  );
}

function StoriesRow({ viewer }) {
  const [people, setPeople] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [composing, setComposing] = useState(false);
  const [viewing, setViewing] = useState(null);

  function loadStatuses() {
    fetchStatuses()
      .then(setStatuses)
      .catch(() => {});
  }

  useEffect(() => {
    api('GET', '/api/users')
      .then(setPeople)
      .catch(() => {});
    loadStatuses();
  }, []);

  const mine = statuses.find((s) => s.mine);
  const latestByUser = new Map();
  for (const s of statuses) if (!latestByUser.has(s.userId)) latestByUser.set(s.userId, s);

  return (
    <div>
      <div className="-mx-4 overflow-x-auto px-4 pb-1" aria-label="Crew">
        <ul className="flex gap-3">
          <li>
            <button
              type="button"
              onClick={() => (mine ? setViewing(mine) : setComposing((v) => !v))}
              aria-expanded={composing}
              className="focus-ring flex w-16 flex-col items-center gap-1"
            >
              <span className={`rounded-full p-0.5 ${mine ? 'bg-gradient-to-tr from-primary to-accent-sky' : 'bg-primary/15'}`}>
                <span className="block rounded-full bg-canvas p-0.5">
                  <Avatar name={viewer.name} src={viewer.avatar} size="size-14" text="text-lg" />
                </span>
              </span>
              <span className="w-full truncate text-center text-xs text-ink-muted">{mine ? 'Your status' : 'Add status'}</span>
            </button>
          </li>
          {people
            .filter((u) => latestByUser.has(u.id))
            .map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => setViewing(latestByUser.get(u.id))}
                  className="focus-ring flex w-16 flex-col items-center gap-1"
                >
                  <span className="rounded-full bg-gradient-to-tr from-primary to-accent-sky p-0.5">
                    <span className="block rounded-full bg-canvas p-0.5">
                      <Avatar name={u.name} src={u.avatar} size="size-12" text="text-base" />
                    </span>
                  </span>
                  <span className="w-full truncate text-center text-xs text-ink-secondary">{u.name}</span>
                </button>
              </li>
            ))}
          {people.map((u) =>
            latestByUser.has(u.id) ? null : (
              <li key={u.id}>
                <Link to={`/u/${u.id}`} className="focus-ring flex w-16 flex-col items-center gap-1">
                  <span className="rounded-full bg-ink/5 p-0.5">
                    <Avatar name={u.name} src={u.avatar} size="size-12" text="text-base" />
                  </span>
                  <span className="w-full truncate text-center text-xs text-ink-muted">{u.name}</span>
                </Link>
              </li>
            ),
          )}
        </ul>
      </div>

      <AnimatePresence initial={false}>
        {composing && (
          <motion.div key="status-composer" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={spring} className="overflow-hidden">
            <StatusComposer
              onClose={() => setComposing(false)}
              onPosted={() => {
                setComposing(false);
                loadStatuses();
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {viewing && (
        <div role="dialog" aria-label={`${viewing.name}'s status`} className="card mt-3 space-y-2 p-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-ink">{viewing.name}</p>
            <button type="button" onClick={() => setViewing(null)} className="focus-ring rounded-full px-2 py-1 text-sm text-ink-muted hover:bg-ink/5">
              Close
            </button>
          </div>
          {viewing.body && <p className="whitespace-pre-wrap text-ink">{viewing.body}</p>}
          {viewing.image && <img src={viewing.image} alt="" className="max-h-80 w-full rounded-xl object-cover" />}
          <p className="text-xs text-ink-faint">{timeAgo(viewing.createdAt)}</p>
        </div>
      )}
    </div>
  );
}

export const isVideoPost = (p) => !!p.video && /^data:video\/(mp4|webm);/.test(p.video);

function ReelsGrid({ posts }) {
  if (posts === null) return <p className="mt-6 text-sm text-ink-faint">Loading…</p>;
  const reels = (posts ?? []).filter(isVideoPost);
  if (reels.length === 0) {
    return <p className="mt-10 text-center text-ink-muted">No reels yet. Post a video and it shows up here.</p>;
  }
  return (
    <div className="mt-6 grid grid-cols-3 gap-1 overflow-hidden rounded-2xl">
      {reels.map((p) => (
        <video
          key={p.id}
          src={p.video}
          muted
          playsInline
          preload="metadata"
          aria-label={p.body ? p.body.slice(0, 80) : `Video by ${p.author}`}
          className="aspect-[3/4] w-full bg-black object-cover"
        />
      ))}
    </div>
  );
}

export default function Feed({ viewer, onCoinsChanged }) {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') === 'reels' ? 'reels' : 'foryou');
  const composerRef = useRef(null);
  const [posts, setPosts] = useState(null);

  useEffect(() => {
    const focusComposer = () => {
      composerRef.current?.querySelector('textarea')?.focus();
      composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    window.addEventListener('hc:compose', focusComposer);
    if (searchParams.get('compose')) focusComposer();
    return () => window.removeEventListener('hc:compose', focusComposer);
  }, [searchParams]);

  const visible = useMemo(() => {
    if (!posts) return posts;
    if (tab === 'following') return posts.filter((p) => p.followed || p.user_id === viewer.id);
    if (tab === 'latest') return [...posts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return posts;
  }, [posts, tab, viewer.id]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const fileRef = useRef(null);
  const reduce = useReducedMotion();
  const [image, setImage] = useState(null);
  const [video, setVideo] = useState(null);
  const remaining = MAX - draft.length;
  const canPost = (draft.trim() || image || video) && !posting;

  const load = useCallback(async () => {
    try {
      const page = await fetchFeed(viewer.id);
      setPosts(page.posts);
      setHasMore(page.hasMore);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [viewer.id]);

  useEffect(() => {
    load();
  }, [load, viewer.id]);

  async function more() {
    if (!posts?.length) return;
    setLoadingMore(true);
    try {
      const page = await fetchFeed(viewer.id, posts[posts.length - 1].id);
      setPosts((p) => [...p, ...page.posts]);
      setHasMore(page.hasMore);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingMore(false);
    }
  }

  async function pickImage(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      if (file.type.startsWith('video/')) {
        setVideo(await readUploadDataUrl(file, 'video'));
        setImage(null);
        return;
      }
      setImage(await readUploadDataUrl(file, 'image'));
      setVideo(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setPosting(true);
    try {
      await createPost(viewer.id, draft, image, video);
      setDraft('');
      setImage(null);
      setVideo(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-4 sm:pt-8">
      <StoriesRow viewer={viewer} />

      <div role="tablist" aria-label="Feed" className="mt-4 flex gap-1 overflow-x-auto border-b border-hairline">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`focus-ring -mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === t.id ? 'border-primary text-ink' : 'border-transparent text-ink-faint hover:text-ink-secondary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form ref={composerRef} onSubmit={submit} className="card mt-3 p-4">
        <label htmlFor="composer" className="sr-only">What’s happening?</label>
        <textarea
          id="composer"
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX))}
          rows={3}
          placeholder="What’s happening?"
          className="focus-ring w-full resize-none bg-transparent text-[17px] leading-relaxed text-ink placeholder:text-ink-faint outline-none"
        />
        <AnimatePresence initial={false}>
          {image && (
            <motion.div
              key="preview"
              initial={reduce ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={spring}
              className="overflow-hidden"
            >
              <div className="relative mt-3">
                <img src={image} alt="Selected attachment" className="max-h-64 w-full rounded-xl object-cover" />
                <button
                  type="button"
                  onClick={() => setImage(null)}
                  aria-label="Remove picture"
                  className="focus-ring absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/70 text-white"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            </motion.div>
          )}
          {video && (
            <motion.div
              initial={reduce ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="relative mt-3">
                <video src={video} muted playsInline controls className="max-h-64 w-full rounded-xl bg-black" />
                <button
                  type="button"
                  onClick={() => setVideo(null)}
                  aria-label="Remove video"
                  className="focus-ring absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/70 text-white"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label="Attach a picture"
              className="focus-ring grid size-9 place-items-center rounded-full text-ink-secondary hover:bg-ink/5"
            >
              <ImageSquare size={20} aria-hidden="true" />
            </button>
            <input ref={fileRef} type="file" accept="image/*,video/mp4,video/webm" onChange={pickImage} className="sr-only" tabIndex={-1} />
            <motion.span
              animate={{ color: remaining <= 20 ? '#dd5b00' : 'rgb(var(--c-ink-faint))' }}
              transition={{ duration: 0.2 }}
              className="tabular-nums text-sm"
              aria-live="polite"
            >
              {remaining}
            </motion.span>
          </div>
          <button
            disabled={!canPost}
            className="focus-ring rounded-full bg-primary px-5 py-2 text-sm font-medium text-white transition active:scale-95 disabled:opacity-40"
          >
            {posting ? 'Posting…' : 'Post'}
          </button>
        </div>
      </form>

      {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}

      {posts === null && (
        <div className="mt-6 space-y-3" aria-label="Loading posts">
          {[0, 1].map((i) => (
            <div key={i} className="card h-28 animate-pulse bg-ink/[0.03]" />
          ))}
        </div>
      )}

      {posts?.length === 0 && (
        <motion.div initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="mt-14 text-center">
          <p className="text-2xl font-bold text-ink">No posts yet.</p>
          <p className="mt-1 text-ink-muted">Say something, or follow someone to see their posts here.</p>
        </motion.div>
      )}

      {tab === 'reels' ? (
        <ReelsGrid posts={visible} />
      ) : (
        <motion.div layout className="mt-6 space-y-3">
          <AnimatePresence initial={false}>
            {visible?.map((p) => (
              <Post key={p.id} post={p} viewer={viewer} onChanged={load} onCoinsChanged={onCoinsChanged} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
      {tab === 'following' && posts && visible.length === 0 && (
        <p className="mt-10 text-center text-ink-muted">Follow someone to see their posts here.</p>
      )}

      {hasMore && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={more}
            disabled={loadingMore}
            className="focus-ring rounded-full border border-hairline bg-canvas px-5 py-2 text-sm font-medium text-ink-secondary disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Load older posts'}
          </button>
        </div>
      )}
    </div>
  );
}
