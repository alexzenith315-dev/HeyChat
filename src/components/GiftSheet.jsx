import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { X } from '@phosphor-icons/react';
import { GIFT_TIERS, fetchGifts, sendGift } from '../lib/db';

const spring = { type: 'spring', stiffness: 420, damping: 34 };

export default function GiftSheet({ post, viewer, onClose, onSent }) {
  const [gifts, setGifts] = useState(null);
  const [error, setError] = useState('');
  const [sendingId, setSendingId] = useState(null);
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

  async function send(gift) {
    setError('');
    setSendingId(gift.id);
    try {
      await sendGift({
        giftId: gift.id,
        senderId: viewer.id,
        recipientId: post.user_id,
        postId: post.id,
        cost: gift.coin_cost,
        name: gift.name,
      });
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
        className="fixed inset-0 z-40 bg-ink/30"
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
        className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-xl rounded-t-2xl border border-hairline bg-canvas p-5 pb-8 shadow-soft"
      >
        <div className="flex items-center justify-between">
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

        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}

        {gifts === null && !error && <div className="mt-5 h-24 animate-pulse rounded-xl bg-ink/[0.03]" aria-label="Loading gifts" />}

        {gifts && (
          <div className="mt-4 space-y-5">
            {GIFT_TIERS.map((tier) => {
              const items = gifts.filter((g) => g.tier === tier.id);
              if (!items.length) return null;
              return (
                <section key={tier.id}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{tier.label}</h3>
                  <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {items.map((g) => (
                      <li key={g.id}>
                        <button
                          type="button"
                          onClick={() => send(g)}
                          disabled={sendingId !== null}
                          aria-label={`Send ${g.name} for ${g.coin_cost} coins`}
                          className="focus-ring flex w-full items-center gap-3 rounded-xl border border-hairline bg-canvas px-3 py-2.5 text-left transition active:scale-95 hover:bg-ink/[0.02] disabled:opacity-50"
                        >
                          <span className="text-2xl" aria-hidden="true">{g.emoji}</span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-ink">{g.name}</span>
                            <span className="block text-xs tabular-nums text-ink-muted">
                              {sendingId === g.id ? 'Sending…' : `${g.coin_cost.toLocaleString('en-US')} coins`}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </motion.div>
    </>,
    document.body,
  );
}
