import type { AchievementDefinition, PublicMissionDefinition } from '../types/questlab';

/**
 * Student-facing curated mission definitions.
 * Authoritative answer keys and explanations live strictly on the server (server/curatedKeys.ts)
 * and are never bundled into frontend JavaScript assets.
 */
export const MISSIONS: PublicMissionDefinition[] = [
  {
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
    status: 'published',
    questions: [
      {
        id: 'gv-q1',
        promptSentence: 'The book on the table belongs to Maya.',
        targetPhrase: 'on the table',
        questionText: "Identify the function of 'on the table'.",
        options: [
          {
            id: 'a',
            keyLabel: 'A',
            text: 'Adjective phrase modifying "book"',
          },
          {
            id: 'b',
            keyLabel: 'B',
            text: 'Adverb phrase modifying "belongs"',
          },
          {
            id: 'c',
            keyLabel: 'C',
            text: 'Noun phrase acting as the subject',
          },
        ],
        hint: "Ask yourself what 'on the table' specifies: which book is being discussed, or how the action of belonging happens?",
      },
      {
        id: 'gv-q2',
        promptSentence: 'The students walked through the hallway.',
        targetPhrase: 'through the hallway',
        questionText: "Identify the function of 'through the hallway'.",
        options: [
          {
            id: 'a',
            keyLabel: 'A',
            text: 'Adjective phrase modifying "students"',
          },
          {
            id: 'b',
            keyLabel: 'B',
            text: 'Adverb phrase modifying "walked"',
          },
          {
            id: 'c',
            keyLabel: 'C',
            text: 'Direct object receiving the action',
          },
        ],
        hint: "Test whether 'through the hallway' describes the students themselves or tells where they walked.",
      },
      {
        id: 'gv-q3',
        promptSentence: 'The girl with the red backpack smiled.',
        targetPhrase: 'with the red backpack',
        questionText: "Identify the function of 'with the red backpack'.",
        options: [
          {
            id: 'a',
            keyLabel: 'A',
            text: 'Adverb phrase modifying "smiled"',
          },
          {
            id: 'b',
            keyLabel: 'B',
            text: 'Adjective phrase modifying "girl"',
          },
          {
            id: 'c',
            keyLabel: 'C',
            text: 'Adverb phrase modifying "red"',
          },
        ],
        hint: "Check whether 'with the red backpack' describes how she smiled or identifies which girl smiled.",
      },
    ],
  },
];

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: 'first_mission',
    title: 'Vault Initiated',
    description: 'Complete your first mission inside the QUESTLAB universe.',
  },
  {
    id: 'perfect_grammar_vault',
    title: 'Syntax Precision',
    description: 'Answer all 3 questions correctly in The Grammar Vault.',
  },
  {
    id: 'streak_three',
    title: 'Unbroken Signal',
    description: 'Achieve a streak of 3 consecutive correct answers.',
  },
];

export function getMissionById(missionId: string): PublicMissionDefinition | undefined {
  return MISSIONS.find((mission) => mission.id === missionId);
}
