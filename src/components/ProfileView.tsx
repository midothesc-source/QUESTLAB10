import { useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  KeyRound,
  LogOut,
  Save,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  changeCurrentUserPassword,
  formatFirebaseAuthError,
  updateUserProfileFields,
} from '../services/authService';
import { joinClassByCode } from '../services/firestoreService';
import type { ClassEnrollment, UserProfile } from '../types/questlab';

interface ProfileViewProps {
  profile: UserProfile;
  enrollments: ClassEnrollment[];
  onProfileUpdated: (updated: UserProfile) => void;
  onEnrollmentAdded: (enrollment: ClassEnrollment) => void;
  onLogout: () => void;
  onBackToDashboard: () => void;
  onNotify: (title: string, description: string, tone: 'success' | 'error' | 'info') => void;
}

export function ProfileView({
  profile,
  enrollments,
  onProfileUpdated,
  onEnrollmentAdded,
  onLogout,
  onBackToDashboard,
  onNotify,
}: ProfileViewProps) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [gradeBand, setGradeBand] = useState(profile.gradeBand || '');
  const [bio, setBio] = useState(profile.bio || '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [classCode, setClassCode] = useState('');
  const [joiningClass, setJoiningClass] = useState(false);
  const [copiedUid, setCopiedUid] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const handleSaveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!displayName.trim()) {
      onNotify('Name required', 'Please enter a display name.', 'error');
      return;
    }

    setSavingProfile(true);
    try {
      await updateUserProfileFields(profile.uid, {
        displayName,
        gradeBand,
        bio,
      });
      onProfileUpdated({
        ...profile,
        displayName: displayName.trim(),
        gradeBand: gradeBand.trim(),
        bio: bio.trim(),
        updatedAt: new Date().toISOString(),
      });
      onNotify('Profile saved', 'Your explorer identity has been synced to Firestore.', 'success');
    } catch (err) {
      onNotify(
        'Update failed',
        err instanceof Error ? err.message : 'Could not update profile.',
        'error',
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const handleJoinClass = async (event: FormEvent) => {
    event.preventDefault();
    if (!classCode.trim()) return;

    setJoiningClass(true);
    try {
      const enrollment = await joinClassByCode(classCode.trim(), profile);
      onEnrollmentAdded(enrollment);
      setClassCode('');
      onNotify('Class joined', `Enrolled in ${enrollment.className}.`, 'success');
    } catch (err) {
      onNotify(
        'Unable to join class',
        err instanceof Error ? err.message : 'Check the class code and try again.',
        'error',
      );
    } finally {
      setJoiningClass(false);
    }
  };

  const handlePasswordChange = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentPassword || newPassword.length < 6) {
      onNotify(
        'Invalid password',
        'Provide your current password and a new password (at least 6 characters).',
        'error',
      );
      return;
    }

    setUpdatingPassword(true);
    try {
      await changeCurrentUserPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      onNotify('Password updated', 'Your account password has been changed.', 'success');
    } catch (err) {
      onNotify('Password change failed', formatFirebaseAuthError(err), 'error');
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handleCopyUid = async () => {
    try {
      await navigator.clipboard.writeText(profile.uid);
      setCopiedUid(true);
      setTimeout(() => setCopiedUid(false), 2000);
    } catch {
      onNotify('Copy failed', 'Select and copy your Explorer ID manually.', 'info');
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-10">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-400/15 pb-6">
        <div>
          <button
            type="button"
            onClick={onBackToDashboard}
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-300 transition-colors hover:text-[#55D9F5]"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Back to Dashboard</span>
          </button>
          <h1 className="font-display mt-2 text-3xl font-bold text-white">Explorer Profile</h1>
          <p className="mt-1 text-sm text-slate-300">
            Manage your cloud identity, class enrollments, and account credentials.
          </p>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-400/25 bg-[#0D1526] px-4 py-2 text-xs font-semibold text-slate-200 transition-colors hover:border-rose-400/50 hover:text-rose-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          <span>Sign Out</span>
        </button>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-12">
        {/* Profile Details Form */}
        <section className="ql-panel-accent rounded-2xl p-6 lg:col-span-7">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-semibold text-white">Identity Settings</h2>
            <span className="font-mono-tabular text-xs font-semibold text-[#55D9F5]">
              Role: {profile.role === 'teacher' ? 'Educator / Teacher' : 'Student Explorer'}
            </span>
          </div>

          <form onSubmit={handleSaveProfile} className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="profile-name" className="block text-xs font-medium text-slate-300">
                  Display Name
                </label>
                <input
                  id="profile-name"
                  type="text"
                  required
                  maxLength={80}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-400/25 bg-[#080D19] px-3.5 py-2.5 text-sm text-white focus:border-[#55D9F5] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="profile-grade" className="block text-xs font-medium text-slate-300">
                  Grade / Track
                </label>
                <input
                  id="profile-grade"
                  type="text"
                  maxLength={40}
                  value={gradeBand}
                  onChange={(e) => setGradeBand(e.target.value)}
                  placeholder="e.g. Grade 8 / Honors"
                  className="mt-1.5 w-full rounded-lg border border-slate-400/25 bg-[#080D19] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-[#55D9F5] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="profile-email" className="block text-xs font-medium text-slate-300">
                Account Email
              </label>
              <input
                id="profile-email"
                type="email"
                disabled
                value={profile.email}
                className="mt-1.5 w-full cursor-not-allowed rounded-lg border border-slate-400/15 bg-[#080D19]/60 px-3.5 py-2.5 text-sm text-slate-400"
              />
            </div>

            <div>
              <label htmlFor="profile-bio" className="block text-xs font-medium text-slate-300">
                Learning Goals / Bio
              </label>
              <textarea
                id="profile-bio"
                rows={3}
                maxLength={300}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Share your target subjects or mission goals..."
                className="mt-1.5 w-full rounded-lg border border-slate-400/25 bg-[#080D19] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-[#55D9F5] focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={handleCopyUid}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-400/20 bg-[#080D19] px-3 py-2 text-xs text-slate-300 transition-colors hover:border-[#55D9F5]/40 hover:text-white"
              >
                {copiedUid ? (
                  <Check className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-[#55D9F5]" aria-hidden="true" />
                )}
                <span className="font-mono-tabular">
                  {copiedUid ? 'Explorer UID Copied' : `Explorer UID: ${profile.uid.slice(0, 12)}...`}
                </span>
              </button>

              <button
                type="submit"
                disabled={savingProfile}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-[#55D9F5] px-5 py-2 text-sm font-semibold text-[#06111D] transition-colors hover:bg-[#7DE4FA] disabled:opacity-60"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                <span>{savingProfile ? 'Saving...' : 'Save Profile'}</span>
              </button>
            </div>
          </form>
        </section>

        {/* Class Join & Security Column */}
        <div className="space-y-6 lg:col-span-5">
          {/* Join Class */}
          <section className="ql-panel rounded-2xl p-6">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-[#55D9F5]" aria-hidden="true" />
              <h2 className="font-display text-lg font-semibold text-white">Join a Class</h2>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
              Enter the Class Code shared by your teacher to receive assigned missions.
            </p>

            <form onSubmit={handleJoinClass} className="mt-4 flex gap-2">
              <label htmlFor="join-class-code" className="sr-only">
                Class Code
              </label>
              <input
                id="join-class-code"
                type="text"
                value={classCode}
                onChange={(e) => setClassCode(e.target.value)}
                placeholder="e.g. grammar-101-ab12"
                className="min-w-0 flex-1 rounded-lg border border-slate-400/25 bg-[#080D19] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-[#55D9F5] focus:outline-none"
              />
              <button
                type="submit"
                disabled={joiningClass || !classCode.trim()}
                className="shrink-0 rounded-lg bg-[#A68AFF] px-4 py-2 text-xs font-semibold text-[#080D19] transition-colors hover:bg-[#BEA8FF] disabled:opacity-50"
              >
                {joiningClass ? 'Joining...' : 'Join'}
              </button>
            </form>

            {enrollments.length > 0 && (
              <ul className="mt-4 divide-y divide-slate-400/12 border-t border-slate-400/15 pt-3">
                {enrollments.map((enrollment) => (
                  <li key={enrollment.id} className="flex items-center justify-between py-2 text-xs">
                    <span className="font-medium text-white">{enrollment.className}</span>
                    <span className="font-mono-tabular text-slate-400">{enrollment.classId}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Password Update */}
          <section className="ql-panel rounded-2xl p-6">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-[#A68AFF]" aria-hidden="true" />
              <h2 className="font-display text-lg font-semibold text-white">Update Password</h2>
            </div>
            <form onSubmit={handlePasswordChange} className="mt-4 space-y-3">
              <div>
                <label htmlFor="current-pw" className="block text-xs font-medium text-slate-300">
                  Current Password
                </label>
                <input
                  id="current-pw"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-400/25 bg-[#080D19] px-3 py-2 text-sm text-white focus:border-[#55D9F5] focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="new-pw" className="block text-xs font-medium text-slate-300">
                  New Password
                </label>
                <input
                  id="new-pw"
                  type="password"
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-400/25 bg-[#080D19] px-3 py-2 text-sm text-white focus:border-[#55D9F5] focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={updatingPassword || !currentPassword || newPassword.length < 6}
                className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-lg border border-slate-400/25 bg-[#0D1526] px-4 py-2 text-xs font-semibold text-white transition-colors hover:border-[#55D9F5]/60 disabled:opacity-50"
              >
                <ShieldCheck className="h-4 w-4 text-[#55D9F5]" aria-hidden="true" />
                <span>{updatingPassword ? 'Updating...' : 'Change Password'}</span>
              </button>
            </form>

            <p className="mt-4 flex items-center gap-2 text-[11px] text-slate-400">
              <UserCheck className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
              <span>Google Sign-In users manage passwords in their Google Account.</span>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
