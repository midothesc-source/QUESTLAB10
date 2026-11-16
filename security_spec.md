# QUESTLAB Firestore Security Specification

## 1. Data Invariants
1. **Default Deny**: All paths are denied unless explicitly matched and authorized.
2. **Role Integrity**: No user may self-assign `role: "teacher"` or `"admin"` during profile creation or profile updates. Only an existing Admin (`/admins/{uid}` or verified `midothesc@gmail.com`) or server-side Admin SDK can grant teacher privileges in `/teachers/{uid}` or promote a user's `role`.
3. **PII Isolation**: User profile documents (`/users/{userId}`) containing `email` are readable only by the owning user or an Admin.
4. **Private Answer Keys**: `/missionAnswerKeys/{missionId}` is strictly inaccessible to all client SDKs (`allow read, write: if false`). `/missions/{missionId}/private/{docId}` is accessible only to the owning teacher or an Admin.
5. **Query Security**: Every `allow list` rule evaluates `resource.data` directly without `get()` or `exists()` lookups.
6. **Immutability & Timestamps**: `uid`, `teacherId`, `studentUid`, and `createdAt` are immutable after creation; `createdAt` and `updatedAt` must equal `request.time`.

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Self-Elevation on Register**: `POST /users/{uid}` with `{ role: "teacher", ... }` by non-admin user -> DENIED.
2. **Role Mutation on Update**: `PATCH /users/{uid}` changing `role` from `"student"` to `"teacher"` -> DENIED.
3. **Ghost Field Injection**: `POST /users/{uid}` with extra field `{ isVerified: true }` -> DENIED by `keys().hasOnly(...)`.
4. **Cross-User PII Read**: `GET /users/{otherUid}` by another student -> DENIED.
5. **Student Reading Answer Keys**: `GET /missionAnswerKeys/{missionId}` or `GET /missions/{missionId}/private/answerKey` by a student -> DENIED.
6. **Student Creating Draft Mission**: `POST /missions/{id}` by a user without `/teachers/{uid}` or Admin status -> DENIED.
7. **Unverified Admin Email Spoof**: Request with unverified email token -> DENIED by `email_verified == true`.
8. **Teacher Hijacking Another Teacher's Mission**: `UPDATE /missions/{id}` where `existing().teacherId != request.auth.uid` -> DENIED.
9. **List Query Scraping Unpublished Drafts**: `LIST /missions` without filtering to `status == 'published'` or own `teacherId` -> DENIED.
10. **Oversized String DoS**: `POST /classes/{id}` with 20KB `name` -> DENIED by `size() <= 100`.
11. **Malformed Document ID**: `POST /missions/../../etc/passwd` -> DENIED by `isValidId()`.
12. **Client-Forged Timestamp**: `POST /submissions/{id}` with backdated `completedAt != request.time` -> DENIED.
