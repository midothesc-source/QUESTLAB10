import type {
  AIMissionGeneratorInput,
  LearnerProgressState,
  MissionDefinition,
  MissionQuestion,
  MissionRunSummary,
  QuestionResultEntry,
} from '../types/questlab';
import { getCurrentIdToken } from './authService';

async function authorizedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getCurrentIdToken();
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(url, { ...options, headers });
}

export interface ServerHealthStatus {
  ok: boolean;
  geminiConfigured: boolean;
  geminiModel: string;
  firebaseProjectId: string;
  firebaseAdminConfigured: boolean;
}

export async function fetchServerHealth(): Promise<ServerHealthStatus> {
  const res = await fetch('/api/health');
  if (!res.ok) {
    throw new Error('Unable to reach QUESTLAB API server.');
  }
  return (await res.json()) as ServerHealthStatus;
}

export async function generateMissionViaAI(
  input: AIMissionGeneratorInput,
): Promise<MissionDefinition> {
  const res = await authorizedFetch('/api/ai/generate-mission', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  const payload = (await res.json()) as { mission?: MissionDefinition; error?: string };
  if (!res.ok || !payload.mission) {
    throw new Error(payload.error || 'Failed to generate mission with Gemini.');
  }
  return payload.mission;
}

export async function regenerateQuestionViaAI(params: {
  subject: string;
  topic: string;
  gradeLevel: string;
  difficulty: string;
  existingQuestionId: string;
  previousQuestionText?: string;
}): Promise<MissionQuestion> {
  const res = await authorizedFetch('/api/ai/regenerate-question', {
    method: 'POST',
    body: JSON.stringify(params),
  });

  const payload = (await res.json()) as { question?: MissionQuestion; error?: string };
  if (!res.ok || !payload.question) {
    throw new Error(payload.error || 'Failed to regenerate question.');
  }
  return payload.question;
}

export async function registerMissionKeyOnServer(mission: MissionDefinition): Promise<void> {
  const res = await authorizedFetch('/api/missions/register-key', {
    method: 'POST',
    body: JSON.stringify({ mission }),
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || 'Failed to register mission answer key on server.');
  }
}

export interface SingleQuestionGradeResponse {
  questionId: string;
  selectedOptionId: string;
  isCorrect: boolean;
  xpEarned: number;
  correctOptionId: string;
  explanation: string;
}

export async function gradeSingleQuestionOnServer(
  missionId: string,
  questionId: string,
  selectedOptionId: string,
): Promise<SingleQuestionGradeResponse> {
  const res = await authorizedFetch('/api/missions/grade-question', {
    method: 'POST',
    body: JSON.stringify({ missionId, questionId, selectedOptionId }),
  });

  const payload = (await res.json()) as SingleQuestionGradeResponse & { error?: string };
  if (!res.ok) {
    throw new Error(payload.error || 'Server question validation failed.');
  }
  return payload;
}

export interface ServerGradeResponse {
  missionId: string;
  teacherId: string;
  questionResults: QuestionResultEntry[];
  authoritativeProgress: LearnerProgressState | null;
  summary: MissionRunSummary | null;
}

export async function gradeMissionOnServer(
  missionId: string,
  answers: Array<{ questionId: string; selectedOptionId: string }>,
): Promise<ServerGradeResponse> {
  const res = await authorizedFetch('/api/missions/grade', {
    method: 'POST',
    body: JSON.stringify({ missionId, answers }),
  });

  const payload = (await res.json()) as ServerGradeResponse & { error?: string };
  if (!res.ok) {
    throw new Error(payload.error || 'Server grading failed.');
  }
  return payload;
}
