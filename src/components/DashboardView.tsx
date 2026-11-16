import { useState, type FormEvent } from 'react';
import {
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Cloud,
  Flame,
  Lock,
  LogIn,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  User,
  Users,
} from 'lucide-react';
import { ACHIEVEMENTS } from '../data/missions';
import { SUBJECT_WORLDS } from '../data/worlds';
import { calculateLevelInfo } from '../engine/progression';
import { joinClassByCode } from '../services/firestoreService';
import type {
  ClassEnrollment,
  LearnerProgressState,
  MissionAssignment,
  MissionDefinition,
  MissionSubmission,
  UserProfile,
} from '../types/questlab';
import { ResilientImage } from './ResilientImage';

interface DashboardViewProps {
  progress: LearnerProgressState;
  profile: UserProfile | null;
  missions: MissionDefinition[];
  assignments: MissionAssignment[];
  submissions: MissionSubmission[];
  enrollments: ClassEnrollment[];
  onOpenWorlds: () => void;
  onOpenMissionBriefing: (missionId: string) => void;
  onOpenAuth: () => void;
  onOpenProfile: () => void;
  onOpenTeacherPortal: () => void;
  onEnrollmentAdded: (enrollment: ClassEnrollment) => void;
  onResetProgress: () => void;
  onNotify: (title: string, description: string, tone: 'success' | 'error' | 'info') => void;
}

export function DashboardView({
  progress,
  profile,
  missions,
  assignments,
  submissions,
  enrollments,
  onOpenWorlds,
  onOpenMissionBriefing,
  onOpenAuth,
  onOpenProfile,
  onOpenTeacherPortal,
  onEnrollmentAdded,
  onResetProgress,
  onNotify,
}: DashboardViewProps) {
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joiningClass, setJoiningClass] = useState(false);

  const levelInfo = calculateLevelInfo(progress.totalXp);
  const featuredMission = missions[0];
  const featuredRecord = featuredMission ? progress.missionRecords[featuredMission.id] : undefined;
  const isFeaturedCompleted = featuredMission
    ? progress.completedMissionIds.includes(featuredMission.id)
    : false;

  const pendingAssignments = assignments.filter((a) => a.status === 'assigned');

  const handleQuickJoinClass = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile || !joinCode.trim()) return;
    setJoiningClass(true);
    try {
      const enrollment = await joinClassByCode(joinCode.trim(), profile);
      onEnrollmentAdded(enrollment);
      setJoinCode('');
      onNotify('Joined class', `Enrolled in ${enrollment.className}.`, 'success');
    } catch (err) {
      onNotify(
        'Could not join class',
        err instanceof Error ? err.message : 'Check the class code and try again.',
        'error',
      );
    } finally {
      setJoiningClass(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
      {/* Header & Level Bar */}
      <section className="flex flex-col justify-between gap-6 border-b border-slate-400/15 pb-8 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-medium tracking-wide text-[#55D9F5]">
            {profile ? 'Cloud Explorer Dashboard' : 'Explorer Dashboard'}
          </p>
          <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-white">
            {profile?.displayName || progress.displayName} Command Center
          </h1>
          <p className="mt-1.5 text-sm text-slate-300">
            Level{' '}
            <span className="font-mono-tabular font-semibold text-white">{levelInfo.level}</span>
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

      {/* Sync / Role Status Strip */}
      <section className="mt-6 flex flex-col justify-between gap-4 rounded-xl border border-slate-400/15 bg-[#0D1526]/75 px-5 py-4 sm:flex-row sm:items-center">
        {profile ? (
          <>
            <div className="flex items-start gap-3">
              <Cloud className="mt-0.5 h-4 w-4 shrink-0 text-[#55D9F5]" aria-hidden="true" />
              <div className="text-xs">
                <p className="font-semibold text-white">
                  Cloud Sync Active · {profile.role === 'teacher' ? 'Educator' : 'Student'} Account
                </p>
                <p className="mt-0.5 text-slate-400">
                  {enrollments.length > 0
                    ? `Enrolled in ${enrollments.map((e) => e.className).join(', ')}`
                    : 'Join a class code to receive educator assignments.'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {profile.role === 'teacher' && (
                <button
                  type="button"
                  onClick={onOpenTeacherPortal}
                  className="inline-flex min-h-[38px] items-center gap-2 rounded-lg bg-[#A68AFF] px-3.5 py-1.5 text-xs font-semibold text-[#080D19] transition-colors hover:bg-[#BEA8FF]"
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Open Teacher Studio</span>
                </button>
              )}
              <button
                type="button"
                onClick={onOpenProfile}
                className="inline-flex min-h-[38px] items-center gap-2 rounded-lg border border-slate-400/25 px-3.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-[#55D9F5]/60 hover:text-white"
              >
                <User className="h-3.5 w-3.5 text-[#55D9F5]" aria-hidden="true" />
                <span>Profile &amp; Classes</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-xs">
              <p className="font-semibold text-white">Guest Explorer Mode</p>
              <p className="mt-0.5 text-slate-400">
                Sign in with Google or email to sync XP to the cloud, unlock teacher missions, and
                join classes without losing local progress.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenAuth}
              className="inline-flex min-h-[38px] shrink-0 items-center gap-2 rounded-lg border border-[#55D9F5]/40 bg-[#0A1529] px-4 py-1.5 text-xs font-semibold text-[#55D9F5] transition-colors hover:bg-[#55D9F5] hover:text-[#06111D]"
            >
              <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Sign In / Sync Cloud</span>
            </button>
          </>
        )}
      </section>

      {/* 4 KPI Strip */}
      <section aria-label="Explorer metrics" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="ql-panel rounded-xl p-5">
          <p className="text-xs font-medium text-slate-400">Total Experience</p>
          <p
            data-testid="dashboard-total-xp"
            className="font-mono-tabular mt-2 text-3xl font-semibold text-[#55D9F5]"
          >
            {progress.totalXp} XP
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {profile ? 'Synced with Cloud Firestore' : 'Persisted locally across sessions'}
          </p>
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
            {missions.length} published mission{missions.length === 1 ? '' : 's'} available
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
            <span className="font-mono-tabular inline-flex items-center gap-1 text-xs text-slate-400">
              <Flame className="h-3.5 w-3.5 text-[#A68AFF]" aria-hidden="true" />
              Best: <span data-testid="dashboard-best-streak">{progress.bestStreak}</span>
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Consecutive accurate answers</p>
        </div>
      </section>

      {/* Assigned Missions (Authenticated Learners) */}
      {profile && (
        <section className="mt-8 grid gap-6 lg:grid-cols-12">
          <div className="ql-panel rounded-2xl p-6 lg:col-span-8">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold text-white">Assigned Missions</h2>
              <span className="font-mono-tabular text-xs text-[#55D9F5]">
                {pendingAssignments.length} Pending
              </span>
            </div>

            {assignments.length === 0 ? (
              <p className="mt-3 text-xs leading-relaxed text-slate-400">
                No missions have been assigned to you yet. Join a class using your teacher&apos;s
                Class Code or explore Subject Worlds freely.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-slate-400/12">
                {assignments.map((assignment) => {
                  const isDone = assignment.status === 'completed';
                  return (
                    <li
                      key={assignment.id}
                      className="flex flex-col justify-between gap-3 py-3 sm:flex-row sm:items-center"
                    >
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {assignment.missionTitle}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {assignment.className}
                          {assignment.dueDate ? ` · Due ${assignment.dueDate}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`font-mono-tabular text-xs font-medium ${
                            isDone ? 'text-emerald-300' : 'text-amber-200'
                          }`}
                        >
                          {isDone ? 'Completed' : 'Assigned'}
                        </span>
                        <button
                          type="button"
                          onClick={() => onOpenMissionBriefing(assignment.missionId)}
                          className="rounded-lg bg-[#55D9F5] px-3.5 py-1.5 text-xs font-semibold text-[#06111D] hover:bg-[#7DE4FA]"
                        >
                          {isDone ? 'Replay' : 'Launch'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="ql-panel rounded-2xl p-6 lg:col-span-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-[#A68AFF]" aria-hidden="true" />
              <h2 className="font-display text-lg font-semibold text-white">Join Class</h2>
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              Enter a Class Code from your teacher to enroll.
            </p>
            <form onSubmit={handleQuickJoinClass} className="mt-4 flex gap-2">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="Class code"
                aria-label="Class join code"
                className="min-w-0 flex-1 rounded-lg border border-slate-400/25 bg-[#080D19] px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-[#55D9F5] focus:outline-none"
              />
              <button
                type="submit"
                disabled={joiningClass || !joinCode.trim()}
                className="shrink-0 rounded-lg bg-[#A68AFF] px-3.5 py-2 text-xs font-semibold text-[#080D19] hover:bg-[#BEA8FF] disabled:opacity-50"
              >
                {joiningClass ? '...' : 'Join'}
              </button>
            </form>
          </div>
        </section>
      )}

      {/* Active Mission Spotlight & Achievements */}
      <section className="mt-8 grid gap-8 lg:grid-cols-12">
        {/* Featured Mission */}
        {featuredMission && (
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
                    Completed · Best {featuredRecord?.bestScore}/
                    {featuredMission.questions.length}
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

                <div className="font-mono-tabular mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                  <span>{featuredMission.questions.length} Questions</span>
                  <span aria-hidden="true">·</span>
                  <span>~{featuredMission.estimatedMinutes} min</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Up to {featuredMission.questions.length * featuredMission.xpPerCorrect} XP
                  </span>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onOpenMissionBriefing(featuredMission.id)}
                  className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-lg bg-[#55D9F5] px-5 py-2.5 text-sm font-semibold text-[#06111D] transition-colors hover:bg-[#7DE4FA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#55D9F5]"
                >
                  <Play className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {isFeaturedCompleted ? 'Replay Mission Briefing' : 'Open Mission Briefing'}
                  </span>
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
        )}

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

      {/* Subject Progress & Mission History */}
      <section className="mt-8 grid gap-8 lg:grid-cols-12">
        <div className="ql-panel rounded-2xl p-6 lg:col-span-6">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-[#55D9F5]" aria-hidden="true" />
            <h2 className="font-display text-lg font-semibold text-white">
              Subject World Progress
            </h2>
          </div>
          <div className="mt-5 space-y-4">
            {SUBJECT_WORLDS.map((world) => {
              const worldMissions = missions.filter((m) => m.worldId === world.id);
              const completedInWorld = worldMissions.filter((m) =>
                progress.completedMissionIds.includes(m.id),
              ).length;
              const pct =
                worldMissions.length > 0
                  ? Math.round((completedInWorld / worldMissions.length) * 100)
                  : 0;
              return (
                <div key={world.id}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-200">{world.name}</span>
                    <span className="font-mono-tabular text-slate-400">
                      {worldMissions.length > 0
                        ? `${completedInWorld}/${worldMissions.length} completed`
                        : 'Locked'}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[#080D19]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#55D9F5] to-[#A68AFF]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="ql-panel rounded-2xl p-6 lg:col-span-6">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#A68AFF]" aria-hidden="true" />
              <h2 className="font-display text-lg font-semibold text-white">Mission History</h2>
            </div>
            <span className="font-mono-tabular text-xs text-slate-400">
              {progress.analytics.lastActiveAt
                ? `Last active ${new Date(progress.analytics.lastActiveAt).toLocaleDateString()}`
                : 'No runs recorded'}
            </span>
          </div>

          {submissions.length > 0 ? (
            <ul className="mt-4 divide-y divide-slate-400/12">
              {submissions.slice(0, 5).map((sub) => (
                <li
                  key={sub.id}
                  className="flex items-center justify-between gap-3 py-2.5 text-xs"
                >
                  <div>
                    <p className="font-semibold text-white">{sub.missionTitle}</p>
                    <p className="text-slate-400">
                      {new Date(sub.completedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="font-mono-tabular text-[#55D9F5]">
                    {sub.correctCount}/{sub.totalQuestions} · +{sub.xpEarnedInRun} XP
                  </span>
                </li>
              ))}
            </ul>
          ) : Object.keys(progress.missionRecords).length > 0 ? (
            <ul className="mt-4 divide-y divide-slate-400/12">
              {Object.values(progress.missionRecords).map((rec) => {
                const matched = missions.find((m) => m.id === rec.missionId);
                return (
                  <li
                    key={rec.missionId}
                    className="flex items-center justify-between gap-3 py-2.5 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-white">{matched?.title || rec.missionId}</p>
                      <p className="text-slate-400">
                        {rec.attemptsCount} attempt{rec.attemptsCount === 1 ? '' : 's'}
                      </p>
                    </div>
                    <span className="font-mono-tabular text-[#55D9F5]">
                      Best {rec.bestScore}/{rec.totalQuestions} · {rec.xpAwarded} XP
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-4 text-xs text-slate-400">
              Complete your first mission to populate your activity log and learning statistics.
            </p>
          )}
        </div>
      </section>

      {/* Progress Reset Bar */}
      <section className="mt-8 flex flex-col items-start justify-between gap-4 rounded-xl border border-slate-400/15 bg-[#0D1526]/65 px-5 py-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-white">
            {profile ? 'Cloud Explorer Progress' : 'Local Explorer Progress'}
          </p>
          <p className="text-xs text-slate-400">
            {profile
              ? 'Progress is stored securely in Cloud Firestore with local caching.'
              : 'Progress is saved in your browser so refreshing keeps your XP, level, and completed missions.'}
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
