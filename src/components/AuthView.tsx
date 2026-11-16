import { useState, type FormEvent } from 'react';
import { ArrowLeft, CheckCircle2, KeyRound, LogIn, Mail, ShieldCheck, UserPlus } from 'lucide-react';
import {
  completePasswordResetWithCode,
  formatFirebaseAuthError,
  loginWithEmail,
  loginWithGoogle,
  registerStudentWithEmail,
  requestPasswordReset,
} from '../services/authService';
import type { UserProfile } from '../types/questlab';

type AuthMode = 'login' | 'register' | 'forgot' | 'reset';

interface AuthViewProps {
  resetOobCode?: string | null;
  hasGuestProgress: boolean;
  onAuthSuccess: (profile: UserProfile) => void;
  onClearResetCode: () => void;
  onContinueAsGuest: () => void;
}

export function AuthView({
  resetOobCode,
  hasGuestProgress,
  onAuthSuccess,
  onClearResetCode,
  onContinueAsGuest,
}: AuthViewProps) {
  const [mode, setMode] = useState<AuthMode>(resetOobCode ? 'reset' : 'login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorMessage(null);
    setStatusMessage(null);
  };

  const handleGoogleSignIn = async () => {
    setBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const profile = await loginWithGoogle();
      onAuthSuccess(profile);
    } catch (err) {
      setErrorMessage(formatFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleEmailSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    if (mode === 'login') {
      if (!email.trim() || !password) {
        setErrorMessage('Enter both your email and password.');
        return;
      }
      setBusy(true);
      try {
        const profile = await loginWithEmail(email, password);
        onAuthSuccess(profile);
      } catch (err) {
        setErrorMessage(formatFirebaseAuthError(err));
      } finally {
        setBusy(false);
      }
      return;
    }

    if (mode === 'register') {
      if (!name.trim()) {
        setErrorMessage('Enter your explorer name.');
        return;
      }
      if (!email.trim() || password.length < 6) {
        setErrorMessage('Provide a valid email and a password of at least 6 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match.');
        return;
      }

      setBusy(true);
      try {
        const profile = await registerStudentWithEmail(name, email, password);
        onAuthSuccess(profile);
      } catch (err) {
        setErrorMessage(formatFirebaseAuthError(err));
      } finally {
        setBusy(false);
      }
      return;
    }

    if (mode === 'forgot') {
      if (!email.trim()) {
        setErrorMessage('Enter the email address associated with your account.');
        return;
      }
      setBusy(true);
      try {
        await requestPasswordReset(email);
        setStatusMessage(
          'Password reset instructions have been sent if an account matches that email.',
        );
      } catch (err) {
        setErrorMessage(formatFirebaseAuthError(err));
      } finally {
        setBusy(false);
      }
      return;
    }

    if (mode === 'reset') {
      if (!resetOobCode) {
        setErrorMessage('Reset link code is missing. Request a new password reset email.');
        return;
      }
      if (password.length < 6) {
        setErrorMessage('New password must be at least 6 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('New passwords do not match.');
        return;
      }
      setBusy(true);
      try {
        await completePasswordResetWithCode(resetOobCode, password);
        onClearResetCode();
        setPassword('');
        setConfirmPassword('');
        setStatusMessage('Password updated successfully. You can sign in now.');
        setMode('login');
      } catch (err) {
        setErrorMessage(formatFirebaseAuthError(err));
      } finally {
        setBusy(false);
      }
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:py-12">
      <button
        type="button"
        onClick={onContinueAsGuest}
        className="inline-flex min-h-[40px] items-center gap-2 text-sm font-medium text-slate-300 transition-colors hover:text-[#55D9F5] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#55D9F5]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        <span>Continue in Guest Mode</span>
      </button>

      <div className="mt-6 grid gap-8 lg:grid-cols-12">
        {/* Left Informational Panel */}
        <section className="ql-panel flex flex-col justify-between rounded-2xl p-6 lg:col-span-5">
          <div>
            <p className="text-sm font-medium tracking-wide text-[#55D9F5]">
              QUESTLAB Cloud Identity
            </p>
            <h1 className="font-display mt-2 text-2xl font-bold text-white">
              Sync XP, Join Classes &amp; Unlock Worlds
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Sign in with Google or email to synchronize your Explorer XP, streaks, and mission
              completions across devices and join teacher-led classes.
            </p>

            {hasGuestProgress && (
              <div className="mt-5 rounded-xl border border-[#55D9F5]/25 bg-[#0A1326] p-4 text-xs leading-relaxed text-slate-200">
                <p className="font-semibold text-[#55D9F5]">Local Guest Progress Detected</p>
                <p className="mt-1 text-slate-300">
                  Signing in will automatically merge your earned XP, streaks, and completed
                  missions into your cloud profile without duplicating rewards.
                </p>
              </div>
            )}
          </div>

          <div className="mt-6 border-t border-slate-400/15 pt-5 text-xs text-slate-400">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#A68AFF]" aria-hidden="true" />
              <p className="leading-relaxed">
                Self-registered accounts are created as <strong className="text-slate-200">Student</strong>{' '}
                explorers. Educator accounts are provisioned via verified administrator assignment.
              </p>
            </div>
          </div>
        </section>

        {/* Right Form Panel */}
        <section className="ql-panel-accent rounded-2xl p-6 sm:p-8 lg:col-span-7">
          {mode !== 'reset' && (
            <div
              role="tablist"
              aria-label="Authentication mode"
              className="mb-6 grid grid-cols-3 gap-1 rounded-xl border border-slate-400/15 bg-[#080D19] p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'login'}
                onClick={() => switchMode('login')}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  mode === 'login'
                    ? 'bg-[#55D9F5] text-[#06111D]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'register'}
                onClick={() => switchMode('register')}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  mode === 'register'
                    ? 'bg-[#55D9F5] text-[#06111D]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Register
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'forgot'}
                onClick={() => switchMode('forgot')}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  mode === 'forgot'
                    ? 'bg-[#55D9F5] text-[#06111D]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Reset
              </button>
            </div>
          )}

          {(mode === 'login' || mode === 'register') && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={handleGoogleSignIn}
                className="flex min-h-[46px] w-full items-center justify-center gap-3 rounded-xl border border-slate-400/25 bg-[#0D1526] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-[#55D9F5]/60 hover:bg-[#13203B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#55D9F5]"
              >
                <LogIn className="h-4 w-4 text-[#55D9F5]" aria-hidden="true" />
                <span>Continue with Google</span>
              </button>

              <div className="my-5 flex items-center gap-3 text-xs text-slate-500">
                <span className="h-px flex-1 bg-slate-400/15" aria-hidden="true" />
                <span>or use email credentials</span>
                <span className="h-px flex-1 bg-slate-400/15" aria-hidden="true" />
              </div>
            </>
          )}

          {errorMessage && (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-rose-400/35 bg-rose-950/35 px-4 py-3 text-xs leading-relaxed text-rose-200"
            >
              {errorMessage}
            </div>
          )}

          {statusMessage && (
            <div
              role="status"
              className="mb-4 flex items-start gap-2.5 rounded-xl border border-emerald-400/35 bg-emerald-950/30 px-4 py-3 text-xs leading-relaxed text-emerald-200"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
              <span>{statusMessage}</span>
            </div>
          )}

          <form onSubmit={handleEmailSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label htmlFor="auth-name" className="block text-xs font-medium text-slate-300">
                  Explorer Name
                </label>
                <input
                  id="auth-name"
                  type="text"
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Rivera"
                  className="mt-1.5 w-full rounded-lg border border-slate-400/25 bg-[#080D19] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-[#55D9F5] focus:outline-none"
                />
              </div>
            )}

            {mode !== 'reset' && (
              <div>
                <label htmlFor="auth-email" className="block text-xs font-medium text-slate-300">
                  Email Address
                </label>
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="explorer@school.edu"
                  className="mt-1.5 w-full rounded-lg border border-slate-400/25 bg-[#080D19] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-[#55D9F5] focus:outline-none"
                />
              </div>
            )}

            {(mode === 'login' || mode === 'register' || mode === 'reset') && (
              <div>
                <label htmlFor="auth-password" className="block text-xs font-medium text-slate-300">
                  {mode === 'reset' ? 'New Password' : 'Password'}
                </label>
                <input
                  id="auth-password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="mt-1.5 w-full rounded-lg border border-slate-400/25 bg-[#080D19] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-[#55D9F5] focus:outline-none"
                />
              </div>
            )}

            {(mode === 'register' || mode === 'reset') && (
              <div>
                <label
                  htmlFor="auth-confirm-password"
                  className="block text-xs font-medium text-slate-300"
                >
                  Confirm Password
                </label>
                <input
                  id="auth-confirm-password"
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="mt-1.5 w-full rounded-lg border border-slate-400/25 bg-[#080D19] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-[#55D9F5] focus:outline-none"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-2 inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#55D9F5] px-5 py-2.5 text-sm font-semibold text-[#06111D] transition-colors hover:bg-[#7DE4FA] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#55D9F5]"
            >
              {mode === 'register' ? (
                <UserPlus className="h-4 w-4" aria-hidden="true" />
              ) : mode === 'forgot' ? (
                <Mail className="h-4 w-4" aria-hidden="true" />
              ) : (
                <KeyRound className="h-4 w-4" aria-hidden="true" />
              )}
              <span>
                {busy
                  ? 'Authenticating...'
                  : mode === 'login'
                    ? 'Sign In to QUESTLAB'
                    : mode === 'register'
                      ? 'Create Student Account'
                      : mode === 'forgot'
                        ? 'Send Reset Link'
                        : 'Save New Password'}
              </span>
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
