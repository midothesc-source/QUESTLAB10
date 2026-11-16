import type { MissionDefinition, MissionQuestion, SubjectWorldId } from '../types/questlab';

export const MIN_MISSION_QUESTIONS = 3;
export const MAX_MISSION_QUESTIONS = 10;
const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const VALID_WORLDS: SubjectWorldId[] = ['english', 'mathematics', 'science', 'business'];

export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  errors: string[];
}

export function sanitizeId(raw: string, fallbackPrefix: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return cleaned || `${fallbackPrefix}-${Date.now()}`;
}

export function validateQuestion(
  question: Partial<MissionQuestion>,
  index: number,
  seenIds: Set<string>,
): string[] {
  const errors: string[] = [];
  const label = `Question ${index + 1}`;

  if (!question.id || typeof question.id !== 'string' || !VALID_ID_REGEX.test(question.id)) {
    errors.push(`${label}: Invalid or missing unique question ID.`);
  } else if (seenIds.has(question.id)) {
    errors.push(`${label}: Duplicate question ID "${question.id}".`);
  } else {
    seenIds.add(question.id);
  }

  if (!question.promptSentence || question.promptSentence.trim().length < 5) {
    errors.push(`${label}: Prompt context or sentence must be at least 5 characters.`);
  }

  if (!question.questionText || question.questionText.trim().length < 5) {
    errors.push(`${label}: Question prompt must be at least 5 characters.`);
  }

  if (!Array.isArray(question.options) || question.options.length < 3 || question.options.length > 4) {
    errors.push(`${label}: Must provide 3 or 4 answer options.`);
  } else {
    const optionIds = new Set<string>();
    let validCorrectCount = 0;

    question.options.forEach((opt, optIdx) => {
      if (!opt || typeof opt.id !== 'string' || !VALID_ID_REGEX.test(opt.id)) {
        errors.push(`${label}, Option ${optIdx + 1}: Invalid option ID.`);
      } else if (optionIds.has(opt.id)) {
        errors.push(`${label}: Duplicate option ID "${opt.id}".`);
      } else {
        optionIds.add(opt.id);
      }

      if (!opt?.text || opt.text.trim().length < 1) {
        errors.push(`${label}, Option ${optIdx + 1}: Option text cannot be empty.`);
      }

      if (opt?.id === question.correctOptionId) {
        validCorrectCount += 1;
      }
    });

    if (validCorrectCount !== 1) {
      errors.push(`${label}: Exactly one option must match correctOptionId.`);
    }
  }

  if (!question.hint || question.hint.trim().length < 8) {
    errors.push(`${label}: Hint must be at least 8 characters.`);
  }

  if (!question.explanation || question.explanation.trim().length < 12) {
    errors.push(`${label}: Explanation must be at least 12 characters.`);
  }

  return errors;
}

export function validateMissionPayload(
  candidate: Partial<MissionDefinition>,
): ValidationResult<MissionDefinition> {
  const errors: string[] = [];

  if (!candidate.id || typeof candidate.id !== 'string' || !VALID_ID_REGEX.test(candidate.id)) {
    errors.push('Mission ID must contain only letters, numbers, hyphens, or underscores.');
  }

  if (!candidate.worldId || !VALID_WORLDS.includes(candidate.worldId)) {
    errors.push('World ID must be one of: english, mathematics, science, business.');
  }

  if (!candidate.title || candidate.title.trim().length < 3 || candidate.title.trim().length > 120) {
    errors.push('Mission title must be between 3 and 120 characters.');
  }

  if (!candidate.subject || candidate.subject.trim().length < 2) {
    errors.push('Mission subject is required.');
  }

  if (!candidate.topic || candidate.topic.trim().length < 2) {
    errors.push('Mission topic is required.');
  }

  if (!candidate.summary || candidate.summary.trim().length < 10) {
    errors.push('Mission description must be at least 10 characters.');
  }

  if (
    typeof candidate.estimatedMinutes !== 'number' ||
    !Number.isFinite(candidate.estimatedMinutes) ||
    candidate.estimatedMinutes < 1 ||
    candidate.estimatedMinutes > 120
  ) {
    errors.push('Estimated completion time must be between 1 and 120 minutes.');
  }

  if (
    !Array.isArray(candidate.objectives) ||
    candidate.objectives.length < 1 ||
    candidate.objectives.some((obj) => typeof obj !== 'string' || obj.trim().length < 5)
  ) {
    errors.push('At least 1 meaningful learning objective is required.');
  }

  if (
    !Array.isArray(candidate.questions) ||
    candidate.questions.length < MIN_MISSION_QUESTIONS ||
    candidate.questions.length > MAX_MISSION_QUESTIONS
  ) {
    errors.push(
      `Mission must contain between ${MIN_MISSION_QUESTIONS} and ${MAX_MISSION_QUESTIONS} questions.`,
    );
  } else {
    const seenIds = new Set<string>();
    candidate.questions.forEach((question, index) => {
      errors.push(...validateQuestion(question, index, seenIds));
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: candidate as MissionDefinition,
    errors: [],
  };
}
