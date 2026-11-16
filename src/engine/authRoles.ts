import type { MissionDefinition, MissionSubmission, UserProfile, UserRole } from '../types/questlab';

/**
 * Frontend registration can NEVER assign privileged roles ('teacher' or admin).
 * Self-registration always creates a 'student' profile.
 */
export function sanitizeSelfRegistrationRole(_requestedRole?: string): UserRole {
  return 'student';
}

export function canAccessTeacherDashboard(profile: UserProfile | null): boolean {
  return Boolean(profile && profile.role === 'teacher');
}

export function canManageMission(
  profile: UserProfile | null,
  mission: Pick<MissionDefinition, 'teacherId'>,
): boolean {
  if (!profile || profile.role !== 'teacher') {
    return false;
  }
  return mission.teacherId === profile.uid;
}

export function canViewSubmission(
  profile: UserProfile | null,
  submission: Pick<MissionSubmission, 'studentUid' | 'teacherId'>,
): boolean {
  if (!profile) {
    return false;
  }
  if (submission.studentUid === profile.uid) {
    return true;
  }
  return profile.role === 'teacher' && submission.teacherId === profile.uid;
}
