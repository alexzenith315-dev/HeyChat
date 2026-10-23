export default function Avatar({ name, src, size = 'size-9', text = 'text-sm' }) {
  if (src) {
    return <img src={src} alt="" className={`${size} shrink-0 rounded-full object-cover`} />;
  }
  return (
    <div className={`grid ${size} shrink-0 place-items-center rounded-full bg-accent-sky ${text} font-bold text-white`} aria-hidden="true">
      {(name || '?').slice(0, 1).toUpperCase()}
    </div>
  );
}
