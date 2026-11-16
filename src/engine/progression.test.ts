import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS } from '../data/missions';
import {
  calculateLevelInfo,
  commitMissionCompletion,
  createInitialProgressState,
  evaluateQuestionAnswer,
} from './progression';
import type { QuestionResultEntry } from '../types/questlab';

const grammarVault = MISSIONS[0];

test('calculateLevelInfo handles XP boundaries accurately', () => {
  const lv1Start = calculateLevelInfo(0);
  assert.equal(lv1Start.level, 1);
  assert.equal(lv1Start.xpIntoCurrentLevel, 0);
  assert.equal(lv1Start.xpNeededForNextLevel, 100);
  assert.equal(lv1Start.progressPercent, 0);

  const lv1Almost = calculateLevelInfo(90);
  assert.equal(lv1Almost.level, 1);
  assert.equal(lv1Almost.xpIntoCurrentLevel, 90);
  assert.equal(lv1Almost.xpNeededForNextLevel, 10);
  assert.equal(lv1Almost.progressPercent, 90);

  const lv2 = calculateLevelInfo(100);
  assert.equal(lv2.level, 2);
  assert.equal(lv2.xpIntoCurrentLevel, 0);
  assert.equal(lv2.rankTitle, 'Orbital Navigator');
});

test('evaluateQuestionAnswer awards 30 XP for correct and 5 XP for incorrect', () => {
  const q1 = grammarVault.questions[0];

  const correctOutcome = evaluateQuestionAnswer(q1, q1.correctOptionId, grammarVault, 1, 1);
  assert.equal(correctOutcome.isCorrect, true);
  assert.equal(correctOutcome.xpEarned, 30);
  assert.equal(correctOutcome.nextRunStreak, 2);
  assert.equal(correctOutcome.nextBestRunStreak, 2);

  const wrongOutcome = evaluateQuestionAnswer(q1, 'b', grammarVault, 2, 2);
  assert.equal(wrongOutcome.isCorrect, false);
  assert.equal(wrongOutcome.xpEarned, 5);
  assert.equal(wrongOutcome.nextRunStreak, 0);
  assert.equal(wrongOutcome.nextBestRunStreak, 2);
});

test('commitMissionCompletion prevents duplicate XP rewards on replay while allowing score improvement', () => {
  const initial = createInitialProgressState();

  // Attempt 1: 1 correct (30) + 2 incorrect (5 + 5) = 40 XP
  const partialRun: QuestionResultEntry[] = [
    { questionId: 'gv-q1', selectedOptionId: 'a', isCorrect: true, xpEarned: 30 },
    { questionId: 'gv-q2', selectedOptionId: 'a', isCorrect: false, xpEarned: 5 },
    { questionId: 'gv-q3', selectedOptionId: 'a', isCorrect: false, xpEarned: 5 },
  ];

  const firstCommit = commitMissionCompletion(
    initial,
    grammarVault,
    partialRun,
    '2026-11-16T10:00:00.000Z',
  );
  assert.equal(firstCommit.nextState.totalXp, 40);
  assert.equal(firstCommit.summary.xpAddedToProfile, 40);
  assert.equal(firstCommit.summary.isReplayPractice, false);
  assert.deepEqual(firstCommit.nextState.completedMissionIds, ['grammar-vault-01']);

  // Attempt 2: Replay with perfect 3/3 (90 XP) -> adds only the +50 XP delta, not +90
  const perfectRun: QuestionResultEntry[] = [
    { questionId: 'gv-q1', selectedOptionId: 'a', isCorrect: true, xpEarned: 30 },
    { questionId: 'gv-q2', selectedOptionId: 'b', isCorrect: true, xpEarned: 30 },
    { questionId: 'gv-q3', selectedOptionId: 'b', isCorrect: true, xpEarned: 30 },
  ];

  const secondCommit = commitMissionCompletion(
    firstCommit.nextState,
    grammarVault,
    perfectRun,
    '2026-11-16T10:05:00.000Z',
  );
  assert.equal(secondCommit.nextState.totalXp, 90);
  assert.equal(secondCommit.summary.xpAddedToProfile, 50);
  assert.equal(secondCommit.summary.isReplayPractice, false);
  assert.equal(secondCommit.nextState.bestStreak, 3);
  assert.equal(secondCommit.nextState.missionRecords['grammar-vault-01'].attemptsCount, 2);
  assert.ok(secondCommit.nextState.unlockedAchievementIds.includes('perfect_grammar_vault'));
  assert.ok(secondCommit.nextState.unlockedAchievementIds.includes('streak_three'));

  // Attempt 3: Replay with perfect 3/3 again -> adds 0 duplicate XP
  const thirdCommit = commitMissionCompletion(
    secondCommit.nextState,
    grammarVault,
    perfectRun,
    '2026-11-16T10:10:00.000Z',
  );
  assert.equal(thirdCommit.nextState.totalXp, 90);
  assert.equal(thirdCommit.summary.xpAddedToProfile, 0);
  assert.equal(thirdCommit.summary.isReplayPractice, true);
  assert.equal(thirdCommit.nextState.missionRecords['grammar-vault-01'].attemptsCount, 3);
});
