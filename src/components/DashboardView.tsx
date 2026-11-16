import { useState } from 'react';
import { Award, CheckCircle2, Flame, Lock, Play, RotateCcw, Trophy } from 'lucide-react';
import { ACHIEVEMENTS, MISSIONS } from '../data/missions';
import { calculateLevelInfo } from '../engine/progression';
import type { LearnerProgressState } from '../types/questlab';
import { ResilientImage } from './ResilientImage';

interface DashboardViewProps {
  progress: LearnerProgressState;
  onOpenWorlds: () => void;
  onOpenMissionBriefing: (missionId: string) => void;
  onResetProgress: () => void;
}

export function DashboardView({
  progress,
  onOpenWorlds,
  onOpenMissionBriefing,
  onResetProgress,
}: DashboardViewProps) {
  const [confirmingReset, setConfirmingReset] = useState(false);

  const levelInfo = calculateLevelInfo(progress.totalXp);
  const featuredMission = MISSIONS[0];
  const featuredRecord = progress.missionRecords[featuredMission.id];
  const isFeaturedCompleted = progress.completedMissionIds.includes(featuredMission.id);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
      {/* Header & Level Bar */}
      <section className="flex flex-col justify-between gap-6 border-b border-slate-400/15 pb-8 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-medium tracking-wide text-[#55D9F5]">
            Explorer Dashboard
          </p>
          <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-white">
            {progress.displayName} Command Center
          </h1>
          <p className="mt-1.5 text-sm text-slate-300">
            Level <span className="font-mono-tabular font-semibold text-white">{levelInfo.level}</span>
            <span className="mx-2 text-slate-500" aria-hidden="true">
              ·
            </span>
            <span>{levelInfo.rankTitle}</span>
            <span className="mx-2 text-slate-500" aria-hidden="true">
              ·
            </span>
            <span className="font-mono-tabular text-slate-400">
              {levelInfo.xpNeededForNextLevel} XP to Level {levelInfo.level + 1}
            </span>
          </p>
        </div>

        <div className="w-full max-w-md">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span>Level {levelInfo.level} Progress</span>
            <span className="font-mono-tabular text-[#55D9F5]">
              {levelInfo.xpIntoCurrentLevel} / 100 XP
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Level experience progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={levelInfo.progressPercent}
            className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-[#111B33]"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#55D9F5] to-[#A68AFF] transition-all duration-300"
              style={{ width: `${levelInfo.progressPercent}%` }}
            />
          </div>
        </div>
      </section>

      {/* 4 KPI Strip */}
      <section aria-label="Explorer metrics" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="ql-panel rounded-xl p-5">
          <p className="text-xs font-medium text-slate-400">Total Experience</p>
          <p
            data-testid="dashboard-total-xp"
            className="font-mono-tabular mt-2 text-3xl font-semibold text-[#55D9F5]"
          >
            {progress.totalXp} XP
          </p>
          <p className="mt-1 text-xs text-slate-400">Persisted locally across sessions</p>
        </div>

        <div className="ql-panel rounded-xl p-5">
          <p className="text-xs font-medium text-slate-400">Current Level</p>
          <p
            data-testid="dashboard-level"
            className="font-mono-tabular mt-2 text-3xl font-semibold text-white"
          >
            Level {levelInfo.level}
          </p>
          <p className="mt-1 text-xs text-[#A68AFF]">{levelInfo.rankTitle}</p>
        </div>

        <div className="ql-panel rounded-xl p-5">
          <p className="text-xs font-medium text-slate-400">Completed Missions</p>
          <p
            data-testid="dashboard-completed-missions"
            className="font-mono-tabular mt-2 text-3xl font-semibold text-white"
          >
            {progress.completedMissionIds.length}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {MISSIONS.length} playable mission in Sector 01
          </p>
        </div>

        <div className="ql-panel rounded-xl p-5">
          <p className="text-xs font-medium text-slate-400">Answer Streak</p>
          <div className="mt-2 flex items-baseline gap-3">
            <p
              data-testid="dashboard-current-streak"
              className="font-mono-tabular text-3xl font-semibold text-white"
            >
              {progress.currentStreak}
            </p>
            <span className="inline-flex items-center gap-1 text-xs text-slate-400 font-mono-tabular">
              <Flame className="h-3.5 w-3.5 text-[#A68AFF]" aria-hidden="true" />
              Best: <span data-testid="dashboard-best-streak">{progress.bestStreak}</span>
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Consecutive accurate answers</p>
        </div>
      </section>

      {/* Active Mission Spotlight & Achievements */}
      <section className="mt-8 grid gap-8 lg:grid-cols-12">
        {/* Featured Mission */}
        <div className="ql-panel-accent flex flex-col overflow-hidden rounded-2xl lg:col-span-7">
          <div className="relative h-48 w-full overflow-hidden sm:h-56">
            <ResilientImage
              src={featuredMission.imageSrc}
              alt={featuredMission.imageAlt}
              fallbackTitle={featuredMission.title}
              className="h-full w-full object-cover"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0A1120] via-[#0A1120]/30 to-transparent"
            />
            <div className="absolute bottom-4 left-6 right-6 flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-[#55D9F5]">
                {featuredMission.subject}
              </span>
              {isFeaturedCompleted ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Completed · Best {featuredRecord?.bestScore}/{featuredMission.questions.length}
                </span>
              ) : (
                <span className="text-xs font-medium text-slate-300">Ready to Launch</span>
              )}
            </div>
          </div>

          <div className="flex flex-1 flex-col justify-between p-6">
            <div>
              <h2 className="font-display text-2xl font-bold text-white">
                {featuredMission.title}
              </h2>
              <p className="mt-1 text-sm font-medium text-[#A68AFF]">{featuredMission.topic}</p>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                {featuredMission.summary}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-400 font-mono-tabular">
                <span>{featuredMission.questions.length} Questions</span>
                <span aria-hidden="true">·</span>
                <span>~{featuredMission.estimatedMinutes} min</span>
                <span aria-hidden="true">·</span>
                <span>Up to {featuredMission.questions.length * featuredMission.xpPerCorrect} XP</span>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onOpenMissionBriefing(featuredMission.id)}
                className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-lg bg-[#55D9F5] px-5 py-2.5 text-sm font-semibold text-[#06111D] transition-colors hover:bg-[#7DE4FA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#55D9F5]"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                <span>{isFeaturedCompleted ? 'Replay Mission Briefing' : 'Open Mission Briefing'}</span>
              </button>

              <button
                type="button"
                onClick={onOpenWorlds}
                className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-lg border border-slate-400/25 bg-[#0D1526] px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:border-[#55D9F5]/50 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#55D9F5]"
              >
                Explore All Worlds
              </button>
            </div>
          </div>
        </div>

        {/* Achievements */}
        <div className="ql-panel flex flex-col justify-between rounded-2xl p-6 lg:col-span-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-xl font-semibold text-white">Achievements</h2>
              <span className="font-mono-tabular text-xs text-slate-400">
                {progress.unlockedAchievementIds.length} / {ACHIEVEMENTS.length} Unlocked
              </span>
            </div>

            <ul className="mt-4 divide-y divide-slate-400/12">
              {ACHIEVEMENTS.map((achievement) => {
                const unlocked = progress.unlockedAchievementIds.includes(achievement.id);
                return (
                  <li
                    key={achievement.id}
                    className={`py-4 first:pt-2 last:pb-2 ${unlocked ? '' : 'opacity-75'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                            unlocked
                              ? 'bg-[#55D9F5]/15 text-[#55D9F5]'
                              : 'bg-slate-800/80 text-slate-500'
                          }`}
                        >
                          {unlocked ? (
                            <Trophy className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <Lock className="h-4 w-4" aria-hidden="true" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">{achievement.title}</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
                            {achievement.description}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`shrink-0 text-xs font-medium ${
                          unlocked ? 'text-[#55D9F5]' : 'text-slate-500'
                        }`}
                      >
                        {unlocked ? 'Unlocked' : 'Locked'}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mt-6 border-t border-slate-400/15 pt-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <Award className="h-3.5 w-3.5 text-[#A68AFF]" aria-hidden="true" />
                Accuracy Rate
              </span>
              <span className="font-mono-tabular text-slate-200">
                {progress.analytics.totalQuestionsAnswered > 0
                  ? `${Math.round(
                      (progress.analytics.totalCorrectAnswers /
                        progress.analytics.totalQuestionsAnswered) *
                        100,
                    )}% (${progress.analytics.totalCorrectAnswers}/${progress.analytics.totalQuestionsAnswered})`
                  : 'No attempts yet'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Demo Progress Reset Bar */}
      <section className="mt-8 flex flex-col items-start justify-between gap-4 rounded-xl border border-slate-400/15 bg-[#0D1526]/65 px-5 py-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-white">Local Explorer Progress</p>
          <p className="text-xs text-slate-400">
            Progress is saved in your browser so refreshing keeps your XP, level, and completed
            missions.
          </p>
        </div>

        {!confirmingReset ? (
          <button
            type="button"
            onClick={() => setConfirmingReset(true)}
            className="inline-flex min-h-[40px] shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-400/25 px-4 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-rose-400/50 hover:text-rose-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset Demo Progress</span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onResetProgress();
                setConfirmingReset(false);
              }}
              className="inline-flex min-h-[40px] shrink-0 items-center whitespace-nowrap rounded-lg bg-rose-500/90 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-rose-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
            >
              Confirm Reset
            </button>
            <button
              type="button"
              onClick={() => setConfirmingReset(false)}
              className="inline-flex min-h-[40px] shrink-0 items-center whitespace-nowrap rounded-lg border border-slate-400/25 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
            >
              Cancel
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
