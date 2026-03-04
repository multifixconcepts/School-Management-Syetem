import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAssessmentService, AssessmentCreate, AssessmentUpdate, AssessmentFilters } from '@/services/api/assessment-service';

export const assessmentKeys = {
    all: ['assessments'] as const,
    lists: () => [...assessmentKeys.all, 'list'] as const,
    list: (filters: AssessmentFilters) => [...assessmentKeys.lists(), filters] as const,
    details: () => [...assessmentKeys.all, 'detail'] as const,
    detail: (id: string) => [...assessmentKeys.details(), id] as const,
};

export function useAssessments(filters: AssessmentFilters = {}) {
    const service = useAssessmentService();

    return useQuery({
        queryKey: assessmentKeys.list(filters),
        queryFn: () => service.getAssessments(filters),
        placeholderData: (previousData) => previousData,
    });
}

export function useAssessment(id: string) {
    const service = useAssessmentService();

    return useQuery({
        queryKey: assessmentKeys.detail(id),
        queryFn: () => service.getAssessmentById(id),
        enabled: !!id,
    });
}

export function useCreateAssessment() {
    const service = useAssessmentService();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: AssessmentCreate) => service.createAssessment(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: assessmentKeys.lists() });
            // Also invalidate grading category status as marks are now allocated
            queryClient.invalidateQueries({ queryKey: ['grading', 'categories-status'] });
            // Invalidate grading hub activities and performance
            queryClient.invalidateQueries({ queryKey: ['grading-hub'] });
        },
    });
}

export function useUpdateAssessment() {
    const service = useAssessmentService();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: AssessmentUpdate }) =>
            service.updateAssessment(id, data),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: assessmentKeys.lists() });
            queryClient.invalidateQueries({ queryKey: assessmentKeys.detail(variables.id) });
        },
    });
}

export function useDeleteAssessment() {
    const service = useAssessmentService();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => service.deleteAssessment(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: assessmentKeys.lists() });
        },
    });
}
