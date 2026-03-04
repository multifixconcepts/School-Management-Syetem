import { useApiClientWithLoading, createWaitForApiClientReady } from './api-client';
import { useMemo } from 'react';

type Schedule = {
  id: string;
  day_of_week: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  start_time: string;
  end_time: string;
  period?: number;
  class_id: string;
};

function getDayOfWeekFromIsoDate(isoDate: string): Schedule['day_of_week'] {
  const d = new Date(isoDate);
  const dow = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][d.getUTCDay()];
  return dow as Schedule['day_of_week'];
}

export function useScheduleService() {
  const { apiClient, isLoading: apiLoading } = useApiClientWithLoading();
  const waitForApiClientReady = useMemo(() => createWaitForApiClientReady(apiClient), [apiClient]);

  return useMemo(() => ({
    // List schedules with filters
    getSchedules: async (filters: { class_id?: string; day_of_week?: Schedule['day_of_week']; period?: number } = {}): Promise<Schedule[]> => {
      const client = await waitForApiClientReady();
      const qs = new URLSearchParams();
      if (filters.class_id) qs.append('class_id', filters.class_id);
      if (filters.day_of_week) qs.append('day_of_week', filters.day_of_week);
      if (filters.period !== undefined) qs.append('period', String(filters.period));
      const url = `/academics/schedules${qs.toString() ? `?${qs.toString()}` : ''}`;
      return client.get<Schedule[]>(url);
    },
    // Resolve a single schedule_id
    resolveScheduleIdFor: async (params: { class_id: string; isoDate: string; period?: number }): Promise<string> => {
      const client = await waitForApiClientReady();
      const day_of_week = getDayOfWeekFromIsoDate(params.isoDate);
      const schedules = await client.get<Schedule[]>(
        `/academics/schedules?class_id=${params.class_id}&day_of_week=${day_of_week}${params.period !== undefined ? `&period=${params.period}` : ''}`
      );
      if (!schedules.length) throw new Error(`No schedule for class ${params.class_id} on ${day_of_week}${params.period !== undefined ? ` period ${params.period}` : ''}`);
      return schedules[0].id;
    },
    // Get personal schedule for teacher
    getMySchedule: async (): Promise<Schedule[]> => {
      const client = await waitForApiClientReady();
      return client.get<Schedule[]>('/academics/schedules/my-schedule');
    },
  }), [waitForApiClientReady]);
}