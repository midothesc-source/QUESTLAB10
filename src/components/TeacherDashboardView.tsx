import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  BarChart3,
  BookOpen,
  Check,
  Copy,
  Edit3,
  Lock,
  Plus,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  UploadCloud,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  addStudentToClass,
  assignMissionToStudents,
  createClassRoom,
  deleteClassRoom,
  deleteTeacherMission,
  fetchTeacherAssignments,
  fetchTeacherClasses,
  fetchTeacherEnrollments,
  fetchTeacherMissions,
  fetchTeacherSubmissions,
  removeEnrollment,
  saveTeacherMission,
  updateMissionPublicationStatus,
} from '../services/firestoreService';
import type {
  ClassEnrollment,
  ClassRoom,
  MissionAssignment,
  MissionDefinition,
  MissionSubmission,
  SubjectWorldId,
  UserProfile,
} from '../types/questlab';
import { AIMissionGenerator } from './AIMissionGenerator';
import { ConfirmDialog } from './ConfirmDialog';

type TeacherTab = 'overview' | 'missions' | 'classes' | 'analytics';

interface TeacherDashboardViewProps {
  profile: UserProfile | null;
  geminiConfigured: boolean;
  geminiModel: string;
  onMissionsChanged: () => void;
  onReturnToDashboard: () => void;
  onNotify: (title: string, description: string, tone: 'success' | 'error' | 'info') => void;
}

export function TeacherDashboardView({
  profile,
  geminiConfigured,
  geminiModel,
  onMissionsChanged,
  onReturnToDashboard,
  onNotify,
}: TeacherDashboardViewProps) {
  const [activeTab, setActiveTab] = useState<TeacherTab>('overview');
  const [loading, setLoading] = useState(true);

  const [missions, setMissions] = useState<MissionDefinition[]>([]);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [enrollments, setEnrollments] = useState<ClassEnrollment[]>([]);
  const [assignments, setAssignments] = useState<MissionAssignment[]>([]);
  const [submissions, setSubmissions] = useState<MissionSubmission[]>([]);

  const [editingMission, setEditingMission] = useState<MissionDefinition | null>(null);
  const [assigningMission, setAssigningMission] = useState<MissionDefinition | null>(null);
  const [assignClassId, setAssignClassId] = useState('');
  const [assignDueDate, setAssignDueDate] = useState('');
  const [assigningBusy, setAssigningBusy] = useState(false);

  // Class Creation State
  const [newClassName, setNewClassName] = useState('');
  const [newClassSubject, setNewClassSubject] = useState('English');
  const [newClassGrade, setNewClassGrade] = useState('Middle School');
  const [creatingClass, setCreatingClass] = useState(false);
  const [copiedClassId, setCopiedClassId] = useState<string | null>(null);

  // Manual Student Enrollment State
  const [selectedClassForStudent, setSelectedClassForStudent] = useState('');
  const [studentUidInput, setStudentUidInput] = useState('');
  const [studentNameInput, setStudentNameInput] = useState('');
  const [studentEmailInput, setStudentEmailInput] = useState('');
  const [addingStudent, setAddingStudent] = useState(false);

  // Student Analytics Search
  const [studentSearch, setStudentSearch] = useState('');

  // Confirm Dialog State
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const isAuthorizedTeacher = Boolean(profile && profile.role === 'teacher');

  const loadTeacherWorkspace = useCallback(async () => {
    if (!profile || profile.role !== 'teacher') {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [mList, cList, eList, aList, sList] = await Promise.all([
        fetchTeacherMissions(profile.uid),
        fetchTeacherClasses(profile.uid),
        fetchTeacherEnrollments(profile.uid),
        fetchTeacherAssignments(profile.uid),
        fetchTeacherSubmissions(profile.uid),
      ]);

      setMissions(mList);
      setClasses(cList);
      setEnrollments(eList);
      setAssignments(aList);
      setSubmissions(sList);

      if (cList.length > 0 && !selectedClassForStudent) {
        setSelectedClassForStudent(cList[0].id);
      }
      if (cList.length > 0 && !assignClassId) {
        setAssignClassId(cList[0].id);
      }
    } catch (err) {
      onNotify(
        'Workspace sync warning',
        err instanceof Error ? err.message : 'Unable to load some teacher records.',
        'error',
      );
    } finally {
      setLoading(false);
    }
  }, [assignClassId, onNotify, profile, selectedClassForStudent]);

  useEffect(() => {
    void loadTeacherWorkspace();
  }, [loadTeacherWorkspace]);

  // --- Computed Real Analytics ---
  const analytics = useMemo(() => {
    const enrolledUids = new Set(enrollments.map((e) => e.studentUid));
    const submittingUids = new Set(submissions.map((s) => s.studentUid));
    const allStudentUids = new Set([...enrolledUids, ...submittingUids]);

    const publishedMissions = missions.filter((m) => m.status === 'published');
    const completedAssignments = assignments.filter((a) => a.status === 'completed');
    const avgCompletionRate =
      assignments.length > 0
        ? Math.round((completedAssignments.length / assignments.length) * 100)
        : 0;

    let totalCorrect = 0;
    let totalQuestions = 0;
    for (const sub of submissions) {
      totalCorrect += sub.correctCount;
      totalQuestions += sub.totalQuestions;
    }
    const avgAccuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

    // World accuracy chart data
    const worldStats: Record<SubjectWorldId, { correct: number; total: number; count: number }> = {
      english: { correct: 0, total: 0, count: 0 },
      mathematics: { correct: 0, total: 0, count: 0 },
      science: { correct: 0, total: 0, count: 0 },
      business: { correct: 0, total: 0, count: 0 },
    };
    for (const sub of submissions) {
      const bucket = worldStats[sub.worldId];
      if (bucket) {
        bucket.correct += sub.correctCount;
        bucket.total += sub.totalQuestions;
        bucket.count += 1;
      }
    }

    // Per-mission completion bar chart data
    const missionChart = publishedMissions.slice(0, 6).map((m) => {
      const mAssign = assignments.filter((a) => a.missionId === m.id);
      const mDone = mAssign.filter((a) => a.status === 'completed').length;
      const mSubs = submissions.filter((s) => s.missionId === m.id);
      const rate =
        mAssign.length > 0
          ? Math.round((mDone / mAssign.length) * 100)
          : mSubs.length > 0
            ? 100
            : 0;
      return {
        id: m.id,
        title: m.title,
        rate,
        submissionsCount: mSubs.length,
      };
    });

    // Per-student rollup
    const studentMap = new Map<
      string,
      {
        uid: string;
        name: string;
        email: string;
        classes: string[];
        missionsCompleted: number;
        xpEarned: number;
        correct: number;
        total: number;
        assignedTotal: number;
        assignedCompleted: number;
        lastActiveAt: string | null;
        topicScores: Record<string, { correct: number; total: number }>;
      }
    >();

    for (const enr of enrollments) {
      const existing = studentMap.get(enr.studentUid) || {
        uid: enr.studentUid,
        name: enr.studentName,
        email: enr.studentEmail,
        classes: [],
        missionsCompleted: 0,
        xpEarned: 0,
        correct: 0,
        total: 0,
        assignedTotal: 0,
        assignedCompleted: 0,
        lastActiveAt: null,
        topicScores: {},
      };
      if (!existing.classes.includes(enr.className)) {
        existing.classes.push(enr.className);
      }
      studentMap.set(enr.studentUid, existing);
    }

    for (const assign of assignments) {
      const entry = studentMap.get(assign.studentUid);
      if (entry) {
        entry.assignedTotal += 1;
        if (assign.status === 'completed') entry.assignedCompleted += 1;
      }
    }

    for (const sub of submissions) {
      const entry = studentMap.get(sub.studentUid) || {
        uid: sub.studentUid,
        name: sub.studentName,
        email: '',
        classes: [],
        missionsCompleted: 0,
        xpEarned: 0,
        correct: 0,
        total: 0,
        assignedTotal: 0,
        assignedCompleted: 0,
        lastActiveAt: null,
        topicScores: {},
      };
      entry.missionsCompleted += 1;
      entry.xpEarned += sub.xpAddedToProfile || sub.xpEarnedInRun;
      entry.correct += sub.correctCount;
      entry.total += sub.totalQuestions;
      if (!entry.lastActiveAt || sub.completedAt > entry.lastActiveAt) {
        entry.lastActiveAt = sub.completedAt;
      }
      const topicKey = sub.topic || sub.missionTitle;
      const tBucket = entry.topicScores[topicKey] || { correct: 0, total: 0 };
      tBucket.correct += sub.correctCount;
      tBucket.total += sub.totalQuestions;
      entry.topicScores[topicKey] = tBucket;
      studentMap.set(sub.studentUid, entry);
    }

    const students = Array.from(studentMap.values()).map((s) => {
      const accuracy = s.total > 0 ? Math.round((s.correct / s.total) * 100) : null;
      const completionRate =
        s.assignedTotal > 0 ? Math.round((s.assignedCompleted / s.assignedTotal) * 100) : null;

      const weakTopics = Object.entries(s.topicScores)
        .filter(([, score]) => score.total > 0 && score.correct / score.total < 0.75)
        .map(([topicName]) => topicName);

      return {
        ...s,
        accuracy,
        completionRate,
        weakTopics,
      };
    });

    return {
      totalStudents: allStudentUids.size,
      activeStudents: submittingUids.size,
      publishedCount: publishedMissions.length,
      assignedCount: assignments.length,
      avgCompletionRate,
      avgAccuracy,
      worldStats,
      missionChart,
      students,
    };
  }, [assignments, enrollments, missions, submissions]);

  if (!isAuthorizedTeacher) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="ql-panel-accent rounded-2xl p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
            <ShieldAlert className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="font-display mt-4 text-2xl font-bold text-white">
            Teacher Workspace Restricted
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            This portal is reserved for verified educators and administrators. Student accounts
            cannot self-assign teacher permissions.
          </p>
          <button
            type="button"
            onClick={onReturnToDashboard}
            className="mt-6 inline-flex min-h-[42px] items-center rounded-lg bg-[#55D9F5] px-5 py-2 text-sm font-semibold text-[#06111D] hover:bg-[#7DE4FA]"
          >
            Return to Explorer Dashboard
          </button>
        </div>
      </div>
    );
  }

  // --- Handlers ---
  const handleSaveMission = async (mission: MissionDefinition, status: 'draft' | 'published') => {
    if (!profile) return;
    try {
      const saved = await saveTeacherMission(mission, profile.uid, status);

      setMissions((prev) => {
        const exists = prev.some((m) => m.id === saved.id);
        return exists ? prev.map((m) => (m.id === saved.id ? saved : m)) : [saved, ...prev];
      });
      setEditingMission(null);
      onMissionsChanged();
      onNotify(
        status === 'published' ? 'Mission published' : 'Draft saved',
        `"${saved.title}" is now ${status === 'published' ? 'live for learners' : 'saved in drafts'}.`,
        'success',
      );
    } catch (err) {
      onNotify(
        'Save failed',
        err instanceof Error ? err.message : 'Unable to save mission.',
        'error',
      );
    }
  };

  const handleTogglePublish = async (mission: MissionDefinition) => {
    const nextStatus = mission.status === 'published' ? 'draft' : 'published';
    try {
      await updateMissionPublicationStatus(mission.id, nextStatus);
      setMissions((prev) =>
        prev.map((m) => (m.id === mission.id ? { ...m, status: nextStatus } : m)),
      );
      onMissionsChanged();
      onNotify(
        nextStatus === 'published' ? 'Mission published' : 'Moved to drafts',
        `"${mission.title}" updated.`,
        'success',
      );
    } catch (err) {
      onNotify(
        'Status update failed',
        err instanceof Error ? err.message : 'Could not update status.',
        'error',
      );
    }
  };

  const handleCreateClass = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile || !newClassName.trim()) return;

    setCreatingClass(true);
    try {
      const created = await createClassRoom(profile.uid, {
        name: newClassName,
        subject: newClassSubject,
        gradeLevel: newClassGrade,
      });
      setClasses((prev) => [created, ...prev]);
      setSelectedClassForStudent(created.id);
      setAssignClassId(created.id);
      setNewClassName('');
      onNotify('Class created', `Join Code: ${created.id}`, 'success');
    } catch (err) {
      onNotify(
        'Class creation failed',
        err instanceof Error ? err.message : 'Unable to create class.',
        'error',
      );
    } finally {
      setCreatingClass(false);
    }
  };

  const handleAddStudent = async (event: FormEvent) => {
    event.preventDefault();
    const targetClass = classes.find((c) => c.id === selectedClassForStudent);
    if (!targetClass || !studentUidInput.trim() || !studentNameInput.trim()) return;

    setAddingStudent(true);
    try {
      const enrollment = await addStudentToClass(targetClass, {
        studentUid: studentUidInput,
        studentName: studentNameInput,
        studentEmail: studentEmailInput || `${studentUidInput}@student.questlab`,
      });
      setEnrollments((prev) => {
        const filtered = prev.filter((e) => e.id !== enrollment.id);
        return [enrollment, ...filtered];
      });
      setStudentUidInput('');
      setStudentNameInput('');
      setStudentEmailInput('');
      onNotify('Student enrolled', `${enrollment.studentName} added to ${targetClass.name}.`, 'success');
    } catch (err) {
      onNotify(
        'Enrollment failed',
        err instanceof Error ? err.message : 'Unable to enroll student.',
        'error',
      );
    } finally {
      setAddingStudent(false);
    }
  };

  const handleAssignMissionSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile || !assigningMission) return;
    const targetClass = classes.find((c) => c.id === assignClassId);
    if (!targetClass) {
      onNotify('Select a class', 'Create or choose a class first.', 'error');
      return;
    }

    const classEnrollments = enrollments.filter((e) => e.classId === targetClass.id);
    if (classEnrollments.length === 0) {
      onNotify(
        'No enrolled students',
        `Share join code "${targetClass.id}" or add students to ${targetClass.name} first.`,
        'info',
      );
      return;
    }

    setAssigningBusy(true);
    try {
      const created = await assignMissionToStudents({
        mission: assigningMission,
        classRoom: targetClass,
        studentEnrollments: classEnrollments,
        teacherUid: profile.uid,
        dueDate: assignDueDate || undefined,
      });
      setAssignments((prev) => {
        const newIds = new Set(created.map((c) => c.id));
        return [...created, ...prev.filter((a) => !newIds.has(a.id))];
      });
      onNotify(
        'Mission assigned',
        `Assigned "${assigningMission.title}" to ${created.length} student(s) in ${targetClass.name}.`,
        'success',
      );
      setAssigningMission(null);
      setAssignDueDate('');
    } catch (err) {
      onNotify(
        'Assignment failed',
        err instanceof Error ? err.message : 'Unable to assign mission.',
        'error',
      );
    } finally {
      setAssigningBusy(false);
    }
  };

  const handleCopyClassCode = async (classId: string) => {
    try {
      await navigator.clipboard.writeText(classId);
      setCopiedClassId(classId);
      setTimeout(() => setCopiedClassId(null), 2000);
    } catch {
      onNotify('Class Code', classId, 'info');
    }
  };

  const filteredStudents = analytics.students.filter((s) => {
    const term = studentSearch.trim().toLowerCase();
    if (!term) return true;
    return (
      s.name.toLowerCase().includes(term) ||
      s.email.toLowerCase().includes(term) ||
      s.uid.toLowerCase().includes(term)
    );
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
      {/* Header */}
      <div className="flex flex-col justify-between gap-5 border-b border-slate-400/15 pb-6 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-medium tracking-wide text-[#A68AFF]">Educator Command</p>
          <h1 className="font-display mt-1.5 text-3xl font-bold text-white">Teacher Studio</h1>
          <p className="mt-1 text-sm text-slate-300">
            Generate missions with Gemini AI, manage class rosters, assign curriculum, and review
            real learner telemetry.
          </p>
        </div>

        <nav
          aria-label="Teacher sections"
          className="flex flex-wrap gap-1.5 rounded-xl border border-slate-400/15 bg-[#0D1526] p-1"
        >
          {(
            [
              { id: 'overview', label: 'Overview & Reports', icon: BarChart3 },
              { id: 'missions', label: 'Missions & AI Studio', icon: Sparkles },
              { id: 'classes', label: 'Classes & Rosters', icon: Users },
              { id: 'analytics', label: 'Student Analytics', icon: BookOpen },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  active ? 'bg-[#55D9F5] text-[#06111D]' : 'text-slate-300 hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {loading ? (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((idx) => (
            <div key={idx} className="ql-panel h-28 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="mt-8">
          {/* TAB 1: OVERVIEW & REPORTS */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div className="ql-panel rounded-xl p-5">
                  <p className="text-xs text-slate-400">Total Students</p>
                  <p className="font-mono-tabular mt-2 text-3xl font-bold text-white">
                    {analytics.totalStudents}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {analytics.activeStudents} active with submissions
                  </p>
                </div>

                <div className="ql-panel rounded-xl p-5">
                  <p className="text-xs text-slate-400">Published Missions</p>
                  <p className="font-mono-tabular mt-2 text-3xl font-bold text-[#55D9F5]">
                    {analytics.publishedCount}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">{missions.length} total authored</p>
                </div>

                <div className="ql-panel rounded-xl p-5">
                  <p className="text-xs text-slate-400">Assigned Tasks</p>
                  <p className="font-mono-tabular mt-2 text-3xl font-bold text-white">
                    {analytics.assignedCount}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">{classes.length} active class(es)</p>
                </div>

                <div className="ql-panel rounded-xl p-5">
                  <p className="text-xs text-slate-400">Completion Rate</p>
                  <p className="font-mono-tabular mt-2 text-3xl font-bold text-[#A68AFF]">
                    {assignments.length > 0 ? `${analytics.avgCompletionRate}%` : '—'}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">Across assigned work</p>
                </div>

                <div className="ql-panel rounded-xl p-5">
                  <p className="text-xs text-slate-400">Avg Accuracy</p>
                  <p className="font-mono-tabular mt-2 text-3xl font-bold text-emerald-300">
                    {submissions.length > 0 ? `${analytics.avgAccuracy}%` : '—'}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">{submissions.length} submission(s)</p>
                </div>
              </div>

              <div className="grid gap-8 lg:grid-cols-12">
                {/* Mission Completion Bar Chart */}
                <section className="ql-panel rounded-2xl p-6 lg:col-span-6">
                  <h2 className="font-display text-lg font-semibold text-white">
                    Mission Completion Rates
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Computed from Firestore assignment &amp; submission records.
                  </p>

                  {analytics.missionChart.length === 0 ? (
                    <div className="mt-6 rounded-xl border border-slate-400/10 bg-[#080D19]/70 p-6 text-center text-xs text-slate-400">
                      Publish a mission in Missions &amp; AI Studio to track completion rates.
                    </div>
                  ) : (
                    <div className="mt-5 space-y-4">
                      {analytics.missionChart.map((item) => (
                        <div key={item.id}>
                          <div className="flex items-center justify-between text-xs">
                            <span className="truncate font-medium text-slate-200">{item.title}</span>
                            <span className="font-mono-tabular text-[#55D9F5]">
                              {item.rate}% ({item.submissionsCount} runs)
                            </span>
                          </div>
                          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[#080D19]">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[#55D9F5] to-[#A68AFF]"
                              style={{ width: `${item.rate}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* World Accuracy Breakdown */}
                <section className="ql-panel rounded-2xl p-6 lg:col-span-6">
                  <h2 className="font-display text-lg font-semibold text-white">
                    Performance by Subject World
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Accuracy aggregated across student submissions per curriculum world.
                  </p>

                  <div className="mt-5 space-y-4">
                    {(
                      [
                        { id: 'english', label: 'English' },
                        { id: 'mathematics', label: 'Mathematics' },
                        { id: 'science', label: 'Science' },
                        { id: 'business', label: 'Business' },
                      ] as const
                    ).map((world) => {
                      const stats = analytics.worldStats[world.id];
                      const pct =
                        stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
                      return (
                        <div key={world.id}>
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-200">{world.label}</span>
                            <span className="font-mono-tabular text-slate-300">
                              {stats.total > 0
                                ? `${pct}% (${stats.count} runs)`
                                : 'No submissions yet'}
                            </span>
                          </div>
                          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[#080D19]">
                            <div
                              className="h-full rounded-full bg-[#55D9F5]"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>

              {/* Recent Submissions Feed */}
              <section className="ql-panel rounded-2xl p-6">
                <h2 className="font-display text-lg font-semibold text-white">
                  Recent Student Activity
                </h2>
                {submissions.length === 0 ? (
                  <p className="mt-3 text-xs text-slate-400">
                    No student mission submissions recorded yet.
                  </p>
                ) : (
                  <ul className="mt-4 divide-y divide-slate-400/12">
                    {submissions.slice(0, 8).map((sub) => (
                      <li
                        key={sub.id}
                        className="flex flex-col justify-between gap-2 py-3 text-xs sm:flex-row sm:items-center"
                      >
                        <div>
                          <span className="font-semibold text-white">{sub.studentName}</span>
                          <span className="mx-2 text-slate-500">·</span>
                          <span className="text-slate-300">{sub.missionTitle}</span>
                        </div>
                        <div className="font-mono-tabular flex items-center gap-4 text-slate-400">
                          <span className="text-emerald-300">
                            {sub.correctCount}/{sub.totalQuestions}
                          </span>
                          <span className="text-[#55D9F5]">+{sub.xpEarnedInRun} XP</span>
                          <span>{new Date(sub.completedAt).toLocaleDateString()}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          {/* TAB 2: MISSIONS & AI STUDIO */}
          {activeTab === 'missions' && (
            <div className="space-y-8">
              <AIMissionGenerator
                key={editingMission?.id || 'new'}
                geminiConfigured={geminiConfigured}
                geminiModel={geminiModel}
                initialDraft={editingMission}
                onSaveMission={handleSaveMission}
                onCancelEdit={() => setEditingMission(null)}
                onNotify={onNotify}
              />

              {/* Authored Missions Library */}
              <section className="ql-panel rounded-2xl p-6">
                <h2 className="font-display text-xl font-bold text-white">
                  Your Authored Missions ({missions.length})
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Manage drafts, publish to subject worlds, assign to classes, or edit questions.
                </p>

                {missions.length === 0 ? (
                  <p className="mt-5 text-sm text-slate-400">
                    Generate your first mission above using Gemini AI or build one manually.
                  </p>
                ) : (
                  <div className="mt-5 divide-y divide-slate-400/15">
                    {missions.map((mission) => {
                      const isPublished = mission.status === 'published';
                      return (
                        <div
                          key={mission.id}
                          className="flex flex-col justify-between gap-4 py-4 lg:flex-row lg:items-center"
                        >
                          <div>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-semibold text-[#55D9F5]">{mission.subject}</span>
                              <span className="text-slate-500">·</span>
                              <span
                                className={`font-mono-tabular font-semibold ${
                                  isPublished ? 'text-emerald-300' : 'text-amber-300'
                                }`}
                              >
                                {isPublished ? 'Published' : 'Draft'}
                              </span>
                              <span className="text-slate-500">·</span>
                              <span className="font-mono-tabular text-slate-400">
                                {mission.questions.length} Qs
                              </span>
                            </div>
                            <h3 className="font-display mt-1 text-lg font-semibold text-white">
                              {mission.title}
                            </h3>
                            <p className="text-xs text-slate-400">{mission.topic}</p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingMission(mission)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-400/25 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-[#55D9F5]/50 hover:text-white"
                            >
                              <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Edit</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleTogglePublish(mission)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-400/25 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-[#A68AFF]/60 hover:text-white"
                            >
                              {isPublished ? (
                                <>
                                  <Lock className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
                                  <span>Unpublish</span>
                                </>
                              ) : (
                                <>
                                  <UploadCloud
                                    className="h-3.5 w-3.5 text-[#55D9F5]"
                                    aria-hidden="true"
                                  />
                                  <span>Publish</span>
                                </>
                              )}
                            </button>

                            {isPublished && (
                              <button
                                type="button"
                                onClick={() => setAssigningMission(mission)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-[#55D9F5] px-3 py-1.5 text-xs font-semibold text-[#06111D] hover:bg-[#7DE4FA]"
                              >
                                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Assign</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                setConfirmAction({
                                  title: 'Delete Mission',
                                  description: `Permanently delete "${mission.title}" and its answer key from Firestore?`,
                                  onConfirm: async () => {
                                    await deleteTeacherMission(mission.id);
                                    setMissions((prev) => prev.filter((m) => m.id !== mission.id));
                                    onMissionsChanged();
                                    onNotify('Mission deleted', mission.title, 'info');
                                  },
                                })
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-400/20 px-3 py-1.5 text-xs text-rose-300 hover:border-rose-400/50"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* TAB 3: CLASSES & ROSTERS */}
          {activeTab === 'classes' && (
            <div className="grid gap-8 lg:grid-cols-12">
              <div className="space-y-6 lg:col-span-5">
                {/* Create Class */}
                <section className="ql-panel-accent rounded-2xl p-6">
                  <h2 className="font-display text-lg font-semibold text-white">Create a Class</h2>
                  <form onSubmit={handleCreateClass} className="mt-4 space-y-3">
                    <div>
                      <label htmlFor="class-name" className="block text-xs font-medium text-slate-300">
                        Class Name
                      </label>
                      <input
                        id="class-name"
                        type="text"
                        required
                        value={newClassName}
                        onChange={(e) => setNewClassName(e.target.value)}
                        placeholder="e.g. Period 3 Honors English"
                        className="mt-1 w-full rounded-lg border border-slate-400/25 bg-[#080D19] px-3 py-2 text-sm text-white focus:border-[#55D9F5] focus:outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="class-subject"
                          className="block text-xs font-medium text-slate-300"
                        >
                          Subject
                        </label>
                        <select
                          id="class-subject"
                          value={newClassSubject}
                          onChange={(e) => setNewClassSubject(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-400/25 bg-[#080D19] px-2.5 py-2 text-sm text-white focus:border-[#55D9F5] focus:outline-none"
                        >
                          <option value="English">English</option>
                          <option value="Mathematics">Mathematics</option>
                          <option value="Science">Science</option>
                          <option value="Business">Business</option>
                        </select>
                      </div>
                      <div>
                        <label
                          htmlFor="class-grade"
                          className="block text-xs font-medium text-slate-300"
                        >
                          Grade Level
                        </label>
                        <input
                          id="class-grade"
                          type="text"
                          value={newClassGrade}
                          onChange={(e) => setNewClassGrade(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-400/25 bg-[#080D19] px-3 py-2 text-sm text-white focus:border-[#55D9F5] focus:outline-none"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={creatingClass}
                      className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg bg-[#55D9F5] px-4 py-2 text-sm font-semibold text-[#06111D] hover:bg-[#7DE4FA] disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      <span>{creatingClass ? 'Creating...' : 'Create Class'}</span>
                    </button>
                  </form>
                </section>

                {/* Add Student by UID */}
                <section className="ql-panel rounded-2xl p-6">
                  <div className="flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-[#A68AFF]" aria-hidden="true" />
                    <h2 className="font-display text-lg font-semibold text-white">
                      Enroll Student Manually
                    </h2>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Students can join directly using your Class Code in their Profile, or you can
                    enroll them using their Explorer UID.
                  </p>

                  <form onSubmit={handleAddStudent} className="mt-4 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300">Class</label>
                      <select
                        value={selectedClassForStudent}
                        onChange={(e) => setSelectedClassForStudent(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-400/25 bg-[#080D19] px-3 py-2 text-sm text-white focus:border-[#55D9F5] focus:outline-none"
                      >
                        {classes.length === 0 ? (
                          <option value="">Create a class first</option>
                        ) : (
                          classes.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300">
                        Student Explorer UID
                      </label>
                      <input
                        type="text"
                        required
                        value={studentUidInput}
                        onChange={(e) => setStudentUidInput(e.target.value)}
                        placeholder="Firebase UID"
                        className="mt-1 w-full rounded-lg border border-slate-400/25 bg-[#080D19] px-3 py-2 text-sm text-white focus:border-[#55D9F5] focus:outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-slate-300">
                          Student Name
                        </label>
                        <input
                          type="text"
                          required
                          value={studentNameInput}
                          onChange={(e) => setStudentNameInput(e.target.value)}
                          placeholder="Maya Lin"
                          className="mt-1 w-full rounded-lg border border-slate-400/25 bg-[#080D19] px-3 py-2 text-sm text-white focus:border-[#55D9F5] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-300">Email</label>
                        <input
                          type="email"
                          value={studentEmailInput}
                          onChange={(e) => setStudentEmailInput(e.target.value)}
                          placeholder="maya@school.edu"
                          className="mt-1 w-full rounded-lg border border-slate-400/25 bg-[#080D19] px-3 py-2 text-sm text-white focus:border-[#55D9F5] focus:outline-none"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={addingStudent || classes.length === 0}
                      className="inline-flex min-h-[40px] w-full items-center justify-center rounded-lg border border-slate-400/25 bg-[#0D1526] px-4 py-2 text-xs font-semibold text-white hover:border-[#A68AFF]/60 disabled:opacity-50"
                    >
                      {addingStudent ? 'Enrolling...' : 'Add Student to Roster'}
                    </button>
                  </form>
                </section>
              </div>

              {/* Class Cards & Enrolled Roster */}
              <div className="space-y-6 lg:col-span-7">
                {classes.length === 0 ? (
                  <div className="ql-panel rounded-2xl p-8 text-center text-sm text-slate-400">
                    No classes created yet. Create a class on the left to get a shareable Class Code.
                  </div>
                ) : (
                  classes.map((cls) => {
                    const classRoster = enrollments.filter((e) => e.classId === cls.id);
                    const isCopied = copiedClassId === cls.id;
                    return (
                      <section key={cls.id} className="ql-panel rounded-2xl p-6">
                        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-400/15 pb-4">
                          <div>
                            <p className="text-xs font-medium text-[#55D9F5]">
                              {cls.subject} · {cls.gradeLevel}
                            </p>
                            <h3 className="font-display mt-1 text-xl font-bold text-white">
                              {cls.name}
                            </h3>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleCopyClassCode(cls.id)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-400/25 bg-[#080D19] px-3 py-1.5 text-xs text-slate-200 hover:border-[#55D9F5]/60"
                            >
                              {isCopied ? (
                                <Check className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
                              ) : (
                                <Copy className="h-3.5 w-3.5 text-[#55D9F5]" aria-hidden="true" />
                              )}
                              <span className="font-mono-tabular">
                                {isCopied ? 'Copied Code' : `Code: ${cls.id}`}
                              </span>
                            </button>

                            <button
                              type="button"
                              aria-label={`Delete ${cls.name}`}
                              onClick={() =>
                                setConfirmAction({
                                  title: 'Delete Class',
                                  description: `Delete "${cls.name}"? Existing enrollments will no longer link to an active class.`,
                                  onConfirm: async () => {
                                    await deleteClassRoom(cls.id);
                                    setClasses((prev) => prev.filter((c) => c.id !== cls.id));
                                    onNotify('Class deleted', cls.name, 'info');
                                  },
                                })
                              }
                              className="rounded-lg border border-slate-400/20 p-1.5 text-rose-300 hover:border-rose-400/50"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </div>

                        {classRoster.length === 0 ? (
                          <p className="mt-4 text-xs text-slate-400">
                            No students enrolled yet. Share code{' '}
                            <code className="text-[#55D9F5]">{cls.id}</code> with your students.
                          </p>
                        ) : (
                          <ul className="mt-4 divide-y divide-slate-400/12">
                            {classRoster.map((enr) => (
                              <li
                                key={enr.id}
                                className="flex items-center justify-between gap-3 py-2.5 text-xs"
                              >
                                <div>
                                  <p className="font-semibold text-white">{enr.studentName}</p>
                                  <p className="text-slate-400">{enr.studentEmail}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmAction({
                                      title: 'Remove Student',
                                      description: `Remove ${enr.studentName} from ${cls.name}?`,
                                      onConfirm: async () => {
                                        await removeEnrollment(enr.id);
                                        setEnrollments((prev) =>
                                          prev.filter((item) => item.id !== enr.id),
                                        );
                                        onNotify('Student removed', enr.studentName, 'info');
                                      },
                                    })
                                  }
                                  className="text-xs text-rose-300 hover:text-rose-200"
                                >
                                  Remove
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 4: STUDENT ANALYTICS */}
          {activeTab === 'analytics' && (
            <section className="ql-panel rounded-2xl p-6">
              <div className="flex flex-col justify-between gap-4 border-b border-slate-400/15 pb-5 sm:flex-row sm:items-center">
                <div>
                  <h2 className="font-display text-xl font-bold text-white">
                    Student Progress &amp; Mastery Reports
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Live metrics aggregated from enrollments, assignments, and mission submissions.
                  </p>
                </div>

                <input
                  type="search"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search student name or email..."
                  aria-label="Search students"
                  className="w-full rounded-lg border border-slate-400/25 bg-[#080D19] px-3.5 py-2 text-sm text-white placeholder:text-slate-500 focus:border-[#55D9F5] focus:outline-none sm:w-64"
                />
              </div>

              {filteredStudents.length === 0 ? (
                <p className="mt-6 text-sm text-slate-400">
                  No student records match your current filter.
                </p>
              ) : (
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-400/15 text-slate-400">
                        <th className="py-3 pr-4 font-medium">Student</th>
                        <th className="py-3 px-4 font-medium">Completed</th>
                        <th className="py-3 px-4 font-medium">XP Earned</th>
                        <th className="py-3 px-4 font-medium">Avg Accuracy</th>
                        <th className="py-3 px-4 font-medium">Assigned Done</th>
                        <th className="py-3 px-4 font-medium">Last Activity</th>
                        <th className="py-3 pl-4 font-medium">Focus Areas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-400/10">
                      {filteredStudents.map((student) => (
                        <tr key={student.uid} className="text-slate-200">
                          <td className="py-3.5 pr-4">
                            <p className="font-semibold text-white">{student.name}</p>
                            <p className="text-[11px] text-slate-400">
                              {student.classes.join(', ') || student.email || student.uid}
                            </p>
                          </td>
                          <td className="font-mono-tabular py-3.5 px-4">
                            {student.missionsCompleted}
                          </td>
                          <td className="font-mono-tabular py-3.5 px-4 text-[#55D9F5]">
                            {student.xpEarned} XP
                          </td>
                          <td className="font-mono-tabular py-3.5 px-4">
                            {student.accuracy !== null ? `${student.accuracy}%` : '—'}
                          </td>
                          <td className="font-mono-tabular py-3.5 px-4">
                            {student.completionRate !== null ? `${student.completionRate}%` : '—'}
                          </td>
                          <td className="font-mono-tabular py-3.5 px-4 text-slate-400">
                            {student.lastActiveAt
                              ? new Date(student.lastActiveAt).toLocaleDateString()
                              : 'No runs yet'}
                          </td>
                          <td className="py-3.5 pl-4 text-amber-200">
                            {student.weakTopics.length > 0
                              ? student.weakTopics.slice(0, 2).join(', ')
                              : 'On track'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* Assign Mission Modal */}
      {assigningMission && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="assign-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#040812]/80 px-4 backdrop-blur-sm"
        >
          <div className="ql-panel-accent w-full max-w-md rounded-2xl p-6 shadow-2xl">
            <h2 id="assign-modal-title" className="font-display text-lg font-bold text-white">
              Assign Mission
            </h2>
            <p className="mt-1 text-xs text-[#55D9F5]">{assigningMission.title}</p>

            <form onSubmit={handleAssignMissionSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300">Target Class</label>
                <select
                  value={assignClassId}
                  onChange={(e) => setAssignClassId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-400/25 bg-[#080D19] px-3 py-2 text-sm text-white focus:border-[#55D9F5] focus:outline-none"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({enrollments.filter((e) => e.classId === c.id).length} students)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">
                  Due Date (optional)
                </label>
                <input
                  type="date"
                  value={assignDueDate}
                  onChange={(e) => setAssignDueDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-400/25 bg-[#080D19] px-3 py-2 text-sm text-white focus:border-[#55D9F5] focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAssigningMission(null)}
                  className="rounded-lg border border-slate-400/25 px-4 py-2 text-xs font-medium text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assigningBusy || classes.length === 0}
                  className="rounded-lg bg-[#55D9F5] px-4 py-2 text-xs font-semibold text-[#06111D] hover:bg-[#7DE4FA] disabled:opacity-50"
                >
                  {assigningBusy ? 'Assigning...' : 'Assign to Class'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.title || ''}
        description={confirmAction?.description || ''}
        confirmLabel="Confirm Delete"
        destructive
        busy={confirmBusy}
        onCancel={() => setConfirmAction(null)}
        onConfirm={async () => {
          if (!confirmAction) return;
          setConfirmBusy(true);
          try {
            await confirmAction.onConfirm();
            setConfirmAction(null);
          } catch (err) {
            onNotify(
              'Action failed',
              err instanceof Error ? err.message : 'Unable to complete action.',
              'error',
            );
          } finally {
            setConfirmBusy(false);
          }
        }}
      />
    </div>
  );
}
