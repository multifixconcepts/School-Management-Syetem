'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAssessmentService, AssessmentCreate } from '@/services/api/assessment-service';
import { useCategoriesStatus } from '@/hooks/queries/grading';
import { useCreateAssessment } from '@/hooks/queries/assessments';
import { GradingCategoryWithStatus } from '@/services/api/grading-service';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import { Loader2, ClipboardCheck, Award, FileQuestion, Users, Sparkles, PieChart, Info, Scale, CheckCircle2, Calendar } from 'lucide-react';
import { format, isWithinInterval, parseISO } from 'date-fns';
import { useSemesterService } from '@/services/api/semester-service';
import { usePeriodService, Period } from '@/services/api/period-service';

interface AssessmentCreatorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
    // Pre-fill options
    selectedSubjectId?: string;
    selectedGradeId?: string;
    selectedSectionId?: string;
    selectedAcademicYearId?: string;
    teacherId?: string;
    // Lookups
    subjects?: { id: string; name: string }[];
    classes?: any[]; // Full ClassWithDetails objects
    academicYears?: { id: string; name: string; is_current?: boolean }[];
}

// Fallback icons for different category names
const CATEGORY_ICON_MAP: Record<string, any> = {
    'Quiz': FileQuestion,
    'Test': ClipboardCheck,
    'Exam': Award,
    'Assignment': Sparkles,
    'Participation': Users,
    'Attendance': Users,
    'Project': Sparkles,
};

export function AssessmentCreatorModal({
    isOpen,
    onClose,
    onSuccess,
    selectedSubjectId,
    selectedGradeId,
    selectedSectionId,
    selectedAcademicYearId,
    teacherId,
    subjects = [],
    classes = [],
    academicYears = [],
}: AssessmentCreatorModalProps) {
    const createAssessment = useCreateAssessment();
    const { user } = useAuth();
    const semesterService = useSemesterService();
    const periodService = usePeriodService();

    const isTeacher = user?.role?.toLowerCase() === 'teacher' ||
        (user?.roles && user.roles.some((r: any) => r.name.toLowerCase() === 'teacher'));
    const isAdmin = !isTeacher && (
        user?.role?.toLowerCase() === 'admin' ||
        user?.role?.toLowerCase() === 'superadmin' ||
        (user?.roles && user.roles.some((r: any) =>
            ['admin', 'superadmin', 'super-admin', 'principal', 'dean'].includes(r.name.toLowerCase())
        ))
    );

    // Form state
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [subjectId, setSubjectId] = useState(selectedSubjectId || '');
    const [classId, setClassId] = useState('');
    const [academicYearId, setAcademicYearId] = useState(selectedAcademicYearId || '');
    const [assessmentDate, setAssessmentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [maxScore, setMaxScore] = useState('100');
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
    const [allPeriods, setAllPeriods] = useState<Period[]>([]);
    const [periodsLoading, setPeriodsLoading] = useState(false);
    const selectedClass = classes.find((c: any) => c.id === classId);

    // Filter subjects to only those assigned to the teacher for this specific class
    const availableSubjects = useMemo(() => {
        if (!selectedClass) return [];

        const classSubjects = selectedClass.subjects || [];

        // If user is a teacher, only show their subjects
        if (isTeacher && teacherId) {
            return classSubjects
                .filter((cs: any) => cs.teacher_id === teacherId)
                .map((cs: any) => ({
                    id: cs.subject_id,
                    name: cs.subject_name || cs.subject?.name || 'Unknown Subject',
                    teacher_id: cs.teacher_id
                }));
        }

        // For admins or others, show all subjects in the class
        return classSubjects.map((cs: any) => ({
            id: cs.subject_id,
            name: cs.subject_name || cs.subject?.name || 'Unknown Subject',
            teacher_id: cs.teacher_id
        }));
    }, [selectedClass, teacherId, isTeacher]);


    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            setTitle('');
            setDescription('');
            // Only use selectedSubjectId if it's in the available subjects for the (potential) class
            setSubjectId(selectedSubjectId || '');
            setAcademicYearId(selectedAcademicYearId || '');
            setAssessmentDate(format(new Date(), 'yyyy-MM-dd'));
            setMaxScore('100');
            setSelectedCategoryId('');

            // Set default class if only one
            if (classes.length === 1) {
                setClassId(classes[0].id);
            } else {
                setClassId('');
            }

            // Set current academic year by default
            const current = academicYears.find(ay => ay.is_current);
            if (current && !selectedAcademicYearId) {
                setAcademicYearId(current.id);
            }
        }
    }, [isOpen, selectedSubjectId, selectedAcademicYearId, classes, academicYears]);

    // Fetch all periods for the year to provide real-time validation
    useEffect(() => {
        const fetchYearStructure = async () => {
            if (!academicYearId || !isOpen) return;

            setPeriodsLoading(true);
            try {
                const semesters = await semesterService.getSemesters(academicYearId);
                const allFetchedPeriods: Period[] = [];

                await Promise.all(semesters.map(async (sem) => {
                    const ps = await periodService.getPeriods(sem.id);
                    allFetchedPeriods.push(...ps);
                }));

                setAllPeriods(allFetchedPeriods);
            } catch (error) {
                console.warn('Failed to fetch academic year structure for period detection');
            } finally {
                setPeriodsLoading(false);
            }
        };

        fetchYearStructure();
    }, [academicYearId, isOpen, semesterService, periodService]);

    const activePeriod = useMemo(() => {
        if (!assessmentDate || allPeriods.length === 0) return null;

        try {
            const date = parseISO(assessmentDate);
            return allPeriods.find(p =>
                isWithinInterval(date, {
                    start: parseISO(p.start_date),
                    end: parseISO(p.end_date)
                })
            );
        } catch (e) {
            return null;
        }
    }, [assessmentDate, allPeriods]);

    // Fetch dynamic categories for the selected class and subject
    // We move this here so it can use activePeriod.id
    const { data: categories = [], isLoading: categoriesLoading } = useCategoriesStatus(classId, subjectId, activePeriod?.id);

    // Update subject if it's not in the available subjects list for the selected class
    useEffect(() => {
        if (classId && availableSubjects.length > 0) {
            const isPayloadValid = availableSubjects.find((s: any) => s.id === subjectId);
            if (!isPayloadValid) {
                // Auto-select first subject if teacher only has one in this class
                if (availableSubjects.length === 1) {
                    setSubjectId(availableSubjects[0].id);
                } else if (!selectedSubjectId) {
                    setSubjectId('');
                }
            }
        }
    }, [classId, availableSubjects, subjectId, selectedSubjectId]);

    // Auto-select first category when they load
    useEffect(() => {
        if (categories.length > 0 && !selectedCategoryId) {
            setSelectedCategoryId(categories[0].id);
        }
    }, [categories, selectedCategoryId]);

    const selectedCategory = categories.find((c: any) => c.id === selectedCategoryId);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!title.trim()) {
            toast.error('Please enter a title');
            return;
        }
        if (!subjectId) {
            toast.error('Please select a subject');
            return;
        }
        if (!classId || !selectedClass) {
            toast.error('Please select a class');
            return;
        }
        if (!selectedCategoryId || !selectedCategory) {
            toast.error('Please select an assessment type (Grading Category)');
            return;
        }
        if (!academicYearId) {
            toast.error('Please select an academic year');
            return;
        }
        if (!teacherId) {
            toast.error('Teacher ID not found');
            return;
        }

        const scoreNum = parseInt(maxScore);
        if (scoreNum > selectedCategory.remaining_marks) {
            toast.error(`Max score (${scoreNum}) exceeds remaining marks in category (${selectedCategory.remaining_marks})`);
            return;
        }

        // Find the selected subject in availableSubjects to get its teacher_id
        const selectedSubject = availableSubjects.find((s: any) => s.id === subjectId);
        const resolvedTeacherId = (isAdmin && selectedSubject?.teacher_id) ? selectedSubject.teacher_id : (teacherId || user?.id);

        if (!resolvedTeacherId) {
            toast.error('Teacher ID could not be resolved');
            return;
        }

        const payload: AssessmentCreate = {
            title: title.trim(),
            description: description.trim() || undefined,
            type: (selectedCategory.name.toUpperCase() as any),
            subject_id: subjectId,
            teacher_id: resolvedTeacherId,
            academic_year_id: academicYearId,
            grade_id: selectedClass.grade_id,
            section_id: selectedClass.section_id,
            class_id: classId,
            grading_category_id: selectedCategoryId,
            assessment_date: assessmentDate,
            max_score: scoreNum || 100,
            is_published: true,
        };

        createAssessment.mutate(payload, {
            onSuccess: () => {
                toast.success(`${selectedCategory.name} created successfully!`);
                onSuccess?.();
                onClose();
            },
            onError: (error: any) => {
                console.error('Failed to create assessment:', error);
                toast.error(error?.message || 'Failed to create assessment');
            }
        });
    };


    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[800px] flex flex-col md:flex-row gap-0 overflow-hidden p-0 rounded-2xl border-none">
                {/* Visual Grading Schema Panel */}
                <div className="md:w-[300px] bg-slate-50 border-r border-slate-100 p-6 flex flex-col gap-6">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Scale className="w-5 h-5 text-indigo-600" />
                            <h3 className="font-bold text-slate-800">Grading Scheme</h3>
                        </div>
                        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                            How this subject's results are distributed across the academic year.
                        </p>

                        {!classId || !subjectId ? (
                            <div className="py-12 flex flex-col items-center justify-center text-center px-4 bg-white/50 rounded-xl border border-dashed border-slate-200">
                                <Info className="w-8 h-8 text-slate-300 mb-2" />
                                <p className="text-[10px] font-medium text-slate-400">Select class and subject to view the scheme</p>
                            </div>
                        ) : categoriesLoading ? (
                            <div className="flex flex-col gap-4">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="h-10 bg-slate-200 animate-pulse rounded-lg" />
                                ))}
                            </div>
                        ) : categories.length > 0 ? (
                            <div className="space-y-4">
                                {categories.map(cat => (
                                    <div key={cat.id} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm relative overflow-hidden group">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs font-bold text-slate-700">{cat.name}</span>
                                            <Badge variant="secondary" className="text-[10px] bg-indigo-50 text-indigo-700 hover:bg-indigo-50 border-none px-1.5 h-4 font-bold">
                                                {cat.weight}%
                                            </Badge>
                                        </div>
                                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-1.5">
                                            <div
                                                className={`h-full transition-all duration-500 ${cat.remaining_marks <= 0 ? 'bg-amber-400' : 'bg-indigo-500'}`}
                                                style={{ width: `${(cat.allocated_marks / cat.weight) * 100}%` }}
                                            />
                                        </div>
                                        <div className="flex justify-between items-center text-[10px]">
                                            <span className="text-slate-400">Used: {cat.allocated_marks} pts</span>
                                            <span className={`font-bold ${cat.remaining_marks <= 0 ? 'text-amber-500' : 'text-slate-400'}`}>
                                                {cat.remaining_marks} left
                                            </span>
                                        </div>

                                        {cat.remaining_marks <= 0 && (
                                            <div className="absolute top-0 right-0 p-1">
                                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-700">
                                <p className="text-[10px] font-bold">No scheme found for this entry.</p>
                            </div>
                        )}
                    </div>

                    {/* Total Summary */}
                    <div className="mt-auto pt-6 border-t border-slate-200">
                        <div className="flex justify-between items-center bg-slate-900 p-3 rounded-xl text-white shadow-lg">
                            <span className="text-xs font-medium text-slate-400">Total Weight</span>
                            <span className="text-lg font-black text-indigo-400">
                                {categories.reduce((acc, curr) => acc + curr.weight, 0)}%
                            </span>
                        </div>
                    </div>
                </div>

                {/* Form Content Side */}
                <div className="flex-1 p-6 md:p-8 max-h-[90vh] overflow-y-auto">
                    <DialogHeader className="mb-6">
                        <DialogTitle className="flex items-center gap-2 text-xl">
                            <div className="p-2 bg-indigo-100 rounded-lg">
                                {selectedCategory ? (
                                    <div className="relative">
                                        {React.createElement(CATEGORY_ICON_MAP[selectedCategory.name] || Award, { className: "w-5 h-5 text-indigo-600" })}
                                    </div>
                                ) : (
                                    <Award className="w-5 h-5 text-indigo-600" />
                                )}
                            </div>
                            Create New Assessment
                        </DialogTitle>
                        <DialogDescription className="text-sm">
                            Select a grading category and define your assessment details.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Dynamic Assessment Type Selection */}
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Assessment Type</Label>
                                {classId && subjectId && (
                                    <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-100/50">
                                        <PieChart className="w-3 h-3" />
                                        Dynamic Scoring
                                    </div>
                                )}
                            </div>

                            {categoriesLoading ? (
                                <div className="flex items-center justify-center py-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin text-indigo-400" />
                                    <span className="text-xs font-medium text-slate-400">Syncing with grading scheme...</span>
                                </div>
                            ) : categories.length > 0 ? (
                                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
                                    {categories.map(cat => {
                                        const Icon = CATEGORY_ICON_MAP[cat.name] || FileQuestion;
                                        const isSelected = selectedCategoryId === cat.id;
                                        const isFull = cat.remaining_marks <= 0;

                                        return (
                                            <button
                                                key={cat.id}
                                                type="button"
                                                disabled={isFull && !isSelected}
                                                className={`p-3 rounded-2xl border-2 flex flex-col items-start gap-1.5 transition-all relative overflow-hidden group ${isSelected
                                                    ? 'border-indigo-600 bg-indigo-50/50 text-indigo-700 shadow-sm'
                                                    : isFull
                                                        ? 'border-slate-100 bg-slate-50 text-slate-400 opacity-60 cursor-not-allowed'
                                                        : 'border-slate-200 hover:border-indigo-300 text-slate-600 hover:bg-white'
                                                    }`}
                                                onClick={() => setSelectedCategoryId(cat.id)}
                                            >
                                                <div className="flex items-center gap-2 w-full">
                                                    <div className={`p-1.5 rounded-lg ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-600'}`}>
                                                        <Icon className="w-3.5 h-3.5" />
                                                    </div>
                                                    <span className="text-xs font-black uppercase tracking-tight truncate">{cat.name}</span>
                                                </div>

                                                <div className="w-full pt-1 border-t border-slate-100/50">
                                                    <div className="flex justify-between text-[9px] uppercase tracking-widest font-black opacity-40">
                                                        <span>Weight</span>
                                                        <span>{cat.weight}%</span>
                                                    </div>
                                                </div>

                                                {/* Progress bar background indicator */}
                                                <div className="absolute bottom-0 left-0 h-1 bg-indigo-600/10 w-full" />
                                                <div className="absolute bottom-0 left-0 h-1 bg-indigo-600 transition-all duration-500" style={{ width: `${(cat.allocated_marks / cat.weight) * 100}%` }} />
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : classId && subjectId ? (
                                <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-700">
                                    <div className="p-2 bg-white rounded-xl shadow-sm">
                                        <Scale className="w-4 h-4 text-rose-500" />
                                    </div>
                                    <p className="text-xs font-bold leading-tight">
                                        Universal grading scheme not found for this academic year.
                                    </p>
                                </div>
                            ) : (
                                <div className="p-4 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-center">
                                    <p className="text-xs font-medium text-slate-400">Identify class and subject to link assessment types</p>
                                </div>
                            )}
                        </div>

                        {/* Assessment Identity Section */}
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="title" className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">Assessment Name</Label>
                                <Input
                                    id="title"
                                    placeholder={selectedCategory ? `e.g., Chapter 5 ${selectedCategory.name}` : "e.g., Midterm Project"}
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className="h-12 rounded-2xl border-slate-200 bg-white font-bold text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all text-base px-6 shadow-sm"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description" className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Context & Instructions</Label>
                                <Textarea
                                    id="description"
                                    placeholder="Add any specific guidelines for students..."
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={3}
                                    className="rounded-2xl border-slate-200 bg-white font-medium text-slate-600 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all px-6 py-4 resize-none shadow-sm"
                                />
                            </div>
                        </div>

                        {/* Split Logic & Scoring - Professional Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Users className="w-4 h-4 text-indigo-500" />
                                    <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Target Audience</Label>
                                </div>
                                <div className="space-y-3">
                                    <Select value={classId} onValueChange={setClassId}>
                                        <SelectTrigger className="h-12 rounded-2xl bg-slate-50 border-none px-6 font-bold text-slate-700 shadow-inner">
                                            <SelectValue placeholder="Select Class" />
                                        </SelectTrigger>
                                        <SelectContent className="rounded-2xl border-indigo-100 shadow-2xl">
                                            {classes.map(c => (
                                                <SelectItem key={c.id} value={c.id} className="rounded-xl py-3 px-4 focus:bg-indigo-50 cursor-pointer">
                                                    {c.grade_name} - {c.section_name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Select value={subjectId} onValueChange={setSubjectId} disabled={!classId || availableSubjects.length === 0}>
                                        <SelectTrigger className="h-12 rounded-2xl bg-slate-50 border-none px-6 font-bold text-slate-700 shadow-inner">
                                            <SelectValue placeholder={!classId ? "Select Audience First" : "Select Subject"} />
                                        </SelectTrigger>
                                        <SelectContent className="rounded-2xl border-indigo-100 shadow-2xl">
                                            {availableSubjects.map((s: any) => (
                                                <SelectItem key={s.id} value={s.id} className="rounded-xl py-3 px-4 focus:bg-indigo-50 cursor-pointer">
                                                    {s.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-4 p-2 bg-slate-900 rounded-[2.2rem] text-white shadow-2xl relative overflow-hidden group">
                                <div className="absolute -right-4 -top-4 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/20 transition-all duration-700" />

                                <div className="flex justify-between items-center mb-1">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center border border-white/10 shadow-inner">
                                            <Award className="w-4 h-4 text-indigo-400" />
                                        </div>
                                        <div>
                                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 leading-none">Scoring Model</span>
                                        </div>
                                    </div>
                                    {selectedCategory && (
                                        <div className="px-3 py-1 bg-white/5 rounded-lg border border-white/10">
                                            <span className="text-[10px] font-black text-indigo-300 uppercase tracking-tighter">
                                                {selectedCategory.remaining_marks} PTS LIMIT
                                            </span>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-4">
                                    <div className="relative group/score">
                                        <Input
                                            id="maxScore"
                                            type="number"
                                            min="1"
                                            max={selectedCategory?.remaining_marks || 1000}
                                            value={maxScore}
                                            onChange={(e) => setMaxScore(e.target.value)}
                                            placeholder="00"
                                            className={`h-22 w-full bg-white/5 border-none rounded-[1.5rem] text-6xl font-black focus:ring-2 focus:ring-indigo-500 transition-all text-center placeholder:text-slate-900 ${selectedCategory && parseInt(maxScore) > selectedCategory.remaining_marks ? 'text-rose-400' : 'text-white'}`}
                                        />
                                        <div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col items-center opacity-20 group-hover/score:opacity-100 transition-opacity">
                                            <span className="text-[8px] font-black text-indigo-400 uppercase tracking-[0.4em] [writing-mode:vertical-rl] py-2 border-l border-white/10 pl-3">Points</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-5 bg-white/5 p-5 rounded-[1.5rem] border border-white/5 group/date relative overflow-hidden hover:bg-white/10 transition-colors">
                                        <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 shadow-lg group-hover/date:bg-indigo-500/20 transition-colors">
                                            <Calendar className="w-6 h-6 text-indigo-400" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex justify-between items-center mb-1">
                                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Target Date</p>
                                                {activePeriod && (
                                                    <Badge variant="outline" className="text-[9px] font-black border-indigo-500/30 text-indigo-400 bg-indigo-500/5 px-1.5 h-4 uppercase tracking-tighter">
                                                        {activePeriod.name}
                                                    </Badge>
                                                )}
                                                {!activePeriod && !periodsLoading && assessmentDate && (
                                                    <Badge variant="outline" className="text-[9px] font-black border-rose-500/30 text-rose-400 bg-rose-500/5 px-1.5 h-4 uppercase tracking-tighter">
                                                        Outside Periods
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="relative">
                                                <Input
                                                    id="date"
                                                    type="date"
                                                    value={assessmentDate}
                                                    onChange={(e) => setAssessmentDate(e.target.value)}
                                                    className="h-7 border-none bg-transparent p-0 text-white font-black text-xl focus:ring-0 cursor-pointer w-full [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Multi-Year Selection (Rare) */}
                        {academicYears.length > 1 && (
                            <div className="flex items-center justify-between px-6 py-4 bg-indigo-50/30 rounded-2xl border border-indigo-100/50">
                                <div className="flex items-center gap-2">
                                    <Scale className="w-4 h-4 text-indigo-400" />
                                    <p className="text-[10px] font-black text-indigo-900/60 uppercase tracking-widest">Active Era</p>
                                </div>
                                <Select value={academicYearId} onValueChange={setAcademicYearId}>
                                    <SelectTrigger className="h-6 w-auto border-none bg-transparent p-0 text-indigo-900 font-bold focus:ring-0">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl border-indigo-100 shadow-xl">
                                        {academicYears.map(ay => (
                                            <SelectItem key={ay.id} value={ay.id} className="text-xs font-bold">
                                                {ay.name} {ay.is_current ? '• Current' : ''}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        <DialogFooter className="pt-8 flex flex-col-reverse sm:flex-row gap-3 border-t border-slate-100">
                            <Button type="button" variant="ghost" onClick={onClose} disabled={createAssessment.isPending} className="text-slate-400 font-bold hover:bg-slate-50 uppercase tracking-[0.2em] text-[10px] h-14 px-8 rounded-2xl transition-all">
                                Discard
                            </Button>
                            <Button
                                type="submit"
                                disabled={createAssessment.isPending || (!!selectedCategory && parseInt(maxScore) > selectedCategory.remaining_marks)}
                                className="bg-slate-900 hover:bg-indigo-600 text-white px-10 rounded-2xl h-14 font-black uppercase tracking-[0.2em] text-xs transition-all shadow-xl hover:shadow-indigo-500/20 active:scale-[0.98] flex-1 sm:flex-none"
                            >
                                {createAssessment.isPending ? 'Propagating...' : 'Establish Assessment'}
                            </Button>
                        </DialogFooter>
                    </form>
                </div>
            </DialogContent >
        </Dialog >
    );
}
