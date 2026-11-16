import { doc, getDoc } from 'firebase/firestore';
import { createInitialProgressState, SCHEMA_VERSION } from '../engine/progression';
import type { LearnerProgressState, ProgressRepository } from '../types/questlab';
import {
  fetchServerProgress,
  preserveGuestPracticeOnServerApi,
  resetServerProgressOnServer,
} from './apiClient';
import { db } from './firebase';

const GUEST_STORAGE_KEY = 'questlab_learner_progress_v1';
const CLOUD_CACHE_PREFIX = 'questlab_cloud_cache_v1_';

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
 * LocalStorage implementation for Guest Mode & local offline read caching.
 */
export class LocalStorageProgressRepository implements ProgressRepository {
  private readonly storageKey: string;
  private readonly defaultName: string;
  private readonly defaultUid: string;

  constructor(
    storageKey: string = GUEST_STORAGE_KEY,
    defaultName: string = 'Explorer',
    defaultUid: string = 'local-explorer',
  ) {
    this.storageKey = storageKey;
    this.defaultName = defaultName;
    this.defaultUid = defaultUid;
  }

  hasStoredProgress(): boolean {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) return false;
      const parsed: unknown = JSON.parse(raw);
      return (
        isValidProgressState(parsed) &&
        (parsed.totalXp > 0 || parsed.completedMissionIds.length > 0)
      );
    } catch {
      return false;
    }
  }

  load(): LearnerProgressState {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { ...createInitialProgressState(this.defaultName), learnerId: this.defaultUid };
    }

    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) {
        return { ...createInitialProgressState(this.defaultName), learnerId: this.defaultUid };
      }
      const parsed: unknown = JSON.parse(raw);
      if (isValidProgressState(parsed)) {
        return parsed;
      }
      return { ...createInitialProgressState(this.defaultName), learnerId: this.defaultUid };
    } catch {
      return { ...createInitialProgressState(this.defaultName), learnerId: this.defaultUid };
    }
  }

  save(state: LearnerProgressState): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    try {
      window.localStorage.setItem(this.storageKey, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors cleanly
    }
  }

  reset(): LearnerProgressState {
    const fresh = { ...createInitialProgressState(this.defaultName), learnerId: this.defaultUid };
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(this.storageKey);
      } catch {
        // Ignore removal errors
      }
    }
    return fresh;
  }
}

/**
 * Server-authoritative Cloud Firestore repository for authenticated learners.
 * All writes to /users/{uid}/progress/current happen exclusively via server Admin SDK endpoints
 * (/api/progress, /api/missions/grade, /api/progress/reset, /api/progress/migrate-guest).
 */
export class FirestoreProgressRepository implements ProgressRepository {
  private readonly uid: string;
  private readonly displayName: string;
  private readonly cache: LocalStorageProgressRepository;
  private activeMigrationPromise: Promise<LearnerProgressState> | null = null;

  constructor(uid: string, displayName: string) {
    this.uid = uid;
    this.displayName = displayName || 'Explorer';
    this.cache = new LocalStorageProgressRepository(
      `${CLOUD_CACHE_PREFIX}${uid}`,
      this.displayName,
      uid,
    );
  }

  loadCached(): LearnerProgressState {
    return this.cache.load();
  }

  applyAuthoritativeSnapshot(state: LearnerProgressState): void {
    const normalized: LearnerProgressState = {
      ...state,
      schemaVersion: SCHEMA_VERSION,
      learnerId: this.uid,
      displayName: (state.displayName || this.displayName).slice(0, 80),
    };
    this.cache.save(normalized);
  }

  async load(): Promise<LearnerProgressState> {
    try {
      const serverProgress = await fetchServerProgress();
      this.applyAuthoritativeSnapshot(serverProgress);
      return serverProgress;
    } catch (serverError) {
      // Allow read-only Firestore fetch if progress document already exists
      try {
        const ref = doc(db, 'users', this.uid, 'progress', 'current');
        const snap = await getDoc(ref);
        if (snap.exists() && isValidProgressState(snap.data())) {
          const readOnlyProgress = snap.data() as LearnerProgressState;
          this.applyAuthoritativeSnapshot(readOnlyProgress);
          return readOnlyProgress;
        }
      } catch {
        // Surface original server error below
      }
      throw serverError;
    }
  }

  /**
   * Updates only local read cache. Official progress cannot be written from the client SDK.
   */
  save(state: LearnerProgressState): void {
    this.applyAuthoritativeSnapshot(state);
  }

  async reset(): Promise<LearnerProgressState> {
    const fresh = await resetServerProgressOnServer();
    this.applyAuthoritativeSnapshot(fresh);
    return fresh;
  }

  /**
   * Safely preserves local guest practice summary inside `guestLegacySummary` on the server
   * without trusting or promoting client XP into official account XP.
   */
  async migrateGuestProgress(
    guestRepo: LocalStorageProgressRepository,
  ): Promise<{ state: LearnerProgressState; migrated: boolean }> {
    if (!guestRepo.hasStoredProgress()) {
      const state = await this.load();
      return { state, migrated: false };
    }

    if (!this.activeMigrationPromise) {
      this.activeMigrationPromise = (async () => {
        const guestState = guestRepo.load();
        const serverState = await preserveGuestPracticeOnServerApi({
          guestXpEarned: guestState.totalXp,
          guestCompletedMissionIds: guestState.completedMissionIds,
        });
        this.applyAuthoritativeSnapshot(serverState);
        guestRepo.reset();
        return serverState;
      })().finally(() => {
        this.activeMigrationPromise = null;
      });
    }

    const state = await this.activeMigrationPromise;
    return { state, migrated: true };
  }
}

export const guestProgressRepository = new LocalStorageProgressRepository();
export const progressRepository = guestProgressRepository;
