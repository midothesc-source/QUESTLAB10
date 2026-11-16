import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthView } from './components/AuthView';
import { CompletionView } from './components/CompletionView';
import { DashboardView } from './components/DashboardView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LandingView } from './components/LandingView';
import { MissionBriefingView } from './components/MissionBriefingView';
import { MissionSelectionView } from './components/MissionSelectionView';
import { OfflineIndicator } from './components/OfflineIndicator';
import { ProfileView } from './components/ProfileView';
import { QuizView } from './components/QuizView';
import { TeacherDashboardView } from './components/TeacherDashboardView';
import { ToastContainer, type ToastMessage, type ToastTone } from './components/ToastContainer';
import { TopNav } from './components/TopNav';
import { MISSIONS } from './data/missions';
import { calculateLevelInfo, commitMissionCompletion } from './engine/progression';
import {
  fetchServerHealth,
  submitGuestPracticeOnServer,
  submitMissionAttemptOnServer,
} from './services/apiClient';
import { logoutUser, subscribeToAuthState } from './services/authService';
import {
  fetchPublishedMissions,
  fetchStudentAssignments,
  fetchStudentEnrollments,
  fetchStudentSubmissions,
} from './services/firestoreService';
import {
  FirestoreProgressRepository,
  guestProgressRepository,
} from './services/progressRepository';
import type {
  ClassEnrollment,
  LearnerProgressState,
  MissionAssignment,
  MissionRunSummary,
  MissionSubmission,
  PublicMissionDefinition,
  ScreenRoute,
  SubmittedAnswerItem,
  UserProfile,
} from './types/questlab';

function getInitialUrlState(): { initialScreen: ScreenRoute; oobCode: string | null } {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const oobCode = params.get('oobCode');
    if (oobCode) {
      return { initialScreen: 'auth', oobCode };
    }
    if (params.get('autostart') === '1') {
      return { initialScreen: 'dashboard', oobCode: null };
    }
  }
  return { initialScreen: 'landing', oobCode: null };
}

function mergeMissionLists(
  curated: PublicMissionDefinition[],
  published: PublicMissionDefinition[],
): PublicMissionDefinition[] {
  const map = new Map<string, PublicMissionDefinition>();
  for (const m of curated) {
    map.set(m.id, m);
  }
  for (const m of published) {
    map.set(m.id, m);
  }
  return Array.from(map.values());
}

export default function App() {
  const initialUrl = useMemo(getInitialUrlState, []);
  const [currentScreen, setCurrentScreen] = useState<ScreenRoute>(initialUrl.initialScreen);
  const [resetOobCode, setResetOobCode] = useState<string | null>(initialUrl.oobCode);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [progress, setProgress] = useState<LearnerProgressState>(() =>
    guestProgressRepository.load(),
  );
  const [cloudMissions, setCloudMissions] = useState<PublicMissionDefinition[]>([]);
  const [assignments, setAssignments] = useState<MissionAssignment[]>([]);
  const [submissions, setSubmissions] = useState<MissionSubmission[]>([]);
  const [enrollments, setEnrollments] = useState<ClassEnrollment[]>([]);

  const [activeMissionId, setActiveMissionId] = useState<string>(MISSIONS[0].id);
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | undefined>(undefined);
  const [quizSessionKey, setQuizSessionKey] = useState(0);
  const [lastRunSummary, setLastRunSummary] = useState<MissionRunSummary | null>(null);

  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [geminiModel, setGeminiModel] = useState('gemini-4-hydrogen');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const cloudRepoRef = useRef<FirestoreProgressRepository | null>(null);

  const notify = useCallback((title: string, description: string, tone: ToastTone = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { id, title, description, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 5000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const allMissions = useMemo(
    () => mergeMissionLists(MISSIONS, cloudMissions),
    [cloudMissions],
  );
  const activeMission = useMemo(
    () => allMissions.find((m) => m.id === activeMissionId) ?? allMissions[0] ?? MISSIONS[0],
    [activeMissionId, allMissions],
  );
  const levelInfo = calculateLevelInfo(progress.totalXp);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [currentScreen]);

  // Check backend Gemini & Firebase configuration
  useEffect(() => {
    fetchServerHealth()
      .then((status) => {
        setGeminiConfigured(status.geminiConfigured);
        setGeminiModel(status.geminiModel);
      })
      .catch(() => {
        // Static or offline preview fallback
      });
  }, []);

  const refreshCloudData = useCallback(async (activeProfile: UserProfile) => {
    const [mRes, aRes, sRes, eRes] = await Promise.allSettled([
      fetchPublishedMissions(),
      fetchStudentAssignments(activeProfile.uid),
      fetchStudentSubmissions(activeProfile.uid),
      fetchStudentEnrollments(activeProfile.uid),
    ]);

    if (mRes.status === 'fulfilled') setCloudMissions(mRes.value);
    if (aRes.status === 'fulfilled') setAssignments(aRes.value);
    if (sRes.status === 'fulfilled') setSubmissions(sRes.value);
    if (eRes.status === 'fulfilled') setEnrollments(eRes.value);
  }, []);

  // Subscribe to Firebase Auth & sync progress repository
  useEffect(() => {
    const unsubscribe = subscribeToAuthState(
      async ({ profile: nextProfile }) => {
        if (!nextProfile) {
          cloudRepoRef.current = null;
          setProfile(null);
          setCloudMissions([]);
          setAssignments([]);
          setSubmissions([]);
          setEnrollments([]);
          setActiveAssignmentId(undefined);
          setProgress(guestProgressRepository.load());
          return;
        }

        setProfile(nextProfile);
        const repo = new FirestoreProgressRepository(nextProfile.uid, nextProfile.displayName);
        cloudRepoRef.current = repo;
        setProgress(repo.loadCached());

        try {
          const { state, migrated } = await repo.migrateGuestProgress(guestProgressRepository);
          setProgress(state);
          if (migrated) {
            notify(
              'Guest practice history saved',
              'Your local guest practice summary was recorded alongside your account. Official XP is earned through server-verified missions.',
              'info',
            );
          }
        } catch (err) {
          notify(
            'Cloud progress sync warning',
            err instanceof Error ? err.message : 'Unable to load authoritative cloud progress.',
            'error',
          );
        }

        await refreshCloudData(nextProfile);
      },
      (err) => {
        notify(
          'Authentication sync issue',
          err instanceof Error ? err.message : 'Unable to initialize cloud profile.',
          'error',
        );
      },
    );

    return () => unsubscribe();
  }, [notify, refreshCloudData]);

  const handleNavigate = useCallback(
    (screen: ScreenRoute) => {
      if (screen === 'profile' && !profile) {
        setCurrentScreen('auth');
        return;
      }
      setCurrentScreen(screen);
    },
    [profile],
  );

  const handleOpenMissionBriefing = useCallback((missionId: string, assignmentId?: string) => {
    setActiveMissionId(missionId);
    setActiveAssignmentId(assignmentId);
    setCurrentScreen('briefing');
  }, []);

  const handleStartMission = useCallback(() => {
    setQuizSessionKey((prev) => prev + 1);
    setCurrentScreen('quiz');
  }, []);

  const handleSubmitMissionAttempt = useCallback(
    async (payload: {
      attemptId: string;
      answers: SubmittedAnswerItem[];
      assignmentId?: string;
    }) => {
      if (profile && cloudRepoRef.current) {
        // Strict server-authoritative grading: NEVER fall back to client scoring for authenticated accounts.
        const result = await submitMissionAttemptOnServer({
          missionId: activeMission.id,
          attemptId: payload.attemptId,
          answers: payload.answers,
          assignmentId: payload.assignmentId,
        });

        cloudRepoRef.current.applyAuthoritativeSnapshot(result.authoritativeProgress);
        setProgress(result.authoritativeProgress);
        setLastRunSummary(result.summary);
        setActiveAssignmentId(undefined);
        setCurrentScreen('completion');

        // Refresh assignments and submissions from Firestore in background
        void refreshCloudData(profile);
        return;
      }

      // Guest Practice Mode (curated missions only, evaluated on server without minting official cloud XP)
      const practiceResult = await submitGuestPracticeOnServer(activeMission.id, payload.answers);
      const computed = commitMissionCompletion(
        progress,
        activeMission,
        practiceResult.summary.questionResults,
      );
      guestProgressRepository.save(computed.nextState);
      setProgress(computed.nextState);
      setLastRunSummary(computed.summary);
      setCurrentScreen('completion');
    },
    [activeMission, profile, progress, refreshCloudData],
  );

  const handleResetProgress = useCallback(async () => {
    if (profile && cloudRepoRef.current) {
      try {
        const fresh = await cloudRepoRef.current.reset();
        setProgress(fresh);
        setLastRunSummary(null);
        notify('Cloud progress reset', 'Your explorer XP and records were cleared.', 'info');
      } catch (err) {
        notify(
          'Reset failed',
          err instanceof Error ? err.message : 'Unable to reset cloud progress.',
          'error',
        );
      }
    } else {
      const fresh = guestProgressRepository.reset();
      setProgress(fresh);
      setLastRunSummary(null);
      notify('Local progress reset', 'Demo explorer progress was cleared.', 'info');
    }
  }, [notify, profile]);

  const handleLogout = useCallback(async () => {
    await logoutUser();
    setCurrentScreen('dashboard');
    notify('Signed out', 'Returned to Guest Explorer Mode.', 'info');
  }, [notify]);

  return (
    <ErrorBoundary>
      <div className="ql-cosmic-backdrop flex min-h-screen flex-col text-[#F1F5F9]">
        <TopNav
          currentScreen={currentScreen}
          profile={profile}
          onNavigate={handleNavigate}
          onEnterUniverse={() => setCurrentScreen('dashboard')}
          onStartPrimaryMission={() => handleOpenMissionBriefing(MISSIONS[0].id)}
        />

        <main className="flex-1">
          {currentScreen === 'landing' && (
            <LandingView
              hasExistingProgress={
                progress.totalXp > 0 || progress.completedMissionIds.length > 0
              }
              totalXp={progress.totalXp}
              level={levelInfo.level}
              onEnterUniverse={() => setCurrentScreen('dashboard')}
              onPreviewMission={() => handleOpenMissionBriefing(MISSIONS[0].id)}
            />
          )}

          {currentScreen === 'dashboard' && (
            <DashboardView
              progress={progress}
              profile={profile}
              missions={allMissions}
              assignments={assignments}
              submissions={submissions}
              enrollments={enrollments}
              onOpenWorlds={() => setCurrentScreen('missions')}
              onOpenMissionBriefing={handleOpenMissionBriefing}
              onOpenAuth={() => setCurrentScreen('auth')}
              onOpenProfile={() => setCurrentScreen(profile ? 'profile' : 'auth')}
              onOpenTeacherPortal={() => setCurrentScreen('teacher')}
              onEnrollmentAdded={(enrollment) =>
                setEnrollments((prev) => [
                  enrollment,
                  ...prev.filter((e) => e.id !== enrollment.id),
                ])
              }
              onResetProgress={handleResetProgress}
              onNotify={notify}
            />
          )}

          {currentScreen === 'missions' && (
            <MissionSelectionView
              progress={progress}
              missions={allMissions}
              onSelectMission={(missionId) => handleOpenMissionBriefing(missionId)}
              onBackToDashboard={() => setCurrentScreen('dashboard')}
            />
          )}

          {currentScreen === 'briefing' && (
            <MissionBriefingView
              mission={activeMission}
              previousRecord={progress.missionRecords[activeMission.id]}
              onStartMission={handleStartMission}
              onBackToWorlds={() => setCurrentScreen('missions')}
            />
          )}

          {currentScreen === 'quiz' && (
            <QuizView
              key={`${activeMission.id}-${quizSessionKey}`}
              mission={activeMission}
              isAuthenticated={Boolean(profile)}
              assignmentId={activeAssignmentId}
              onSubmitAttempt={handleSubmitMissionAttempt}
            />
          )}

          {currentScreen === 'completion' && lastRunSummary && (
            <CompletionView
              mission={activeMission}
              summary={lastRunSummary}
              progress={progress}
              isAuthenticated={Boolean(profile)}
              onReplayMission={handleStartMission}
              onReturnToDashboard={() => setCurrentScreen('dashboard')}
              onOpenWorlds={() => setCurrentScreen('missions')}
            />
          )}

          {currentScreen === 'auth' && (
            <AuthView
              resetOobCode={resetOobCode}
              hasGuestProgress={guestProgressRepository.hasStoredProgress()}
              onAuthSuccess={(signedInProfile) => {
                setProfile(signedInProfile);
                setCurrentScreen('dashboard');
                notify(
                  `Welcome, ${signedInProfile.displayName}`,
                  'Cloud explorer session active.',
                  'success',
                );
              }}
              onClearResetCode={() => {
                setResetOobCode(null);
                if (typeof window !== 'undefined') {
                  window.history.replaceState({}, '', window.location.pathname);
                }
              }}
              onContinueAsGuest={() => setCurrentScreen('dashboard')}
            />
          )}

          {currentScreen === 'profile' && profile && (
            <ProfileView
              profile={profile}
              enrollments={enrollments}
              onProfileUpdated={(updated) => setProfile(updated)}
              onEnrollmentAdded={(enrollment) =>
                setEnrollments((prev) => [
                  enrollment,
                  ...prev.filter((e) => e.id !== enrollment.id),
                ])
              }
              onLogout={handleLogout}
              onBackToDashboard={() => setCurrentScreen('dashboard')}
              onNotify={notify}
            />
          )}

          {currentScreen === 'teacher' && (
            <TeacherDashboardView
              profile={profile}
              geminiConfigured={geminiConfigured}
              geminiModel={geminiModel}
              onMissionsChanged={() => {
                if (profile) {
                  void refreshCloudData(profile);
                }
              }}
              onReturnToDashboard={() => setCurrentScreen('dashboard')}
              onNotify={notify}
            />
          )}
        </main>

        <footer className="border-t border-slate-400/10 py-6 text-center text-xs text-slate-500">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 sm:flex-row sm:px-6">
            <span>QUESTLAB · Interactive Learning Universe</span>
            <span>
              {profile
                ? 'Server-Authoritative Grading · Cloud Firestore Sync'
                : 'Guest Practice Mode · Sign In for Server-Verified Progress & Teacher Studio'}
            </span>
          </div>
        </footer>

        <OfflineIndicator />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>
    </ErrorBoundary>
  );
}
