import { useApiClient } from './api-client';
import { useState, useCallback, useMemo } from 'react';

export interface TimeSlot {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  day_of_week: string;
  subject_id?: string;
  class_id?: string; // The specific Assignment ID (links to teacher+subject)
  teacher_id?: string;
  subject_name?: string; // Enriched from backend
  teacher_name?: string; // Enriched from backend
}

export interface Timetable {
  id: string;
  name: string;
  academic_year?: string;
  academic_year_id?: string;
  grade_id: string;
  grade_name?: string;
  section_id?: string;
  section_name?: string;
  is_active: boolean;
  time_slots: TimeSlot[];
  created_at: string;
  updated_at: string;
}

export interface TimetableCreate {
  name: string;
  academic_year_id: string;
  grade_id: string;
  section_id?: string;
  is_active: boolean;
  time_slots: Omit<TimeSlot, 'id'>[];
}

export type TimetableUpdate = Partial<TimetableCreate>;

type TimetableBackend = {
  id: string;
  name: string;
  academic_year?: string | { name?: string } | null;
  academic_year_name?: string;
  academic_year_id?: string;
  grade_id: string;
  grade_name?: string;
  section_id?: string;
  section_name?: string;
  is_active: boolean;
  timetable_data?: { time_slots?: Omit<TimeSlot, 'id'>[] } | null;
  time_slots?: Omit<TimeSlot, 'id'>[];
  created_at: string;
  updated_at: string;
};

type TimetableBackendCreate = {
  name: string;
  academic_year_id: string;
  grade_id: string;
  section_id?: string;
  is_active: boolean;
  timetable_data: { time_slots: Omit<TimeSlot, 'id'>[] };
};

type TimetableBackendUpdate = {
  name?: string;
  academic_year_id?: string;
  grade_id?: string;
  section_id?: string;
  is_active?: boolean;
  timetable_data?: { time_slots: Omit<TimeSlot, 'id'>[] };
};

export interface TimetableFilters {
  academic_year_id?: string;
  grade_id?: string;
  section_id?: string;
  teacher_id?: string;
  search?: string;
}

export const useTimetableService = () => {
  const apiClient = useApiClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const getTimetables = useCallback(async (filters?: TimetableFilters) => {
    try {
      setLoading(true);
      setError(null);
      const qs = new URLSearchParams();
      if (filters?.academic_year_id) qs.append('academic_year_id', filters.academic_year_id);
      if (filters?.grade_id) qs.append('grade_id', filters.grade_id);
      if (filters?.section_id) qs.append('section_id', filters.section_id);
      if (filters?.teacher_id) qs.append('teacher_id', filters.teacher_id);
      if (filters?.search) qs.append('search', filters.search);
      const url = `/academics/timetables${qs.toString() ? `?${qs.toString()}` : ''}`;
      const raw = await apiClient.get<TimetableBackend[]>(url);
      return (Array.isArray(raw) ? raw : []).map((t: TimetableBackend) => ({
        id: t.id,
        name: t.name,
        academic_year: (typeof t.academic_year === 'object' && t.academic_year?.name)
          ? t.academic_year.name
          : (typeof t.academic_year === 'string' ? t.academic_year : t.academic_year_name) || undefined,
        academic_year_id: t.academic_year_id,
        grade_id: t.grade_id,
        grade_name: t.grade_name,
        section_id: t.section_id,
        section_name: t.section_name,
        is_active: t.is_active,
        time_slots: (t.timetable_data?.time_slots || t.time_slots || []).map((s) => ({
          id: `${t.id}-${s.day_of_week}-${s.start_time}-${s.end_time}-${s.name ?? ''}`,
          name: s.name,
          start_time: s.start_time,
          end_time: s.end_time,
          day_of_week: s.day_of_week,
          subject_id: s.subject_id,
          class_id: s.class_id,
          teacher_id: s.teacher_id,
          subject_name: (s as any).subject_name,
          teacher_name: (s as any).teacher_name,
        })),
        created_at: t.created_at,
        updated_at: t.updated_at,
      })) as Timetable[];
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch timetables'));
      throw err;
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  const deleteTimetable = useCallback(async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      await apiClient.delete(`/academics/timetables/${id}`);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err : new Error(`Failed to delete timetable with ID: ${id}`));
      throw err;
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  const createTimetable = useCallback(async (payload: TimetableCreate): Promise<Timetable> => {
    try {
      setLoading(true);
      setError(null);
      const backendPayload: TimetableBackendCreate = {
        name: payload.name,
        academic_year_id: payload.academic_year_id,
        grade_id: payload.grade_id,
        section_id: payload.section_id,
        is_active: payload.is_active,
        timetable_data: { time_slots: payload.time_slots }
      };
      const created = await apiClient.post<TimetableBackend>('/academics/timetables', backendPayload);
      const result: Timetable = {
        id: created.id,
        name: created.name,
        academic_year: (typeof created.academic_year === 'object' && created.academic_year?.name)
          ? created.academic_year.name
          : (typeof created.academic_year === 'string' ? created.academic_year : created.academic_year_name) || undefined,
        academic_year_id: created.academic_year_id,
        grade_id: created.grade_id,
        section_id: created.section_id,
        is_active: created.is_active,
        time_slots: (created.timetable_data?.time_slots || created.time_slots || []).map((s) => ({
          id: `${created.id}-${s.day_of_week}-${s.start_time}-${s.end_time}-${s.name ?? ''}`,
          name: s.name,
          start_time: s.start_time,
          end_time: s.end_time,
          day_of_week: s.day_of_week,
          subject_id: s.subject_id,
          class_id: s.class_id,
          teacher_id: s.teacher_id,
          subject_name: (s as any).subject_name,
          teacher_name: (s as any).teacher_name,
        })),
        created_at: created.created_at,
        updated_at: created.updated_at,
      };
      return result;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to create timetable'));
      throw err;
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  const updateTimetable = useCallback(async (id: string, payload: TimetableUpdate): Promise<Timetable> => {
    try {
      setLoading(true);
      setError(null);
      const backendPayload: TimetableBackendUpdate = {
        name: payload.name,
        academic_year_id: (payload as TimetableUpdate).academic_year_id,
        grade_id: payload.grade_id,
        section_id: payload.section_id,
        is_active: payload.is_active,
        timetable_data: payload.time_slots ? { time_slots: payload.time_slots } : undefined,
      };
      const updated = await apiClient.put<TimetableBackend>(`/academics/timetables/${id}`, backendPayload);
      const result: Timetable = {
        id: updated.id,
        name: updated.name,
        academic_year: (typeof updated.academic_year === 'object' && updated.academic_year?.name)
          ? updated.academic_year.name
          : (typeof updated.academic_year === 'string' ? updated.academic_year : updated.academic_year_name) || undefined,
        academic_year_id: updated.academic_year_id,
        grade_id: updated.grade_id,
        section_id: updated.section_id,
        is_active: updated.is_active,
        time_slots: (updated.timetable_data?.time_slots || updated.time_slots || []).map((s) => ({
          id: `${updated.id}-${s.day_of_week}-${s.start_time}-${s.end_time}-${s.name ?? ''}`,
          name: s.name,
          start_time: s.start_time,
          end_time: s.end_time,
          day_of_week: s.day_of_week,
          subject_id: s.subject_id,
          class_id: s.class_id,
          teacher_id: s.teacher_id,
          subject_name: (s as any).subject_name,
          teacher_name: (s as any).teacher_name,
        })),
        created_at: updated.created_at,
        updated_at: updated.updated_at,
      };
      return result;
    } catch (err) {
      setError(err instanceof Error ? err : new Error(`Failed to update timetable with ID: ${id}`));
      throw err;
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  const getMySchedule = useCallback(async (): Promise<TimeSlot[]> => {
    try {
      setLoading(true);
      setError(null);
      return await apiClient.get<TimeSlot[]>('/academics/schedules/my-schedule');
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch personal schedule'));
      throw err;
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  return useMemo(() => ({
    loading,
    error,
    getTimetables,
    deleteTimetable,
    createTimetable,
    updateTimetable,
    getMySchedule
  }), [loading, error, getTimetables, deleteTimetable, createTimetable, updateTimetable, getMySchedule]);
};
