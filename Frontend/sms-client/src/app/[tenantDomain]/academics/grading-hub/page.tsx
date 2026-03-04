'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useClassService } from '@/services/api/class-service';
import { useExamService } from '@/services/api/exam-service';
import { useAssignmentService } from '@/services/api/assignment-service';
import { useAssessmentService, GradeType } from '@/services/api/assessment-service';
import { useSubjectService } from '@/services/api/subject-service';
import { useEnrollmentService } from '@/services/api/enrollment-service';
import { useStudentGradeService } from '@/services/api/student-grade-service';
import { useGradingService, GradingSchema } from '@/services/api/grading-service';
import { useAuth } from '@/hooks/use-auth';
import { usePeriodService } from '@/services/api/period-service';
import { useSemesterService } from '@/services/api/semester-service';
import { useGradableActivities, useClassPerformance, useSemesters, usePeriods } from '@/hooks/queries/grading-hub';
import { useGradingSchemas } from '@/hooks/queries/grading';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    ClipboardList,
    BookOpen,
    Users,
    Search,
    Filter,
    RefreshCw,
    CheckCircle2,
    AlertCircle,
    GraduationCap,
    Calendar,
    LayoutGrid,
    ListChecks,
    TrendingUp,
    PieChart,
    User,
    ChevronDown,
    ChevronUp,
    Scale,
    Info,
    Plus
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { MarksEntryDialog } from '@/components/grades/MarksEntryDialog';
import { AssessmentCreatorModal } from '@/components/grades/AssessmentCreatorModal';
import { format } from 'date-fns';

interface GradableActivity {
    id: string;
    title: string;
    type: string;
    date: string;
    subjectId: string;
    gradeId: string;
    sectionId?: string;
    maxScore: number;
    source: 'exam' | 'assignment' | 'assessment';
    gradedCount?: number;
    totalCount?: number;
}

export default function GradingHubPage() {
    const classService = useClassService();
    const examService = useExamService();
    const assignmentService = useAssignmentService();
    const assessmentService = useAssessmentService();
    const subjectService = useSubjectService();
    const enrollmentService = useEnrollmentService();
    const gradeService = useStudentGradeService();
    const gradingService = useGradingService();
    const periodService = usePeriodService();
    const semesterService = useSemesterService();
    const { user } = useAuth();

    const [academicYears, setAcademicYears] = useState<any[]>([]);
    const [classes, setClasses] = useState<any[]>([]);
    const [subjects, setSubjects] = useState<any[]>([]);
    const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('');
    const [selectedClassId, setSelectedClassId] = useState<string>('all');
    const [selectedSubjectId, setSelectedSubjectId] = useState<string>('all');

    // Period & Semester Selection State
    const [selectedSemesterId, setSelectedSemesterId] = useState<string>('all');
    const [selectedPeriodId, setSelectedPeriodId] = useState<string>('all');

    const [searchTerm, setSearchTerm] = useState('');

    // Marks Entry Dialog state
    const [isMarksEntryOpen, setIsMarksEntryOpen] = useState(false);
    const [selectedActivity, setSelectedActivity] = useState<GradableActivity | null>(null);

    // Unified Grading Hub hooks
    const { data: semesters = [] } = useSemesters(selectedAcademicYear);
    const { data: periods = [] } = usePeriods(selectedSemesterId);

    const {
        data: activities = [],
        isLoading: activitiesLoading,
        refetch: refetchActivities
    } = useGradableActivities({
        academic_year_id: selectedAcademicYear,
        subject_id: selectedSubjectId,
        teacher_id: user?.role?.toLowerCase() === 'teacher' ? user?.id : undefined,
        period_id: selectedPeriodId,
        semester_id: selectedSemesterId,
    });

    const {
        data: performanceData = [],
        isLoading: performanceLoading,
        refetch: refetchPerformance
    } = useClassPerformance(selectedClassId, selectedSubjectId, selectedAcademicYear, classes, selectedPeriodId, selectedSemesterId);

    const { data: gradingSchemas = [] } = useGradingSchemas();
    const [showSchemaPanel, setShowSchemaPanel] = useState(false);

    // Assessment Creator Modal state
    const [isAssessmentModalOpen, setIsAssessmentModalOpen] = useState(false);

    const loadInitialData = async () => {
        try {
            const isTeacher = user?.role?.toLowerCase() === 'teacher';
            const teacherId = isTeacher ? user?.id : undefined;

            const [ayList, clsList, subList] = await Promise.all([
                enrollmentService.getAcademicYears(),
                classService.getClasses({ teacher_id: teacherId }),
                subjectService.getActiveSubjects(),
            ]);

            setAcademicYears(ayList || []);
            setClasses(clsList || []);
            setSubjects(subList || []);

            const current = (ayList || []).find((ay: any) => ay.is_current);
            if (current) setSelectedAcademicYear(current.id);
        } catch (err) {
            toast.error('Failed to load initial configuration');
        }
    };

    useEffect(() => {
        loadInitialData();
    }, []);

    // Selection resets
    useEffect(() => {
        if (selectedAcademicYear) {
            setSelectedSemesterId('all');
        }
    }, [selectedAcademicYear]);

    useEffect(() => {
        if (selectedSemesterId) {
            setSelectedPeriodId('all');
        }
    }, [selectedSemesterId]);


    // Use hooks for activities data fetching - no longer need manual fetch effects

    const filteredActivities = useMemo(() => {
        if (!searchTerm) return activities;
        return activities.filter(a =>
            a.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            a.type.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [activities, searchTerm]);

    const handleOpenMarksEntry = (activity: GradableActivity) => {
        setSelectedActivity(activity);
        setIsMarksEntryOpen(true);
    };

    return (
        <div className="p-6 space-y-6 bg-gray-50/30 min-h-screen">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-indigo-950 flex items-center gap-2">
                        <ListChecks className="w-8 h-8 text-indigo-600" />
                        Unified Grading Hub
                    </h1>
                    <p className="text-muted-foreground">Central command for recording student marks across all assessment types.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        className="gap-2 bg-indigo-600 hover:bg-indigo-700"
                        onClick={() => setIsAssessmentModalOpen(true)}
                    >
                        <Plus className="w-4 h-4" /> Create Assessment
                    </Button>
                    <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => { refetchActivities(); refetchPerformance(); }}
                        disabled={activitiesLoading || performanceLoading}
                    >
                        <RefreshCw className={`w-4 h-4 ${activitiesLoading || performanceLoading ? 'animate-spin' : ''}`} /> Sync Data
                    </Button>
                </div>
            </div>

            {/* Filters */}
            <Card className="border-none shadow-sm">
                <CardContent className="pt-6">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex-1 min-w-[200px]">
                            <Label className="text-[10px] uppercase font-bold text-gray-400 mb-1.5 block">Academic Year</Label>
                            <Select value={selectedAcademicYear} onValueChange={setSelectedAcademicYear}>
                                <SelectTrigger><SelectValue placeholder="Select Year" /></SelectTrigger>
                                <SelectContent>
                                    {academicYears.map(ay => <SelectItem key={ay.id} value={ay.id}>{ay.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex-1 min-w-[220px]">
                            <Label className="text-[10px] uppercase font-bold text-gray-400 mb-1.5 block">Class / Section</Label>
                            <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                                <SelectTrigger><SelectValue placeholder="All Classes" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Available Classes</SelectItem>
                                    {classes.map(c => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {c.grade_name} - {c.section_name} | {c.subject_name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex-1 min-w-[200px]">
                            <Label className="text-[10px] uppercase font-bold text-gray-400 mb-1.5 block">Subject Filter</Label>
                            <Select value={selectedSubjectId} onValueChange={setSelectedSubjectId}>
                                <SelectTrigger><SelectValue placeholder="All Subjects" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All My Subjects</SelectItem>
                                    {(() => {
                                        // Filter subjects to only those taught by the teacher in their assigned classes
                                        const teacherSubjectIds = new Set(classes.flatMap(c => c.subjects?.map((cs: any) => cs.subject_id) || [c.subject_id]));
                                        return subjects
                                            .filter(s => teacherSubjectIds.has(s.id))
                                            .map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>);
                                    })()}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex-1 min-w-[150px]">
                            <Label className="text-[10px] uppercase font-bold text-gray-400 mb-1.5 block">Semester</Label>
                            <Select value={selectedSemesterId} onValueChange={setSelectedSemesterId}>
                                <SelectTrigger><SelectValue placeholder="All Semesters" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Full Academic Year</SelectItem>
                                    {semesters.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex-1 min-w-[150px]">
                            <Label className="text-[10px] uppercase font-bold text-gray-400 mb-1.5 block">Period</Label>
                            <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId}>
                                <SelectTrigger><SelectValue placeholder="All Periods" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Full Semester</SelectItem>
                                    {periods.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex-[2] min-w-[300px]">
                            <Label className="text-[10px] uppercase font-bold text-gray-400 mb-1.5 block">Search Activity</Label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <Input
                                    placeholder="Search by title or type..."
                                    className="pl-10"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Grading Scheme Panel - Collapsible */}
            {gradingSchemas.length > 0 && (
                <Card className="border-none shadow-sm">
                    <CardHeader
                        className="py-3 cursor-pointer hover:bg-gray-50/50 transition-colors"
                        onClick={() => setShowSchemaPanel(!showSchemaPanel)}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-100 rounded-lg">
                                    <Scale className="w-4 h-4 text-indigo-600" />
                                </div>
                                <div>
                                    <CardTitle className="text-base flex items-center gap-2">
                                        Grading Scheme
                                        <Badge variant="secondary" className="text-[10px] font-bold">
                                            {gradingSchemas.length} Schema{gradingSchemas.length > 1 ? 's' : ''}
                                        </Badge>
                                    </CardTitle>
                                    <CardDescription className="text-xs">
                                        How student grades are weighted and calculated
                                    </CardDescription>
                                </div>
                            </div>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                {showSchemaPanel ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </Button>
                        </div>
                    </CardHeader>
                    {showSchemaPanel && (
                        <CardContent className="pt-0 pb-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {gradingSchemas.filter(s => s.is_active).map(schema => (
                                    <div key={schema.id} className="bg-gray-50/70 rounded-xl p-4 border border-gray-100">
                                        <div className="flex items-center gap-2 mb-3">
                                            <GraduationCap className="w-4 h-4 text-indigo-600" />
                                            <span className="font-bold text-sm text-gray-800">{schema.name}</span>
                                        </div>
                                        {schema.description && (
                                            <p className="text-xs text-gray-500 mb-3 flex items-center gap-1.5">
                                                <Info className="w-3 h-3" />
                                                {schema.description}
                                            </p>
                                        )}
                                        <div className="space-y-2">
                                            {schema.categories.map(cat => (
                                                <div key={cat.id} className="flex items-center gap-2">
                                                    <span className="text-xs font-medium text-gray-600 w-24 truncate">{cat.name}</span>
                                                    <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full transition-all"
                                                            style={{ width: `${cat.weight}%` }}
                                                        />
                                                    </div>
                                                    <Badge variant="outline" className="text-[10px] font-bold min-w-[40px] justify-center">
                                                        {cat.weight}%
                                                    </Badge>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="mt-3 pt-2 border-t border-gray-200/50">
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="font-medium text-gray-500">Total Weight</span>
                                                <span className={`font-bold ${schema.categories.reduce((a, c) => a + c.weight, 0) === 100 ? 'text-green-600' : 'text-amber-600'}`}>
                                                    {schema.categories.reduce((a, c) => a + c.weight, 0)}%
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    )}
                </Card>
            )}

            {/* Content Tabs */}
            <Tabs defaultValue="activities" className="w-full">
                <TabsList className="bg-white border rounded-lg p-1 h-12">
                    <TabsTrigger value="activities" className="px-6 data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">
                        <ClipboardList className="w-4 h-4 mr-2" />
                        Gradable Activities
                    </TabsTrigger>
                    <TabsTrigger value="performance" className="px-6 data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">
                        <TrendingUp className="w-4 h-4 mr-2" />
                        Performance Summary
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="activities" className="mt-6">
                    <Card className="border-none shadow-sm overflow-hidden">
                        <CardHeader className="bg-white border-b border-gray-100 py-4 flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <ClipboardList className="w-5 h-5 text-indigo-500" />
                                    Active Gradables
                                </CardTitle>
                                <CardDescription>Assignments, Exams, and Assessments requiring grade entry.</CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader className="bg-gray-50/50">
                                    <TableRow>
                                        <TableHead className="pl-6">Activity Title</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Subject</TableHead>
                                        <TableHead>Due/Exam Date</TableHead>
                                        <TableHead className="text-center">Max Score</TableHead>
                                        <TableHead className="text-right pr-6">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {activitiesLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-40 text-center text-muted-foreground">
                                                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 opacity-20" />
                                                Finding gradable items...
                                            </TableCell>
                                        </TableRow>
                                    ) : filteredActivities.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-40 text-center text-muted-foreground">
                                                <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                                No gradable activities found for the selected criteria.
                                            </TableCell>
                                        </TableRow>
                                    ) : filteredActivities.map(activity => (
                                        <TableRow key={`${activity.source}-${activity.id}`} className="hover:bg-gray-50/50 transition-colors group">
                                            <TableCell className="pl-6 font-medium">
                                                {activity.title}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="capitalize text-[10px] font-bold">
                                                    {activity.type}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2 text-xs text-gray-600">
                                                    <BookOpen className="w-3 h-3" />
                                                    {subjects.find(s => s.id === activity.subjectId)?.name || 'Unknown'}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-xs text-gray-600">
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="w-3 h-3" />
                                                    {activity.date ? (
                                                        (() => {
                                                            const d = new Date(activity.date);
                                                            return isNaN(d.getTime()) ? 'Invalid Date' : format(d, 'MMM dd, yyyy');
                                                        })()
                                                    ) : 'No Date Set'}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center font-bold text-gray-500">
                                                {activity.maxScore}
                                            </TableCell>
                                            <TableCell className="text-right pr-6">
                                                <Button
                                                    size="sm"
                                                    className="bg-indigo-600 hover:bg-indigo-700 h-8 font-medium"
                                                    onClick={() => handleOpenMarksEntry(activity)}
                                                >
                                                    Enter Marks
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="performance" className="mt-6">
                    <Card className="border-none shadow-sm overflow-hidden">
                        <CardHeader className="bg-white border-b border-gray-100 py-4">
                            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                                <div>
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        <TrendingUp className="w-5 h-5 text-green-500" />
                                        Cumulative Subject Grades
                                    </CardTitle>
                                    <CardDescription>Real-time calculation based on assignments, exams, and attendance.</CardDescription>
                                </div>
                                {selectedClassId === 'all' || selectedSubjectId === 'all' ? (
                                    <Badge variant="outline" className="text-amber-600 bg-amber-50">Please select a Class and Subject to view summaries</Badge>
                                ) : (
                                    <Button size="sm" variant="ghost" className="gap-2" onClick={() => refetchPerformance()}>
                                        <RefreshCw className={`w-3 h-3 ${performanceLoading ? 'animate-spin' : ''}`} /> Refresh
                                    </Button>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader className="bg-gray-50/50">
                                    <TableRow>
                                        <TableHead className="pl-6 w-[250px]">Student Name</TableHead>
                                        <TableHead className="text-center">Attendance</TableHead>
                                        <TableHead className="text-center">Assessments</TableHead>
                                        <TableHead className="text-center">Current Total</TableHead>
                                        <TableHead className="text-center w-[100px]">Grade</TableHead>
                                        <TableHead className="text-right pr-6">Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {performanceLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-60 text-center">
                                                <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 opacity-20" />
                                                <p className="text-muted-foreground animate-pulse">Calculating weighted performance...</p>
                                            </TableCell>
                                        </TableRow>
                                    ) : performanceData.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-60 text-center text-muted-foreground">
                                                <PieChart className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                                No performance data available for current selection.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        performanceData.map((perf: any) => (
                                            <TableRow key={perf.studentId} className="hover:bg-gray-50/50 transition-colors">
                                                <TableCell className="pl-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs">
                                                            {perf.studentName ? perf.studentName.charAt(0) : 'S'}
                                                        </div>
                                                        <span className="font-semibold text-gray-700">{perf.studentName}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <div className="flex flex-col items-center gap-1">
                                                        <span className="text-xs font-bold">{perf.attendance_percentage}%</span>
                                                        <div className="w-16 h-1 bg-gray-100 rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full ${perf.attendance_percentage < 75 ? 'bg-red-500' : 'bg-green-500'}`}
                                                                style={{ width: `${perf.attendance_percentage}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant="secondary" className="bg-gray-100 text-gray-600 font-mono text-[10px]">
                                                        {Object.keys(perf.breakdown || {}).length} types recorded
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <span className="text-lg font-extrabold text-indigo-600">
                                                        {perf.cumulative_percentage}%
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <div className={`w-8 h-8 rounded-md mx-auto flex items-center justify-center font-bold text-white shadow-sm ${perf.letter_grade === 'A' ? 'bg-green-600' :
                                                        perf.letter_grade === 'B' ? 'bg-blue-600' :
                                                            perf.letter_grade === 'C' ? 'bg-amber-600' :
                                                                perf.letter_grade === 'D' ? 'bg-orange-600' : 'bg-red-600'
                                                        }`}>
                                                        {perf.letter_grade}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right pr-6">
                                                    {perf.cumulative_percentage >= 50 ? (
                                                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">On Track</Badge>
                                                    ) : (
                                                        <Badge className="bg-rose-50 text-rose-700 border-rose-200">At Risk</Badge>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {selectedActivity && (
                <MarksEntryDialog
                    isOpen={isMarksEntryOpen}
                    onClose={() => {
                        setIsMarksEntryOpen(false);
                        setSelectedActivity(null);
                    }}
                    examId={selectedActivity.id}
                    examTitle={selectedActivity.title}
                    gradeId={selectedActivity.gradeId}
                    sectionId={selectedActivity.sectionId}
                    subjectId={selectedActivity.subjectId}
                    academicYearId={selectedAcademicYear}
                    maxScore={selectedActivity.maxScore}
                    assessmentType={selectedActivity.type as any}
                    assessmentDate={selectedActivity.date}
                />
            )}

            {/* Assessment Creator Modal */}
            <AssessmentCreatorModal
                isOpen={isAssessmentModalOpen}
                onClose={() => setIsAssessmentModalOpen(false)}
                onSuccess={() => {
                    setIsAssessmentModalOpen(false);
                    refetchActivities(); // Refresh the activity list
                }}
                selectedAcademicYearId={selectedAcademicYear}
                teacherId={user?.id}
                subjects={subjects}
                classes={classes}
                academicYears={academicYears}
            />
        </div>
    );
}
