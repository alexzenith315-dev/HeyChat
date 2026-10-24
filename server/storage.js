// Media uploads: the client still sends files as base64 data URLs, but the server
// uploads the decoded file to Supabase Storage and stores only the public URL.
import crypto from 'crypto';

export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
const BUCKET = process.env.SUPABASE_MEDIA_BUCKET || 'media';

const ALLOWED = {
  image: { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' },
  video: { 'video/mp4': 'mp4', 'video/webm': 'webm' },
};

// Parses "data:<mime>;base64,<data>". Returns null when the shape is wrong.
function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const m = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const buffer = Buffer.from(m[2], 'base64');
  return { mime, buffer };
}

// Checks type and size before anything is uploaded. Throws a message the user can read.
// kind: 'image' or 'video'. Returns the parsed file.
export function checkMedia(dataUrl, kind, { tooBigMsg = 'That file is too large (30 MB max).' } = {}) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    const err = new Error(kind === 'video' ? 'Videos must be mp4 or webm.' : 'Pictures must be png, jpeg, gif or webp.');
    err.status = 400;
    err.userFacing = true;
    throw err;
  }
  if (!ALLOWED[kind][parsed.mime]) {
    const err = new Error(kind === 'video' ? 'Videos must be mp4 or webm.' : 'Pictures must be png, jpeg, gif or webp.');
    err.status = 400;
    err.userFacing = true;
    throw err;
  }
  if (parsed.buffer.length === 0 || parsed.buffer.length > MAX_UPLOAD_BYTES) {
    const err = new Error(tooBigMsg);
    err.status = 400;
    err.userFacing = true;
    throw err;
  }
  return parsed;
}

// Uploads an already-checked file to Supabase Storage and returns its public URL.
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The bucket must be public-read.
export async function uploadMedia(dataUrl, kind) {
  const { mime, buffer } = checkMedia(dataUrl, kind);
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('Media storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');

  const ext = ALLOWED[kind][mime];
  const day = new Date().toISOString().slice(0, 10);
  const path = `${kind}s/${day}/${crypto.randomUUID()}.${ext}`;

  const res = await fetch(`${base}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      'Content-Type': mime,
      'x-upsert': 'false',
    },
    body: buffer,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Media upload failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`;
}

// Null stays null (clearing an avatar or cover). Anything else is uploaded and the URL returned.
export async function storeMedia(dataUrl, kind) {
  if (dataUrl === null || dataUrl === undefined || dataUrl === '') return null;
  return uploadMedia(dataUrl, kind);
}
