import { ArrowLeft, Clock, Play, Sparkles, Target, Trophy } from 'lucide-react';
import type { MissionAttemptRecord, MissionDefinition } from '../types/questlab';
import { ResilientImage } from './ResilientImage';

interface MissionBriefingViewProps {
  mission: MissionDefinition;
  previousRecord?: MissionAttemptRecord;
  onStartMission: () => void;
  onBackToWorlds: () => void;
}

export function MissionBriefingView({
  mission,
  previousRecord,
  onStartMission,
  onBackToWorlds,
}: MissionBriefingViewProps) {
  const maxXp = mission.questions.length * mission.xpPerCorrect;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-10">
      <button
        type="button"
        onClick={onBackToWorlds}
        className="inline-flex min-h-[40px] items-center gap-2 text-sm font-medium text-slate-300 transition-colors hover:text-[#55D9F5] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#55D9F5]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        <span>Back to Mission Worlds</span>
      </button>

      <div className="mt-5 grid gap-8 lg:grid-cols-12">
        {/* Main Briefing Column */}
        <section className="ql-panel overflow-hidden rounded-2xl lg:col-span-7">
          <div className="relative h-52 w-full overflow-hidden sm:h-60">
            <ResilientImage
              src={mission.imageSrc}
              alt={mission.imageAlt}
              fallbackTitle={mission.title}
              className="h-full w-full object-cover"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0A1120] via-[#0A1120]/30 to-transparent"
            />
            <div className="absolute bottom-4 left-6 right-6">
              <p className="text-xs font-medium text-[#55D9F5]">
                {mission.subject}
                <span className="mx-2 text-slate-400" aria-hidden="true">
                  ·
                </span>
                <span className="text-slate-300">{mission.topic}</span>
              </p>
              <h1 className="font-display mt-1 text-3xl font-bold tracking-tight text-white">
                {mission.title}
              </h1>
            </div>
          </div>

          <div className="p-6">
            <p className="text-sm leading-relaxed text-slate-300">{mission.summary}</p>

            <h2 className="font-display mt-6 text-lg font-semibold text-white">
              Mission Objectives
            </h2>
            <ol className="mt-3 space-y-3">
              {mission.objectives.map((objective, idx) => (
                <li key={objective} className="flex items-start gap-3 text-sm text-slate-200">
                  <span className="font-mono-tabular mt-0.5 shrink-0 text-xs font-semibold text-[#55D9F5]">
                    0{idx + 1}.
                  </span>
                  <span className="leading-relaxed">{objective}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Parameters & Launch Column */}
        <aside className="ql-panel-accent flex flex-col justify-between rounded-2xl p-6 lg:col-span-5">
          <div>
            <h2 className="font-display text-xl font-semibold text-white">Mission Briefing</h2>
            <p className="mt-1 text-xs text-slate-400">
              Review parameters and XP rules before entering the vault.
            </p>

            <dl className="mt-6 space-y-4 border-t border-slate-400/15 pt-5 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="flex items-center gap-2 text-slate-300">
                  <Clock className="h-4 w-4 text-[#55D9F5]" aria-hidden="true" />
                  <span>Estimated Duration</span>
                </dt>
                <dd className="font-mono-tabular font-medium text-white">
                  {mission.estimatedMinutes} minutes
                </dd>
              </div>

              <div className="flex items-center justify-between gap-4">
                <dt className="flex items-center gap-2 text-slate-300">
                  <Target className="h-4 w-4 text-[#A68AFF]" aria-hidden="true" />
                  <span>Challenges</span>
                </dt>
                <dd className="font-mono-tabular font-medium text-white">
                  {mission.questions.length} Questions
                </dd>
              </div>

              <div className="flex items-center justify-between gap-4">
                <dt className="flex items-center gap-2 text-slate-300">
                  <Trophy className="h-4 w-4 text-[#55D9F5]" aria-hidden="true" />
                  <span>Correct Answer</span>
                </dt>
                <dd className="font-mono-tabular font-semibold text-[#55D9F5]">
                  +{mission.xpPerCorrect} XP
                </dd>
              </div>

              <div className="flex items-center justify-between gap-4">
                <dt className="flex items-center gap-2 text-slate-300">
                  <Sparkles className="h-4 w-4 text-[#A68AFF]" aria-hidden="true" />
                  <span>Participation</span>
                </dt>
                <dd className="font-mono-tabular font-medium text-slate-200">
                  +{mission.xpPerIncorrect} XP
                </dd>
              </div>
            </dl>

            {previousRecord ? (
              <div className="mt-6 rounded-xl border border-[#A68AFF]/25 bg-[#111D36]/80 p-4 text-xs leading-relaxed text-slate-300">
                <p className="font-semibold text-white">
                  Prior Completion · Best {previousRecord.bestScore}/{mission.questions.length} (
                  <span className="font-mono-tabular">{previousRecord.xpAwarded} XP</span> claimed)
                </p>
                <p className="mt-1 text-slate-400">
                  {previousRecord.xpAwarded >= maxXp
                    ? 'Maximum mission XP has already been claimed. Replaying lets you practice without duplicating rewards.'
                    : `Replaying can earn up to +${maxXp - previousRecord.xpAwarded} additional XP if you beat your previous score.`}
                </p>
              </div>
            ) : (
              <div className="mt-6 rounded-xl border border-[#55D9F5]/20 bg-[#0A1120]/80 p-4 text-xs leading-relaxed text-slate-300">
                <p className="font-semibold text-white">Maximum Reward: {maxXp} XP</p>
                <p className="mt-1 text-slate-400">
                  Hints are available on every question with no XP penalty.
                </p>
              </div>
            )}
          </div>

          <div className="mt-8 space-y-3">
            <button
              type="button"
              onClick={onStartMission}
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#55D9F5] px-6 py-3 text-sm font-semibold text-[#06111D] shadow-[0_0_24px_-4px_rgba(85,217,245,0.45)] transition-colors hover:bg-[#7DE4FA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#55D9F5]"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              <span>{previousRecord ? 'Start Replay Mission' : 'Start Mission'}</span>
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
