import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { createInitialProgressState, SCHEMA_VERSION } from '../engine/progression';
import type { LearnerProgressState, ProgressRepository } from '../types/questlab';
import { db, handleFirestoreError, OperationType } from './firebase';
import { mergeGuestProgressIntoCloud } from './guestMigration';

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
 * LocalStorage implementation for Guest Mode & local offline caching.
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
 * Cloud Firestore repository for authenticated learners with local caching
 * and race-condition-safe guest progress migration.
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

  async load(): Promise<LearnerProgressState> {
    const path = `users/${this.uid}/progress/current`;
    const ref = doc(db, 'users', this.uid, 'progress', 'current');

    let cloudState: LearnerProgressState;
    try {
      const snap = await getDoc(ref);
      if (snap.exists() && isValidProgressState(snap.data())) {
        cloudState = snap.data() as LearnerProgressState;
      } else {
        cloudState = {
          ...createInitialProgressState(this.displayName),
          learnerId: this.uid,
        };
        await setDoc(ref, {
          ...cloudState,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }

    this.cache.save(cloudState);
    return cloudState;
  }

  async save(state: LearnerProgressState): Promise<void> {
    const path = `users/${this.uid}/progress/current`;
    const normalized: LearnerProgressState = {
      ...state,
      schemaVersion: SCHEMA_VERSION,
      learnerId: this.uid,
      displayName: (state.displayName || this.displayName).slice(0, 80),
    };

    this.cache.save(normalized);

    try {
      await setDoc(doc(db, 'users', this.uid, 'progress', 'current'), {
        ...normalized,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  async reset(): Promise<LearnerProgressState> {
    const fresh: LearnerProgressState = {
      ...createInitialProgressState(this.displayName),
      learnerId: this.uid,
    };
    await this.save(fresh);
    return fresh;
  }

  /**
   * Safely migrates guest progress into Firestore once (serialized to prevent race conditions),
   * then clears guest localStorage upon confirmed cloud write.
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
        const cloudState = await this.load();
        const merged = mergeGuestProgressIntoCloud(guestState, cloudState);
        await this.save(merged);
        guestRepo.reset();
        return merged;
      })().finally(() => {
        this.activeMigrationPromise = null;
      });
    }

    const state = await this.activeMigrationPromise;
    return { state, migrated: true };
  }
}

export const guestProgressRepository = new LocalStorageProgressRepository();
// Preserve backward-compatible named export
export const progressRepository = guestProgressRepository;
