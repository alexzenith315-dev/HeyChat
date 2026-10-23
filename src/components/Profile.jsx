import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link, useParams } from 'react-router-dom';
import { fetchProfile, fetchFeed, toggleFollowUser } from '../lib/db';
import Post from './Post';
import Avatar from './Avatar';
import { isVideoPost } from './Feed';

const spring = { type: 'spring', stiffness: 420, damping: 34 };
const PROFILE_TABS = [
  { id: 'posts', label: 'Posts' },
  { id: 'media', label: 'Media' },
  { id: 'reels', label: 'Reels' },
];

// A stat is a real link to the follower / following list. Posts is informational.
function Stat({ to, value, label }) {
  const inner = (
    <>
      <span className="font-display text-lg font-bold tabular-nums text-ink">{value}</span>
      <span className="text-xs text-ink-muted">{label}</span>
    </>
  );
  if (!to) return <div className="flex min-w-0 flex-1 flex-col items-center py-3">{inner}</div>;
  return (
    <Link to={to} className="focus-ring flex min-w-0 flex-1 flex-col items-center rounded-lg py-3 transition-colors hover:bg-ink/5">
      {inner}
    </Link>
  );
}

function EmptyNote({ children }) {
  return <p className="mt-10 text-center text-ink-muted">{children}</p>;
}

export default function Profile({ viewer }) {
  const id = Number(useParams().id) || 0;
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState(null);
  const [tab, setTab] = useState('posts');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const reduce = useReducedMotion();
  const isSelf = viewer.id === id;

  const load = useCallback(async () => {
    try {
      const [p, feed] = await Promise.all([fetchProfile(id, viewer.id), fetchFeed(viewer.id, null, id)]);
      if (!p) {
        setError('That member could not be found.');
        return;
      }
      setProfile(p);
      setPosts(feed.posts);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [id, viewer.id]);

  useEffect(() => {
    setProfile(null);
    setPosts(null);
    setTab('posts');
    load();
  }, [load]);

  const media = useMemo(() => (posts ?? []).filter((p) => p.image), [posts]);
  const reels = useMemo(() => (posts ?? []).filter(isVideoPost), [posts]);

  async function toggleFollow() {
    if (!profile || busy) return;
    setBusy(true);
    setError('');
    try {
      const nowFollowing = await toggleFollowUser(viewer.id, id, profile.followed);
      setProfile((p) => ({
        ...p,
        followed: nowFollowing,
        followers: p.followers + (nowFollowing ? 1 : -1),
      }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !profile) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-4 sm:pt-8">
        <p role="alert" className="text-sm text-danger">{error}</p>
        <button onClick={load} className="focus-ring mt-4 rounded-full border border-hairline bg-canvas px-5 py-2 text-sm font-medium text-ink-secondary">
          Try again
        </button>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-4 sm:pt-8" aria-label="Loading profile">
        <div className="card h-56 animate-pulse bg-ink/[0.03]" />
      </div>
    );
  }

  const handle = `@${String(profile.name || '').replace(/\s+/g, '').toLowerCase()}`;

  return (
    <div className="mx-auto w-full max-w-xl pb-24 sm:pt-6">
      <section className="overflow-hidden bg-canvas sm:rounded-2xl sm:border sm:border-hairline">
        {/* Cover: solid theme colour, the avatar overlaps its bottom edge only */}
        <div className="relative h-32 bg-accent-sky/25 sm:h-40" aria-hidden="true" />

        <div className="px-5 pb-5">
          <div className="-mt-14 flex items-end justify-between gap-3">
            <div className="rounded-full bg-canvas p-1.5 ring-1 ring-hairline">
              <Avatar name={profile.name} src={profile.avatar} size="size-28" text="text-4xl" />
            </div>
            {isSelf ? (
              <Link
                to="/profile/edit"
                className="focus-ring mb-1 rounded-full border border-hairline bg-canvas px-5 py-2 text-sm font-semibold text-ink-secondary transition-colors hover:bg-ink/5"
              >
                Edit profile
              </Link>
            ) : (
              <motion.button
                whileTap={reduce ? undefined : { scale: 0.92 }}
                transition={spring}
                onClick={toggleFollow}
                disabled={busy}
                aria-pressed={profile.followed}
                className={`focus-ring mb-1 rounded-full border px-6 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
                  profile.followed ? 'border-hairline bg-canvas text-ink-secondary' : 'border-primary bg-primary text-white'
                }`}
              >
                {profile.followed ? 'Following' : 'Follow'}
              </motion.button>
            )}
          </div>

          <h1 className="mt-3 truncate font-display text-2xl font-bold tracking-tight text-ink">{profile.name}</h1>
          <p className="text-sm text-ink-muted">{handle}</p>

          {profile.bio ? (
            <p className="mt-3 whitespace-pre-wrap break-words text-ink-secondary">{profile.bio}</p>
          ) : (
            <p className="mt-3 text-sm text-ink-faint">{isSelf ? 'Add a bio from Edit profile.' : 'No bio yet.'}</p>
          )}

          {/* Stats: Followers and Following open the real user lists */}
          <div className="mt-4 flex divide-x divide-hairline rounded-xl border border-hairline bg-canvas-soft">
            <Stat value={posts ? posts.length : '–'} label="Posts" />
            <Stat to={`/u/${id}/followers`} value={profile.followers} label="Followers" />
            <Stat to={`/u/${id}/following`} value={profile.following} label="Following" />
          </div>
        </div>
      </section>

      {error && <p role="alert" className="mx-4 mt-4 text-sm text-danger">{error}</p>}

      <div role="tablist" aria-label="Profile sections" className="mt-4 flex border-b border-hairline px-2">
        {PROFILE_TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`focus-ring flex-1 border-b-2 py-3 text-sm font-semibold transition-colors ${
              tab === t.id ? 'border-primary text-ink' : 'border-transparent text-ink-faint hover:text-ink-secondary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4">
        {posts === null && (
          <div className="mt-4 space-y-3" aria-label="Loading posts">
            {[0, 1].map((i) => (
              <div key={i} className="card h-28 animate-pulse bg-ink/[0.03]" />
            ))}
          </div>
        )}

        {posts && tab === 'posts' && (
          <>
            {posts.length === 0 && <EmptyNote>No posts yet.</EmptyNote>}
            <motion.div layout className="mt-4 space-y-3">
              {posts.map((p) => (
                <Post key={p.id} post={p} viewer={viewer} onChanged={load} />
              ))}
            </motion.div>
          </>
        )}

        {posts && tab === 'media' && (
          <>
            {media.length === 0 ? (
              <EmptyNote>No photos yet.</EmptyNote>
            ) : (
              <div className="mt-4 grid grid-cols-3 gap-1 overflow-hidden rounded-2xl">
                {media.map((p) => (
                  <img key={p.id} src={p.image} alt={p.body ? p.body.slice(0, 80) : `Photo by ${profile.name}`} loading="lazy" className="aspect-square w-full object-cover" />
                ))}
              </div>
            )}
          </>
        )}

        {posts && tab === 'reels' && (
          <>
            {reels.length === 0 ? (
              <EmptyNote>No reels yet.</EmptyNote>
            ) : (
              <div className="mt-4 grid grid-cols-3 gap-1 overflow-hidden rounded-2xl">
                {reels.map((p) => (
                  <video key={p.id} src={p.video} muted playsInline preload="metadata" aria-label={p.body ? p.body.slice(0, 80) : `Reel by ${profile.name}`} className="aspect-[3/4] w-full bg-black object-cover" />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
