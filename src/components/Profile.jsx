import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { GridFour, Image as ImageIcon, FilmStrip, BookmarkSimple, ArrowLeft, MagnifyingGlass, LinkSimple, CalendarBlank, ShareFat, Gear } from '@phosphor-icons/react';
import { fetchProfile, fetchFeed, toggleFollowUser, fetchSaved, unblockUser } from '../lib/db';
import Post from './Post';
import Avatar from './Avatar';
import BlockReportMenu from './BlockReportMenu';
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
  const base = 'inline-flex items-baseline gap-1 rounded-md text-[15px] hover:underline';
  if (!to) return <span className={base}>{inner}</span>;
  return (
    <Link to={to} className={`focus-ring ${base}`}>
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
  const navigate = useNavigate();
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
      const p = await fetchProfile(id, viewer.id);
      if (!p) {
        setError('That member could not be found.');
        return;
      }
      if (p.blocked) {
        // You blocked this person: no feed is requested, the page shows the blocked state.
        setProfile(p);
        setPosts([]);
        setError('');
        return;
      }
      const feed = await fetchFeed(viewer.id, null, id);
      setProfile(p);
      setPosts(feed.posts);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [id, viewer.id]);

  async function unblockProfile() {
    setBusy(true);
    setError('');
    try {
      await unblockUser(id);
      await load();
    } catch (e) {
      setError(e.message || 'Could not unblock that person.');
    } finally {
      setBusy(false);
    }
  }

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

  if (profile.blocked) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-6">
        <button onClick={() => navigate(-1)} className="focus-ring mb-4 inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-ink-secondary hover:bg-ink/5">
          <ArrowLeft size={16} aria-hidden="true" /> Back
        </button>
        <section className="card flex flex-col items-center gap-3 p-6 text-center" aria-labelledby="blocked-profile-h">
          <Avatar name={profile.name} src={profile.avatar} size="size-16" text="text-2xl" />
          <h1 id="blocked-profile-h" className="font-display text-lg font-semibold text-ink">{profile.name}</h1>
          <p className="text-sm text-ink-muted">You blocked this user. You won’t see their posts or messages.</p>
          <button
            type="button"
            onClick={unblockProfile}
            disabled={busy}
            className="focus-ring mt-1 rounded-full border border-ink bg-ink px-5 py-1.5 text-sm font-bold text-canvas hover:opacity-90 disabled:opacity-50"
          >
            Unblock
          </button>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </section>
      </div>
    );
  }

  const handle = `@${String(profile.name || '').replace(/\s+/g, '').toLowerCase()}`;
  const joinedLabel = profile.joined ? new Date(profile.joined).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : null;

  return (
    <div className="mx-auto w-full max-w-xl pb-24 sm:pt-6">
      <section className="bg-canvas sm:overflow-hidden sm:rounded-2xl sm:border sm:border-hairline">
        {/* Cover: full width, back arrow and icon buttons overlaid */}
        <div className="relative h-40 overflow-hidden bg-accent-sky/35 sm:h-48">
          {profile.cover && <img src={profile.cover} alt="" className="absolute inset-0 size-full object-cover" />}
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="focus-ring absolute left-3 top-3 grid size-9 place-items-center rounded-full bg-black/55 text-white"
          >
            <ArrowLeft size={18} weight="bold" aria-hidden="true" />
          </button>
          <div className="absolute right-3 top-3 flex items-center gap-2">
            <button type="button" aria-label="Search" onClick={() => navigate('/discover')} className="focus-ring grid size-9 place-items-center rounded-full bg-black/55 text-white">
              <MagnifyingGlass size={18} weight="bold" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="px-4 pb-4 sm:px-5">
          {/* Square rounded avatar overlapping the cover bottom-left; actions sit on the right */}
          <div className="-mt-12 flex items-end justify-between gap-3">
            <div className="rounded-[18px] border-4 border-canvas bg-canvas">
              <Avatar name={profile.name} src={profile.avatar} size="size-24" text="text-4xl" rounded="rounded-[14px]" />
            </div>
            <div className="mb-1 flex items-center gap-2">
              <button
                type="button"
                aria-label="Share profile"
                onClick={async () => {
                const url = `${window.location.origin}/u/${id}`;
                try {
                  if (navigator.share) await navigator.share({ title: `${profile.name} on HeyChat`, url });
                  else await navigator.clipboard.writeText(url);
                } catch {
                  /* share sheet dismissed */
                }
                }}
                className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-hairline bg-canvas px-4 py-1.5 text-sm font-bold text-ink hover:bg-ink/5"
              >
                <ShareFat size={16} weight="bold" aria-hidden="true" />
                Share
              </button>
              {isSelf ? (
                <>
                  <Link to="/profile/edit" className="focus-ring rounded-full border border-hairline bg-canvas px-4 py-1.5 text-sm font-bold text-ink hover:bg-ink/5">
                    Edit profile
                  </Link>
                  <Link to="/settings" aria-label="Settings" className="focus-ring grid size-9 place-items-center rounded-full border border-hairline bg-canvas text-ink hover:bg-ink/5">
                    <Gear size={18} weight="bold" aria-hidden="true" />
                  </Link>
                </>
              ) : (
                <>
                <BlockReportMenu
                  userId={profile.id}
                  userName={profile.name}
                  blocked={!!profile.blocked}
                />
                <motion.button
                  whileTap={reduce ? undefined : { scale: 0.94 }}
                  transition={spring}
                  onClick={toggleFollow}
                  disabled={busy}
                  aria-pressed={profile.followed}
                  className={`focus-ring rounded-full border px-5 py-1.5 text-sm font-bold transition-colors disabled:opacity-50 ${
                    profile.followed ? 'border-hairline bg-canvas text-ink hover:bg-ink/5' : 'border-ink bg-ink text-canvas hover:opacity-90'
                  }`}
                >
                  {profile.followed ? 'Following' : 'Follow'}
                </motion.button>
                </>
              )}
            </div>
          </div>

          <div className="mt-3 min-w-0">
            <h1 className="truncate text-xl font-extrabold tracking-tight text-ink">{profile.name}</h1>
            <p className="truncate text-[15px] text-ink-muted">{handle}</p>
          </div>

          {profile.bio ? (
            <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink">{profile.bio}</p>
          ) : isSelf ? (
            <p className="mt-3 text-[15px] text-ink-faint">Add a bio from Edit profile.</p>
          ) : null}

          {/* Meta row: small icons, joined date, chevron to the full profile details */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[15px] text-ink-muted">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <LinkSimple size={16} aria-hidden="true" />
              <span className="truncate text-primary-text">{typeof window !== 'undefined' ? window.location.host : ''}/u/{id}</span>
            </span>
            {joinedLabel && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarBlank size={16} aria-hidden="true" />
                Joined {joinedLabel}
              </span>
            )}
          </div>

          {/* Inline stats: bold numbers, muted labels, tappable */}
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            <Stat to={`/u/${id}/following`} value={profile.following} label="Following" />
            <Stat to={`/u/${id}/followers`} value={profile.followers} label={profile.followers === 1 ? 'Follower' : 'Followers'} />
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
              className={`focus-ring relative flex items-center justify-center py-3.5 transition-colors ${
                active ? 'text-ink' : 'text-ink-faint hover:bg-ink/5'
              }`}
            >
              <Icon size={22} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
              {active && <span className="absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-primary" aria-hidden="true" />}
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
