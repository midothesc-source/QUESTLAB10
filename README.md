# QUESTLAB — AI-Powered Gamified Learning Platform

QUESTLAB turns English, Mathematics, Science, and Business concepts into interactive mission briefings, guided quizzes, XP progression, and educator-curated learning expeditions.

## Architecture Overview

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4 (strictly public mission payloads; zero answer keys or secrets in client bundles)
- **Backend Server (`server/app.ts`, `server.ts`, `api/[...path].ts`)**: Express server & Vercel Serverless catch-all API handler:
  - `GET /api/health` — Reports Gemini & Firebase Admin configuration status
  - `POST /api/ai/generate-mission` & `POST /api/ai/regenerate-question` — Server-side Gemini mission generation (`@google/genai`)
  - `POST /api/missions/save`, `GET /api/missions/teacher`, `GET /api/missions/:missionId/teacher-draft`, `PATCH /api/missions/:missionId/status`, `DELETE /api/missions/:missionId`, `POST /api/missions/register-key` — Ownership-verified teacher mission & server-only answer-key storage
  - `POST /api/missions/grade` — Authoritative full-attempt transactional grading (`users/{uid}/progress/current`, `submissions/{id}`, `assignments/{id}`, and `gradingAttempts/{uid}_{attemptId}` idempotency)
  - `POST /api/missions/practice-grade` — Curated-mission guest practice evaluation (no Firestore writes)
  - `GET /api/progress`, `POST /api/progress/reset`, `POST /api/progress/migrate-guest` — Server-authoritative learner progress lifecycle
  - `POST /api/admin/grant-teacher` — Rate-limited, timing-safe administrator endpoint to assign teacher custom claims and `/teachers/{uid}` records
- **Database & Auth**: Firebase Authentication + Cloud Firestore (with fail-closed `firestore.rules`)
- **Offline / Guest Support**: `LocalStorageProgressRepository` runs in Guest Practice Mode and archives guest history cleanly inside `guestLegacySummary` without promoting unverified client XP into official account XP.

## Environment Configuration

Copy `.env.example` to `.env` (or configure secrets in Vercel / AI Studio Secrets):

```env
GEMINI_API_KEY="your-server-side-gemini-api-key"
GEMINI_MODEL="gemini-4-hydrogen"
APP_URL="http://localhost:3000"

# Optional overrides (auto-loaded from firebase-applet-config.json by default)
VITE_FIREBASE_API_KEY=""
VITE_FIREBASE_AUTH_DOMAIN=""
VITE_FIREBASE_PROJECT_ID=""
VITE_FIREBASE_APP_ID=""
VITE_FIREBASE_DATABASE_ID=""

# REQUIRED for authenticated grading, progress sync, and teacher mission writes
FIREBASE_SERVICE_ACCOUNT_KEY=""
ADMIN_SETUP_SECRET=""
```

> **Security Note**: Never place `GEMINI_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_KEY`, or `ADMIN_SETUP_SECRET` in any `VITE_*` variable.

## Development, Testing & Production

```bash
# Install dependencies
npm install

# Run unit & API security integration tests
npm test

# Run Firestore Emulator security rules tests (requires Java runtime + Firebase CLI)
npm run test:rules

# Type-check TypeScript
npm run lint

# Lint Firestore security rules
npx eslint firestore.rules

# Start full-stack dev server on port 3000
npm run dev

# Build production bundle and run Express production server
npm run build
NODE_ENV=production npm start
```
