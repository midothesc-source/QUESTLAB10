export type SubjectWorldId = 'english' | 'mathematics' | 'science' | 'business';

export type UserRole = 'student' | 'teacher';

export type MissionStatus = 'draft' | 'published';

export type DifficultyLevel = 'Foundational' | 'Intermediate' | 'Advanced';

export type QuestionStyle = 'conceptual' | 'applied' | 'analytical';

export type ScreenRoute =
  | 'landing'
  | 'dashboard'
  | 'missions'
  | 'briefing'
  | 'quiz'
  | 'completion'
  | 'profile'
  | 'teacher'
  | 'auth';

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

export interface StudentMissionQuestion {
  id: string;
  promptSentence: string;
  targetPhrase: string;
  questionText: string;
  options: QuestionOption[];
  hint: string;
}

export interface MissionDefinition {
  id: string;
  worldId: SubjectWorldId;
  title: string;
  subject: string;
  topic: string;
  gradeLevel?: string;
  difficulty?: DifficultyLevel;
  summary: string;
  estimatedMinutes: number;
  objectives: string[];
  xpPerCorrect: number;
  xpPerIncorrect: number;
  imageSrc: string;
  imageAlt: string;
  authorType: 'curated' | 'ai_generated' | 'teacher_created';
  teacherId?: string;
  status?: MissionStatus;
  createdAt?: string;
  updatedAt?: string;
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
  correctOptionId?: string;
  explanation?: string;
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

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
  gradeBand?: string;
  bio?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClassRoom {
  id: string;
  name: string;
  subject: string;
  gradeLevel: string;
  teacherId: string;
  createdAt: string;
}

export interface ClassEnrollment {
  id: string;
  classId: string;
  className: string;
  teacherId: string;
  studentUid: string;
  studentName: string;
  studentEmail: string;
  joinedAt: string;
}

export interface MissionAssignment {
  id: string;
  missionId: string;
  missionTitle: string;
  worldId: SubjectWorldId;
  classId: string;
  className: string;
  teacherId: string;
  studentUid: string;
  dueDate?: string;
  status: 'assigned' | 'completed';
  createdAt: string;
  updatedAt?: string;
}

export interface MissionSubmission {
  id: string;
  studentUid: string;
  studentName: string;
  missionId: string;
  missionTitle: string;
  worldId: SubjectWorldId;
  topic?: string;
  teacherId?: string;
  correctCount: number;
  totalQuestions: number;
  xpEarnedInRun: number;
  xpAddedToProfile: number;
  bestStreakInRun?: number;
  completedAt: string;
}

export interface AIMissionGeneratorInput {
  worldId: SubjectWorldId;
  subject: string;
  topic: string;
  gradeLevel: string;
  difficulty: DifficultyLevel;
  questionCount: number;
  questionStyle: QuestionStyle;
  learningObjectives: string[];
}

export interface ProgressRepository {
  load(): Promise<LearnerProgressState> | LearnerProgressState;
  save(state: LearnerProgressState): Promise<void> | void;
  reset(): Promise<LearnerProgressState> | LearnerProgressState;
}
