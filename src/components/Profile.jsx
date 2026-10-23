import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link, useParams } from 'react-router-dom';
import { GridFour, Image as ImageIcon, FilmStrip, BookmarkSimple } from '@phosphor-icons/react';
import { fetchProfile, fetchFeed, toggleFollowUser, fetchSaved } from '../lib/db';
import Post from './Post';
import Avatar from './Avatar';
import { isVideoPost, ReelTile } from './Feed';

const spring = { type: 'spring', stiffness: 420, damping: 34 };

const PROFILE_TABS = [
  { id: 'posts', label: 'Posts', icon: GridFour },
  { id: 'media', label: 'Media', icon: ImageIcon },
  { id: 'reels', label: 'Reels', icon: FilmStrip },
];
// Saved is private: only shown on your own profile.
const SELF_TABS = [...PROFILE_TABS, { id: 'saved', label: 'Saved', icon: BookmarkSimple }];

// Inline stat: "12 Posts" / "3 Followers". Followers and Following link to the real lists.
function Stat({ to, value, label }) {
  const inner = (
    <>
      <span className="font-bold tabular-nums text-ink">{value}</span>
      <span className="text-ink-muted">{label}</span>
    </>
  );
  const base = 'inline-flex items-baseline gap-1 rounded-md text-[15px]';
  if (!to) return <span className={base}>{inner}</span>;
  return (
    <Link to={to} className={`focus-ring ${base} transition-colors hover:text-ink`}>
      {inner}
    </Link>
  );
}

function EmptyState({ icon: Icon, title, hint }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="grid size-16 place-items-center rounded-full border-2 border-ink-faint text-ink-faint">
        <Icon size={28} weight="regular" aria-hidden="true" />
      </div>
      <p className="mt-4 font-semibold text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-sm text-ink-muted">{hint}</p>}
    </div>
  );
}

export default function Profile({ viewer }) {
  const id = Number(useParams().id) || 0;
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState(null);
  const [tab, setTab] = useState('posts');
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const reduce = useReducedMotion();
  const isSelf = viewer.id === id;
  const tabs = isSelf ? SELF_TABS : PROFILE_TABS;

  useEffect(() => {
    if (tab !== 'saved' || !isSelf) return;
    let cancelled = false;
    fetchSaved()
      .then((r) => !cancelled && setSaved(r.posts ?? []))
      .catch(() => !cancelled && setSaved([]));
    return () => {
      cancelled = true;
    };
  }, [tab, isSelf]);

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
      <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-6">
        <p role="alert" className="text-sm text-danger">{error}</p>
        <button onClick={load} className="focus-ring mt-4 rounded-full border border-hairline bg-canvas px-5 py-2 text-sm font-medium text-ink-secondary">
          Try again
        </button>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-6" aria-label="Loading profile">
        <div className="h-36 animate-pulse rounded-2xl bg-ink/[0.04]" />
        <div className="-mt-12 ml-4 size-24 animate-pulse rounded-full bg-ink/[0.06]" />
      </div>
    );
  }

  const handle = `@${String(profile.name || '').replace(/\s+/g, '').toLowerCase()}`;

  return (
    <div className="mx-auto w-full max-w-xl pb-24 sm:pt-6">
      <section className="bg-canvas sm:overflow-hidden sm:rounded-2xl sm:border sm:border-hairline">
        {/* Cover: flat accent tint (design contract: no gradients) */}
        <div aria-hidden="true" className="relative h-36 overflow-hidden bg-accent-sky/35 sm:h-44">
          {profile.cover && <img src={profile.cover} alt="" className="absolute inset-0 size-full object-cover" />}
        </div>

        <div className="px-4 pb-5 sm:px-6">
          {/* Avatar overlaps the cover by half its height; the action button sits on the same baseline */}
          <div className="-mt-14 flex items-end justify-between gap-3">
            <div className="rounded-full bg-canvas p-1">
              <Avatar name={profile.name} src={profile.avatar} size="size-28" text="text-4xl" />
            </div>
            <div className="mb-1 flex items-center gap-2">
              {isSelf ? (
                <Link
                  to="/profile/edit"
                  className="focus-ring rounded-full border border-hairline bg-canvas px-5 py-2 text-sm font-semibold text-ink transition-colors hover:bg-ink/5"
                >
                  Edit profile
                </Link>
              ) : (
                <motion.button
                  whileTap={reduce ? undefined : { scale: 0.94 }}
                  transition={spring}
                  onClick={toggleFollow}
                  disabled={busy}
                  aria-pressed={profile.followed}
                  className={`focus-ring rounded-full border px-6 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
                    profile.followed
                      ? 'border-hairline bg-canvas text-ink hover:bg-ink/5'
                      : 'border-primary bg-primary text-white hover:opacity-90'
                  }`}
                >
                  {profile.followed ? 'Following' : 'Follow'}
                </motion.button>
              )}
            </div>
          </div>

          <div className="mt-3 min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight text-ink">{profile.name}</h1>
            <p className="truncate text-[15px] text-ink-muted">{handle}</p>
          </div>

          {profile.bio ? (
            <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink-secondary">{profile.bio}</p>
          ) : isSelf ? (
            <p className="mt-3 text-[15px] text-ink-faint">Add a bio from Edit profile.</p>
          ) : null}

          {/* Inline stat row: "12 Posts · 3 Followers · 5 Following" */}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            <Stat value={posts ? posts.length : '–'} label="Posts" />
            <Stat to={`/u/${id}/followers`} value={profile.followers} label={profile.followers === 1 ? 'Follower' : 'Followers'} />
            <Stat to={`/u/${id}/following`} value={profile.following} label="Following" />
          </div>
        </div>
      </section>

      {error && <p role="alert" className="mx-4 mt-4 text-sm text-danger">{error}</p>}

      <div role="tablist" aria-label="Profile sections" className="mt-2 grid border-b border-hairline" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              aria-label={t.label}
              onClick={() => setTab(t.id)}
              className={`focus-ring relative flex items-center justify-center py-3 transition-colors ${
                active ? 'text-ink' : 'text-ink-faint hover:text-ink-secondary'
              }`}
            >
              <Icon size={22} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
              {active && <span className="absolute inset-x-6 bottom-0 h-0.5 rounded-full bg-ink" aria-hidden="true" />}
            </button>
          );
        })}
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
            {posts.length === 0 && (
              <EmptyState icon={GridFour} title="No posts yet" hint={isSelf ? 'Share a thought or a photo and it will show up here.' : `${profile.name} hasn't posted anything yet.`} />
            )}
            <motion.div layout className="mt-4 space-y-3">
              {posts.map((p) => (
                <Post key={p.id} post={p} viewer={viewer} onChanged={load} />
              ))}
            </motion.div>
          </>
        )}

        {posts && tab === 'media' &&
          (media.length === 0 ? (
            <EmptyState icon={ImageIcon} title="No photos yet" />
          ) : (
            <div className="mt-1 grid grid-cols-3 gap-0.5">
              {media.map((p) => (
                <img key={p.id} src={p.image} alt={p.body ? p.body.slice(0, 80) : `Photo by ${profile.name}`} loading="lazy" className="aspect-square w-full object-cover" />
              ))}
            </div>
          ))}

        {tab === 'saved' && isSelf && (
          <>
            {saved === null && <p className="mt-6 text-center text-sm text-ink-faint">Loading…</p>}
            {saved && saved.length === 0 && (
              <EmptyState icon={BookmarkSimple} title="Nothing saved yet" hint="Tap the bookmark on a post or reel to keep it here." />
            )}
            {saved && saved.length > 0 && (
              <motion.div layout className="mt-4 space-y-3">
                {saved.map((p) => (
                  <Post key={p.id} post={p} viewer={viewer} onChanged={() => setSaved((list) => list?.filter((x) => x.id !== p.id) ?? null)} />
                ))}
              </motion.div>
            )}
          </>
        )}

        {posts && tab === 'reels' &&
          (reels.length === 0 ? (
            <EmptyState icon={FilmStrip} title="No reels yet" />
          ) : (
            <div className="mt-1 grid grid-cols-3 gap-0.5">
              {reels.map((p) => (
                <ReelTile key={p.id} p={p} />
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}
