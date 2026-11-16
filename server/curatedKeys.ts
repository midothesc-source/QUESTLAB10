import type { MissionDefinition, SubjectWorldId } from '../src/types/questlab.ts';

export interface ServerAnswerKeyQuestion {
  id: string;
  optionIds: string[];
  correctOptionId: string;
  explanation: string;
}

export interface ServerAnswerKeyRecord {
  missionId: string;
  title: string;
  worldId: SubjectWorldId;
  topic: string;
  teacherId: string;
  status: 'draft' | 'published';
  xpPerCorrect: number;
  xpPerIncorrect: number;
  questions: ServerAnswerKeyQuestion[];
}

const CURATED_MISSIONS: Record<string, MissionDefinition> = {
  'grammar-vault-01': {
    id: 'grammar-vault-01',
    worldId: 'english',
    title: 'The Grammar Vault',
    subject: 'English Grammar',
    topic: 'Adjective and Adverb Prepositional Phrases',
    summary:
      'Enter the central syntax archive and determine whether each highlighted prepositional phrase modifies a noun or a verb.',
    estimatedMinutes: 3,
    objectives: [
      'Identify prepositional phrases operating as adjective modifiers on nouns.',
      'Distinguish adverb prepositional phrases that describe how, when, or where a verb occurs.',
      'Verify grammatical function using targeted modifier questions before submitting your attempt.',
    ],
    xpPerCorrect: 30,
    xpPerIncorrect: 5,
    imageSrc: '/src/assets/images/world_english_grammar_1794854621776.jpg',
    imageAlt: 'Interior of The Grammar Vault with luminous holographic syntax rings',
    authorType: 'curated',
    teacherId: 'curated',
    status: 'published',
    questions: [
      {
        id: 'gv-q1',
        promptSentence: 'The book on the table belongs to Maya.',
        targetPhrase: 'on the table',
        questionText: "Identify the function of 'on the table'.",
        options: [
          { id: 'a', keyLabel: 'A', text: 'Adjective phrase modifying "book"' },
          { id: 'b', keyLabel: 'B', text: 'Adverb phrase modifying "belongs"' },
          { id: 'c', keyLabel: 'C', text: 'Noun phrase acting as the subject' },
        ],
        correctOptionId: 'a',
        hint: "Ask yourself what 'on the table' specifies: which book is being discussed, or how the action of belonging happens?",
        explanation:
          "'on the table' answers 'Which book?' and directly describes the noun 'book'. Because it modifies a noun rather than a verb, it functions as an adjective prepositional phrase.",
      },
      {
        id: 'gv-q2',
        promptSentence: 'The students walked through the hallway.',
        targetPhrase: 'through the hallway',
        questionText: "Identify the function of 'through the hallway'.",
        options: [
          { id: 'a', keyLabel: 'A', text: 'Adjective phrase modifying "students"' },
          { id: 'b', keyLabel: 'B', text: 'Adverb phrase modifying "walked"' },
          { id: 'c', keyLabel: 'C', text: 'Direct object receiving the action' },
        ],
        correctOptionId: 'b',
        hint: "Test whether 'through the hallway' describes the students themselves or tells where they walked.",
        explanation:
          "'through the hallway' answers 'Where did the students walk?' and modifies the verb 'walked'. Because it modifies a verb to express path or location of action, it functions as an adverb prepositional phrase.",
      },
      {
        id: 'gv-q3',
        promptSentence: 'The girl with the red backpack smiled.',
        targetPhrase: 'with the red backpack',
        questionText: "Identify the function of 'with the red backpack'.",
        options: [
          { id: 'a', keyLabel: 'A', text: 'Adverb phrase modifying "smiled"' },
          { id: 'b', keyLabel: 'B', text: 'Adjective phrase modifying "girl"' },
          { id: 'c', keyLabel: 'C', text: 'Adverb phrase modifying "red"' },
        ],
        correctOptionId: 'b',
        hint: "Check whether 'with the red backpack' describes how she smiled or identifies which girl smiled.",
        explanation:
          "'with the red backpack' answers 'Which girl?' and gives identifying detail about the noun 'girl'. Therefore, it functions as an adjective prepositional phrase.",
      },
    ],
  },
};

export function getCuratedMission(missionId: string): MissionDefinition | null {
  return CURATED_MISSIONS[missionId] ?? null;
}

export function getCuratedAnswerKey(missionId: string): ServerAnswerKeyRecord | null {
  const mission = CURATED_MISSIONS[missionId];
  if (!mission) return null;

  return {
    missionId: mission.id,
    title: mission.title,
    worldId: mission.worldId,
    topic: mission.topic,
    teacherId: 'curated',
    status: 'published',
    xpPerCorrect: mission.xpPerCorrect,
    xpPerIncorrect: mission.xpPerIncorrect,
    questions: mission.questions.map((q) => ({
      id: q.id,
      optionIds: q.options.map((o) => o.id),
      correctOptionId: q.correctOptionId,
      explanation: q.explanation,
    })),
  };
}
