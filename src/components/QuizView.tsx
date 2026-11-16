import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  RotateCw,
  Send,
} from 'lucide-react';
import type { PublicMissionDefinition, SubmittedAnswerItem } from '../types/questlab';

interface QuizViewProps {
  mission: PublicMissionDefinition;
  isAuthenticated: boolean;
  assignmentId?: string;
  onSubmitAttempt: (payload: {
    attemptId: string;
    answers: SubmittedAnswerItem[];
    assignmentId?: string;
  }) => Promise<void>;
}

function generateAttemptId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `att-${crypto.randomUUID()}`;
  }
  return `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function renderSentenceWithHighlight(sentence: string, phrase: string) {
  if (!phrase) {
    return <span>{sentence}</span>;
  }
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

export function QuizView({
  mission,
  isAuthenticated,
  assignmentId,
  onSubmitAttempt,
}: QuizViewProps) {
  const [attemptId] = useState<string>(() => generateAttemptId());
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [showHint, setShowHint] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  const currentQuestion = mission.questions[questionIndex];
  const totalQuestions = mission.questions.length;
  const selectedOptionId = currentQuestion ? selectedAnswers[currentQuestion.id] || null : null;
  const answeredCount = mission.questions.filter((q) => Boolean(selectedAnswers[q.id])).length;
  const allAnswered = answeredCount === totalQuestions && totalQuestions > 0;
  const progressPercent =
    totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  const handleSelectOption = (optionId: string) => {
    if (submitting || !currentQuestion) return;
    setSubmissionError(null);
    setSelectedAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: optionId,
    }));
  };

  const handleNavigateQuestion = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= totalQuestions || submitting) return;
    setQuestionIndex(nextIndex);
    setShowHint(false);
  };

  const handleSubmitFullAttempt = async () => {
    if (!allAnswered || submitting) {
      return;
    }

    const answers: SubmittedAnswerItem[] = mission.questions.map((q) => ({
      questionId: q.id,
      selectedOptionId: selectedAnswers[q.id],
    }));

    setSubmitting(true);
    setSubmissionError(null);
    try {
      await onSubmitAttempt({
        attemptId,
        answers,
        assignmentId,
      });
    } catch (err) {
      setSubmissionError(
        err instanceof Error
          ? err.message
          : 'Unable to submit mission attempt to the grading server. Your answers are preserved.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (submitting || !currentQuestion) return;

      if (event.key === '1' && currentQuestion.options[0]) {
        handleSelectOption(currentQuestion.options[0].id);
      } else if (event.key === '2' && currentQuestion.options[1]) {
        handleSelectOption(currentQuestion.options[1].id);
      } else if (event.key === '3' && currentQuestion.options[2]) {
        handleSelectOption(currentQuestion.options[2].id);
      } else if (event.key === '4' && currentQuestion.options[3]) {
        handleSelectOption(currentQuestion.options[3].id);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (!currentQuestion) {
    return null;
  }

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

        <div className="font-mono-tabular flex items-center gap-5 text-sm">
          <div className="text-right">
            <p className="text-xs text-slate-400">Answered</p>
            <p data-testid="quiz-answered-count" className="font-semibold text-[#55D9F5]">
              {answeredCount} / {totalQuestions}
            </p>
          </div>
          <div className="h-8 w-px bg-slate-400/15" aria-hidden="true" />
          <div className="text-right">
            <p className="text-xs text-slate-400">Grading</p>
            <p className="text-xs font-semibold text-slate-200">
              {isAuthenticated ? 'Server Verified' : 'Practice Preview'}
            </p>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div
        role="progressbar"
        aria-label="Mission quiz completion progress"
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

      {/* Question Navigator */}
      <nav aria-label="Mission questions" className="mt-4 flex flex-wrap gap-2">
        {mission.questions.map((q, idx) => {
          const isCurrent = idx === questionIndex;
          const isAnswered = Boolean(selectedAnswers[q.id]);
          return (
            <button
              key={q.id}
              type="button"
              disabled={submitting}
              onClick={() => handleNavigateQuestion(idx)}
              className={`font-mono-tabular inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                isCurrent
                  ? 'border-[#55D9F5] bg-[#132341] text-[#55D9F5]'
                  : isAnswered
                    ? 'border-emerald-400/40 bg-emerald-950/25 text-emerald-200'
                    : 'border-slate-400/20 bg-[#0D1526]/75 text-slate-400 hover:text-white'
              }`}
            >
              {isAnswered && <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
              <span>Q{idx + 1}</span>
            </button>
          );
        })}
      </nav>

      {/* Main Question Stage */}
      <section className="ql-panel-accent mt-4 rounded-2xl p-5 sm:p-6">
        <p className="text-xs font-medium tracking-wide text-slate-400">
          {mission.subject} Analysis
        </p>

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
        <div role="radiogroup" aria-label="Answer choices" className="mt-3 space-y-2.5">
          {currentQuestion.options.map((option, idx) => {
            const isSelected = selectedOptionId === option.id;

            const borderStyle = isSelected
              ? 'border-[#55D9F5] bg-[#132341] shadow-[0_0_20px_-8px_rgba(85,217,245,0.45)]'
              : 'border-slate-400/20 bg-[#0D1526]/75 hover:border-[#55D9F5]/50 hover:bg-[#121D36]';
            const keyStyle = isSelected
              ? 'border-[#55D9F5] bg-[#55D9F5] text-[#06111D]'
              : 'border-slate-400/30 text-slate-300';

            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={submitting}
                onClick={() => handleSelectOption(option.id)}
                className={`flex min-h-[48px] w-full cursor-pointer items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#55D9F5] ${borderStyle}`}
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

                <span className="font-mono-tabular hidden text-xs text-slate-500 sm:inline">
                  Key {idx + 1}
                </span>
              </button>
            );
          })}
        </div>

        {/* Submission Error Banner with Preserved Answers & Retry */}
        {submissionError && (
          <div
            role="alert"
            className="mt-4 flex flex-col justify-between gap-3 rounded-xl border border-rose-400/35 bg-rose-950/35 px-4 py-3 text-xs text-rose-100 sm:flex-row sm:items-center"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden="true" />
              <div>
                <p className="font-semibold text-rose-200">Grading Submission Failed</p>
                <p className="mt-0.5 leading-relaxed text-rose-100/90">{submissionError}</p>
              </div>
            </div>
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmitFullAttempt}
              className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg bg-rose-500/90 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-rose-500"
            >
              <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Retry Submission</span>
            </button>
          </div>
        )}

        {/* Hint & Navigation / Submit Row */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            aria-expanded={showHint}
            onClick={() => setShowHint((prev) => !prev)}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-400/20 bg-[#080D19]/70 px-3.5 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-[#A68AFF]/50 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A68AFF]"
          >
            <HelpCircle className="h-4 w-4 text-[#A68AFF]" aria-hidden="true" />
            <span>{showHint ? 'Hide Hint' : 'Show Hint'}</span>
          </button>

          <div className="flex flex-wrap items-center gap-2.5">
            {questionIndex > 0 && (
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleNavigateQuestion(questionIndex - 1)}
                className="inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-400/25 bg-[#0D1526] px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-[#55D9F5]/50 hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span>Previous</span>
              </button>
            )}

            {questionIndex + 1 < totalQuestions ? (
              <button
                type="button"
                disabled={!selectedOptionId || submitting}
                onClick={() => handleNavigateQuestion(questionIndex + 1)}
                className={`inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-lg px-6 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#55D9F5] ${
                  selectedOptionId && !submitting
                    ? 'bg-[#55D9F5] text-[#06111D] hover:bg-[#7DE4FA]'
                    : 'cursor-not-allowed bg-slate-800 text-slate-500'
                }`}
              >
                <span>Next Question</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                disabled={!allAnswered || submitting}
                onClick={handleSubmitFullAttempt}
                className={`inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-lg px-6 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#55D9F5] ${
                  allAnswered && !submitting
                    ? 'bg-[#55D9F5] text-[#06111D] hover:bg-[#7DE4FA]'
                    : 'cursor-not-allowed bg-slate-800 text-slate-500'
                }`}
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                <span>{submitting ? 'Grading Attempt...' : 'Submit Mission'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Hint Panel */}
        {showHint && (
          <div className="mt-4 rounded-xl border border-[#A68AFF]/25 bg-[#131B36]/75 px-4 py-3 text-sm leading-relaxed text-slate-200">
            <span className="font-semibold text-[#A68AFF]">Hint: </span>
            <span>{currentQuestion.hint}</span>
          </div>
        )}
      </section>
    </div>
  );
}
