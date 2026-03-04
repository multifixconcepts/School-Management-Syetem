'use client';

import { useState, useMemo, useEffect } from 'react';
import { useSubjectService } from '@/services/api/subject-service';
import { useTeacherService } from '@/services/api/teacher-service';
import { useAcademicGradeService } from '@/services/api/academic-grade-service';
import { useSectionService } from '@/services/api/section-service';
import { MarksEntryDialog } from '@/components/grades/MarksEntryDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Calendar,
  Clock,
  BookOpen,
  GraduationCap,
  Plus,
  Edit,
  Trash2,
  CheckCircle2,
  XCircle,
  Search,
  CalendarDays,
  FileSpreadsheet,
  AlertCircle,
  Loader2,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { type Exam, type ExamCreate } from '@/services/api/exam-service';
import {
  useCurrentAcademicYear,
  useExams,
  useCreateExam,
  useUpdateExam,
  useDeleteExam,
  usePublishExam,
  useUnpublishExam
} from '@/hooks/queries/exams';
import { useQuery } from '@tanstack/react-query';

export default function ExamsPage() {
  const sectionService = useSectionService();
  const { getActiveSubjects } = useSubjectService();
  const { getTeachers } = useTeacherService();
  const { getGrades } = useAcademicGradeService();

  // TanStack Query Hooks
  const { data: currentAcademicYear, isLoading: isLoadingYear, error: yearError } = useCurrentAcademicYear();
  const academicYearId = currentAcademicYear?.id || '';

  // Filters
  const [filterSubjectId, setFilterSubjectId] = useState<string>('all');
  const [filterTeacherId, setFilterTeacherId] = useState<string>('all');
  const [filterGradeId, setFilterGradeId] = useState<string>('all');
  const [filterSectionId, setFilterSectionId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch exams using TanStack Query
  const { data: exams = [], isLoading: isLoadingExams, refetch: refetchExams } = useExams({
    academic_year_id: academicYearId,
    subject_id: filterSubjectId !== 'all' ? filterSubjectId : undefined,
    teacher_id: filterTeacherId !== 'all' ? filterTeacherId : undefined,
    grade_id: filterGradeId !== 'all' ? filterGradeId : undefined,
    section_id: filterSectionId !== 'all' ? filterSectionId : undefined,
    limit: 100,
  });

  // Fetch supporting data
  const { data: subjects = [] } = useQuery({
    queryKey: ['subjects', 'active'],
    queryFn: getActiveSubjects,
  });
  const { data: teachers = [] } = useQuery({
    queryKey: ['teachers'],
    queryFn: getTeachers,
  });
  const { data: grades = [] } = useQuery({
    queryKey: ['grades'],
    queryFn: getGrades,
  });

  // Mutations
  const createMutation = useCreateExam();
  const updateMutation = useUpdateExam();
  const deleteMutation = useDeleteExam();
  const publishMutation = usePublishExam();
  const unpublishMutation = useUnpublishExam();

  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingExamId, setEditingExamId] = useState<string | null>(null);

  const [form, setForm] = useState<ExamCreate>({
    title: '',
    subject_id: '',
    teacher_id: '',
    grade_id: '',
    section_id: '',
    academic_year_id: '',
    exam_date: format(new Date(), 'yyyy-MM-dd'),
    start_time: '09:00',
    end_time: '12:00',
    max_score: 100,
  });

  const [formSections, setFormSections] = useState<any[]>([]);
  const [filterSections, setFilterSections] = useState<any[]>([]);

  // Marks Entry
  const [isMarksEntryOpen, setIsMarksEntryOpen] = useState(false);
  const [selectedExamForMarks, setSelectedExamForMarks] = useState<Exam | null>(null);

  // Sync form with academic year when it loads
  useEffect(() => {
    if (academicYearId) {
      setForm(prev => ({ ...prev, academic_year_id: academicYearId }));
    }
  }, [academicYearId]);

  // Load sections when grade is selected in creation form
  useEffect(() => {
    if (form.grade_id) {
      sectionService.getSectionsByGrade(form.grade_id).then(setFormSections);
    } else {
      setFormSections([]);
    }
  }, [form.grade_id, sectionService]);

  // Load sections when grade is selected in filters
  useEffect(() => {
    if (filterGradeId && filterGradeId !== 'all') {
      sectionService.getSectionsByGrade(filterGradeId).then(setFilterSections);
    } else {
      setFilterSections([]);
    }
    setFilterSectionId('all');
  }, [filterGradeId, sectionService]);

  const filteredExams = useMemo(() => {
    if (!searchQuery) return exams;
    return exams.filter(e =>
      e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      subjects.find(s => s.id === e.subject_id)?.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [exams, searchQuery, subjects]);

  const handleCreate = async () => {
    if (!form.title || !form.subject_id || !form.teacher_id || !form.grade_id || !form.exam_date) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      await createMutation.mutateAsync({
        ...form,
        academic_year_id: form.academic_year_id || academicYearId,
        start_time: form.start_time.length === 5 ? `${form.start_time}:00` : form.start_time,
        end_time: form.end_time.length === 5 ? `${form.end_time}:00` : form.end_time,
      });
      toast.success('Exam created successfully');
      setIsCreateOpen(false);
      setForm({
        title: '',
        subject_id: '',
        teacher_id: '',
        grade_id: '',
        section_id: '',
        academic_year_id: academicYearId,
        exam_date: format(new Date(), 'yyyy-MM-dd'),
        start_time: '09:00',
        end_time: '12:00',
        max_score: 100,
      });
    } catch (err) {
      toast.error('Failed to create exam');
    }
  };

  const handleUpdate = async () => {
    if (!editingExamId) return;
    try {
      await updateMutation.mutateAsync({
        id: editingExamId,
        data: {
          ...form,
          academic_year_id: form.academic_year_id || academicYearId,
          start_time: form.start_time.length === 5 ? `${form.start_time}:00` : form.start_time,
          end_time: form.end_time.length === 5 ? `${form.end_time}:00` : form.end_time,
        },
      });
      toast.success('Exam updated successfully');
      setIsEditOpen(false);
    } catch (err) {
      toast.error('Failed to update exam');
    }
  };

  const onDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success('Exam deleted');
    } catch (err) {
      toast.error('Failed to delete exam');
    }
  };

  const onPublishToggle = async (e: Exam) => {
    try {
      if (e.is_published) {
        await unpublishMutation.mutateAsync(e.id);
        toast.info('Exam unpublished');
      } else {
        await publishMutation.mutateAsync(e.id);
        toast.success('Exam published successfully');
      }
    } catch (err) {
      toast.error('Action failed');
    }
  };

  const openEdit = (e: Exam) => {
    setEditingExamId(e.id);
    setForm({
      title: e.title,
      subject_id: e.subject_id,
      teacher_id: e.teacher_id,
      grade_id: e.grade_id,
      section_id: e.section_id || '',
      academic_year_id: e.academic_year_id,
      exam_date: e.exam_date,
      start_time: e.start_time.substring(0, 5),
      end_time: e.end_time.substring(0, 5),
      max_score: e.max_score ?? 100,
    });
    setIsEditOpen(true);
  };

  const onOpenMarksEntry = (e: Exam) => {
    setSelectedExamForMarks(e);
    setIsMarksEntryOpen(true);
  };

  const isLoading = isLoadingYear || isLoadingExams;
  const isMutating = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending || publishMutation.isPending || unpublishMutation.isPending;

  // Handle no current academic year
  if (!isLoadingYear && !currentAcademicYear) {
    return (
      <div className="p-6 space-y-6 bg-gray-50/30 min-h-screen">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <AlertTriangle className="h-16 w-16 text-amber-500" />
          <h2 className="text-2xl font-bold text-gray-900">No Active Academic Session</h2>
          <p className="text-gray-500 text-center max-w-md">
            Please set up or activate an academic year before managing exams.
            Go to <strong>Academic Setup → Academic Years</strong> and ensure one session is marked as "Active".
          </p>
          <Button
            variant="outline"
            onClick={() => window.location.href = window.location.href.replace('/exams', '/academic-years')}
          >
            Go to Academic Years
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50/30 min-h-screen">
      {/* Header section with Stats */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-indigo-950 flex items-center gap-2">
            <FileSpreadsheet className="w-8 h-8 text-indigo-600" />
            Exam Management
          </h1>
          <p className="text-muted-foreground">Schedule, publish, and manage academic evaluations.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetchExams()} disabled={isLoading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 gap-2">
                <Plus className="w-4 h-4" /> New Exam
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Create Academic Exam</DialogTitle>
                <DialogDescription>Fill in the details to schedule a new examination period.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="title">Exam Title</Label>
                  <Input id="title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g., Mid-Term Mathematics" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Grade</Label>
                    <Select value={form.grade_id} onValueChange={val => setForm({ ...form, grade_id: val, section_id: '' })}>
                      <SelectTrigger><SelectValue placeholder="Select Grade" /></SelectTrigger>
                      <SelectContent>
                        {grades.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Section (Optional)</Label>
                    <Select value={form.section_id} onValueChange={val => setForm({ ...form, section_id: val })} disabled={!form.grade_id}>
                      <SelectTrigger><SelectValue placeholder="All Sections" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Sections</SelectItem>
                        {formSections.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Subject</Label>
                    <Select value={form.subject_id} onValueChange={val => setForm({ ...form, subject_id: val })}>
                      <SelectTrigger><SelectValue placeholder="Select Subject" /></SelectTrigger>
                      <SelectContent>
                        {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Responsible Teacher</Label>
                    <Select value={form.teacher_id} onValueChange={val => setForm({ ...form, teacher_id: val })}>
                      <SelectTrigger><SelectValue placeholder="Select Teacher" /></SelectTrigger>
                      <SelectContent>
                        {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.name || `${t.first_name} ${t.last_name}`}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="grid gap-2 col-span-1">
                    <Label>Date</Label>
                    <Input type="date" value={form.exam_date} onChange={e => setForm({ ...form, exam_date: e.target.value })} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Start Time</Label>
                    <Input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} />
                  </div>
                  <div className="grid gap-2">
                    <Label>End Time</Label>
                    <Input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Maximum Score (%)</Label>
                  <Input type="number" value={form.max_score} onChange={e => setForm({ ...form, max_score: Number(e.target.value) })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700">
                  {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Exam'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-none shadow-sm bg-indigo-50/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600"><CalendarDays className="w-5 h-5" /></div>
              <div>
                <p className="text-sm font-medium text-indigo-600/70">Total Scheduled</p>
                <p className="text-2xl font-bold text-indigo-900">{exams.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-green-50/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg text-green-600"><CheckCircle2 className="w-5 h-5" /></div>
              <div>
                <p className="text-sm font-medium text-green-600/70">Published</p>
                <p className="text-2xl font-bold text-green-900">{exams.filter(e => e.is_published).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-amber-50/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg text-amber-600"><Clock className="w-5 h-5" /></div>
              <div>
                <p className="text-sm font-medium text-amber-600/70">Pending Results</p>
                <p className="text-2xl font-bold text-amber-900">{exams.filter(e => !e.is_published).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg text-gray-600"><GraduationCap className="w-5 h-5" /></div>
              <div>
                <p className="text-sm font-medium text-gray-500">Grades Active</p>
                <p className="text-2xl font-bold text-gray-900">{grades.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <Card className="border-none shadow-sm overflow-hidden">
        <CardHeader className="bg-white border-b border-gray-100 py-4">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search by title or subject..."
                className="pl-10 bg-gray-50/50 border-gray-100 focus:bg-white"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <Select value={filterGradeId} onValueChange={setFilterGradeId}>
                <SelectTrigger className="w-full md:w-[150px] bg-white border-gray-200">
                  <SelectValue placeholder="Grade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Grades</SelectItem>
                  {grades.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterSectionId} onValueChange={setFilterSectionId} disabled={filterGradeId === 'all'}>
                <SelectTrigger className="w-full md:w-[150px] bg-white border-gray-200">
                  <SelectValue placeholder="Section" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sections</SelectItem>
                  {filterSections.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterSubjectId} onValueChange={setFilterSubjectId}>
                <SelectTrigger className="w-full md:w-[150px] bg-white border-gray-200">
                  <SelectValue placeholder="Subject" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Subjects</SelectItem>
                  {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setFilterGradeId('all'); setFilterSectionId('all'); setFilterSubjectId('all'); setSearchQuery(''); }}
                className="text-gray-400"
              >
                Clear
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-gray-50/50 text-[10px] uppercase font-bold tracking-wider text-gray-500">
              <TableRow>
                <TableHead className="pl-6">Exam Details</TableHead>
                <TableHead>Grade & Subject</TableHead>
                <TableHead>DateTime</TableHead>
                <TableHead>Teacher</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right pr-6 tracking-normal">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-40 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-300 mx-auto" />
                    <p className="text-sm text-gray-400 mt-2 font-medium">Loading exams...</p>
                  </TableCell>
                </TableRow>
              ) : filteredExams.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-40 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <AlertCircle className="w-8 h-8 text-gray-200" />
                      <p className="text-sm text-gray-400 font-medium">No exams found matching filters.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredExams.map((e) => (
                <TableRow key={e.id} className="group hover:bg-indigo-50/10 transition-colors">
                  <TableCell className="pl-6">
                    <div className="flex flex-col">
                      <span className="font-bold text-gray-900">{e.title}</span>
                      <div className="flex items-center gap-2 text-[10px] text-gray-400 uppercase font-black">
                        <span>ID: {e.id.split('-')[0]}</span>
                        <span>•</span>
                        <span>Max: {e.max_score}%</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant="outline" className="w-fit text-[10px] font-bold bg-indigo-50 border-indigo-100 text-indigo-700">
                        {grades.find(g => g.id === e.grade_id)?.name || 'Unknown Grade'}
                      </Badge>
                      <span className="text-sm font-medium text-gray-600 flex items-center gap-1">
                        <BookOpen className="w-3 h-3 text-gray-400" />
                        {subjects.find(s => s.id === e.subject_id)?.name || 'Unknown Subject'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col text-sm">
                      <div className="flex items-center gap-1 font-semibold text-gray-700">
                        <Calendar className="w-3 h-3 text-gray-400" />
                        {format(new Date(e.exam_date), 'MMM dd, yyyy')}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock className="w-3 h-3 text-gray-300" />
                        {e.start_time.substring(0, 5)} - {e.end_time.substring(0, 5)}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-[10px] font-black">
                        {(teachers.find(t => t.id === e.teacher_id)?.name || 'U').charAt(0)}
                      </div>
                      <span className="text-sm font-medium text-gray-700">
                        {teachers.find(t => t.id === e.teacher_id)?.name || 'Unassigned'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {e.is_published ? (
                        <Badge className="bg-green-100 text-green-700 border-none hover:bg-green-200 gap-1 px-2">
                          <CheckCircle2 className="w-3 h-3" /> Published
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-700 border-none hover:bg-amber-200 gap-1 px-2">
                          <Clock className="w-3 h-3" /> Scheduled
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right pr-6">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-8 text-xs font-bold gap-1.5 bg-indigo-600 text-white hover:bg-indigo-700"
                        onClick={() => onOpenMarksEntry(e)}
                      >
                        <Edit className="w-3 h-3" /> Marks
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 hover:text-indigo-600"
                        onClick={() => openEdit(e)}
                        disabled={isMutating}
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className={`h-8 w-8 ${e.is_published ? 'hover:text-amber-600' : 'hover:text-green-600'}`}
                        onClick={() => onPublishToggle(e)}
                        disabled={isMutating}
                      >
                        {(publishMutation.isPending || unpublishMutation.isPending) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
                          e.is_published ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 hover:text-red-600 hover:bg-red-50"
                        onClick={() => onDelete(e.id)}
                        disabled={isMutating}
                      >
                        {deleteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Exam Details</DialogTitle>
            <DialogDescription>Modify the schedule or details for this evaluation.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-title">Exam Title</Label>
              <Input id="edit-title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Grade</Label>
                <Select value={form.grade_id} onValueChange={val => setForm({ ...form, grade_id: val, section_id: '' })}>
                  <SelectTrigger><SelectValue placeholder="Select Grade" /></SelectTrigger>
                  <SelectContent>
                    {grades.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Section (Optional)</Label>
                <Select value={form.section_id} onValueChange={val => setForm({ ...form, section_id: val })} disabled={!form.grade_id}>
                  <SelectTrigger><SelectValue placeholder="All Sections" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sections</SelectItem>
                    {formSections.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Subject</Label>
                <Select value={form.subject_id} onValueChange={val => setForm({ ...form, subject_id: val })}>
                  <SelectTrigger><SelectValue placeholder="Select Subject" /></SelectTrigger>
                  <SelectContent>
                    {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Responsible Teacher</Label>
                <Select value={form.teacher_id} onValueChange={val => setForm({ ...form, teacher_id: val })}>
                  <SelectTrigger><SelectValue placeholder="Select Teacher" /></SelectTrigger>
                  <SelectContent>
                    {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.name || `${t.first_name} ${t.last_name}`}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2 col-span-1">
                <Label>Date</Label>
                <Input type="date" value={form.exam_date} onChange={e => setForm({ ...form, exam_date: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Start Time</Label>
                <Input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>End Time</Label>
                <Input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Maximum Score (%)</Label>
              <Input type="number" value={form.max_score} onChange={e => setForm({ ...form, max_score: Number(e.target.value) })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700">
              {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Marks Entry Dialog */}
      {selectedExamForMarks && (
        <MarksEntryDialog
          isOpen={isMarksEntryOpen}
          onClose={() => {
            setIsMarksEntryOpen(false);
            setSelectedExamForMarks(null);
          }}
          examId={selectedExamForMarks.id}
          examTitle={selectedExamForMarks.title}
          gradeId={selectedExamForMarks.grade_id}
          sectionId={selectedExamForMarks.section_id ?? null}
          subjectId={selectedExamForMarks.subject_id}
          academicYearId={academicYearId}
          maxScore={selectedExamForMarks.max_score ?? 100}
          assessmentDate={selectedExamForMarks.exam_date}
        />
      )}
    </div>
  );
}