import { Download, Share, X } from 'lucide-react';
import { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        aria-label="Install QuestLab App"
        className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#55D9F5]/40 bg-[#0D1526] px-2.5 py-1.5 text-[11px] font-semibold text-[#55D9F5] transition-colors hover:border-[#55D9F5] hover:bg-[#55D9F5]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#55D9F5] sm:px-3 sm:py-2 sm:text-xs"
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          aria-label="Install QuestLab on iOS"
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#A68AFF]/40 bg-[#0D1526] px-2.5 py-1.5 text-[11px] font-semibold text-[#A68AFF] transition-colors hover:border-[#A68AFF] hover:bg-[#A68AFF]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A68AFF] sm:px-3 sm:py-2 sm:text-xs"
        >
          <Share className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Install</span>
        </button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          >
            <div className="w-full max-w-sm rounded-2xl border border-slate-400/20 bg-[#0d1117] p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <h3 id="ios-install-title" className="font-display text-lg font-semibold text-white">
                  Install QuestLab on iOS
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close install instructions"
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ol className="mt-4 space-y-2 text-sm text-slate-300">
                <li>1. Tap the <strong>Share</strong> icon in your Safari toolbar.</li>
                <li>2. Scroll down and select <strong>Add to Home Screen</strong>.</li>
                <li>3. Tap <strong>Add</strong> to launch QuestLab full-screen.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-lg bg-[#55D9F5] py-2 text-sm font-semibold text-[#06111D] transition-colors hover:bg-[#7DE4FA]"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
