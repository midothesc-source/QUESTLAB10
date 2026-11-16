import { useState } from 'react';
import { ArrowRight, CheckCircle2, Lock, Sparkles, Unlock } from 'lucide-react';
import { SUBJECT_WORLDS } from '../data/worlds';
import type { LearnerProgressState, MissionDefinition } from '../types/questlab';
import { ResilientImage } from './ResilientImage';

interface MissionSelectionViewProps {
  progress: LearnerProgressState;
  missions: MissionDefinition[];
  onSelectMission: (missionId: string) => void;
  onBackToDashboard: () => void;
}

type WorldFilter = 'all' | 'unlocked' | 'locked';

export function MissionSelectionView({
  progress,
  missions,
  onSelectMission,
  onBackToDashboard,
}: MissionSelectionViewProps) {
  const [filter, setFilter] = useState<WorldFilter>('all');

  const computedWorlds = SUBJECT_WORLDS.map((world) => {
    const worldMissions = missions.filter((m) => m.worldId === world.id);
    const isUnlocked = world.status === 'unlocked' || worldMissions.length > 0;
    return {
      world,
      worldMissions,
      isUnlocked,
    };
  });

  const visibleWorlds = computedWorlds.filter((entry) => {
    if (filter === 'all') return true;
    return filter === 'unlocked' ? entry.isUnlocked : !entry.isUnlocked;
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
      <div className="flex flex-col justify-between gap-5 border-b border-slate-400/15 pb-7 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-medium tracking-wide text-[#55D9F5]">Mission Selection</p>
          <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-white">
            Subject Worlds
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
            Select any available world to inspect its briefing and launch a mission. Sectors without
            published educator missions remain locked.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div
            role="group"
            aria-label="Filter subject worlds"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-400/15 bg-[#0D1526] p-1"
          >
            {(
              [
                { id: 'all', label: 'All Worlds' },
                { id: 'unlocked', label: 'Available' },
                { id: 'locked', label: 'Locked' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                aria-pressed={filter === tab.id}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#55D9F5] ${
                  filter === tab.id
                    ? 'bg-[#55D9F5] text-[#06111D]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onBackToDashboard}
            className="min-h-[38px] whitespace-nowrap rounded-lg border border-slate-400/25 px-3.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-300/40 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#55D9F5]"
          >
            Back to Dashboard
          </button>
        </div>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {visibleWorlds.map(({ world, worldMissions, isUnlocked }) => {
          return (
            <article
              key={world.id}
              className={`flex flex-col overflow-hidden rounded-2xl transition-colors ${
                isUnlocked ? 'ql-panel-accent' : 'ql-panel opacity-85'
              }`}
            >
              <div className="relative aspect-[16/9] w-full overflow-hidden">
                <ResilientImage
                  src={world.imageSrc}
                  alt={world.imageAlt}
                  fallbackTitle={world.name}
                  className={`h-full w-full object-cover ${isUnlocked ? '' : 'grayscale-[45%] brightness-75'}`}
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0A1120] via-[#0A1120]/30 to-transparent"
                />
                <div className="absolute bottom-4 left-5 right-5 flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-slate-300">{world.sectorLabel}</span>
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                      isUnlocked ? 'text-[#55D9F5]' : 'text-slate-400'
                    }`}
                  >
                    {isUnlocked ? (
                      <Unlock className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {isUnlocked
                      ? `${worldMissions.length} Mission${worldMissions.length === 1 ? '' : 's'}`
                      : 'Locked'}
                  </span>
                </div>
              </div>

              <div className="flex flex-1 flex-col justify-between p-6">
                <div>
                  <h2 className="font-display text-2xl font-bold text-white">{world.name}</h2>
                  <p className="mt-1 text-sm font-medium text-[#A68AFF]">{world.headline}</p>
                  <p className="mt-3 text-sm leading-relaxed text-slate-300">
                    {world.description}
                  </p>
                </div>

                {isUnlocked && worldMissions.length > 0 ? (
                  <div className="mt-6 space-y-3 border-t border-slate-400/15 pt-5">
                    {worldMissions.map((mission) => {
                      const missionRecord = progress.missionRecords[mission.id];
                      const isCompleted = progress.completedMissionIds.includes(mission.id);
                      return (
                        <div
                          key={mission.id}
                          className="rounded-xl border border-slate-400/15 bg-[#080D19]/75 p-3.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
                            <span className="inline-flex items-center gap-1.5 font-semibold text-white">
                              {mission.authorType === 'ai_generated' && (
                                <Sparkles className="h-3.5 w-3.5 text-[#A68AFF]" aria-hidden="true" />
                              )}
                              <span>{mission.title}</span>
                            </span>
                            {isCompleted && missionRecord ? (
                              <span className="font-mono-tabular inline-flex items-center gap-1 text-emerald-300">
                                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                                Best {missionRecord.bestScore}/{mission.questions.length} ·{' '}
                                {missionRecord.xpAwarded} XP
                              </span>
                            ) : (
                              <span className="font-mono-tabular text-slate-400">
                                {mission.questions.length} Qs · ~{mission.estimatedMinutes} min
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-slate-400">{mission.topic}</p>
                          <button
                            type="button"
                            onClick={() => onSelectMission(mission.id)}
                            className="mt-3 inline-flex min-h-[40px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#55D9F5] px-4 py-2 text-xs font-semibold text-[#06111D] transition-colors hover:bg-[#7DE4FA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#55D9F5]"
                          >
                            <span>
                              {isCompleted ? `Replay ${mission.title}` : `Enter ${mission.title}`}
                            </span>
                            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-6 border-t border-slate-400/10 pt-5">
                    <p className="text-xs leading-relaxed text-slate-400">
                      {world.unlockRequirement}
                    </p>
                    <button
                      type="button"
                      disabled
                      aria-disabled="true"
                      className="mt-3 inline-flex min-h-[44px] w-full cursor-not-allowed items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-slate-400/15 bg-[#080D19]/70 px-5 py-2.5 text-sm font-medium text-slate-500"
                    >
                      <Lock className="h-4 w-4" aria-hidden="true" />
                      <span>Sector Locked</span>
                    </button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
