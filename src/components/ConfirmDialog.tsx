import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onCancel, open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#040812]/80 px-4 backdrop-blur-sm"
    >
      <div className="ql-panel-accent w-full max-w-md rounded-2xl p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          {destructive && (
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-500/15 text-rose-300">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </div>
          )}
          <div>
            <h2 id="confirm-dialog-title" className="font-display text-lg font-bold text-white">
              {title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">{description}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="min-h-[40px] rounded-lg border border-slate-400/25 bg-[#0D1526] px-4 py-2 text-xs font-medium text-slate-200 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#55D9F5]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`min-h-[40px] rounded-lg px-4 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
              destructive
                ? 'bg-rose-500 text-white hover:bg-rose-400 focus-visible:outline-rose-400'
                : 'bg-[#55D9F5] text-[#06111D] hover:bg-[#7DE4FA] focus-visible:outline-[#55D9F5]'
            }`}
          >
            {busy ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
