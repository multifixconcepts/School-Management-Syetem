import { useApiClientWithLoading, createWaitForApiClientReady } from './api-client';
import { useMemo } from 'react';

export interface Exam {
  id: string;
  title: string;
  description?: string;
  subject_id: string;
  teacher_id: string;
  grade_id: string;
  section_id?: string;
  academic_year_id: string;
  exam_date: string; // ISO date
  start_time: string; // HH:mm:ss
  end_time: string;   // HH:mm:ss
  max_score: number;
  weight?: number;
  is_published: boolean;
  location?: string;
  instructions?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ExamCreate {
  title: string;
  description?: string;
  subject_id: string;
  teacher_id: string;
  grade_id: string;
  section_id?: string;
  academic_year_id: string;
  exam_date: string;
  start_time: string;
  end_time: string;
  max_score: number;
  weight?: number;
  location?: string;
  instructions?: string;
}

export interface ExamUpdate extends Partial<ExamCreate> {
  is_published?: boolean;
}

export interface ExamFilters {
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
  search?: string;
}

export function useExamService() {
  const { apiClient, isLoading: apiLoading } = useApiClientWithLoading();
  const waitForApiClientReady = useMemo(() => createWaitForApiClientReady(apiClient), [apiClient]);

  const service = useMemo(() => ({
    getExams: async (filters?: ExamFilters): Promise<Exam[]> => {
      const client = await waitForApiClientReady();
      const qs = new URLSearchParams();
      if (filters?.skip !== undefined) qs.append('skip', String(filters.skip));
      if (filters?.limit !== undefined) qs.append('limit', String(filters.limit));
      if (filters?.subject_id) qs.append('subject_id', filters.subject_id);
      if (filters?.teacher_id) qs.append('teacher_id', filters.teacher_id);
      if (filters?.grade_id) qs.append('grade_id', filters.grade_id);
      if (filters?.section_id) qs.append('section_id', filters.section_id);
      if (filters?.is_published !== undefined) qs.append('is_published', String(filters.is_published));
      if (filters?.academic_year_id) qs.append('academic_year_id', filters.academic_year_id);
      if (filters?.period_id) qs.append('period_id', filters.period_id);
      if (filters?.semester_id) qs.append('semester_id', filters.semester_id);
      if (filters?.search) qs.append('search', filters.search);
      const url = `/academics/exams${qs.toString() ? `?${qs.toString()}` : ''}`;
      return client.get<Exam[]>(url);
    },

    getExamById: async (id: string): Promise<Exam> => {
      const client = await waitForApiClientReady();
      return client.get<Exam>(`/academics/exams/${id}`);
    },

    createExam: async (payload: ExamCreate): Promise<Exam> => {
      const client = await waitForApiClientReady();
      return client.post<Exam>('/academics/exams', payload);
    },

    updateExam: async (id: string, payload: ExamUpdate): Promise<Exam> => {
      const client = await waitForApiClientReady();
      return client.put<Exam>(`/academics/exams/${id}`, payload);
    },

    deleteExam: async (id: string): Promise<void> => {
      const client = await waitForApiClientReady();
      return client.delete<void>(`/academics/exams/${id}`);
    },

    publishExam: async (id: string): Promise<Exam> => {
      const client = await waitForApiClientReady();
      return client.put<Exam>(`/academics/exams/${id}/publish`, {});
    },

    unpublishExam: async (id: string): Promise<Exam> => {
      const client = await waitForApiClientReady();
      return client.put<Exam>(`/academics/exams/${id}/unpublish`, {});
    },
  }), [waitForApiClientReady]);

  return service;
}
