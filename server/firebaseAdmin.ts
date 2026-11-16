import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

interface FirebaseAppletConfig {
  projectId: string;
  firestoreDatabaseId?: string;
}

function loadAppletConfig(): FirebaseAppletConfig {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as FirebaseAppletConfig;
    return raw;
  }
  return {
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || '',
    firestoreDatabaseId: process.env.VITE_FIREBASE_DATABASE_ID || '(default)',
  };
}

export const firebaseProjectConfig = loadAppletConfig();
export const BOOTSTRAPPED_ADMIN_EMAIL = 'midothesc@gmail.com';

let adminInitialized = false;
let adminInitError: string | null = null;

function ensureAdminInitialized(): boolean {
  if (adminInitialized) return true;
  if (getApps().length > 0) {
    adminInitialized = true;
    return true;
  }

  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!rawServiceAccount || rawServiceAccount.trim().length === 0) {
    adminInitError = 'FIREBASE_SERVICE_ACCOUNT_KEY is not configured.';
    return false;
  }

  try {
    const parsed = JSON.parse(rawServiceAccount);
    initializeApp({
      credential: cert(parsed),
      projectId: firebaseProjectConfig.projectId || parsed.project_id,
    });
    adminInitialized = true;
    adminInitError = null;
    return true;
  } catch (err) {
    adminInitError = err instanceof Error ? err.message : 'Invalid FIREBASE_SERVICE_ACCOUNT_KEY JSON.';
    return false;
  }
}

export function isFirebaseAdminReady(): boolean {
  return ensureAdminInitialized();
}

export function getFirebaseAdminStatus(): { configured: boolean; reason: string | null } {
  const configured = ensureAdminInitialized();
  return { configured, reason: adminInitError };
}

export function getAdminAuth() {
  if (!ensureAdminInitialized()) return null;
  return getAuth();
}

export function getAdminDb() {
  if (!ensureAdminInitialized()) return null;
  const dbId = firebaseProjectConfig.firestoreDatabaseId;
  return dbId && dbId !== '(default)' ? getFirestore(dbId) : getFirestore();
}

export interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  roleClaim?: string;
  rawToken: string;
}

interface CertCache {
  certs: Record<string, string>;
  expiresAtMs: number;
}

let certCache: CertCache | null = null;

async function fetchGooglePublicCerts(): Promise<Record<string, string>> {
  if (certCache && Date.now() < certCache.expiresAtMs) {
    return certCache.certs;
  }

  const response = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch Firebase public keys (${response.status})`);
  }

  const cacheControl = response.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  const certs = (await response.json()) as Record<string, string>;

  certCache = {
    certs,
    expiresAtMs: Date.now() + maxAgeSeconds * 1000,
  };
  return certs;
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLength), 'base64');
}

export async function verifyFirebaseBearerToken(
  authHeader: string | undefined,
): Promise<VerifiedFirebaseUser> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization Bearer token.');
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) {
    throw new Error('Empty Firebase ID token.');
  }

  const adminAuth = getAdminAuth();
  if (adminAuth) {
    const decoded = await adminAuth.verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      email: decoded.email || '',
      emailVerified: Boolean(decoded.email_verified),
      roleClaim: typeof decoded.role === 'string' ? decoded.role : undefined,
      rawToken: idToken,
    };
  }

  // Cryptographic JWT verification against Google's Firebase X.509 certificates
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed Firebase ID token.');
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = JSON.parse(base64UrlDecode(headerB64).toString('utf8')) as {
    alg?: string;
    kid?: string;
  };
  const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8')) as {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    email?: string;
    email_verified?: boolean;
    role?: string;
  };

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported Firebase token signing algorithm.');
  }

  const projectId = firebaseProjectConfig.projectId;
  if (!projectId) {
    throw new Error('Firebase projectId is not configured.');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) {
    throw new Error('Firebase token audience mismatch.');
  }
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error('Firebase token issuer mismatch.');
  }
  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new Error('Firebase token missing subject UID.');
  }
  if (!payload.exp || payload.exp <= nowSeconds) {
    throw new Error('Firebase token has expired.');
  }

  const certs = await fetchGooglePublicCerts();
  const certPem = certs[header.kid];
  if (!certPem) {
    throw new Error('Unknown Firebase signing key ID.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const isSignatureValid = verifier.verify(certPem, base64UrlDecode(signatureB64));
  if (!isSignatureValid) {
    throw new Error('Invalid Firebase token signature.');
  }

  return {
    uid: payload.sub,
    email: payload.email || '',
    emailVerified: Boolean(payload.email_verified),
    roleClaim: typeof payload.role === 'string' ? payload.role : undefined,
    rawToken: idToken,
  };
}

export async function verifyTeacherOrAdmin(user: VerifiedFirebaseUser): Promise<boolean> {
  if (user.roleClaim === 'teacher' || user.roleClaim === 'admin') {
    return true;
  }

  if (user.emailVerified && user.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()) {
    return true;
  }

  const adminDb = getAdminDb();
  if (adminDb) {
    const [teacherDoc, adminDoc, userDoc] = await Promise.all([
      adminDb.doc(`teachers/${user.uid}`).get(),
      adminDb.doc(`admins/${user.uid}`).get(),
      adminDb.doc(`users/${user.uid}`).get(),
    ]);
    if (teacherDoc.exists || adminDoc.exists || userDoc.data()?.role === 'teacher') {
      return true;
    }
    return false;
  }

  // Fallback check via Firestore REST API using caller's own verified Firebase ID token
  const projectId = firebaseProjectConfig.projectId;
  const dbId = firebaseProjectConfig.firestoreDatabaseId || '(default)';
  if (!projectId) return false;

  const teacherUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId,
  )}/databases/${encodeURIComponent(dbId)}/documents/teachers/${encodeURIComponent(user.uid)}`;

  const res = await fetch(teacherUrl, {
    headers: { Authorization: `Bearer ${user.rawToken}` },
  });
  return res.ok;
}
