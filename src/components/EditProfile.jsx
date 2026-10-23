import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera } from '@phosphor-icons/react';
import { fetchMe, fetchProfile, updateBio, updateAvatar, updateCover, updateEmail, updateName, MAX_BIO, readUploadDataUrl } from '../lib/db';
import Avatar from './Avatar';

const NAME_MAX = 24;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Full edit page: tappable avatar and cover photo, name, bio and email fields.
// Nothing is sent until Save; Cancel discards every staged change.
export default function EditProfile({ viewer, onSaved }) {
  const navigate = useNavigate();
  const avatarRef = useRef(null);
  const coverRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [base, setBase] = useState({ name: viewer.name, bio: '', email: '', avatar: null, cover: null });
  const [name, setName] = useState(viewer.name);
  const [bio, setBio] = useState('');
  const [email, setEmail] = useState('');
  const [avatar, setAvatar] = useState(null);
  const [cover, setCover] = useState(null);
  const [pendingAvatar, setPendingAvatar] = useState(undefined); // undefined = unchanged
  const [pendingCover, setPendingCover] = useState(undefined);
  const [status, setStatus] = useState(null); // { kind: 'ok' | 'err', text }
  const [loadError, setLoadError] = useState('');
  const [fieldErr, setFieldErr] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchMe(), fetchProfile(viewer.id)])
      .then(([me, p]) => {
        if (!alive) return;
        const next = {
          name: p?.name ?? me?.name ?? viewer.name,
          bio: p?.bio ?? '',
          email: me?.email ?? '',
          avatar: p?.avatar ?? null,
          cover: p?.cover ?? null,
        };
        setBase(next);
        setName(next.name);
        setBio(next.bio);
        setEmail(next.email);
        setAvatar(next.avatar);
        setCover(next.cover);
        setLoaded(true);
      })
      .catch((e) => alive && setLoadError(e.message || 'Could not load your profile.'));
    return () => {
      alive = false;
    };
  }, [viewer.id, viewer.name]);

  const dirty =
    name.trim() !== base.name ||
    bio.trim() !== base.bio ||
    email.trim().toLowerCase() !== base.email ||
    pendingAvatar !== undefined ||
    pendingCover !== undefined;

  async function pickImage(e, kind) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setStatus(null);
    try {
      const dataUrl = await readUploadDataUrl(file, 'image');
      if (kind === 'avatar') {
        setAvatar(dataUrl);
        setPendingAvatar(dataUrl);
      } else {
        setCover(dataUrl);
        setPendingCover(dataUrl);
      }
    } catch (err) {
      setStatus({ kind: 'err', text: err.message });
    }
  }

  function removeImage(kind) {
    if (kind === 'avatar') {
      setAvatar(null);
      setPendingAvatar(null);
    } else {
      setCover(null);
      setPendingCover(null);
    }
  }

  function validate() {
    const errs = {};
    const n = name.trim();
    if (!n) errs.name = 'Enter a display name.';
    else if (n.length > NAME_MAX) errs.name = `Keep it under ${NAME_MAX} characters.`;
    if (bio.trim().length > MAX_BIO) errs.bio = `Keep your bio under ${MAX_BIO} characters.`;
    const em = email.trim();
    if (em && !EMAIL_RE.test(em)) errs.email = 'Enter a valid email address.';
    return errs;
  }

  async function save(e) {
    e.preventDefault();
    setStatus(null);
    const errs = validate();
    setFieldErr(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const trimmedName = name.trim();
      const trimmedBio = bio.trim();
      const trimmedEmail = email.trim().toLowerCase();
      const changed = {};
      if (trimmedName !== base.name) {
        changed.name = await updateName(viewer.id, trimmedName);
      }
      if (trimmedBio !== base.bio) await updateBio(viewer.id, trimmedBio);
      if (trimmedEmail !== base.email) await updateEmail(trimmedEmail);
      if (pendingAvatar !== undefined) {
        await updateAvatar(viewer.id, pendingAvatar);
        changed.avatar = pendingAvatar;
      }
      if (pendingCover !== undefined) {
        await updateCover(pendingCover);
        changed.cover = pendingCover;
      }
      // Re-read from the server so the form shows what was actually stored.
      const [me, p] = await Promise.all([fetchMe(), fetchProfile(viewer.id)]);
      const next = {
        name: p?.name ?? me?.name ?? trimmedName,
        bio: p?.bio ?? '',
        email: me?.email ?? '',
        avatar: p?.avatar ?? null,
        cover: p?.cover ?? null,
      };
      setBase(next);
      setName(next.name);
      setBio(next.bio);
      setEmail(next.email);
      setAvatar(next.avatar);
      setCover(next.cover);
      setPendingAvatar(undefined);
      setPendingCover(undefined);
      setFieldErr({});
      onSaved?.({ name: next.name, avatar: next.avatar, cover: next.cover, email: next.email });
      setStatus({ kind: 'ok', text: 'Profile saved.' });
    } catch (err) {
      setStatus({ kind: 'err', text: err.message || 'Could not save. Try again.' });
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    navigate(-1);
  }

  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-4 sm:pt-8">
        <p role="alert" className="text-sm text-danger">{loadError}</p>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-4 sm:pt-8" aria-label="Loading profile">
        <div className="card h-64 animate-pulse bg-ink/[0.03]" />
      </div>
    );
  }

  const inputClass =
    'focus-ring mt-2 w-full rounded-xl border border-hairline bg-canvas px-4 py-3 text-base text-ink placeholder:text-ink-faint outline-none focus:border-primary';

  return (
    <div className="mx-auto w-full max-w-xl pb-28 sm:pt-6">
      <form onSubmit={save} noValidate className="card overflow-hidden">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            className="focus-ring rounded-full px-3 py-1.5 text-sm font-medium text-ink-secondary hover:bg-ink/5 disabled:opacity-50"
          >
            Cancel
          </button>
          <h1 className="font-display text-base font-bold text-ink">Edit profile</h1>
          <button
            type="submit"
            disabled={saving || !dirty}
            className="focus-ring rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        {/* Cover photo: tappable */}
        <div className="relative">
          <button
            type="button"
            onClick={() => coverRef.current?.click()}
            disabled={saving}
            aria-label="Change cover photo"
            className="focus-ring group relative block h-32 w-full overflow-hidden bg-accent-sky/35 sm:h-40"
          >
            {cover && <img src={cover} alt="" className="absolute inset-0 size-full object-cover" />}
            <span className="absolute inset-0 grid place-items-center bg-black/0 transition-colors group-hover:bg-black/20">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white">
                <Camera size={16} aria-hidden="true" /> {cover ? 'Change cover' : 'Add cover'}
              </span>
            </span>
          </button>
          <input ref={coverRef} type="file" accept="image/*" onChange={(e) => pickImage(e, 'cover')} className="sr-only" tabIndex={-1} />

          {/* Avatar: tappable, overlaps the cover */}
          <div className="px-4">
            <div className="-mt-12 inline-block">
              <button
                type="button"
                onClick={() => avatarRef.current?.click()}
                disabled={saving}
                aria-label="Change profile picture"
                className="focus-ring group relative block rounded-full border-4 border-canvas"
              >
                <Avatar name={name || viewer.name} src={avatar} size="size-24" text="text-3xl" />
                <span className="absolute inset-0 grid place-items-center rounded-full bg-black/0 transition-colors group-hover:bg-black/30">
                  <Camera size={22} className="text-white opacity-0 group-hover:opacity-100" aria-hidden="true" />
                </span>
              </button>
              <input ref={avatarRef} type="file" accept="image/*" onChange={(e) => pickImage(e, 'avatar')} className="sr-only" tabIndex={-1} />
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              <button type="button" onClick={() => avatarRef.current?.click()} disabled={saving} className="focus-ring rounded-full border border-hairline px-3 py-1 font-medium text-ink-secondary hover:bg-ink/5 disabled:opacity-50">
                Change picture
              </button>
              {avatar && (
                <button type="button" onClick={() => removeImage('avatar')} disabled={saving} className="focus-ring rounded-full px-3 py-1 font-medium text-ink-muted hover:bg-ink/5 disabled:opacity-50">
                  Remove picture
                </button>
              )}
              {cover && (
                <button type="button" onClick={() => removeImage('cover')} disabled={saving} className="focus-ring rounded-full px-3 py-1 font-medium text-ink-muted hover:bg-ink/5 disabled:opacity-50">
                  Remove cover
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Fields */}
        <div className="space-y-5 px-4 pb-5 pt-5">
          <div>
            <label htmlFor="display-name" className="text-sm font-semibold text-ink">Display name</label>
            <input
              id="display-name"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
              maxLength={NAME_MAX}
              autoComplete="nickname"
              aria-invalid={!!fieldErr.name}
              aria-describedby={fieldErr.name ? 'display-name-err' : undefined}
              className={inputClass}
            />
            <div className="mt-1 flex justify-between text-xs text-ink-faint">
              {fieldErr.name ? <span id="display-name-err" className="text-danger">{fieldErr.name}</span> : <span />}
              <span className="tabular-nums">{name.length}/{NAME_MAX}</span>
            </div>
          </div>

          <div>
            <label htmlFor="bio" className="text-sm font-semibold text-ink">Bio</label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, MAX_BIO))}
              rows={3}
              placeholder="A line about you"
              aria-invalid={!!fieldErr.bio}
              className={`${inputClass} resize-none`}
            />
            <div className="mt-1 flex justify-between text-xs text-ink-faint">
              {fieldErr.bio ? <span className="text-danger">{fieldErr.bio}</span> : <span />}
              <span className={`tabular-nums ${MAX_BIO - bio.length <= 20 ? 'text-accent-orange' : ''}`} aria-live="polite">
                {MAX_BIO - bio.length} left
              </span>
            </div>
          </div>

          <div>
            <label htmlFor="email" className="text-sm font-semibold text-ink">Email</label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-invalid={!!fieldErr.email}
              className={inputClass}
            />
            {fieldErr.email && <p className="mt-1 text-xs text-danger">{fieldErr.email}</p>}
            <p className="mt-1 text-xs text-ink-faint">Only you can see this.</p>
          </div>
        </div>

        {status && (
          <p role={status.kind === 'err' ? 'alert' : 'status'} className={`mx-4 mb-4 rounded-xl px-4 py-3 text-sm ${status.kind === 'err' ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'}`}>
            {status.text}
          </p>
        )}
      </form>
    </div>
  );
}
