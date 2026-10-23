import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Coins, Users, Notepad, Heart } from '@phosphor-icons/react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { fetchCreatorStats, CREATOR_DAYS } from '../lib/db';
import { timeAgo } from '../lib/time';

const spring = { type: 'spring', stiffness: 420, damping: 34 };

function Stat({ label, value, Icon }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className="grid size-9 shrink-0 place-items-center rounded-full bg-canvas-soft">
        <Icon size={18} className="text-ink-secondary" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-ink-muted">{label}</p>
        <p className="font-display text-xl font-bold tracking-tight text-ink tabular-nums">{value}</p>
      </div>
    </div>
  );
}

export default function Creator({ viewer }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const reduce = useReducedMotion();

  useEffect(() => {
    let alive = true;
    fetchCreatorStats(viewer.id)
      .then((s) => {
        if (!alive) return;
        setError('');
        setStats(s);
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [viewer.id]);

  const hasGifts = stats && stats.recent.length > 0;

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-4 sm:pt-8">
      <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Creator</h1>

      {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}

      {stats === null && !error && (
        <div className="mt-6 space-y-3" aria-label="Loading creator stats">
          {[0, 1].map((i) => (
            <div key={i} className="card h-20 animate-pulse bg-ink/[0.03]" />
          ))}
        </div>
      )}

      {stats && (
        <>
          <section className="card mt-6 flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-ink-muted">Coins earned from gifts</p>
              <p className="mt-1 flex items-baseline gap-2 font-display text-4xl font-bold tracking-tight text-ink tabular-nums">
                {stats.totalEarned.toLocaleString('en-US')}
                <span className="text-base font-medium text-ink-muted">coins</span>
              </p>
            </div>
            <div className="grid size-12 place-items-center rounded-full bg-canvas-soft">
              <Coins size={24} className="text-ink-secondary" aria-hidden="true" />
            </div>
          </section>

          <div className="mt-3 grid grid-cols-3 gap-3">
            <Stat label="Followers" value={stats.followers.toLocaleString('en-US')} Icon={Users} />
            <Stat label="Posts" value={stats.posts.toLocaleString('en-US')} Icon={Notepad} />
            <Stat label="Likes" value={stats.likes.toLocaleString('en-US')} Icon={Heart} />
          </div>

          <h2 className="mt-8 text-sm font-semibold text-ink-muted">Coins per day, last {CREATOR_DAYS} days</h2>
          <section className="card mt-3 p-4">
            {hasGifts ? (
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.daily} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid stroke="rgb(var(--c-hairline))" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'rgb(var(--c-ink-muted))' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'rgb(var(--c-ink-muted))' }} tickLine={false} axisLine={false} />
                    <Tooltip
                      cursor={{ stroke: 'rgb(var(--c-hairline))' }}
                      contentStyle={{ borderRadius: 12, border: '1px solid rgb(var(--c-hairline))', fontSize: 13, background: 'rgb(var(--c-canvas))', color: 'rgb(var(--c-ink))' }}
                      formatter={(v) => [`${v} coins`, 'Earned']}
                    />
                    <Line
                      type="monotone"
                      dataKey="coins"
                      stroke="rgb(var(--c-primary-text))"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                      isAnimationActive={!reduce}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-ink-muted">Gifts you receive will chart here.</p>
            )}
          </section>

          <h2 className="mt-8 text-sm font-semibold text-ink-muted">Recent gifts</h2>

          {!hasGifts && (
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduce ? { duration: 0 } : spring}
              className="mt-3 card p-6 text-center"
            >
              <p className="text-xl font-bold text-ink">No gifts yet.</p>
              <p className="mt-2 text-sm text-ink-muted">When someone sends you a gift on a post, it shows up here.</p>
            </motion.div>
          )}

          {hasGifts && (
            <ul className="mt-3 space-y-3">
              {stats.recent.map((g) => (
                <motion.li
                  key={g.id}
                  layout={!reduce}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="card flex items-center gap-3 p-4"
                >
                  <span className="grid size-9 shrink-0 place-items-center text-2xl" aria-hidden="true">
                    {g.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-ink">
                      <span className="font-semibold">{g.sender}</span> sent you {g.name}
                    </p>
                    <time className="text-xs text-ink-faint" dateTime={new Date(g.created_at).toISOString()}>
                      {timeAgo(g.created_at)}
                    </time>
                  </div>
                </motion.li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
