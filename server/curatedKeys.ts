import type { SubjectWorldId } from '../src/types/questlab.ts';

export interface ServerAnswerKeyQuestion {
  id: string;
  correctOptionId: string;
  explanation: string;
}

export interface ServerAnswerKeyRecord {
  missionId: string;
  title: string;
  worldId: SubjectWorldId;
  topic: string;
  teacherId: string;
  xpPerCorrect: number;
  xpPerIncorrect: number;
  questions: ServerAnswerKeyQuestion[];
}

const CURATED_ANSWER_KEYS: Record<string, ServerAnswerKeyRecord> = {
  'grammar-vault-01': {
    missionId: 'grammar-vault-01',
    title: 'The Grammar Vault',
    worldId: 'english',
    topic: 'Adjective and Adverb Prepositional Phrases',
    teacherId: 'curated',
    xpPerCorrect: 30,
    xpPerIncorrect: 5,
    questions: [
      {
        id: 'gv-q1',
        correctOptionId: 'a',
        explanation:
          "'on the table' answers 'Which book?' and directly describes the noun 'book'. Because it modifies a noun rather than a verb, it functions as an adjective prepositional phrase.",
      },
      {
        id: 'gv-q2',
        correctOptionId: 'b',
        explanation:
          "'through the hallway' answers 'Where did the students walk?' and modifies the verb 'walked'. Because it modifies a verb to show path or location of action, it functions as an adverb prepositional phrase.",
      },
      {
        id: 'gv-q3',
        correctOptionId: 'b',
        explanation:
          "'with the red backpack' answers 'Which girl?' and gives identifying detail about the noun 'girl'. Therefore, it functions as an adjective prepositional phrase.",
      },
    ],
  },
};

const runtimeTeacherKeyCache = new Map<string, ServerAnswerKeyRecord>();

export function setRuntimeAnswerKey(record: ServerAnswerKeyRecord): void {
  runtimeTeacherKeyCache.set(record.missionId, record);
}

export function getCuratedOrCachedAnswerKey(missionId: string): ServerAnswerKeyRecord | null {
  return CURATED_ANSWER_KEYS[missionId] ?? runtimeTeacherKeyCache.get(missionId) ?? null;
}
