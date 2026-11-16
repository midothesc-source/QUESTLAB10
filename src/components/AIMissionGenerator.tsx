import { useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { validateMissionPayload } from '../engine/missionValidation';
import { generateMissionViaAI, regenerateQuestionViaAI } from '../services/apiClient';
import type {
  DifficultyLevel,
  MissionDefinition,
  MissionQuestion,
  QuestionStyle,
  SubjectWorldId,
} from '../types/questlab';

interface AIMissionGeneratorProps {
  geminiConfigured: boolean;
  geminiModel: string;
  initialDraft?: MissionDefinition | null;
  onSaveMission: (mission: MissionDefinition, status: 'draft' | 'published') => Promise<void>;
  onCancelEdit?: () => void;
  onNotify: (title: string, description: string, tone: 'success' | 'error' | 'info') => void;
}

const WORLD_SUBJECT_LABELS: Record<SubjectWorldId, string> = {
  english: 'English',
  mathematics: 'Mathematics',
  science: 'Science',
  business: 'Business',
};

export function AIMissionGenerator({
  geminiConfigured,
  geminiModel,
  initialDraft,
  onSaveMission,
  onCancelEdit,
  onNotify,
}: AIMissionGeneratorProps) {
  const [worldId, setWorldId] = useState<SubjectWorldId>(initialDraft?.worldId || 'english');
  const [topic, setTopic] = useState(initialDraft?.topic || '');
  const [gradeLevel, setGradeLevel] = useState(initialDraft?.gradeLevel || 'Middle School (Grades 6-8)');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(
    initialDraft?.difficulty || 'Intermediate',
  );
  const [questionCount, setQuestionCount] = useState(initialDraft?.questions.length || 4);
  const [questionStyle, setQuestionStyle] = useState<QuestionStyle>('conceptual');
  const [objectivesText, setObjectivesText] = useState(
    initialDraft?.objectives.join('\n') || '',
  );

  const [generating, setGenerating] = useState(false);
  const [regeneratingQuestionId, setRegeneratingQuestionId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<MissionDefinition | null>(initialDraft || null);

  const validation = draft ? validateMissionPayload(draft) : null;

  const handleGenerate = async (event: FormEvent) => {
    event.preventDefault();
    if (!topic.trim()) {
      onNotify('Topic required', 'Enter a curriculum topic for Gemini to generate.', 'error');
      return;
    }

    setGenerating(true);
    try {
      const generated = await generateMissionViaAI({
        worldId,
        subject: WORLD_SUBJECT_LABELS[worldId],
        topic: topic.trim(),
        gradeLevel: gradeLevel.trim(),
        difficulty,
        questionCount,
        questionStyle,
        learningObjectives: objectivesText
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
      });
      setDraft(generated);
      onNotify(
        'Draft mission generated',
        `Review and edit "${generated.title}" before publishing to students.`,
        'success',
      );
    } catch (err) {
      onNotify(
        'Gemini generation failed',
        err instanceof Error ? err.message : 'Unable to generate mission.',
        'error',
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleCreateManualBlank = () => {
    const id = `mission-${worldId}-${Date.now().toString(36).slice(-5)}`;
    setDraft({
      id,
      worldId,
      title: topic.trim() ? `${topic.trim()} Expedition` : `New ${WORLD_SUBJECT_LABELS[worldId]} Mission`,
      subject: WORLD_SUBJECT_LABELS[worldId],
      topic: topic.trim() || 'Core Concept Mastery',
      gradeLevel,
      difficulty,
      summary:
        'Explore foundational concepts through interactive scenario prompts, targeted hints, and detailed explanations.',
      estimatedMinutes: Math.max(3, questionCount * 2),
      objectives: [
        'Analyze real-world scenarios and identify the core concept.',
        'Apply domain reasoning with immediate explanatory feedback.',
      ],
      xpPerCorrect: 30,
      xpPerIncorrect: 5,
      imageSrc:
        worldId === 'mathematics'
          ? '/src/assets/images/world_mathematics_1794854621462.jpg'
          : worldId === 'science'
            ? '/src/assets/images/world_science_1794854622907.jpg'
            : worldId === 'business'
              ? '/src/assets/images/world_business_1794854623250.jpg'
              : '/src/assets/images/world_english_grammar_1794854621776.jpg',
      imageAlt: `${WORLD_SUBJECT_LABELS[worldId]} mission sanctuary`,
      authorType: 'teacher_created',
      status: 'draft',
      questions: [1, 2, 3].map((num) => ({
        id: `q-${num}`,
        promptSentence: `Sample scenario prompt ${num} with key concept highlighted.`,
        targetPhrase: 'key concept',
        questionText: `Which answer best explains scenario ${num}?`,
        options: [
          { id: 'a', keyLabel: 'A', text: 'Primary correct concept option' },
          { id: 'b', keyLabel: 'B', text: 'Common misconception distractor' },
          { id: 'c', keyLabel: 'C', text: 'Alternative distractor option' },
        ],
        correctOptionId: 'a',
        hint: 'Focus on the highlighted phrase and how it operates in context.',
        explanation: 'Option A accurately applies the core principle in this scenario.',
      })),
    });
  };

  const handleUpdateQuestion = (
    index: number,
    updater: (current: MissionQuestion) => MissionQuestion,
  ) => {
    if (!draft) return;
    const nextQuestions = draft.questions.map((q, idx) => (idx === index ? updater(q) : q));
    setDraft({ ...draft, questions: nextQuestions });
  };

  const handleAddQuestion = () => {
    if (!draft || draft.questions.length >= 10) return;
    const nextIdx = draft.questions.length + 1;
    setDraft({
      ...draft,
      questions: [
        ...draft.questions,
        {
          id: `q-${nextIdx}-${Date.now().toString(36).slice(-3)}`,
          promptSentence: 'Enter the context sentence or problem statement here.',
          targetPhrase: 'problem statement',
          questionText: 'What is the correct conclusion?',
          options: [
            { id: 'a', keyLabel: 'A', text: 'Option A' },
            { id: 'b', keyLabel: 'B', text: 'Option B' },
            { id: 'c', keyLabel: 'C', text: 'Option C' },
          ],
          correctOptionId: 'a',
          hint: 'Write a guiding hint without revealing the answer.',
          explanation: 'Explain clearly why the correct option is right.',
        },
      ],
    });
  };

  const handleRemoveQuestion = (index: number) => {
    if (!draft || draft.questions.length <= 3) return;
    setDraft({
      ...draft,
      questions: draft.questions.filter((_, idx) => idx !== index),
    });
  };

  const handleRegenerateQuestion = async (index: number) => {
    if (!draft) return;
    const target = draft.questions[index];
    setRegeneratingQuestionId(target.id);
    try {
      const replacement = await regenerateQuestionViaAI({
        subject: draft.subject,
        topic: draft.topic,
        gradeLevel: draft.gradeLevel || gradeLevel,
        difficulty: draft.difficulty || difficulty,
        existingQuestionId: target.id,
        previousQuestionText: `${target.promptSentence} ${target.questionText}`,
      });
      handleUpdateQuestion(index, () => replacement);
      onNotify('Question regenerated', `Replaced Question ${index + 1} via Gemini.`, 'success');
    } catch (err) {
      onNotify(
        'Regeneration failed',
        err instanceof Error ? err.message : 'Unable to regenerate question.',
        'error',
      );
    } finally {
      setRegeneratingQuestionId(null);
    }
  };

  const handleSave = async (status: 'draft' | 'published') => {
    if (!draft) return;
    const check = validateMissionPayload(draft);
    if (!check.valid) {
      onNotify('Validation issues', check.errors[0], 'error');
      return;
    }

    setSaving(true);
    try {
      await onSaveMission(draft, status);
      if (status === 'published') {
        setDraft(null);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* AI Configuration & Generator Form */}
      <section className="ql-panel-accent rounded-2xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-400/15 pb-5">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold text-[#55D9F5]">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>Gemini AI Mission Studio</span>
            </p>
            <h2 className="font-display mt-1 text-2xl font-bold text-white">
              Generate &amp; Curate Learning Missions
            </h2>
            <p className="mt-1 text-xs text-slate-300">
              Server-side Gemini integration ({geminiModel}) creates structured drafts ready for
              educator review and publishing.
            </p>
          </div>

          <span
            className={`font-mono-tabular text-xs font-medium ${
              geminiConfigured ? 'text-emerald-300' : 'text-amber-300'
            }`}
          >
            {geminiConfigured ? 'Gemini API Key Active' : 'GEMINI_API_KEY Not Configured'}
          </span>
        </div>

        {!geminiConfigured && (
          <div className="mt-4 rounded-xl border border-amber-400/35 bg-amber-950/30 p-4 text-xs leading-relaxed text-amber-100">
            <p className="font-semibold">Server-side GEMINI_API_KEY is not set in this environment.</p>
            <p className="mt-1 text-amber-200/80">
              Add <code>GEMINI_API_KEY</code> in AI Studio Secrets or <code>.env</code> to enable
              live AI generation, or click <strong>Build Manual Draft</strong> below to author and
              publish missions directly.
            </p>
          </div>
        )}

        <form onSubmit={handleGenerate} className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="ai-world" className="block text-xs font-medium text-slate-300">
              Subject World
            </label>
            <select
              id="ai-world"
              value={worldId}
              onChange={(e) => setWorldId(e.target.value as SubjectWorldId)}
              className="mt-1.5 w-full rounded-lg border border-slate-400/25 bg-[#080D19] px-3 py-2.5 text-sm text-white focus:border-[#55D9F5] focus:outline-none"
            >
              <option value="english">English</option>
              <option value="mathematics">Mathematics</option>
              <option value="science">Science</option>
              <option value="business">Business</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="ai-topic" className="block text-xs font-medium text-slate-300">
              Topic / Standard
            </label>
            <input
              id="ai-topic"
              type="text"
              required
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Linear Equations in Two Variables, Cellular Respiration, Unit Economics"
              className="mt-1.5 w-full rounded-lg border border-slate-400/25 bg-[#080D19] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-[#55D9F5] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="ai-grade" className="block text-xs font-medium text-slate-300">
              Grade Level
            </label>
            <select
              id="ai-grade"
              value={gradeLevel}
              onChange={(e) => setGradeLevel(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-400/25 bg-[#080D19] px-3 py-2.5 text-sm text-white focus:border-[#55D9F5] focus:outline-none"
            >
              <option value="Elementary (Grades 3-5)">Elementary (Grades 3-5)</option>
              <option value="Middle School (Grades 6-8)">Middle School (Grades 6-8)</option>
              <option value="High School (Grades 9-12)">High School (Grades 9-12)</option>
              <option value="University / AP">University / AP</option>
            </select>
          </div>

          <div>
            <label htmlFor="ai-difficulty" className="block text-xs font-medium text-slate-300">
              Difficulty
            </label>
            <select
              id="ai-difficulty"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
              className="mt-1.5 w-full rounded-lg border border-slate-400/25 bg-[#080D19] px-3 py-2.5 text-sm text-white focus:border-[#55D9F5] focus:outline-none"
            >
              <option value="Foundational">Foundational</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Advanced">Advanced</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ai-count" className="block text-xs font-medium text-slate-300">
                Questions (3-10)
              </label>
              <input
                id="ai-count"
                type="number"
                min={3}
                max={10}
                value={questionCount}
                onChange={(e) => setQuestionCount(Math.max(3, Math.min(10, Number(e.target.value) || 3)))}
                className="mt-1.5 w-full rounded-lg border border-slate-400/25 bg-[#080D19] px-3 py-2.5 text-sm text-white focus:border-[#55D9F5] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="ai-style" className="block text-xs font-medium text-slate-300">
                Question Style
              </label>
              <select
                id="ai-style"
                value={questionStyle}
                onChange={(e) => setQuestionStyle(e.target.value as QuestionStyle)}
                className="mt-1.5 w-full rounded-lg border border-slate-400/25 bg-[#080D19] px-2.5 py-2.5 text-sm text-white focus:border-[#55D9F5] focus:outline-none"
              >
                <option value="conceptual">Conceptual</option>
                <option value="applied">Applied</option>
                <option value="analytical">Analytical</option>
              </select>
            </div>
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <label htmlFor="ai-objectives" className="block text-xs font-medium text-slate-300">
              Learning Objectives (optional, one per line)
            </label>
            <textarea
              id="ai-objectives"
              rows={2}
              value={objectivesText}
              onChange={(e) => setObjectivesText(e.target.value)}
              placeholder="Distinguish between rate of change and initial value in real-world contexts..."
              className="mt-1.5 w-full rounded-lg border border-slate-400/25 bg-[#080D19] px-3.5 py-2 text-sm text-white placeholder:text-slate-500 focus:border-[#55D9F5] focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              disabled={generating || !geminiConfigured}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#55D9F5] px-5 py-2.5 text-sm font-semibold text-[#06111D] transition-colors hover:bg-[#7DE4FA] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>{generating ? 'Generating with Gemini...' : 'Generate Mission'}</span>
            </button>

            <button
              type="button"
              onClick={handleCreateManualBlank}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-400/25 bg-[#0D1526] px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:border-[#A68AFF]/60 hover:text-white"
            >
              <Plus className="h-4 w-4 text-[#A68AFF]" aria-hidden="true" />
              <span>Build Manual Draft</span>
            </button>
          </div>
        </form>
      </section>

      {/* Draft Review & Editor */}
      {draft && (
        <section className="ql-panel rounded-2xl p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-400/15 pb-5">
            <div>
              <p className="text-xs font-semibold text-[#A68AFF]">
                Draft Review &amp; Editor · {draft.subject}
              </p>
              <h3 className="font-display mt-1 text-xl font-bold text-white">{draft.title}</h3>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {onCancelEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setDraft(null);
                    onCancelEdit();
                  }}
                  className="min-h-[40px] rounded-lg border border-slate-400/25 px-3.5 py-2 text-xs font-medium text-slate-300 hover:text-white"
                >
                  Close Draft
                </button>
              )}
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSave('draft')}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-400/25 bg-[#0D1526] px-4 py-2 text-xs font-semibold text-white hover:border-[#55D9F5]/60 disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5 text-[#55D9F5]" aria-hidden="true" />
                <span>{saving ? 'Saving...' : 'Save as Draft'}</span>
              </button>
              <button
                type="button"
                disabled={saving || Boolean(validation && !validation.valid)}
                onClick={() => handleSave('published')}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#55D9F5] px-4 py-2 text-xs font-semibold text-[#06111D] hover:bg-[#7DE4FA] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{saving ? 'Publishing...' : 'Publish Mission'}</span>
              </button>
            </div>
          </div>

          {validation && !validation.valid && (
            <div className="mt-4 rounded-xl border border-rose-400/35 bg-rose-950/30 p-3 text-xs text-rose-200">
              <p className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Fix before publishing:</span>
              </p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
                {validation.errors.slice(0, 4).map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {validation?.valid && (
            <div className="mt-4 flex items-center gap-2 text-xs text-emerald-300">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              <span>Mission schema verified ({draft.questions.length} questions ready).</span>
            </div>
          )}

          {/* Mission Metadata Fields */}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-300">Mission Title</label>
              <input
                type="text"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-400/25 bg-[#080D19] px-3 py-2 text-sm text-white focus:border-[#55D9F5] focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-300">Minutes</label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={draft.estimatedMinutes}
                  onChange={(e) =>
                    setDraft({ ...draft, estimatedMinutes: Math.max(1, Number(e.target.value) || 3) })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-400/25 bg-[#080D19] px-2.5 py-2 text-sm text-white focus:border-[#55D9F5] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300">XP Correct</label>
                <input
                  type="number"
                  min={5}
                  max={200}
                  value={draft.xpPerCorrect}
                  onChange={(e) =>
                    setDraft({ ...draft, xpPerCorrect: Math.max(5, Number(e.target.value) || 30) })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-400/25 bg-[#080D19] px-2.5 py-2 text-sm text-white focus:border-[#55D9F5] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300">XP Attempt</label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={draft.xpPerIncorrect}
                  onChange={(e) =>
                    setDraft({ ...draft, xpPerIncorrect: Math.max(0, Number(e.target.value) || 5) })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-400/25 bg-[#080D19] px-2.5 py-2 text-sm text-white focus:border-[#55D9F5] focus:outline-none"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-300">Briefing Summary</label>
              <textarea
                rows={2}
                value={draft.summary}
                onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-400/25 bg-[#080D19] px-3 py-2 text-sm text-white focus:border-[#55D9F5] focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-300">
                Objectives (one per line)
              </label>
              <textarea
                rows={2}
                value={draft.objectives.join('\n')}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    objectives: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean),
                  })
                }
                className="mt-1 w-full rounded-lg border border-slate-400/25 bg-[#080D19] px-3 py-2 text-sm text-white focus:border-[#55D9F5] focus:outline-none"
              />
            </div>
          </div>

          {/* Questions List */}
          <div className="mt-7 space-y-5 border-t border-slate-400/15 pt-6">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-display text-lg font-semibold text-white">
                Questions ({draft.questions.length})
              </h4>
              {draft.questions.length < 10 && (
                <button
                  type="button"
                  onClick={handleAddQuestion}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-400/25 px-3 py-1.5 text-xs font-medium text-[#55D9F5] hover:border-[#55D9F5]/60"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Add Question</span>
                </button>
              )}
            </div>

            {draft.questions.map((question, qIdx) => (
              <div
                key={question.id}
                className="rounded-xl border border-slate-400/18 bg-[#080D19]/85 p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono-tabular text-xs font-semibold text-[#55D9F5]">
                    Question {qIdx + 1}
                  </span>
                  <div className="flex items-center gap-2">
                    {geminiConfigured && (
                      <button
                        type="button"
                        disabled={regeneratingQuestionId === question.id}
                        onClick={() => handleRegenerateQuestion(qIdx)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-400/20 px-2.5 py-1 text-xs text-slate-300 hover:border-[#A68AFF]/60 hover:text-white disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`h-3 w-3 ${
                            regeneratingQuestionId === question.id ? 'animate-spin' : ''
                          }`}
                          aria-hidden="true"
                        />
                        <span>Regenerate</span>
                      </button>
                    )}
                    {draft.questions.length > 3 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveQuestion(qIdx)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-400/20 px-2.5 py-1 text-xs text-rose-300 hover:border-rose-400/50"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden="true" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-medium text-slate-400">
                      Context Sentence / Scenario
                    </label>
                    <input
                      type="text"
                      value={question.promptSentence}
                      onChange={(e) =>
                        handleUpdateQuestion(qIdx, (cur) => ({
                          ...cur,
                          promptSentence: e.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-400/20 bg-[#0D1526] px-3 py-2 text-sm text-white focus:border-[#55D9F5] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400">
                      Highlighted Target Phrase
                    </label>
                    <input
                      type="text"
                      value={question.targetPhrase}
                      onChange={(e) =>
                        handleUpdateQuestion(qIdx, (cur) => ({
                          ...cur,
                          targetPhrase: e.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-400/20 bg-[#0D1526] px-3 py-2 text-sm text-white focus:border-[#55D9F5] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400">
                      Question Prompt
                    </label>
                    <input
                      type="text"
                      value={question.questionText}
                      onChange={(e) =>
                        handleUpdateQuestion(qIdx, (cur) => ({
                          ...cur,
                          questionText: e.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-400/20 bg-[#0D1526] px-3 py-2 text-sm text-white focus:border-[#55D9F5] focus:outline-none"
                    />
                  </div>

                  {/* Options */}
                  <div className="space-y-2 sm:col-span-2">
                    <p className="text-[11px] font-medium text-slate-400">
                      Answer Choices (select the correct option)
                    </p>
                    {question.options.map((opt, optIdx) => (
                      <div key={opt.id} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`correct-${question.id}`}
                          checked={question.correctOptionId === opt.id}
                          onChange={() =>
                            handleUpdateQuestion(qIdx, (cur) => ({
                              ...cur,
                              correctOptionId: opt.id,
                            }))
                          }
                          aria-label={`Mark option ${opt.keyLabel} as correct`}
                          className="h-4 w-4 accent-[#55D9F5]"
                        />
                        <span className="font-mono-tabular w-6 text-xs font-semibold text-slate-300">
                          {opt.keyLabel}
                        </span>
                        <input
                          type="text"
                          value={opt.text}
                          onChange={(e) =>
                            handleUpdateQuestion(qIdx, (cur) => ({
                              ...cur,
                              options: cur.options.map((o, i) =>
                                i === optIdx ? { ...o, text: e.target.value } : o,
                              ),
                            }))
                          }
                          className="flex-1 rounded-lg border border-slate-400/20 bg-[#0D1526] px-3 py-1.5 text-sm text-white focus:border-[#55D9F5] focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400">Hint</label>
                    <input
                      type="text"
                      value={question.hint}
                      onChange={(e) =>
                        handleUpdateQuestion(qIdx, (cur) => ({ ...cur, hint: e.target.value }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-400/20 bg-[#0D1526] px-3 py-2 text-xs text-slate-200 focus:border-[#55D9F5] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400">
                      Detailed Explanation
                    </label>
                    <input
                      type="text"
                      value={question.explanation}
                      onChange={(e) =>
                        handleUpdateQuestion(qIdx, (cur) => ({
                          ...cur,
                          explanation: e.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-400/20 bg-[#0D1526] px-3 py-2 text-xs text-slate-200 focus:border-[#55D9F5] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
