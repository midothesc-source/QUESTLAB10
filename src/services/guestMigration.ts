import { calculateLevelInfo, SCHEMA_VERSION } from '../engine/progression.ts';
import type { GuestLegacySummary, LearnerProgressState } from '../types/questlab';

/**
 * Secure guest migration policy:
 * Client-supplied guest localStorage XP is NEVER trusted as authoritative official XP.
 * Instead, guest local practice history is preserved inside a clearly labeled `guestLegacySummary`
 * record without inflating official cloud `totalXp`, `level`, `missionRecords`, or achievements.
 */
export function preserveGuestPracticeSnapshot(
  guestState: LearnerProgressState,
  cloudState: LearnerProgressState,
  nowIso: string = new Date().toISOString(),
): LearnerProgressState {
  const hasGuestActivity =
    guestState.totalXp > 0 || guestState.completedMissionIds.length > 0;

  if (!hasGuestActivity) {
    return cloudState;
  }

  const priorLegacy = cloudState.guestLegacySummary;
  const combinedCompleted = Array.from(
    new Set([
      ...(priorLegacy?.guestCompletedMissionIds || []),
      ...guestState.completedMissionIds,
    ]),
  );

  const guestLegacySummary: GuestLegacySummary = {
    guestXpEarned: Math.max(priorLegacy?.guestXpEarned ?? 0, Math.max(0, Math.floor(guestState.totalXp))),
    guestCompletedMissionIds: combinedCompleted,
    migratedAt: priorLegacy?.migratedAt || nowIso,
  };

  const levelInfo = calculateLevelInfo(cloudState.totalXp);

  return {
    ...cloudState,
    schemaVersion: SCHEMA_VERSION,
    level: levelInfo.level,
    guestLegacySummary,
  };
}

/**
 * Backwards-compatible alias enforcing the zero-trust guest migration invariant.
 */
export function mergeGuestProgressIntoCloud(
  guestState: LearnerProgressState,
  cloudState: LearnerProgressState,
  nowIso: string = new Date().toISOString(),
): LearnerProgressState {
  return preserveGuestPracticeSnapshot(guestState, cloudState, nowIso);
}
