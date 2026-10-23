import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Heart, Gift, ChatCircle, ShareNetwork } from '@phosphor-icons/react';
import { EMOJIS, toggleLike, toggleReaction, addComment, deletePost, deleteComment, followUser, unfollowUser } from '../lib/db';
import { timeAgo } from '../lib/time';
import Avatar from './Avatar';
import GiftSheet from './GiftSheet';

const spring = { type: 'spring', stiffness: 500, damping: 26 };

let floatId = 0;

export default function Post({ post, viewer, onChanged, onCoinsChanged }) {
  const [open, setOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [floats, setFloats] = useState([]);
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = `${window.location.origin}/?post=${post.id}`;
    try {
      if (navigator.share) await navigator.share({ title: `${post.author} on Crew`, url });
      else await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* share cancelled */
    }
  }
  const reduce = useReducedMotion();
  const canDelete = viewer.id === post.user_id || viewer.isAdmin;

  async function react(emoji) {
    setErr('');
    try {
      await toggleReaction(post.id, viewer.id, emoji);
      onChanged();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function like() {
    setErr('');
    try {
      await toggleLike(post.id, viewer.id, post.user_id);
      onChanged();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function comment(e) {
    e.preventDefault();
    setErr('');
    try {
      await addComment(post.id, viewer.id, draft);
      setDraft('');
      onChanged();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  async function toggleFollow() {
    setErr('');
    try {
      if (post.followed) await unfollowUser(viewer.id, post.user_id);
      else await followUser(viewer.id, post.user_id, post.id);
      onChanged();
    } catch (e) {
      setErr(e.message);
    }
  }

  function onGiftSent({ emoji, tier }) {
    setGiftOpen(false);
    const id = ++floatId;
    setFloats((f) => [...f, { id, emoji, big: tier === 'luxury' }]);
    onCoinsChanged?.();
    onChanged();
  }

  async function removePost() {
    if (!window.confirm('Delete this post for everyone?')) return;
    await deletePost(post.id);
    onChanged();
  }

  async function removeComment(id) {
    await deleteComment(id);
    onChanged();
  }

  return (
    <motion.article
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={spring}
      className="card relative p-4"
    >
      <header className="flex items-center gap-3">
        <Link to={`/u/${post.user_id}`} aria-label={`View ${post.author}'s profile`} className="focus-ring rounded-full">
          <Avatar name={post.author} src={post.author_avatar} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link to={`/u/${post.user_id}`} className="focus-ring truncate rounded font-semibold text-ink hover:underline">
              {post.author}
            </Link>
            {post.user_id !== viewer.id && (
              <motion.button
                whileTap={reduce ? undefined : { scale: 0.86 }}
                onClick={toggleFollow}
                aria-pressed={post.followed}
                aria-label={`${post.followed ? 'Unfollow' : 'Follow'} ${post.author}`}
                className={`focus-ring shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  post.followed ? 'border-hairline bg-canvas text-ink-muted' : 'border-primary bg-primary/10 text-primary-text'
                }`}
              >
                {post.followed ? 'Unfollow' : 'Follow'}
              </motion.button>
            )}
          </div>
          <time className="text-xs text-ink-faint" dateTime={new Date(post.created_at).toISOString()}>
            @{post.author.toLowerCase().replace(/\s+/g, '')} · {timeAgo(post.created_at)}
          </time>
        </div>
        {canDelete && (
          <button
            onClick={removePost}
            aria-label="Delete post"
            className="focus-ring rounded-md px-2 py-1 text-xs text-ink-faint hover:text-danger"
          >
            Delete
          </button>
        )}
      </header>

      {post.body && (
        <p className="mt-3 whitespace-pre-wrap break-words text-[17px] leading-relaxed text-ink">{post.body}</p>
      )}
      {post.image && (
        <img src={post.image} alt="" loading="lazy" className="mt-3 max-h-96 w-full rounded-xl object-cover" />
      )}

      <div className="mt-3 flex items-center gap-1 border-t border-hairline pt-2">
        {(() => {
          const likes = post.reactions.like;
          return (
            <motion.button
              whileTap={reduce ? undefined : { scale: 0.86 }}
              onClick={like}
              aria-pressed={!!likes?.mine}
              aria-label={`Like, ${likes?.count ?? 0} so far`}
              className={`focus-ring inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm transition-colors hover:bg-ink/5 ${
                likes?.mine ? 'text-primary-text' : 'text-ink-secondary'
              }`}
            >
              <Heart size={20} weight={likes?.mine ? 'fill' : 'regular'} aria-hidden="true" />
              <motion.span key={likes?.count ?? 0} initial={reduce ? false : { y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={spring} className="tabular-nums">
                {likes?.count ?? 0}
              </motion.span>
            </motion.button>
          );
        })()}
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`Comments, ${post.comments.length} so far`}
          className="focus-ring inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm text-ink-secondary hover:bg-ink/5"
        >
          <ChatCircle size={20} aria-hidden="true" />
          <span className="tabular-nums">{post.comments.length}</span>
        </button>
        <button
          onClick={share}
          aria-label="Share post"
          className="focus-ring inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm text-ink-secondary hover:bg-ink/5"
        >
          <ShareNetwork size={20} aria-hidden="true" />
          <span className="text-xs">{copied ? 'Copied' : ''}</span>
        </button>
        {post.user_id !== viewer.id && (
          <motion.button
            whileTap={reduce ? undefined : { scale: 0.86 }}
            onClick={() => setGiftOpen(true)}
            aria-label={`Send a gift to ${post.author}`}
            className="focus-ring ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm text-ink-secondary hover:bg-ink/5"
          >
            <Gift size={20} aria-hidden="true" />
            <span className="text-xs">Gift</span>
          </motion.button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {EMOJIS.map((emoji) => {
          const r = post.reactions[emoji];
          return (
            <motion.button
              key={emoji}
              whileTap={reduce ? undefined : { scale: 0.86 }}
              onClick={() => react(emoji)}
              aria-pressed={!!r?.mine}
              aria-label={`React ${emoji}, ${r?.count ?? 0} so far`}
              className={`focus-ring inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors ${
                r?.mine ? 'border-primary bg-primary/10 text-primary-text' : 'border-hairline bg-canvas text-ink-secondary'
              }`}
            >
              <span>{emoji}</span>
              <motion.span key={r?.count ?? 0} initial={reduce ? false : { y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={spring} className="tabular-nums">
                {r?.count ?? 0}
              </motion.span>
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="thread"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring}
            className="overflow-hidden"
          >
            <ul className="mt-4 space-y-3 border-t border-hairline pt-4">
              {post.comments.length === 0 && <li className="text-sm text-ink-faint">No replies yet. Be first.</li>}
              {post.comments.map((c) => (
                <li key={c.id} className="group flex gap-2.5 text-sm">
                  <Avatar name={c.author} src={c.author_avatar} size="size-7" text="text-xs" />
                  <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-ink">{c.author}</span>
                    <span className="text-xs text-ink-faint">{timeAgo(c.created_at)}</span>
                    {(c.user_id === viewer.id || viewer.isAdmin) && (
                      <button onClick={() => removeComment(c.id)} className="focus-ring ml-auto text-xs text-ink-faint hover:text-danger">
                        Delete
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 break-words text-ink-secondary">{c.body}</p>
                  </div>
                </li>
              ))}
            </ul>
            <form onSubmit={comment} className="mt-3 flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={280}
                placeholder="Add a reply"
                aria-label="Write a comment"
                className="focus-ring min-w-0 flex-1 rounded-full border border-hairline bg-canvas px-4 py-2 text-base outline-none focus:border-primary"
              />
              <button
                disabled={!draft.trim()}
                className="focus-ring rounded-full bg-ink px-4 text-sm font-medium text-canvas disabled:opacity-40"
              >
                Send
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
      {err && <p role="alert" className="mt-2 text-sm text-danger">{err}</p>}

      <AnimatePresence>
        {floats.map((f) => (
          <motion.span
            key={f.id}
            aria-hidden="true"
            initial={{ opacity: 0, y: 0, scale: 0.6 }}
            animate={{ opacity: [0, 1, 1, 0], y: f.big ? -120 : -70, scale: f.big ? 1.6 : 1.1 }}
            transition={{ duration: reduce ? 0.2 : f.big ? 1.6 : 1.1, ease: 'easeOut', times: [0, 0.2, 0.7, 1] }}
            onAnimationComplete={() => setFloats((list) => list.filter((x) => x.id !== f.id))}
            className={`pointer-events-none absolute right-6 bottom-16 select-none ${f.big ? 'text-5xl' : 'text-3xl'}`}
          >
            {f.emoji}
          </motion.span>
        ))}
      </AnimatePresence>

      <AnimatePresence>
        {giftOpen && (
          <GiftSheet
            key="gift"
            post={post}
            viewer={viewer}
            onClose={() => setGiftOpen(false)}
            onSent={onGiftSent}
          />
        )}
      </AnimatePresence>
    </motion.article>
  );
}
