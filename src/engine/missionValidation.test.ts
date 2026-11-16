import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMissionPayload } from './missionValidation';
import type { MissionDefinition } from '../types/questlab';

function buildValidMission(): MissionDefinition {
  return {
    id: 'math-ratios-01',
    worldId: 'mathematics',
    title: 'Orbital Ratio Calibration',
    subject: 'Mathematics',
    topic: 'Equivalent Ratios & Unit Rates',
    gradeLevel: 'Grade 7',
    difficulty: 'Intermediate',
    summary: 'Calibrate fuel-to-oxidizer ratios across three orbital thruster scenarios.',
    estimatedMinutes: 5,
    objectives: ['Compute equivalent ratios accurately across scaled quantities.'],
    xpPerCorrect: 30,
    xpPerIncorrect: 5,
    imageSrc: '/src/assets/images/world_mathematics_1794854621462.jpg',
    imageAlt: 'Cosmic mathematics chamber',
    authorType: 'ai_generated',
    status: 'draft',
    questions: [
      {
        id: 'q-1',
        promptSentence: 'A thruster burns 4 liters of fuel every 10 seconds.',
        targetPhrase: '4 liters of fuel every 10 seconds',
        questionText: 'How many liters of fuel does it burn in 25 seconds?',
        options: [
          { id: 'a', keyLabel: 'A', text: '8 liters' },
          { id: 'b', keyLabel: 'B', text: '10 liters' },
          { id: 'c', keyLabel: 'C', text: '12 liters' },
        ],
        correctOptionId: 'b',
        hint: 'Find the rate per 5 seconds first, then scale up to 25 seconds.',
        explanation: '4 liters / 10 seconds = 0.4 L/s. Over 25 seconds, 0.4 * 25 = 10 liters.',
      },
      {
        id: 'q-2',
        promptSentence: 'Solar panels generate 15 kWh in 3 hours.',
        targetPhrase: '15 kWh in 3 hours',
        questionText: 'What is the unit generation rate per hour?',
        options: [
          { id: 'a', keyLabel: 'A', text: '5 kWh per hour' },
          { id: 'b', keyLabel: 'B', text: '12 kWh per hour' },
          { id: 'c', keyLabel: 'C', text: '45 kWh per hour' },
        ],
        correctOptionId: 'a',
        hint: 'Divide total energy by the number of hours.',
        explanation: 'Dividing 15 kWh by 3 hours gives a unit rate of 5 kWh per hour.',
      },
      {
        id: 'q-3',
        promptSentence: 'Water recycling filters 18 liters in 6 minutes.',
        targetPhrase: '18 liters in 6 minutes',
        questionText: 'How many minutes are needed for 30 liters?',
        options: [
          { id: 'a', keyLabel: 'A', text: '8 minutes' },
          { id: 'b', keyLabel: 'B', text: '10 minutes' },
          { id: 'c', keyLabel: 'C', text: '12 minutes' },
        ],
        correctOptionId: 'b',
        hint: 'First determine how many liters are filtered in 1 minute.',
        explanation: '18 / 6 = 3 liters per minute, so 30 liters requires 30 / 3 = 10 minutes.',
      },
    ],
  };
}

test('validateMissionPayload accepts a valid 3-question mission', () => {
  const mission = buildValidMission();
  const result = validateMissionPayload(mission);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('validateMissionPayload rejects missions with fewer than 3 questions or duplicate IDs', () => {
  const mission = buildValidMission();
  mission.questions = mission.questions.slice(0, 2);
  const tooFew = validateMissionPayload(mission);
  assert.equal(tooFew.valid, false);
  assert.ok(tooFew.errors.some((e) => e.includes('between 3 and 10')));

  const duplicate = buildValidMission();
  duplicate.questions[1].id = duplicate.questions[0].id;
  const dupResult = validateMissionPayload(duplicate);
  assert.equal(dupResult.valid, false);
  assert.ok(dupResult.errors.some((e) => e.includes('Duplicate question ID')));
});

test('validateMissionPayload rejects missing correct option match or short explanation', () => {
  const mission = buildValidMission();
  mission.questions[0].correctOptionId = 'z';
  mission.questions[0].explanation = 'Short';
  const result = validateMissionPayload(mission);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('Exactly one option')));
  assert.ok(result.errors.some((e) => e.includes('Explanation')));
});
