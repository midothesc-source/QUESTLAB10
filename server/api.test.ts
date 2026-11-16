import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createExpressApp } from './app.ts';
import { HttpError, resolveUserRoles, type VerifiedFirebaseUser } from './firebaseAdmin.ts';
import type { DbAdapter, DbSnapshot, DbTransaction } from './gradingService.ts';
import type { MissionDefinition } from '../src/types/questlab.ts';

class InMemoryTransactionalDb implements DbAdapter {
  readonly docs = new Map<string, Record<string, unknown>>();
  private txChain: Promise<unknown> = Promise.resolve();

  private clone<T>(val: T): T {
    return structuredClone(val);
  }

  async getDoc(docPath: string): Promise<DbSnapshot> {
    const data = this.docs.get(docPath);
    const id = docPath.split('/').pop() || '';
    return {
      id,
      exists: Boolean(data),
      data: () => (data ? this.clone(data) : undefined),
    };
  }

  async queryWhereEq(
    collectionPath: string,
    field: string,
    value: unknown,
  ): Promise<DbSnapshot[]> {
    const prefix = `${collectionPath}/`;
    const results: DbSnapshot[] = [];
    for (const [docPath, data] of this.docs.entries()) {
      if (docPath.startsWith(prefix) && !docPath.slice(prefix.length).includes('/')) {
        if (data[field] === value) {
          results.push({
            id: docPath.slice(prefix.length),
            exists: true,
            data: () => this.clone(data),
          });
        }
      }
    }
    return results;
  }

  async runTransaction<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const stagedWrites = new Map<string, Record<string, unknown> | null>();
      const tx: DbTransaction = {
        get: async (docPath: string) => {
          if (stagedWrites.has(docPath)) {
            const staged = stagedWrites.get(docPath);
            return {
              id: docPath.split('/').pop() || '',
              exists: Boolean(staged),
              data: () => (staged ? this.clone(staged) : undefined),
            };
          }
          return this.getDoc(docPath);
        },
        set: (docPath: string, data: Record<string, unknown>, options?: { merge?: boolean }) => {
          if (options?.merge) {
            const existing = stagedWrites.has(docPath)
              ? stagedWrites.get(docPath) || {}
              : this.docs.get(docPath) || {};
            stagedWrites.set(docPath, { ...this.clone(existing), ...this.clone(data) });
          } else {
            stagedWrites.set(docPath, this.clone(data));
          }
        },
        update: (docPath: string, data: Record<string, unknown>) => {
          const existing = stagedWrites.has(docPath)
            ? stagedWrites.get(docPath)
            : this.docs.get(docPath);
          if (!existing) {
            throw new Error(`Cannot update nonexistent document: ${docPath}`);
          }
          stagedWrites.set(docPath, { ...this.clone(existing), ...this.clone(data) });
        },
        delete: (docPath: string) => {
          stagedWrites.set(docPath, null);
        },
      };

      const result = await fn(tx);
      for (const [docPath, value] of stagedWrites.entries()) {
        if (value === null) {
          this.docs.delete(docPath);
        } else {
          this.docs.set(docPath, value);
        }
      }
      return result;
    };

    const next = this.txChain.then(run, run);
    this.txChain = next.catch(() => undefined);
    return next;
  }
}

function makeUser(overrides: Partial<VerifiedFirebaseUser> = {}): VerifiedFirebaseUser {
  return {
    uid: 'student-1',
    email: 'student1@example.com',
    emailVerified: true,
    displayName: 'Student One',
    rawToken: 'token-student-1',
    ...overrides,
  };
}

function makeValidTeacherMission(id: string, teacherId: string): MissionDefinition {
  return {
    id,
    worldId: 'science',
    title: 'Atomic Structure Lab',
    subject: 'Chemistry',
    topic: 'Electron Orbitals',
    gradeLevel: 'High School',
    difficulty: 'Intermediate',
    summary: 'Analyze atomic shells and valence electrons across periodic groups.',
    estimatedMinutes: 5,
    objectives: ['Identify valence electron configurations cleanly.'],
    xpPerCorrect: 30,
    xpPerIncorrect: 5,
    imageSrc: '/src/assets/images/world_science_biocore_1794854672235.jpg',
    imageAlt: 'Science Mission',
    authorType: 'teacher_created',
    teacherId,
    status: 'published',
    questions: [
      {
        id: 'q-1',
        promptSentence: 'Carbon has atomic number 6 in the periodic table.',
        targetPhrase: 'atomic number 6',
        questionText: 'How many valence electrons does neutral carbon have?',
        options: [
          { id: 'a', keyLabel: 'A', text: '2 valence electrons' },
          { id: 'b', keyLabel: 'B', text: '4 valence electrons' },
          { id: 'c', keyLabel: 'C', text: '6 valence electrons' },
        ],
        correctOptionId: 'b',
        hint: 'Subtract the 2 inner 1s electrons from 6 total electrons.',
        explanation: 'Carbon has electron configuration 1s2 2s2 2p2, giving 4 valence electrons.',
      },
      {
        id: 'q-2',
        promptSentence: 'Neon sits in Group 18 as a noble gas.',
        targetPhrase: 'Group 18',
        questionText: 'Why is neon chemically unreactive?',
        options: [
          { id: 'a', keyLabel: 'A', text: 'Its outer valence shell is full' },
          { id: 'b', keyLabel: 'B', text: 'It has zero protons' },
          { id: 'c', keyLabel: 'C', text: 'It has 1 valence electron' },
        ],
        correctOptionId: 'a',
        hint: 'Check the octet rule for Group 18 elements.',
        explanation: 'Neon has a complete 2s2 2p6 octet, making it energetically stable.',
      },
      {
        id: 'q-3',
        promptSentence: 'Sodium readily loses one electron to form Na+.',
        targetPhrase: 'Na+',
        questionText: 'Which group does sodium belong to?',
        options: [
          { id: 'a', keyLabel: 'A', text: 'Halogens' },
          { id: 'b', keyLabel: 'B', text: 'Noble gases' },
          { id: 'c', keyLabel: 'C', text: 'Alkali metals' },
        ],
        correctOptionId: 'c',
        hint: 'Elements with 1 valence electron sit in Group 1.',
        explanation: 'Sodium is an alkali metal in Group 1 with one outer valence electron.',
      },
    ],
  };
}

async function startTestServer(options: {
  db?: InMemoryTransactionalDb | null;
  tokens?: Record<string, VerifiedFirebaseUser>;
  revokedTokens?: Set<string>;
  grantTeacherRateLimitMax?: number;
} = {}) {
  const db = options.db === undefined ? new InMemoryTransactionalDb() : options.db;
  const tokens = options.tokens || {
    'token-student-1': makeUser({ uid: 'student-1', email: 's1@test.dev' }),
    'token-student-2': makeUser({ uid: 'student-2', email: 's2@test.dev' }),
    'token-teacher-a': makeUser({ uid: 'teacher-a', email: 'ta@test.dev' }),
    'token-teacher-b': makeUser({ uid: 'teacher-b', email: 'tb@test.dev' }),
    'token-admin': makeUser({ uid: 'admin-1', email: 'midothesc@gmail.com', emailVerified: true }),
  };
  const revoked = options.revokedTokens || new Set(['token-revoked']);
  const customClaimsLog: Array<{ uid: string; claims: Record<string, unknown> }> = [];

  if (db) {
    db.docs.set('teachers/teacher-a', { uid: 'teacher-a', grantedAt: new Date() });
    db.docs.set('teachers/teacher-b', { uid: 'teacher-b', grantedAt: new Date() });
    db.docs.set('users/student-1', {
      uid: 'student-1',
      displayName: 'Student One',
      email: 's1@test.dev',
      role: 'teacher', // Intentional spoof attempt on mutable users doc!
    });
  }

  const app = await createExpressApp({
    getDb: () => db,
    getAdminStatus: () => ({ configured: Boolean(db), reason: db ? null : 'Not configured' }),
    getAuthService: () =>
      db
        ? {
            async setCustomUserClaims(uid, claims) {
              customClaimsLog.push({ uid, claims });
            },
          }
        : null,
    verifyToken: async (authHeader, verifyOpts) => {
      if ((verifyOpts?.requireAdminSdk ?? true) && !db) {
        throw new HttpError(503, 'Authoritative Firebase Admin SDK is not configured.');
      }
      if (!authHeader?.startsWith('Bearer ')) {
        throw new HttpError(401, 'Missing Bearer token.');
      }
      const raw = authHeader.slice('Bearer '.length).trim();
      if (revoked.has(raw)) {
        throw new HttpError(401, 'Firebase ID token has been revoked.');
      }
      const user = tokens[raw];
      if (!user) {
        throw new HttpError(401, 'Invalid Firebase ID token.');
      }
      return user;
    },
    resolveRoles: async (user, currentDb) =>
      resolveUserRoles(
        user,
        currentDb
          ? {
              async getDoc(docPath: string) {
                const snap = await currentDb.getDoc(docPath);
                return { exists: snap.exists, data: snap.data() };
              },
            }
          : null,
      ),
    grantTeacherRateLimitMax: options.grantTeacherRateLimitMax ?? 10,
  });

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    db,
    customClaimsLog,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test('removed question-by-question answer oracle returns JSON 404 and unknown /api/* returns JSON 404', async () => {
  const srv = await startTestServer();
  try {
    const oracleRes = await fetch(`${srv.baseUrl}/api/missions/grade-question`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-student-1',
      },
      body: JSON.stringify({
        missionId: 'grammar-vault-01',
        questionId: 'gv-q1',
        selectedOptionId: 'a',
      }),
    });
    assert.equal(oracleRes.status, 404);
    const oracleBody = (await oracleRes.json()) as { error?: string };
    assert.ok(oracleBody.error);

    const unknownApi = await fetch(`${srv.baseUrl}/api/nonexistent-endpoint`);
    assert.equal(unknownApi.status, 404);
    assert.match(unknownApi.headers.get('content-type') || '', /application\/json/);
  } finally {
    await srv.close();
  }
});

test('fail-closed 503 when Firebase Admin SDK is not configured on authoritative routes', async () => {
  const srv = await startTestServer({ db: null });
  try {
    const gradeRes = await fetch(`${srv.baseUrl}/api/missions/grade`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-student-1',
      },
      body: JSON.stringify({
        missionId: 'grammar-vault-01',
        attemptId: 'att-fail-closed',
        answers: [
          { questionId: 'gv-q1', selectedOptionId: 'a' },
          { questionId: 'gv-q2', selectedOptionId: 'b' },
          { questionId: 'gv-q3', selectedOptionId: 'b' },
        ],
      }),
    });
    assert.equal(gradeRes.status, 503);

    const progressRes = await fetch(`${srv.baseUrl}/api/progress`, {
      headers: { Authorization: 'Bearer token-student-1' },
    });
    assert.equal(progressRes.status, 503);

    const saveRes = await fetch(`${srv.baseUrl}/api/missions/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-teacher-a',
      },
      body: JSON.stringify({ mission: makeValidTeacherMission('m1', 'teacher-a'), status: 'draft' }),
    });
    assert.equal(saveRes.status, 503);
  } finally {
    await srv.close();
  }
});

test('rejects unauthenticated, invalid, and revoked tokens with 401 and ignores mutable users.role spoof', async () => {
  const srv = await startTestServer();
  try {
    const noAuth = await fetch(`${srv.baseUrl}/api/missions/grade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ missionId: 'grammar-vault-01', attemptId: 'a1', answers: [] }),
    });
    assert.equal(noAuth.status, 401);

    const revoked = await fetch(`${srv.baseUrl}/api/missions/grade`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-revoked',
      },
      body: JSON.stringify({ missionId: 'grammar-vault-01', attemptId: 'a1', answers: [] }),
    });
    assert.equal(revoked.status, 401);

    // student-1 has users/student-1.role = 'teacher' spoofed, but NOT in /teachers/student-1
    const spoofTeacherSave = await fetch(`${srv.baseUrl}/api/missions/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-student-1',
      },
      body: JSON.stringify({
        mission: makeValidTeacherMission('spoof-mission', 'student-1'),
        status: 'published',
      }),
    });
    assert.equal(spoofTeacherSave.status, 403);
  } finally {
    await srv.close();
  }
});

test('rejects malformed, incomplete, duplicate, and invalid option grading payloads with 400', async () => {
  const srv = await startTestServer();
  try {
    const cases = [
      // Incomplete
      {
        missionId: 'grammar-vault-01',
        attemptId: 'att-bad-1',
        answers: [{ questionId: 'gv-q1', selectedOptionId: 'a' }],
      },
      // Duplicate questionId
      {
        missionId: 'grammar-vault-01',
        attemptId: 'att-bad-2',
        answers: [
          { questionId: 'gv-q1', selectedOptionId: 'a' },
          { questionId: 'gv-q1', selectedOptionId: 'b' },
          { questionId: 'gv-q3', selectedOptionId: 'b' },
        ],
      },
      // Invalid optionId
      {
        missionId: 'grammar-vault-01',
        attemptId: 'att-bad-3',
        answers: [
          { questionId: 'gv-q1', selectedOptionId: 'z' },
          { questionId: 'gv-q2', selectedOptionId: 'b' },
          { questionId: 'gv-q3', selectedOptionId: 'b' },
        ],
      },
      // Unknown questionId
      {
        missionId: 'grammar-vault-01',
        attemptId: 'att-bad-4',
        answers: [
          { questionId: 'gv-unknown', selectedOptionId: 'a' },
          { questionId: 'gv-q2', selectedOptionId: 'b' },
          { questionId: 'gv-q3', selectedOptionId: 'b' },
        ],
      },
    ];

    for (const payload of cases) {
      const res = await fetch(`${srv.baseUrl}/api/missions/grade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token-student-1',
        },
        body: JSON.stringify(payload),
      });
      assert.equal(res.status, 400);
    }
  } finally {
    await srv.close();
  }
});

test('authoritative grading transaction updates progress, creates submission, completes assignment, enforces idempotency and 409 conflict', async () => {
  const srv = await startTestServer();
  try {
    const db = srv.db!;
    db.docs.set('assignments/assign-s1', {
      id: 'assign-s1',
      missionId: 'grammar-vault-01',
      missionTitle: 'The Grammar Vault',
      worldId: 'english',
      classId: 'class-1',
      className: 'English 101',
      teacherId: 'teacher-a',
      studentUid: 'student-1',
      status: 'assigned',
      createdAt: new Date(),
    });
    db.docs.set('assignments/assign-s2', {
      id: 'assign-s2',
      missionId: 'grammar-vault-01',
      missionTitle: 'The Grammar Vault',
      worldId: 'english',
      classId: 'class-1',
      className: 'English 101',
      teacherId: 'teacher-a',
      studentUid: 'student-2',
      status: 'assigned',
      createdAt: new Date(),
    });

    const partialAnswers = [
      { questionId: 'gv-q1', selectedOptionId: 'a' },
      { questionId: 'gv-q2', selectedOptionId: 'a' },
      { questionId: 'gv-q3', selectedOptionId: 'a' },
    ];

    // Cross-student assignment ownership rejection
    const hijackAssign = await fetch(`${srv.baseUrl}/api/missions/grade`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-student-1',
      },
      body: JSON.stringify({
        missionId: 'grammar-vault-01',
        attemptId: 'att-hijack',
        assignmentId: 'assign-s2',
        answers: partialAnswers,
      }),
    });
    assert.equal(hijackAssign.status, 403);

    // Legitimate partial run (1/3 = 40 XP) completing assign-s1 atomically
    const firstRes = await fetch(`${srv.baseUrl}/api/missions/grade`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-student-1',
      },
      body: JSON.stringify({
        missionId: 'grammar-vault-01',
        attemptId: 'att-run-1',
        assignmentId: 'assign-s1',
        answers: partialAnswers,
      }),
    });
    assert.equal(firstRes.status, 200);
    const firstJson = (await firstRes.json()) as {
      assignmentCompleted: boolean;
      summary: { correctCount: number; xpAddedToProfile: number };
      authoritativeProgress: { totalXp: number };
      submissionId: string;
    };
    assert.equal(firstJson.summary.correctCount, 1);
    assert.equal(firstJson.summary.xpAddedToProfile, 40);
    assert.equal(firstJson.authoritativeProgress.totalXp, 40);
    assert.equal(firstJson.assignmentCompleted, true);
    assert.equal(db.docs.get('assignments/assign-s1')?.status, 'completed');
    assert.ok(db.docs.get(`submissions/${firstJson.submissionId}`));

    // Idempotent replay with same attemptId + same answers -> returns 200 without duplicating XP
    const idempotentRes = await fetch(`${srv.baseUrl}/api/missions/grade`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-student-1',
      },
      body: JSON.stringify({
        missionId: 'grammar-vault-01',
        attemptId: 'att-run-1',
        assignmentId: 'assign-s1',
        answers: partialAnswers,
      }),
    });
    assert.equal(idempotentRes.status, 200);
    const idemJson = (await idempotentRes.json()) as {
      idempotentReplay?: boolean;
      authoritativeProgress: { totalXp: number };
    };
    assert.equal(idemJson.idempotentReplay, true);
    assert.equal(idemJson.authoritativeProgress.totalXp, 40);

    // Same attemptId with DIFFERENT answers -> 409 Conflict
    const perfectAnswers = [
      { questionId: 'gv-q1', selectedOptionId: 'a' },
      { questionId: 'gv-q2', selectedOptionId: 'b' },
      { questionId: 'gv-q3', selectedOptionId: 'b' },
    ];
    const conflictRes = await fetch(`${srv.baseUrl}/api/missions/grade`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-student-1',
      },
      body: JSON.stringify({
        missionId: 'grammar-vault-01',
        attemptId: 'att-run-1',
        answers: perfectAnswers,
      }),
    });
    assert.equal(conflictRes.status, 409);

    // Concurrent submissions with a brand-new attemptId award delta (+50 XP) ONLY ONCE
    const [c1, c2] = await Promise.all([
      fetch(`${srv.baseUrl}/api/missions/grade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token-student-1',
        },
        body: JSON.stringify({
          missionId: 'grammar-vault-01',
          attemptId: 'att-run-2',
          answers: perfectAnswers,
        }),
      }),
      fetch(`${srv.baseUrl}/api/missions/grade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token-student-1',
        },
        body: JSON.stringify({
          missionId: 'grammar-vault-01',
          attemptId: 'att-run-2',
          answers: perfectAnswers,
        }),
      }),
    ]);
    assert.equal(c1.status, 200);
    assert.equal(c2.status, 200);
    assert.equal(db.docs.get('users/student-1/progress/current')?.totalXp, 90);
  } finally {
    await srv.close();
  }
});

test('teacher mission save strips answers from public doc, blocks draft grading, and enforces ownership', async () => {
  const srv = await startTestServer();
  try {
    const db = srv.db!;
    const draftMission = makeValidTeacherMission('chem-lab-01', 'teacher-a');
    draftMission.status = 'draft';

    // Teacher A saves draft
    const saveDraft = await fetch(`${srv.baseUrl}/api/missions/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-teacher-a',
      },
      body: JSON.stringify({ mission: draftMission, status: 'draft' }),
    });
    assert.equal(saveDraft.status, 200);

    // Verify public /missions doc has NO correctOptionId or explanation
    const storedPublic = db.docs.get('missions/chem-lab-01') as {
      questions: Array<Record<string, unknown>>;
    };
    for (const q of storedPublic.questions) {
      assert.equal('correctOptionId' in q, false);
      assert.equal('explanation' in q, false);
    }
    assert.ok(db.docs.get('missionAnswerKeys/chem-lab-01'));

    // Student cannot grade draft mission
    const gradeDraft = await fetch(`${srv.baseUrl}/api/missions/grade`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-student-1',
      },
      body: JSON.stringify({
        missionId: 'chem-lab-01',
        attemptId: 'att-draft-attempt',
        answers: [
          { questionId: 'q-1', selectedOptionId: 'b' },
          { questionId: 'q-2', selectedOptionId: 'a' },
          { questionId: 'q-3', selectedOptionId: 'c' },
        ],
      }),
    });
    assert.equal(gradeDraft.status, 403);

    // Teacher B cannot overwrite Teacher A's mission, register key, view draft, change status, or delete
    const overwriteMission = await fetch(`${srv.baseUrl}/api/missions/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-teacher-b',
      },
      body: JSON.stringify({ mission: draftMission, status: 'published' }),
    });
    assert.equal(overwriteMission.status, 403);

    const overwriteKey = await fetch(`${srv.baseUrl}/api/missions/register-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-teacher-b',
      },
      body: JSON.stringify({ mission: draftMission }),
    });
    assert.equal(overwriteKey.status, 403);

    const readDraft = await fetch(`${srv.baseUrl}/api/missions/chem-lab-01/teacher-draft`, {
      headers: { Authorization: 'Bearer token-teacher-b' },
    });
    assert.equal(readDraft.status, 403);

    const statusHijack = await fetch(`${srv.baseUrl}/api/missions/chem-lab-01/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-teacher-b',
      },
      body: JSON.stringify({ status: 'published' }),
    });
    assert.equal(statusHijack.status, 403);

    const deleteHijack = await fetch(`${srv.baseUrl}/api/missions/chem-lab-01`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer token-teacher-b' },
    });
    assert.equal(deleteHijack.status, 403);

    // Teacher A publishes -> student grades successfully
    const publishRes = await fetch(`${srv.baseUrl}/api/missions/chem-lab-01/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-teacher-a',
      },
      body: JSON.stringify({ status: 'published' }),
    });
    assert.equal(publishRes.status, 200);

    const gradePublished = await fetch(`${srv.baseUrl}/api/missions/grade`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-student-1',
      },
      body: JSON.stringify({
        missionId: 'chem-lab-01',
        attemptId: 'att-chem-1',
        answers: [
          { questionId: 'q-1', selectedOptionId: 'b' },
          { questionId: 'q-2', selectedOptionId: 'a' },
          { questionId: 'q-3', selectedOptionId: 'c' },
        ],
      }),
    });
    assert.equal(gradePublished.status, 200);
    const gradeBody = (await gradePublished.json()) as {
      summary: { correctCount: number; xpAddedToProfile: number };
    };
    assert.equal(gradeBody.summary.correctCount, 3);
    assert.equal(gradeBody.summary.xpAddedToProfile, 90);
  } finally {
    await srv.close();
  }
});

test('guest practice endpoint grades curated missions only without Firestore persistence', async () => {
  const srv = await startTestServer();
  try {
    const okRes = await fetch(`${srv.baseUrl}/api/missions/practice-grade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        missionId: 'grammar-vault-01',
        answers: [
          { questionId: 'gv-q1', selectedOptionId: 'a' },
          { questionId: 'gv-q2', selectedOptionId: 'b' },
          { questionId: 'gv-q3', selectedOptionId: 'b' },
        ],
      }),
    });
    assert.equal(okRes.status, 200);
    const okJson = (await okRes.json()) as {
      isPracticeOnly: boolean;
      summary: { correctCount: number; xpEarnedInRun: number };
    };
    assert.equal(okJson.isPracticeOnly, true);
    assert.equal(okJson.summary.correctCount, 3);
    assert.equal(okJson.summary.xpEarnedInRun, 90);

    const customRes = await fetch(`${srv.baseUrl}/api/missions/practice-grade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        missionId: 'non-curated-id',
        answers: [{ questionId: 'q-1', selectedOptionId: 'a' }],
      }),
    });
    assert.equal(customRes.status, 404);
  } finally {
    await srv.close();
  }
});

test('grant-teacher enforces admin/secret authorization and sliding-window rate limits', async () => {
  process.env.ADMIN_SETUP_SECRET = 'super-secret-value-123';
  const srv = await startTestServer({ grantTeacherRateLimitMax: 3 });
  try {
    // Student without secret -> 403
    const denied = await fetch(`${srv.baseUrl}/api/admin/grant-teacher`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-student-1',
        'x-admin-secret': 'wrong-secret',
      },
      body: JSON.stringify({ targetUid: 'student-2' }),
    });
    assert.equal(denied.status, 403);

    // Valid secret -> 200
    const allowed = await fetch(`${srv.baseUrl}/api/admin/grant-teacher`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-student-1',
        'x-admin-secret': 'super-secret-value-123',
      },
      body: JSON.stringify({ targetUid: 'student-2', targetEmail: 's2@test.dev' }),
    });
    assert.equal(allowed.status, 200);
    assert.ok(srv.db!.docs.get('teachers/student-2'));
    assert.equal(srv.customClaimsLog[0].uid, 'student-2');

    // Admin request #3 succeeds, #4 hits rate limit 429
    const r3 = await fetch(`${srv.baseUrl}/api/admin/grant-teacher`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-admin',
      },
      body: JSON.stringify({ targetUid: 'student-2' }),
    });
    assert.equal(r3.status, 200);

    const r4 = await fetch(`${srv.baseUrl}/api/admin/grant-teacher`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-admin',
      },
      body: JSON.stringify({ targetUid: 'student-2' }),
    });
    assert.equal(r4.status, 429);
    assert.ok(r4.headers.get('retry-after'));
  } finally {
    delete process.env.ADMIN_SETUP_SECRET;
    await srv.close();
  }
});
