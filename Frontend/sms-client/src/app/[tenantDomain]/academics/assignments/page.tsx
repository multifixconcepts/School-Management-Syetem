'use client';

import ConfirmationModal from '@/components/common/ConfirmationModal';

import {
  BookOpen, RefreshCcw, CheckCircle, AlertCircle, FileText, Clock, Plus, Filter,
  Users, GraduationCap, PlusCircle, Calendar, Loader2, Save, LayoutDashboard,
  ChevronRight, User, Check, X, Table2, EyeOff, Eye, Edit3, Trash2, Inbox,
  MessageSquare, Info, Send
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAssignmentService, type Assignment, type AssignmentCreate } from '@/services/api/assignment-service';
import { useSubjectService } from '@/services/api/subject-service';
import { useTeacherService } from '@/services/api/teacher-service';
import { useAcademicGradeService } from '@/services/api/academic-grade-service';
import { useEnrollmentService } from '@/services/api/enrollment-service';
import { useSectionService } from '@/services/api/section-service';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MarksEntryDialog } from '@/components/grades/MarksEntryDialog';
import { PermissionGuard } from '@/components/common/PermissionGuard';
import { useAuth } from '@/hooks/use-auth';
import { useSubmissionService, type Submission } from '@/services/api/submission-service';
import { SubmissionDialog } from '@/components/academics/SubmissionDialog';

export default function AssignmentsPage() {
  const { getAssignments, createAssignment, publishAssignment, unpublishAssignment, updateAssignment, deleteAssignment } = useAssignmentService();
  const { getActiveSubjects } = useSubjectService();
  const { getTeachers } = useTeacherService();
  const { getGrades } = useAcademicGradeService();
  const { getCurrentAcademicYear } = useEnrollmentService();
  const sectionService = useSectionService();
  const { user } = useAuth();

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [assignmentToDelete, setAssignmentToDelete] = useState<Assignment | null>(null);

  const { getStudentSubmissions, getMySubmissions } = useSubmissionService();
  const [studentSubmissions, setStudentSubmissions] = useState<Submission[]>([]);

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [academicYearId, setAcademicYearId] = useState<string>('');

  // Marks Entry
  const [isMarksEntryOpen, setIsMarksEntryOpen] = useState(false);
  const [selectedAssignmentForMarks, setSelectedAssignmentForMarks] = useState<Assignment | null>(null);

  // Submission Dialog
  const [isSubmissionOpen, setIsSubmissionOpen] = useState(false);
  const [selectedAssignmentForSubmission, setSelectedAssignmentForSubmission] = useState<Assignment | null>(null);

  // Feedback View
  const [viewingFeedback, setViewingFeedback] = useState<Submission | null>(null);

  // Filters
  const [filterSubjectId, setFilterSubjectId] = useState<string>('');
  const [filterTeacherId, setFilterTeacherId] = useState<string>('');
  const [filterGradeId, setFilterGradeId] = useState<string>('');
  const [filterSectionId, setFilterSectionId] = useState<string>('');
  const [subjects, setSubjects] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [filterSections, setFilterSections] = useState<any[]>([]);

  const [form, setForm] = useState<AssignmentCreate>({
    title: '',
    subject_id: '',
    teacher_id: '',
    grade_id: '',
    section_id: '',
    due_date: '',
    max_score: 100,
    academic_year_id: '',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [list, subs, trs, grs] = await Promise.all([
        getAssignments({
          limit: 50,
          subject_id: filterSubjectId || undefined,
          teacher_id: filterTeacherId || undefined,
          grade_id: filterGradeId || undefined,
          section_id: filterSectionId || undefined,
          academic_year_id: academicYearId || undefined
        }),
        getActiveSubjects(),
        getTeachers(),
        getGrades(),
      ]);
      setAssignments(list || []);
      setSubjects(subs || []);
      setTeachers(trs || []);
      setGrades(grs || []);

      if (user?.role?.toLowerCase() === 'student') {
        const subsList = await getMySubmissions();
        setStudentSubmissions(subsList || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      await loadData();
      try {
        const ay = await getCurrentAcademicYear();
        if (ay) {
          setAcademicYearId(ay.id);
          setForm(prev => ({ ...prev, academic_year_id: ay.id }));
        }
      } catch (err) {
        console.warn('Failed to load current academic year');
      }
    };
    init();
  }, []);

  // Auto-refresh for students to see grading updates (every 30 seconds)
  useEffect(() => {
    if (user?.role?.toLowerCase() !== 'student') return;

    const interval = setInterval(async () => {
      try {
        const subsList = await getMySubmissions();
        setStudentSubmissions(subsList || []);
      } catch (err) {
        console.warn('Auto-refresh failed:', err);
      }
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [user?.role]);

  useEffect(() => {
    loadData();
  }, [filterSubjectId, filterTeacherId, filterGradeId, filterSectionId]);

  // Load sections when grade is selected in filters
  useEffect(() => {
    if (filterGradeId) {
      sectionService.getSectionsByGrade(filterGradeId).then(setFilterSections);
    } else {
      setFilterSections([]);
    }
    setFilterSectionId('');
  }, [filterGradeId]);

  // Load sections when grade is selected in creation form
  useEffect(() => {
    if (form.grade_id) {
      sectionService.getSectionsByGrade(form.grade_id).then(setSections);
    } else {
      setSections([]);
    }
    setForm(prev => ({ ...prev, section_id: '' }));
  }, [form.grade_id]);

  const onCreate = async () => {
    console.log('[onCreate] Button clicked, form state:', form);
    console.log('[onCreate] Validation check - title:', form.title, 'subject_id:', form.subject_id, 'teacher_id:', form.teacher_id, 'grade_id:', form.grade_id, 'due_date:', form.due_date);

    if (!form.title || !form.subject_id || !form.teacher_id || !form.grade_id || !form.due_date) {
      console.warn('[onCreate] Validation failed - showing alert');
      alert('Please fill title, subject, teacher, grade, and due date');
      return;
    }

    console.log('[onCreate] Validation passed, starting creation process');
    setCreating(true);
    setMessage('');
    setMessageType('');
    try {
      console.log('[onCreate] Calling createAssignment with payload:', form);
      const result = await createAssignment(form);
      console.log('[onCreate] Assignment created successfully:', result);
      setMessage('Assignment created successfully');
      setMessageType('success');

      // Clear cache to ensure fresh data is loaded
      const { clearGlobalCache } = await import('@/services/api/api-client');
      clearGlobalCache();
      console.log('[onCreate] Cache cleared, loading fresh data');

      await loadData();
      setForm({
        title: '',
        subject_id: '',
        teacher_id: '',
        grade_id: '',
        section_id: '',
        due_date: '',
        max_score: 100,
        academic_year_id: academicYearId
      });
      setSubjectQuery('');
      setTeacherQuery('');
      setGradeQuery('');
      console.log('[onCreate] Form reset complete');
    } catch (err) {
      console.error('[onCreate] Failed to create assignment - Error details:', err);
      console.error('[onCreate] Error stack:', (err as Error).stack);
      setMessage(`Failed to create assignment: ${(err as Error).message}`);
      setMessageType('error');
    } finally {
      setCreating(false);
      console.log('[onCreate] Creation process complete');
    }
  };

  const onPublishToggle = async (a: Assignment) => {
    try {
      if (a.is_published) {
        await unpublishAssignment(a.id);
      } else {
        await publishAssignment(a.id);
      }

      // Clear cache to show status change
      const { clearGlobalCache } = await import('@/services/api/api-client');
      clearGlobalCache();

      await loadData();
    } catch (err) {
      console.error('Failed to toggle publish status', err);
      setMessage('Failed to update publish status');
      setMessageType('error');
    }
  };

  // Inline edit + optimistic UI
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [editingAssignment, setEditingAssignment] = useState<{
    title: string;
    due_date: string;
    subject_id: string;
    teacher_id: string;
    grade_id: string;
    section_id: string;
    max_score: number;
  }>({
    title: '',
    due_date: '',
    subject_id: '',
    teacher_id: '',
    grade_id: '',
    section_id: '',
    max_score: 100
  });
  const [savingAssignmentId, setSavingAssignmentId] = useState<string | null>(null);
  const [deletingAssignmentId, setDeletingAssignmentId] = useState<string | null>(null);

  // Create form: searchable selects + spinner
  const [subjectQuery, setSubjectQuery] = useState('');
  const [teacherQuery, setTeacherQuery] = useState('');
  const [gradeQuery, setGradeQuery] = useState('');
  const [creating, setCreating] = useState(false);

  const filteredSubjects = subjectQuery
    ? subjects.filter(s => (s.name || '').toLowerCase().includes(subjectQuery.toLowerCase()))
    : subjects;
  const filteredTeachers = teacherQuery
    ? teachers.filter(t => ((t.name || `${t.first_name ?? ''} ${t.last_name ?? ''}`).trim()).toLowerCase().includes(teacherQuery.toLowerCase()))
    : teachers;
  const filteredGrades = gradeQuery
    ? grades.filter(g => (g.name || '').toLowerCase().includes(gradeQuery.toLowerCase()))
    : grades;

  const [message, setMessage] = useState<string>('');
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('');


  const onEditAssignment = (a: Assignment) => {
    setEditingAssignmentId(a.id);
    setEditingAssignment({
      title: a.title,
      due_date: a.due_date,
      subject_id: a.subject_id,
      teacher_id: a.teacher_id,
      grade_id: a.grade_id,
      section_id: a.section_id || '',
      max_score: a.max_score ?? 100
    });
  };

  const onCancelEditAssignment = () => {
    setEditingAssignmentId(null);
    setEditingAssignment({
      title: '',
      due_date: '',
      subject_id: '',
      teacher_id: '',
      grade_id: '',
      section_id: '',
      max_score: 100
    });
  };

  const onSaveEditAssignment = async () => {
    if (!editingAssignmentId) return;
    setMessage('');
    setMessageType('');
    setSavingAssignmentId(editingAssignmentId);
    try {
      await updateAssignment(editingAssignmentId, {
        title: editingAssignment.title,
        due_date: editingAssignment.due_date,
        subject_id: editingAssignment.subject_id,
        teacher_id: editingAssignment.teacher_id,
        grade_id: editingAssignment.grade_id,
        section_id: editingAssignment.section_id,
        max_score: editingAssignment.max_score
      });
      setMessage('Assignment updated successfully');
      setMessageType('success');
      onCancelEditAssignment();

      // Clear cache to show updated data
      const { clearGlobalCache } = await import('@/services/api/api-client');
      clearGlobalCache();

      await loadData();
    } catch (err) {
      console.error('Failed to update assignment', err);
      setMessage('Failed to update assignment');
      setMessageType('error');
    } finally {
      setSavingAssignmentId(null);
    }
  };

  const onDeleteAssignment = (a: Assignment) => {
    setAssignmentToDelete(a);
    setIsDeleteModalOpen(true);
  };

  const onConfirmDelete = async () => {
    if (!assignmentToDelete) return;

    setMessage('');
    setMessageType('');
    setDeletingAssignmentId(assignmentToDelete.id);
    setIsDeleteModalOpen(false); // Close immediately or wait, depending on preference. Closing first feels snappier.

    try {
      await deleteAssignment(assignmentToDelete.id);
      toast.success('Assignment deleted successfully');

      // Clear cache to show updated list
      const { clearGlobalCache } = await import('@/services/api/api-client');
      clearGlobalCache();

      await loadData();
    } catch (err: any) {
      console.error('Failed to delete assignment', err);
      // Use toast for error as well
      const msg = err?.message || 'Failed to delete assignment';
      toast.error(msg);
      // Fallback message state if needed, but toast is primary now
      setMessage(msg);
      setMessageType('error');
    } finally {
      setDeletingAssignmentId(null);
      setAssignmentToDelete(null);
    }
  };

  const onOpenMarksEntry = (a: Assignment) => {
    setSelectedAssignmentForMarks(a);
    setIsMarksEntryOpen(true);
  };

  /* 
    Premium Redesign Notes:
    - Added Stats Cards for quick overview
    - Modern Data Grid with hover effects and status pills
    - Use Lucide Icons for better visual hierarchy
    - Glassmorphism effects for headers and filters
  */
  return (
    <div className="min-h-screen bg-[#f8fafc] p-6 lg:p-10">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header & Title */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
              <BookOpen className="h-8 w-8 text-indigo-600" />
              Assignments
            </h1>
            <p className="text-slate-500 mt-1">Manage and track student coursework across all grades and subjects.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setFilterSubjectId(''); setFilterTeacherId(''); setFilterGradeId(''); }}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Messaging Area */}
        {message && (
          <div className={`flex items-center gap-3 p-4 rounded-xl border animate-in fade-in slide-in-from-top-4 duration-300 ${messageType === 'success'
            ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
            : 'bg-rose-50 border-rose-100 text-rose-800'
            }`}>
            {messageType === 'success' ? <CheckCircle className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
            <span className="font-medium">{message}</span>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-indigo-50 rounded-lg">
                <FileText className="h-6 w-6 text-indigo-600" />
              </div>
              <span className="text-sm font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full">Total</span>
            </div>
            <h3 className="text-2xl font-bold text-slate-900">{assignments.length}</h3>
            <p className="text-sm text-slate-500 mt-1">Active coursework</p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-emerald-50 rounded-lg">
                <CheckCircle className="h-6 w-6 text-emerald-600" />
              </div>
              <span className="text-sm font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">Published</span>
            </div>
            <h3 className="text-2xl font-bold text-slate-900">{assignments.filter(a => a.is_published).length}</h3>
            <p className="text-sm text-slate-500 mt-1">Live for students</p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-orange-50 rounded-lg">
                <Clock className="h-6 w-6 text-orange-600" />
              </div>
              <span className="text-sm font-medium text-orange-600 bg-orange-50 px-2 py-1 rounded-full">Draft</span>
            </div>
            <h3 className="text-2xl font-bold text-slate-900">{assignments.filter(a => !a.is_published).length}</h3>
            <p className="text-sm text-slate-500 mt-1">Awaiting review</p>
          </div>

          <PermissionGuard roles={['admin', 'teacher', 'superadmin']}>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow cursor-pointer group" onClick={() => { }}>
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 bg-slate-50 rounded-lg group-hover:bg-indigo-600 transition-colors">
                  <Plus className="h-6 w-6 text-slate-600 group-hover:text-white" />
                </div>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">New Entry</h3>
              <p className="text-sm text-slate-500 mt-1">Create an assignment</p>
            </div>
          </PermissionGuard>
        </div>

        {/* Filters & Actions */}
        <div className="bg-white p-1 rounded-xl shadow-sm border border-slate-100 flex flex-wrap items-center gap-2">
          <div className="flex flex-1 min-w-[200px] items-center gap-2 px-3 py-2 border-r border-slate-100 last:border-0">
            <Filter className="h-4 w-4 text-slate-400" />
            <select
              value={filterSubjectId}
              onChange={e => setFilterSubjectId(e.target.value)}
              className="w-full bg-transparent text-sm font-medium text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="">All Subjects</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="flex flex-1 min-w-[200px] items-center gap-2 px-3 py-2 border-r border-slate-100 last:border-0">
            <Users className="h-4 w-4 text-slate-400" />
            <select
              value={filterTeacherId}
              onChange={e => setFilterTeacherId(e.target.value)}
              className="w-full bg-transparent text-sm font-medium text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="">All Teachers</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.name || `${t.first_name} ${t.last_name}`}</option>)}
            </select>
          </div>

          <div className="flex flex-1 min-w-[200px] items-center gap-2 px-3 py-2 border-r border-slate-100 last:border-0">
            <GraduationCap className="h-4 w-4 text-slate-400" />
            <select
              value={filterGradeId}
              onChange={e => setFilterGradeId(e.target.value)}
              className="w-full bg-transparent text-sm font-medium text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="">All Grades</option>
              {grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>

          <div className="flex flex-1 min-w-[200px] items-center gap-2 px-3 py-2 border-r border-slate-100 last:border-0">
            <LayoutDashboard className="h-4 w-4 text-slate-400" />
            <select
              value={filterSectionId}
              onChange={e => setFilterSectionId(e.target.value)}
              className="w-full bg-transparent text-sm font-medium text-slate-700 focus:outline-none cursor-pointer"
              disabled={!filterGradeId}
            >
              <option value="">All Sections</option>
              {filterSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        {/* Main Content Area */}
        <div className={`grid grid-cols-1 ${user?.role === 'student' ? '' : 'lg:grid-cols-12'} gap-8 items-start`}>
          {/* Create Form Container */}
          <PermissionGuard roles={['admin', 'teacher', 'superadmin']}>
            <div className="lg:col-span-4 space-y-6 sticky top-8">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 mb-6">
                  <div className="p-1.5 bg-indigo-50 rounded-lg">
                    <PlusCircle className="h-5 w-5 text-indigo-600" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 line-clamp-1">Create Assignment</h3>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Assignment Title</label>
                    <input
                      placeholder="Enter title..."
                      value={form.title}
                      onChange={e => setForm({ ...form, title: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-50 border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Due Date</label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
                        <input
                          type="date"
                          value={form.due_date}
                          onChange={e => setForm({ ...form, due_date: e.target.value })}
                          className="w-full pl-10 pr-4 py-2 bg-slate-50 border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Max Score</label>
                      <input
                        type="number"
                        value={form.max_score ?? 100}
                        onChange={e => setForm({ ...form, max_score: Number(e.target.value) })}
                        className="w-full px-4 py-2 bg-slate-50 border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-slate-50">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Academic Grade</label>
                    <select
                      value={form.grade_id}
                      onChange={e => setForm({ ...form, grade_id: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-50 border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all cursor-pointer"
                    >
                      <option value="">Select Grade</option>
                      {grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-slate-50">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Section (Optional)</label>
                    <select
                      value={form.section_id}
                      onChange={e => setForm({ ...form, section_id: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-50 border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all cursor-pointer disabled:opacity-50"
                      disabled={!form.grade_id}
                    >
                      <option value="">Select Section</option>
                      {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Subject</label>
                    <select
                      value={form.subject_id}
                      onChange={e => setForm({ ...form, subject_id: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-50 border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all cursor-pointer"
                    >
                      <option value="">Select Subject</option>
                      {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Assigned Teacher</label>
                    <select
                      value={form.teacher_id}
                      onChange={e => setForm({ ...form, teacher_id: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-50 border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all cursor-pointer"
                    >
                      <option value="">Select Teacher</option>
                      {teachers.map(t => <option key={t.id} value={t.id}>{t.name || `${t.first_name} ${t.last_name}`}</option>)}
                    </select>
                  </div>

                  <button
                    onClick={onCreate}
                    disabled={creating}
                    className="w-full mt-4 flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-[0.98]"
                  >
                    {creating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                    {creating ? 'Processing...' : 'Create Assignment'}
                  </button>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 to-indigo-900 text-white shadow-xl">
                <div className="flex items-center gap-3 mb-4">
                  <LayoutDashboard className="h-6 w-6 text-indigo-400" />
                  <h4 className="font-bold">Grading Pro Tip</h4>
                </div>
                <p className="text-sm text-indigo-100 leading-relaxed mb-4">
                  Use the <span className="text-indigo-300 font-bold">Grading Hub</span> for a unified view of all gradable activities. You can enter marks for exams and assignments in one place.
                </p>
                <button
                  onClick={() => window.location.href = `./grading-hub`}
                  className="text-sm font-bold flex items-center gap-2 text-indigo-300 hover:text-white transition-colors"
                >
                  Go to Grading Hub <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </PermissionGuard>

          {/* Table Container */}
          <div className={`${user?.role === 'student' ? 'lg:col-span-12' : 'lg:col-span-8'} bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden`}>
            <div className="p-6 border-b border-slate-50 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Current Coursework</h3>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-widest">
                Showing {assignments.length} items
              </div>
            </div>

            <div className="overflow-x-auto">
              {loading ? (
                <div className="p-20 flex flex-col items-center justify-center gap-4">
                  <Loader2 className="h-10 w-10 text-indigo-600 animate-spin" />
                  <p className="text-slate-500 font-medium animate-pulse">Synchronizing assignments...</p>
                </div>
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50">
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Assignment Details</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Grade & Subject</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Deadline</th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(assignments || []).map(a => (
                      <tr key={a.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-6 py-4">
                          {editingAssignmentId === a.id ? (
                            <input
                              value={editingAssignment.title}
                              onChange={e => setEditingAssignment({ ...editingAssignment, title: e.target.value })}
                              className="w-full px-3 py-1 text-sm border-slate-200 rounded focus:ring-indigo-500 outline-none"
                              disabled={savingAssignmentId === a.id || deletingAssignmentId === a.id}
                            />
                          ) : (
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-800 text-sm">{a.title}</span>
                              <span className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                                <User className="h-3 w-3" />
                                {teachers.find(t => t.id === a.teacher_id)?.name || teachers.find(t => t.id === a.teacher_id)?.first_name || 'Assigned Teacher'}
                              </span>
                            </div>
                          )}
                        </td>

                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <span className="px-2 py-0.5 inline-block text-[10px] font-bold bg-slate-100 text-slate-600 rounded-full w-fit">
                              {grades.find(g => g.id === a.grade_id)?.name || 'Grade'}{a.section_id ? ` - ${a.section_name || 'Section'}` : ''}
                            </span>
                            <span className="text-sm font-medium text-slate-700">
                              {subjects.find(s => s.id === a.subject_id)?.name || 'Subject'}
                            </span>
                          </div>
                        </td>

                        <td className="px-6 py-4 text-sm text-slate-600 font-medium">
                          {editingAssignmentId === a.id ? (
                            <input
                              type="date"
                              value={editingAssignment.due_date}
                              onChange={e => setEditingAssignment({ ...editingAssignment, due_date: e.target.value })}
                              className="px-2 py-1 text-sm border-slate-200 rounded focus:ring-indigo-500 outline-none"
                            />
                          ) : (
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-slate-400" />
                              {new Date(a.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                          )}
                        </td>

                        <td className="px-6 py-4">
                          <div className="flex justify-center">
                            <span className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${a.is_published
                              ? 'bg-emerald-100 text-emerald-700 shadow-sm shadow-emerald-100'
                              : 'bg-orange-100 text-orange-700 shadow-sm shadow-orange-100'
                              }`}>
                              {a.is_published ? 'Published' : 'Draft'}
                            </span>
                          </div>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          {editingAssignmentId === a.id ? (
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={onSaveEditAssignment} className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-lg transition-all">
                                <Check className="h-4 w-4" />
                              </button>
                              <button onClick={onCancelEditAssignment} className="p-1.5 bg-slate-50 text-slate-600 hover:bg-slate-600 hover:text-white rounded-lg transition-all">
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                              <PermissionGuard roles={['student']}>
                                {(() => {
                                  const submission = studentSubmissions.find(s => s.assignment_id === a.id);
                                  if (submission) {
                                    if (submission.status === 'GRADED' || submission.score !== undefined) {
                                      return (
                                        <div className="flex flex-col items-end gap-2 max-w-[280px]">
                                          <div className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold ring-1 ring-indigo-100">
                                            <GraduationCap className="h-3.5 w-3.5" />
                                            Score: {submission.score}/{a.max_score}
                                          </div>
                                          {submission.feedback && (
                                            <div className="flex items-start gap-1.5 p-2 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-800 w-full">
                                              <MessageSquare className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-amber-600" />
                                              <p className="line-clamp-3 italic">&ldquo;{submission.feedback}&rdquo;</p>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    }
                                    return (
                                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold ring-1 ring-emerald-100">
                                        <CheckCircle className="h-4 w-4" />
                                        Submitted
                                      </div>
                                    );
                                  }
                                  return (
                                    <button
                                      onClick={() => {
                                        setSelectedAssignmentForSubmission(a);
                                        setIsSubmissionOpen(true);
                                      }}
                                      title="Submit Work"
                                      className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex items-center gap-1 font-semibold"
                                    >
                                      <Plus className="h-4 w-4" />
                                      Submit
                                    </button>
                                  );
                                })()}
                              </PermissionGuard>

                              <PermissionGuard roles={['teacher', 'admin', 'superadmin']}>
                                <button
                                  onClick={() => onOpenMarksEntry(a)}
                                  title="Enter Marks"
                                  className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                >
                                  <Table2 className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => onPublishToggle(a)}
                                  title={a.is_published ? "Unpublish" : "Publish"}
                                  className={`p-2 rounded-lg transition-colors ${a.is_published ? 'text-orange-600 hover:bg-orange-50' : 'text-emerald-600 hover:bg-emerald-50'}`}
                                >
                                  {a.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                                <button
                                  onClick={() => onEditAssignment(a)}
                                  title="Edit"
                                  className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                >
                                  <Edit3 className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => onDeleteAssignment(a)}
                                  title="Delete"
                                  className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </PermissionGuard>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {(assignments || []).length === 0 && !loading && (
                      <tr>
                        <td colSpan={5} className="px-6 py-20 text-center">
                          <div className="flex flex-col items-center justify-center gap-3">
                            <div className="p-4 bg-slate-50 rounded-full">
                              <Inbox className="h-10 w-10 text-slate-300" />
                            </div>
                            <h4 className="font-bold text-slate-900">No assignments found</h4>
                            <p className="text-slate-500 text-sm max-w-[240px] mx-auto">Try adjusting your filters or create a new assignment to get started.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Marks Entry Dialog */}
      {selectedAssignmentForMarks && (
        <MarksEntryDialog
          isOpen={isMarksEntryOpen}
          onClose={() => {
            setIsMarksEntryOpen(false);
            setSelectedAssignmentForMarks(null);
          }}
          examId={selectedAssignmentForMarks.id}
          examTitle={selectedAssignmentForMarks.title}
          gradeId={selectedAssignmentForMarks.grade_id}
          sectionId={selectedAssignmentForMarks.section_id}
          subjectId={selectedAssignmentForMarks.subject_id}
          academicYearId={academicYearId}
          maxScore={selectedAssignmentForMarks.max_score ?? 100}
          assessmentType="ASSIGNMENT"
          assessmentDate={selectedAssignmentForMarks.due_date}
        />
      )}
      {/* Student Submission Dialog */}
      {selectedAssignmentForSubmission && (
        <SubmissionDialog
          isOpen={isSubmissionOpen}
          onClose={() => {
            setIsSubmissionOpen(false);
            setSelectedAssignmentForSubmission(null);
          }}
          assignmentId={selectedAssignmentForSubmission.id}
          assignmentTitle={selectedAssignmentForSubmission.title}
          onSuccess={loadData}
        />
      )}
      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onCancel={() => {
          setIsDeleteModalOpen(false);
          setAssignmentToDelete(null);
        }}
        onConfirm={onConfirmDelete}
        title="Delete Assignment"
        message={`Are you sure you want to delete assignment "${assignmentToDelete?.title}"? This cannot be undone.`}
        confirmButtonText="Delete"
        cancelButtonText="Cancel"
        confirmButtonColor="red"
        isLoading={!!deletingAssignmentId}
      />
      {/* Feedback Dialog */}
      {viewingFeedback && (
        <Dialog open={!!viewingFeedback} onOpenChange={() => setViewingFeedback(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-indigo-600" />
                Teacher Feedback
              </DialogTitle>
              <DialogDescription>
                Review comments for your submission.
              </DialogDescription>
            </DialogHeader>
            <div className="py-6 space-y-4">
              <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                <div className="flex items-center gap-2 text-indigo-700 font-bold mb-2">
                  <GraduationCap className="h-4 w-4" />
                  Grade: {viewingFeedback.score} / {assignments.find(a => a.id === viewingFeedback.assignment_id)?.max_score || 100}
                </div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap italic">
                  "{viewingFeedback.feedback || 'No comments provided.'}"
                </p>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <Info className="h-3 w-3" />
                Graded at {new Date(viewingFeedback.submitted_at).toLocaleDateString()}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
