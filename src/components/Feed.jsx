import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X, ImageSquare, FilmStrip, BookmarkSimple, Heart, ChatCircle, MagnifyingGlass, MusicNotes, Plus, ShareFat } from '@phosphor-icons/react';
import {
  api,
  createPost,
  fetchFeed,
  readUploadDataUrl,
  createStatus,
  fetchStatuses,
  fetchStatusViewers,
  recordView,
  recordStatusView,
  toggleSave,
  toggleStatusSave,
  toggleLike,
  addComment,
  followUser,
  unfollowUser,
} from '../lib/db';
import { timeAgo } from '../lib/time';
import Post from './Post';
import Avatar from './Avatar';
import ReelsViewer from './ReelsViewer';

const MAX = 280;
const spring = { type: 'spring', stiffness: 420, damping: 34 };

// Scales the picture down to fit within 1024px, then re-encodes as JPEG at
// decreasing quality until the data URL is under the storage cap.
const TABS = [
  { id: 'foryou', label: 'For you' },
  { id: 'following', label: 'Following' },
  { id: 'latest', label: 'Latest' },
];

const MAX_STATUS_PICS = 10;

function StatusComposer({ onClose, onPosted }) {
  const [body, setBody] = useState('');
  const [images, setImages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  async function pick(e) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    setError('');
    const room = MAX_STATUS_PICS - images.length;
    if (room <= 0) {
      setError(`Up to ${MAX_STATUS_PICS} pictures per status.`);
      return;
    }
    try {
      const added = await Promise.all(files.slice(0, room).map((f) => readUploadDataUrl(f, 'image')));
      setImages((list) => [...list, ...added]);
      if (files.length > room) setError(`Only ${MAX_STATUS_PICS} pictures fit in one status.`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (busy || (!body.trim() && images.length === 0)) return;
    setBusy(true);
    setError('');
    try {
      await createStatus(body.trim(), images);
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
      {images.length > 0 && (
        <ul className="grid grid-cols-3 gap-2" aria-label="Attached pictures">
          {images.map((src, i) => (
            <li key={i} className="relative">
              <img src={src} alt={`Picture ${i + 1}`} className="aspect-square w-full rounded-xl object-cover" />
              <button
                type="button"
                onClick={() => setImages((list) => list.filter((_, j) => j !== i))}
                aria-label={`Remove picture ${i + 1}`}
                className="focus-ring absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-black/70 text-white"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={images.length >= MAX_STATUS_PICS}
          className="focus-ring flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-ink-secondary hover:bg-ink/5 disabled:opacity-50"
        >
          <ImageSquare size={18} aria-hidden="true" /> {images.length > 0 ? `Pictures (${images.length})` : 'Pictures'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={pick} className="sr-only" tabIndex={-1} />
        <button
          type="submit"
          disabled={busy || (!body.trim() && images.length === 0)}
          className="focus-ring rounded-full bg-ink px-4 py-2 text-sm font-medium text-canvas disabled:opacity-50"
        >
          {busy ? 'Posting...' : 'Post status'}
        </button>
      </div>
    </form>
  );
}

// One status with swipeable pictures. Viewers of your own status open a list.
function StatusViewer({ status, viewer, onClose, onToggleSave }) {
  const [index, setIndex] = useState(0);
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState(null);
  const media = status.media?.length ? status.media : status.image ? [{ data: status.image, kind: 'image' }] : [];
  const views = status.views ?? 0;
  const isMine = !!status.mine;

  useEffect(() => {
    setIndex(0);
    setShowViewers(false);
    setViewers(null);
  }, [status.id]);

  async function openViewers() {
    setShowViewers(true);
    if (viewers === null) {
      try {
        const data = await fetchStatusViewers(status.id);
        setViewers(data.viewers);
      } catch {
        setViewers([]);
      }
    }
  }

  return (
    <div role="dialog" aria-label={`${status.name}'s status`} className="card mt-3 mb-[calc(4.5rem+env(safe-area-inset-bottom))] space-y-2 overflow-hidden p-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-ink">{status.name}</p>
        <button type="button" onClick={onClose} className="focus-ring rounded-full px-2 py-1 text-sm text-ink-muted hover:bg-ink/5">
          Close
        </button>
      </div>
      {status.body && <p className="whitespace-pre-wrap text-ink">{status.body}</p>}
      {media.length > 0 && (
        <div className="relative">
          <div
            className="flex snap-x snap-mandatory overflow-x-auto rounded-xl"
            onScroll={(e) => {
              const w = e.currentTarget.clientWidth || 1;
              setIndex(Math.round(e.currentTarget.scrollLeft / w));
            }}
            aria-label="Status pictures"
          >
            {media.map((m, i) => (
              <img
                key={i}
                src={m.data}
                alt={`Picture ${i + 1} of ${media.length}`}
                className="aspect-[4/5] w-full shrink-0 snap-center object-cover"
              />
            ))}
          </div>
          {media.length > 1 && (
            <p className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white tabular-nums">
              {index + 1}/{media.length}
            </p>
          )}
        </div>
      )}
      <div className="flex items-center justify-between text-xs text-ink-faint">
        <span>{timeAgo(status.createdAt)}</span>
        {isMine ? (
          <button
            type="button"
            onClick={openViewers}
            aria-expanded={showViewers}
            className="focus-ring inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-ink-secondary hover:bg-ink/5 tabular-nums"
          >
            <span aria-hidden="true">👁️</span> {views}
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 tabular-nums text-sm">
            <span aria-hidden="true">👁️</span> {views}
          </span>
        )}
      </div>
      {isMine && showViewers && (
        <div className="max-h-[50dvh] overflow-y-auto rounded-xl border border-hairline p-3 pb-3">
          <p className="mb-2 text-sm font-semibold text-ink">Viewed by {viewers ? viewers.length : '…'}</p>
          {viewers === null && <p className="text-sm text-ink-faint">Loading…</p>}
          {viewers && viewers.length === 0 && <p className="text-sm text-ink-muted">No one has viewed this yet.</p>}
          {viewers && viewers.length > 0 && (
            <ul className="space-y-2">
              {viewers.map((v) => (
                <li key={v.id} className="flex items-center gap-2.5">
                  <Avatar name={v.name} src={v.avatar} size="size-8" text="text-xs" />
                  <span className="flex-1 truncate text-sm text-ink">{v.name}</span>
                  <span className="text-xs text-ink-faint">{timeAgo(v.viewedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!isMine && (
        <button
          type="button"
          onClick={() => onToggleSave(status)}
          aria-pressed={!!status.saved}
          className={`focus-ring inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm transition-colors hover:bg-ink/5 ${
            status.saved ? 'text-primary-text' : 'text-ink-secondary'
          }`}
        >
          <BookmarkSimple size={18} weight={status.saved ? 'fill' : 'regular'} aria-hidden="true" />
          {status.saved ? 'Saved' : 'Save'}
        </button>
      )}
    </div>
  );
}

function StoriesRow({ viewer }) {
  const [people, setPeople] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [composing, setComposing] = useState(false);
  const [viewing, setViewing] = useState(null);

  // Opening a status counts one view for the viewer (the owner's own opens are not counted server-side).
  function openStatus(s) {
    setViewing(s);
    if (s && !s.mine) recordStatusView(s.id);
  }

  async function toggleStatusBookmark(s) {
    const next = !s.saved;
    setViewing((v) => (v && v.id === s.id ? { ...v, saved: next } : v));
    setStatuses((list) => list.map((x) => (x.id === s.id ? { ...x, saved: next } : x)));
    try {
      await toggleStatusSave(s.id, next);
    } catch {
      setViewing((v) => (v && v.id === s.id ? { ...v, saved: !next } : v));
    }
  }

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
              onClick={() => (mine ? openStatus(mine) : setComposing((v) => !v))}
              aria-expanded={composing}
              className="focus-ring flex w-16 flex-col items-center gap-1"
            >
              <span className={`rounded-full p-0.5 ${mine ? 'bg-primary' : 'bg-primary/15'}`}>
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
                <button type="button" onClick={() => openStatus(latestByUser.get(u.id))} className="focus-ring flex w-16 flex-col items-center gap-1">
                  <span className="rounded-full bg-primary p-0.5">
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
        <StatusViewer status={viewing} viewer={viewer} onClose={() => setViewing(null)} onToggleSave={toggleStatusBookmark} />
      )}
    </div>
  );
}

export const isVideoPost = (p) => !!p.video && /^data:video\/(mp4|webm);/.test(p.video);

export function ReelTile({ p, onOpen }) {
  const [views, setViews] = useState(Number(p.views ?? 0));
  const [saved, setSaved] = useState(!!p.saved);
  const counted = useRef(false);

  function onPlay() {
    if (counted.current) return;
    counted.current = true;
    setViews((v) => v + 1);
    recordView(p.id);
  }

  async function toggle() {
    const next = !saved;
    setSaved(next);
    try {
      await toggleSave(p.id, next);
    } catch {
      setSaved(!next);
    }
  }

  return (
    <div className="relative">
      <button type="button" onClick={onOpen} aria-label={`Open reel${p.body ? `: ${p.body.slice(0, 60)}` : ''}`} className="focus-ring absolute inset-0 z-0" />
      <video
        src={p.video}
        muted
        playsInline
        preload="metadata"
        onPlay={onPlay}
        aria-hidden="true"
        className="aspect-[3/4] w-full bg-black object-cover"
      />
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/50 px-2 py-1 text-xs text-white">
        <span className="inline-flex items-center gap-1 tabular-nums" aria-label={`${views} views`}>
          <span aria-hidden="true">👁️</span> {views}
        </span>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={saved}
          aria-label={saved ? 'Remove from saved' : 'Save reel'}
          className="focus-ring rounded-full p-0.5"
        >
          <BookmarkSimple size={16} weight={saved ? 'fill' : 'regular'} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// Reels tab: fullscreen viewer. Pages through the feed's reels and leaves the reels tab on exit.
function ReelsTab({ posts, viewer, loading, error, hasMore, loadingMore, onLoadMore, onRetry, onExit, onChanged, onCoinsChanged }) {
  const reels = useMemo(() => (posts ?? []).filter(isVideoPost), [posts]);
  return (
    <ReelsViewer
      viewer={viewer}
      reels={reels}
      loading={loading}
      error={error}
      hasMore={hasMore}
      loadingMore={loadingMore}
      onLoadMore={onLoadMore}
      onRetry={onRetry}
      onExit={onExit}
      onRemoved={onChanged}
      onCoinsChanged={onCoinsChanged}
    />
  );
}

export default function Feed({ viewer, onCoinsChanged }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  // Reels are a separate fullscreen page (bottom-nav /?tab=reels), not a home tab.
  const reelsPage = searchParams.get('tab') === 'reels';
  const [tab, setTab] = useState('foryou');
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
  const [videoMeta, setVideoMeta] = useState(null);
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
        setVideoMeta({ name: file.name, size: `${(file.size / (1024 * 1024)).toFixed(1)} MB` });
        setImage(null);
        return;
      }
      setImage(await readUploadDataUrl(file, 'image'));
      setVideo(null);
      setVideoMeta(null);
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
      setVideoMeta(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setPosting(false);
    }
  }

  if (reelsPage) {
    return (
      <ReelsTab
        posts={posts}
        viewer={viewer}
        loading={posts === null && !error}
        error={error}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={more}
        onRetry={load}
        onExit={() => navigate('/', { replace: true })}
        onChanged={load}
        onCoinsChanged={onCoinsChanged}
      />
    );
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
              <div className="mt-3 inline-flex max-w-full items-center gap-3 rounded-xl border border-hairline bg-canvas-soft p-2 pr-3">
                <video src={video} muted playsInline preload="metadata" className="h-14 w-10 shrink-0 rounded-md bg-black object-cover" aria-label="Selected video preview" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">Video ready</p>
                  <p className="truncate text-xs text-ink-faint">{videoMeta.name} · {videoMeta.size}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setVideo(null);
                    setVideoMeta(null);
                  }}
                  aria-label="Remove video"
                  className="focus-ring ml-1 grid size-7 place-items-center rounded-full text-ink-secondary hover:bg-ink/5"
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
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label="Attach a video (mp4 or webm, 30 MB max)"
              title="Attach a video (mp4 or webm, 30 MB max)"
              className="focus-ring grid size-9 place-items-center rounded-full text-ink-secondary hover:bg-ink/5"
            >
              <FilmStrip size={20} aria-hidden="true" />
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

      <motion.div layout className="mt-6 space-y-3">
        <AnimatePresence initial={false}>
          {visible?.map((p) => (
            <Post key={p.id} post={p} viewer={viewer} onChanged={load} onCoinsChanged={onCoinsChanged} />
          ))}
        </AnimatePresence>
      </motion.div>
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
