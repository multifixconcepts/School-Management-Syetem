import { useApiClientWithLoading, createWaitForApiClientReady } from './api-client';
import { useMemo } from 'react';

export enum GradeType {
    ASSIGNMENT = "ASSIGNMENT",
    QUIZ = "QUIZ",
    TEST = "TEST",
    EXAM = "EXAM",
    PROJECT = "PROJECT",
    PARTICIPATION = "PARTICIPATION",
    ATTENDANCE = "ATTENDANCE",
    OTHER = "OTHER",
}

export interface Assessment {
    id: string;
    title: string;
    description?: string;
    type: GradeType;
    subject_id: string;
    teacher_id: string;
    academic_year_id: string;
    grade_id: string;
    section_id?: string;
    assessment_date: string; // ISO date
    max_score: number;
    is_published: boolean;
    tenant_id: string;
}

export interface AssessmentCreate {
    title: string;
    description?: string;
    type: GradeType | string;
    subject_id: string;
    teacher_id: string;
    academic_year_id: string;
    grade_id: string;
    section_id?: string;
    class_id?: string;
    grading_category_id?: string;
    assessment_date?: string;
    max_score: number;
    is_published?: boolean;
}

export interface AssessmentUpdate extends Partial<AssessmentCreate> { }

export interface AssessmentFilters {
    skip?: number;
    limit?: number;
    subject_id?: string;
    grade_id?: string;
    section_id?: string;
    academic_year_id?: string;
    is_published?: boolean;
    class_id?: string;
    teacher_id?: string;
    period_id?: string;
    semester_id?: string;
}

export function useAssessmentService() {
    const { apiClient, isLoading: apiLoading } = useApiClientWithLoading();
    const waitForApiClientReady = useMemo(() => createWaitForApiClientReady(apiClient), [apiClient]);

    const service = useMemo(() => ({
        getAssessments: async (filters?: AssessmentFilters): Promise<Assessment[]> => {
            const client = await waitForApiClientReady();
            const qs = new URLSearchParams();
            if (filters?.skip !== undefined) qs.append('skip', String(filters.skip));
            if (filters?.limit !== undefined) qs.append('limit', String(filters.limit));
            if (filters?.subject_id) qs.append('subject_id', filters.subject_id);
            if (filters?.grade_id) qs.append('grade_id', filters.grade_id);
            if (filters?.section_id) qs.append('section_id', filters.section_id);
            if (filters?.academic_year_id) qs.append('academic_year_id', filters.academic_year_id);
            if (filters?.teacher_id) qs.append('teacher_id', filters.teacher_id);
            if (filters?.period_id) qs.append('period_id', filters.period_id);
            if (filters?.semester_id) qs.append('semester_id', filters.semester_id);
            if (filters?.is_published !== undefined) qs.append('is_published', String(filters.is_published));
            const url = `/academics/assessments${qs.toString() ? `?${qs.toString()}` : ''}`;
            return client.get<Assessment[]>(url);
        },

        getAssessmentById: async (id: string): Promise<Assessment> => {
            const client = await waitForApiClientReady();
            return client.get<Assessment>(`/academics/assessments/${id}`);
        },

        createAssessment: async (payload: AssessmentCreate): Promise<Assessment> => {
            const client = await waitForApiClientReady();
            return client.post<Assessment>('/academics/assessments', payload);
        },

        updateAssessment: async (id: string, payload: AssessmentUpdate): Promise<Assessment> => {
            const client = await waitForApiClientReady();
            return client.put<Assessment>(`/academics/assessments/${id}`, payload);
        },

        deleteAssessment: async (id: string): Promise<void> => {
            const client = await waitForApiClientReady();
            return client.delete<void>(`/academics/assessments/${id}`);
        },
    }), [waitForApiClientReady]);

    return service;
}
