# QUESTLAB Firestore Security Specification

## 1. Data Invariants
1. **Default Deny**: All paths are denied unless explicitly matched and authorized.
2. **Role Integrity**: No user may self-assign `role: "teacher"` or `"admin"` during profile creation or profile updates. Only an existing Admin (`/admins/{uid}` or verified `midothesc@gmail.com`) or server-side Admin SDK can grant teacher privileges in `/teachers/{uid}` or set custom claims.
3. **PII Isolation**: User profile documents (`/users/{userId}`) containing `email` are readable only by the owning user or an Admin.
4. **Server-Authoritative Progress & Submissions**: Client SDKs have **read-only** access to `/users/{userId}/progress/{progressId}` (`allow create, update, delete: if false;`) and `/submissions/{submissionId}` (`allow create, update, delete: if false;`). Only the server-side Firebase Admin SDK inside `POST /api/missions/grade`, `GET /api/progress`, and `POST /api/progress/reset` may initialize, update, or reset learner XP, streaks, completed missions, achievements, and submissions.
5. **Server-Only Answer Keys & Idempotency Records**: `/missionAnswerKeys/{missionId}`, `/gradingAttempts/{attemptId}`, and legacy `/missions/{missionId}/private/{docId}` are strictly inaccessible to all client SDKs (`allow read, write: if false`).
6. **Server-Only Student Assignment Completion**: Students cannot update `/assignments/{assignmentId}` via the client SDK. Only the server grading transaction marks an assignment `'completed'` upon verified submission. Teacher assignment creation validates existence and ownership of both `classes/{classId}` and `missions/{missionId}` (requiring `status == 'published'`).
7. **Query Security & Immutability**: Every `allow list` rule evaluates `resource.data` directly without `get()` or `exists()` lookups. `uid`, `teacherId`, `studentUid`, and `createdAt` are immutable after creation; `createdAt` and `updatedAt` must equal `request.time`.

## 2. Adversarial Payloads (Expected: PERMISSION_DENIED)
1. **Self-Elevation on Register**: `POST /users/{uid}` with `{ role: "teacher", ... }` by non-admin user -> DENIED.
2. **Role Mutation on Update**: `PATCH /users/{uid}` changing `role` from `"student"` to `"teacher"` -> DENIED.
3. **Ghost Field Injection**: `POST /users/{uid}` with extra field `{ isVerified: true }` -> DENIED by `keys().hasOnly(...)`.
4. **Cross-User PII Read**: `GET /users/{otherUid}` by another student -> DENIED.
5. **Client Forged XP / Progress Write**: `CREATE/UPDATE /users/{uid}/progress/current` by the owning student -> DENIED (`allow create, update, delete: if false`).
6. **Client Forged Submission**: `CREATE /submissions/{id}` by the owning student -> DENIED (`allow create, update, delete: if false`).
7. **Student Completing Assignment Client-Side**: `UPDATE /assignments/{id}` setting `status: "completed"` by the assigned student -> DENIED.
8. **Student Reading or Writing Answer Keys / Grading Attempts**: `GET/SET /missionAnswerKeys/{id}`, `GET/SET /missions/{id}/private/answerKey`, or `GET/SET /gradingAttempts/{id}` by any client -> DENIED.
9. **Student Creating Draft Mission**: `POST /missions/{id}` by a user without `/teachers/{uid}` or Admin status -> DENIED.
10. **Unverified Admin Email Spoof**: Request with unverified email token -> DENIED by `email_verified == true`.
11. **Teacher Hijacking Another Teacher's Mission or Assigning Draft/Unowned Mission**: `UPDATE /missions/{id}` or `CREATE /assignments/{id}` referencing another teacher's class/mission or draft mission -> DENIED.
12. **List Query Scraping Unpublished Drafts & Malformed IDs**: `LIST /missions` without filtering to `status == 'published'` or own `teacherId`, or `POST /missions/../../etc/passwd` -> DENIED.
