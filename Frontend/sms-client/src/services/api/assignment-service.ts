import { useApiClientWithLoading, createWaitForApiClientReady } from './api-client';
import { useMemo } from 'react';

export interface Assignment {
  id: string;
  title: string;
  description?: string;
  subject_id: string;
  teacher_id: string;
  grade_id: string;
  section_id?: string;
  academic_year_id: string;
  assigned_date: string; // ISO date
  due_date: string;      // ISO date
  max_score: number;
  weight?: number;
  is_published: boolean;
  submission_type?: string;
  rubric?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  subject_name?: string;
  teacher_name?: string;
  grade_name?: string;
  section_name?: string;
}

export interface AssignmentCreate {
  title: string;
  description?: string;
  subject_id: string;
  teacher_id: string;
  grade_id: string;
  section_id?: string;
  academic_year_id: string;
  assigned_date?: string;
  due_date: string;
  max_score: number;
  weight?: number;
  submission_type?: string;
  attachment_url?: string;
  rubric?: Record<string, unknown>;
}

export interface AssignmentUpdate extends Partial<AssignmentCreate> {
  is_published?: boolean;
}

export interface AssignmentFilters {
  skip?: number;
  limit?: number;
  subject_id?: string;
  teacher_id?: string;
  grade_id?: string;
  section_id?: string;
  academic_year_id?: string;
  period_id?: string;
  semester_id?: string;
  is_published?: boolean;
}

export function useAssignmentService() {
  const { apiClient, isLoading: apiLoading } = useApiClientWithLoading();
  const waitForApiClientReady = useMemo(() => createWaitForApiClientReady(apiClient), [apiClient]);

  const service = useMemo(() => ({
    getAssignments: async (filters?: AssignmentFilters): Promise<Assignment[]> => {
      const client = await waitForApiClientReady();
      const qs = new URLSearchParams();
      if (filters?.skip !== undefined) qs.append('skip', String(filters.skip));
      if (filters?.limit !== undefined) qs.append('limit', String(filters.limit));
      if (filters?.subject_id) qs.append('subject_id', filters.subject_id);
      if (filters?.teacher_id) qs.append('teacher_id', filters.teacher_id);
      if (filters?.grade_id) qs.append('grade_id', filters.grade_id);
      if (filters?.section_id) qs.append('section_id', filters.section_id);
      if (filters?.academic_year_id) qs.append('academic_year_id', filters.academic_year_id);
      if (filters?.period_id) qs.append('period_id', filters.period_id);
      if (filters?.semester_id) qs.append('semester_id', filters.semester_id);
      if (filters?.is_published !== undefined) qs.append('is_published', String(filters.is_published));
      const url = `/academics/assignments${qs.toString() ? `?${qs.toString()}` : ''}`;
      return client.get<Assignment[]>(url);
    },

    getAssignmentById: async (id: string): Promise<Assignment> => {
      const client = await waitForApiClientReady();
      return client.get<Assignment>(`/academics/assignments/${id}`);
    },

    createAssignment: async (payload: AssignmentCreate): Promise<Assignment> => {
      const client = await waitForApiClientReady();
      return client.post<Assignment>('/academics/assignments', payload);
    },

    updateAssignment: async (id: string, payload: AssignmentUpdate): Promise<Assignment> => {
      const client = await waitForApiClientReady();
      return client.put<Assignment>(`/academics/assignments/${id}`, payload);
    },

    deleteAssignment: async (id: string): Promise<void> => {
      const client = await waitForApiClientReady();
      return client.delete<void>(`/academics/assignments/${id}`);
    },

    publishAssignment: async (id: string): Promise<Assignment> => {
      const client = await waitForApiClientReady();
      return client.put<Assignment>(`/academics/assignments/${id}/publish`, {});
    },

    unpublishAssignment: async (id: string): Promise<Assignment> => {
      const client = await waitForApiClientReady();
      return client.put<Assignment>(`/academics/assignments/${id}/unpublish`, {});
    },
  }), [waitForApiClientReady]);

  return service;
}
