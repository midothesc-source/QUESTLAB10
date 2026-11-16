import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore, type Firestore } from 'firebase/firestore';
import firebaseAppletConfig from '../../firebase-applet-config.json';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

const viteEnv = (import.meta as { env?: Record<string, string | undefined> }).env;

const resolvedConfig = {
  apiKey: viteEnv?.VITE_FIREBASE_API_KEY || firebaseAppletConfig.apiKey,
  authDomain: viteEnv?.VITE_FIREBASE_AUTH_DOMAIN || firebaseAppletConfig.authDomain,
  projectId: viteEnv?.VITE_FIREBASE_PROJECT_ID || firebaseAppletConfig.projectId,
  appId: viteEnv?.VITE_FIREBASE_APP_ID || firebaseAppletConfig.appId,
  storageBucket: firebaseAppletConfig.storageBucket,
  messagingSenderId: firebaseAppletConfig.messagingSenderId,
  firestoreDatabaseId:
    viteEnv?.VITE_FIREBASE_DATABASE_ID || firebaseAppletConfig.firestoreDatabaseId,
};

export const isFirebaseConfigured = Boolean(
  resolvedConfig.apiKey && resolvedConfig.projectId && resolvedConfig.appId,
);

const app: FirebaseApp = initializeApp({
  apiKey: resolvedConfig.apiKey,
  authDomain: resolvedConfig.authDomain,
  projectId: resolvedConfig.projectId,
  appId: resolvedConfig.appId,
  storageBucket: resolvedConfig.storageBucket,
  messagingSenderId: resolvedConfig.messagingSenderId,
});

export const auth: Auth = getAuth(app);
export const db: Firestore = resolvedConfig.firestoreDatabaseId
  ? getFirestore(app, resolvedConfig.firestoreDatabaseId)
  : getFirestore(app);

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  if (!isFirebaseConfigured) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration: client is offline.');
    }
  }
}

if (typeof window !== 'undefined') {
  void testConnection();
}
