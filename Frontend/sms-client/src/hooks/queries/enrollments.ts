import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEnrollmentService } from '@/services/api/enrollment-service';
import { EnrollmentFilters, EnrollmentCreate } from '@/types/enrollment';

export const enrollmentKeys = {
    all: ['enrollments'] as const,
    lists: () => [...enrollmentKeys.all, 'list'] as const,
    list: (skip: number, limit: number, filters: EnrollmentFilters) => [...enrollmentKeys.lists(), { skip, limit, ...filters }] as const,
    details: () => [...enrollmentKeys.all, 'detail'] as const,
    detail: (id: string) => [...enrollmentKeys.details(), id] as const,
    current: (studentId: string) => [...enrollmentKeys.all, 'current', studentId] as const,
    bulkCurrent: (studentIds: string[]) => [...enrollmentKeys.all, 'bulk-current', studentIds] as const,
    academicYears: () => [...enrollmentKeys.all, 'academic-years'] as const,
    grades: () => [...enrollmentKeys.all, 'grades'] as const,
    sections: () => [...enrollmentKeys.all, 'sections'] as const,
};

export function useEnrollments(skip: number = 0, limit: number = 10, filters?: EnrollmentFilters) {
    const service = useEnrollmentService();

    return useQuery({
        queryKey: enrollmentKeys.list(skip, limit, filters || {}),
        queryFn: () => service.getEnrollments(skip, limit, filters),
    });
}

export function useCurrentEnrollment(studentId: string) {
    const service = useEnrollmentService();

    return useQuery({
        queryKey: enrollmentKeys.current(studentId),
        queryFn: () => service.getCurrentEnrollment(studentId),
        enabled: !!studentId,
    });
}

export function useBulkCurrentEnrollments(studentIds: string[]) {
    const service = useEnrollmentService();

    return useQuery({
        queryKey: enrollmentKeys.bulkCurrent(studentIds),
        queryFn: () => service.getBulkCurrentEnrollments(studentIds),
        enabled: studentIds.length > 0,
    });
}

export function useEnrollmentGrades() {
    const service = useEnrollmentService();

    return useQuery({
        queryKey: enrollmentKeys.grades(),
        queryFn: () => service.getGrades(),
        staleTime: 30 * 60 * 1000, // Grades are fairly static
    });
}

export function useEnrollmentSections() {
    const service = useEnrollmentService();

    return useQuery({
        queryKey: enrollmentKeys.sections(),
        queryFn: () => service.getSections(),
        staleTime: 30 * 60 * 1000, // Sections are fairly static
    });
}

export function useAcademicYears() {
    const service = useEnrollmentService();

    return useQuery({
        queryKey: enrollmentKeys.academicYears(),
        queryFn: () => service.getAcademicYears(),
        staleTime: 60 * 60 * 1000, // Academic years change once a year
    });
}

export function useCurrentAcademicYear() {
    const service = useEnrollmentService();

    return useQuery({
        queryKey: [...enrollmentKeys.all, 'current-year'],
        queryFn: () => service.getCurrentAcademicYear(),
        staleTime: 60 * 60 * 1000,
    });
}

export function useDeleteEnrollment() {
    const service = useEnrollmentService();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => service.deleteEnrollment(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: enrollmentKeys.lists() });
        },
    });
}

export function useCreateEnrollment() {
    const service = useEnrollmentService();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: EnrollmentCreate) => service.createEnrollment(data),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: enrollmentKeys.lists() });
            if (data.student_id) {
                queryClient.invalidateQueries({ queryKey: enrollmentKeys.current(data.student_id) });
            }
        },
    });
}

export function useBulkCreateEnrollments() {
    const service = useEnrollmentService();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: any) => service.bulkCreateEnrollments(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: enrollmentKeys.lists() });
        },
    });
}

export function useUpdateEnrollment() {
    const service = useEnrollmentService();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string, data: any }) => service.updateEnrollment(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: enrollmentKeys.lists() });
        },
    });
}
