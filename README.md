# QUESTLAB — AI-Powered Gamified Learning Platform

QUESTLAB turns English, Mathematics, Science, and Business concepts into interactive mission briefings, guided quizzes, XP progression, and educator-curated learning expeditions.

## Architecture Overview

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4
- **Backend Server (`server.ts`)**: Express serving Vite middleware in development, built SPA assets in production, and secure API routes:
  - `GET /api/health` — Reports Gemini & Firebase Admin configuration status
  - `POST /api/ai/generate-mission` — Server-side Gemini mission generation (`@google/genai`)
  - `POST /api/ai/regenerate-question` — Single-question regeneration for teacher drafts
  - `POST /api/missions/register-key` — Stores mission answer keys server-side
  - `POST /api/missions/grade-question` & `POST /api/missions/grade` — Authoritative server-side grading without exposing answer keys to student clients
  - `POST /api/admin/grant-teacher` — Administrator-only endpoint to assign teacher custom claims and `/teachers/{uid}` records
- **Database & Auth**: Firebase Authentication + Cloud Firestore (with hardened `firestore.rules`)
- **Offline / Guest Support**: `LocalStorageProgressRepository` runs in Guest Mode and merges cleanly without duplicating XP when signing into `FirestoreProgressRepository`.

## Environment Configuration

Copy `.env.example` to `.env` (or configure secrets in AI Studio Secrets):

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

# Server-side Firebase Admin SDK JSON (recommended for persistent answer-key grading & custom claims)
FIREBASE_SERVICE_ACCOUNT_KEY=""
ADMIN_SETUP_SECRET=""
```

> **Security Note**: Never place `GEMINI_API_KEY` or `FIREBASE_SERVICE_ACCOUNT_KEY` in any `VITE_*` variable.

## Firebase Console Setup

1. **Authentication Providers**:
   - Google Sign-In is enabled by default.
   - To enable student Email/Password registration & login, open Firebase Console -> **Authentication -> Sign-in method** and enable **Email/Password**.
2. **Firestore Security Rules**:
   - Rules live in `/firestore.rules` and are validated with `npx eslint firestore.rules`.
   - Student self-registration is strictly restricted to `role: 'student'`.
3. **Granting Educator (Teacher) Access**:
   - The bootstrapped administrator (`midothesc@gmail.com`, verified email) can assign teacher privileges via `POST /api/admin/grant-teacher` or in Firestore `/teachers/{uid}`.

## Development, Testing & Production

```bash
# Install dependencies
npm install

# Run unit tests (progression engine, mission schema validation, guest migration, role checks, storage repo)
npm test

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
