import { GoogleGenAI, Type } from '@google/genai';
import {
  sanitizeId,
  validateMissionPayload,
  validateQuestion,
} from '../src/engine/missionValidation.ts';
import type {
  AIMissionGeneratorInput,
  MissionDefinition,
  MissionQuestion,
  SubjectWorldId,
} from '../src/types/questlab.ts';

const DEFAULT_GEMINI_MODEL = 'gemini-4-hydrogen';

const WORLD_IMAGE_MAP: Record<SubjectWorldId, { src: string; alt: string }> = {
  english: {
    src: '/src/assets/images/world_english_grammar_1794854621776.jpg',
    alt: 'The Grammar Vault architectural library with cyan and violet holographic syntax rings',
  },
  mathematics: {
    src: '/src/assets/images/world_mathematics_1794854621462.jpg',
    alt: 'Cosmic mathematics chamber with suspended geometric polyhedra and coordinate planes',
  },
  science: {
    src: '/src/assets/images/world_science_1794854622907.jpg',
    alt: 'Orbital physics and molecular containment laboratory overlooking a planet horizon',
  },
  business: {
    src: '/src/assets/images/world_business_1794854623250.jpg',
    alt: 'Nocturnal strategic command atrium with dark glass architecture overlooking a calm horizon',
  },
};

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0 || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured on the server. Set GEMINI_API_KEY in AI Studio Secrets or .env.',
    );
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function getConfiguredGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

const QUESTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING, description: 'Unique short alphanumeric-hyphen ID like q-1' },
    promptSentence: {
      type: Type.STRING,
      description: 'Context sentence, scenario, or problem statement for the learner to analyze.',
    },
    targetPhrase: {
      type: Type.STRING,
      description:
        'Exact key phrase or value inside promptSentence to highlight (must appear verbatim in promptSentence, or leave concise key expression).',
    },
    questionText: { type: Type.STRING, description: 'Clear question prompt for the learner.' },
    options: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: 'Option id: a, b, c, or d' },
          keyLabel: { type: Type.STRING, description: 'Uppercase letter A, B, C, or D' },
          text: { type: Type.STRING, description: 'Choice text' },
        },
        required: ['id', 'keyLabel', 'text'],
      },
    },
    correctOptionId: {
      type: Type.STRING,
      description: 'Must match exactly one option.id (e.g. a, b, c, or d).',
    },
    hint: { type: Type.STRING, description: 'Helpful guiding hint that does not reveal the answer.' },
    explanation: {
      type: Type.STRING,
      description: 'Detailed educational explanation justifying why the correct answer works.',
    },
  },
  required: [
    'id',
    'promptSentence',
    'targetPhrase',
    'questionText',
    'options',
    'correctOptionId',
    'hint',
    'explanation',
  ],
};

const MISSION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    summary: { type: Type.STRING },
    estimatedMinutes: { type: Type.INTEGER },
    objectives: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    questions: {
      type: Type.ARRAY,
      items: QUESTION_SCHEMA,
    },
  },
  required: ['title', 'summary', 'estimatedMinutes', 'objectives', 'questions'],
};

interface RawGeneratedMission {
  title: string;
  summary: string;
  estimatedMinutes: number;
  objectives: string[];
  questions: MissionQuestion[];
}

export async function generateDraftMissionWithGemini(
  input: AIMissionGeneratorInput,
  teacherUid: string,
): Promise<MissionDefinition> {
  const ai = getGeminiClient();
  const model = getConfiguredGeminiModel();
  const clampedCount = Math.min(10, Math.max(3, Math.round(input.questionCount)));
  const objectivesText =
    input.learningObjectives.length > 0
      ? input.learningObjectives.join('; ')
      : `Demonstrate mastery of ${input.topic} at ${input.gradeLevel} level`;

  const prompt = [
    `Create an educational QUESTLAB mission in JSON.`,
    `Subject: ${input.subject} (World: ${input.worldId})`,
    `Topic: ${input.topic}`,
    `Grade Level: ${input.gradeLevel}`,
    `Difficulty: ${input.difficulty}`,
    `Question Style: ${input.questionStyle}`,
    `Learning Objectives: ${objectivesText}`,
    `Number of Questions: EXACTLY ${clampedCount} questions.`,
    `Rules:`,
    `- Each question must have 3 or 4 options with ids "a", "b", "c" (and optional "d") and keyLabels "A", "B", "C" (and "D").`,
    `- Exactly one option matches correctOptionId.`,
    `- Every question must have a unique id (q-1, q-2, ...), a clear promptSentence, a targetPhrase inside promptSentence to highlight, a helpful hint, and a detailed educational explanation.`,
    `- Do not include markdown or commentary outside JSON.`,
  ].join('\n');

  let lastErrors: string[] = [];

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction:
          'You are an expert curriculum designer creating rigorous, accurate, age-appropriate multiple-choice learning missions for QUESTLAB.',
        responseMimeType: 'application/json',
        responseSchema: MISSION_SCHEMA,
      },
    });

    const rawText = (response.text ?? '').trim();
    if (!rawText) {
      lastErrors = ['Gemini returned an empty response.'];
      continue;
    }

    let parsed: RawGeneratedMission;
    try {
      parsed = JSON.parse(rawText) as RawGeneratedMission;
    } catch {
      lastErrors = ['Gemini returned malformed JSON.'];
      continue;
    }

    const missionId = `${sanitizeId(input.worldId + '-' + input.topic, 'mission')}-${Date.now().toString(36)}`;
    const nowIso = new Date().toISOString();
    const worldVisual = WORLD_IMAGE_MAP[input.worldId] ?? WORLD_IMAGE_MAP.english;

    const normalizedQuestions: MissionQuestion[] = (parsed.questions ?? []).map((q, idx) => ({
      id: sanitizeId(q.id || `q-${idx + 1}`, `q-${idx + 1}`),
      promptSentence: String(q.promptSentence ?? '').trim(),
      targetPhrase: String(q.targetPhrase ?? '').trim(),
      questionText: String(q.questionText ?? '').trim(),
      options: Array.isArray(q.options)
        ? q.options.slice(0, 4).map((opt, optIdx) => {
            const fallbackLetter = ['A', 'B', 'C', 'D'][optIdx] ?? 'A';
            const fallbackId = fallbackLetter.toLowerCase();
            return {
              id: sanitizeId(opt.id || fallbackId, fallbackId),
              keyLabel: String(opt.keyLabel || fallbackLetter).slice(0, 2).toUpperCase(),
              text: String(opt.text ?? '').trim(),
            };
          })
        : [],
      correctOptionId: sanitizeId(String(q.correctOptionId ?? 'a'), 'a'),
      hint: String(q.hint ?? '').trim(),
      explanation: String(q.explanation ?? '').trim(),
    }));

    const candidate: MissionDefinition = {
      id: missionId,
      worldId: input.worldId,
      title: String(parsed.title ?? '').trim(),
      subject: input.subject,
      topic: input.topic,
      gradeLevel: input.gradeLevel,
      difficulty: input.difficulty,
      summary: String(parsed.summary ?? '').trim(),
      estimatedMinutes: Math.min(120, Math.max(1, Math.round(Number(parsed.estimatedMinutes) || clampedCount * 2))),
      objectives: Array.isArray(parsed.objectives)
        ? parsed.objectives.map((o) => String(o).trim()).filter(Boolean).slice(0, 6)
        : input.learningObjectives,
      xpPerCorrect: 30,
      xpPerIncorrect: 5,
      imageSrc: worldVisual.src,
      imageAlt: worldVisual.alt,
      authorType: 'ai_generated',
      teacherId: teacherUid,
      status: 'draft',
      createdAt: nowIso,
      updatedAt: nowIso,
      questions: normalizedQuestions,
    };

    const validation = validateMissionPayload(candidate);
    if (validation.valid && validation.data) {
      return validation.data;
    }

    lastErrors = validation.errors;
  }

  throw new Error(`Generated mission failed validation: ${lastErrors.join(' ')}`);
}

export async function regenerateSingleQuestionWithGemini(params: {
  subject: string;
  topic: string;
  gradeLevel: string;
  difficulty: string;
  existingQuestionId: string;
  previousQuestionText?: string;
}): Promise<MissionQuestion> {
  const ai = getGeminiClient();
  const model = getConfiguredGeminiModel();

  const prompt = [
    `Generate ONE replacement multiple-choice question in JSON for QUESTLAB.`,
    `Subject: ${params.subject}`,
    `Topic: ${params.topic}`,
    `Grade Level: ${params.gradeLevel}`,
    `Difficulty: ${params.difficulty}`,
    params.previousQuestionText
      ? `Avoid repeating this previous question: "${params.previousQuestionText}"`
      : '',
    `Use id "${params.existingQuestionId}", 3 or 4 options (ids a, b, c, optional d), exactly one correctOptionId, a helpful hint, and a detailed explanation.`,
  ]
    .filter(Boolean)
    .join('\n');

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: 'You are an expert curriculum designer generating a single verified quiz question.',
      responseMimeType: 'application/json',
      responseSchema: QUESTION_SCHEMA,
    },
  });

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new Error('Gemini returned an empty response while regenerating the question.');
  }

  const q = JSON.parse(rawText) as MissionQuestion;
  const normalized: MissionQuestion = {
    id: sanitizeId(params.existingQuestionId, 'q-1'),
    promptSentence: String(q.promptSentence ?? '').trim(),
    targetPhrase: String(q.targetPhrase ?? '').trim(),
    questionText: String(q.questionText ?? '').trim(),
    options: Array.isArray(q.options)
      ? q.options.slice(0, 4).map((opt, idx) => {
          const letter = ['A', 'B', 'C', 'D'][idx] ?? 'A';
          return {
            id: sanitizeId(opt.id || letter.toLowerCase(), letter.toLowerCase()),
            keyLabel: String(opt.keyLabel || letter).slice(0, 2).toUpperCase(),
            text: String(opt.text ?? '').trim(),
          };
        })
      : [],
    correctOptionId: sanitizeId(String(q.correctOptionId ?? 'a'), 'a'),
    hint: String(q.hint ?? '').trim(),
    explanation: String(q.explanation ?? '').trim(),
  };

  const errors = validateQuestion(normalized, 0, new Set());
  if (errors.length > 0) {
    throw new Error(`Regenerated question failed validation: ${errors.join(' ')}`);
  }

  return normalized;
}
