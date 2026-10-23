// online: green dot when the person was active in the last ~5 minutes.
function OnlineDot({ online }) {
  if (!online) return null;
  return (
    <span
      aria-label="Online"
      title="Online"
      className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full border-2 border-canvas bg-success"
    />
  );
}

export default function Avatar({ name, src, size = 'size-9', text = 'text-sm', online = false }) {
  const wrap = online ? 'relative inline-block shrink-0 rounded-full' : '';
  const dot = <OnlineDot online={online} />;
  if (src) {
    if (!online) return <img src={src} alt="" className={`${size} shrink-0 rounded-full object-cover`} />;
    return (
      <span className={wrap}>
        <img src={src} alt="" className={`${size} block rounded-full object-cover`} />
        {dot}
      </span>
    );
  }
  const circle = (
    <div className={`grid ${size} shrink-0 place-items-center rounded-full bg-accent-sky ${text} font-bold text-white`} aria-hidden="true">
      {(name || '?').slice(0, 1).toUpperCase()}
    </div>
  );
  if (!online) return circle;
  return (
    <span className={wrap}>
      {circle}
      {dot}
    </span>
  );
}
