import { useMemo } from 'react';
import { useApiClient } from './api-client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface GradingCategory {
    id: string;
    name: string;
    weight: number;
    description?: string;
    schema_id: string;
}

export interface GradingCategoryWithStatus extends GradingCategory {
    allocated_marks: number;
    remaining_marks: number;
}

export interface GradingSchema {
    id: string;
    name: string;
    description?: string;
    is_active: boolean;
    academic_year_id?: string;
    categories: GradingCategory[];
}

export interface GradingSchemaCreate {
    name: string;
    description?: string;
    is_active?: boolean;
    academic_year_id?: string;
    categories: {
        name: string;
        weight: number;
        description?: string;
    }[];
}

export function useGradingService() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    // Direct getters for manual fetching
    // ApiClient already returns response.data
    const getGradingSchemas = async () => {
        return await apiClient.get<GradingSchema[]>('/academics/grading-schemas');
    };

    const getGradingSchema = async (id: string) => {
        return await apiClient.get<GradingSchema>(`/academics/grading-schemas/${id}`);
    };

    const createGradingSchema = async (data: GradingSchemaCreate) => {
        return await apiClient.post<GradingSchema>('/academics/grading-schemas', data);
    };

    const updateGradingSchema = async ({ id, data }: { id: string; data: Partial<GradingSchemaCreate> }) => {
        return await apiClient.put<GradingSchema>(`/academics/grading-schemas/${id}`, data);
    };

    const deleteGradingSchema = async (id: string) => {
        return await apiClient.delete<any>(`/academics/grading-schemas/${id}`);
    };

    const getCategoriesStatus = async (classId: string, subjectId: string, periodId?: string, semesterId?: string) => {
        const params = new URLSearchParams({ class_id: classId, subject_id: subjectId });
        if (periodId) params.append('period_id', periodId);
        if (semesterId) params.append('semester_id', semesterId);
        return await apiClient.get<GradingCategoryWithStatus[]>(`/academics/categories-status?${params.toString()}`);
    };

    return {
        // Direct methods
        getGradingSchemas,
        getGradingSchema,
        createGradingSchema,
        updateGradingSchema,
        deleteGradingSchema,
        getCategoriesStatus,

        // React Query Hooks
        useSchemas: () => useQuery({
            queryKey: ['grading-schemas'],
            queryFn: getGradingSchemas,
        }),

        useCreateSchema: () => useMutation({
            mutationFn: createGradingSchema,
            onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: ['grading-schemas'] });
            },
        }),

        useUpdateSchema: () => useMutation({
            mutationFn: updateGradingSchema,
            onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: ['grading-schemas'] });
            },
        }),

        useDeleteSchema: () => useMutation({
            mutationFn: deleteGradingSchema,
            onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: ['grading-schemas'] });
            },
        }),
    };
}
