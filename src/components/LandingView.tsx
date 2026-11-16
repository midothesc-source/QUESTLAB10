import { ArrowRight, Lock, Unlock } from 'lucide-react';
import { SUBJECT_WORLDS } from '../data/worlds';
import { ResilientImage } from './ResilientImage';

interface LandingViewProps {
  hasExistingProgress: boolean;
  totalXp: number;
  level: number;
  onEnterUniverse: () => void;
  onPreviewMission: () => void;
}

export function LandingView({
  hasExistingProgress,
  totalXp,
  level,
  onEnterUniverse,
  onPreviewMission,
}: LandingViewProps) {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6 lg:pt-14">
      {/* Hero Section */}
      <section className="grid items-stretch gap-8 lg:grid-cols-12 lg:gap-10">
        <div className="flex flex-col justify-center lg:col-span-6">
          <p className="text-sm font-medium tracking-wide text-[#55D9F5]">
            Gamified Learning Universe
          </p>
          <h1
            className="font-display mt-3 text-[clamp(2.25rem,4.2vw,3.5rem)] font-bold leading-[1.08] tracking-tight text-[#F8FAFC]"
            style={{ textWrap: 'balance' }}
          >
            Explore living subject worlds through missions that reward mastery.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-300">
            QUESTLAB turns core academic concepts into focused interactive briefings and challenges.
            Analyze real problems, unlock guided hints, earn experience points, and build steady
            momentum across worlds.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={onEnterUniverse}
              className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-lg bg-[#55D9F5] px-6 py-3 text-sm font-semibold text-[#06111D] shadow-[0_0_24px_-4px_rgba(85,217,245,0.5)] transition-colors hover:bg-[#7DE4FA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#55D9F5]"
            >
              <span>Enter the Universe</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={onPreviewMission}
              className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-lg border border-slate-400/25 bg-[#0D1526]/80 px-5 py-3 text-sm font-medium text-slate-200 transition-colors hover:border-[#A68AFF]/60 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A68AFF]"
            >
              Open The Grammar Vault
            </button>
          </div>

          {hasExistingProgress && (
            <p className="mt-4 text-xs text-slate-400 font-mono-tabular">
              Saved local progress · Level {level} · {totalXp} XP
            </p>
          )}
        </div>

        <div className="lg:col-span-6">
          <div className="ql-panel-accent relative h-full min-h-[260px] overflow-hidden rounded-2xl">
            <ResilientImage
              src="/src/assets/images/hero_universe_vault_1794854621692.jpg"
              alt="QUESTLAB orbital observatory and futuristic knowledge sanctuary"
              fallbackTitle="QUESTLAB Observatory"
              className="h-full w-full object-cover lg:min-h-[380px]"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#080D19]/90 via-[#080D19]/25 to-transparent"
            />
            <div className="absolute inset-x-0 bottom-0 p-6">
              <p className="text-xs font-medium text-[#55D9F5]">
                First Playable Mission · Sector 01
              </p>
              <p className="font-display mt-1 text-xl font-semibold text-white">
                The Grammar Vault: Adjective &amp; Adverb Phrases
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Subject Worlds Preview Strip */}
      <section id="worlds-preview" className="mt-16 border-t border-slate-400/15 pt-12">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-white">
              Four Knowledge Worlds
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Start in English Grammar today while Mathematics, Science, and Business prepare to
              open.
            </p>
          </div>
        </div>

        <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {SUBJECT_WORLDS.map((world) => {
            const isUnlocked = world.status === 'unlocked';
            return (
              <div
                key={world.id}
                className={`flex flex-col justify-between rounded-xl p-5 transition-colors ${
                  isUnlocked ? 'ql-panel-accent' : 'ql-panel opacity-85'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                    <span>{world.sectorLabel}</span>
                    <span
                      className={`inline-flex items-center gap-1.5 font-medium ${
                        isUnlocked ? 'text-[#55D9F5]' : 'text-slate-400'
                      }`}
                    >
                      {isUnlocked ? (
                        <Unlock className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {isUnlocked ? 'Unlocked' : 'Locked'}
                    </span>
                  </div>

                  <h3 className="font-display mt-3 text-lg font-semibold text-white">
                    {world.name}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-300">
                    {world.headline}
                  </p>
                </div>

                <div className="mt-5 border-t border-slate-400/10 pt-3 text-xs text-slate-400">
                  {world.unlockRequirement}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* How Missions Work */}
      <section id="how-it-works" className="mt-16 border-t border-slate-400/15 pt-12">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-white">
          Mission Loop
        </h2>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          <div className="ql-panel rounded-xl p-6">
            <p className="font-mono-tabular text-xs font-medium text-[#55D9F5]">01. Briefing</p>
            <h3 className="font-display mt-2 text-lg font-semibold text-white">
              Clear Learning Objectives
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Review the exact grammar rules, duration, and XP rewards before launching into active
              questions.
            </p>
          </div>
          <div className="ql-panel rounded-xl p-6">
            <p className="font-mono-tabular text-xs font-medium text-[#A68AFF]">
              02. Guided Verification
            </p>
            <h3 className="font-display mt-2 text-lg font-semibold text-white">
              Hints &amp; Explanations
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Request targeted hints on demand and read clear syntactic breakdowns after every single
              attempt.
            </p>
          </div>
          <div className="ql-panel rounded-xl p-6">
            <p className="font-mono-tabular text-xs font-medium text-[#55D9F5]">
              03. Persistent Mastery
            </p>
            <h3 className="font-display mt-2 text-lg font-semibold text-white">
              XP, Streaks &amp; Replay
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Earn +30 XP for accurate answers and +5 XP for participation, saved automatically in
              your browser.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
