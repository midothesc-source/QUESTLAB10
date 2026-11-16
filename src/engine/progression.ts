import { ACHIEVEMENTS } from '../data/missions.ts';
import type {
  AchievementDefinition,
  LearnerProgressState,
  MissionDefinition,
  MissionQuestion,
  MissionRunSummary,
  QuestionResultEntry,
} from '../types/questlab';

export const XP_PER_LEVEL = 100;
export const SCHEMA_VERSION = 1;

export const RANK_TITLES = [
  'Cadet Explorer',
  'Orbital Navigator',
  'Archive Scholar',
  'Sector Strategist',
  'Master Cartographer',
] as const;

export interface LevelInfo {
  level: number;
  rankTitle: string;
  xpIntoCurrentLevel: number;
  xpNeededForNextLevel: number;
  progressPercent: number;
}

export function createInitialProgressState(displayName = 'Explorer'): LearnerProgressState {
  return {
    schemaVersion: SCHEMA_VERSION,
    learnerId: 'local-explorer',
    displayName,
    totalXp: 0,
    level: 1,
    currentStreak: 0,
    bestStreak: 0,
    completedMissionIds: [],
    missionRecords: {},
    unlockedAchievementIds: [],
    analytics: {
      totalQuestionsAnswered: 0,
      totalCorrectAnswers: 0,
      lastActiveAt: null,
    },
  };
}

export function calculateLevelInfo(totalXp: number): LevelInfo {
  const safeXp = Math.max(0, Math.floor(totalXp));
  const level = Math.floor(safeXp / XP_PER_LEVEL) + 1;
  const xpIntoCurrentLevel = safeXp % XP_PER_LEVEL;
  const xpNeededForNextLevel = XP_PER_LEVEL - xpIntoCurrentLevel;
  const progressPercent = Math.round((xpIntoCurrentLevel / XP_PER_LEVEL) * 100);
  const rankIndex = Math.min(level - 1, RANK_TITLES.length - 1);

  return {
    level,
    rankTitle: RANK_TITLES[rankIndex],
    xpIntoCurrentLevel,
    xpNeededForNextLevel,
    progressPercent,
  };
}

export interface EvaluatedQuestionOutcome {
  isCorrect: boolean;
  xpEarned: number;
  nextRunStreak: number;
  nextBestRunStreak: number;
}

export function evaluateQuestionAnswer(
  question: MissionQuestion,
  selectedOptionId: string,
  mission: MissionDefinition,
  currentRunStreak: number,
  bestRunStreak: number,
): EvaluatedQuestionOutcome {
  const isCorrect = selectedOptionId === question.correctOptionId;
  const xpEarned = isCorrect ? mission.xpPerCorrect : mission.xpPerIncorrect;
  const nextRunStreak = isCorrect ? currentRunStreak + 1 : 0;
  const nextBestRunStreak = Math.max(bestRunStreak, nextRunStreak);

  return {
    isCorrect,
    xpEarned,
    nextRunStreak,
    nextBestRunStreak,
  };
}

export interface CommitMissionResult {
  nextState: LearnerProgressState;
  summary: MissionRunSummary;
}

export function commitMissionCompletion(
  currentState: LearnerProgressState,
  mission: MissionDefinition,
  questionResults: QuestionResultEntry[],
  completedAtIso: string = new Date().toISOString(),
): CommitMissionResult {
  const correctCount = questionResults.filter((entry) => entry.isCorrect).length;
  const totalQuestions = mission.questions.length;
  const xpEarnedInRun = questionResults.reduce((sum, entry) => sum + entry.xpEarned, 0);

  let runningStreak = currentState.currentStreak;
  let bestRunStreak = 0;
  let localRunStreak = 0;

  for (const entry of questionResults) {
    if (entry.isCorrect) {
      runningStreak += 1;
      localRunStreak += 1;
      bestRunStreak = Math.max(bestRunStreak, localRunStreak);
    } else {
      runningStreak = 0;
      localRunStreak = 0;
    }
  }

  const existingRecord = currentState.missionRecords[mission.id];
  const previousBestXp = existingRecord?.xpAwarded ?? 0;
  const previousBestScore = existingRecord?.bestScore ?? 0;

  // Replay protection: never duplicate previously awarded mission XP.
  // If a learner improves upon a prior partial score, award only the incremental delta.
  const newBestXpForMission = Math.max(previousBestXp, xpEarnedInRun);
  const xpAddedToProfile = Math.max(0, newBestXpForMission - previousBestXp);
  const isReplayPractice = Boolean(existingRecord) && xpAddedToProfile === 0;

  const nextTotalXp = currentState.totalXp + xpAddedToProfile;
  const levelInfo = calculateLevelInfo(nextTotalXp);
  const nextBestStreak = Math.max(currentState.bestStreak, runningStreak, bestRunStreak);

  const completedMissionIds = currentState.completedMissionIds.includes(mission.id)
    ? currentState.completedMissionIds
    : [...currentState.completedMissionIds, mission.id];

  const nextMissionRecords = {
    ...currentState.missionRecords,
    [mission.id]: {
      missionId: mission.id,
      bestScore: Math.max(previousBestScore, correctCount),
      totalQuestions,
      xpAwarded: newBestXpForMission,
      attemptsCount: (existingRecord?.attemptsCount ?? 0) + 1,
      lastCompletedAt: completedAtIso,
      bestStreakAchieved: Math.max(existingRecord?.bestStreakAchieved ?? 0, bestRunStreak),
    },
  };

  const newlyUnlockedAchievements: AchievementDefinition[] = [];
  const nextAchievementIds = new Set(currentState.unlockedAchievementIds);

  const tryUnlock = (achievementId: string) => {
    if (!nextAchievementIds.has(achievementId)) {
      const def = ACHIEVEMENTS.find((item) => item.id === achievementId);
      if (def) {
        nextAchievementIds.add(achievementId);
        newlyUnlockedAchievements.push(def);
      }
    }
  };

  if (completedMissionIds.length >= 1) {
    tryUnlock('first_mission');
  }
  if (mission.id === 'grammar-vault-01' && correctCount === totalQuestions) {
    tryUnlock('perfect_grammar_vault');
  }
  if (nextBestStreak >= 3) {
    tryUnlock('streak_three');
  }

  const nextState: LearnerProgressState = {
    ...currentState,
    totalXp: nextTotalXp,
    level: levelInfo.level,
    currentStreak: runningStreak,
    bestStreak: nextBestStreak,
    completedMissionIds,
    missionRecords: nextMissionRecords,
    unlockedAchievementIds: Array.from(nextAchievementIds),
    analytics: {
      totalQuestionsAnswered:
        currentState.analytics.totalQuestionsAnswered + questionResults.length,
      totalCorrectAnswers: currentState.analytics.totalCorrectAnswers + correctCount,
      lastActiveAt: completedAtIso,
    },
  };

  const summary: MissionRunSummary = {
    missionId: mission.id,
    correctCount,
    totalQuestions,
    xpEarnedInRun,
    xpAddedToProfile,
    isReplayPractice,
    previousBestXp,
    bestStreakInRun: bestRunStreak,
    endingStreakInRun: localRunStreak,
    newlyUnlockedAchievements,
    questionResults,
  };

  return { nextState, summary };
}
