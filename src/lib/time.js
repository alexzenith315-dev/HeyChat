const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' });

export function timeAgo(ms, now = Date.now()) {
  const diff = Math.max(0, now - Number(ms));
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return rtf.format(-Math.round(day / 7), 'week').replace('last week', '1w ago');
}
