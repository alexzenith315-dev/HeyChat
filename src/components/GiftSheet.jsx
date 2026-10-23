import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { X, MagnifyingGlass } from '@phosphor-icons/react';
import { fetchGifts, sendGift } from '../lib/db';

const spring = { type: 'spring', stiffness: 420, damping: 34 };

// Tabs shown in the picker. "Popular" is a curated list of the headline gifts.
const TABS = ['Popular', 'Luxury', 'Food', 'Seasons', 'Nature', 'Fantasy'];
const POPULAR = new Set([
  'Rose', 'Heart', 'Crown', 'Panda', 'Dragon', 'Lion', 'Galaxy', 'Diamond',
  'Teddy Bear', 'Gift Box', 'Music Note', 'Fireworks',
]);

// Tile gradients per category (dark, themed). Colours are local to the gift picker only.
const TILE = {
  Popular: 'from-[#3b2a5c] to-[#140c24]',
  Luxury: 'from-[#5a4212] to-[#1a1206]',
  Food: 'from-[#5c2a2a] to-[#1d0c0c]',
  Seasons: 'from-[#1f4a4a] to-[#0a1c1c]',
  Nature: 'from-[#1f4d2e] to-[#0b1d12]',
  Fantasy: 'from-[#3a2060] to-[#12082a]',
};

function CoinIcon({ className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-grid size-3.5 place-items-center rounded-full bg-gradient-to-b from-[#ffe27a] to-[#d89a12] text-[8px] font-bold leading-none text-[#5a3b00] ${className}`}
    >
      C
    </span>
  );
}

export default function GiftSheet({ post, viewer, onClose, onSent }) {
  const [gifts, setGifts] = useState(null);
  const [error, setError] = useState('');
  const [sendingId, setSendingId] = useState(null);
  const [tab, setTab] = useState('Popular');
  const [query, setQuery] = useState('');
  const reduce = useReducedMotion();

  useEffect(() => {
    let alive = true;
    fetchGifts()
      .then((g) => alive && setGifts(g))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const visible = useMemo(() => {
    if (!gifts) return [];
    const q = query.trim().toLowerCase();
    if (q) return gifts.filter((g) => g.name.toLowerCase().includes(q));
    if (tab === 'Popular') return gifts.filter((g) => POPULAR.has(g.name));
    return gifts.filter((g) => g.category === tab);
  }, [gifts, tab, query]);

  async function send(gift) {
    setError('');
    setSendingId(gift.id);
    try {
      await sendGift({ giftId: gift.id, recipientId: post.user_id, postId: post.id });
      onSent({ emoji: gift.emoji, tier: gift.tier });
    } catch (e) {
      setError(e.message);
    } finally {
      setSendingId(null);
    }
  }

  return createPortal(
    <>
      <motion.div
        key="gift-scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-ink/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gift-title"
        initial={reduce ? { opacity: 0 } : { y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={reduce ? { opacity: 0 } : { y: '100%', opacity: 0 }}
        transition={spring}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85vh] w-full max-w-xl flex-col rounded-t-2xl border border-hairline bg-canvas pt-4 shadow-soft"
      >
        <div className="flex items-center justify-between px-5">
          <h2 id="gift-title" className="font-display text-xl font-bold tracking-tight text-ink">
            Send a gift to {post.author}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close gifts"
            className="focus-ring grid size-9 place-items-center rounded-full text-ink-secondary hover:bg-ink/5"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="px-5 pt-3">
          <label className="flex items-center gap-2 rounded-full border border-hairline bg-white px-3 py-2">
            <MagnifyingGlass size={16} aria-hidden="true" className="text-ink-muted" />
            <span className="sr-only">Search gifts</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search gifts"
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
            />
          </label>
        </div>

        {!query && (
          <div role="tablist" aria-label="Gift categories" className="mt-3 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`focus-ring shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                  tab === t ? 'bg-ink text-canvas' : 'bg-ink/5 text-ink-secondary hover:bg-ink/10'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {error && (
          <p role="alert" className="mx-5 mt-3 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
          {gifts === null && !error && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Loading gifts">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-[4/5] animate-pulse rounded-xl bg-ink/[0.05]" />
              ))}
            </div>
          )}

          {gifts && visible.length === 0 && (
            <p className="py-10 text-center text-sm text-ink-muted">No gifts match “{query}”.</p>
          )}

          {gifts && visible.length > 0 && (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {visible.map((g) => {
                const cat = g.category ?? 'Fantasy';
                const busy = sendingId === g.id;
                return (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => send(g)}
                      disabled={sendingId !== null}
                      aria-label={`Send ${g.name} for ${g.coin_cost.toLocaleString('en-US')} coins`}
                      className={`focus-ring group relative flex aspect-[4/5] w-full flex-col items-center justify-between overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b p-2 text-center text-white transition active:scale-95 disabled:opacity-60 ${TILE[cat] ?? TILE.Fantasy}`}
                    >
                      <span className="flex flex-1 items-center justify-center text-4xl leading-none drop-shadow-[0_2px_6px_rgba(255,255,255,0.25)]" aria-hidden="true">
                        {g.emoji}
                      </span>
                      <span className="w-full">
                        <span className="block truncate text-xs font-semibold">{g.name}</span>
                        <span className="mt-0.5 flex items-center justify-center gap-1 text-[11px] font-medium tabular-nums text-[#ffe27a]">
                          <CoinIcon />
                          {busy ? 'Sending…' : g.coin_cost.toLocaleString('en-US')}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </motion.div>
    </>,
    document.body,
  );
}
