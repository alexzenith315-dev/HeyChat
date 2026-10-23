// Socket client. One shared connection per tab, reconnects with backoff, and exposes
// `isLive()` so callers can drop their 3s poll while the socket is healthy.
//
// Fallback contract: if the socket is closed or never opened, isLive() is false and
// the caller's polling interval keeps running, so nothing waits on the socket.
import { getToken } from './db';

const listeners = new Set();
let ws = null;
let live = false;
let retry = 0;
let retryTimer = null;
let stopped = false;

function wsUrl(token) {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
}

function emit(event) {
  for (const fn of listeners) fn(event);
}

function connect() {
  const token = getToken();
  if (!token || stopped) return;
  try {
    ws = new WebSocket(wsUrl(token));
  } catch {
    live = false;
    return;
  }
  ws.onopen = () => {
    live = true;
    retry = 0;
    emit({ type: 'open' });
  };
  ws.onmessage = (e) => {
    let msg;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    emit(msg);
  };
  ws.onclose = () => {
    live = false;
    ws = null;
    emit({ type: 'closed' });
    if (stopped) return;
    // Exponential backoff, capped at 30s. Polling keeps the UI current meanwhile.
    const wait = Math.min(30_000, 1000 * 2 ** retry);
    retry += 1;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, wait);
  };
  ws.onerror = () => {};
}

export function startSocket() {
  stopped = false;
  if (!ws) connect();
}

export function stopSocket() {
  stopped = true;
  clearTimeout(retryTimer);
  ws?.close();
  ws = null;
  live = false;
}

export function isLive() {
  return live;
}

export function onSocketEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function sendSocketEvent(payload) {
  if (live && ws?.readyState === 1) ws.send(JSON.stringify(payload));
}
