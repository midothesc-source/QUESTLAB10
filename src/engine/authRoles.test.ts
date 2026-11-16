import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAccessTeacherDashboard,
  canManageMission,
  canViewSubmission,
  sanitizeSelfRegistrationRole,
} from './authRoles';
import type { UserProfile } from '../types/questlab';

const studentProfile: UserProfile = {
  uid: 'student-1',
  displayName: 'Maya',
  email: 'maya@example.com',
  role: 'student',
  createdAt: '2026-11-16T00:00:00.000Z',
  updatedAt: '2026-11-16T00:00:00.000Z',
};

const teacherProfile: UserProfile = {
  uid: 'teacher-1',
  displayName: 'Prof. Lin',
  email: 'lin@example.com',
  role: 'teacher',
  createdAt: '2026-11-16T00:00:00.000Z',
  updatedAt: '2026-11-16T00:00:00.000Z',
};

test('sanitizeSelfRegistrationRole always forces student role', () => {
  assert.equal(sanitizeSelfRegistrationRole('teacher'), 'student');
  assert.equal(sanitizeSelfRegistrationRole('admin'), 'student');
  assert.equal(sanitizeSelfRegistrationRole(undefined), 'student');
});

test('teacher dashboard and mission management enforce teacher role and ownership', () => {
  assert.equal(canAccessTeacherDashboard(null), false);
  assert.equal(canAccessTeacherDashboard(studentProfile), false);
  assert.equal(canAccessTeacherDashboard(teacherProfile), true);

  assert.equal(canManageMission(studentProfile, { teacherId: 'student-1' }), false);
  assert.equal(canManageMission(teacherProfile, { teacherId: 'other-teacher' }), false);
  assert.equal(canManageMission(teacherProfile, { teacherId: 'teacher-1' }), true);
});

test('canViewSubmission restricts analytics to owner or authorized teacher', () => {
  const submission = { studentUid: 'student-1', teacherId: 'teacher-1' };
  assert.equal(canViewSubmission(studentProfile, submission), true);
  assert.equal(canViewSubmission(teacherProfile, submission), true);
  assert.equal(
    canViewSubmission({ ...teacherProfile, uid: 'teacher-2' }, submission),
    false,
  );
  assert.equal(
    canViewSubmission({ ...studentProfile, uid: 'student-2' }, submission),
    false,
  );
});
