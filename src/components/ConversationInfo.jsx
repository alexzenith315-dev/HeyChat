import { useState } from 'react';
import { X, PencilSimple, UserMinus, FloppyDisk } from '@phosphor-icons/react';
import Avatar from './Avatar';

const MAX_TITLE = 60;
const MAX_DESC = 300;

export default function ConversationInfo({ conv, viewer, onClose, onChanged, onUpdate, onRemoveMember }) {
  const canEdit = !!conv.canEdit;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(conv.title ?? '');
  const [description, setDescription] = useState(conv.description ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setError('');
    const nextTitle = title.trim();
    if (!nextTitle) return setError('Give it a name.');
    setBusy(true);
    try {
      await onUpdate(conv.id, { title: nextTitle, description: description.trim() });
      setEditing(false);
      await onChanged();
    } catch (err) {
      setError(err.message || 'Could not save changes.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(member) {
    if (!window.confirm(`Remove ${member.name} from this ${conv.kind === 'channel' ? 'channel' : 'group'}?`)) return;
    setError('');
    setBusy(true);
    try {
      await onRemoveMember(conv.id, member.id);
      await onChanged();
    } catch (err) {
      setError(err.message || 'Could not remove that member.');
    } finally {
      setBusy(false);
    }
  }

  const kindLabel = conv.kind === 'channel' ? 'Channel' : 'Group';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center" role="dialog" aria-modal="true" aria-label={`${kindLabel} info`}>
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-3xl bg-canvas shadow-xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <h2 className="font-display text-lg font-bold text-ink">{kindLabel} info</h2>
          <button onClick={onClose} aria-label="Close" className="focus-ring grid size-9 place-items-center rounded-full text-ink-muted hover:bg-ink/5">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {!editing && (
            <div>
              <p className="font-display text-xl font-bold text-ink">{conv.title}</p>
              <p className="mt-2 whitespace-pre-wrap text-[15px] text-ink-secondary">
                {conv.description || (canEdit ? 'No description yet.' : 'No description.')}
              </p>
              {canEdit && (
                <button
                  onClick={() => {
                    setTitle(conv.title ?? '');
                    setDescription(conv.description ?? '');
                    setEditing(true);
                  }}
                  className="focus-ring mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white active:scale-[0.97]"
                >
                  <PencilSimple size={16} aria-hidden="true" />
                  Edit details
                </button>
              )}
            </div>
          )}

          {editing && (
            <form onSubmit={save} className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-ink-secondary">Name</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
                  className="focus-ring mt-1 w-full rounded-xl border border-hairline bg-canvas px-3.5 py-2.5 text-[15px] text-ink outline-none focus:border-primary"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink-secondary">Description</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESC))}
                  rows={3}
                  placeholder="What is this about?"
                  className="focus-ring mt-1 w-full resize-none rounded-xl border border-hairline bg-canvas px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-faint outline-none focus:border-primary"
                />
                <span className="mt-1 block text-right text-xs tabular-nums text-ink-faint">{MAX_DESC - description.length} left</span>
              </label>
              <div className="flex gap-2">
                <button type="submit" disabled={busy} className="focus-ring inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  <FloppyDisk size={16} aria-hidden="true" />
                  Save
                </button>
                <button type="button" onClick={() => setEditing(false)} className="focus-ring rounded-full px-4 py-2 text-sm text-ink-secondary hover:bg-ink/5">
                  Cancel
                </button>
              </div>
            </form>
          )}

          {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}

          <h3 className="mt-7 text-sm font-semibold text-ink-secondary">{conv.memberList?.length ?? 0} members</h3>
          <ul className="mt-2 divide-y divide-hairline">
            {(conv.memberList ?? []).map((m) => {
              const isCreator = Number(m.id) === Number(conv.createdBy);
              const isSelf = Number(m.id) === Number(viewer.id);
              return (
                <li key={m.id} className="flex items-center gap-3 py-2.5">
                  <Avatar name={m.name} src={m.avatar} size="size-9" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium text-ink">
                      {m.name}
                      {isSelf && <span className="ml-1 text-ink-faint">(you)</span>}
                    </p>
                    {isCreator && <p className="text-xs text-ink-muted">Creator</p>}
                  </div>
                  {canEdit && !isCreator && (
                    <button
                      onClick={() => remove(m)}
                      disabled={busy}
                      aria-label={`Remove ${m.name}`}
                      className="focus-ring grid size-9 place-items-center rounded-full text-ink-muted hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                    >
                      <UserMinus size={18} aria-hidden="true" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
