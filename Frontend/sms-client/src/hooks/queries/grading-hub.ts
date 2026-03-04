import { useQuery } from '@tanstack/react-query';
import { useExamService } from '@/services/api/exam-service';
import { useAssignmentService } from '@/services/api/assignment-service';
import { useAssessmentService } from '@/services/api/assessment-service';
import { useEnrollmentService } from '@/services/api/enrollment-service';
import { useStudentGradeService } from '@/services/api/student-grade-service';
import { useSemesterService } from '@/services/api/semester-service';
import { usePeriodService } from '@/services/api/period-service';

export const gradingHubKeys = {
    all: ['grading-hub'] as const,
    activities: (filters: any) => [...gradingHubKeys.all, 'activities', filters] as const,
    performance: (classId: string, subjectId: string, academicYearId: string, periodId?: string, semesterId?: string) =>
        [...gradingHubKeys.all, 'performance', classId, subjectId, academicYearId, periodId, semesterId] as const,
    semesters: (academicYearId: string) => [...gradingHubKeys.all, 'semesters', academicYearId] as const,
    periods: (semesterId: string) => [...gradingHubKeys.all, 'periods', semesterId] as const,
};

export function useGradableActivities(filters: { academic_year_id: string; grade_id?: string; section_id?: string; subject_id?: string; teacher_id?: string; period_id?: string; semester_id?: string }) {
    const examService = useExamService();
    const assignmentService = useAssignmentService();
    const assessmentService = useAssessmentService();

    return useQuery({
        queryKey: gradingHubKeys.activities(filters),
        queryFn: async () => {
            const apiFilters = {
                academic_year_id: filters.academic_year_id,
                grade_id: filters.grade_id,
                section_id: filters.section_id,
                subject_id: filters.subject_id === 'all' ? undefined : filters.subject_id,
                teacher_id: filters.teacher_id,
                period_id: filters.period_id === 'all' ? undefined : filters.period_id,
                semester_id: filters.semester_id === 'all' ? undefined : filters.semester_id,
                is_published: true
            };

            const [exams, assignments, assessments] = await Promise.all([
                examService.getExams(apiFilters),
                assignmentService.getAssignments(apiFilters),
                assessmentService.getAssessments(apiFilters)
            ]);

            const combined = [
                ...(exams || []).map(e => ({
                    id: e.id,
                    title: e.title,
                    type: 'EXAM',
                    date: e.exam_date,
                    subjectId: e.subject_id,
                    gradeId: e.grade_id,
                    sectionId: e.section_id,
                    maxScore: e.max_score,
                    source: 'exam' as const
                })),
                ...(assignments || []).map(a => ({
                    id: a.id,
                    title: a.title,
                    type: 'ASSIGNMENT',
                    date: a.due_date,
                    subjectId: a.subject_id,
                    gradeId: a.grade_id,
                    sectionId: a.section_id,
                    maxScore: a.max_score,
                    source: 'assignment' as const
                })),
                ...(assessments || []).map(a => ({
                    id: a.id,
                    title: a.title,
                    type: a.type,
                    date: a.assessment_date,
                    subjectId: a.subject_id,
                    gradeId: a.grade_id,
                    sectionId: a.section_id,
                    maxScore: a.max_score,
                    source: 'assessment' as const
                }))
            ];

            return combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        },
        enabled: !!filters.academic_year_id,
    });
}

export function useClassPerformance(classId: string, subjectId: string, academicYearId: string, classes: any[], periodId?: string, semesterId?: string) {
    const enrollmentService = useEnrollmentService();
    const gradeService = useStudentGradeService();

    return useQuery({
        queryKey: gradingHubKeys.performance(classId, subjectId, academicYearId, periodId, semesterId),
        queryFn: async () => {
            const cls = classes.find(c => c.id === classId);
            if (!cls) return [];

            const enrollmentRes = await enrollmentService.getEnrollments(0, 300, {
                academic_year_id: academicYearId,
                grade_id: cls.grade_id,
                section_id: cls.section_id,
            });

            const enrollments = (enrollmentRes as any).items || [];
            if (!enrollments.length) return [];

            const summaries = await Promise.all(
                enrollments.map(async (en: any) => {
                    try {
                        const summary = await gradeService.getSubjectSummary(en.student_id, subjectId, academicYearId, periodId, semesterId);
                        return {
                            studentId: en.student_id,
                            studentName: en.student_name,
                            ...summary
                        };
                    } catch (e) {
                        return {
                            studentId: en.student_id,
                            studentName: en.student_name,
                            attendance_percentage: 100,
                            breakdown: {},
                            cumulative_percentage: 0,
                            letter_grade: 'N/A'
                        };
                    }
                })
            );

            return summaries;
        },
        enabled: !!classId && !!subjectId && !!academicYearId && classId !== 'all' && subjectId !== 'all',
    });
}

export function useSemesters(academicYearId: string) {
    const semesterService = useSemesterService();
    return useQuery({
        queryKey: gradingHubKeys.semesters(academicYearId),
        queryFn: () => semesterService.getSemesters(academicYearId),
        enabled: !!academicYearId,
    });
}

export function usePeriods(semesterId: string) {
    const periodService = usePeriodService();
    return useQuery({
        queryKey: gradingHubKeys.periods(semesterId),
        queryFn: () => periodService.getPeriods(semesterId),
        enabled: !!semesterId && semesterId !== 'all',
    });
}
