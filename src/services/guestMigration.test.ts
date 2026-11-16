import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialProgressState } from '../engine/progression.ts';
import {
  mergeGuestProgressIntoCloud,
  preserveGuestPracticeSnapshot,
} from './guestMigration.ts';

test('preserveGuestPracticeSnapshot stores guest activity in guestLegacySummary without inflating official XP', () => {
  const guest = createInitialProgressState('Guest');
  guest.totalXp = 9999; // Forged or unverified localStorage XP
  guest.level = 99;
  guest.currentStreak = 50;
  guest.bestStreak = 50;
  guest.completedMissionIds = ['grammar-vault-01'];
  guest.unlockedAchievementIds = ['first_mission', 'perfect_grammar_vault', 'streak_three'];

  const cloud = createInitialProgressState('Maya');
  cloud.learnerId = 'uid-maya';
  cloud.totalXp = 40;
  cloud.completedMissionIds = ['grammar-vault-01'];
  cloud.unlockedAchievementIds = ['first_mission'];

  const migrated = preserveGuestPracticeSnapshot(guest, cloud, '2026-11-16T12:00:00.000Z');
  assert.equal(migrated.learnerId, 'uid-maya');
  assert.equal(migrated.totalXp, 40);
  assert.equal(migrated.level, 1);
  assert.equal(migrated.bestStreak, 0);
  assert.deepEqual(migrated.unlockedAchievementIds, ['first_mission']);
  assert.deepEqual(migrated.guestLegacySummary, {
    guestXpEarned: 9999,
    guestCompletedMissionIds: ['grammar-vault-01'],
    migratedAt: '2026-11-16T12:00:00.000Z',
  });
});

test('mergeGuestProgressIntoCloud ignores empty guest progress and leaves cloud state untouched', () => {
  const guest = createInitialProgressState('Guest');
  const cloud = createInitialProgressState('Maya');
  cloud.learnerId = 'uid-maya';
  cloud.totalXp = 90;

  const merged = mergeGuestProgressIntoCloud(guest, cloud);
  assert.equal(merged.totalXp, 90);
  assert.equal(merged.guestLegacySummary, undefined);
});
