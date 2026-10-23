import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { fetchProfile, updateBio, updateAvatar, MAX_BIO, MAX_AVATAR_BYTES } from '../lib/db';
import Avatar from './Avatar';

const SIZE = 128;

// Crops to a centered square and re-encodes as JPEG, lowering quality until the
// data URL fits the storage cap.
function toAvatarDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Pick an image file.'));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, SIZE, SIZE);
      for (const q of [0.9, 0.8, 0.7, 0.6, 0.5, 0.4]) {
        const out = canvas.toDataURL('image/jpeg', q);
        if (out.length <= MAX_AVATAR_BYTES) return resolve(out);
      }
      reject(new Error('That picture is too detailed. Try a simpler one.'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That picture could not be read.'));
    };
    img.src = url;
  });
}

export default function Settings({ viewer }) {
  const [loaded, setLoaded] = useState(false);
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState(null);
  const [savedBio, setSavedBio] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const reduce = useReducedMotion();
  const remaining = MAX_BIO - bio.length;

  useEffect(() => {
    let alive = true;
    fetchProfile(viewer.id, viewer.id)
      .then((p) => {
        if (!alive || !p) return;
        setBio(p.bio);
        setSavedBio(p.bio);
        setAvatar(p.avatar);
        setLoaded(true);
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [viewer.id]);

  async function saveBio(e) {
    e.preventDefault();
    setError('');
    setStatus('');
    setSaving(true);
    try {
      await updateBio(viewer.id, bio);
      setSavedBio(bio.trim());
      setBio(bio.trim());
      setStatus('Bio saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function pickAvatar(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setStatus('');
    setSaving(true);
    try {
      const dataUrl = await toAvatarDataUrl(file);
      await updateAvatar(viewer.id, dataUrl);
      setAvatar(dataUrl);
      setStatus('Picture saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeAvatar() {
    setError('');
    setStatus('');
    setSaving(true);
    try {
      await updateAvatar(viewer.id, null);
      setAvatar(null);
      setStatus('Picture removed.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!loaded && !error) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-4 sm:pt-8" aria-label="Loading settings">
        <div className="card h-64 animate-pulse bg-black/[0.03]" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-4 sm:pt-8">
      <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Settings</h1>

      {error && !loaded && (
        <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>
      )}

      {loaded && (
        <>
          <section className="card mt-6 p-5">
            <h2 className="font-semibold text-ink">Picture</h2>
            <div className="mt-4 flex items-center gap-4">
              <Avatar name={viewer.name} src={avatar} size="size-16" text="text-2xl" />
              <div className="flex flex-wrap gap-2">
                <label className="focus-ring cursor-pointer rounded-full bg-primary px-4 py-2 text-sm font-medium text-white">
                  Choose image
                  <input type="file" accept="image/*" onChange={pickAvatar} disabled={saving} className="sr-only" />
                </label>
                {avatar && (
                  <button
                    onClick={removeAvatar}
                    disabled={saving}
                    className="focus-ring rounded-full border border-hairline bg-white px-4 py-2 text-sm font-medium text-ink-secondary disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </section>

          <form onSubmit={saveBio} className="card mt-4 p-5">
            <label htmlFor="bio" className="font-semibold text-ink">Bio</label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, MAX_BIO))}
              rows={3}
              placeholder="A line about you"
              className="focus-ring mt-3 w-full resize-none rounded-xl border border-hairline bg-white px-4 py-3 text-base text-ink placeholder:text-ink-faint outline-none focus:border-primary"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={remaining <= 20 ? 'warn' : 'ok'}
                  initial={reduce ? false : { opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={`tabular-nums text-sm ${remaining <= 20 ? 'text-accent-orange' : 'text-ink-faint'}`}
                  aria-live="polite"
                >
                  {remaining} left
                </motion.span>
              </AnimatePresence>
              <button
                disabled={saving || bio.trim() === savedBio}
                className="focus-ring rounded-full bg-primary px-5 py-2 text-sm font-medium text-white transition active:scale-95 disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Save bio'}
              </button>
            </div>
          </form>

          {status && <p role="status" className="mt-4 text-sm text-ink-muted">{status}</p>}
          {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
        </>
      )}
    </div>
  );
}
