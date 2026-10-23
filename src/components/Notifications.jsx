import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Heart, ChatCircle, UserPlus, Gift as GiftIcon } from '@phosphor-icons/react';
import { fetchNotifications, markNotificationsRead } from '../lib/db';
import { timeAgo } from '../lib/time';
import Avatar from './Avatar';

const COPY = {
  like: { text: 'liked your post', Icon: Heart },
  comment: { text: 'commented on your post', Icon: ChatCircle },
  follow: { text: 'followed you', Icon: UserPlus },
  gift: { text: 'sent you a gift', Icon: GiftIcon },
};

export default function Notifications({ viewer, onRead }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const reduce = useReducedMotion();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await fetchNotifications(viewer.id);
        if (!alive) return;
        setItems(rows);
        setError('');
        await markNotificationsRead(viewer.id);
        if (alive) onRead?.();
      } catch (e) {
        if (alive) setError(e.message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [viewer.id]);

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-4 sm:pt-8">
      <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Notifications</h1>

      {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}

      {items === null && !error && (
        <div className="mt-6 space-y-3" aria-label="Loading notifications">
          {[0, 1].map((i) => (
            <div key={i} className="card h-16 animate-pulse bg-ink/[0.03]" />
          ))}
        </div>
      )}

      {items?.length === 0 && (
        <motion.p initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="mt-14 text-center text-xl font-bold text-ink">
          Nothing yet.
        </motion.p>
      )}

      {items?.length > 0 && (
        <ul className="mt-6 space-y-3">
          {items.map((n) => {
            const copy = COPY[n.kind] ?? { text: 'did something', Icon: Heart };
            const actor = n.actor ?? 'Someone';
            return (
              <motion.li
                key={n.id}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`card flex items-center gap-3 p-4 ${Number(n.read) ? '' : 'border-primary/40'}`}
              >
                <Avatar name={actor} src={n.actor_avatar} size="size-9" />
                <div className="min-w-0 flex-1">
                  <p className="text-ink">
                    <span className="font-semibold">{actor}</span> {copy.text}
                  </p>
                  <time className="text-xs text-ink-faint" dateTime={new Date(Number(n.created_at)).toISOString()}>
                    {timeAgo(n.created_at)}
                  </time>
                </div>
                <copy.Icon size={18} className="shrink-0 text-ink-muted" aria-hidden="true" />
              </motion.li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
