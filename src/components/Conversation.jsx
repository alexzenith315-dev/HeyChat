import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, BellSlash, Bell, ImageSquare, Info, X, PaperPlaneRight } from '@phosphor-icons/react';
import {
  ensureMessagesSchema,
  getConversation,
  fetchMessages,
  markConversationRead,
  setMuted,
  sendMessage,
  updateConversation,
  removeConversationMember,
  MAX_MESSAGE,
} from '../lib/messages';
import Avatar from './Avatar';
import ConversationInfo from './ConversationInfo';
import { readUploadDataUrl } from '../lib/db';

const POLL_MS = 3000;
const spring = { type: 'spring', stiffness: 420, damping: 34 };

export default function Conversation({ viewer }) {
  const { id } = useParams();
  const convId = Number(id);
  const [conv, setConv] = useState(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [messages, setMessages] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [sendError, setSendError] = useState('');
  const [body, setBody] = useState('');
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [muteBusy, setMuteBusy] = useState(false);
  const [muteError, setMuteError] = useState('');
  const listRef = useRef(null);
  const reduce = useReducedMotion();

  const load = useCallback(async () => {
    const rows = await fetchMessages(convId);
    setMessages(rows);
    setLoadError('');
    await markConversationRead(convId, viewer.id).catch(() => {});
    return rows;
  }, [convId, viewer.id]);

  useEffect(() => {
    let alive = true;
    setConv(null);
    setMessages(null);
    (async () => {
      try {
        await ensureMessagesSchema();
        const c = await getConversation(convId, viewer.id);
        if (!alive) return;
        if (!c) {
          setLoadError('This conversation is gone or you are not in it.');
          return;
        }
        setConv(c);
        await load();
      } catch (e) {
        if (alive) setLoadError(e.message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [convId, viewer.id, load]);

  // Poll for new messages. Errors here are quiet: a dropped poll shouldn't
  // wipe the thread, and the next tick retries.
  useEffect(() => {
    if (!conv) return;
    const timer = setInterval(() => {
      load().catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [conv, load]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
  }, [messages?.length]);

  async function pickImage(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSendError('');
    try {
      setImage(await readUploadDataUrl(file, 'image'));
    } catch (err) {
      setSendError(err.message);
    }
  }

  async function send(e) {
    e.preventDefault();
    if (busy) return;
    setSendError('');
    setBusy(true);
    try {
      await sendMessage(convId, viewer.id, body, image);
      setBody('');
      setImage(null);
      await load();
    } catch (err) {
      setSendError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleMute() {
    if (!conv) return;
    const next = !conv.muted;
    setMuteError('');
    setMuteBusy(true);
    setConv({ ...conv, muted: next });
    try {
      await setMuted(convId, viewer.id, next);
    } catch (err) {
      setConv((c) => c && { ...c, muted: !next });
      setMuteError(err.message);
    } finally {
      setMuteBusy(false);
    }
  }

  const isGroup = conv?.kind !== 'dm';
  const canPost = conv && (conv.kind !== 'channel' || conv.createdBy === viewer.id);
  const remaining = MAX_MESSAGE - body.length;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col">
      <header className="sticky top-[57px] z-10 flex items-center gap-3 border-b border-hairline bg-canvas-soft/80 px-4 py-3 backdrop-blur-xl">
        <Link to="/messages" aria-label="Back to messages" className="focus-ring grid size-9 place-items-center rounded-full text-ink-secondary hover:bg-ink/5">
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg font-bold tracking-tight text-ink">{conv?.title ?? 'Conversation'}</h1>
          {conv && (
            <p className="truncate text-xs text-ink-faint">
              {conv.kind === 'dm' ? 'Direct message' : conv.kind === 'group' ? conv.members.join(', ') : 'Channel'}
            </p>
          )}
        </div>
        {conv && conv.kind !== 'dm' && (
          <button
            onClick={() => setInfoOpen(true)}
            className="focus-ring flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-ink-secondary hover:bg-ink/5 active:scale-[0.96] transition"
          >
            <Info size={16} aria-hidden="true" />
            Info
          </button>
        )}
        {conv && (
          <button
            onClick={toggleMute}
            disabled={muteBusy}
            aria-pressed={conv.muted}
            className="focus-ring flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-ink-secondary hover:bg-ink/5 active:scale-[0.96] transition"
          >
            {conv.muted ? <BellSlash size={16} aria-hidden="true" /> : <Bell size={16} aria-hidden="true" />}
            {conv.muted ? 'Muted' : 'Mute'}
          </button>
        )}
      </header>

      {muteError && <p role="alert" className="px-4 pt-3 text-sm text-danger">{muteError}</p>}

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 pb-4 pt-4" style={{ maxHeight: '70dvh' }}>
        {loadError && <p role="alert" className="text-sm text-danger">{loadError}</p>}

        {messages === null && !loadError && (
          <div className="space-y-3" aria-label="Loading messages">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 w-2/3 animate-pulse rounded-xl bg-ink/[0.03]" />
            ))}
          </div>
        )}

        {messages?.length === 0 && (
          <div className="mt-10 text-center">
            <p className="text-xl font-bold text-ink">No messages yet.</p>
            <p className="mt-1 text-ink-muted">Say hello to start the thread.</p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages?.map((m) => {
            const mine = m.senderId === viewer.id;
            return (
              <motion.div
                key={m.id}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={spring}
                className={`flex gap-2 ${mine ? 'justify-end' : 'justify-start'}`}
              >
                {!mine && isGroup && <Avatar name={m.sender} src={m.senderAvatar} size="size-7" text="text-xs" />}
                <div className={`max-w-[80%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                  {!mine && isGroup && <span className="mb-0.5 px-1 text-xs font-medium text-ink-muted">{m.sender}</span>}
                  <div className={`overflow-hidden rounded-2xl ${mine ? 'bg-primary text-white' : 'border border-hairline bg-canvas text-ink'}`}>
                    {m.image && <img src={m.image} alt="Shared picture" className="block max-h-72 w-full object-cover" />}
                    {m.body && <p className="whitespace-pre-wrap break-words px-3.5 py-2 text-[15px] leading-relaxed">{m.body}</p>}
                  </div>
                  <time className="mt-0.5 px-1 text-[11px] text-ink-faint" dateTime={new Date(m.createdAt).toISOString()}>
                    {new Date(m.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </time>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <div className="sticky bottom-0 border-t border-hairline bg-canvas-soft/90 px-4 pb-24 pt-3 backdrop-blur-xl">
        {!conv && !loadError && <p className="text-sm text-ink-faint">Loading…</p>}
        {conv && !canPost && (
          <p className="text-center text-sm text-ink-muted">Only the channel creator can post here.</p>
        )}
        {conv && canPost && (
          <form onSubmit={send} className="space-y-2">
            <AnimatePresence initial={false}>
              {image && (
                <motion.div
                  key="preview"
                  initial={reduce ? false : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={spring}
                  className="relative w-fit overflow-hidden rounded-xl border border-hairline"
                >
                  <img src={image} alt="Picture to send" className="block h-20 w-auto" />
                  <button
                    type="button"
                    onClick={() => setImage(null)}
                    aria-label="Remove picture"
                    className="focus-ring absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/60 text-white"
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="flex items-end gap-2">
              <label className="focus-ring grid size-10 shrink-0 cursor-pointer place-items-center rounded-full text-ink-secondary hover:bg-ink/5" aria-label="Attach a picture">
                <ImageSquare size={20} aria-hidden="true" />
                <input type="file" accept="image/*" onChange={pickImage} className="sr-only" />
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, MAX_MESSAGE))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) send(e);
                }}
                rows={1}
                placeholder="Write a message"
                aria-label="Message"
                className="focus-ring max-h-32 min-h-10 flex-1 resize-none rounded-2xl border border-hairline bg-canvas px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-faint outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={busy || (!body.trim() && !image)}
                aria-label="Send"
                className="focus-ring grid size-10 shrink-0 place-items-center rounded-full bg-primary text-white transition active:scale-[0.9] disabled:opacity-40"
              >
                <PaperPlaneRight size={18} weight="fill" aria-hidden="true" />
              </button>
            </div>
            {body.length > MAX_MESSAGE - 20 && (
              <p className={`px-1 text-right text-xs tabular-nums ${remaining <= 0 ? 'text-danger' : 'text-accent-orange'}`}>{remaining} left</p>
            )}
            {sendError && <p role="alert" className="px-1 text-sm text-danger">{sendError}</p>}
          </form>
        )}
      </div>

      {infoOpen && conv && conv.kind !== 'dm' && (
        <ConversationInfo
          conv={conv}
          viewer={viewer}
          onClose={() => setInfoOpen(false)}
          onChanged={load}
          onUpdate={updateConversation}
          onRemoveMember={removeConversationMember}
        />
      )}
    </div>
  );
}
