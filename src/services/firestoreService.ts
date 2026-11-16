import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { sanitizeId } from '../engine/missionValidation';
import type {
  ClassEnrollment,
  ClassRoom,
  MissionAssignment,
  MissionDefinition,
  MissionSubmission,
  SubjectWorldId,
  UserProfile,
} from '../types/questlab';
import { db, handleFirestoreError, OperationType } from './firebase';

function toIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

function stripMissionPrivateAnswers(mission: MissionDefinition) {
  return {
    id: mission.id,
    worldId: mission.worldId,
    title: mission.title.slice(0, 120),
    subject: mission.subject.slice(0, 60),
    topic: mission.topic.slice(0, 120),
    gradeLevel: (mission.gradeLevel || 'General').slice(0, 40),
    difficulty: mission.difficulty || 'Intermediate',
    summary: mission.summary.slice(0, 600),
    estimatedMinutes: Math.max(1, Math.min(120, Math.round(mission.estimatedMinutes))),
    xpPerCorrect: Math.max(1, Math.min(200, Math.round(mission.xpPerCorrect))),
    xpPerIncorrect: Math.max(0, Math.min(50, Math.round(mission.xpPerIncorrect))),
    objectives: mission.objectives.slice(0, 8),
    imageSrc: mission.imageSrc.slice(0, 240),
    imageAlt: mission.imageAlt.slice(0, 240),
    authorType: mission.authorType,
    questions: mission.questions.map((q) => ({
      id: q.id,
      promptSentence: q.promptSentence,
      targetPhrase: q.targetPhrase,
      questionText: q.questionText,
      options: q.options,
      hint: q.hint,
    })),
  };
}

export async function fetchPublishedMissions(): Promise<MissionDefinition[]> {
  const path = 'missions';
  try {
    const q = query(collection(db, path), where('status', '==', 'published'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        worldId: (data.worldId as SubjectWorldId) || 'english',
        title: String(data.title || ''),
        subject: String(data.subject || ''),
        topic: String(data.topic || ''),
        gradeLevel: typeof data.gradeLevel === 'string' ? data.gradeLevel : undefined,
        difficulty: data.difficulty,
        summary: String(data.summary || ''),
        estimatedMinutes: Number(data.estimatedMinutes || 3),
        objectives: Array.isArray(data.objectives) ? data.objectives : [],
        xpPerCorrect: Number(data.xpPerCorrect || 30),
        xpPerIncorrect: Number(data.xpPerIncorrect || 5),
        imageSrc: String(data.imageSrc || '/src/assets/images/world_english_grammar_1794854621776.jpg'),
        imageAlt: String(data.imageAlt || 'QUESTLAB Mission'),
        authorType: data.authorType || 'teacher_created',
        teacherId: String(data.teacherId || ''),
        status: 'published',
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
        questions: Array.isArray(data.questions) ? data.questions : [],
      } as MissionDefinition;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchTeacherMissions(teacherUid: string): Promise<MissionDefinition[]> {
  const path = 'missions';
  try {
    const q = query(collection(db, path), where('teacherId', '==', teacherUid));
    const snapshot = await getDocs(q);
    const missions = await Promise.all(
      snapshot.docs.map(async (docSnap) => {
        const data = docSnap.data();
        let privateAnswers: Record<string, { correctOptionId?: string; explanation?: string }> = {};
        try {
          const keySnap = await getDoc(doc(db, 'missions', docSnap.id, 'private', 'answerKey'));
          if (keySnap.exists()) {
            privateAnswers = (keySnap.data().answers || {}) as typeof privateAnswers;
          }
        } catch {
          // Ignore if no private key doc exists yet
        }

        const rawQuestions = Array.isArray(data.questions) ? data.questions : [];
        const hydratedQuestions = rawQuestions.map((question: Record<string, unknown>) => {
          const qId = String(question.id || '');
          const secret = privateAnswers[qId] || {};
          return {
            ...question,
            correctOptionId: String(secret.correctOptionId || question.correctOptionId || 'a'),
            explanation: String(secret.explanation || question.explanation || ''),
          };
        });

        return {
          id: docSnap.id,
          worldId: (data.worldId as SubjectWorldId) || 'english',
          title: String(data.title || ''),
          subject: String(data.subject || ''),
          topic: String(data.topic || ''),
          gradeLevel: typeof data.gradeLevel === 'string' ? data.gradeLevel : undefined,
          difficulty: data.difficulty,
          summary: String(data.summary || ''),
          estimatedMinutes: Number(data.estimatedMinutes || 3),
          objectives: Array.isArray(data.objectives) ? data.objectives : [],
          xpPerCorrect: Number(data.xpPerCorrect || 30),
          xpPerIncorrect: Number(data.xpPerIncorrect || 5),
          imageSrc: String(
            data.imageSrc || '/src/assets/images/world_english_grammar_1794854621776.jpg',
          ),
          imageAlt: String(data.imageAlt || 'QUESTLAB Mission'),
          authorType: data.authorType || 'ai_generated',
          teacherId: String(data.teacherId || teacherUid),
          status: data.status === 'published' ? 'published' : 'draft',
          createdAt: toIso(data.createdAt),
          updatedAt: toIso(data.updatedAt),
          questions: hydratedQuestions,
        } as MissionDefinition;
      }),
    );

    return missions.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function saveTeacherMission(
  mission: MissionDefinition,
  teacherUid: string,
  status: 'draft' | 'published',
): Promise<MissionDefinition> {
  const missionRef = doc(db, 'missions', mission.id);
  const privateKeyRef = doc(db, 'missions', mission.id, 'private', 'answerKey');
  const existing = await getDoc(missionRef);

  const sanitized = stripMissionPrivateAnswers(mission);
  const answersMap: Record<string, { correctOptionId: string; explanation: string }> = {};
  for (const q of mission.questions) {
    answersMap[q.id] = {
      correctOptionId: q.correctOptionId,
      explanation: q.explanation,
    };
  }

  const missionPath = `missions/${mission.id}`;
  try {
    if (existing.exists()) {
      await updateDoc(missionRef, {
        ...sanitized,
        status,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(missionRef, {
        ...sanitized,
        teacherId: teacherUid,
        status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await setDoc(privateKeyRef, {
      missionId: mission.id,
      teacherId: teacherUid,
      answers: answersMap,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, missionPath);
  }

  return {
    ...mission,
    teacherId: teacherUid,
    status,
    updatedAt: new Date().toISOString(),
  };
}

export async function updateMissionPublicationStatus(
  missionId: string,
  status: 'draft' | 'published',
): Promise<void> {
  const path = `missions/${missionId}`;
  try {
    await updateDoc(doc(db, 'missions', missionId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteTeacherMission(missionId: string): Promise<void> {
  const path = `missions/${missionId}`;
  try {
    await deleteDoc(doc(db, 'missions', missionId, 'private', 'answerKey')).catch(() => undefined);
    await deleteDoc(doc(db, 'missions', missionId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- Classes & Enrollments ---

export async function createClassRoom(
  teacherUid: string,
  input: { name: string; subject: string; gradeLevel: string },
): Promise<ClassRoom> {
  const classId = `${sanitizeId(input.name, 'class')}-${Date.now().toString(36).slice(-4)}`;
  const path = `classes/${classId}`;

  const payload = {
    id: classId,
    name: input.name.trim().slice(0, 100),
    subject: input.subject.trim().slice(0, 60),
    gradeLevel: input.gradeLevel.trim().slice(0, 40),
    teacherId: teacherUid,
    createdAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'classes', classId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  return {
    id: classId,
    name: payload.name,
    subject: payload.subject,
    gradeLevel: payload.gradeLevel,
    teacherId: teacherUid,
    createdAt: new Date().toISOString(),
  };
}

export async function fetchTeacherClasses(teacherUid: string): Promise<ClassRoom[]> {
  const path = 'classes';
  try {
    const q = query(collection(db, path), where('teacherId', '==', teacherUid));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: String(data.name || ''),
          subject: String(data.subject || ''),
          gradeLevel: String(data.gradeLevel || ''),
          teacherId: String(data.teacherId || ''),
          createdAt: toIso(data.createdAt),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function deleteClassRoom(classId: string): Promise<void> {
  const path = `classes/${classId}`;
  try {
    await deleteDoc(doc(db, 'classes', classId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function fetchTeacherEnrollments(teacherUid: string): Promise<ClassEnrollment[]> {
  const path = 'enrollments';
  try {
    const q = query(collection(db, path), where('teacherId', '==', teacherUid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        classId: String(data.classId || ''),
        className: String(data.className || ''),
        teacherId: String(data.teacherId || ''),
        studentUid: String(data.studentUid || ''),
        studentName: String(data.studentName || ''),
        studentEmail: String(data.studentEmail || ''),
        joinedAt: toIso(data.joinedAt),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchStudentEnrollments(studentUid: string): Promise<ClassEnrollment[]> {
  const path = 'enrollments';
  try {
    const q = query(collection(db, path), where('studentUid', '==', studentUid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        classId: String(data.classId || ''),
        className: String(data.className || ''),
        teacherId: String(data.teacherId || ''),
        studentUid: String(data.studentUid || ''),
        studentName: String(data.studentName || ''),
        studentEmail: String(data.studentEmail || ''),
        joinedAt: toIso(data.joinedAt),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function joinClassByCode(
  classCode: string,
  student: UserProfile,
): Promise<ClassEnrollment> {
  const cleanClassId = classCode.trim();
  const classPath = `classes/${cleanClassId}`;
  let classData: Record<string, unknown> | undefined;

  try {
    const classSnap = await getDoc(doc(db, 'classes', cleanClassId));
    if (!classSnap.exists()) {
      throw new Error('Class code not found. Double-check the code provided by your teacher.');
    }
    classData = classSnap.data();
  } catch (error) {
    if (error instanceof Error && error.message.includes('Class code not found')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.GET, classPath);
  }

  const enrollmentId = `${cleanClassId}_${student.uid}`;
  const enrollmentPath = `enrollments/${enrollmentId}`;
  const teacherId = String(classData.teacherId || '');
  const className = String(classData.name || cleanClassId);

  try {
    await setDoc(doc(db, 'enrollments', enrollmentId), {
      id: enrollmentId,
      classId: cleanClassId,
      className,
      teacherId,
      studentUid: student.uid,
      studentName: student.displayName.slice(0, 80),
      studentEmail: student.email.slice(0, 160),
      joinedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, enrollmentPath);
  }

  return {
    id: enrollmentId,
    classId: cleanClassId,
    className,
    teacherId,
    studentUid: student.uid,
    studentName: student.displayName,
    studentEmail: student.email,
    joinedAt: new Date().toISOString(),
  };
}

export async function addStudentToClass(
  classRoom: ClassRoom,
  studentInput: { studentUid: string; studentName: string; studentEmail: string },
): Promise<ClassEnrollment> {
  const cleanUid = studentInput.studentUid.trim();
  const enrollmentId = `${classRoom.id}_${cleanUid}`;
  const path = `enrollments/${enrollmentId}`;

  try {
    await setDoc(doc(db, 'enrollments', enrollmentId), {
      id: enrollmentId,
      classId: classRoom.id,
      className: classRoom.name.slice(0, 100),
      teacherId: classRoom.teacherId,
      studentUid: cleanUid,
      studentName: studentInput.studentName.trim().slice(0, 80),
      studentEmail: studentInput.studentEmail.trim().slice(0, 160),
      joinedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  return {
    id: enrollmentId,
    classId: classRoom.id,
    className: classRoom.name,
    teacherId: classRoom.teacherId,
    studentUid: cleanUid,
    studentName: studentInput.studentName.trim(),
    studentEmail: studentInput.studentEmail.trim(),
    joinedAt: new Date().toISOString(),
  };
}

export async function removeEnrollment(enrollmentId: string): Promise<void> {
  const path = `enrollments/${enrollmentId}`;
  try {
    await deleteDoc(doc(db, 'enrollments', enrollmentId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- Assignments & Submissions ---

export async function assignMissionToStudents(params: {
  mission: MissionDefinition;
  classRoom: ClassRoom;
  studentEnrollments: ClassEnrollment[];
  teacherUid: string;
  dueDate?: string;
}): Promise<MissionAssignment[]> {
  const created: MissionAssignment[] = [];

  for (const enrollment of params.studentEnrollments) {
    const assignmentId = `${params.classRoom.id}_${params.mission.id}_${enrollment.studentUid}`.slice(
      0,
      128,
    );
    const path = `assignments/${assignmentId}`;
    try {
      await setDoc(doc(db, 'assignments', assignmentId), {
        id: assignmentId,
        missionId: params.mission.id,
        missionTitle: params.mission.title.slice(0, 120),
        worldId: params.mission.worldId,
        classId: params.classRoom.id,
        className: params.classRoom.name.slice(0, 100),
        teacherId: params.teacherUid,
        studentUid: enrollment.studentUid,
        dueDate: (params.dueDate || '').slice(0, 40),
        status: 'assigned',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }

    created.push({
      id: assignmentId,
      missionId: params.mission.id,
      missionTitle: params.mission.title,
      worldId: params.mission.worldId,
      classId: params.classRoom.id,
      className: params.classRoom.name,
      teacherId: params.teacherUid,
      studentUid: enrollment.studentUid,
      dueDate: params.dueDate,
      status: 'assigned',
      createdAt: new Date().toISOString(),
    });
  }

  return created;
}

export async function fetchTeacherAssignments(teacherUid: string): Promise<MissionAssignment[]> {
  const path = 'assignments';
  try {
    const q = query(collection(db, path), where('teacherId', '==', teacherUid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        missionId: String(data.missionId || ''),
        missionTitle: String(data.missionTitle || ''),
        worldId: (data.worldId as SubjectWorldId) || 'english',
        classId: String(data.classId || ''),
        className: String(data.className || ''),
        teacherId: String(data.teacherId || ''),
        studentUid: String(data.studentUid || ''),
        dueDate: typeof data.dueDate === 'string' ? data.dueDate : undefined,
        status: data.status === 'completed' ? 'completed' : 'assigned',
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchStudentAssignments(studentUid: string): Promise<MissionAssignment[]> {
  const path = 'assignments';
  try {
    const q = query(collection(db, path), where('studentUid', '==', studentUid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        missionId: String(data.missionId || ''),
        missionTitle: String(data.missionTitle || ''),
        worldId: (data.worldId as SubjectWorldId) || 'english',
        classId: String(data.classId || ''),
        className: String(data.className || ''),
        teacherId: String(data.teacherId || ''),
        studentUid: String(data.studentUid || ''),
        dueDate: typeof data.dueDate === 'string' ? data.dueDate : undefined,
        status: data.status === 'completed' ? 'completed' : 'assigned',
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function markAssignmentCompleted(assignmentId: string): Promise<void> {
  const path = `assignments/${assignmentId}`;
  try {
    await updateDoc(doc(db, 'assignments', assignmentId), {
      status: 'completed',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function recordMissionSubmission(params: {
  student: UserProfile;
  mission: MissionDefinition;
  teacherId?: string;
  correctCount: number;
  totalQuestions: number;
  xpEarnedInRun: number;
  xpAddedToProfile: number;
  bestStreakInRun: number;
}): Promise<MissionSubmission> {
  const submissionId = `${params.student.uid}_${params.mission.id}_${Date.now().toString(36)}`.slice(
    0,
    128,
  );
  const path = `submissions/${submissionId}`;

  const docPayload: Record<string, unknown> = {
    id: submissionId,
    studentUid: params.student.uid,
    studentName: params.student.displayName.slice(0, 80),
    missionId: params.mission.id,
    missionTitle: params.mission.title.slice(0, 120),
    worldId: params.mission.worldId,
    topic: params.mission.topic.slice(0, 120),
    correctCount: params.correctCount,
    totalQuestions: params.totalQuestions,
    xpEarnedInRun: params.xpEarnedInRun,
    xpAddedToProfile: params.xpAddedToProfile,
    bestStreakInRun: params.bestStreakInRun,
    completedAt: serverTimestamp(),
  };

  if (params.teacherId && /^[a-zA-Z0-9_-]+$/.test(params.teacherId)) {
    docPayload.teacherId = params.teacherId;
  }

  try {
    await setDoc(doc(db, 'submissions', submissionId), docPayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  return {
    id: submissionId,
    studentUid: params.student.uid,
    studentName: params.student.displayName,
    missionId: params.mission.id,
    missionTitle: params.mission.title,
    worldId: params.mission.worldId,
    topic: params.mission.topic,
    teacherId: params.teacherId,
    correctCount: params.correctCount,
    totalQuestions: params.totalQuestions,
    xpEarnedInRun: params.xpEarnedInRun,
    xpAddedToProfile: params.xpAddedToProfile,
    bestStreakInRun: params.bestStreakInRun,
    completedAt: new Date().toISOString(),
  };
}

export async function fetchStudentSubmissions(studentUid: string): Promise<MissionSubmission[]> {
  const path = 'submissions';
  try {
    const q = query(collection(db, path), where('studentUid', '==', studentUid));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          studentUid: String(data.studentUid || ''),
          studentName: String(data.studentName || ''),
          missionId: String(data.missionId || ''),
          missionTitle: String(data.missionTitle || ''),
          worldId: (data.worldId as SubjectWorldId) || 'english',
          topic: typeof data.topic === 'string' ? data.topic : undefined,
          teacherId: typeof data.teacherId === 'string' ? data.teacherId : undefined,
          correctCount: Number(data.correctCount || 0),
          totalQuestions: Number(data.totalQuestions || 0),
          xpEarnedInRun: Number(data.xpEarnedInRun || 0),
          xpAddedToProfile: Number(data.xpAddedToProfile || 0),
          bestStreakInRun:
            typeof data.bestStreakInRun === 'number' ? data.bestStreakInRun : undefined,
          completedAt: toIso(data.completedAt),
        };
      })
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchTeacherSubmissions(teacherUid: string): Promise<MissionSubmission[]> {
  const path = 'submissions';
  try {
    const q = query(collection(db, path), where('teacherId', '==', teacherUid));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          studentUid: String(data.studentUid || ''),
          studentName: String(data.studentName || ''),
          missionId: String(data.missionId || ''),
          missionTitle: String(data.missionTitle || ''),
          worldId: (data.worldId as SubjectWorldId) || 'english',
          topic: typeof data.topic === 'string' ? data.topic : undefined,
          teacherId: typeof data.teacherId === 'string' ? data.teacherId : undefined,
          correctCount: Number(data.correctCount || 0),
          totalQuestions: Number(data.totalQuestions || 0),
          xpEarnedInRun: Number(data.xpEarnedInRun || 0),
          xpAddedToProfile: Number(data.xpAddedToProfile || 0),
          bestStreakInRun:
            typeof data.bestStreakInRun === 'number' ? data.bestStreakInRun : undefined,
          completedAt: toIso(data.completedAt),
        };
      })
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}
