import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2.5 sm:bottom-6 sm:right-6"
    >
      {toasts.map((toast) => {
        const toneClasses =
          toast.tone === 'success'
            ? 'border-emerald-400/35 bg-[#0A1722]/95 text-emerald-100'
            : toast.tone === 'error'
              ? 'border-rose-400/40 bg-[#1B101D]/95 text-rose-100'
              : 'border-[#55D9F5]/35 bg-[#0C172B]/95 text-slate-100';

        const Icon =
          toast.tone === 'success' ? CheckCircle2 : toast.tone === 'error' ? AlertCircle : Info;
        const iconColor =
          toast.tone === 'success'
            ? 'text-emerald-300'
            : toast.tone === 'error'
              ? 'text-rose-300'
              : 'text-[#55D9F5]';

        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-xl backdrop-blur-md ${toneClasses}`}
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">{toast.title}</p>
              {toast.description && (
                <p className="mt-0.5 text-xs leading-relaxed text-slate-300">{toast.description}</p>
              )}
            </div>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => onDismiss(toast.id)}
              className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#55D9F5]"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
