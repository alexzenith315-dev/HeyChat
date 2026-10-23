import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X, ImageSquare } from '@phosphor-icons/react';
import { api, createPost, fetchFeed, fetchWallet, claimDailyBonus, MAX_POST_IMAGE_BYTES } from '../lib/db';
import Post from './Post';
import Avatar from './Avatar';

const MAX = 280;
const spring = { type: 'spring', stiffness: 420, damping: 34 };

// Scales the picture down to fit within 1024px, then re-encodes as JPEG at
// decreasing quality until the data URL is under the storage cap.
function toPostImageDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Pick an image file.'));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const q of [0.85, 0.75, 0.65, 0.55, 0.45, 0.35]) {
        const out = canvas.toDataURL('image/jpeg', q);
        if (out.length <= MAX_POST_IMAGE_BYTES) return resolve(out);
      }
      reject(new Error('That picture is too detailed. Try a simpler one.'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That picture could not be read.'));
    };
    img.src = url;
  });
}

const TABS = [
  { id: 'foryou', label: 'For you' },
  { id: 'following', label: 'Following' },
  { id: 'latest', label: 'Latest' },
  { id: 'reels', label: 'Reels' },
];

function StoriesRow({ viewer }) {
  const [people, setPeople] = useState([]);
  useEffect(() => {
    api('GET', '/api/users')
      .then(setPeople)
      .catch(() => {});
  }, []);
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-1" aria-label="Crew">
      <ul className="flex gap-3">
        <li>
          <Link to={`/u/${viewer.id}`} className="focus-ring flex w-16 flex-col items-center gap-1">
            <span className="rounded-full bg-primary/15 p-0.5">
              <Avatar name={viewer.name} size="size-14" text="text-lg" />
            </span>
            <span className="w-full truncate text-center text-xs text-ink-muted">You</span>
          </Link>
        </li>
        {people.map((u) => (
          <li key={u.id}>
            <Link to={`/u/${u.id}`} className="focus-ring flex w-16 flex-col items-center gap-1">
              <span className="rounded-full bg-gradient-to-tr from-primary to-accent-sky p-0.5">
                <span className="block rounded-full bg-canvas p-0.5">
                  <Avatar name={u.name} src={u.avatar} size="size-12" text="text-base" />
                </span>
              </span>
              <span className="w-full truncate text-center text-xs text-ink-secondary">{u.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReelsGrid({ posts }) {
  const withImages = (posts ?? []).filter((p) => p.image);
  if (posts === null) return <p className="mt-6 text-sm text-ink-faint">Loading…</p>;
  if (withImages.length === 0) {
    return <p className="mt-10 text-center text-ink-muted">No pictures yet. Post one and it shows up here.</p>;
  }
  return (
    <div className="mt-6 grid grid-cols-3 gap-1 overflow-hidden rounded-2xl">
      {withImages.map((p) => (
        <img key={p.id} src={p.image} alt={p.body ? p.body.slice(0, 80) : `Picture by ${p.author}`} loading="lazy" className="aspect-[3/4] w-full object-cover" />
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
  const [bonusClaimed, setBonusClaimed] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [image, setImage] = useState(null);
  const [posting, setPosting] = useState(false);
  const fileRef = useRef(null);
  const reduce = useReducedMotion();
  const remaining = MAX - draft.length;
  const canPost = (draft.trim() || image) && !posting;

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
    fetchWallet(viewer.id)
      .then((w) => setBonusClaimed(w.lastDailyBonus === w.today))
      .catch(() => setBonusClaimed(false));
  }, [load, viewer.id]);

  async function claimBonus() {
    setClaiming(true);
    setError('');
    try {
      const granted = await claimDailyBonus(viewer.id);
      setBonusClaimed(true);
      if (granted) onCoinsChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setClaiming(false);
    }
  }

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
      setImage(await toPostImageDataUrl(file));
    } catch (err) {
      setError(err.message);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setPosting(true);
    try {
      await createPost(viewer.id, draft, image);
      setDraft('');
      setImage(null);
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

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={claimBonus}
          disabled={bonusClaimed !== false || claiming}
          className="focus-ring rounded-full border border-hairline bg-white px-4 py-1.5 text-sm font-medium text-ink-secondary transition active:scale-95 disabled:opacity-50"
        >
          {bonusClaimed ? 'Bonus claimed today' : claiming ? 'Claiming…' : 'Daily bonus, +50 coins'}
        </button>
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
                  className="focus-ring absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-ink/70 text-white"
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
              className="focus-ring grid size-9 place-items-center rounded-full text-ink-secondary hover:bg-black/5"
            >
              <ImageSquare size={20} aria-hidden="true" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={pickImage} className="sr-only" tabIndex={-1} />
            <motion.span
              animate={{ color: remaining <= 20 ? '#dd5b00' : '#a39e98' }}
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

      {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}

      {posts === null && (
        <div className="mt-6 space-y-3" aria-label="Loading posts">
          {[0, 1].map((i) => (
            <div key={i} className="card h-28 animate-pulse bg-black/[0.03]" />
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
            className="focus-ring rounded-full border border-hairline bg-white px-5 py-2 text-sm font-medium text-ink-secondary disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Load older posts'}
          </button>
        </div>
      )}
    </div>
  );
}
