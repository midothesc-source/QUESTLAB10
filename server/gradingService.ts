import crypto from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import {
  commitMissionCompletion,
  createInitialProgressState,
  SCHEMA_VERSION,
} from '../src/engine/progression.ts';
import { validateMissionPayload } from '../src/engine/missionValidation.ts';
import { preserveGuestPracticeSnapshot } from '../src/services/guestMigration.ts';
import type {
  AuthoritativeGradeResponse,
  GradeAttemptRequest,
  LearnerProgressState,
  MissionDefinition,
  MissionQuestion,
  MissionRunSummary,
  PracticeGradeResponse,
  PublicMissionDefinition,
  QuestionResultEntry,
  SubjectWorldId,
  SubmittedAnswerItem,
} from '../src/types/questlab.ts';
import {
  getCuratedAnswerKey,
  getCuratedMission,
  type ServerAnswerKeyRecord,
} from './curatedKeys.ts';
import { HttpError, type VerifiedFirebaseUser } from './firebaseAdmin.ts';

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

export interface DbSnapshot {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

export interface DbTransaction {
  get(docPath: string): Promise<DbSnapshot>;
  set(docPath: string, data: Record<string, unknown>, options?: { merge?: boolean }): void;
  update(docPath: string, data: Record<string, unknown>): void;
  delete(docPath: string): void;
}

export interface DbAdapter {
  getDoc(docPath: string): Promise<DbSnapshot>;
  queryWhereEq(collectionPath: string, field: string, value: unknown): Promise<DbSnapshot[]>;
  runTransaction<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T>;
}

export function createFirestoreDbAdapter(firestore: Firestore): DbAdapter {
  return {
    async getDoc(docPath: string): Promise<DbSnapshot> {
      const snap = await firestore.doc(docPath).get();
      return {
        id: snap.id,
        exists: snap.exists,
        data: () => snap.data() as Record<string, unknown> | undefined,
      };
    },
    async queryWhereEq(collectionPath: string, field: string, value: unknown): Promise<DbSnapshot[]> {
      const snap = await firestore.collection(collectionPath).where(field, '==', value).get();
      return snap.docs.map((d) => ({
        id: d.id,
        exists: true,
        data: () => d.data() as Record<string, unknown> | undefined,
      }));
    },
    async runTransaction<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
      return firestore.runTransaction(async (adminTx) => {
        const txAdapter: DbTransaction = {
          async get(docPath: string) {
            const snap = await adminTx.get(firestore.doc(docPath));
            return {
              id: snap.id,
              exists: snap.exists,
              data: () => snap.data() as Record<string, unknown> | undefined,
            };
          },
          set(docPath: string, data: Record<string, unknown>, options?: { merge?: boolean }) {
            if (options?.merge) {
              adminTx.set(firestore.doc(docPath), data, { merge: true });
            } else {
              adminTx.set(firestore.doc(docPath), data);
            }
          },
          update(docPath: string, data: Record<string, unknown>) {
            adminTx.update(firestore.doc(docPath), data);
          },
          delete(docPath: string) {
            adminTx.delete(firestore.doc(docPath));
          },
        };
        return fn(txAdapter);
      });
    },
  };
}

function assertValidId(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !VALID_ID_REGEX.test(value)) {
    throw new HttpError(400, `Invalid or missing ${fieldName}.`);
  }
  return value;
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

export function sanitizeProgressState(
  raw: Record<string, unknown> | undefined,
  uid: string,
  fallbackDisplayName: string,
): LearnerProgressState {
  if (!raw || typeof raw !== 'object') {
    return {
      ...createInitialProgressState(fallbackDisplayName),
      learnerId: uid,
    };
  }

  const base = createInitialProgressState(fallbackDisplayName);
  const candidate = raw as Partial<LearnerProgressState>;
  return {
    schemaVersion: SCHEMA_VERSION,
    learnerId: uid,
    displayName:
      typeof candidate.displayName === 'string' && candidate.displayName.trim()
        ? candidate.displayName.trim().slice(0, 80)
        : base.displayName,
    totalXp: typeof candidate.totalXp === 'number' && candidate.totalXp >= 0 ? candidate.totalXp : 0,
    level: typeof candidate.level === 'number' && candidate.level >= 1 ? candidate.level : 1,
    currentStreak:
      typeof candidate.currentStreak === 'number' && candidate.currentStreak >= 0
        ? candidate.currentStreak
        : 0,
    bestStreak:
      typeof candidate.bestStreak === 'number' && candidate.bestStreak >= 0
        ? candidate.bestStreak
        : 0,
    completedMissionIds: Array.isArray(candidate.completedMissionIds)
      ? candidate.completedMissionIds.filter((id): id is string => typeof id === 'string')
      : [],
    missionRecords:
      candidate.missionRecords && typeof candidate.missionRecords === 'object'
        ? candidate.missionRecords
        : {},
    unlockedAchievementIds: Array.isArray(candidate.unlockedAchievementIds)
      ? candidate.unlockedAchievementIds.filter((id): id is string => typeof id === 'string')
      : [],
    analytics:
      candidate.analytics && typeof candidate.analytics === 'object'
        ? {
            totalQuestionsAnswered: Number(candidate.analytics.totalQuestionsAnswered || 0),
            totalCorrectAnswers: Number(candidate.analytics.totalCorrectAnswers || 0),
            lastActiveAt:
              typeof candidate.analytics.lastActiveAt === 'string'
                ? candidate.analytics.lastActiveAt
                : null,
          }
        : base.analytics,
    ...(candidate.guestLegacySummary
      ? { guestLegacySummary: candidate.guestLegacySummary }
      : {}),
  };
}

function normalizeAnswersPayload(answers: unknown): SubmittedAnswerItem[] {
  if (!Array.isArray(answers) || answers.length === 0) {
    throw new HttpError(400, 'Submitted answers must be a non-empty array.');
  }

  return answers.map((item, idx) => {
    if (!item || typeof item !== 'object') {
      throw new HttpError(400, `Answer at index ${idx} is malformed.`);
    }
    const candidate = item as { questionId?: unknown; selectedOptionId?: unknown };
    if (
      typeof candidate.questionId !== 'string' ||
      !VALID_ID_REGEX.test(candidate.questionId) ||
      typeof candidate.selectedOptionId !== 'string' ||
      !VALID_ID_REGEX.test(candidate.selectedOptionId)
    ) {
      throw new HttpError(400, `Answer at index ${idx} has invalid questionId or selectedOptionId.`);
    }
    return {
      questionId: candidate.questionId,
      selectedOptionId: candidate.selectedOptionId,
    };
  });
}

export function validateCompleteAttemptAnswers(
  answers: SubmittedAnswerItem[],
  keyRecord: ServerAnswerKeyRecord,
): Map<string, string> {
  const questionMap = new Map(keyRecord.questions.map((q) => [q.id, q]));
  const submittedMap = new Map<string, string>();

  for (const entry of answers) {
    if (submittedMap.has(entry.questionId)) {
      throw new HttpError(400, `Duplicate answer submitted for question "${entry.questionId}".`);
    }
    const questionKey = questionMap.get(entry.questionId);
    if (!questionKey) {
      throw new HttpError(400, `Question "${entry.questionId}" does not belong to this mission.`);
    }
    if (!questionKey.optionIds.includes(entry.selectedOptionId)) {
      throw new HttpError(
        400,
        `Option "${entry.selectedOptionId}" is not valid for question "${entry.questionId}".`,
      );
    }
    submittedMap.set(entry.questionId, entry.selectedOptionId);
  }

  if (submittedMap.size !== keyRecord.questions.length) {
    throw new HttpError(
      400,
      `Incomplete attempt: expected ${keyRecord.questions.length} answers, received ${submittedMap.size}.`,
    );
  }

  return submittedMap;
}

export function computeAnswersHash(answers: SubmittedAnswerItem[]): string {
  const canonical = [...answers]
    .sort((a, b) => a.questionId.localeCompare(b.questionId))
    .map((a) => `${a.questionId}:${a.selectedOptionId}`)
    .join('|');
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function buildKeyRecordFromFirestore(
  missionId: string,
  missionData: Record<string, unknown>,
  keyData: Record<string, unknown>,
): ServerAnswerKeyRecord {
  const rawQuestions = Array.isArray(missionData.questions) ? missionData.questions : [];
  const rawAnswers = (keyData.answers || {}) as Record<
    string,
    { correctOptionId?: unknown; explanation?: unknown }
  >;

  const missionTeacherId = String(missionData.teacherId || '');
  const keyTeacherId = String(keyData.teacherId || '');
  if (!missionTeacherId || missionTeacherId !== keyTeacherId) {
    throw new HttpError(403, 'Mission answer key ownership mismatch.');
  }

  if (rawQuestions.length === 0) {
    throw new HttpError(500, 'Mission has no gradable questions configured.');
  }

  const parsedQuestions = rawQuestions.map((q) => {
    const qObj = q as { id?: unknown; options?: Array<{ id?: unknown }> };
    const qId = String(qObj.id || '');
    const keyEntry = rawAnswers[qId];
    const optionIds = Array.isArray(qObj.options)
      ? qObj.options.map((o) => String(o?.id || '')).filter(Boolean)
      : [];

    if (
      !qId ||
      !keyEntry ||
      typeof keyEntry.correctOptionId !== 'string' ||
      !optionIds.includes(keyEntry.correctOptionId)
    ) {
      throw new HttpError(500, `Authoritative answer key missing or invalid for question "${qId}".`);
    }

    return {
      id: qId,
      optionIds,
      correctOptionId: keyEntry.correctOptionId,
      explanation: typeof keyEntry.explanation === 'string' ? keyEntry.explanation : '',
    };
  });

  return {
    missionId,
    title: String(missionData.title || 'Mission'),
    worldId: (missionData.worldId as SubjectWorldId) || 'english',
    topic: String(missionData.topic || ''),
    teacherId: missionTeacherId,
    status: missionData.status === 'published' ? 'published' : 'draft',
    xpPerCorrect: Number(missionData.xpPerCorrect ?? 30),
    xpPerIncorrect: Number(missionData.xpPerIncorrect ?? 5),
    questions: parsedQuestions,
  };
}

function gradeAgainstKeyRecord(
  keyRecord: ServerAnswerKeyRecord,
  submittedMap: Map<string, string>,
): QuestionResultEntry[] {
  return keyRecord.questions.map((q) => {
    const selectedOptionId = submittedMap.get(q.id) || '';
    const isCorrect = selectedOptionId === q.correctOptionId;
    return {
      questionId: q.id,
      selectedOptionId,
      isCorrect,
      xpEarned: isCorrect ? keyRecord.xpPerCorrect : keyRecord.xpPerIncorrect,
      correctOptionId: q.correctOptionId,
      explanation: q.explanation,
    };
  });
}

function buildServerMissionDefinition(keyRecord: ServerAnswerKeyRecord): PublicMissionDefinition {
  return {
    id: keyRecord.missionId,
    worldId: keyRecord.worldId,
    title: keyRecord.title,
    subject: '',
    topic: keyRecord.topic,
    summary: '',
    estimatedMinutes: 3,
    objectives: [],
    xpPerCorrect: keyRecord.xpPerCorrect,
    xpPerIncorrect: keyRecord.xpPerIncorrect,
    imageSrc: '',
    imageAlt: '',
    authorType: keyRecord.teacherId === 'curated' ? 'curated' : 'teacher_created',
    teacherId: keyRecord.teacherId,
    status: keyRecord.status,
    questions: keyRecord.questions.map((q) => ({
      id: q.id,
      promptSentence: '',
      targetPhrase: '',
      questionText: '',
      options: q.optionIds.map((id) => ({ id, keyLabel: id.toUpperCase(), text: '' })),
      hint: '',
    })),
  };
}

/**
 * Authoritative transactional mission grading for authenticated learners.
 * Enforces mission publication status, complete non-duplicate answers, assignment eligibility,
 * idempotency per (uid, attemptId), server-only progression commit, and submission creation.
 */
export async function executeAuthoritativeGradingTransaction(
  db: DbAdapter,
  user: VerifiedFirebaseUser,
  body: Partial<GradeAttemptRequest>,
): Promise<AuthoritativeGradeResponse> {
  const missionId = assertValidId(body.missionId, 'missionId');
  const attemptId = assertValidId(body.attemptId, 'attemptId');
  const assignmentId =
    body.assignmentId !== undefined && body.assignmentId !== null && body.assignmentId !== ''
      ? assertValidId(body.assignmentId, 'assignmentId')
      : undefined;

  const normalizedAnswers = normalizeAnswersPayload(body.answers);
  const answersHash = computeAnswersHash(normalizedAnswers);
  const curatedKey = getCuratedAnswerKey(missionId);

  const gradingAttemptPath = `gradingAttempts/${user.uid}_${attemptId}`;
  const progressPath = `users/${user.uid}/progress/current`;
  const userPath = `users/${user.uid}`;
  const assignmentPath = assignmentId ? `assignments/${assignmentId}` : null;

  return db.runTransaction(async (tx) => {
    // 1. Perform all transactional reads upfront
    const attemptSnap = await tx.get(gradingAttemptPath);
    const progressSnap = await tx.get(progressPath);
    const userSnap = await tx.get(userPath);
    const assignmentSnap = assignmentPath ? await tx.get(assignmentPath) : null;

    let keyRecord: ServerAnswerKeyRecord;
    if (curatedKey) {
      keyRecord = curatedKey;
    } else {
      const [missionSnap, keySnap] = await Promise.all([
        tx.get(`missions/${missionId}`),
        tx.get(`missionAnswerKeys/${missionId}`),
      ]);
      if (!missionSnap.exists) {
        throw new HttpError(404, 'Mission not found.');
      }
      if (!keySnap.exists) {
        throw new HttpError(
          404,
          'Authoritative answer key unavailable for this mission.',
        );
      }
      keyRecord = buildKeyRecordFromFirestore(
        missionId,
        missionSnap.data() || {},
        keySnap.data() || {},
      );
    }

    // 2. Check idempotency BEFORE mutating state
    if (attemptSnap.exists) {
      const prev = attemptSnap.data() as {
        uid?: string;
        missionId?: string;
        answersHash?: string;
        submissionId?: string;
        assignmentCompleted?: boolean;
        summary?: MissionRunSummary;
        progressSnapshot?: LearnerProgressState;
      };

      if (
        prev.uid !== user.uid ||
        prev.missionId !== missionId ||
        prev.answersHash !== answersHash
      ) {
        throw new HttpError(
          409,
          'Attempt ID conflict: this attemptId was already submitted with different answers or mission.',
        );
      }

      if (prev.summary && prev.progressSnapshot && prev.submissionId) {
        return {
          missionId,
          attemptId,
          submissionId: prev.submissionId,
          assignmentCompleted: Boolean(prev.assignmentCompleted),
          idempotentReplay: true,
          summary: prev.summary,
          authoritativeProgress: prev.progressSnapshot,
        };
      }
    }

    // 3. Enforce mission status
    if (keyRecord.status !== 'published') {
      throw new HttpError(403, 'Draft missions cannot be graded or award XP.');
    }

    // 4. Validate complete attempt answers strictly against server mission/key
    const submittedMap = validateCompleteAttemptAnswers(normalizedAnswers, keyRecord);

    // 5. Validate assignment ownership, mission match, and eligibility if supplied
    if (assignmentSnap) {
      if (!assignmentSnap.exists) {
        throw new HttpError(404, 'Assigned mission record not found.');
      }
      const assignData = assignmentSnap.data() || {};
      if (assignData.studentUid !== user.uid) {
        throw new HttpError(403, 'You do not have permission to complete this assignment.');
      }
      if (assignData.missionId !== missionId) {
        throw new HttpError(400, 'Assignment does not match the submitted mission.');
      }
      if (assignData.status !== 'assigned') {
        throw new HttpError(409, 'This assignment has already been completed.');
      }
    }

    // 6. Grade on server and commit progression deterministically
    const userData = userSnap.data() || {};
    const displayName = String(
      userData.displayName || user.displayName || user.email?.split('@')[0] || 'Explorer',
    ).slice(0, 80);

    const existingProgress = sanitizeProgressState(
      progressSnap.exists ? progressSnap.data() : undefined,
      user.uid,
      displayName,
    );

    const questionResults = gradeAgainstKeyRecord(keyRecord, submittedMap);
    const serverMission = buildServerMissionDefinition(keyRecord);
    const nowDate = new Date();
    const nowIso = nowDate.toISOString();

    const { nextState, summary } = commitMissionCompletion(
      existingProgress,
      serverMission,
      questionResults,
      nowIso,
    );

    const submissionId = `${user.uid}_${attemptId}`.slice(0, 128);
    const submissionDoc: Record<string, unknown> = {
      id: submissionId,
      studentUid: user.uid,
      studentName: displayName,
      missionId: keyRecord.missionId,
      missionTitle: keyRecord.title.slice(0, 120),
      worldId: keyRecord.worldId,
      topic: keyRecord.topic.slice(0, 120),
      correctCount: summary.correctCount,
      totalQuestions: summary.totalQuestions,
      xpEarnedInRun: summary.xpEarnedInRun,
      xpAddedToProfile: summary.xpAddedToProfile,
      bestStreakInRun: summary.bestStreakInRun,
      completedAt: nowDate,
    };

    if (
      keyRecord.teacherId &&
      keyRecord.teacherId !== 'curated' &&
      VALID_ID_REGEX.test(keyRecord.teacherId)
    ) {
      submissionDoc.teacherId = keyRecord.teacherId;
    }

    const assignmentCompleted = Boolean(assignmentPath && assignmentSnap?.exists);

    // 7. Apply atomic writes
    tx.set(progressPath, {
      ...nextState,
      updatedAt: nowDate,
    });

    tx.set(`submissions/${submissionId}`, submissionDoc);

    if (assignmentPath && assignmentCompleted) {
      tx.update(assignmentPath, {
        status: 'completed',
        updatedAt: nowDate,
      });
    }

    tx.set(gradingAttemptPath, {
      uid: user.uid,
      attemptId,
      missionId,
      answersHash,
      submissionId,
      assignmentId: assignmentId || null,
      assignmentCompleted,
      summary,
      progressSnapshot: nextState,
      createdAt: nowDate,
    });

    return {
      missionId,
      attemptId,
      submissionId,
      assignmentCompleted,
      summary,
      authoritativeProgress: nextState,
    };
  });
}

/**
 * Guest practice grading strictly limited to curated public missions.
 * Never persists official XP or Firestore records.
 */
export function executeGuestPracticeGrading(body: {
  missionId?: unknown;
  answers?: unknown;
}): PracticeGradeResponse {
  const missionId = assertValidId(body.missionId, 'missionId');
  const curatedMission = getCuratedMission(missionId);
  const curatedKey = getCuratedAnswerKey(missionId);
  if (!curatedMission || !curatedKey) {
    throw new HttpError(404, 'Curated practice mission not found.');
  }

  const normalizedAnswers = normalizeAnswersPayload(body.answers);
  const submittedMap = validateCompleteAttemptAnswers(normalizedAnswers, curatedKey);
  const questionResults = gradeAgainstKeyRecord(curatedKey, submittedMap);

  const { summary } = commitMissionCompletion(
    createInitialProgressState('Guest'),
    curatedMission,
    questionResults,
  );

  return {
    missionId,
    isPracticeOnly: true,
    summary,
  };
}

// --- Server-Side Progress Operations ---

export async function getOrInitServerProgress(
  db: DbAdapter,
  user: VerifiedFirebaseUser,
): Promise<LearnerProgressState> {
  return db.runTransaction(async (tx) => {
    const progressPath = `users/${user.uid}/progress/current`;
    const [progressSnap, userSnap] = await Promise.all([
      tx.get(progressPath),
      tx.get(`users/${user.uid}`),
    ]);

    const displayName = String(
      userSnap.data()?.displayName || user.displayName || user.email?.split('@')[0] || 'Explorer',
    ).slice(0, 80);

    if (progressSnap.exists) {
      return sanitizeProgressState(progressSnap.data(), user.uid, displayName);
    }

    const fresh: LearnerProgressState = {
      ...createInitialProgressState(displayName),
      learnerId: user.uid,
    };
    tx.set(progressPath, {
      ...fresh,
      updatedAt: new Date(),
    });
    return fresh;
  });
}

export async function resetServerProgress(
  db: DbAdapter,
  user: VerifiedFirebaseUser,
): Promise<LearnerProgressState> {
  return db.runTransaction(async (tx) => {
    const progressPath = `users/${user.uid}/progress/current`;
    const userSnap = await tx.get(`users/${user.uid}`);
    const displayName = String(
      userSnap.data()?.displayName || user.displayName || user.email?.split('@')[0] || 'Explorer',
    ).slice(0, 80);

    const fresh: LearnerProgressState = {
      ...createInitialProgressState(displayName),
      learnerId: user.uid,
    };
    tx.set(progressPath, {
      ...fresh,
      updatedAt: new Date(),
    });
    return fresh;
  });
}

export async function preserveGuestPracticeOnServer(
  db: DbAdapter,
  user: VerifiedFirebaseUser,
  guestSnapshot: { guestXpEarned?: unknown; guestCompletedMissionIds?: unknown },
): Promise<LearnerProgressState> {
  const guestXpEarned =
    typeof guestSnapshot.guestXpEarned === 'number' && Number.isFinite(guestSnapshot.guestXpEarned)
      ? Math.max(0, Math.min(100000, Math.floor(guestSnapshot.guestXpEarned)))
      : 0;
  const guestCompletedMissionIds = Array.isArray(guestSnapshot.guestCompletedMissionIds)
    ? guestSnapshot.guestCompletedMissionIds
        .filter((id): id is string => typeof id === 'string' && VALID_ID_REGEX.test(id))
        .slice(0, 100)
    : [];

  return db.runTransaction(async (tx) => {
    const progressPath = `users/${user.uid}/progress/current`;
    const [progressSnap, userSnap] = await Promise.all([
      tx.get(progressPath),
      tx.get(`users/${user.uid}`),
    ]);

    const displayName = String(
      userSnap.data()?.displayName || user.displayName || user.email?.split('@')[0] || 'Explorer',
    ).slice(0, 80);

    const existingCloud = sanitizeProgressState(
      progressSnap.exists ? progressSnap.data() : undefined,
      user.uid,
      displayName,
    );

    const guestState: LearnerProgressState = {
      ...createInitialProgressState('Guest'),
      totalXp: guestXpEarned,
      completedMissionIds: guestCompletedMissionIds,
    };

    const nextState = preserveGuestPracticeSnapshot(guestState, existingCloud);
    tx.set(progressPath, {
      ...nextState,
      updatedAt: new Date(),
    });
    return nextState;
  });
}

// --- Teacher Mission Ownership & Answer Key Management ---

function stripMissionPrivateAnswersForFirestore(mission: MissionDefinition) {
  return {
    id: mission.id,
    worldId: mission.worldId,
    title: mission.title.trim().slice(0, 120),
    subject: mission.subject.trim().slice(0, 60),
    topic: mission.topic.trim().slice(0, 120),
    gradeLevel: (mission.gradeLevel || 'General').trim().slice(0, 40),
    difficulty: mission.difficulty || 'Intermediate',
    summary: mission.summary.trim().slice(0, 600),
    estimatedMinutes: Math.max(1, Math.min(120, Math.round(mission.estimatedMinutes))),
    xpPerCorrect: Math.max(1, Math.min(200, Math.round(mission.xpPerCorrect))),
    xpPerIncorrect: Math.max(0, Math.min(50, Math.round(mission.xpPerIncorrect))),
    objectives: mission.objectives.map((o) => o.trim()).filter(Boolean).slice(0, 8),
    imageSrc: (mission.imageSrc || '/src/assets/images/world_english_grammar_1794854621776.jpg').slice(
      0,
      240,
    ),
    imageAlt: (mission.imageAlt || 'QUESTLAB Mission').slice(0, 240),
    authorType: mission.authorType || 'ai_generated',
    questions: mission.questions.map((q) => ({
      id: q.id,
      promptSentence: q.promptSentence.trim(),
      targetPhrase: (q.targetPhrase || '').trim(),
      questionText: q.questionText.trim(),
      options: q.options.map((opt) => ({
        id: opt.id,
        keyLabel: opt.keyLabel,
        text: opt.text.trim(),
      })),
      hint: q.hint.trim(),
    })),
  };
}

function buildAnswersMap(questions: MissionQuestion[]) {
  const answersMap: Record<string, { correctOptionId: string; explanation: string }> = {};
  for (const q of questions) {
    answersMap[q.id] = {
      correctOptionId: q.correctOptionId,
      explanation: q.explanation.trim(),
    };
  }
  return answersMap;
}

export async function saveTeacherMissionAuthoritative(
  db: DbAdapter,
  user: VerifiedFirebaseUser,
  isAdmin: boolean,
  rawMission: unknown,
  status: 'draft' | 'published',
): Promise<MissionDefinition> {
  if (status !== 'draft' && status !== 'published') {
    throw new HttpError(400, 'Status must be "draft" or "published".');
  }

  const validation = validateMissionPayload((rawMission || {}) as Partial<MissionDefinition>);
  if (!validation.valid || !validation.data) {
    throw new HttpError(400, validation.errors[0] || 'Invalid mission payload.');
  }

  const mission = validation.data;
  if (getCuratedMission(mission.id)) {
    throw new HttpError(403, 'Built-in curated missions cannot be modified.');
  }

  const sanitizedPublic = stripMissionPrivateAnswersForFirestore(mission);
  const answersMap = buildAnswersMap(mission.questions);
  const nowDate = new Date();

  const savedTeacherId = await db.runTransaction(async (tx) => {
    const missionPath = `missions/${mission.id}`;
    const keyPath = `missionAnswerKeys/${mission.id}`;
    const [existingMission, existingKey] = await Promise.all([
      tx.get(missionPath),
      tx.get(keyPath),
    ]);

    if (existingMission.exists) {
      const existingOwner = String(existingMission.data()?.teacherId || '');
      if (!isAdmin && existingOwner !== user.uid) {
        throw new HttpError(403, 'You do not own this mission and cannot modify it.');
      }
    }

    if (existingKey.exists) {
      const keyOwner = String(existingKey.data()?.teacherId || '');
      if (!isAdmin && keyOwner && keyOwner !== user.uid) {
        throw new HttpError(403, 'You do not own this mission answer key.');
      }
    }

    const ownerId = existingMission.exists
      ? String(existingMission.data()?.teacherId || user.uid)
      : user.uid;
    const createdAt = existingMission.exists
      ? existingMission.data()?.createdAt || nowDate
      : nowDate;

    tx.set(missionPath, {
      ...sanitizedPublic,
      teacherId: ownerId,
      status,
      createdAt,
      updatedAt: nowDate,
    });

    tx.set(keyPath, {
      missionId: mission.id,
      teacherId: ownerId,
      answers: answersMap,
      updatedAt: nowDate,
    });

    return ownerId;
  });

  return {
    ...mission,
    teacherId: savedTeacherId,
    status,
    updatedAt: nowDate.toISOString(),
  };
}

export async function registerMissionKeyAuthoritative(
  db: DbAdapter,
  user: VerifiedFirebaseUser,
  isAdmin: boolean,
  rawMission: unknown,
): Promise<{ ok: true; missionId: string; persistedToAdminFirestore: true }> {
  const validation = validateMissionPayload((rawMission || {}) as Partial<MissionDefinition>);
  if (!validation.valid || !validation.data) {
    throw new HttpError(400, validation.errors[0] || 'Valid mission payload is required.');
  }

  const mission = validation.data;
  if (getCuratedMission(mission.id)) {
    throw new HttpError(403, 'Built-in curated mission keys cannot be overwritten.');
  }

  const answersMap = buildAnswersMap(mission.questions);
  const nowDate = new Date();

  await db.runTransaction(async (tx) => {
    const [missionSnap, keySnap] = await Promise.all([
      tx.get(`missions/${mission.id}`),
      tx.get(`missionAnswerKeys/${mission.id}`),
    ]);

    if (missionSnap.exists) {
      const missionOwner = String(missionSnap.data()?.teacherId || '');
      if (!isAdmin && missionOwner !== user.uid) {
        throw new HttpError(403, 'Forbidden: you do not own this mission.');
      }
    }

    if (keySnap.exists) {
      const keyOwner = String(keySnap.data()?.teacherId || '');
      if (!isAdmin && keyOwner && keyOwner !== user.uid) {
        throw new HttpError(403, 'Forbidden: you do not own this answer key.');
      }
    }

    const ownerId = missionSnap.exists
      ? String(missionSnap.data()?.teacherId || user.uid)
      : user.uid;

    tx.set(`missionAnswerKeys/${mission.id}`, {
      missionId: mission.id,
      teacherId: ownerId,
      answers: answersMap,
      updatedAt: nowDate,
    });
  });

  return { ok: true, missionId: mission.id, persistedToAdminFirestore: true };
}

function hydrateTeacherMission(
  missionId: string,
  missionData: Record<string, unknown>,
  keyData: Record<string, unknown> | undefined,
): MissionDefinition {
  const rawQuestions = Array.isArray(missionData.questions) ? missionData.questions : [];
  const rawAnswers = (keyData?.answers || {}) as Record<
    string,
    { correctOptionId?: string; explanation?: string }
  >;

  const hydratedQuestions: MissionQuestion[] = rawQuestions.map((q) => {
    const qObj = q as Record<string, unknown>;
    const qId = String(qObj.id || '');
    const secret = rawAnswers[qId] || {};
    return {
      id: qId,
      promptSentence: String(qObj.promptSentence || ''),
      targetPhrase: String(qObj.targetPhrase || ''),
      questionText: String(qObj.questionText || ''),
      options: Array.isArray(qObj.options)
        ? (qObj.options as MissionQuestion['options'])
        : [],
      hint: String(qObj.hint || ''),
      correctOptionId: String(secret.correctOptionId || qObj.correctOptionId || 'a'),
      explanation: String(secret.explanation || qObj.explanation || ''),
    };
  });

  return {
    id: missionId,
    worldId: (missionData.worldId as SubjectWorldId) || 'english',
    title: String(missionData.title || ''),
    subject: String(missionData.subject || ''),
    topic: String(missionData.topic || ''),
    gradeLevel: typeof missionData.gradeLevel === 'string' ? missionData.gradeLevel : undefined,
    difficulty: missionData.difficulty as MissionDefinition['difficulty'],
    summary: String(missionData.summary || ''),
    estimatedMinutes: Number(missionData.estimatedMinutes || 3),
    objectives: Array.isArray(missionData.objectives) ? (missionData.objectives as string[]) : [],
    xpPerCorrect: Number(missionData.xpPerCorrect || 30),
    xpPerIncorrect: Number(missionData.xpPerIncorrect || 5),
    imageSrc: String(
      missionData.imageSrc || '/src/assets/images/world_english_grammar_1794854621776.jpg',
    ),
    imageAlt: String(missionData.imageAlt || 'QUESTLAB Mission'),
    authorType: (missionData.authorType as MissionDefinition['authorType']) || 'ai_generated',
    teacherId: String(missionData.teacherId || ''),
    status: missionData.status === 'published' ? 'published' : 'draft',
    createdAt: toIsoString(missionData.createdAt),
    updatedAt: toIsoString(missionData.updatedAt),
    questions: hydratedQuestions,
  };
}

export async function listTeacherMissionsAuthoritative(
  db: DbAdapter,
  user: VerifiedFirebaseUser,
): Promise<MissionDefinition[]> {
  const missionSnaps = await db.queryWhereEq('missions', 'teacherId', user.uid);
  const hydrated = await Promise.all(
    missionSnaps.map(async (snap) => {
      const keySnap = await db.getDoc(`missionAnswerKeys/${snap.id}`);
      return hydrateTeacherMission(snap.id, snap.data() || {}, keySnap.data());
    }),
  );
  return hydrated.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export async function getTeacherMissionDraftAuthoritative(
  db: DbAdapter,
  user: VerifiedFirebaseUser,
  isAdmin: boolean,
  rawMissionId: unknown,
): Promise<MissionDefinition> {
  const missionId = assertValidId(rawMissionId, 'missionId');
  const [missionSnap, keySnap] = await Promise.all([
    db.getDoc(`missions/${missionId}`),
    db.getDoc(`missionAnswerKeys/${missionId}`),
  ]);

  if (!missionSnap.exists) {
    throw new HttpError(404, 'Mission not found.');
  }

  const missionData = missionSnap.data() || {};
  if (!isAdmin && String(missionData.teacherId || '') !== user.uid) {
    throw new HttpError(403, 'You do not have permission to view this mission draft.');
  }

  return hydrateTeacherMission(missionId, missionData, keySnap.data());
}

export async function updateTeacherMissionStatusAuthoritative(
  db: DbAdapter,
  user: VerifiedFirebaseUser,
  isAdmin: boolean,
  rawMissionId: unknown,
  status: unknown,
): Promise<{ ok: true; missionId: string; status: 'draft' | 'published' }> {
  const missionId = assertValidId(rawMissionId, 'missionId');
  if (status !== 'draft' && status !== 'published') {
    throw new HttpError(400, 'Status must be "draft" or "published".');
  }

  await db.runTransaction(async (tx) => {
    const missionPath = `missions/${missionId}`;
    const [missionSnap, keySnap] = await Promise.all([
      tx.get(missionPath),
      tx.get(`missionAnswerKeys/${missionId}`),
    ]);

    if (!missionSnap.exists) {
      throw new HttpError(404, 'Mission not found.');
    }
    const missionData = missionSnap.data() || {};
    if (!isAdmin && String(missionData.teacherId || '') !== user.uid) {
      throw new HttpError(403, 'You do not own this mission.');
    }

    if (status === 'published' && !keySnap.exists) {
      throw new HttpError(
        400,
        'Cannot publish mission without an authoritative server answer key.',
      );
    }

    tx.update(missionPath, {
      status,
      updatedAt: new Date(),
    });
  });

  return { ok: true, missionId, status };
}

export async function deleteTeacherMissionAuthoritative(
  db: DbAdapter,
  user: VerifiedFirebaseUser,
  isAdmin: boolean,
  rawMissionId: unknown,
): Promise<{ ok: true; missionId: string }> {
  const missionId = assertValidId(rawMissionId, 'missionId');

  await db.runTransaction(async (tx) => {
    const missionPath = `missions/${missionId}`;
    const missionSnap = await tx.get(missionPath);
    if (!missionSnap.exists) {
      throw new HttpError(404, 'Mission not found.');
    }
    const missionData = missionSnap.data() || {};
    if (!isAdmin && String(missionData.teacherId || '') !== user.uid) {
      throw new HttpError(403, 'You do not own this mission.');
    }

    tx.delete(`missionAnswerKeys/${missionId}`);
    tx.delete(missionPath);
  });

  return { ok: true, missionId };
}
