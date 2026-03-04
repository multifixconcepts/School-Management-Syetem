import { useApiClientWithLoading, createWaitForApiClientReady } from './api-client';
import { useMemo, useCallback } from 'react';

export interface Period {
    id: string;
    semester_id: string;
    name: string;
    period_number: number;
    start_date: string;
    end_date: string;
    is_published: boolean;
    is_active: boolean;
}

export function usePeriodService() {
    const { apiClient } = useApiClientWithLoading();
    const waitForApiClientReady = useMemo(() => createWaitForApiClientReady(apiClient), [apiClient]);

    const getPeriods = useCallback(async (semesterId: string): Promise<Period[]> => {
        const client = await waitForApiClientReady();
        const resp = await client.get<Period[]>(`/academics/periods?semester_id=${semesterId}`);
        return Array.isArray(resp) ? resp : [];
    }, [waitForApiClientReady]);

    const togglePublication = useCallback(async (periodId: string): Promise<Period> => {
        const client = await waitForApiClientReady();
        return client.post<Period>(`/academics/periods/${periodId}/toggle-published`, {});
    }, [waitForApiClientReady]);

    const updatePeriod = useCallback(async (periodId: string, payload: Partial<Period>): Promise<Period> => {
        const client = await waitForApiClientReady();
        return client.put<Period>(`/academics/periods/${periodId}`, payload);
    }, [waitForApiClientReady]);

    const createPeriod = useCallback(async (payload: Omit<Period, 'id' | 'is_published' | 'is_active'>): Promise<Period> => {
        const client = await waitForApiClientReady();
        return client.post<Period>(`/academics/periods`, payload);
    }, [waitForApiClientReady]);

    const removePeriod = useCallback(async (periodId: string): Promise<void> => {
        const client = await waitForApiClientReady();
        return client.delete(`/academics/periods/${periodId}`);
    }, [waitForApiClientReady]);

    const service = useMemo(() => ({
        getPeriods,
        togglePublication,
        updatePeriod,
        createPeriod,
        removePeriod
    }), [getPeriods, togglePublication, updatePeriod, createPeriod, removePeriod]);

    return service;
}
