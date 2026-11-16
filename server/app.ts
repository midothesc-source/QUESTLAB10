import express, { type Express, type Request, type Response } from 'express';
import type { AIMissionGeneratorInput, GradeAttemptRequest, MissionDefinition, MissionQuestion } from '../src/types/questlab.ts';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  constantTimeSecretEquals,
  firebaseProjectConfig,
  getAdminAuth,
  getAdminDb,
  getFirebaseAdminStatus,
  HttpError,
  resolveUserRoles,
  type ServerRoleDb,
  type VerifiedFirebaseUser,
  verifyFirebaseBearerToken,
  type VerifyBearerOptions,
} from './firebaseAdmin.ts';
import {
  createFirestoreDbAdapter,
  type DbAdapter,
  deleteTeacherMissionAuthoritative,
  executeAuthoritativeGradingTransaction,
  executeGuestPracticeGrading,
  getOrInitServerProgress,
  getTeacherMissionDraftAuthoritative,
  listTeacherMissionsAuthoritative,
  preserveGuestPracticeOnServer,
  registerMissionKeyAuthoritative,
  resetServerProgress,
  saveTeacherMissionAuthoritative,
  updateTeacherMissionStatusAuthoritative,
} from './gradingService.ts';
import {
  generateDraftMissionWithGemini,
  getConfiguredGeminiModel,
  regenerateSingleQuestionWithGemini,
} from './geminiService.ts';

export interface AdminAuthServiceAdapter {
  setCustomUserClaims(uid: string, customUserClaims: Record<string, unknown>): Promise<void>;
}

export interface ServerAppDependencies {
  verifyToken?: (
    authHeader: string | undefined,
    options?: VerifyBearerOptions,
  ) => Promise<VerifiedFirebaseUser>;
  getDb?: () => DbAdapter | null;
  getAuthService?: () => AdminAuthServiceAdapter | null;
  getAdminStatus?: () => { configured: boolean; reason: string | null };
  resolveRoles?: (user: VerifiedFirebaseUser, db: DbAdapter | null) => Promise<{
    isTeacher: boolean;
    isAdmin: boolean;
  }>;
  generateMission?: (input: AIMissionGeneratorInput, teacherUid: string) => Promise<MissionDefinition>;
  regenerateQuestion?: (params: {
    subject: string;
    topic: string;
    gradeLevel: string;
    difficulty: string;
    existingQuestionId: string;
    previousQuestionText?: string;
  }) => Promise<MissionQuestion>;
  grantTeacherRateLimitMax?: number;
  grantTeacherRateLimitWindowMs?: number;
}

interface RateBucket {
  count: number;
  resetAtMs: number;
}

function sendErrorResponse(res: Response, err: unknown, fallbackMessage: string) {
  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  const message = err instanceof Error ? err.message : fallbackMessage;
  if (message.includes('GEMINI_API_KEY')) {
    return res.status(503).json({ error: message });
  }
  return res.status(500).json({ error: message });
}

export async function createExpressApp(deps: ServerAppDependencies = {}): Promise<Express> {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const verifyToken =
    deps.verifyToken ||
    ((authHeader: string | undefined, options?: VerifyBearerOptions) =>
      verifyFirebaseBearerToken(authHeader, options));

  const getDb =
    deps.getDb ||
    (() => {
      const adminDb = getAdminDb();
      return adminDb ? createFirestoreDbAdapter(adminDb) : null;
    });

  const getAuthService =
    deps.getAuthService ||
    (() => {
      const auth = getAdminAuth();
      return auth
        ? {
            setCustomUserClaims: (uid: string, claims: Record<string, unknown>) =>
              auth.setCustomUserClaims(uid, claims),
          }
        : null;
    });

  const getAdminStatus = deps.getAdminStatus || getFirebaseAdminStatus;

  const resolveRoles =
    deps.resolveRoles ||
    (async (user: VerifiedFirebaseUser, db: DbAdapter | null) => {
      const roleDb: ServerRoleDb | null = db
        ? {
            async getDoc(docPath: string) {
              const snap = await db.getDoc(docPath);
              return { exists: snap.exists, data: snap.data() };
            },
          }
        : null;
      return resolveUserRoles(user, roleDb);
    });

  const generateMission = deps.generateMission || generateDraftMissionWithGemini;
  const regenerateQuestion = deps.regenerateQuestion || regenerateSingleQuestionWithGemini;

  const rateLimitMax = deps.grantTeacherRateLimitMax ?? 10;
  const rateLimitWindowMs = deps.grantTeacherRateLimitWindowMs ?? 15 * 60 * 1000;
  const grantTeacherRateMap = new Map<string, RateBucket>();

  function requireDbOrFailClosed(): DbAdapter {
    const db = getDb();
    if (!db) {
      throw new HttpError(
        503,
        'Authoritative Firebase Admin SDK is not configured on the server.',
      );
    }
    return db;
  }

  function checkGrantTeacherRateLimit(req: Request): { allowed: boolean; retryAfterSec: number } {
    const forwardedFor = req.headers['x-forwarded-for'];
    const clientIp =
      (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket?.remoteAddress ||
      'unknown';

    const now = Date.now();
    const bucket = grantTeacherRateMap.get(clientIp);
    if (!bucket || now >= bucket.resetAtMs) {
      grantTeacherRateMap.set(clientIp, {
        count: 1,
        resetAtMs: now + rateLimitWindowMs,
      });
      return { allowed: true, retryAfterSec: 0 };
    }

    bucket.count += 1;
    if (bucket.count > rateLimitMax) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAtMs - now) / 1000));
      return { allowed: false, retryAfterSec };
    }
    return { allowed: true, retryAfterSec: 0 };
  }

  app.get('/api/health', (_req, res) => {
    const geminiKey = process.env.GEMINI_API_KEY;
    const geminiConfigured = Boolean(
      geminiKey && geminiKey.trim().length > 0 && geminiKey !== 'MY_GEMINI_API_KEY',
    );
    const adminStatus = getAdminStatus();

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
      const user = await verifyToken(req.headers.authorization, { requireAdminSdk: true });
      const db = requireDbOrFailClosed();
      const { isTeacher } = await resolveRoles(user, db);
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

      const draftMission = await generateMission(input, user.uid);
      return res.json({ mission: draftMission });
    } catch (err) {
      return sendErrorResponse(res, err, 'Failed to generate mission.');
    }
  });

  // Regenerate a single question in a draft mission
  app.post('/api/ai/regenerate-question', async (req, res) => {
    try {
      const user = await verifyToken(req.headers.authorization, { requireAdminSdk: true });
      const db = requireDbOrFailClosed();
      const { isTeacher } = await resolveRoles(user, db);
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

      const question = await regenerateQuestion({
        subject: body.subject,
        topic: body.topic,
        gradeLevel: body.gradeLevel || 'High School',
        difficulty: body.difficulty || 'Intermediate',
        existingQuestionId: body.existingQuestionId,
        previousQuestionText: body.previousQuestionText,
      });

      return res.json({ question });
    } catch (err) {
      return sendErrorResponse(res, err, 'Failed to regenerate question.');
    }
  });

  // Atomically save sanitized public mission + server-only answer key with ownership checks
  app.post('/api/missions/save', async (req, res) => {
    try {
      const user = await verifyToken(req.headers.authorization, { requireAdminSdk: true });
      const db = requireDbOrFailClosed();
      const { isTeacher, isAdmin } = await resolveRoles(user, db);
      if (!isTeacher) {
        return res.status(403).json({ error: 'Teacher privileges required.' });
      }

      const body = req.body as { mission?: unknown; status?: 'draft' | 'published' };
      const saved = await saveTeacherMissionAuthoritative(
        db,
        user,
        isAdmin,
        body.mission,
        body.status === 'published' ? 'published' : 'draft',
      );
      return res.json({ mission: saved });
    } catch (err) {
      return sendErrorResponse(res, err, 'Failed to save mission.');
    }
  });

  // Hardened answer-key registration endpoint (Admin Firestore + ownership required, no runtime memory cache)
  app.post('/api/missions/register-key', async (req, res) => {
    try {
      const user = await verifyToken(req.headers.authorization, { requireAdminSdk: true });
      const db = requireDbOrFailClosed();
      const { isTeacher, isAdmin } = await resolveRoles(user, db);
      if (!isTeacher) {
        return res.status(403).json({ error: 'Teacher privileges required.' });
      }

      const body = req.body as { mission?: unknown };
      const result = await registerMissionKeyAuthoritative(db, user, isAdmin, body.mission);
      return res.json(result);
    } catch (err) {
      return sendErrorResponse(res, err, 'Failed to register answer key.');
    }
  });

  // List authenticated teacher's missions hydrated with private answer keys for Teacher Studio
  app.get('/api/missions/teacher', async (req, res) => {
    try {
      const user = await verifyToken(req.headers.authorization, { requireAdminSdk: true });
      const db = requireDbOrFailClosed();
      const { isTeacher } = await resolveRoles(user, db);
      if (!isTeacher) {
        return res.status(403).json({ error: 'Teacher privileges required.' });
      }

      const missions = await listTeacherMissionsAuthoritative(db, user);
      return res.json({ missions });
    } catch (err) {
      return sendErrorResponse(res, err, 'Failed to load teacher missions.');
    }
  });

  // Fetch single teacher mission draft hydrated with private answer key (owner or admin only)
  app.get('/api/missions/:missionId/teacher-draft', async (req, res) => {
    try {
      const user = await verifyToken(req.headers.authorization, { requireAdminSdk: true });
      const db = requireDbOrFailClosed();
      const { isTeacher, isAdmin } = await resolveRoles(user, db);
      if (!isTeacher) {
        return res.status(403).json({ error: 'Teacher privileges required.' });
      }

      const mission = await getTeacherMissionDraftAuthoritative(
        db,
        user,
        isAdmin,
        req.params.missionId,
      );
      return res.json({ mission });
    } catch (err) {
      return sendErrorResponse(res, err, 'Failed to load teacher mission draft.');
    }
  });

  app.patch('/api/missions/:missionId/status', async (req, res) => {
    try {
      const user = await verifyToken(req.headers.authorization, { requireAdminSdk: true });
      const db = requireDbOrFailClosed();
      const { isTeacher, isAdmin } = await resolveRoles(user, db);
      if (!isTeacher) {
        return res.status(403).json({ error: 'Teacher privileges required.' });
      }

      const result = await updateTeacherMissionStatusAuthoritative(
        db,
        user,
        isAdmin,
        req.params.missionId,
        req.body?.status,
      );
      return res.json(result);
    } catch (err) {
      return sendErrorResponse(res, err, 'Failed to update mission status.');
    }
  });

  app.delete('/api/missions/:missionId', async (req, res) => {
    try {
      const user = await verifyToken(req.headers.authorization, { requireAdminSdk: true });
      const db = requireDbOrFailClosed();
      const { isTeacher, isAdmin } = await resolveRoles(user, db);
      if (!isTeacher) {
        return res.status(403).json({ error: 'Teacher privileges required.' });
      }

      const result = await deleteTeacherMissionAuthoritative(
        db,
        user,
        isAdmin,
        req.params.missionId,
      );
      return res.json(result);
    } catch (err) {
      return sendErrorResponse(res, err, 'Failed to delete mission.');
    }
  });

  // Server-authoritative full-attempt transactional grading for authenticated learners
  app.post('/api/missions/grade', async (req, res) => {
    try {
      const user = await verifyToken(req.headers.authorization, { requireAdminSdk: true });
      const db = requireDbOrFailClosed();
      const body = req.body as Partial<GradeAttemptRequest>;

      const graded = await executeAuthoritativeGradingTransaction(db, user, body);
      return res.json(graded);
    } catch (err) {
      return sendErrorResponse(res, err, 'Failed to grade mission.');
    }
  });

  // Curated-only guest practice grading (no Firestore persistence, no official XP minting)
  app.post('/api/missions/practice-grade', (req, res) => {
    try {
      const body = req.body as { missionId?: unknown; answers?: unknown };
      const graded = executeGuestPracticeGrading(body);
      return res.json(graded);
    } catch (err) {
      return sendErrorResponse(res, err, 'Failed to evaluate practice attempt.');
    }
  });

  // Server-managed learner progress initialization & read
  app.get('/api/progress', async (req, res) => {
    try {
      const user = await verifyToken(req.headers.authorization, { requireAdminSdk: true });
      const db = requireDbOrFailClosed();
      const progress = await getOrInitServerProgress(db, user);
      return res.json({ progress });
    } catch (err) {
      return sendErrorResponse(res, err, 'Failed to load learner progress.');
    }
  });

  // Server-managed learner progress reset
  app.post('/api/progress/reset', async (req, res) => {
    try {
      const user = await verifyToken(req.headers.authorization, { requireAdminSdk: true });
      const db = requireDbOrFailClosed();
      const progress = await resetServerProgress(db, user);
      return res.json({ progress });
    } catch (err) {
      return sendErrorResponse(res, err, 'Failed to reset learner progress.');
    }
  });

  // Safe guest practice metadata preservation (never inflates official XP or mission completions)
  app.post('/api/progress/migrate-guest', async (req, res) => {
    try {
      const user = await verifyToken(req.headers.authorization, { requireAdminSdk: true });
      const db = requireDbOrFailClosed();
      const body = req.body as { guestXpEarned?: unknown; guestCompletedMissionIds?: unknown };
      const progress = await preserveGuestPracticeOnServer(db, user, body);
      return res.json({ progress });
    } catch (err) {
      return sendErrorResponse(res, err, 'Failed to preserve guest practice summary.');
    }
  });

  // Trusted teacher role assignment endpoint (rate-limited, timing-safe secret comparison, Admin SDK required)
  app.post('/api/admin/grant-teacher', async (req, res) => {
    const rateCheck = checkGrantTeacherRateLimit(req);
    if (!rateCheck.allowed) {
      res.setHeader('Retry-After', String(rateCheck.retryAfterSec));
      return res.status(429).json({
        error: 'Too many role elevation attempts. Please retry later.',
      });
    }

    try {
      const user = await verifyToken(req.headers.authorization, { requireAdminSdk: true });
      const db = requireDbOrFailClosed();
      const authService = getAuthService();
      if (!authService) {
        return res.status(503).json({
          error: 'FIREBASE_SERVICE_ACCOUNT_KEY is required to write Firebase custom claims.',
        });
      }

      const setupSecret = process.env.ADMIN_SETUP_SECRET;
      const providedSecretHeader = req.headers['x-admin-secret'];
      const providedSecret =
        typeof providedSecretHeader === 'string' ? providedSecretHeader : undefined;

      const { isAdmin } = await resolveRoles(user, db);
      const isBootstrapAdmin =
        user.emailVerified && user.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
      const hasValidSecret = constantTimeSecretEquals(setupSecret, providedSecret);

      if (!isAdmin && !isBootstrapAdmin && !hasValidSecret) {
        return res.status(403).json({
          error: 'Only trusted administrators can assign teacher privileges.',
        });
      }

      const targetUid = String(req.body?.targetUid || '').trim();
      const targetEmail = String(req.body?.targetEmail || '').trim();
      if (!targetUid || !/^[a-zA-Z0-9_-]{1,128}$/.test(targetUid)) {
        return res.status(400).json({ error: 'Valid targetUid is required.' });
      }

      await authService.setCustomUserClaims(targetUid, { role: 'teacher' });
      const now = new Date();
      await db.runTransaction(async (tx) => {
        tx.set(`teachers/${targetUid}`, {
          uid: targetUid,
          email: targetEmail.slice(0, 160),
          grantedAt: now,
          grantedBy: user.uid,
        });
        tx.set(
          `users/${targetUid}`,
          {
            role: 'teacher',
            updatedAt: now,
          },
          { merge: true },
        );
      });

      return res.json({ ok: true, targetUid, role: 'teacher' });
    } catch (err) {
      return sendErrorResponse(res, err, 'Failed to assign teacher role.');
    }
  });

  // Always return JSON 404 for unknown /api/* routes (never fall through to SPA HTML)
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API route not found.' });
  });

  return app;
}
