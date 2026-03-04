import { useMemo } from 'react';
import { useApiClientWithLoading, createWaitForApiClientReady } from './api-client';
import { Grade, GradeCreate, GradeUpdate, GradeWithDetails, GradeType } from '@/types/student-grade';

export function useStudentGradeService() {
  const { apiClient, isLoading: apiLoading } = useApiClientWithLoading();
  const waitForApiClientReady = useMemo(() => createWaitForApiClientReady(apiClient), [apiClient]);

  const service = useMemo(() => ({
    getGrades: async (filters?: Partial<{ student_id: string; student_ids: string[]; subject_id: string; assessment_type: GradeType; assessment_id: string; period_id: string; semester_id: string; limit: number; skip: number; academic_year_id: string }>): Promise<Grade[]> => {
      const client = await waitForApiClientReady();
      const params = new URLSearchParams();
      if (filters?.student_id) params.set('student_id', filters.student_id);
      if (filters?.student_ids && filters.student_ids.length > 0) {
        filters.student_ids.forEach(id => params.append('student_ids', id));
      }
      if (filters?.subject_id) params.set('subject_id', filters.subject_id);
      if (filters?.assessment_type) params.set('assessment_type', filters.assessment_type);
      if (filters?.assessment_id) params.set('assessment_id', filters.assessment_id);
      if (filters?.academic_year_id) params.set('academic_year_id', filters.academic_year_id);
      if (filters?.period_id) params.set('period_id', filters.period_id);
      if (filters?.semester_id) params.set('semester_id', filters.semester_id);
      if (filters?.limit) params.set('limit', String(filters.limit));
      if (filters?.skip) params.set('skip', String(filters.skip));
      const qs = params.toString();
      return client.get<Grade[]>(`/academics/grades${qs ? `?${qs}` : ''}`);
    },

    getGrade: async (id: string): Promise<Grade> => {
      const client = await waitForApiClientReady();
      return client.get<Grade>(`/academics/grades/${id}`);
    },

    getGradeDetails: async (id: string): Promise<GradeWithDetails> => {
      const client = await waitForApiClientReady();
      return client.get<GradeWithDetails>(`/academics/grades/${id}/details`);
    },

    createGrade: async (payload: GradeCreate): Promise<Grade> => {
      const client = await waitForApiClientReady();
      return client.post<Grade>('/academics/grades', payload);
    },

    bulkCreateGrades: async (payload: GradeCreate[]): Promise<Grade[]> => {
      const client = await waitForApiClientReady();
      return client.post<Grade[]>('/academics/grades/bulk', payload);
    },

    updateGrade: async (id: string, payload: GradeUpdate): Promise<Grade> => {
      const client = await waitForApiClientReady();
      return client.put<Grade>(`/academics/grades/${id}`, payload);
    },

    recalculateGrade: async (id: string, score: number, max_score: number, comments?: string): Promise<Grade> => {
      const client = await waitForApiClientReady();
      return client.put<Grade>(`/academics/grades/${id}/recalculate`, { score, max_score, comments });
    },

    deleteGrade: async (id: string): Promise<void> => {
      const client = await waitForApiClientReady();
      return client.delete<void>(`/academics/grades/${id}`);
    },

    getSubjectAverage: async (student_id: string, subject_id: string): Promise<number | null> => {
      const client = await waitForApiClientReady();
      const res = await client.get<{ average_percentage: number | null }>(`/academics/grades/subject-average?student_id=${student_id}&subject_id=${subject_id}`);
      return res.average_percentage ?? null;
    },

    calculateWeightedAverage: async (student_id: string, subject_id: string, weights: Record<GradeType, number>): Promise<number | null> => {
      const client = await waitForApiClientReady();
      const res = await client.post<{ weighted_average: number | null }>(`/academics/grades/weighted-average`, { student_id, subject_id, weights });
      return res.weighted_average ?? null;
    },

    getReportCard: async (student_id: string, academic_year: string): Promise<unknown> => {
      const client = await waitForApiClientReady();
      return client.get<unknown>(`/academics/grades/report-card?student_id=${student_id}&academic_year=${encodeURIComponent(academic_year)}`);
    },

    getSubjectSummary: async (student_id: string, subject_id: string, academic_year_id: string, period_id?: string, semester_id?: string): Promise<any> => {
      const client = await waitForApiClientReady();
      const params = new URLSearchParams({
        student_id,
        subject_id,
        academic_year_id
      });
      if (period_id) params.set('period_id', period_id);
      if (semester_id) params.set('semester_id', semester_id);
      return client.get<any>(`/academics/grades/subject-summary?${params.toString()}`);
    },

    getStudentAcademicHistory: async (student_id: string): Promise<any[]> => {
      const client = await waitForApiClientReady();
      return client.get<any[]>(`/academics/students/${student_id}/academic-history`);
    },

    publishGrades: async (params: { academic_year_id: string; grade_id: string; subject_id: string; period_number: number }): Promise<{ published_count: number }> => {
      const client = await waitForApiClientReady();
      const qs = new URLSearchParams({
        academic_year_id: params.academic_year_id,
        grade_id: params.grade_id,
        subject_id: params.subject_id,
        period_number: String(params.period_number)
      }).toString();
      return client.post<{ published_count: number }>(`/academics/grades/publish?${qs}`, {});
    }
  }), [waitForApiClientReady]);

  return service;
}
