import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from '@phosphor-icons/react';
import { fetchFollowList, fetchProfile, toggleFollowUser } from '../lib/db';
import Avatar from './Avatar';

// Real follower / following list for a profile. Rows link to each person's profile.
export default function FollowList({ viewer }) {
  const { id: rawId, kind } = useParams();
  const id = Number(rawId) || 0;
  const valid = kind === 'followers' || kind === 'following';
  const [owner, setOwner] = useState(null);
  const [people, setPeople] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!valid || !id) return;
    let alive = true;
    setPeople(null);
    setError('');
    Promise.all([fetchProfile(id, viewer.id), fetchFollowList(id, kind)])
      .then(([p, rows]) => {
        if (!alive) return;
        setOwner(p);
        setPeople(rows);
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id, kind, valid, viewer.id]);

  async function toggle(u) {
    if (busyId) return;
    setBusyId(u.id);
    try {
      const now = await toggleFollowUser(viewer.id, u.id, u.followed);
      setPeople((list) => list.map((x) => (x.id === u.id ? { ...x, followed: now } : x)));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  if (!valid) {
    return <p className="mx-auto mt-10 max-w-xl px-4 text-center text-ink-muted">Nothing to see here.</p>;
  }

  const title = kind === 'followers' ? 'Followers' : 'Following';

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-4 sm:pt-6">
      <header className="flex items-center gap-3">
        <Link
          to={`/u/${id}`}
          aria-label="Back to profile"
          className="focus-ring grid size-9 place-items-center rounded-full text-ink-secondary hover:bg-ink/5"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate font-display text-lg font-bold tracking-tight text-ink">{title}</h1>
          {owner && <p className="truncate text-xs text-ink-faint">{owner.name}</p>}
        </div>
      </header>

      {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
      {people === null && !error && <p className="mt-6 text-sm text-ink-faint">Loading…</p>}
      {people && people.length === 0 && (
        <p className="mt-6 text-center text-ink-muted">
          {kind === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
        </p>
      )}

      {people && people.length > 0 && (
        <ul className="mt-4 divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-canvas">
          {people.map((u) => (
            <li key={u.id} className="flex items-center gap-3 px-4 py-3">
              <Link to={`/u/${u.id}`} className="focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-lg">
                <Avatar name={u.name} src={u.avatar} size="size-11" text="text-base" />
                <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                  {u.name}
                  {u.id === viewer.id && <span className="ml-2 text-xs font-normal text-ink-faint">you</span>}
                </span>
              </Link>
              {u.id !== viewer.id && (
                <button
                  type="button"
                  onClick={() => toggle(u)}
                  disabled={busyId === u.id}
                  aria-pressed={u.followed}
                  className={`focus-ring shrink-0 rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
                    u.followed ? 'border-hairline bg-canvas text-ink-secondary' : 'border-primary bg-primary text-white'
                  }`}
                >
                  {u.followed ? 'Following' : 'Follow'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
