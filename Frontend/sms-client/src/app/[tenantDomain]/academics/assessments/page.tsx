'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    ClipboardList,
    Plus,
    Search,
    Filter,
    Calendar,
    GraduationCap,
    BookOpen,
    MoreHorizontal,
    Edit,
    Trash2,
    CheckCircle,
    Clock,
    LayoutGrid,
    List,
    Eye,
    EyeOff
} from 'lucide-react';
import { useAssessmentService, GradeType, type Assessment } from '@/services/api/assessment-service';
import { useSubjectService } from '@/services/api/subject-service';
import { useTeacherService } from '@/services/api/teacher-service';
import { useAcademicGradeService } from '@/services/api/academic-grade-service';
import { useEnrollmentService } from '@/services/api/enrollment-service';
import { useSectionService } from '@/services/api/section-service';
import { MarksEntryDialog } from '@/components/grades/MarksEntryDialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';

export default function AssessmentsPage() {
    const assessmentService = useAssessmentService();
    const subjectService = useSubjectService();
    const teacherService = useTeacherService();
    const gradeService = useAcademicGradeService();
    const enrollmentService = useEnrollmentService();
    const sectionService = useSectionService();
    const { user } = useAuth();
    const isStudent = user?.role?.toLowerCase() === 'student';

    const [assessments, setAssessments] = useState<Assessment[]>([]);
    const [loading, setLoading] = useState(true);
    const [academicYearId, setAcademicYearId] = useState<string>('');

    // Support Data
    const [subjects, setSubjects] = useState<any[]>([]);
    const [teachers, setTeachers] = useState<any[]>([]);
    const [grades, setGrades] = useState<any[]>([]);
    const [filterSections, setFilterSections] = useState<any[]>([]);
    const [formSections, setFormSections] = useState<any[]>([]);

    // Filters
    const [filterSubject, setFilterSubject] = useState<string>('all');
    const [filterGrade, setFilterGrade] = useState<string>('all');
    const [filterSection, setFilterSection] = useState<string>('all');
    const [filterType, setFilterType] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');

    // Marks Entry
    const [isMarksEntryOpen, setIsMarksEntryOpen] = useState(false);
    const [selectedAssessmentForMarks, setSelectedAssessmentForMarks] = useState<Assessment | null>(null);

    // Create/Edit Dialog
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingAssessment, setEditingAssessment] = useState<Assessment | null>(null);
    const [form, setForm] = useState({
        title: '',
        description: '',
        type: GradeType.QUIZ,
        subject_id: '',
        teacher_id: '',
        grade_id: '',
        section_id: '',
        assessment_date: format(new Date(), 'yyyy-MM-dd'),
        max_score: 100,
    });

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [list, subs, trs, grs, ay] = await Promise.all([
                assessmentService.getAssessments({
                    subject_id: filterSubject !== 'all' ? filterSubject : undefined,
                    grade_id: filterGrade !== 'all' ? filterGrade : undefined,
                    section_id: filterSection !== 'all' ? filterSection : undefined,
                    academic_year_id: academicYearId || undefined,
                    is_published: isStudent ? true : undefined
                }),
                subjectService.getActiveSubjects(),
                teacherService.getTeachers(),
                gradeService.getGrades(),
                enrollmentService.getCurrentAcademicYear()
            ]);
            setAssessments(list || []);
            setSubjects(subs || []);
            setTeachers(trs || []);
            setGrades(grs || []);
            if (ay) setAcademicYearId(ay.id);
        } catch (error) {
            console.error('Failed to load assessments data', error);
            toast.error('Failed to load assessments');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData, filterSubject, filterGrade, filterSection, filterType, academicYearId]);

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
        if (filterGrade && filterGrade !== 'all') {
            sectionService.getSectionsByGrade(filterGrade).then(setFilterSections);
        } else {
            setFilterSections([]);
        }
        setFilterSection('all');
    }, [filterGrade, sectionService]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.title || !form.subject_id || !form.teacher_id || !form.grade_id) {
            toast.error('Please fill in all required fields');
            return;
        }

        try {
            if (editingAssessment) {
                await assessmentService.updateAssessment(editingAssessment.id, form as any);
                toast.success('Assessment updated successfully');
            } else {
                await assessmentService.createAssessment({
                    ...form,
                    academic_year_id: academicYearId,
                    is_published: true
                } as any);
                toast.success('Assessment created successfully');
            }
            setIsDialogOpen(false);
            setEditingAssessment(null);
            setForm({
                title: '',
                description: '',
                type: GradeType.QUIZ,
                subject_id: '',
                teacher_id: '',
                grade_id: '',
                section_id: '',
                assessment_date: format(new Date(), 'yyyy-MM-dd'),
                max_score: 100,
            });
            loadData();
        } catch (error) {
            console.error('Failed to save assessment', error);
            toast.error('Failed to save assessment');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this assessment?')) return;
        try {
            await assessmentService.deleteAssessment(id);
            toast.success('Assessment deleted');
            loadData();
        } catch (error) {
            toast.error('Failed to delete assessment');
        }
    };

    const handleTogglePublish = async (id: string, currentStatus: boolean) => {
        try {
            await assessmentService.updateAssessment(id, { is_published: !currentStatus });
            toast.success(`Assessment ${currentStatus ? 'unpublished' : 'published'} successfully`);
            loadData();
        } catch (error) {
            toast.error('Failed to update assessment status');
        }
    };

    const filteredAssessments = assessments.filter(a => {
        const matchesSearch = a.title.toLowerCase().includes(searchTerm.toLowerCase());
        // Service should handle these, but adding client-side guard
        const matchesType = filterType === 'all' || a.type === filterType;
        return matchesSearch && matchesType;
    });

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Assessments Hub</h1>
                    <p className="text-gray-600 mt-1">Manage quizzes, tests, projects, and custom evaluations</p>
                </div>
                {!isStudent && (
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <Button onClick={() => {
                                setEditingAssessment(null);
                                setForm({
                                    title: '',
                                    description: '',
                                    type: GradeType.QUIZ,
                                    subject_id: '',
                                    teacher_id: '',
                                    grade_id: '',
                                    section_id: '',
                                    assessment_date: format(new Date(), 'yyyy-MM-dd'),
                                    max_score: 100,
                                });
                            }}>
                                <Plus className="w-4 h-4 mr-2" />
                                New Assessment
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[525px]">
                            <DialogHeader>
                                <DialogTitle>{editingAssessment ? 'Edit Assessment' : 'Create New Assessment'}</DialogTitle>
                                <DialogDescription>
                                    Fill in the details for the assessment.
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleSave} className="space-y-4 pt-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="col-span-2 space-y-2">
                                        <Label htmlFor="title">Title</Label>
                                        <Input
                                            id="title"
                                            value={form.title}
                                            onChange={e => setForm({ ...form, title: e.target.value })}
                                            placeholder="e.g. Mid-term Quiz 1"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Type</Label>
                                        <Select
                                            value={form.type}
                                            onValueChange={(v: GradeType) => setForm({ ...form, type: v })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select type" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value={GradeType.QUIZ}>Quiz</SelectItem>
                                                <SelectItem value={GradeType.TEST}>Test</SelectItem>
                                                <SelectItem value={GradeType.PROJECT}>Project</SelectItem>
                                                <SelectItem value={GradeType.PARTICIPATION}>Participation</SelectItem>
                                                <SelectItem value={GradeType.OTHER}>Other</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="max_score">Max Score</Label>
                                        <Input
                                            id="max_score"
                                            type="number"
                                            value={form.max_score}
                                            onChange={e => setForm({ ...form, max_score: Number(e.target.value) })}
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Subject</Label>
                                        <Select
                                            value={form.subject_id}
                                            onValueChange={v => setForm({ ...form, subject_id: v })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select subject" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Grade Level</Label>
                                        <Select
                                            value={form.grade_id}
                                            onValueChange={v => setForm({ ...form, grade_id: v, section_id: '' })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select grade" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {grades.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Section (Optional)</Label>
                                        <Select
                                            value={form.section_id}
                                            onValueChange={v => setForm({ ...form, section_id: v })}
                                            disabled={!form.grade_id}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="All Sections" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All Sections</SelectItem>
                                                {formSections.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Teacher</Label>
                                        <Select
                                            value={form.teacher_id}
                                            onValueChange={v => setForm({ ...form, teacher_id: v })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select teacher" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.full_name || `${t.first_name} ${t.last_name}`}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="date">Assessment Date</Label>
                                        <Input
                                            id="date"
                                            type="date"
                                            value={form.assessment_date}
                                            onChange={e => setForm({ ...form, assessment_date: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2 pt-4">
                                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                                    <Button type="submit">Save Assessment</Button>
                                </div>
                            </form>
                        </DialogContent>
                    </Dialog>
                )}
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Filter className="w-4 h-4" />
                            Filters
                        </CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                                placeholder="Search assessments..."
                                className="pl-9"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <Select value={filterType} onValueChange={setFilterType}>
                            <SelectTrigger>
                                <SelectValue placeholder="All Types" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Types</SelectItem>
                                <SelectItem value={GradeType.QUIZ}>Quizzes</SelectItem>
                                <SelectItem value={GradeType.TEST}>Tests</SelectItem>
                                <SelectItem value={GradeType.PROJECT}>Projects</SelectItem>
                                <SelectItem value={GradeType.PARTICIPATION}>Participation</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={filterGrade} onValueChange={setFilterGrade}>
                            <SelectTrigger>
                                <SelectValue placeholder="All Grades" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Grades</SelectItem>
                                {grades.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Select value={filterSection} onValueChange={setFilterSection} disabled={filterGrade === 'all'}>
                            <SelectTrigger>
                                <SelectValue placeholder="All Sections" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Sections</SelectItem>
                                {filterSections.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Select value={filterSubject} onValueChange={setFilterSubject}>
                            <SelectTrigger>
                                <SelectValue placeholder="All Subjects" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Subjects</SelectItem>
                                {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {loading ? (
                <div className="flex justify-center p-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredAssessments.map(a => (
                        <Card key={a.id} className="overflow-hidden hover:shadow-md transition-shadow">
                            <div className="h-2 bg-primary" style={{ opacity: 0.8 }} />
                            <CardHeader className="pb-2">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <Badge variant="outline" className="mb-2 capitalize">
                                            {a.type}
                                        </Badge>
                                        <CardTitle className="text-xl">{a.title}</CardTitle>
                                        <CardDescription>{format(new Date(a.assessment_date), 'MMM dd, yyyy')}</CardDescription>
                                    </div>
                                    {!isStudent && (
                                        <div className="flex gap-1">
                                            <Button variant="ghost" size="icon" onClick={() => {
                                                setEditingAssessment(a);
                                                setForm({
                                                    title: a.title,
                                                    description: a.description || '',
                                                    type: a.type,
                                                    subject_id: a.subject_id,
                                                    teacher_id: a.teacher_id,
                                                    grade_id: a.grade_id,
                                                    section_id: a.section_id || '',
                                                    assessment_date: format(new Date(a.assessment_date), 'yyyy-MM-dd'),
                                                    max_score: a.max_score,
                                                });
                                                setIsDialogOpen(true);
                                            }}>
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleTogglePublish(a.id, a.is_published)}
                                                className={a.is_published ? 'text-amber-600' : 'text-emerald-600'}
                                            >
                                                {a.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </Button>
                                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(a.id)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div className="flex items-center gap-2 text-gray-600">
                                            <BookOpen className="h-4 w-4" />
                                            <span className="truncate">{subjects.find(s => s.id === a.subject_id)?.name || 'Subject'}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-gray-600">
                                            <GraduationCap className="h-4 w-4" />
                                            <span>{grades.find(g => g.id === a.grade_id)?.name || 'Grade'}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-gray-600">
                                            <ClipboardList className="h-4 w-4" />
                                            <span>Max: {a.max_score}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-gray-600">
                                            <Clock className="h-4 w-4" />
                                            <span>{a.is_published ? 'Published' : 'Draft'}</span>
                                        </div>
                                    </div>
                                    {!isStudent ? (
                                        <Button
                                            className="w-full bg-indigo-600 hover:bg-indigo-700"
                                            onClick={() => {
                                                setSelectedAssessmentForMarks(a);
                                                setIsMarksEntryOpen(true);
                                            }}
                                        >
                                            Record Marks
                                        </Button>
                                    ) : (
                                        <div className="pt-2 border-t border-slate-50">
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-slate-500">Status</span>
                                                <span className="font-bold text-slate-900 flex items-center gap-1">
                                                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                                                    Pending grading
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                    {filteredAssessments.length === 0 && (
                        <div className="col-span-full py-12 text-center text-gray-500">
                            <ClipboardList className="w-12 h-12 mx-auto mb-4 opacity-20" />
                            <p>No assessments found matching your criteria</p>
                        </div>
                    )}
                </div>
            )}

            {selectedAssessmentForMarks && (
                <MarksEntryDialog
                    isOpen={isMarksEntryOpen}
                    onClose={() => {
                        setIsMarksEntryOpen(false);
                        setSelectedAssessmentForMarks(null);
                    }}
                    examId={selectedAssessmentForMarks.id}
                    examTitle={selectedAssessmentForMarks.title}
                    gradeId={selectedAssessmentForMarks.grade_id}
                    sectionId={selectedAssessmentForMarks.section_id || null}
                    subjectId={selectedAssessmentForMarks.subject_id}
                    academicYearId={academicYearId}
                    maxScore={selectedAssessmentForMarks.max_score}
                    assessmentType={selectedAssessmentForMarks.type as any}
                    assessmentDate={selectedAssessmentForMarks.assessment_date}
                />
            )}
        </div>
    );
}
