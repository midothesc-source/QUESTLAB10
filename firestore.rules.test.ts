import fs from 'node:fs';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

before(async () => {
  const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  testEnv = await initializeTestEnvironment({
    projectId: 'questlab-rules-test',
    firestore: {
      rules,
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv.cleanup();
});

test('students cannot self-assign teacher role, inject ghost fields, or read another user PII', async () => {
  const s1Db = testEnv.authenticatedContext('student-1', {
    email: 's1@example.com',
    email_verified: true,
  }).firestore();
  const s2Db = testEnv.authenticatedContext('student-2', {
    email: 's2@example.com',
    email_verified: true,
  }).firestore();

  await assertFails(
    setDoc(doc(s1Db, 'users/student-1'), {
      uid: 'student-1',
      displayName: 'Hack Teacher',
      email: 's1@example.com',
      role: 'teacher',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );

  await assertFails(
    setDoc(doc(s1Db, 'users/student-1'), {
      uid: 'student-1',
      displayName: 'Ghost',
      email: 's1@example.com',
      role: 'student',
      isVerified: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );

  await assertSucceeds(
    setDoc(doc(s1Db, 'users/student-1'), {
      uid: 'student-1',
      displayName: 'Student One',
      email: 's1@example.com',
      role: 'student',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );

  await assertFails(getDoc(doc(s2Db, 'users/student-1')));
});

test('students cannot write progress/current, submissions, missionAnswerKeys, gradingAttempts, or private keys', async () => {
  const s1Db = testEnv.authenticatedContext('student-1', {
    email: 's1@example.com',
    email_verified: true,
  }).firestore();

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const adminDb = ctx.firestore();
    await setDoc(doc(adminDb, 'users/student-1/progress/current'), {
      schemaVersion: 2,
      learnerId: 'student-1',
      displayName: 'Student One',
      totalXp: 30,
      level: 1,
      currentStreak: 1,
      bestStreak: 1,
      completedMissionIds: [],
      missionRecords: {},
      unlockedAchievementIds: [],
      analytics: { totalQuestionsAnswered: 1, totalCorrectAnswers: 1, lastActiveAt: null },
      updatedAt: new Date(),
    });
    await setDoc(doc(adminDb, 'missionAnswerKeys/m1'), {
      missionId: 'm1',
      teacherId: 'teacher-1',
      answers: { q1: { correctOptionId: 'a', explanation: 'Because' } },
      updatedAt: new Date(),
    });
    await setDoc(doc(adminDb, 'gradingAttempts/student-1_att-1'), {
      uid: 'student-1',
      attemptId: 'att-1',
      missionId: 'm1',
      answersHash: 'a'.repeat(64),
      submissionId: 'sub-1',
      createdAt: new Date(),
    });
  });

  // Owner can read own progress
  await assertSucceeds(getDoc(doc(s1Db, 'users/student-1/progress/current')));

  // Owner CANNOT create or update progress/current
  await assertFails(
    updateDoc(doc(s1Db, 'users/student-1/progress/current'), {
      totalXp: 99999,
      updatedAt: serverTimestamp(),
    }),
  );

  // Student CANNOT create forged submission
  await assertFails(
    setDoc(doc(s1Db, 'submissions/forged-sub'), {
      id: 'forged-sub',
      studentUid: 'student-1',
      studentName: 'Student One',
      missionId: 'm1',
      missionTitle: 'Mission 1',
      worldId: 'english',
      correctCount: 3,
      totalQuestions: 3,
      xpEarnedInRun: 90,
      xpAddedToProfile: 90,
      completedAt: serverTimestamp(),
    }),
  );

  // Student CANNOT read or write answer keys, legacy private docs, or gradingAttempts
  await assertFails(getDoc(doc(s1Db, 'missionAnswerKeys/m1')));
  await assertFails(getDoc(doc(s1Db, 'gradingAttempts/student-1_att-1')));
  await assertFails(
    setDoc(doc(s1Db, 'missions/m1/private/answerKey'), {
      missionId: 'm1',
      teacherId: 'student-1',
      answers: {},
      updatedAt: serverTimestamp(),
    }),
  );
});

test('students cannot update assignment status to completed and teachers cannot assign unowned/draft missions', async () => {
  const s1Db = testEnv.authenticatedContext('student-1', {
    email: 's1@example.com',
    email_verified: true,
  }).firestore();
  const t1Db = testEnv.authenticatedContext('teacher-1', {
    email: 't1@example.com',
    email_verified: true,
  }).firestore();

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const adminDb = ctx.firestore();
    await setDoc(doc(adminDb, 'teachers/teacher-1'), {
      uid: 'teacher-1',
      grantedAt: new Date(),
    });
    await setDoc(doc(adminDb, 'classes/class-1'), {
      id: 'class-1',
      name: 'Biology 101',
      teacherId: 'teacher-1',
      createdAt: new Date(),
    });
    await setDoc(doc(adminDb, 'missions/draft-m1'), {
      id: 'draft-m1',
      worldId: 'science',
      title: 'Draft Bio',
      subject: 'Biology',
      topic: 'Cells',
      summary: 'A cellular biology mission.',
      estimatedMinutes: 5,
      xpPerCorrect: 30,
      xpPerIncorrect: 5,
      objectives: ['Understand cell membranes'],
      questions: [{ id: 'q1' }],
      teacherId: 'teacher-1',
      status: 'draft',
      authorType: 'teacher_created',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await setDoc(doc(adminDb, 'assignments/a-1'), {
      id: 'a-1',
      missionId: 'grammar-vault-01',
      missionTitle: 'The Grammar Vault',
      worldId: 'english',
      classId: 'class-1',
      className: 'Biology 101',
      teacherId: 'teacher-1',
      studentUid: 'student-1',
      status: 'assigned',
      createdAt: new Date(),
    });
  });

  // Student CANNOT mark assignment completed client-side
  await assertFails(
    updateDoc(doc(s1Db, 'assignments/a-1'), {
      status: 'completed',
      updatedAt: serverTimestamp(),
    }),
  );

  // Teacher CANNOT assign a draft mission
  await assertFails(
    setDoc(doc(t1Db, 'assignments/a-draft'), {
      id: 'a-draft',
      missionId: 'draft-m1',
      missionTitle: 'Draft Bio',
      worldId: 'science',
      classId: 'class-1',
      className: 'Biology 101',
      teacherId: 'teacher-1',
      studentUid: 'student-1',
      status: 'assigned',
      createdAt: serverTimestamp(),
    }),
  );
});
