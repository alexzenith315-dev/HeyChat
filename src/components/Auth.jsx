import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { login, signup } from '../lib/db';

const spring = { type: 'spring', stiffness: 420, damping: 34 };

function Field({ label, ...props }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-secondary">{label}</span>
      <input
        {...props}
        required
        className="w-full rounded-lg border border-hairline bg-canvas px-3.5 py-3 text-base text-ink outline-none transition focus:border-primary focus:shadow-focus"
      />
    </label>
  );
}

export default function Auth({ onAuthed, firstRun }) {
  const [mode, setMode] = useState(firstRun ? 'signup' : 'login');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [invite, setInvite] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const reduce = useReducedMotion();
  const isSignup = mode === 'signup';

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (isSignup) {
        const user = await signup({ name, password, invite });
        if (user.isFirst && !reduce) confetti({ particleCount: 90, spread: 70, origin: { y: 0.4 } });
        onAuthed(user);
      } else {
        onAuthed(await login({ name, password }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <motion.div
        initial={reduce ? false : { y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={spring}
        className="w-full max-w-sm"
      >
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid size-16 rotate-[-6deg] place-items-center rounded-2xl bg-accent-pink text-3xl font-bold text-white shadow-soft">
            ✳
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight text-ink">HeyChat</h1>
          <p className="mt-2 text-ink-muted">
            {firstRun ? 'Nobody’s here yet. The first account becomes the owner.' : 'Friends only. Say what’s up.'}
          </p>
        </div>

        {!firstRun && (
          <div className="relative mb-5 grid grid-cols-2 rounded-full bg-ink/5 p-1">
            <motion.span
              layoutId="auth-tab"
              transition={spring}
              className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-canvas shadow-soft"
              style={{ x: isSignup ? '100%' : '0%' }}
            />
            {['login', 'signup'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError('');
                }}
                className={`relative z-10 rounded-full py-2 text-sm font-medium transition-colors focus-ring ${
                  mode === m ? 'text-ink' : 'text-ink-muted'
                }`}
              >
                {m === 'login' ? 'Log in' : 'Sign up'}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={submit} className="card space-y-4 p-5">
          <Field label="Display name" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} autoComplete="username" />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isSignup ? 'new-password' : 'current-password'}
          />
          <AnimatePresence initial={false}>
            {isSignup && !firstRun && (
              <motion.div
                key="invite"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={spring}
                className="overflow-hidden"
              >
                <Field
                  label="Invite code"
                  value={invite}
                  onChange={(e) => setInvite(e.target.value.toUpperCase())}
                  maxLength={12}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {error && (
              <motion.p
                role="alert"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={busy}
            className="focus-ring w-full rounded-full bg-primary py-3 font-medium text-white transition active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? 'One sec…' : isSignup ? (firstRun ? 'Create owner account' : 'Join the crew') : 'Let me in'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
