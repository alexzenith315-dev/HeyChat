import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createInvite, listInvites } from '../lib/db';

export default function Invites({ viewer }) {
  const [invites, setInvites] = useState(null);
  const [fresh, setFresh] = useState(null);
  const [error, setError] = useState('');

  async function refresh() {
    try {
      setInvites(await listInvites());
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function generate() {
    setError('');
    try {
      setFresh(await createInvite(viewer.id));
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-6 sm:pt-10">
      <h1 className="text-3xl font-bold tracking-tight text-ink">Invites</h1>
      <p className="mt-1 text-ink-muted">Each code works once. Hand it to one friend.</p>

      <button
        onClick={generate}
        className="focus-ring mt-6 w-full rounded-full bg-primary py-3 font-medium text-white transition active:scale-[0.98]"
      >
        Make a new code
      </button>

      <AnimatePresence>
        {fresh && (
          <motion.div
            key={fresh}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="card mt-4 flex items-center justify-between p-4"
          >
            <span className="font-mono text-2xl font-semibold tracking-[0.2em] text-ink">{fresh}</span>
            <button
              onClick={() => navigator.clipboard?.writeText(fresh)}
              className="focus-ring rounded-full px-3 py-1.5 text-sm text-primary hover:bg-primary/10"
            >
              Copy
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}

      <ul className="mt-6 space-y-2">
        {invites?.length === 0 && <li className="text-ink-faint">No codes yet.</li>}
        {invites?.map((i) => (
          <li key={i.code} className="card flex items-center justify-between px-4 py-3">
            <span className="font-mono tracking-[0.15em] text-ink">{i.code}</span>
            {i.used_by ? (
              <span className="text-sm text-ink-muted">Used by {i.used_by_name}</span>
            ) : (
              <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-sm font-medium text-success">Open</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
