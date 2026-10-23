import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  MagnifyingGlass,
  Heart,
  ChatCircle,
  BookmarkSimple,
  ShareFat,
  Gift,
  MusicNotes,
  SpeakerSlash,
  Play,
  Trash,
  WarningCircle,
  ArrowClockwise,
  FilmStrip,
  X,
} from '@phosphor-icons/react';
import { addComment, deletePost, followUser, unfollowUser, recordView, toggleLike, toggleSave } from '../lib/db';
import Avatar from './Avatar';
import GiftSheet from './GiftSheet';

// Fullscreen vertical reels viewer. Only the active reel plays. Reels within MOUNT_RADIUS of the
// active one hold a <video> element (the rest are black placeholders), so memory and network stay bounded.

const TABS = [
  { id: 'following', label: 'Following' },
  { id: 'foryou', label: 'For you' },
];
const MOUNT_RADIUS = 2;
const LOAD_AHEAD = 3;
const DOUBLE_TAP_MS = 280;
const HASHTAG_RE = /(#[\p{L}\p{N}_]+)/gu;
const isHashtag = (part) => /^#[\p{L}\p{N}_]+$/u.test(part);
const TEXT_SHADOW = '[text-shadow:0_1px_3px_rgba(0,0,0,0.7)]';

function Caption({ body }) {
  const [open, setOpen] = useState(false);
  const long = body.length > 90;
  const parts = body.split(HASHTAG_RE);
  return (
    <p className={`mt-2 text-[15px] leading-snug text-white ${TEXT_SHADOW}`}>
      <span className={open || !long ? '' : 'line-clamp-2'}>
        {parts.map((part, i) =>
          isHashtag(part) ? (
            <span key={i} className="font-semibold">
              {part}
            </span>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </span>
      {long && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="focus-ring ml-1 font-semibold text-white/90">
          {open ? 'less' : '...more'}
        </button>
      )}
    </p>
  );
}

function RailButton({ label, onClick, pressed, count, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={label}
      className={`focus-ring flex flex-col items-center gap-1 text-white ${TEXT_SHADOW}`}
    >
      {children}
      {count !== undefined && <span className="text-xs font-semibold tabular-nums">{count}</span>}
    </button>
  );
}

function HeartBurst({ x, y }) {
  return (
    <motion.span
      aria-hidden="true"
      initial={{ opacity: 1, scale: 0.4 }}
      animate={{ opacity: 0, scale: 1.35 }}
      transition={{ duration: 0.7, ease: 'easeOut' }}
      className="pointer-events-none absolute z-[6] -translate-x-1/2 -translate-y-1/2 text-[#ff3b5c]"
      style={{ left: x, top: y }}
    >
      <Heart size={96} weight="fill" />
    </motion.span>
  );
}

const ReelSlide = memo(function ReelSlide({ reel, isActive, mount, muted, register, actions, viewerId, viewerIsAdmin }) {
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [attempt, setAttempt] = useState(0);
  const [paused, setPaused] = useState(false);
  const [burst, setBurst] = useState(null);
  const videoRef = useRef(null);
  const lastTap = useRef(0);
  const tapTimer = useRef(0);

  // Leaving the window drops the element, so reset what it reported.
  useEffect(() => {
    if (!mount) {
      setStatus('loading');
      setPaused(false);
    }
  }, [mount]);

  useEffect(() => {
    if (!burst) return undefined;
    const t = setTimeout(() => setBurst(null), 700);
    return () => clearTimeout(t);
  }, [burst]);

  useEffect(() => () => clearTimeout(tapTimer.current), []);

  const setVideoRef = useCallback(
    (el) => {
      videoRef.current = el;
      register(reel.id, el);
    },
    [reel.id, register],
  );

  // Single tap toggles play. Double tap likes (never unlikes) and shows a heart where you tapped.
  function onSurface(e) {
    if (!isActive) return;
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      clearTimeout(tapTimer.current);
      lastTap.current = 0;
      if (!reel.reactions?.like?.mine) actions.like(reel);
      const rect = e.currentTarget.getBoundingClientRect();
      setBurst({ key: now, x: e.clientX - rect.left, y: e.clientY - rect.top });
      return;
    }
    lastTap.current = now;
    clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => {
      lastTap.current = 0;
      const v = videoRef.current;
      if (!v) return;
      if (v.paused) v.play().catch(() => {});
      else v.pause();
    }, DOUBLE_TAP_MS);
  }

  function retry() {
    setStatus('loading');
    setAttempt((a) => a + 1);
  }

  const liked = !!reel.reactions?.like?.mine;
  const likes = Number(reel.reactions?.like?.count ?? 0);
  const comments = reel.comments?.length ?? 0;
  const own = reel.user_id === viewerId;
  const canDelete = own || viewerIsAdmin;
  const handle = String(reel.author || '').replace(/\s+/g, '').toLowerCase();
  const isMuted = !!muted;
  const showPauseIcon = isActive && paused && status === 'ready';

  return (
    <section aria-label={`Reel by ${reel.author}`} className="relative h-full w-full snap-start snap-always bg-black">
      <div className="relative mx-auto h-full w-full max-w-[calc(100dvh*9/16)] overflow-hidden bg-black">
        {mount && (
          <video
            key={attempt}
            ref={setVideoRef}
            src={reel.video}
            loop
            playsInline
            preload={isActive ? 'auto' : 'metadata'}
            onPlaying={() => setStatus('ready')}
            onCanPlay={() => setStatus('ready')}
            onWaiting={() => setStatus((s) => (s === 'error' ? s : 'loading'))}
            onStalled={() => setStatus((s) => (s === 'error' ? s : 'loading'))}
            onError={() => setStatus('error')}
            onPlay={() => setPaused(false)}
            onPause={() => setPaused(true)}
            aria-label={reel.body ? reel.body.slice(0, 80) : `Reel by ${reel.author}`}
            className="absolute inset-0 size-full bg-black object-cover"
            style={{ objectPosition: '50% 40%' }}
          />
        )}

        {/* Tap target over the video. Sits under the controls, which stop the tap from reaching it. */}
        <button
          type="button"
          onClick={onSurface}
          aria-label={isActive ? 'Tap to play or pause' : undefined}
          tabIndex={-1}
          className="absolute inset-0 z-[1] cursor-pointer bg-transparent"
        />

        {/* Subtle readability gradients only */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-72 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />

        {status === 'loading' && mount && status !== 'error' && (
          <div role="status" aria-label="Loading reel" className="pointer-events-none absolute inset-0 z-[4] grid place-items-center">
            <span className="size-9 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 z-[5] grid place-items-center bg-black/80 px-6 text-center">
            <div>
              <WarningCircle size={36} aria-hidden="true" className="mx-auto text-white/80" />
              <p className="mt-3 font-semibold">This reel couldn’t load.</p>
              <button type="button" onClick={retry} className="focus-ring mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black">
                <ArrowClockwise size={16} aria-hidden="true" /> Try again
              </button>
            </div>
          </div>
        )}

        <span
          aria-hidden="true"
          className={`pointer-events-none absolute left-1/2 top-1/2 z-[4] grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white transition-opacity ${showPauseIcon ? 'opacity-100' : 'opacity-0'}`}
        >
          <Play size={28} weight="fill" />
        </span>

        {burst && <HeartBurst key={burst.key} x={burst.x} y={burst.y} />}

        {/* Bottom-left: creator, follow, caption, sound */}
        <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] left-3 right-20 z-10">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link to={`/u/${reel.user_id}`} className={`focus-ring min-w-0 truncate rounded-md text-[17px] font-bold text-white ${TEXT_SHADOW}`}>
              @{handle}
            </Link>
            {!own && (
              <button
                type="button"
                onClick={() => actions.follow(reel)}
                aria-pressed={!!reel.followed}
                aria-label={reel.followed ? `Unfollow ${reel.author}` : `Follow ${reel.author}`}
                className={`focus-ring shrink-0 rounded-md border px-2.5 py-0.5 text-[13px] font-semibold text-white ${
                  reel.followed ? 'border-white/70' : 'border-[#ff64c8] bg-[#ff64c8]'
                }`}
              >
                {reel.followed ? 'Following' : 'Follow'}
              </button>
            )}
          </div>
          {reel.body && <Caption body={reel.body} />}
          <button
            type="button"
            onClick={actions.toggleMute}
            aria-label={isMuted ? 'Unmute sound' : 'Mute sound'}
            className="focus-ring mt-3 inline-flex max-w-full items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-[13px] text-white"
          >
            {isMuted ? <SpeakerSlash size={14} weight="bold" aria-hidden="true" /> : <MusicNotes size={14} weight="bold" aria-hidden="true" />}
            <span className="truncate">Original sound · {reel.author}</span>
          </button>
        </div>

        {/* Right action rail: real counts from the backend */}
        <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] right-2 z-10 flex flex-col items-center gap-5">
          <Link to={`/u/${reel.user_id}`} aria-label={`${reel.author}'s profile`} className="focus-ring block rounded-full border-2 border-white">
            <Avatar name={reel.author} src={reel.author_avatar} size="size-12" text="text-base" />
          </Link>
          <RailButton label={`Like, ${likes} so far`} pressed={liked} count={likes} onClick={() => actions.like(reel)}>
            <Heart size={32} weight={liked ? 'fill' : 'regular'} className={liked ? 'text-[#ff3b5c]' : ''} aria-hidden="true" />
          </RailButton>
          <RailButton label={`Comments, ${comments} so far`} count={comments} onClick={() => actions.openComments(reel)}>
            <ChatCircle size={32} aria-hidden="true" />
          </RailButton>
          <RailButton label={reel.saved ? 'Remove from saved' : 'Save reel'} pressed={!!reel.saved} count={Number(reel.saves ?? 0)} onClick={() => actions.save(reel)}>
            <BookmarkSimple size={32} weight={reel.saved ? 'fill' : 'regular'} aria-hidden="true" />
          </RailButton>
          <RailButton label="Share" onClick={() => actions.share(reel)}>
            <ShareFat size={32} aria-hidden="true" />
          </RailButton>
          {!own && (
            <RailButton label={`Send a gift to ${reel.author}`} onClick={() => actions.gift(reel)}>
              <Gift size={32} aria-hidden="true" />
            </RailButton>
          )}
          {canDelete && (
            <RailButton label="Delete reel" onClick={() => actions.remove(reel)}>
              <Trash size={28} aria-hidden="true" />
            </RailButton>
          )}
          <div
            aria-hidden="true"
            className="mt-1 grid size-11 animate-spin place-items-center rounded-full border-[10px] border-zinc-900 bg-zinc-800"
            style={{ animationDuration: '4s', animationPlayState: isActive ? 'running' : 'paused' }}
          >
            <span className="size-2 rounded-full bg-white/80" />
          </div>
        </div>
      </div>
    </section>
  );
});

function CommentBox({ onSubmit }) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  async function send(e) {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    const ok = await onSubmit(draft);
    setSending(false);
    if (ok) setDraft('');
  }
  return (
    <form onSubmit={send} className="mt-3 flex gap-2">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Add a comment"
        maxLength={280}
        aria-label="Add a comment"
        className="focus-ring flex-1 rounded-full border border-hairline bg-canvas px-3 py-2 text-sm text-ink"
      />
      <button type="submit" disabled={!draft.trim() || sending} className="focus-ring rounded-full bg-ink px-4 py-2 text-sm font-medium text-canvas disabled:opacity-50">
        Post
      </button>
    </form>
  );
}

export default function ReelsViewer({ viewer, reels, loading, error, hasMore, loadingMore, onLoadMore, onRetry, onExit, onRemoved, onCoinsChanged }) {
  const [feedTab, setFeedTab] = useState('foryou');
  const [overrides, setOverrides] = useState({});
  const [activeIdx, setActiveIdx] = useState(0);
  const [muted, setMuted] = useState(false);
  const [commentFor, setCommentFor] = useState(null);
  const [giftFor, setGiftFor] = useState(null);
  const [floats, setFloats] = useState([]);
  const [toast, setToast] = useState('');
  const scroller = useRef(null);
  const videos = useRef(new Map());
  const counted = useRef(new Set());
  const pending = useRef(new Set());
  const raf = useRef(0);
  const flashTimer = useRef(0);
  const reelsRef = useRef(reels);

  useEffect(() => {
    reelsRef.current = reels;
  }, [reels]);

  // Engagement changes live in overrides, so the feed is never refetched or re-rendered per tap.
  const merged = useMemo(() => reels.map((r) => (overrides[r.id] ? { ...r, ...overrides[r.id] } : r)), [reels, overrides]);
  const list = useMemo(
    () => (feedTab === 'following' ? merged.filter((r) => r.followed || r.user_id === viewer.id) : merged),
    [merged, feedTab, viewer.id],
  );
  const safeIdx = Math.min(activeIdx, Math.max(0, list.length - 1));
  const activeId = list[safeIdx]?.id ?? null;
  const commentReel = commentFor == null ? null : merged.find((r) => r.id === commentFor) ?? null;
  const giftReel = giftFor == null ? null : merged.find((r) => r.id === giftFor) ?? null;

  const register = useCallback((id, el) => {
    if (el) videos.current.set(id, el);
    else videos.current.delete(id);
  }, []);

  const flash = useCallback((msg) => {
    setToast(msg);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setToast(''), 1800);
  }, []);

  useEffect(() => () => clearTimeout(flashTimer.current), []);

  // Changing feed resets to the first reel.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
    setActiveIdx(0);
  }, [feedTab]);

  // Track the reel on screen from scroll position (one rAF-throttled handler, no per-slide observers).
  const onScroll = useCallback(() => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const el = scroller.current;
      if (!el || !el.clientHeight) return;
      const idx = Math.round(el.scrollTop / el.clientHeight);
      setActiveIdx((prev) => (prev === idx ? prev : idx));
    });
  }, []);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const goTo = useCallback((i) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: i * el.clientHeight, behavior: 'smooth' });
  }, []);

  // Only the active reel plays. Everything else is paused, and the page hiding pauses everything.
  useEffect(() => {
    const playActive = () => {
      videos.current.forEach((v, id) => {
        if (id === activeId && !document.hidden) {
          v.muted = muted;
          const p = v.play();
          if (p && typeof p.catch === 'function') {
            p.catch((err) => {
              // Autoplay with sound was blocked: fall back to muted playback.
              if (err?.name === 'NotAllowedError' && !v.muted) {
                v.muted = true;
                setMuted(true);
              }
            });
          }
        } else {
          v.pause();
        }
      });
    };
    playActive();
    const onVis = () => {
      if (document.hidden) videos.current.forEach((v) => v.pause());
      else playActive();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [activeId, muted]);

  // Pause and release everything when the viewer leaves the screen.
  useEffect(() => {
    const map = videos.current;
    return () => {
      map.forEach((v) => v.pause());
      map.clear();
    };
  }, []);

  // Views count once per reel, the first time it becomes active.
  useEffect(() => {
    if (activeId == null || counted.current.has(activeId)) return;
    counted.current.add(activeId);
    recordView(activeId);
  }, [activeId]);

  // Page in more posts before the viewer runs out. Stops on error so a failing request does not loop.
  useEffect(() => {
    if (!hasMore || loadingMore || error) return;
    if (list.length === 0 || list.length - safeIdx <= LOAD_AHEAD) onLoadMore?.();
  }, [list.length, safeIdx, hasMore, loadingMore, error, onLoadMore]);

  useEffect(() => {
    function onKey(e) {
      if (commentFor != null || giftFor != null) {
        if (e.key === 'Escape') {
          setCommentFor(null);
          setGiftFor(null);
        }
        return;
      }
      if (e.key === 'Escape') return onExit?.();
      if (e.key === 'ArrowDown') goTo(Math.min(list.length - 1, safeIdx + 1));
      if (e.key === 'ArrowUp') goTo(Math.max(0, safeIdx - 1));
      if (e.key === ' ' && !(e.target instanceof HTMLElement && e.target.closest('input,textarea,button,a'))) {
        e.preventDefault();
        const v = activeId != null ? videos.current.get(activeId) : null;
        if (v) (v.paused ? v.play() : v.pause())?.catch?.(() => {});
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [commentFor, giftFor, list.length, safeIdx, activeId, goTo, onExit]);

  // ---- engagement: optimistic local state, rolled back if the backend rejects it ----
  const patch = useCallback((id, changes) => setOverrides((o) => ({ ...o, [id]: { ...o[id], ...changes } })), []);

  const claim = (key) => {
    if (pending.current.has(key)) return false;
    pending.current.add(key);
    return true;
  };
  const release = (key) => pending.current.delete(key);

  const like = useCallback(
    (reel) => {
      const key = `like:${reel.id}`;
      if (!claim(key)) return;
      const mine = !!reel.reactions?.like?.mine;
      const count = Number(reel.reactions?.like?.count ?? 0);
      const prev = reel.reactions;
      patch(reel.id, { reactions: { ...prev, like: { mine: !mine, count: Math.max(0, count + (mine ? -1 : 1)) } } });
      toggleLike(reel.id)
        .catch(() => {
          patch(reel.id, { reactions: prev });
          flash('Couldn’t update that like.');
        })
        .finally(() => release(key));
    },
    [patch, flash],
  );

  const save = useCallback(
    (reel) => {
      const key = `save:${reel.id}`;
      if (!claim(key)) return;
      const next = !reel.saved;
      const count = Number(reel.saves ?? 0);
      patch(reel.id, { saved: next, saves: Math.max(0, count + (next ? 1 : -1)) });
      toggleSave(reel.id, next)
        .catch(() => {
          patch(reel.id, { saved: !next, saves: count });
          flash('Couldn’t save that reel.');
        })
        .finally(() => release(key));
    },
    [patch, flash],
  );

  const follow = useCallback(
    (reel) => {
      const key = `follow:${reel.user_id}`;
      if (!claim(key)) return;
      const next = !reel.followed;
      // Follow state is per creator, so every reel by them updates together.
      const apply = (val) =>
        setOverrides((o) => {
          const n = { ...o };
          for (const r of reelsRef.current) {
            if (r.user_id === reel.user_id) n[r.id] = { ...n[r.id], followed: val };
          }
          return n;
        });
      apply(next);
      const req = next ? followUser(viewer.id, reel.user_id) : unfollowUser(viewer.id, reel.user_id);
      req
        .catch(() => {
          apply(!next);
          flash(next ? 'Couldn’t follow them.' : 'Couldn’t unfollow them.');
        })
        .finally(() => release(key));
    },
    [viewer.id, flash],
  );

  const setComments = useCallback(
    (id, base, fn) => setOverrides((o) => ({ ...o, [id]: { ...o[id], comments: fn(o[id]?.comments ?? base) } })),
    [],
  );

  const postComment = useCallback(
    async (reel, text) => {
      const body = text.trim();
      if (!body) return false;
      const base = reel.comments ?? [];
      const temp = { id: `tmp-${Date.now()}`, author: viewer.name, body, pending: true };
      setComments(reel.id, base, (list) => [...list, temp]);
      try {
        await addComment(reel.id, viewer.id, body);
        setComments(reel.id, base, (list) => list.map((c) => (c.id === temp.id ? { ...c, pending: false } : c)));
        return true;
      } catch (e) {
        setComments(reel.id, base, (list) => list.filter((c) => c.id !== temp.id));
        flash(e.message || 'Couldn’t post that comment.');
        return false;
      }
    },
    [viewer.id, viewer.name, setComments, flash],
  );

  const share = useCallback(
    async (reel) => {
      // Same link format as the feed's share button.
      const url = `${window.location.origin}/?post=${reel.id}`;
      try {
        if (navigator.share) {
          await navigator.share({ title: `${reel.author} on HeyChat`, url });
          return;
        }
        await navigator.clipboard.writeText(url);
        flash('Link copied');
      } catch (e) {
        if (e?.name !== 'AbortError') flash('Couldn’t share that reel.');
      }
    },
    [flash],
  );

  const remove = useCallback(
    async (reel) => {
      if (!window.confirm('Delete this reel for everyone?')) return;
      try {
        await deletePost(reel.id);
        onRemoved?.();
      } catch (e) {
        flash(e.message || 'Couldn’t delete that reel.');
      }
    },
    [onRemoved, flash],
  );

  const onGiftSent = useCallback(
    ({ emoji, tier }) => {
      setGiftFor(null);
      const id = Date.now() + Math.random();
      setFloats((f) => [...f, { id, emoji, big: tier === 'luxury' }]);
      setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1400);
      onCoinsChanged?.();
      flash('Gift sent');
    },
    [onCoinsChanged, flash],
  );

  const actions = useMemo(
    () => ({
      like,
      save,
      follow,
      share,
      remove,
      gift: (reel) => setGiftFor(reel.id),
      openComments: (reel) => setCommentFor(reel.id),
      toggleMute: () => setMuted((m) => !m),
    }),
    [like, save, follow, share, remove],
  );

  const viewerIsAdmin = !!viewer.isAdmin;
  const realReels = reels.length > 0;
  const followingEmpty = feedTab === 'following' && list.length === 0 && realReels;

  return (
    <div role="region" aria-label="Reels" className="fixed inset-0 z-50 overflow-hidden bg-black text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-[3] h-28 bg-gradient-to-b from-black/50 to-transparent" />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center gap-2 px-2 pb-2 pt-[max(env(safe-area-inset-top),0.5rem)]">
        <button
          type="button"
          onClick={() => onExit?.()}
          aria-label="Back to feed"
          className={`focus-ring pointer-events-auto grid size-10 shrink-0 place-items-center rounded-full text-white ${TEXT_SHADOW}`}
        >
          <ArrowLeft size={24} aria-hidden="true" />
        </button>
        <div role="tablist" aria-label="Reel feeds" className="pointer-events-auto flex flex-1 justify-center gap-5 text-[15px] font-semibold">
          {TABS.map((t) => {
            const on = feedTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setFeedTab(t.id)}
                className={`focus-ring relative whitespace-nowrap py-1 ${TEXT_SHADOW} ${on ? 'text-white' : 'text-white/70'}`}
              >
                {t.label}
                {on && <span className="absolute inset-x-0 -bottom-1 h-0.5 rounded-full bg-white" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <Link
          to="/discover"
          aria-label="Search"
          className={`focus-ring pointer-events-auto grid size-10 shrink-0 place-items-center rounded-full text-white ${TEXT_SHADOW}`}
        >
          <MagnifyingGlass size={24} aria-hidden="true" />
        </Link>
      </header>

      {toast && (
        <p role="status" className="pointer-events-none absolute left-1/2 top-[calc(max(env(safe-area-inset-top),0.5rem)+3.5rem)] z-40 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-sm text-white">
          {toast}
        </p>
      )}

      {loadingMore && list.length > 0 && (
        <p role="status" className="pointer-events-none absolute left-1/2 top-[calc(max(env(safe-area-inset-top),0.5rem)+3.5rem)] z-30 -translate-x-1/2 text-xs text-white/80">
          Loading more…
        </p>
      )}

      {list.length > 0 && (
        <div
          ref={scroller}
          onScroll={onScroll}
          aria-label="Reels feed"
          className="absolute inset-0 snap-y snap-mandatory overflow-y-scroll overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {list.map((r, i) => (
            <ReelSlide
              key={r.id}
              reel={r}
              isActive={i === safeIdx}
              mount={Math.abs(i - safeIdx) <= MOUNT_RADIUS}
              muted={i === safeIdx ? muted : undefined}
              register={register}
              actions={actions}
              viewerId={viewer.id}
              viewerIsAdmin={viewerIsAdmin}
            />
          ))}
        </div>
      )}

      {/* Empty, loading and error states */}
      {list.length === 0 && (
        <div className="absolute inset-0 z-20 grid place-items-center px-6 text-center">
          {loading ? (
            <span role="status" aria-label="Loading reels" className="size-9 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : error && !realReels ? (
            <div>
              <WarningCircle size={40} aria-hidden="true" className="mx-auto text-white/80" />
              <p className="mt-3 font-semibold">Couldn’t load reels.</p>
              <p className="mt-1 text-sm text-white/70">{error}</p>
              <button type="button" onClick={() => onRetry?.()} className="focus-ring mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black">
                <ArrowClockwise size={16} aria-hidden="true" /> Try again
              </button>
            </div>
          ) : hasMore ? (
            <span role="status" aria-label="Finding reels" className="size-9 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : followingEmpty ? (
            <div>
              <p className="font-semibold">Follow creators to see their reels here.</p>
              <button type="button" onClick={() => setFeedTab('foryou')} className="focus-ring mt-4 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black">
                Show For you
              </button>
            </div>
          ) : (
            <div>
              <FilmStrip size={40} aria-hidden="true" className="mx-auto text-white/70" />
              <p className="mt-3 font-semibold">No reels yet.</p>
              <p className="mt-1 text-sm text-white/70">Post a video and it shows up here.</p>
              <button type="button" onClick={() => onExit?.()} className="focus-ring mt-4 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black">
                Back to feed
              </button>
            </div>
          )}
        </div>
      )}

      {error && realReels && (
        <div className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-30 flex justify-center">
          <button type="button" onClick={() => onLoadMore?.()} className="focus-ring rounded-full bg-black/70 px-4 py-2 text-sm text-white">
            Couldn’t load more reels. Tap to retry.
          </button>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-1/2 z-[40] flex flex-col items-center">
        <AnimatePresence>
          {floats.map((f) => (
            <motion.span
              key={f.id}
              aria-hidden="true"
              initial={{ opacity: 1, y: 0, scale: 0.6 }}
              animate={{ opacity: 0, y: -160, scale: f.big ? 2.2 : 1.5 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2 }}
              className="absolute text-6xl"
            >
              {f.emoji}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>

      {commentReel && (
        <div role="dialog" aria-label="Comments" className="absolute inset-x-0 bottom-0 z-50 mx-auto max-h-[70dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-canvas p-4 pb-[max(env(safe-area-inset-bottom),1rem)] text-ink">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-semibold">
              Comments · <span className="tabular-nums">{commentReel.comments?.length ?? 0}</span>
            </p>
            <button type="button" onClick={() => setCommentFor(null)} aria-label="Close comments" className="focus-ring grid size-8 place-items-center rounded-full text-ink-muted hover:bg-ink/5">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          {commentReel.comments?.length ? (
            <ul className="space-y-2">
              {commentReel.comments.map((c) => (
                <li key={c.id} className={`text-sm ${c.pending ? 'opacity-60' : ''}`}>
                  <span className="font-semibold">{c.author}</span> {c.body}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">No comments yet. Start the conversation.</p>
          )}
          <CommentBox onSubmit={(text) => postComment(commentReel, text)} />
        </div>
      )}

      {giftReel && <GiftSheet post={giftReel} viewer={viewer} onClose={() => setGiftFor(null)} onSent={onGiftSent} />}
    </div>
  );
}
