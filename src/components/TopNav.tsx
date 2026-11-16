import type { ScreenRoute } from '../types/questlab';

interface TopNavProps {
  currentScreen: ScreenRoute;
  onNavigate: (screen: ScreenRoute) => void;
  onEnterUniverse: () => void;
  onStartPrimaryMission: () => void;
}

export function TopNav({
  currentScreen,
  onNavigate,
  onEnterUniverse,
  onStartPrimaryMission,
}: TopNavProps) {
  const isLanding = currentScreen === 'landing';

  return (
    <header className="sticky top-0 z-30 border-b border-slate-400/15 bg-[#080D19]/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-3 sm:gap-8 sm:px-6 sm:py-3.5">
        {/* Zone 1: Single-element Brand Wordmark */}
        <button
          type="button"
          onClick={() => onNavigate('landing')}
          className="font-display shrink-0 whitespace-nowrap text-sm font-bold tracking-[0.1em] text-[#F1F5F9] transition-colors hover:text-[#55D9F5] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#55D9F5] sm:text-lg sm:tracking-[0.14em]"
        >
          QUESTLAB
        </button>

        {/* Zone 2: Concise single-line navigation links */}
        {isLanding ? (
          <nav
            aria-label="Landing navigation"
            className="hidden items-center gap-6 text-sm font-medium text-slate-300 md:flex"
          >
            <a
              href="#worlds-preview"
              className="shrink-0 whitespace-nowrap transition-colors hover:text-[#55D9F5] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#55D9F5]"
            >
              Worlds
            </a>
            <a
              href="#how-it-works"
              className="shrink-0 whitespace-nowrap transition-colors hover:text-[#55D9F5] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#55D9F5]"
            >
              Mechanics
            </a>
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className="shrink-0 whitespace-nowrap transition-colors hover:text-[#55D9F5] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#55D9F5]"
            >
              Dashboard
            </button>
          </nav>
        ) : (
          <nav
            aria-label="Universe navigation"
            className="flex items-center gap-2.5 text-xs font-medium sm:gap-6 sm:text-sm"
          >
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              aria-current={currentScreen === 'dashboard' ? 'page' : undefined}
              className={`shrink-0 whitespace-nowrap border-b-2 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#55D9F5] ${
                currentScreen === 'dashboard'
                  ? 'border-[#55D9F5] text-[#55D9F5]'
                  : 'border-transparent text-slate-300 hover:text-white'
              }`}
            >
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => onNavigate('missions')}
              aria-current={currentScreen === 'missions' ? 'page' : undefined}
              className={`shrink-0 whitespace-nowrap border-b-2 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#55D9F5] ${
                currentScreen === 'missions'
                  ? 'border-[#55D9F5] text-[#55D9F5]'
                  : 'border-transparent text-slate-300 hover:text-white'
              }`}
            >
              Worlds
            </button>
          </nav>
        )}

        {/* Zone 3: Single primary action */}
        <div className="shrink-0">
          {isLanding ? (
            <button
              type="button"
              onClick={onEnterUniverse}
              className="shrink-0 whitespace-nowrap rounded-lg bg-[#55D9F5] px-3.5 py-2 text-xs font-semibold text-[#06111D] transition-colors hover:bg-[#7DE4FA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#55D9F5] sm:px-4 sm:text-sm"
            >
              Enter the Universe
            </button>
          ) : currentScreen === 'quiz' ? (
            <button
              type="button"
              onClick={() => onNavigate('briefing')}
              className="shrink-0 whitespace-nowrap rounded-lg border border-slate-400/25 bg-[#0D1526] px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:border-[#55D9F5]/50 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#55D9F5] sm:px-4 sm:py-2 sm:text-sm"
            >
              Exit Quiz
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartPrimaryMission}
              className="shrink-0 whitespace-nowrap rounded-lg bg-[#55D9F5] px-2.5 py-1.5 text-xs font-semibold text-[#06111D] transition-colors hover:bg-[#7DE4FA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#55D9F5] sm:px-4 sm:py-2 sm:text-sm"
            >
              Grammar Vault
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
