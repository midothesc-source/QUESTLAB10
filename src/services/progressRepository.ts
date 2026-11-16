import { createInitialProgressState, SCHEMA_VERSION } from '../engine/progression';
import type { LearnerProgressState, ProgressRepository } from '../types/questlab';

const STORAGE_KEY = 'questlab_learner_progress_v1';

function isValidProgressState(value: unknown): value is LearnerProgressState {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<LearnerProgressState>;
  return (
    candidate.schemaVersion === SCHEMA_VERSION &&
    typeof candidate.totalXp === 'number' &&
    typeof candidate.level === 'number' &&
    typeof candidate.currentStreak === 'number' &&
    typeof candidate.bestStreak === 'number' &&
    Array.isArray(candidate.completedMissionIds) &&
    typeof candidate.missionRecords === 'object' &&
    candidate.missionRecords !== null &&
    Array.isArray(candidate.unlockedAchievementIds)
  );
}

/**
 * LocalStorage implementation of ProgressRepository.
 * Structured so a FirestoreProgressRepository can replace it without
 * modifying UI components or progression engine logic.
 */
export class LocalStorageProgressRepository implements ProgressRepository {
  load(): LearnerProgressState {
    if (typeof window === 'undefined' || !window.localStorage) {
      return createInitialProgressState();
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return createInitialProgressState();
      }
      const parsed: unknown = JSON.parse(raw);
      if (isValidProgressState(parsed)) {
        return parsed;
      }
      return createInitialProgressState();
    } catch {
      return createInitialProgressState();
    }
  }

  save(state: LearnerProgressState): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors cleanly in restricted contexts
    }
  }

  reset(): LearnerProgressState {
    const fresh = createInitialProgressState();
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignore removal errors cleanly
      }
    }
    return fresh;
  }
}

export const progressRepository: ProgressRepository = new LocalStorageProgressRepository();
