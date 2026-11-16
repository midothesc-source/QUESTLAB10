import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  firebaseProjectConfig,
  getAdminAuth,
  getAdminDb,
  getFirebaseAdminStatus,
  verifyFirebaseBearerToken,
  verifyTeacherOrAdmin,
} from './server/firebaseAdmin.ts';
import {
  getCuratedOrCachedAnswerKey,
  setRuntimeAnswerKey,
  type ServerAnswerKeyRecord,
} from './server/curatedKeys.ts';
import {
  generateDraftMissionWithGemini,
  getConfiguredGeminiModel,
  regenerateSingleQuestionWithGemini,
} from './server/geminiService.ts';
import { commitMissionCompletion, createInitialProgressState } from './src/engine/progression.ts';
import type {
  AIMissionGeneratorInput,
  LearnerProgressState,
  MissionDefinition,
  QuestionResultEntry,
} from './src/types/questlab.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

async function loadAnswerKeyForMission(missionId: string): Promise<ServerAnswerKeyRecord | null> {
  const curatedOrCached = getCuratedOrCachedAnswerKey(missionId);
  if (curatedOrCached) {
    return curatedOrCached;
  }

  const adminDb = getAdminDb();
  if (!adminDb) {
    return null;
  }

  const [keySnap, missionSnap] = await Promise.all([
    adminDb.doc(`missionAnswerKeys/${missionId}`).get(),
    adminDb.doc(`missions/${missionId}`).get(),
  ]);

  if (!keySnap.exists || !missionSnap.exists) {
    return null;
  }

  const keyData = keySnap.data() as {
    answers?: Record<string, { correctOptionId: string; explanation: string }>;
  };
  const missionData = missionSnap.data() as {
    title?: string;
    worldId?: 'english' | 'mathematics' | 'science' | 'business';
    topic?: string;
    teacherId?: string;
    xpPerCorrect?: number;
    xpPerIncorrect?: number;
    questions?: Array<{ id: string }>;
  };

  if (!keyData?.answers || !missionData?.questions) {
    return null;
  }

  return {
    missionId,
    title: missionData.title || 'Mission',
    worldId: missionData.worldId || 'english',
    topic: missionData.topic || '',
    teacherId: missionData.teacherId || '',
    xpPerCorrect: missionData.xpPerCorrect ?? 30,
    xpPerIncorrect: missionData.xpPerIncorrect ?? 5,
    questions: missionData.questions.map((q) => ({
      id: q.id,
      correctOptionId: keyData.answers?.[q.id]?.correctOptionId || '',
      explanation: keyData.answers?.[q.id]?.explanation || '',
    })),
  };
}

async function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    const geminiKey = process.env.GEMINI_API_KEY;
    const geminiConfigured = Boolean(
      geminiKey && geminiKey.trim().length > 0 && geminiKey !== 'MY_GEMINI_API_KEY',
    );
    const adminStatus = getFirebaseAdminStatus();

    res.json({
      ok: true,
      geminiConfigured,
      geminiModel: getConfiguredGeminiModel(),
      firebaseProjectId: firebaseProjectConfig.projectId,
      firebaseAdminConfigured: adminStatus.configured,
    });
  });

  // Generate draft mission using server-side Gemini SDK
  app.post('/api/ai/generate-mission', async (req, res) => {
    try {
      const user = await verifyFirebaseBearerToken(req.headers.authorization);
      const isTeacher = await verifyTeacherOrAdmin(user);
      if (!isTeacher) {
        return res.status(403).json({
          error: 'Teacher or administrator privileges are required to generate AI missions.',
        });
      }

      const body = req.body as Partial<AIMissionGeneratorInput>;
      if (!body.worldId || !body.subject || !body.topic || !body.gradeLevel || !body.difficulty) {
        return res.status(400).json({
          error: 'Subject, topic, grade level, and difficulty are required.',
        });
      }

      const input: AIMissionGeneratorInput = {
        worldId: body.worldId,
        subject: String(body.subject).trim(),
        topic: String(body.topic).trim(),
        gradeLevel: String(body.gradeLevel).trim(),
        difficulty: body.difficulty,
        questionCount: Number(body.questionCount) || 3,
        questionStyle: body.questionStyle || 'conceptual',
        learningObjectives: Array.isArray(body.learningObjectives)
          ? body.learningObjectives.map((o) => String(o).trim()).filter(Boolean)
          : [],
      };

      const draftMission = await generateDraftMissionWithGemini(input, user.uid);
      return res.json({ mission: draftMission });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate mission.';
      const status =
        message.includes('GEMINI_API_KEY')
          ? 503
          : message.includes('token') || message.includes('Authorization')
            ? 401
            : 500;
      return res.status(status).json({ error: message });
    }
  });

  // Regenerate a single question in a draft mission
  app.post('/api/ai/regenerate-question', async (req, res) => {
    try {
      const user = await verifyFirebaseBearerToken(req.headers.authorization);
      const isTeacher = await verifyTeacherOrAdmin(user);
      if (!isTeacher) {
        return res.status(403).json({
          error: 'Teacher privileges are required to regenerate mission questions.',
        });
      }

      const body = req.body as {
        subject?: string;
        topic?: string;
        gradeLevel?: string;
        difficulty?: string;
        existingQuestionId?: string;
        previousQuestionText?: string;
      };

      if (!body.subject || !body.topic || !body.existingQuestionId) {
        return res.status(400).json({ error: 'Subject, topic, and question ID are required.' });
      }

      const question = await regenerateSingleQuestionWithGemini({
        subject: body.subject,
        topic: body.topic,
        gradeLevel: body.gradeLevel || 'High School',
        difficulty: body.difficulty || 'Intermediate',
        existingQuestionId: body.existingQuestionId,
        previousQuestionText: body.previousQuestionText,
      });

      return res.json({ question });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to regenerate question.';
      const status = message.includes('GEMINI_API_KEY') ? 503 : 500;
      return res.status(status).json({ error: message });
    }
  });

  // Store mission answer keys securely on the server when teacher saves/publishes
  app.post('/api/missions/register-key', async (req, res) => {
    try {
      const user = await verifyFirebaseBearerToken(req.headers.authorization);
      const isTeacher = await verifyTeacherOrAdmin(user);
      if (!isTeacher) {
        return res.status(403).json({ error: 'Teacher privileges required.' });
      }

      const body = req.body as { mission?: MissionDefinition };
      const mission = body.mission;
      if (!mission || !mission.id || !Array.isArray(mission.questions)) {
        return res.status(400).json({ error: 'Valid mission payload is required.' });
      }

      const answersMap: Record<string, { correctOptionId: string; explanation: string }> = {};
      for (const q of mission.questions) {
        answersMap[q.id] = {
          correctOptionId: q.correctOptionId,
          explanation: q.explanation,
        };
      }

      setRuntimeAnswerKey({
        missionId: mission.id,
        title: mission.title,
        worldId: mission.worldId,
        topic: mission.topic,
        teacherId: user.uid,
        xpPerCorrect: mission.xpPerCorrect,
        xpPerIncorrect: mission.xpPerIncorrect,
        questions: mission.questions.map((q) => ({
          id: q.id,
          correctOptionId: q.correctOptionId,
          explanation: q.explanation,
        })),
      });

      const adminDb = getAdminDb();
      if (adminDb) {
        await adminDb.doc(`missionAnswerKeys/${mission.id}`).set({
          missionId: mission.id,
          teacherId: user.uid,
          answers: answersMap,
          updatedAt: new Date().toISOString(),
        });
      }

      return res.json({ ok: true, persistedToAdminFirestore: Boolean(adminDb) });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to register answer key.';
      return res.status(401).json({ error: message });
    }
  });

  // Server-authoritative single-question validation for immediate feedback without exposing keys
  app.post('/api/missions/grade-question', async (req, res) => {
    try {
      await verifyFirebaseBearerToken(req.headers.authorization);
      const body = req.body as {
        missionId?: string;
        questionId?: string;
        selectedOptionId?: string;
      };

      if (!body.missionId || !body.questionId || !body.selectedOptionId) {
        return res.status(400).json({
          error: 'missionId, questionId, and selectedOptionId are required.',
        });
      }

      const keyRecord = await loadAnswerKeyForMission(body.missionId);
      if (!keyRecord) {
        return res.status(404).json({
          error:
            'Authoritative answer key unavailable on server. Ensure FIREBASE_SERVICE_ACCOUNT_KEY is configured or ask your teacher to re-publish the mission.',
        });
      }

      const questionKey = keyRecord.questions.find((q) => q.id === body.questionId);
      if (!questionKey) {
        return res.status(404).json({ error: 'Question key not found in mission.' });
      }

      const isCorrect = body.selectedOptionId === questionKey.correctOptionId;
      return res.json({
        questionId: questionKey.id,
        selectedOptionId: body.selectedOptionId,
        isCorrect,
        xpEarned: isCorrect ? keyRecord.xpPerCorrect : keyRecord.xpPerIncorrect,
        correctOptionId: questionKey.correctOptionId,
        explanation: questionKey.explanation,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to validate question.';
      return res.status(401).json({ error: message });
    }
  });

  // Server-authoritative full mission grading for authenticated learners
  app.post('/api/missions/grade', async (req, res) => {
    try {
      const user = await verifyFirebaseBearerToken(req.headers.authorization);
      const body = req.body as {
        missionId?: string;
        answers?: Array<{ questionId: string; selectedOptionId: string }>;
      };

      if (!body.missionId || !Array.isArray(body.answers) || body.answers.length === 0) {
        return res.status(400).json({ error: 'missionId and submitted answers are required.' });
      }

      const keyRecord = await loadAnswerKeyForMission(body.missionId);
      if (!keyRecord) {
        return res.status(404).json({
          error:
            'Authoritative answer key unavailable on server. Ensure FIREBASE_SERVICE_ACCOUNT_KEY is configured for persistent custom-mission grading.',
        });
      }

      const submittedMap = new Map(
        body.answers.map((entry) => [entry.questionId, entry.selectedOptionId]),
      );

      const questionResults: QuestionResultEntry[] = keyRecord.questions.map((q) => {
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

      // When Admin Firestore is configured, perform authoritative progress update on server
      const adminDb = getAdminDb();
      let authoritativeProgress: LearnerProgressState | null = null;
      let summaryPayload = null;

      if (adminDb) {
        const progressRef = adminDb.doc(`users/${user.uid}/progress/current`);
        const userRef = adminDb.doc(`users/${user.uid}`);
        const [progressSnap, userSnap] = await Promise.all([progressRef.get(), userRef.get()]);

        const existingState = progressSnap.exists
          ? (progressSnap.data() as LearnerProgressState)
          : {
              ...createInitialProgressState(
                String(userSnap.data()?.displayName || user.email || 'Explorer'),
              ),
              learnerId: user.uid,
            };

        const syntheticMission = {
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
          authorType: 'curated' as const,
          questions: keyRecord.questions.map((q) => ({
            id: q.id,
            promptSentence: '',
            targetPhrase: '',
            questionText: '',
            options: [],
            correctOptionId: q.correctOptionId,
            hint: '',
            explanation: q.explanation,
          })),
        };

        const { nextState, summary } = commitMissionCompletion(
          existingState,
          syntheticMission,
          questionResults,
        );

        authoritativeProgress = nextState;
        summaryPayload = summary;
      }

      return res.json({
        missionId: keyRecord.missionId,
        teacherId: keyRecord.teacherId,
        questionResults,
        authoritativeProgress,
        summary: summaryPayload,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to grade mission.';
      return res.status(401).json({ error: message });
    }
  });

  // Trusted teacher role assignment endpoint (Admin email or ADMIN_SETUP_SECRET required)
  app.post('/api/admin/grant-teacher', async (req, res) => {
    try {
      const user = await verifyFirebaseBearerToken(req.headers.authorization);
      const setupSecret = process.env.ADMIN_SETUP_SECRET;
      const providedSecret = req.headers['x-admin-secret'];
      const isBootstrapAdmin =
        user.emailVerified && user.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

      const hasValidSecret =
        Boolean(setupSecret) && typeof providedSecret === 'string' && providedSecret === setupSecret;

      if (!isBootstrapAdmin && !hasValidSecret) {
        return res.status(403).json({
          error: 'Only trusted administrators can assign teacher privileges.',
        });
      }

      const targetUid = String(req.body?.targetUid || '').trim();
      const targetEmail = String(req.body?.targetEmail || '').trim();
      if (!targetUid) {
        return res.status(400).json({ error: 'targetUid is required.' });
      }

      const adminAuth = getAdminAuth();
      const adminDb = getAdminDb();
      if (!adminAuth || !adminDb) {
        return res.status(503).json({
          error:
            'FIREBASE_SERVICE_ACCOUNT_KEY is required to write Firebase custom claims from the server.',
        });
      }

      await adminAuth.setCustomUserClaims(targetUid, { role: 'teacher' });
      const now = new Date();
      await Promise.all([
        adminDb.doc(`teachers/${targetUid}`).set({
          uid: targetUid,
          email: targetEmail,
          grantedAt: now,
          grantedBy: user.uid,
        }),
        adminDb.doc(`users/${targetUid}`).set(
          {
            role: 'teacher',
            updatedAt: now,
          },
          { merge: true },
        ),
      ]);

      return res.json({ ok: true, targetUid, role: 'teacher' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to assign teacher role.';
      return res.status(500).json({ error: message });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`QUESTLAB server listening on http://0.0.0.0:${PORT}`);
  });
}

createApp().catch((err) => {
  console.error('Failed to start QUESTLAB server:', err);
  process.exit(1);
});
