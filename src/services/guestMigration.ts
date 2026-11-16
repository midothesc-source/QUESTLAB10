import { calculateLevelInfo, SCHEMA_VERSION } from '../engine/progression';
import type { LearnerProgressState, MissionAttemptRecord } from '../types/questlab';

/**
 * Safely merges guest localStorage progress into an authenticated cloud profile.
 * Guarantees zero XP duplication across overlapping mission records while
 * preserving highest scores, completed missions, achievements, and streaks.
 */
export function mergeGuestProgressIntoCloud(
  guestState: LearnerProgressState,
  cloudState: LearnerProgressState,
  nowIso: string = new Date().toISOString(),
): LearnerProgressState {
  const mergedRecords: Record<string, MissionAttemptRecord> = {
    ...cloudState.missionRecords,
  };

  let incrementalGuestXp = 0;

  for (const [missionId, guestRecord] of Object.entries(guestState.missionRecords)) {
    const existingCloud = mergedRecords[missionId];
    if (!existingCloud) {
      mergedRecords[missionId] = { ...guestRecord };
      incrementalGuestXp += guestRecord.xpAwarded;
    } else {
      const mergedBestXp = Math.max(existingCloud.xpAwarded, guestRecord.xpAwarded);
      const xpDelta = Math.max(0, mergedBestXp - existingCloud.xpAwarded);
      incrementalGuestXp += xpDelta;

      mergedRecords[missionId] = {
        missionId,
        bestScore: Math.max(existingCloud.bestScore, guestRecord.bestScore),
        totalQuestions: Math.max(existingCloud.totalQuestions, guestRecord.totalQuestions),
        xpAwarded: mergedBestXp,
        attemptsCount: existingCloud.attemptsCount + guestRecord.attemptsCount,
        lastCompletedAt:
          existingCloud.lastCompletedAt >= guestRecord.lastCompletedAt
            ? existingCloud.lastCompletedAt
            : guestRecord.lastCompletedAt,
        bestStreakAchieved: Math.max(
          existingCloud.bestStreakAchieved,
          guestRecord.bestStreakAchieved,
        ),
      };
    }
  }

  const recordXpSum = Object.values(mergedRecords).reduce((sum, rec) => sum + rec.xpAwarded, 0);
  const mergedTotalXp = Math.max(cloudState.totalXp + incrementalGuestXp, recordXpSum);
  const levelInfo = calculateLevelInfo(mergedTotalXp);

  const completedMissionIds = Array.from(
    new Set([...cloudState.completedMissionIds, ...guestState.completedMissionIds]),
  );

  const unlockedAchievementIds = Array.from(
    new Set([...cloudState.unlockedAchievementIds, ...guestState.unlockedAchievementIds]),
  );

  return {
    schemaVersion: SCHEMA_VERSION,
    learnerId: cloudState.learnerId,
    displayName: cloudState.displayName || guestState.displayName,
    totalXp: mergedTotalXp,
    level: levelInfo.level,
    currentStreak: Math.max(cloudState.currentStreak, guestState.currentStreak),
    bestStreak: Math.max(cloudState.bestStreak, guestState.bestStreak),
    completedMissionIds,
    missionRecords: mergedRecords,
    unlockedAchievementIds,
    analytics: {
      totalQuestionsAnswered:
        cloudState.analytics.totalQuestionsAnswered + guestState.analytics.totalQuestionsAnswered,
      totalCorrectAnswers:
        cloudState.analytics.totalCorrectAnswers + guestState.analytics.totalCorrectAnswers,
      lastActiveAt:
        cloudState.analytics.lastActiveAt && guestState.analytics.lastActiveAt
          ? cloudState.analytics.lastActiveAt >= guestState.analytics.lastActiveAt
            ? cloudState.analytics.lastActiveAt
            : guestState.analytics.lastActiveAt
          : cloudState.analytics.lastActiveAt || guestState.analytics.lastActiveAt || nowIso,
    },
  };
}
