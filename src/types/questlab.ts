export type SubjectWorldId = 'english' | 'mathematics' | 'science' | 'business';

export type ScreenRoute =
  | 'landing'
  | 'dashboard'
  | 'missions'
  | 'briefing'
  | 'quiz'
  | 'completion';

export type WorldLockStatus = 'unlocked' | 'locked';

export interface SubjectWorld {
  id: SubjectWorldId;
  sectorLabel: string;
  name: string;
  headline: string;
  description: string;
  status: WorldLockStatus;
  unlockRequirement: string;
  accentHex: string;
  imageSrc: string;
  imageAlt: string;
  missionIds: string[];
}

export interface QuestionOption {
  id: string;
  keyLabel: string;
  text: string;
}

export interface MissionQuestion {
  id: string;
  promptSentence: string;
  targetPhrase: string;
  questionText: string;
  options: QuestionOption[];
  correctOptionId: string;
  hint: string;
  explanation: string;
}

export interface MissionDefinition {
  id: string;
  worldId: SubjectWorldId;
  title: string;
  subject: string;
  topic: string;
  summary: string;
  estimatedMinutes: number;
  objectives: string[];
  xpPerCorrect: number;
  xpPerIncorrect: number;
  imageSrc: string;
  imageAlt: string;
  authorType: 'curated' | 'ai_generated';
  teacherId?: string;
  questions: MissionQuestion[];
}

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  xpThreshold?: number;
}

export interface MissionAttemptRecord {
  missionId: string;
  bestScore: number;
  totalQuestions: number;
  xpAwarded: number;
  attemptsCount: number;
  lastCompletedAt: string;
  bestStreakAchieved: number;
}

export interface LearnerAnalytics {
  totalQuestionsAnswered: number;
  totalCorrectAnswers: number;
  lastActiveAt: string | null;
}

export interface LearnerProgressState {
  schemaVersion: number;
  learnerId: string;
  displayName: string;
  totalXp: number;
  level: number;
  currentStreak: number;
  bestStreak: number;
  completedMissionIds: string[];
  missionRecords: Record<string, MissionAttemptRecord>;
  unlockedAchievementIds: string[];
  analytics: LearnerAnalytics;
}

export interface QuestionResultEntry {
  questionId: string;
  selectedOptionId: string;
  isCorrect: boolean;
  xpEarned: number;
}

export interface MissionRunSummary {
  missionId: string;
  correctCount: number;
  totalQuestions: number;
  xpEarnedInRun: number;
  xpAddedToProfile: number;
  isReplayPractice: boolean;
  previousBestXp: number;
  bestStreakInRun: number;
  endingStreakInRun: number;
  newlyUnlockedAchievements: AchievementDefinition[];
  questionResults: QuestionResultEntry[];
}

/**
 * Future-ready platform contracts for Firebase integration,
 * teacher dashboards, student profiles, and AI-generated missions.
 */
export interface StudentProfile {
  uid: string;
  displayName: string;
  email?: string;
  role: 'student' | 'teacher';
  cohortId?: string;
  createdAt: string;
}

export interface TeacherDashboardSummary {
  teacherId: string;
  cohortName: string;
  activeStudentsCount: number;
  averageMasteryRate: number;
  assignedMissionIds: string[];
}

export interface AIMissionGenerationSpec {
  worldId: SubjectWorldId;
  subject: string;
  topic: string;
  targetGradeBand: string;
  questionCount: number;
}

export interface ProgressRepository {
  load(): LearnerProgressState;
  save(state: LearnerProgressState): void;
  reset(): LearnerProgressState;
}
