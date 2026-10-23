import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BrowserRouter, Routes, Route, NavLink, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import { ChatCircle, House, MagnifyingGlass, Plus, Play, UserCircle } from '@phosphor-icons/react';
import Discover from './components/Discover';
import { ensureSchema, getUserById, api, getToken, setToken } from './lib/db';
import Auth from './components/Auth';
import Feed from './components/Feed';
import EditProfile from './components/EditProfile';
import Messages from './components/Messages';
import Conversation from './components/Conversation';
import Notifications from './components/Notifications';
import Profile from './components/Profile';
import FollowList from './components/FollowList';
import Settings from './components/Settings';
import Wallet from './components/Wallet';
import Creator from './components/Creator';
import Admin from './components/Admin';
import ErrorBoundary from './components/ErrorBoundary';

function Shell({ user, onLogout, onUserChanged }) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const isReelsTab = pathname === '/' && new URLSearchParams(search).get('tab') === 'reels';
  const showFab = !isReelsTab && !pathname.startsWith('/settings') && !/^\/messages\/.+/.test(pathname);
  const navItems = [
    { label: 'Home', to: '/', icon: House, match: (p, s) => p === '/' && !new URLSearchParams(s).get('tab') },
    { label: 'Discover', to: '/discover', icon: MagnifyingGlass, match: (p) => p.startsWith('/discover') },
    { label: 'Reels', to: '/?tab=reels', icon: Play, match: (p, s) => p === '/' && new URLSearchParams(s).get('tab') === 'reels' },
    { label: 'Chat', to: '/messages', icon: ChatCircle, match: (p) => p.startsWith('/messages') },
    { label: 'Profile', to: `/u/${user.id}`, icon: UserCircle, match: (p) => p === `/u/${user.id}` },
  ];

  return (
    <div className="min-h-dvh">
      <main className="pb-20 pt-[env(safe-area-inset-top)]">
        <Routes>
          <Route path="/" element={<ErrorBoundary><Feed viewer={user} /></ErrorBoundary>} />
          <Route path="/discover" element={<ErrorBoundary><Discover viewer={user} /></ErrorBoundary>} />
          <Route path="/wallet" element={<ErrorBoundary><Wallet viewer={user} /></ErrorBoundary>} />
          <Route path="/creator" element={<ErrorBoundary><Creator viewer={user} /></ErrorBoundary>} />
          <Route path="/notifications" element={<ErrorBoundary><Notifications viewer={user} /></ErrorBoundary>} />
          <Route path="/messages" element={<ErrorBoundary><Messages viewer={user} /></ErrorBoundary>} />
          <Route path="/messages/:id" element={<ErrorBoundary><Conversation viewer={user} /></ErrorBoundary>} />
          <Route path="/u/:id" element={<ErrorBoundary><Profile viewer={user} /></ErrorBoundary>} />
          <Route path="/u/:id/:kind" element={<ErrorBoundary><FollowList viewer={user} /></ErrorBoundary>} />
          <Route path="/settings" element={<ErrorBoundary><Settings viewer={user} onLogout={onLogout} onUserChanged={onUserChanged} /></ErrorBoundary>} />
          <Route path="/invites" element={<Navigate to="/settings" replace />} />
          <Route path="/profile/edit" element={<ErrorBoundary><EditProfile viewer={user} onSaved={onUserChanged} /></ErrorBoundary>} />
          <Route path="/admin" element={user.isAdmin ? <ErrorBoundary><Admin viewer={user} /></ErrorBoundary> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-canvas/95 backdrop-blur-xl" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto flex h-16 max-w-xl items-center justify-around px-2">
          {navItems.map((it) => {
            const active = it.match ? it.match(pathname, search) : false;
            const Icon = it.icon;
            return (
              <Link
                key={it.label}
                to={it.to}
                aria-label={it.label}
                aria-current={active ? 'page' : undefined}
                className={`focus-ring flex min-w-14 flex-col items-center gap-0.5 rounded-xl px-2 py-1 text-[11px] font-medium ${active ? 'text-ink' : 'text-ink-faint'}`}
              >
                <Icon size={22} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
                <span>{it.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
      {showFab && (
        <button
          type="button"
          onClick={() => (pathname === '/' ? window.dispatchEvent(new Event('hc:compose')) : navigate('/?compose=1'))}
          aria-label="Create post"
          className="focus-ring fixed right-4 z-30 grid size-14 place-items-center rounded-full bg-primary text-white shadow-[0_8px_24px_rgba(0,0,0,0.25)] active:scale-95"
          style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom) + 1rem)' }}
        >
          <Plus size={26} weight="bold" aria-hidden="true" />
        </button>
      )}
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
        const status = await api('GET', '/api/setup');
        setFirstRun(!!status.firstRun);
        if (getToken()) {
          const u = await getUserById();
          if (u) setUser(u);
        }
      } catch (e) {
        setDbError(e.message);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  function handleAuthed(u) {
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
            <Shell user={user} onLogout={() => { setToken(null); setUser(null); }} onUserChanged={(u) => setUser((prev) => ({ ...prev, ...u }))} />
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
