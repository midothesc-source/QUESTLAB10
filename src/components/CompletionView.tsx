import { Award, CheckCircle2, Flame, LayoutDashboard, RotateCw, XCircle } from 'lucide-react';
import { calculateLevelInfo } from '../engine/progression';
import type {
  LearnerProgressState,
  MissionRunSummary,
  PublicMissionDefinition,
} from '../types/questlab';

interface CompletionViewProps {
  mission: PublicMissionDefinition;
  summary: MissionRunSummary;
  progress: LearnerProgressState;
  isAuthenticated: boolean;
  onReplayMission: () => void;
  onReturnToDashboard: () => void;
  onOpenWorlds: () => void;
}

export function CompletionView({
  mission,
  summary,
  progress,
  isAuthenticated,
  onReplayMission,
  onReturnToDashboard,
  onOpenWorlds,
}: CompletionViewProps) {
  const accuracyPercent = Math.round((summary.correctCount / summary.totalQuestions) * 100);
  const levelInfo = calculateLevelInfo(progress.totalXp);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:py-12">
      <section className="ql-panel-accent rounded-2xl p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium tracking-wide text-[#55D9F5]">Mission Complete</p>
          <span className="font-mono-tabular text-xs text-slate-400">
            {isAuthenticated ? 'Server Verified · Cloud Synced' : 'Guest Practice Mode (Local)'}
          </span>
        </div>
        <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-white">
          {mission.title}
        </h1>
        <p className="mt-1.5 text-sm text-slate-300">
          {mission.subject}
          <span className="mx-2 text-slate-500" aria-hidden="true">
            ·
          </span>
          <span>{mission.topic}</span>
        </p>

        {/* Core Outcome Metrics */}
        <div className="mt-6 grid gap-4 border-y border-slate-400/15 py-5 sm:grid-cols-3 sm:gap-6">
          <div>
            <p className="text-xs text-slate-400">Mission Score</p>
            <p
              data-testid="completion-score"
              className="font-mono-tabular mt-1.5 text-2xl font-bold text-white"
            >
              {summary.correctCount} / {summary.totalQuestions}
            </p>
            <p className="font-mono-tabular mt-1 text-xs text-slate-400">
              {accuracyPercent}% Accuracy
            </p>
          </div>

          <div className="sm:border-l sm:border-slate-400/15 sm:pl-6">
            <p className="text-xs text-slate-400">
              {isAuthenticated ? 'Official XP Added' : 'Practice XP Added'}
            </p>
            <p
              data-testid="completion-xp-added"
              className="font-mono-tabular mt-1.5 text-2xl font-bold text-[#55D9F5]"
            >
              +{summary.xpAddedToProfile} XP
            </p>
            <p className="font-mono-tabular mt-1 text-xs text-slate-400">
              {summary.isReplayPractice
                ? `Practice replay · ${summary.xpEarnedInRun} XP run (best ${summary.previousBestXp} XP claimed)`
                : `Run total: ${summary.xpEarnedInRun} XP`}
            </p>
          </div>

          <div className="sm:border-l sm:border-slate-400/15 sm:pl-6">
            <p className="text-xs text-slate-400">Best Streak in Run</p>
            <p className="font-mono-tabular mt-1.5 inline-flex items-center gap-1.5 text-2xl font-bold text-white">
              <Flame className="h-5 w-5 text-[#A68AFF]" aria-hidden="true" />
              <span>{summary.bestStreakInRun}</span>
            </p>
            <p className="font-mono-tabular mt-1 text-xs text-slate-400">
              All-time best: {progress.bestStreak}
            </p>
          </div>
        </div>

        {/* Updated Level Bar */}
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
            <span>
              Explorer Level{' '}
              <span className="font-mono-tabular font-semibold text-white">{levelInfo.level}</span>{' '}
              · {levelInfo.rankTitle}
            </span>
            <span className="font-mono-tabular text-[#55D9F5]">{progress.totalXp} Total XP</span>
          </div>
          <div
            role="progressbar"
            aria-label="Updated level experience progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={levelInfo.progressPercent}
            className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-[#111B33]"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#55D9F5] to-[#A68AFF]"
              style={{ width: `${levelInfo.progressPercent}%` }}
            />
          </div>
        </div>

        {/* Newly Unlocked Achievements */}
        {summary.newlyUnlockedAchievements.length > 0 && (
          <div className="mt-6 rounded-xl bg-[#131B36]/85 p-4">
            <p className="flex items-center gap-2 text-xs font-semibold text-[#A68AFF]">
              <Award className="h-4 w-4" aria-hidden="true" />
              <span>Achievements Unlocked</span>
            </p>
            <ul className="mt-2.5 space-y-1.5">
              {summary.newlyUnlockedAchievements.map((achievement) => (
                <li key={achievement.id} className="text-sm text-white">
                  <span className="font-semibold">{achievement.title}</span>
                  <span className="mx-2 text-slate-400" aria-hidden="true">
                    —
                  </span>
                  <span className="text-slate-300">{achievement.description}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Question Review List (Explanations provided strictly post-submission by server) */}
        <div className="mt-7 border-t border-slate-400/15 pt-6">
          <h2 className="font-display text-lg font-semibold text-white">Question Breakdown</h2>
          <ul className="mt-3 divide-y divide-slate-400/12">
            {mission.questions.map((question, idx) => {
              const entry = summary.questionResults.find((r) => r.questionId === question.id) ??
                summary.questionResults[idx];
              const isCorrect = entry?.isCorrect ?? false;
              const explanation = entry?.explanation;
              return (
                <li key={question.id} className="py-3">
                  <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-3">
                      {isCorrect ? (
                        <CheckCircle2
                          className="h-4 w-4 shrink-0 text-emerald-300"
                          aria-hidden="true"
                        />
                      ) : (
                        <XCircle className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                      )}
                      <span className="text-sm text-slate-200">{question.promptSentence}</span>
                    </div>
                    <span className="font-mono-tabular shrink-0 text-xs font-medium text-[#55D9F5]">
                      {isCorrect ? 'Correct' : 'Missed'} · +{entry?.xpEarned ?? 0} XP
                    </span>
                  </div>
                  {explanation && (
                    <p className="mt-1.5 pl-7 text-xs leading-relaxed text-slate-400">
                      {explanation}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Actions */}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onReturnToDashboard}
            className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-lg bg-[#55D9F5] px-5 py-2.5 text-sm font-semibold text-[#06111D] transition-colors hover:bg-[#7DE4FA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#55D9F5]"
          >
            <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
            <span>Back to Dashboard</span>
          </button>

          <button
            type="button"
            onClick={onReplayMission}
            className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-lg border border-slate-400/25 bg-[#0D1526] px-5 py-2.5 text-sm font-medium text-slate-100 transition-colors hover:border-[#A68AFF]/60 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A68AFF]"
          >
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            <span>Replay Mission</span>
          </button>

          <button
            type="button"
            onClick={onOpenWorlds}
            className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-lg border border-transparent px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:text-[#55D9F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#55D9F5]"
          >
            Subject Worlds
          </button>
        </div>
      </section>
    </div>
  );
}
