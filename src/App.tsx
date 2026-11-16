import { useCallback, useEffect, useState } from 'react';
import { CompletionView } from './components/CompletionView';
import { DashboardView } from './components/DashboardView';
import { LandingView } from './components/LandingView';
import { MissionBriefingView } from './components/MissionBriefingView';
import { MissionSelectionView } from './components/MissionSelectionView';
import { QuizView } from './components/QuizView';
import { TopNav } from './components/TopNav';
import { getMissionById, MISSIONS } from './data/missions';
import { calculateLevelInfo, commitMissionCompletion } from './engine/progression';
import { progressRepository } from './services/progressRepository';
import type {
  LearnerProgressState,
  MissionRunSummary,
  QuestionResultEntry,
  ScreenRoute,
} from './types/questlab';

function getInitialScreen(): ScreenRoute {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      return 'dashboard';
    }
  }
  return 'landing';
}

export default function App() {
  const [progress, setProgress] = useState<LearnerProgressState>(() => progressRepository.load());
  const [currentScreen, setCurrentScreen] = useState<ScreenRoute>(getInitialScreen);
  const [activeMissionId, setActiveMissionId] = useState<string>(MISSIONS[0].id);
  const [quizSessionKey, setQuizSessionKey] = useState(0);
  const [lastRunSummary, setLastRunSummary] = useState<MissionRunSummary | null>(null);

  const activeMission = getMissionById(activeMissionId) ?? MISSIONS[0];
  const levelInfo = calculateLevelInfo(progress.totalXp);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [currentScreen]);

  const handleOpenMissionBriefing = useCallback((missionId: string) => {
    setActiveMissionId(missionId);
    setCurrentScreen('briefing');
  }, []);

  const handleStartMission = useCallback(() => {
    setQuizSessionKey((prev) => prev + 1);
    setCurrentScreen('quiz');
  }, []);

  const handleCompleteMission = useCallback(
    (questionResults: QuestionResultEntry[]) => {
      const { nextState, summary } = commitMissionCompletion(
        progress,
        activeMission,
        questionResults,
      );
      progressRepository.save(nextState);
      setProgress(nextState);
      setLastRunSummary(summary);
      setCurrentScreen('completion');
    },
    [activeMission, progress],
  );

  const handleResetProgress = useCallback(() => {
    const fresh = progressRepository.reset();
    setProgress(fresh);
    setLastRunSummary(null);
  }, []);

  return (
    <div className="ql-cosmic-backdrop flex min-h-screen flex-col text-[#F1F5F9]">
      <TopNav
        currentScreen={currentScreen}
        onNavigate={setCurrentScreen}
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
            onOpenWorlds={() => setCurrentScreen('missions')}
            onOpenMissionBriefing={handleOpenMissionBriefing}
            onResetProgress={handleResetProgress}
          />
        )}

        {currentScreen === 'missions' && (
          <MissionSelectionView
            progress={progress}
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
            onCompleteMission={handleCompleteMission}
          />
        )}

        {currentScreen === 'completion' && lastRunSummary && (
          <CompletionView
            mission={activeMission}
            summary={lastRunSummary}
            progress={progress}
            onReplayMission={handleStartMission}
            onReturnToDashboard={() => setCurrentScreen('dashboard')}
            onOpenWorlds={() => setCurrentScreen('missions')}
          />
        )}
      </main>

      <footer className="border-t border-slate-400/10 py-6 text-center text-xs text-slate-500">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 sm:flex-row sm:px-6">
          <span>QUESTLAB · Interactive Learning Universe</span>
          <span>Local Explorer Persistence · Prepared for Multi-World Expansion</span>
        </div>
      </footer>
    </div>
  );
}
