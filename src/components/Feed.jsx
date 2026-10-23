import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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

// Fullscreen vertical reels viewer, TikTok layout: tabs and search overlaid on the video,
// right action rail, creator + caption + audio pill bottom-left. Swipe up/down between reels.
const REEL_TABS = [
  { id: 'following', label: 'Following' },
  { id: 'foryou', label: 'For you' },
  { id: 'latest', label: 'Latest' },
  { id: 'reels', label: 'Reels' },
];
const HASHTAG_RE = /(#[\p{L}\p{N}_]+)/gu;
const isHashtag = (part) => /^#[\p{L}\p{N}_]+$/u.test(part);

function Caption({ body }) {
  const [open, setOpen] = useState(false);
  const long = body.length > 90;
  const parts = body.split(HASHTAG_RE);
  return (
    <p className="mt-2 text-[15px] leading-snug text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]">
      <span className={open || !long ? '' : 'line-clamp-2'}>
        {parts.map((part, i) => (isHashtag(part) ? <span key={i} className="font-semibold">{part}</span> : <span key={i}>{part}</span>))}
      </span>
      {long && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="focus-ring ml-1 font-semibold text-white/90">
          {open ? 'less' : '...more'}
        </button>
      )}
    </p>
  );
}

function RailButton({ label, onClick, pressed, children, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={label}
      className="focus-ring flex flex-col items-center gap-1 text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]"
    >
      {children}
      {count !== undefined && <span className="text-xs font-semibold tabular-nums">{count}</span>}
    </button>
  );
}

function ReelsViewer({ reels, startId, viewer, onTab, onClose, onChanged }) {
  const [activeId, setActiveId] = useState(startId);
  const [commenting, setCommenting] = useState(null);
  const scroller = useRef(null);
  const videos = useRef(new Map());
  const counted = useRef(new Set());

  useEffect(() => {
    const el = scroller.current?.querySelector(`[data-reel-id="${startId}"]`);
    el?.scrollIntoView({ block: 'start' });
    // Only the first render should scroll to the starting reel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const root = scroller.current;
    if (!root) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = Number(entry.target.getAttribute('data-reel-id'));
          const v = videos.current.get(id);
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            setActiveId(id);
            v?.play().catch(() => {});
            if (!counted.current.has(id)) {
              counted.current.add(id);
              recordView(id);
            }
          } else {
            v?.pause();
          }
        }
      },
      { root, threshold: [0, 0.6] },
    );
    root.querySelectorAll('[data-reel-id]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [reels]);

  // Keyboard: arrow up/down moves between reels, Escape leaves the viewer.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const idx = reels.findIndex((r) => r.id === activeId);
        const next = reels[e.key === 'ArrowDown' ? idx + 1 : idx - 1];
        if (next) scroller.current?.querySelector(`[data-reel-id="${next.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeId, reels, onClose]);

  async function run(fn) {
    try {
      await fn();
      onChanged();
    } catch {
      /* the next refresh shows the true state */
    }
  }

  async function share(p) {
    const url = `${window.location.origin}/u/${p.user_id}`;
    try {
      if (navigator.share) await navigator.share({ title: `${p.author} on HeyChat`, url });
      else await navigator.clipboard.writeText(url);
    } catch {
      /* user dismissed the share sheet */
    }
  }

  function selectTab(id) {
    if (id === 'reels') return;
    if (onTab) onTab(id);
    else onClose?.();
  }

  const commentsFor = reels.find((r) => r.id === commenting);

  return (
    <div role="dialog" aria-modal="true" aria-label="Reels" className="fixed inset-0 z-50 bg-black">
      {/* Overlaid top bar: tabs centred with underline on the active one, search top-right */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-center px-14 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <div role="tablist" aria-label="Feed" className="pointer-events-auto flex gap-4 text-[15px] font-semibold">
          {REEL_TABS.map((t) => {
            const active = t.id === 'reels';
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => selectTab(t.id)}
                className={`focus-ring relative whitespace-nowrap py-1 [text-shadow:0_1px_3px_rgba(0,0,0,0.6)] ${active ? 'text-white' : 'text-white/70'}`}
              >
                {t.label}
                {active && <span className="absolute inset-x-0 -bottom-1 h-0.5 rounded-full bg-white" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <Link to="/discover" aria-label="Search" className="focus-ring pointer-events-auto absolute right-3 top-[max(env(safe-area-inset-top),0.75rem)] grid size-10 place-items-center rounded-full text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          <MagnifyingGlass size={24} aria-hidden="true" />
        </Link>
      </header>

      <div ref={scroller} className="h-full snap-y snap-mandatory overflow-y-scroll overscroll-contain" aria-label="Reels feed">
        {reels.map((p) => {
          const active = p.id === activeId;
          const liked = !!p.reactions?.like?.mine;
          const followable = p.user_id !== viewer.id;
          return (
            <section key={p.id} data-reel-id={p.id} className="relative h-[100dvh] w-full snap-start snap-always bg-black">
              <video
                ref={(el) => {
                  if (el) videos.current.set(p.id, el);
                  else videos.current.delete(p.id);
                }}
                src={p.video}
                loop
                muted={false}
                playsInline
                preload="metadata"
                className="absolute inset-0 size-full bg-black object-cover"
                aria-label={p.body ? p.body.slice(0, 80) : `Reel by ${p.author}`}
              />

              {/* Bottom-left: creator, caption, audio pill */}
              <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] left-3 right-20 z-10">
                <Link to={`/u/${p.user_id}`} className="focus-ring inline-block rounded-md [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]">
                  <span className="text-[17px] font-bold text-white">@{String(p.author || '').replace(/\s+/g, '').toLowerCase()}</span>
                </Link>
                {p.body && <Caption body={p.body} />}
                <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-[13px] text-white">
                  <MusicNotes size={14} weight="bold" aria-hidden="true" />
                  <span className="truncate">Original sound · {p.author}</span>
                </div>
              </div>

              {/* Right action rail */}
              <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] right-2 z-10 flex flex-col items-center gap-5">
                <div className="relative mb-1">
                  <Link to={`/u/${p.user_id}`} aria-label={`${p.author}'s profile`} className="focus-ring block rounded-full border-2 border-white">
                    <Avatar name={p.author} src={p.author_avatar} size="size-12" text="text-base" />
                  </Link>
                  {followable && !p.followed && (
                    <button
                      type="button"
                      onClick={() => run(() => followUser(viewer.id, p.user_id, p.id))}
                      aria-label={`Follow ${p.author}`}
                      className="focus-ring absolute -bottom-2 left-1/2 grid size-5 -translate-x-1/2 place-items-center rounded-full bg-[#ff64c8] text-white"
                    >
                      <Plus size={12} weight="bold" aria-hidden="true" />
                    </button>
                  )}
                </div>
                <RailButton
                  label={`Like, ${p.reactions?.like?.count ?? 0} so far`}
                  pressed={liked}
                  count={p.reactions?.like?.count ?? 0}
                  onClick={() => run(() => toggleLike(p.id, viewer.id, p.user_id))}
                >
                  <Heart size={34} weight={liked ? 'fill' : 'regular'} className={liked ? 'text-[#ff3b5c]' : ''} aria-hidden="true" />
                </RailButton>
                <RailButton label={`Comments, ${p.comments?.length ?? 0} so far`} count={p.comments?.length ?? 0} onClick={() => setCommenting(p.id)}>
                  <ChatCircle size={34} aria-hidden="true" />
                </RailButton>
                <RailButton
                  label={p.saved ? 'Remove from saved' : 'Save reel'}
                  pressed={!!p.saved}
                  count={p.saves ?? 0}
                  onClick={() => run(() => toggleSave(p.id, !p.saved))}
                >
                  <BookmarkSimple size={34} weight={p.saved ? 'fill' : 'regular'} aria-hidden="true" />
                </RailButton>
                <RailButton label="Share" onClick={() => share(p)}>
                  <ShareFat size={34} aria-hidden="true" />
                </RailButton>
                {/* Spinning sound disc: spins while this reel is on screen */}
                <div
                  aria-hidden="true"
                  className="mt-1 grid size-11 animate-spin place-items-center rounded-full border-[10px] border-zinc-900 bg-zinc-800"
                  style={{ animationDuration: '4s', animationPlayState: active ? 'running' : 'paused' }}
                >
                  <span className="size-2 rounded-full bg-white/80" />
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {commenting && (
        <div role="dialog" aria-label="Comments" className="absolute inset-x-0 bottom-0 z-30 max-h-[70dvh] overflow-y-auto rounded-t-2xl bg-canvas p-4 text-ink">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-semibold">Comments</p>
            <button type="button" onClick={() => setCommenting(null)} className="focus-ring rounded-full px-2 py-1 text-sm text-ink-muted hover:bg-ink/5">Close</button>
          </div>
          <ul className="space-y-2">
            {(commentsFor?.comments ?? []).map((c) => (
              <li key={c.id} className="text-sm"><span className="font-semibold">{c.author}</span> {c.body}</li>
            ))}
          </ul>
          <CommentBox postId={commenting} viewer={viewer} onPosted={onChanged} />
        </div>
      )}
    </div>
  );
}

function CommentBox({ postId, viewer, onPosted }) {
  const [draft, setDraft] = useState('');
  async function send(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    try {
      await addComment(postId, viewer.id, draft.trim());
      setDraft('');
      onPosted();
    } catch {
      /* the user can retry */
    }
  }
  return (
    <form onSubmit={send} className="mt-3 flex gap-2">
      <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a comment" maxLength={280} className="focus-ring flex-1 rounded-full border border-hairline bg-canvas px-3 py-2 text-sm text-ink" />
      <button type="submit" disabled={!draft.trim()} className="focus-ring rounded-full bg-ink px-4 py-2 text-sm font-medium text-canvas disabled:opacity-50">Post</button>
    </form>
  );
}

// Reels tab: the fullscreen vertical viewer, not a grid. Closing it returns to For you.
function ReelsTab({ posts, viewer, onChanged, onTab }) {
  if (posts === null) return <p className="mt-6 text-sm text-ink-faint">Loading…</p>;
  const reels = (posts ?? []).filter(isVideoPost);
  if (reels.length === 0) {
    return <p className="mt-10 text-center text-ink-muted">No reels yet. Post a video and it shows up here.</p>;
  }
  return <ReelsViewer reels={reels} startId={reels[0].id} viewer={viewer} onTab={onTab} onChanged={onChanged} />;
}

function ReelsGrid({ posts, viewer, onChanged }) {
  const [openId, setOpenId] = useState(null);
  if (posts === null) return <p className="mt-6 text-sm text-ink-faint">Loading…</p>;
  const reels = (posts ?? []).filter(isVideoPost);
  if (reels.length === 0) {
    return <p className="mt-10 text-center text-ink-muted">No reels yet. Post a video and it shows up here.</p>;
  }
  return (
    <>
      <div className="mt-6 grid grid-cols-3 gap-1 overflow-hidden rounded-2xl">
        {reels.map((p) => (
          <ReelTile key={p.id} p={p} onOpen={() => setOpenId(p.id)} />
        ))}
      </div>
      {openId !== null && (
        <ReelsViewer reels={reels} startId={openId} viewer={viewer} onClose={() => setOpenId(null)} onChanged={onChanged} />
      )}
    </>
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

      {tab === 'reels' ? (
        <ReelsTab posts={visible} viewer={viewer} onChanged={load} onTab={setTab} />
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
