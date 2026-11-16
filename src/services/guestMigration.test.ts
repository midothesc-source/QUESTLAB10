import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialProgressState } from '../engine/progression';
import { mergeGuestProgressIntoCloud } from './guestMigration';

test('mergeGuestProgressIntoCloud migrates guest XP without duplicating existing cloud mission rewards', () => {
  const guest = createInitialProgressState('Guest');
  guest.totalXp = 90;
  guest.level = 1;
  guest.currentStreak = 3;
  guest.bestStreak = 3;
  guest.completedMissionIds = ['grammar-vault-01'];
  guest.unlockedAchievementIds = ['first_mission', 'perfect_grammar_vault', 'streak_three'];
  guest.missionRecords['grammar-vault-01'] = {
    missionId: 'grammar-vault-01',
    bestScore: 3,
    totalQuestions: 3,
    xpAwarded: 90,
    attemptsCount: 1,
    lastCompletedAt: '2026-11-16T10:00:00.000Z',
    bestStreakAchieved: 3,
  };

  // Cloud already had 40 XP on grammar-vault-01 -> should add only +50 delta (90 total), not 40+90=130
  const cloud = createInitialProgressState('Maya');
  cloud.learnerId = 'uid-maya';
  cloud.totalXp = 40;
  cloud.completedMissionIds = ['grammar-vault-01'];
  cloud.unlockedAchievementIds = ['first_mission'];
  cloud.missionRecords['grammar-vault-01'] = {
    missionId: 'grammar-vault-01',
    bestScore: 1,
    totalQuestions: 3,
    xpAwarded: 40,
    attemptsCount: 1,
    lastCompletedAt: '2026-11-16T09:00:00.000Z',
    bestStreakAchieved: 1,
  };

  const merged = mergeGuestProgressIntoCloud(guest, cloud);
  assert.equal(merged.learnerId, 'uid-maya');
  assert.equal(merged.totalXp, 90);
  assert.equal(merged.bestStreak, 3);
  assert.equal(merged.missionRecords['grammar-vault-01'].bestScore, 3);
  assert.equal(merged.missionRecords['grammar-vault-01'].attemptsCount, 2);
  assert.ok(merged.unlockedAchievementIds.includes('perfect_grammar_vault'));
});

test('mergeGuestProgressIntoCloud does not add XP when cloud already has equal or higher mission XP', () => {
  const guest = createInitialProgressState('Guest');
  guest.totalXp = 65;
  guest.completedMissionIds = ['grammar-vault-01'];
  guest.missionRecords['grammar-vault-01'] = {
    missionId: 'grammar-vault-01',
    bestScore: 2,
    totalQuestions: 3,
    xpAwarded: 65,
    attemptsCount: 1,
    lastCompletedAt: '2026-11-16T10:00:00.000Z',
    bestStreakAchieved: 2,
  };

  const cloud = createInitialProgressState('Maya');
  cloud.learnerId = 'uid-maya';
  cloud.totalXp = 90;
  cloud.completedMissionIds = ['grammar-vault-01'];
  cloud.missionRecords['grammar-vault-01'] = {
    missionId: 'grammar-vault-01',
    bestScore: 3,
    totalQuestions: 3,
    xpAwarded: 90,
    attemptsCount: 1,
    lastCompletedAt: '2026-11-16T11:00:00.000Z',
    bestStreakAchieved: 3,
  };

  const merged = mergeGuestProgressIntoCloud(guest, cloud);
  assert.equal(merged.totalXp, 90);
  assert.equal(merged.missionRecords['grammar-vault-01'].bestScore, 3);
});
