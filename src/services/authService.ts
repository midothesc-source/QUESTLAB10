import {
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { sanitizeSelfRegistrationRole } from '../engine/authRoles';
import type { UserProfile, UserRole } from '../types/questlab';
import { auth, db, handleFirestoreError, OperationType } from './firebase';

const BOOTSTRAPPED_ADMIN_EMAIL = 'midothesc@gmail.com';
const googleProvider = new GoogleAuthProvider();

function toIsoString(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return new Date().toISOString();
}

export function formatFirebaseAuthError(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'code' in error ? String((error as { code: string }).code) : '';
  switch (code) {
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not yet enabled in Firebase Console (Authentication > Sign-in method). You can sign in immediately with Google or enable Email/Password in Firebase Console.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in instead.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password. Please verify your credentials.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters long.';
    case 'auth/popup-closed-by-user':
      return 'Sign-in popup was closed before completing authentication.';
    case 'auth/invalid-action-code':
    case 'auth/expired-action-code':
      return 'This password reset link is invalid or expired. Please request a new reset email.';
    case 'auth/requires-recent-login':
      return 'Please enter your current password to confirm this security change.';
    default:
      return error instanceof Error ? error.message : 'Authentication error occurred.';
  }
}

async function resolveAuthoritativeRole(user: User, storedRole?: string): Promise<UserRole> {
  try {
    const tokenResult = await user.getIdTokenResult();
    if (tokenResult.claims.role === 'teacher' || tokenResult.claims.admin === true) {
      return 'teacher';
    }
  } catch {
    // Continue checking Firestore role registries
  }

  if (
    user.emailVerified &&
    user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()
  ) {
    return 'teacher';
  }

  try {
    const [teacherSnap, adminSnap] = await Promise.all([
      getDoc(doc(db, 'teachers', user.uid)),
      getDoc(doc(db, 'admins', user.uid)),
    ]);
    if (teacherSnap.exists() || adminSnap.exists()) {
      return 'teacher';
    }
  } catch {
    // Non-teacher users won't have teacher docs; fallback to stored profile role
  }

  return storedRole === 'teacher' ? 'teacher' : 'student';
}

export async function ensureUserProfile(user: User, fallbackName?: string): Promise<UserProfile> {
  const userPath = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);

  let existingData: Record<string, unknown> | undefined;
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      existingData = snap.data();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }

  if (!existingData) {
    const displayName = (user.displayName || fallbackName || user.email?.split('@')[0] || 'Explorer')
      .trim()
      .slice(0, 80);
    const email = (user.email || `${user.uid}@questlab.local`).trim().slice(0, 160);
    // Security invariant: frontend self-registration can NEVER set teacher role
    const safeRole = sanitizeSelfRegistrationRole('student');

    try {
      await setDoc(userRef, {
        uid: user.uid,
        displayName,
        email,
        role: safeRole,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, userPath);
    }

    const effectiveRole = await resolveAuthoritativeRole(user, safeRole);
    const nowIso = new Date().toISOString();
    return {
      uid: user.uid,
      displayName,
      email,
      role: effectiveRole,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }

  const effectiveRole = await resolveAuthoritativeRole(
    user,
    typeof existingData.role === 'string' ? existingData.role : 'student',
  );

  return {
    uid: user.uid,
    displayName: String(existingData.displayName || user.displayName || 'Explorer'),
    email: String(existingData.email || user.email || ''),
    role: effectiveRole,
    gradeBand: typeof existingData.gradeBand === 'string' ? existingData.gradeBand : undefined,
    bio: typeof existingData.bio === 'string' ? existingData.bio : undefined,
    createdAt: toIsoString(existingData.createdAt),
    updatedAt: toIsoString(existingData.updatedAt),
  };
}

export function subscribeToAuthState(
  callback: (state: { firebaseUser: User | null; profile: UserProfile | null }) => void,
  onError?: (err: unknown) => void,
): () => void {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) {
      callback({ firebaseUser: null, profile: null });
      return;
    }

    try {
      const profile = await ensureUserProfile(firebaseUser);
      callback({ firebaseUser, profile });
    } catch (error) {
      if (onError) onError(error);
      callback({ firebaseUser, profile: null });
    }
  });
}

export async function loginWithGoogle(): Promise<UserProfile> {
  const credential = await signInWithPopup(auth, googleProvider);
  return ensureUserProfile(credential.user);
}

export async function registerStudentWithEmail(
  name: string,
  email: string,
  password: string,
): Promise<UserProfile> {
  const cleanName = name.trim().slice(0, 80);
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  if (cleanName) {
    await updateProfile(credential.user, { displayName: cleanName });
  }
  return ensureUserProfile(credential.user, cleanName);
}

export async function loginWithEmail(email: string, password: string): Promise<UserProfile> {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return ensureUserProfile(credential.user);
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

export async function requestPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function completePasswordResetWithCode(
  oobCode: string,
  newPassword: string,
): Promise<void> {
  await confirmPasswordReset(auth, oobCode, newPassword);
}

export async function updateUserProfileFields(
  uid: string,
  updates: { displayName: string; gradeBand?: string; bio?: string },
): Promise<void> {
  const cleanName = updates.displayName.trim().slice(0, 80);
  const cleanGrade = (updates.gradeBand || '').trim().slice(0, 40);
  const cleanBio = (updates.bio || '').trim().slice(0, 300);

  if (auth.currentUser && auth.currentUser.uid === uid) {
    await updateProfile(auth.currentUser, { displayName: cleanName });
  }

  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      displayName: cleanName,
      gradeBand: cleanGrade,
      bio: cleanBio,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function changeCurrentUserPassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error('Password changes require an active email/password session.');
  }

  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}

export async function getCurrentIdToken(): Promise<string | null> {
  if (!auth.currentUser) return null;
  return auth.currentUser.getIdToken();
}
