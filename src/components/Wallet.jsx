import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Coins } from '@phosphor-icons/react';
import { fetchWallet, fetchTransactions } from '../lib/db';
import { timeAgo } from '../lib/time';

const KIND = {
  gift_sent: 'Gift sent',
  gift_received: 'Gift received',
  admin_grant: 'Owner grant',
};

export default function Wallet({ viewer }) {
  const [wallet, setWallet] = useState(null);
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const reduce = useReducedMotion();

  useEffect(() => {
    let alive = true;
    Promise.all([fetchWallet(viewer.id), fetchTransactions(viewer.id)])
      .then(([w, t]) => {
        if (!alive) return;
        setWallet(w);
        setItems(t);
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [viewer.id]);

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-4 sm:pt-8">
      <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Wallet</h1>

      <section className="card mt-6 flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-ink-muted">Balance</p>
          <p className="mt-1 flex items-baseline gap-2 font-display text-4xl font-bold tracking-tight text-ink tabular-nums">
            {wallet ? wallet.coins.toLocaleString('en-US') : '…'}
            <span className="text-base font-medium text-ink-muted">coins</span>
          </p>
        </div>
        <div className="grid size-12 place-items-center rounded-full bg-canvas-soft">
          <Coins size={24} className="text-ink-secondary" aria-hidden="true" />
        </div>
      </section>

      {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}

      <h2 className="mt-8 text-sm font-semibold text-ink-muted">History</h2>

      {items === null && !error && (
        <div className="mt-3 space-y-3" aria-label="Loading transactions">
          {[0, 1].map((i) => (
            <div key={i} className="card h-16 animate-pulse bg-black/[0.03]" />
          ))}
        </div>
      )}

      {items?.length === 0 && (
        <motion.p initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="mt-10 text-center text-xl font-bold text-ink">
          No activity yet.
        </motion.p>
      )}

      {items?.length > 0 && (
        <ul className="mt-3 space-y-3">
          {items.map((t) => {
            const amount = Number(t.amount);
            return (
              <motion.li
                key={t.id}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="card flex items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink">{KIND[t.kind] ?? t.kind}</p>
                  <time className="text-xs text-ink-faint" dateTime={new Date(Number(t.created_at)).toISOString()}>
                    {timeAgo(t.created_at)}
                  </time>
                </div>
                <span className={`font-semibold tabular-nums ${amount < 0 ? 'text-ink-secondary' : 'text-primary'}`}>
                  {amount > 0 ? '+' : ''}
                  {amount}
                </span>
              </motion.li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
