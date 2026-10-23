import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { api } from '../lib/db';
import Avatar from './Avatar';

export default function Discover({ viewer }) {
  const [users, setUsers] = useState(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api('GET', '/api/users')
      .then(setUsers)
      .catch((e) => setError(e.message));
  }, []);

  const shown = useMemo(() => {
    if (!users) return [];
    const term = q.trim().toLowerCase();
    return term ? users.filter((u) => u.name.toLowerCase().includes(term)) : users;
  }, [users, q]);

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-28 pt-4 sm:pt-8">
      <label className="relative block">
        <span className="sr-only">Search members</span>
        <MagnifyingGlass size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search the crew"
          className="focus-ring w-full rounded-full border border-hairline bg-white py-2.5 pl-10 pr-4 text-base outline-none focus:border-primary"
        />
      </label>

      {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
      {users === null && !error && <p className="mt-6 text-sm text-ink-faint">Loading the crew…</p>}
      {users && shown.length === 0 && <p className="mt-6 text-center text-ink-muted">No one matches that.</p>}

      <ul className="mt-4 divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-white">
        {shown.map((u) => (
          <li key={u.id}>
            <Link to={`/u/${u.id}`} className="focus-ring flex items-center gap-3 px-4 py-3 hover:bg-black/[0.02]">
              <Avatar name={u.name} src={u.avatar} size="size-11" text="text-base" />
              <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                {u.name}
                {u.id === viewer.id && <span className="ml-2 text-xs font-normal text-ink-faint">you</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
