import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { BrowserRouter, Routes, Route, NavLink, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import { Bell, Gear, ChatCircle, Coins, ChartBar, ShieldCheck } from '@phosphor-icons/react';
import { query } from './lib/folkdb';
import { ensureSchema, getUserById, fetchUnreadCount, fetchWallet } from './lib/db';
import { ensureMessagesSchema, totalUnread } from './lib/messages';
import Auth from './components/Auth';
import Feed from './components/Feed';
import Invites from './components/Invites';
import Messages from './components/Messages';
import Conversation from './components/Conversation';
import Notifications from './components/Notifications';
import Profile from './components/Profile';
import Settings from './components/Settings';
import Wallet from './components/Wallet';
import Creator from './components/Creator';
import Admin from './components/Admin';

const SESSION_KEY = 'crew-feed-session';
const spring = { type: 'spring', stiffness: 420, damping: 34 };

function Shell({ user, onLogout }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  const [unread, setUnread] = useState(0);
  const [coins, setCoins] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchUnreadCount(user.id), ensureMessagesSchema().then(() => totalUnread(user.id))])
      .then(([n, m]) => alive && setUnread(n + m))
      .catch(() => {});
    fetchWallet(user.id)
      .then((w) => alive && setCoins(w.coins))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user.id, pathname]);

  function refreshCoins() {
    fetchWallet(user.id)
      .then((w) => setCoins(w.coins))
      .catch(() => {});
  }
  const tabs = [
    { to: '/', label: 'Feed' },
    { to: '/messages', label: 'Messages' },
    ...(user.isAdmin ? [{ to: '/invites', label: 'Invites' }] : []),
  ];

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    onLogout();
    navigate('/');
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-hairline bg-canvas-soft/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
          <span className="font-display text-xl font-bold tracking-tight text-ink">HeyChat</span>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-ink-muted sm:inline">{user.name}</span>
            <Link
              to="/wallet"
              aria-label={coins == null ? 'Wallet' : `Wallet, ${coins} coins`}
              className="focus-ring flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-semibold tabular-nums text-ink hover:bg-black/5"
            >
              <Coins size={18} aria-hidden="true" />
              <span>{coins == null ? '…' : coins.toLocaleString('en-US')}</span>
            </Link>
            <Link
              to="/notifications"
              aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
              className="focus-ring relative grid size-9 place-items-center rounded-full text-ink-secondary hover:bg-black/5"
            >
              <Bell size={20} weight={unread ? 'fill' : 'regular'} aria-hidden="true" />
              {unread > 0 && (
                <motion.span
                  key={unread}
                  initial={reduce ? false : { scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={spring}
                  className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-white tabular-nums"
                >
                  {unread > 99 ? '99+' : unread}
                </motion.span>
              )}
            </Link>
            {user.isAdmin && (
              <Link
                to="/admin"
                aria-label="Admin"
                className="focus-ring grid size-9 place-items-center rounded-full text-ink-secondary hover:bg-black/5"
              >
                <ShieldCheck size={20} aria-hidden="true" />
              </Link>
            )}
            <Link
              to="/creator"
              aria-label="Creator"
              className="focus-ring grid size-9 place-items-center rounded-full text-ink-secondary hover:bg-black/5"
            >
              <ChartBar size={20} aria-hidden="true" />
            </Link>
            <Link
              to="/settings"
              aria-label="Settings"
              className="focus-ring grid size-9 place-items-center rounded-full text-ink-secondary hover:bg-black/5"
            >
              <Gear size={20} aria-hidden="true" />
            </Link>
            <button onClick={logout} className="focus-ring rounded-full px-3 py-1.5 text-sm text-ink-secondary hover:bg-black/5">
              Log out
            </button>
          </div>
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Feed viewer={user} onCoinsChanged={refreshCoins} />} />
          <Route path="/wallet" element={<Wallet viewer={user} />} />
          <Route path="/creator" element={<Creator viewer={user} />} />
          <Route path="/notifications" element={<Notifications viewer={user} onRead={() => setUnread(0)} />} />
          <Route path="/messages" element={<Messages viewer={user} />} />
          <Route path="/messages/:id" element={<Conversation viewer={user} />} />
          <Route path="/u/:id" element={<Profile viewer={user} />} />
          <Route path="/settings" element={<Settings viewer={user} />} />
          <Route path="/invites" element={user.isAdmin ? <Invites viewer={user} /> : <Navigate to="/" replace />} />
          <Route path="/admin" element={user.isAdmin ? <Admin viewer={user} /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
        <div className="relative flex rounded-full border border-hairline bg-white/90 p-1 shadow-soft backdrop-blur-xl">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.to === '/'} className="focus-ring relative rounded-full px-5 py-2 text-sm font-medium">
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="nav-pill"
                      transition={reduce ? { duration: 0 } : spring}
                      className="absolute inset-0 rounded-full bg-ink"
                    />
                  )}
                  <span className={`relative ${isActive ? 'text-white' : 'text-ink-secondary'}`}>{t.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [firstRun, setFirstRun] = useState(false);
  const [dbError, setDbError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        await ensureSchema();
        const { rows } = await query('SELECT COUNT(*) AS n FROM users');
        setFirstRun(Number(rows[0].n) === 0);
        const id = Number(localStorage.getItem(SESSION_KEY));
        if (id) {
          const u = await getUserById(id);
          if (u) setUser(u);
          else localStorage.removeItem(SESSION_KEY);
        }
      } catch (e) {
        setDbError(e.message);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  function handleAuthed(u) {
    localStorage.setItem(SESSION_KEY, String(u.id));
    setUser(u);
  }

  if (!ready) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <p className="animate-pulse text-ink-faint">Loading the crew…</p>
      </div>
    );
  }

  if (dbError) {
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <div>
          <p className="text-xl font-bold text-ink">Couldn’t reach the feed.</p>
          <p className="mt-2 text-ink-muted">{dbError}</p>
          <button onClick={() => location.reload()} className="focus-ring mt-5 rounded-full bg-primary px-5 py-2 text-white">
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <AnimatePresence mode="wait" initial={false}>
        {user ? (
          <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Shell user={user} onLogout={() => setUser(null)} />
          </motion.div>
        ) : (
          <motion.div key="auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Auth onAuthed={handleAuthed} firstRun={firstRun} />
          </motion.div>
        )}
      </AnimatePresence>
    </BrowserRouter>
  );
}
