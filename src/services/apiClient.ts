import type {
  AIMissionGeneratorInput,
  AuthoritativeGradeResponse,
  GradeAttemptRequest,
  LearnerProgressState,
  MissionDefinition,
  MissionQuestion,
  PracticeGradeResponse,
  SubmittedAnswerItem,
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

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const payload = (await res.json()) as { error?: string };
    return payload.error || fallback;
  } catch {
    return fallback;
  }
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

export async function saveTeacherMissionOnServer(
  mission: MissionDefinition,
  status: 'draft' | 'published',
): Promise<MissionDefinition> {
  const res = await authorizedFetch('/api/missions/save', {
    method: 'POST',
    body: JSON.stringify({ mission, status }),
  });

  const payload = (await res.json().catch(() => ({}))) as {
    mission?: MissionDefinition;
    error?: string;
  };
  if (!res.ok || !payload.mission) {
    throw new Error(payload.error || 'Failed to save mission on server.');
  }
  return payload.mission;
}

export async function fetchTeacherMissionsFromServer(): Promise<MissionDefinition[]> {
  const res = await authorizedFetch('/api/missions/teacher', { method: 'GET' });
  const payload = (await res.json().catch(() => ({}))) as {
    missions?: MissionDefinition[];
    error?: string;
  };
  if (!res.ok || !Array.isArray(payload.missions)) {
    throw new Error(payload.error || 'Failed to load teacher missions from server.');
  }
  return payload.missions;
}

export async function fetchTeacherMissionDraftFromServer(
  missionId: string,
): Promise<MissionDefinition> {
  const res = await authorizedFetch(`/api/missions/${encodeURIComponent(missionId)}/teacher-draft`, {
    method: 'GET',
  });
  const payload = (await res.json().catch(() => ({}))) as {
    mission?: MissionDefinition;
    error?: string;
  };
  if (!res.ok || !payload.mission) {
    throw new Error(payload.error || 'Failed to load mission draft.');
  }
  return payload.mission;
}

export async function updateMissionStatusOnServer(
  missionId: string,
  status: 'draft' | 'published',
): Promise<void> {
  const res = await authorizedFetch(`/api/missions/${encodeURIComponent(missionId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, 'Failed to update mission status.'));
  }
}

export async function deleteTeacherMissionOnServer(missionId: string): Promise<void> {
  const res = await authorizedFetch(`/api/missions/${encodeURIComponent(missionId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, 'Failed to delete mission.'));
  }
}

export async function registerMissionKeyOnServer(mission: MissionDefinition): Promise<void> {
  const res = await authorizedFetch('/api/missions/register-key', {
    method: 'POST',
    body: JSON.stringify({ mission }),
  });

  if (!res.ok) {
    throw new Error(
      await parseErrorMessage(res, 'Failed to register mission answer key on server.'),
    );
  }
}

export async function submitMissionAttemptOnServer(
  request: GradeAttemptRequest,
): Promise<AuthoritativeGradeResponse> {
  const res = await authorizedFetch('/api/missions/grade', {
    method: 'POST',
    body: JSON.stringify(request),
  });

  const payload = (await res.json().catch(() => ({}))) as AuthoritativeGradeResponse & {
    error?: string;
  };
  if (!res.ok || !payload.summary || !payload.authoritativeProgress) {
    throw new Error(
      payload.error || 'Server grading could not be completed. Your answers have been preserved.',
    );
  }
  return payload;
}

export async function submitGuestPracticeOnServer(
  missionId: string,
  answers: SubmittedAnswerItem[],
): Promise<PracticeGradeResponse> {
  const res = await fetch('/api/missions/practice-grade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ missionId, answers }),
  });

  const payload = (await res.json().catch(() => ({}))) as PracticeGradeResponse & {
    error?: string;
  };
  if (!res.ok || !payload.summary) {
    throw new Error(payload.error || 'Unable to evaluate guest practice attempt.');
  }
  return payload;
}

export async function fetchServerProgress(): Promise<LearnerProgressState> {
  const res = await authorizedFetch('/api/progress', { method: 'GET' });
  const payload = (await res.json().catch(() => ({}))) as {
    progress?: LearnerProgressState;
    error?: string;
  };
  if (!res.ok || !payload.progress) {
    throw new Error(payload.error || 'Unable to load authoritative explorer progress.');
  }
  return payload.progress;
}

export async function resetServerProgressOnServer(): Promise<LearnerProgressState> {
  const res = await authorizedFetch('/api/progress/reset', { method: 'POST' });
  const payload = (await res.json().catch(() => ({}))) as {
    progress?: LearnerProgressState;
    error?: string;
  };
  if (!res.ok || !payload.progress) {
    throw new Error(payload.error || 'Unable to reset explorer progress.');
  }
  return payload.progress;
}

export async function preserveGuestPracticeOnServerApi(params: {
  guestXpEarned: number;
  guestCompletedMissionIds: string[];
}): Promise<LearnerProgressState> {
  const res = await authorizedFetch('/api/progress/migrate-guest', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  const payload = (await res.json().catch(() => ({}))) as {
    progress?: LearnerProgressState;
    error?: string;
  };
  if (!res.ok || !payload.progress) {
    throw new Error(payload.error || 'Unable to preserve guest practice summary.');
  }
  return payload.progress;
}
