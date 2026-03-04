import { useApiClientWithLoading, createWaitForApiClientReady } from './api-client';
import { useMemo, useCallback } from 'react';

export interface Semester {
  id: string;
  academic_year_id: string;
  name: string;
  semester_number: number;
  start_date: string;
  end_date: string;
  is_published: boolean;
  is_active: boolean;
  is_current?: boolean;
}

export function useSemesterService() {
  const { apiClient } = useApiClientWithLoading();
  const waitForApiClientReady = useMemo(() => createWaitForApiClientReady(apiClient), [apiClient]);

  const getSemesters = useCallback(async (academicYearId: string): Promise<Semester[]> => {
    const client = await waitForApiClientReady();
    const resp = await client.get<Semester[]>(`/academics/semesters?academic_year_id=${academicYearId}`);
    return Array.isArray(resp) ? resp : [];
  }, [waitForApiClientReady]);

  const togglePublication = useCallback(async (semesterId: string): Promise<Semester> => {
    const client = await waitForApiClientReady();
    return client.post<Semester>(`/academics/semesters/${semesterId}/toggle-published`, {});
  }, [waitForApiClientReady]);

  const updateSemester = useCallback(async (semesterId: string, payload: Partial<Semester>): Promise<Semester> => {
    const client = await waitForApiClientReady();
    return client.put<Semester>(`/academics/semesters/${semesterId}`, payload);
  }, [waitForApiClientReady]);

  const createSemester = useCallback(async (payload: Omit<Semester, 'id' | 'is_published' | 'is_active'>): Promise<Semester> => {
    const client = await waitForApiClientReady();
    return client.post<Semester>(`/academics/semesters`, payload);
  }, [waitForApiClientReady]);

  const removeSemester = useCallback(async (semesterId: string): Promise<void> => {
    const client = await waitForApiClientReady();
    return client.delete(`/academics/semesters/${semesterId}`);
  }, [waitForApiClientReady]);

  const getCurrentSemester = useCallback(async (): Promise<any> => {
    const client = await waitForApiClientReady();
    return client.get('/academics/academic-years/current/semester');
  }, [waitForApiClientReady]);

  const service = useMemo(() => ({
    getSemesters,
    togglePublication,
    updateSemester,
    createSemester,
    removeSemester,
    deleteSemester: removeSemester,
    getCurrentSemester
  }), [getSemesters, togglePublication, updateSemester, createSemester, removeSemester, getCurrentSemester]);

  return service;
}