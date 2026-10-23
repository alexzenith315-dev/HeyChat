import { useEffect, useRef, useState } from 'react';
import { DotsThree } from '@phosphor-icons/react';
import { blockUser, unblockUser, reportUser } from '../lib/db';

// Three-dot menu with Block / Unblock and Report for one other person.
// Every action is a real server call; the server decides what is allowed.
export default function BlockReportMenu({ userId, userName, blocked, onBlockChange }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [reported, setReported] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  async function toggleBlock() {
    setError('');
    setBusy(true);
    try {
      if (blocked) await unblockUser(userId);
      else await blockUser(userId);
      onBlockChange?.(!blocked);
      setOpen(false);
    } catch (e) {
      setError(e.message || 'Could not update that block.');
    } finally {
      setBusy(false);
    }
  }

  async function sendReport(e) {
    e.preventDefault();
    setError('');
    const text = reason.trim();
    if (!text) {
      setError('Tell us what happened.');
      return;
    }
    setBusy(true);
    try {
      await reportUser(userId, text);
      setReported(true);
      setReporting(false);
      setReason('');
      setOpen(false);
    } catch (err) {
      setError(err.message || 'Could not send the report.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={`More options for ${userName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          setReporting(false);
          setError('');
        }}
        className="focus-ring grid size-9 place-items-center rounded-full border border-hairline bg-canvas text-ink hover:bg-ink/5"
      >
        <DotsThree size={20} weight="bold" aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-xl border border-hairline bg-canvas shadow-lg">
          {!reporting ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={toggleBlock}
                disabled={busy}
                className="focus-ring block w-full px-4 py-3 text-left text-sm text-ink hover:bg-ink/5 disabled:opacity-50"
              >
                {blocked ? `Unblock ${userName}` : `Block ${userName}`}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => setReporting(true)}
                className="focus-ring block w-full px-4 py-3 text-left text-sm text-danger hover:bg-ink/5"
              >
                Report {userName}
              </button>
            </>
          ) : (
            <form onSubmit={sendReport} className="p-4">
              <label htmlFor={`report-${userId}`} className="text-sm font-medium text-ink">
                What happened?
              </label>
              <textarea
                id={`report-${userId}`}
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, 1000))}
                rows={3}
                className="focus-ring mt-2 w-full rounded-lg border border-hairline bg-canvas p-2 text-sm text-ink"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setReporting(false)} className="focus-ring rounded-full px-3 py-1.5 text-sm text-ink-muted hover:bg-ink/5">
                  Back
                </button>
                <button type="submit" disabled={busy} className="focus-ring rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                  Send report
                </button>
              </div>
            </form>
          )}
          {error && <p role="alert" className="px-4 pb-3 text-sm text-danger">{error}</p>}
        </div>
      )}
      {reported && !open && <span role="status" className="sr-only">Report sent</span>}
    </div>
  );
}
