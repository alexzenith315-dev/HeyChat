import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchProfile, updateBio, updateAvatar, updateName, MAX_BIO, readUploadDataUrl } from '../lib/db';
import Avatar from './Avatar';

const SIZE = 128;

// Crops to a centered square and re-encodes as JPEG, lowering quality until the
// data URL fits the storage cap.
export default function EditProfile({ viewer, onSaved }) {
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState(viewer.name);
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState(null);
  const [savedBio, setSavedBio] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const remaining = MAX_BIO - bio.length;

  useEffect(() => {
    let alive = true;
    fetchProfile(viewer.id, viewer.id)
      .then((p) => {
        if (!alive || !p) return;
        setName(p.name);
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

  async function saveProfile(e) {
    e.preventDefault();
    setError('');
    setStatus('');
    setSaving(true);
    try {
      const trimmedName = name.trim();
      const trimmedBio = bio.trim();
      if (trimmedName !== viewer.name) {
        const saved = await updateName(viewer.id, trimmedName);
        onSaved?.({ name: saved });
      }
      if (trimmedBio !== savedBio) {
        await updateBio(viewer.id, trimmedBio);
      }
      setSavedBio(trimmedBio);
      setBio(trimmedBio);
      setName(trimmedName);
      setStatus('Profile saved.');
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
      const dataUrl = await readUploadDataUrl(file, 'image');
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
      <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-4 sm:pt-8" aria-label="Loading profile">
        <div className="card h-64 animate-pulse bg-ink/[0.03]" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-4 sm:pt-8">
      <button onClick={() => navigate(-1)} className="focus-ring mb-4 rounded-full px-3 py-1.5 text-sm text-ink-secondary hover:bg-ink/5">
        ← Back
      </button>
      <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Edit profile</h1>

      {loaded && (
        <>
          <section className="card mt-6 p-5">
            <h2 className="font-semibold text-ink">Picture</h2>
            <div className="mt-4 flex items-center gap-4">
              <Avatar name={name} src={avatar} size="size-16" text="text-2xl" />
              <div className="flex flex-wrap gap-2">
                <label className="focus-ring cursor-pointer rounded-full bg-primary px-4 py-2 text-sm font-medium text-white">
                  Choose image
                  <input type="file" accept="image/*" onChange={pickAvatar} disabled={saving} className="sr-only" />
                </label>
                {avatar && (
                  <button
                    onClick={removeAvatar}
                    disabled={saving}
                    className="focus-ring rounded-full border border-hairline bg-canvas px-4 py-2 text-sm font-medium text-ink-secondary disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </section>

          <form onSubmit={saveProfile} className="card mt-4 space-y-5 p-5">
            <div>
              <label htmlFor="display-name" className="font-semibold text-ink">Display name</label>
              <input
                id="display-name"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 24))}
                maxLength={24}
                className="focus-ring mt-3 w-full rounded-xl border border-hairline bg-canvas px-4 py-3 text-base text-ink outline-none focus:border-primary"
              />
            </div>
            <div>
              <label htmlFor="bio" className="font-semibold text-ink">Bio</label>
              <textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, MAX_BIO))}
                rows={3}
                placeholder="A line about you"
                className="focus-ring mt-3 w-full resize-none rounded-xl border border-hairline bg-canvas px-4 py-3 text-base text-ink placeholder:text-ink-faint outline-none focus:border-primary"
              />
              <p className={`mt-2 text-right text-sm tabular-nums ${remaining <= 20 ? 'text-accent-orange' : 'text-ink-faint'}`} aria-live="polite">
                {remaining} left
              </p>
            </div>
            <button
              disabled={saving || (name.trim() === viewer.name && bio.trim() === savedBio)}
              className="focus-ring w-full rounded-full bg-primary py-3 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          </form>

          {status && <p role="status" className="mt-4 text-sm text-ink-muted">{status}</p>}
          {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
        </>
      )}
    </div>
  );
}
