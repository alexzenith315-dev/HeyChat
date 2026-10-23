import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CaretRight, SignOut } from '@phosphor-icons/react';
import { setToken, listInvites, createInvite, updateEmail } from '../lib/db';
import Avatar from './Avatar';

function Row({ children, to, onClick, danger }) {
  const cls = `focus-ring flex w-full items-center justify-between gap-3 px-5 py-4 text-left text-base ${
    danger ? 'text-red-600' : 'text-ink'
  } hover:bg-black/[0.03]`;
  if (to) {
    return (
      <Link to={to} className={cls}>
        {children}
        <CaretRight size={16} className="text-ink-faint" aria-hidden="true" />
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

export default function Settings({ viewer, onLogout }) {
  const [invites, setInvites] = useState(null);
  const [fresh, setFresh] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(viewer.email ?? '');
  const [emailSaved, setEmailSaved] = useState('');

  async function saveEmail(e) {
    e.preventDefault();
    setError('');
    setEmailSaved('');
    setBusy(true);
    try {
      const saved = await updateEmail(email.trim());
      setEmail(saved ?? '');
      setEmailSaved(saved ? 'Email saved.' : 'Email removed.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!viewer.isAdmin) return;
    listInvites()
      .then(setInvites)
      .catch((e) => setError(e.message));
  }, [viewer.isAdmin]);

  async function generate() {
    setError('');
    setBusy(true);
    try {
      const code = await createInvite();
      setFresh(code);
      setInvites(await listInvites());
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    setToken(null);
    onLogout?.();
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-4 sm:pt-8">
      <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Settings</h1>

      <section className="card mt-6 overflow-hidden" aria-labelledby="account-h">
        <h2 id="account-h" className="px-5 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">Account</h2>
        <div className="flex items-center gap-3 px-5 py-3">
          <Avatar name={viewer.name} size="size-10" text="text-base" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{viewer.name}</p>
            <p className="text-sm text-ink-muted">{viewer.isAdmin ? 'Owner' : 'Member'}</p>
          </div>
        </div>
        <div className="divide-y divide-hairline">
          <Row to="/profile/edit">Edit profile</Row>
          <Row to={`/u/${viewer.id}`}>View my profile</Row>
        </div>
        <form onSubmit={saveEmail} className="space-y-2 border-t border-hairline px-5 py-4" aria-label="Email">
          <label htmlFor="email-input" className="block text-sm font-medium text-ink-secondary">Email</label>
          <div className="flex gap-2">
            <input
              id="email-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={254}
              placeholder="you@example.com"
              autoComplete="email"
              className="focus-ring min-w-0 flex-1 rounded-xl border border-hairline bg-white px-3 py-2 text-ink"
            />
            <button type="submit" disabled={busy} className="focus-ring rounded-full bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              Save
            </button>
          </div>
          {emailSaved && <p className="text-sm text-ink-muted">{emailSaved}</p>}
        </form>
      </section>

      <section className="card mt-4 overflow-hidden" aria-labelledby="general-h">
        <h2 id="general-h" className="px-5 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">General</h2>
        <div className="divide-y divide-hairline">
          <Row to="/wallet">Wallet and coins</Row>
          <Row to="/creator">Creator stats</Row>
          <Row to="/notifications">Notifications</Row>
          {viewer.isAdmin && <Row to="/admin">Admin panel</Row>}
        </div>
      </section>

      {viewer.isAdmin && (
        <section className="card mt-4 p-5" aria-labelledby="invite-h">
          <h2 id="invite-h" className="font-semibold text-ink">Invite codes</h2>
          <p className="mt-1 text-sm text-ink-muted">Each code works once. Hand it to one friend.</p>
          <button
            onClick={generate}
            disabled={busy}
            className="focus-ring mt-4 w-full rounded-full bg-primary py-3 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? 'Making…' : 'Make a new code'}
          </button>
          {fresh && (
            <div className="mt-4 flex items-center justify-between rounded-xl border border-hairline p-4">
              <span className="font-mono text-xl font-semibold tracking-[0.2em] text-ink">{fresh}</span>
              <button
                onClick={() => navigator.clipboard?.writeText(fresh)}
                className="focus-ring rounded-full px-3 py-1.5 text-sm text-primary hover:bg-primary/10"
              >
                Copy
              </button>
            </div>
          )}
          <ul className="mt-4 space-y-2">
            {invites?.length === 0 && <li className="text-sm text-ink-faint">No codes yet.</li>}
            {invites?.map((i) => (
              <li key={i.code} className="flex items-center justify-between rounded-xl border border-hairline px-4 py-3">
                <span className="font-mono tracking-[0.15em] text-ink">{i.code}</span>
                {i.used_by ? (
                  <span className="text-sm text-ink-muted">Used by {i.used_by_name}</span>
                ) : (
                  <span className="rounded-full bg-accent-green/15 px-2.5 py-0.5 text-sm font-medium text-[#14742a]">Open</span>
                )}
              </li>
            ))}
          </ul>
          {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
        </section>
      )}

      <section className="card mt-4 overflow-hidden">
        <Row danger onClick={logout}>
          <span className="flex items-center gap-2">
            <SignOut size={18} aria-hidden="true" />
            Log out
          </span>
        </Row>
      </section>
    </div>
  );
}
