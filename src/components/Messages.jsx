import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X, Plus, UsersThree, Megaphone, ChatCircle } from '@phosphor-icons/react';
import { ensureMessagesSchema, listConversations, listUsers, createConversation } from '../lib/messages';
import { timeAgo } from '../lib/time';
import Avatar from './Avatar';

const spring = { type: 'spring', stiffness: 420, damping: 34 };
const KIND_LABEL = { dm: 'Direct', group: 'Group', channel: 'Channel' };
// Contacts = one-to-one chats (kind dm). All shows everything.
const TABS = [
  { id: 'all', label: 'All' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'group', label: 'Group' },
  { id: 'channel', label: 'Channel' },
];
function matchesTab(c, tab) {
  if (tab === 'all') return true;
  if (tab === 'contacts') return c.kind === 'dm';
  return c.kind === tab;
}

export default function Messages({ viewer }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [composing, setComposing] = useState(false);
  const [tab, setTab] = useState('all');
  const reduce = useReducedMotion();
  const navigate = useNavigate();

  async function refresh() {
    try {
      await ensureMessagesSchema();
      setItems(await listConversations(viewer.id));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    refresh();
  }, [viewer.id]);

  const visible = (items ?? []).filter((c) => matchesTab(c, tab));

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-4 sm:pt-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Messages</h1>
        <button
          onClick={() => setComposing((v) => !v)}
          aria-expanded={composing}
          className="focus-ring flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-medium text-canvas active:scale-[0.96] transition"
        >
          {composing ? <X size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
          {composing ? 'Close' : 'New'}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {composing && (
          <motion.div
            key="compose"
            initial={reduce ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={spring}
            className="overflow-hidden"
          >
            <NewConversation
              viewer={viewer}
              onCreated={(id) => navigate(`/messages/${id}`)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}

      {items === null && !error && (
        <div className="mt-6 space-y-3" aria-label="Loading conversations">
          {[0, 1].map((i) => (
            <div key={i} className="card h-16 animate-pulse bg-ink/[0.03]" />
          ))}
        </div>
      )}

      <div role="tablist" aria-label="Filter conversations" className="mt-5 flex gap-1 overflow-x-auto rounded-full bg-canvas-soft p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`focus-ring relative flex-1 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
              tab === t.id ? 'text-ink' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {tab === t.id && (
              <motion.span
                layoutId="msg-tab"
                transition={reduce ? { duration: 0 } : spring}
                className="absolute inset-0 rounded-full bg-canvas shadow-soft"
              />
            )}
            <span className="relative">{t.label}</span>
          </button>
        ))}
      </div>

      {items?.length === 0 && (
        <div className="mt-14 text-center">
          <p className="text-xl font-bold text-ink">No conversations yet.</p>
          <p className="mt-1 text-ink-muted">Start one with a friend, a group, or a channel.</p>
        </div>
      )}

      {items?.length > 0 && visible.length === 0 && (
        <p className="mt-10 text-center text-ink-muted">Nothing in {TABS.find((t) => t.id === tab).label.toLowerCase()} yet.</p>
      )}

      {visible.length > 0 && (
        <ul className="mt-6 space-y-2">
          {visible.map((c) => (
            <motion.li key={c.id} layout={!reduce} transition={spring}>
              <Link
                to={`/messages/${c.id}`}
                className="focus-ring card flex items-center gap-3 p-4 transition active:scale-[0.99]"
              >
                <Avatar name={c.title} src={c.avatar} text="text-sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-ink">{c.title}</span>
                    <span className="shrink-0 text-xs text-ink-faint">{KIND_LABEL[c.kind]}</span>
                    {c.muted && <span className="shrink-0 text-xs text-ink-faint">Muted</span>}
                  </div>
                  <p className="truncate text-sm text-ink-muted">{c.lastBody || 'No messages yet'}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {c.lastAt && <time className="text-xs text-ink-faint">{timeAgo(c.lastAt)}</time>}
                  {c.unread > 0 && (
                    <span
                      aria-label={`${c.unread} unread`}
                      className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-5 text-white tabular-nums"
                    >
                      {c.unread > 99 ? '99+' : c.unread}
                    </span>
                  )}
                </div>
              </Link>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}

const TYPES = [
  { id: 'dm', label: 'Direct message', hint: 'One person', Icon: ChatCircle },
  { id: 'group', label: 'Group', hint: 'Several people, everyone talks', Icon: UsersThree },
  { id: 'channel', label: 'Channel', hint: 'Only you post, others read', Icon: Megaphone },
];

function NewConversation({ viewer, onCreated }) {
  const [kind, setKind] = useState('dm');
  const [users, setUsers] = useState(null);
  const [picked, setPicked] = useState([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    let alive = true;
    listUsers(viewer.id)
      .then((u) => alive && setUsers(u))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [viewer.id]);

  function togglePick(id) {
    setError('');
    setPicked((cur) => {
      if (kind === 'dm') return cur[0] === id ? [] : [id];
      return cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    });
  }

  function chooseKind(next) {
    setKind(next);
    setPicked((cur) => (next === 'dm' ? cur.slice(0, 1) : cur));
    setError('');
  }

  async function create(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const id = await createConversation({
        kind,
        title: kind === 'dm' ? null : title,
        creatorId: viewer.id,
        memberIds: picked,
      });
      onCreated(id);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const needsTitle = kind !== 'dm';
  const count = picked.length;
  const label = busy
    ? 'Opening…'
    : kind === 'dm'
      ? 'Open chat'
      : 'Create ' + (kind === 'group' ? 'group' : 'channel');

  return (
    <form onSubmit={create} className="card mt-4 space-y-4 p-4">
      <div role="radiogroup" aria-label="Conversation type" className="grid grid-cols-3 gap-1 rounded-full bg-canvas-soft p-1">
        {TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={kind === t.id}
            onClick={() => chooseKind(t.id)}
            className="focus-ring relative rounded-full px-2 py-1.5 text-sm font-medium"
          >
            {kind === t.id && (
              <motion.span
                layoutId="msg-kind"
                transition={reduce ? { duration: 0 } : spring}
                className="absolute inset-0 rounded-full bg-canvas shadow-soft"
              />
            )}
            <span className={`relative ${kind === t.id ? 'text-ink' : 'text-ink-muted'}`}>{t.label}</span>
          </button>
        ))}
      </div>
      <p className="text-sm text-ink-muted">{TYPES.find((t) => t.id === kind).hint}</p>

      <AnimatePresence initial={false}>
        {needsTitle && (
          <motion.label
            key="title"
            initial={reduce ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={spring}
            className="block overflow-hidden"
          >
            <span className="text-sm font-medium text-ink-secondary">Name</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 40))}
              placeholder={kind === 'group' ? 'Weekend crew' : 'announcements'}
              className="focus-ring mt-1 w-full rounded-xl border border-hairline bg-canvas px-4 py-2.5 text-base text-ink placeholder:text-ink-faint outline-none focus:border-primary"
            />
          </motion.label>
        )}
      </AnimatePresence>

      <div>
        <p className="text-sm font-medium text-ink-secondary">
          {kind === 'dm' ? 'Who with?' : 'Who to add?'}
          {kind !== 'dm' && count > 0 && <span className="ml-1 text-ink-faint">({count})</span>}
        </p>
        {users === null && !error && <p className="mt-2 text-sm text-ink-faint">Loading people…</p>}
        {users?.length === 0 && <p className="mt-2 text-sm text-ink-faint">No one else is here yet.</p>}
        <ul className="mt-2 flex flex-wrap gap-2">
          {users?.map((u) => {
            const on = picked.includes(u.id);
            return (
              <li key={u.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => togglePick(u.id)}
                  className={`focus-ring flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition active:scale-[0.96] ${
                    on ? 'border-primary bg-primary/10 text-ink' : 'border-hairline bg-canvas text-ink-secondary'
                  }`}
                >
                  <Avatar name={u.name} src={u.avatar} size="size-7" text="text-xs" />
                  {u.name}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <button
        type="submit"
        disabled={busy || picked.length === 0 || (needsTitle && !title.trim())}
        className="focus-ring w-full rounded-full bg-primary py-3 font-medium text-white transition active:scale-[0.98] disabled:opacity-40"
      >
        {label}
      </button>
    </form>
  );
}
