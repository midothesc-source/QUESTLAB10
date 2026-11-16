import type { SubjectWorld } from '../types/questlab';

export const SUBJECT_WORLDS: SubjectWorld[] = [
  {
    id: 'english',
    sectorLabel: 'Sector 01',
    name: 'English',
    headline: 'Syntax, Rhetoric & Structural Clarity',
    description:
      'Decode how phrases, clauses, and modifiers shape precise meaning inside classic and modern prose.',
    status: 'unlocked',
    unlockRequirement: 'Available Now',
    accentHex: '#55D9F5',
    imageSrc: '/src/assets/images/world_english_grammar_1794854621776.jpg',
    imageAlt: 'The Grammar Vault architectural library with cyan and violet holographic syntax rings',
    missionIds: ['grammar-vault-01'],
  },
  {
    id: 'mathematics',
    sectorLabel: 'Sector 02',
    name: 'Mathematics',
    headline: 'Spatial Geometry, Ratios & Functions',
    description:
      'Master proportional reasoning, algebraic modeling, and coordinate transformations through visual challenges.',
    status: 'locked',
    unlockRequirement: 'Unlocks after Sector 02 curriculum release · Complete English first',
    accentHex: '#A68AFF',
    imageSrc: '/src/assets/images/world_mathematics_1794854621462.jpg',
    imageAlt: 'Cosmic mathematics chamber with suspended geometric polyhedra and coordinate planes',
    missionIds: [],
  },
  {
    id: 'science',
    sectorLabel: 'Sector 03',
    name: 'Science',
    headline: 'Orbital Mechanics, Matter & Living Systems',
    description:
      'Investigate cellular pathways, chemical equilibrium, and physical forces inside guided orbital labs.',
    status: 'locked',
    unlockRequirement: 'Unlocks at Explorer Level 3 · Curriculum module scheduled',
    accentHex: '#55D9F5',
    imageSrc: '/src/assets/images/world_science_1794854622907.jpg',
    imageAlt: 'Orbital physics and molecular containment laboratory overlooking a planet horizon',
    missionIds: [],
  },
  {
    id: 'business',
    sectorLabel: 'Sector 04',
    name: 'Business',
    headline: 'Decision Modeling, Unit Economics & Strategy',
    description:
      'Analyze market dynamics, pricing levers, and operational trade-offs in structured scenario briefings.',
    status: 'locked',
    unlockRequirement: 'Unlocks at Explorer Level 4 · Curriculum module scheduled',
    accentHex: '#A68AFF',
    imageSrc: '/src/assets/images/world_business_1794854623250.jpg',
    imageAlt: 'Nocturnal strategic command atrium with dark glass architecture overlooking a calm horizon',
    missionIds: [],
  },
];
