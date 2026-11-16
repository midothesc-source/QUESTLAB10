import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Flame,
  HelpCircle,
} from 'lucide-react';
import { evaluateQuestionAnswer } from '../engine/progression';
import type { MissionDefinition, QuestionResultEntry } from '../types/questlab';

interface QuizViewProps {
  mission: MissionDefinition;
  onCompleteMission: (results: QuestionResultEntry[]) => void;
}

function renderSentenceWithHighlight(sentence: string, phrase: string) {
  const index = sentence.toLowerCase().indexOf(phrase.toLowerCase());
  if (index === -1) {
    return <span>{sentence}</span>;
  }

  const before = sentence.slice(0, index);
  const match = sentence.slice(index, index + phrase.length);
  const after = sentence.slice(index + phrase.length);

  return (
    <>
      <span>{before}</span>
      <mark className="rounded bg-[#55D9F5]/18 px-1.5 py-0.5 font-semibold text-[#55D9F5] underline decoration-[#55D9F5]/70 decoration-2 underline-offset-4">
        {match}
      </mark>
      <span>{after}</span>
    </>
  );
}

export function QuizView({ mission, onCompleteMission }: QuizViewProps) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [runStreak, setRunStreak] = useState(0);
  const [bestRunStreak, setBestRunStreak] = useState(0);
  const [results, setResults] = useState<QuestionResultEntry[]>([]);

  const currentQuestion = mission.questions[questionIndex];
  const totalQuestions = mission.questions.length;
  const currentResult = isSubmitted ? results[questionIndex] : undefined;
  const runXpTotal = results.reduce((sum, entry) => sum + entry.xpEarned, 0);
  const progressPercent = Math.round(
    ((questionIndex + (isSubmitted ? 1 : 0)) / totalQuestions) * 100,
  );

  const handleCheckAnswer = () => {
    if (!selectedOptionId || isSubmitted) {
      return;
    }

    const outcome = evaluateQuestionAnswer(
      currentQuestion,
      selectedOptionId,
      mission,
      runStreak,
      bestRunStreak,
    );

    const entry: QuestionResultEntry = {
      questionId: currentQuestion.id,
      selectedOptionId,
      isCorrect: outcome.isCorrect,
      xpEarned: outcome.xpEarned,
    };

    setRunStreak(outcome.nextRunStreak);
    setBestRunStreak(outcome.nextBestRunStreak);
    setResults((prev) => [...prev, entry]);
    setIsSubmitted(true);
  };

  const handleNextStep = () => {
    if (!isSubmitted) {
      return;
    }

    if (questionIndex + 1 < totalQuestions) {
      setQuestionIndex((prev) => prev + 1);
      setSelectedOptionId(null);
      setIsSubmitted(false);
      setShowHint(false);
    } else {
      onCompleteMission(results);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (!isSubmitted) {
        if (event.key === '1' && currentQuestion.options[0]) {
          setSelectedOptionId(currentQuestion.options[0].id);
        } else if (event.key === '2' && currentQuestion.options[1]) {
          setSelectedOptionId(currentQuestion.options[1].id);
        } else if (event.key === '3' && currentQuestion.options[2]) {
          setSelectedOptionId(currentQuestion.options[2].id);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentQuestion.options, isSubmitted]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:py-7">
      {/* Progress & Telemetry Header */}
      <div className="flex flex-col gap-3 border-b border-slate-400/15 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium text-[#55D9F5]">
            {mission.title}
            <span className="mx-2 text-slate-500" aria-hidden="true">
              ·
            </span>
            <span className="text-slate-300">{mission.topic}</span>
          </p>
          <h1 className="font-display mt-1 text-2xl font-bold text-white">
            Question {questionIndex + 1} of {totalQuestions}
          </h1>
        </div>

        <div className="flex items-center gap-5 text-sm font-mono-tabular">
          <div className="text-right">
            <p className="text-xs text-slate-400">Run XP</p>
            <p data-testid="quiz-run-xp" className="font-semibold text-[#55D9F5]">
              +{runXpTotal} XP
            </p>
          </div>
          <div className="h-8 w-px bg-slate-400/15" aria-hidden="true" />
          <div className="text-right">
            <p className="text-xs text-slate-400">Streak</p>
            <p className="inline-flex items-center gap-1 font-semibold text-white">
              <Flame className="h-4 w-4 text-[#A68AFF]" aria-hidden="true" />
              <span data-testid="quiz-run-streak">{runStreak}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div
        role="progressbar"
        aria-label="Mission quiz progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressPercent}
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#111B33]"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#55D9F5] to-[#A68AFF] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Main Question Stage */}
      <section className="ql-panel-accent mt-5 rounded-2xl p-5 sm:p-6">
        <p className="text-xs font-medium tracking-wide text-slate-400">Sentence Analysis</p>

        <blockquote className="mt-2.5 rounded-xl bg-[#080D19]/85 px-4 py-3.5 text-lg leading-relaxed text-white sm:text-xl">
          {renderSentenceWithHighlight(
            currentQuestion.promptSentence,
            currentQuestion.targetPhrase,
          )}
        </blockquote>

        <p className="mt-4 text-base font-semibold text-slate-100">
          {currentQuestion.questionText}
        </p>

        {/* Answer Choices */}
        <div
          role="radiogroup"
          aria-label="Answer choices"
          className="mt-3 space-y-2.5"
        >
          {currentQuestion.options.map((option, idx) => {
            const isSelected = selectedOptionId === option.id;
            const isCorrectOption = option.id === currentQuestion.correctOptionId;

            let borderStyle =
              'border-slate-400/20 bg-[#0D1526]/75 hover:border-[#55D9F5]/50 hover:bg-[#121D36]';
            let keyStyle = 'border-slate-400/30 text-slate-300';

            if (!isSubmitted && isSelected) {
              borderStyle = 'border-[#55D9F5] bg-[#132341] shadow-[0_0_20px_-8px_rgba(85,217,245,0.45)]';
              keyStyle = 'border-[#55D9F5] bg-[#55D9F5] text-[#06111D]';
            } else if (isSubmitted && isCorrectOption) {
              borderStyle = 'border-emerald-400/70 bg-emerald-950/35';
              keyStyle = 'border-emerald-400 bg-emerald-400 text-[#06111D]';
            } else if (isSubmitted && isSelected && !isCorrectOption) {
              borderStyle = 'border-rose-400/70 bg-rose-950/35';
              keyStyle = 'border-rose-400 bg-rose-400 text-[#06111D]';
            }

            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={isSubmitted}
                onClick={() => setSelectedOptionId(option.id)}
                className={`flex min-h-[48px] w-full items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#55D9F5] ${borderStyle} ${
                  isSubmitted ? 'cursor-default' : 'cursor-pointer'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <span
                    className={`font-mono-tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-xs font-semibold transition-colors ${keyStyle}`}
                  >
                    {option.keyLabel}
                  </span>
                  <span className="text-sm font-medium text-slate-100 sm:text-base">
                    {option.text}
                  </span>
                </div>

                <span className="hidden text-xs text-slate-500 font-mono-tabular sm:inline">
                  Key {idx + 1}
                </span>
              </button>
            );
          })}
        </div>

        {/* Hint & Validation Row */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            aria-expanded={showHint}
            onClick={() => setShowHint((prev) => !prev)}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-400/20 bg-[#080D19]/70 px-3.5 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-[#A68AFF]/50 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A68AFF]"
          >
            <HelpCircle className="h-4 w-4 text-[#A68AFF]" aria-hidden="true" />
            <span>{showHint ? 'Hide Hint' : 'Show Hint'}</span>
          </button>

          {!isSubmitted ? (
            <button
              type="button"
              disabled={!selectedOptionId}
              onClick={handleCheckAnswer}
              className={`inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-lg px-6 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#55D9F5] ${
                selectedOptionId
                  ? 'bg-[#55D9F5] text-[#06111D] hover:bg-[#7DE4FA]'
                  : 'cursor-not-allowed bg-slate-800 text-slate-500'
              }`}
            >
              <span>Check Answer</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNextStep}
              className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-lg bg-[#55D9F5] px-6 py-2.5 text-sm font-semibold text-[#06111D] transition-colors hover:bg-[#7DE4FA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#55D9F5]"
            >
              <span>
                {questionIndex + 1 < totalQuestions ? 'Next Question' : 'Complete Mission'}
              </span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Hint Panel */}
        {showHint && (
          <div className="mt-4 rounded-xl border border-[#A68AFF]/25 bg-[#131B36]/75 px-4 py-3 text-sm leading-relaxed text-slate-200">
            <span className="font-semibold text-[#A68AFF]">Hint: </span>
            <span>{currentQuestion.hint}</span>
          </div>
        )}

        {/* Validation & Detailed Explanation */}
        {isSubmitted && currentResult && (
          <div
            role="status"
            aria-live="polite"
            className={`mt-4 rounded-xl border p-4 ${
              currentResult.isCorrect
                ? 'border-emerald-400/35 bg-emerald-950/30'
                : 'border-amber-400/35 bg-amber-950/25'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {currentResult.isCorrect ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-300" aria-hidden="true" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-amber-300" aria-hidden="true" />
                )}
                <p
                  className={`text-sm font-semibold ${
                    currentResult.isCorrect ? 'text-emerald-200' : 'text-amber-200'
                  }`}
                >
                  {currentResult.isCorrect
                    ? 'Correct Answer'
                    : 'Incorrect — Review Explanation'}
                </p>
              </div>

              <span className="font-mono-tabular text-xs font-semibold text-[#55D9F5]">
                +{currentResult.xpEarned} XP
              </span>
            </div>

            <p className="mt-2 text-sm leading-relaxed text-slate-200">
              {currentQuestion.explanation}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
