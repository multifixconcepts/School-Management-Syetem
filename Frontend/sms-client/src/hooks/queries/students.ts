import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useStudentService } from '@/services/api/student-service';
import { StudentCreate, StudentUpdate } from '@/types/student';

export const studentKeys = {
    all: ['students'] as const,
    lists: () => [...studentKeys.all, 'list'] as const,
    list: (filters: any) => [...studentKeys.lists(), filters] as const,
    details: () => [...studentKeys.all, 'detail'] as const,
    detail: (id: string) => [...studentKeys.details(), id] as const,
};

export function useStudents(filters?: { grade?: string; section?: string; status?: string; skip?: number; limit?: number }) {
    const service = useStudentService();

    return useQuery({
        queryKey: studentKeys.list(filters || {}),
        queryFn: () => service.getStudents(filters),
        placeholderData: (previousData) => previousData,
    });
}

export function useStudentsPaged(skip: number = 0, limit: number = 100, filters?: any) {
    const service = useStudentService();

    return useQuery({
        queryKey: [...studentKeys.lists(), 'paged', { skip, limit, ...filters }],
        queryFn: () => service.getStudentsPaged(skip, limit, filters),
        staleTime: 5 * 60 * 1000,
    });
}

export function useStudent(id: string) {
    const service = useStudentService();

    return useQuery({
        queryKey: studentKeys.detail(id),
        queryFn: () => service.getStudentById(id),
        enabled: !!id,
    });
}

export function useCreateStudent() {
    const service = useStudentService();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (student: StudentCreate) => service.createStudent(student),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
        },
    });
}

export function useUpdateStudent() {
    const service = useStudentService();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, student }: { id: string; student: StudentUpdate }) =>
            service.updateStudent(id, student),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
            queryClient.invalidateQueries({ queryKey: studentKeys.detail(variables.id) });
        },
    });
}

export function useUpdateStudentStatus() {
    const service = useStudentService();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, status, reason }: { id: string; status: string; reason?: string }) =>
            service.updateStudentStatus(id, status, reason),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
            queryClient.invalidateQueries({ queryKey: studentKeys.detail(variables.id) });
        },
    });
}

export function useDeleteStudent() {
    const service = useStudentService();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => service.deleteStudent(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
        },
    });
}

export function useBulkDeleteStudents() {
    const service = useStudentService();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (ids: string[]) => service.bulkDeleteStudents(ids),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
        },
    });
}

export function useCreateStudentsBulk() {
    const service = useStudentService();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (students: StudentCreate[]) => service.createStudentsBulk(students),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
        },
    });
}

