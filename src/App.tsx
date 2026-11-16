import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthView } from './components/AuthView';
import { CompletionView } from './components/CompletionView';
import { DashboardView } from './components/DashboardView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LandingView } from './components/LandingView';
import { MissionBriefingView } from './components/MissionBriefingView';
import { MissionSelectionView } from './components/MissionSelectionView';
import { ProfileView } from './components/ProfileView';
import { QuizView } from './components/QuizView';
import { TeacherDashboardView } from './components/TeacherDashboardView';
import { ToastContainer, type ToastMessage, type ToastTone } from './components/ToastContainer';
import { TopNav } from './components/TopNav';
import { MISSIONS } from './data/missions';
import { calculateLevelInfo, commitMissionCompletion } from './engine/progression';
import { fetchServerHealth, gradeMissionOnServer } from './services/apiClient';
import { logoutUser, subscribeToAuthState } from './services/authService';
import {
  fetchPublishedMissions,
  fetchStudentAssignments,
  fetchStudentEnrollments,
  fetchStudentSubmissions,
  markAssignmentCompleted,
  recordMissionSubmission,
} from './services/firestoreService';
import {
  FirestoreProgressRepository,
  guestProgressRepository,
} from './services/progressRepository';
import type {
  ClassEnrollment,
  LearnerProgressState,
  MissionAssignment,
  MissionDefinition,
  MissionRunSummary,
  MissionSubmission,
  QuestionResultEntry,
  ScreenRoute,
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
  curated: MissionDefinition[],
  published: MissionDefinition[],
): MissionDefinition[] {
  const map = new Map<string, MissionDefinition>();
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
  const [cloudMissions, setCloudMissions] = useState<MissionDefinition[]>([]);
  const [assignments, setAssignments] = useState<MissionAssignment[]>([]);
  const [submissions, setSubmissions] = useState<MissionSubmission[]>([]);
  const [enrollments, setEnrollments] = useState<ClassEnrollment[]>([]);

  const [activeMissionId, setActiveMissionId] = useState<string>(MISSIONS[0].id);
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
              'Progress synced to cloud',
              'Your guest XP and completed missions were merged into your account.',
              'success',
            );
          }
        } catch (err) {
          notify(
            'Cloud progress sync warning',
            err instanceof Error ? err.message : 'Using cached explorer progress.',
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

  const handleOpenMissionBriefing = useCallback((missionId: string) => {
    setActiveMissionId(missionId);
    setCurrentScreen('briefing');
  }, []);

  const handleStartMission = useCallback(() => {
    setQuizSessionKey((prev) => prev + 1);
    setCurrentScreen('quiz');
  }, []);

  const handleCompleteMission = useCallback(
    async (questionResults: QuestionResultEntry[]) => {
      let nextState: LearnerProgressState;
      let summary: MissionRunSummary;

      if (profile && cloudRepoRef.current) {
        let resolvedResults = questionResults;
        let serverTeacherId = activeMission.teacherId;

        try {
          const serverGrade = await gradeMissionOnServer(
            activeMission.id,
            questionResults.map((entry) => ({
              questionId: entry.questionId,
              selectedOptionId: entry.selectedOptionId,
            })),
          );
          resolvedResults = serverGrade.questionResults;
          if (serverGrade.teacherId) serverTeacherId = serverGrade.teacherId;

          if (serverGrade.authoritativeProgress && serverGrade.summary) {
            nextState = serverGrade.authoritativeProgress;
            summary = serverGrade.summary;
          } else {
            const computed = commitMissionCompletion(progress, activeMission, resolvedResults);
            nextState = computed.nextState;
            summary = computed.summary;
          }
        } catch {
          const computed = commitMissionCompletion(progress, activeMission, resolvedResults);
          nextState = computed.nextState;
          summary = computed.summary;
        }

        try {
          await cloudRepoRef.current.save(nextState);
        } catch (err) {
          notify(
            'Cloud save warning',
            err instanceof Error ? err.message : 'Saved locally; cloud sync will retry.',
            'error',
          );
        }

        // Record submission & complete matching assignments
        try {
          const sub = await recordMissionSubmission({
            student: profile,
            mission: activeMission,
            teacherId: serverTeacherId,
            correctCount: summary.correctCount,
            totalQuestions: summary.totalQuestions,
            xpEarnedInRun: summary.xpEarnedInRun,
            xpAddedToProfile: summary.xpAddedToProfile,
            bestStreakInRun: summary.bestStreakInRun,
          });
          setSubmissions((prev) => [sub, ...prev]);

          const pendingForMission = assignments.filter(
            (a) => a.missionId === activeMission.id && a.status === 'assigned',
          );
          for (const item of pendingForMission) {
            await markAssignmentCompleted(item.id);
          }
          if (pendingForMission.length > 0) {
            setAssignments((prev) =>
              prev.map((a) =>
                a.missionId === activeMission.id ? { ...a, status: 'completed' } : a,
              ),
            );
          }
        } catch {
          // Do not block mission completion summary if submission log fails
        }
      } else {
        const computed = commitMissionCompletion(progress, activeMission, questionResults);
        nextState = computed.nextState;
        summary = computed.summary;
        guestProgressRepository.save(nextState);
      }

      setProgress(nextState);
      setLastRunSummary(summary);
      setCurrentScreen('completion');
    },
    [activeMission, assignments, notify, profile, progress],
  );

  const handleResetProgress = useCallback(async () => {
    if (profile && cloudRepoRef.current) {
      const fresh = await cloudRepoRef.current.reset();
      setProgress(fresh);
      setLastRunSummary(null);
      notify('Cloud progress reset', 'Your explorer XP and records were cleared.', 'info');
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
              onSelectMission={handleOpenMissionBriefing}
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
              onCompleteMission={handleCompleteMission}
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
                ? 'Cloud Firestore Sync · Gemini AI Mission Studio'
                : 'Guest Local Persistence · Sign In for Cloud Sync & Teacher Studio'}
            </span>
          </div>
        </footer>

        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>
    </ErrorBoundary>
  );
}
