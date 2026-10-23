import { useCallback, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link, useParams } from 'react-router-dom';
import { fetchProfile, fetchFeed, toggleFollowUser } from '../lib/db';
import Post from './Post';
import Avatar from './Avatar';

const spring = { type: 'spring', stiffness: 420, damping: 34 };

export default function Profile({ viewer }) {
  const id = Number(useParams().id) || 0;
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState(null);
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
    load();
  }, [load]);

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
        <p role="alert" className="text-sm text-red-600">{error}</p>
        <button onClick={load} className="focus-ring mt-4 rounded-full border border-hairline bg-white px-5 py-2 text-sm font-medium text-ink-secondary">
          Try again
        </button>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-4 sm:pt-8" aria-label="Loading profile">
        <div className="card h-40 animate-pulse bg-black/[0.03]" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-4 sm:pt-8">
      <section className="card p-5">
        <div className="flex items-center gap-4">
          <Avatar name={profile.name} src={profile.avatar} size="size-16" text="text-2xl" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-2xl font-bold tracking-tight text-ink">{profile.name}</h1>
            <p className="mt-1 text-sm tabular-nums text-ink-muted">
              <span className="font-semibold text-ink">{profile.followers}</span> followers
              <span className="mx-2 text-ink-faint">·</span>
              <span className="font-semibold text-ink">{profile.following}</span> following
            </p>
          </div>
          {isSelf ? (
            <Link
              to="/profile/edit"
              className="focus-ring shrink-0 rounded-full border border-hairline bg-white px-4 py-1.5 text-sm font-medium text-ink-secondary hover:bg-black/5"
            >
              Edit profile
            </Link>
          ) : (
            <motion.button
              whileTap={reduce ? undefined : { scale: 0.86 }}
              onClick={toggleFollow}
              disabled={busy}
              aria-pressed={profile.followed}
              className={`focus-ring shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                profile.followed ? 'border-hairline bg-white text-ink-muted' : 'border-primary bg-primary text-white'
              }`}
            >
              {profile.followed ? 'Unfollow' : 'Follow'}
            </motion.button>
          )}
        </div>
        {profile.bio ? (
          <p className="mt-4 whitespace-pre-wrap break-words text-ink-secondary">{profile.bio}</p>
        ) : (
          <p className="mt-4 text-sm text-ink-faint">{isSelf ? 'Add a bio from Edit profile.' : 'No bio yet.'}</p>
        )}
      </section>

      {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-ink-muted">Posts</h2>

      {posts === null && (
        <div className="mt-3 space-y-3" aria-label="Loading posts">
          {[0, 1].map((i) => (
            <div key={i} className="card h-28 animate-pulse bg-black/[0.03]" />
          ))}
        </div>
      )}

      {posts?.length === 0 && (
        <motion.p initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="mt-10 text-center text-ink-muted">
          No posts yet.
        </motion.p>
      )}

      <motion.div layout className="mt-3 space-y-3">
        {posts?.map((p) => (
          <Post key={p.id} post={p} viewer={viewer} onChanged={load} />
        ))}
      </motion.div>
    </div>
  );
}
