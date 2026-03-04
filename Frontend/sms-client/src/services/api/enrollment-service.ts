import { useApiClientWithLoading, createWaitForApiClientReady } from './api-client';
import {
  Enrollment, EnrollmentCreate, EnrollmentUpdate, BulkEnrollmentCreate,
  EnrollmentFilters, PaginatedEnrollments, AcademicYear, Grade, Section
} from '@/types/enrollment';
import { useMemo } from 'react';
import type { ApiClient } from './api-client';

export function useEnrollmentService() {
  const { apiClient, isLoading: apiLoading } = useApiClientWithLoading();
  // Memoize the waiter function to ensure stability
  const waitForApiClientReady = useMemo(() => createWaitForApiClientReady(apiClient), [apiClient]);

  const mapStudentMinimal = (s: any): any => ({
    ...s,
    firstName: s.firstName || s.first_name || '',
    lastName: s.lastName || s.last_name || '',
  });

  const mapEnrollment = (e: any): Enrollment => ({
    ...e,
    student: e.student ? mapStudentMinimal(e.student) : undefined,
  });

  const service = useMemo(() => ({
    getEnrollments: async (
      skip: number = 0,
      limit: number = 10,
      filters?: EnrollmentFilters,
      includeArchived?: boolean
    ): Promise<PaginatedEnrollments> => {
      const client: ApiClient = await waitForApiClientReady();

      const sanitizedFilters: Record<string, string> = {};
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== 'undefined' && value !== 'null' && value !== '') {
            sanitizedFilters[key] = value.toString();
          }
        });
      }

      const params = new URLSearchParams({
        skip: skip.toString(),
        limit: limit.toString(),
        ...sanitizedFilters
      });

      if (includeArchived || filters?.include_archived === 'true') {
        params.set('include_archived', 'true');
      }
      const resp = await client.get<PaginatedEnrollments>(`/academics/enrollments?${params}`);
      return {
        ...resp,
        items: resp.items.map(mapEnrollment),
      };
    },
    getEnrollmentById: async (id: string): Promise<Enrollment> => {
      const client: ApiClient = await waitForApiClientReady();
      const resp = await client.get<any>(`/academics/enrollments/${id}`);
      return mapEnrollment(resp);
    },
    createEnrollment: async (enrollment: EnrollmentCreate): Promise<Enrollment> => {
      const client: ApiClient = await waitForApiClientReady();
      const resp = await client.post<any>('/academics/enrollments', enrollment);
      return mapEnrollment(resp);
    },
    updateEnrollment: async (id: string, enrollment: EnrollmentUpdate): Promise<Enrollment> => {
      const client: ApiClient = await waitForApiClientReady();
      const resp = await client.put<any>(`/academics/enrollments/${id}`, enrollment);
      return mapEnrollment(resp);
    },
    deleteEnrollment: async (id: string): Promise<void> => {
      const client: ApiClient = await waitForApiClientReady();
      return client.delete<void>(`/academics/enrollments/${id}`);
    },
    // Bulk operations
    bulkCreateEnrollments: async (bulkEnrollment: BulkEnrollmentCreate): Promise<any> => {
      const client: ApiClient = await waitForApiClientReady();
      const resp = await client.post<any>('/academics/enrollments/bulk', bulkEnrollment);
      if (Array.isArray(resp)) {
        return resp.map(mapEnrollment);
      }
      return {
        ...resp,
        created: Array.isArray(resp.created) ? resp.created.map(mapEnrollment) : []
      };
    },
    // Student-specific enrollments
    getStudentEnrollments: async (studentId: string): Promise<Enrollment[]> => {
      const client: ApiClient = await waitForApiClientReady();
      const resp = await client.get<any[]>(`/people/students/${studentId}/enrollments`);
      return resp.map(mapEnrollment);
    },
    getCurrentEnrollment: async (studentId: string): Promise<Enrollment | null> => {
      const client: ApiClient = await waitForApiClientReady();
      const getName = (v: string | { name?: string } | null | undefined): string => {
        if (typeof v === 'string') return v;
        if (v && typeof v === 'object' && 'name' in v) {
          return (v as { name?: string }).name ?? '';
        }
        return '';
      };
      const normalizeEnrollment = (enrollment: any | null): Enrollment | null => {
        if (!enrollment) return null;
        const e = mapEnrollment(enrollment);
        return {
          ...e,
          grade: getName(e.grade) || (e.grade as string) || '',
          section: getName(e.section) || (e.section as string) || '',
          academic_year: getName(e.academic_year) || (e.academic_year as string) || '',
        };
      };

      try {
        const response = await client.get<any>(
          `/people/students/${studentId}/enrollments/current`
        );

        let enrollment: any | null = null;
        if (response && Array.isArray(response) && response.length > 0) {
          enrollment = response[0];
        } else if (response && (response as { enrollment: any }).enrollment) {
          enrollment = (response as { enrollment: any }).enrollment;
        } else if (response && (response as any).id) {
          enrollment = response as any;
        }

        return normalizeEnrollment(enrollment);
      } catch (error) {
        console.warn(`Failed to get current enrollment for student ${studentId}:`, error);
        return null;
      }
    },


    // Academic data
    getAcademicYears: async (): Promise<AcademicYear[]> => {
      const client: ApiClient = await waitForApiClientReady();
      const resp = await client.get<AcademicYear[]>('/academics/academic-years');
      return Array.isArray(resp) ? resp : [];
    },
    getCurrentAcademicYear: async (): Promise<AcademicYear | null> => {
      const client: ApiClient = await waitForApiClientReady();
      return client.get<AcademicYear | null>('/academics/academic-years/current');
    },
    getGrades: async (): Promise<Grade[]> => {
      const client: ApiClient = await waitForApiClientReady();
      const resp = await client.get<Grade[]>('/academics/academic-grades');
      return Array.isArray(resp) ? resp : [];
    },
    getSections: async (): Promise<Section[]> => {
      const client: ApiClient = await waitForApiClientReady();
      const resp = await client.get<Section[]>('/academics/sections');
      return Array.isArray(resp) ? resp : [];
    },

    // Consolidated (single) bulk current enrollments implementation
    getBulkCurrentEnrollments: async (studentIds: string[]): Promise<Map<string, Enrollment>> => {
      const client: ApiClient = await waitForApiClientReady();
      const enrollmentMap = new Map<string, Enrollment>();

      const getName = (v: string | { name?: string } | null | undefined): string => {
        if (typeof v === 'string') return v;
        if (v && typeof v === 'object' && 'name' in v) {
          return (v as { name?: string }).name ?? '';
        }
        return '';
      };
      const normalizeEnrollment = (enrollment: any | null): Enrollment | null => {
        if (!enrollment) return null;
        const e = mapEnrollment(enrollment);
        return {
          ...e,
          grade: getName(e.grade) || (e.grade as string) || '',
          section: getName(e.section) || (e.section as string) || '',
          academic_year: getName(e.academic_year) || (e.academic_year as string) || '',
        };
      };

      if (!studentIds?.length) {
        return enrollmentMap;
      }

      try {
        type BulkCurrentEnrollmentsResponse = { enrollments: Record<string, any | null> };
        const response = await client.post<BulkCurrentEnrollmentsResponse>(
          '/people/students/bulk-enrollments',
          { student_ids: studentIds }
        );

        if (response?.enrollments) {
          Object.entries(response.enrollments).forEach(([serverKey, enrollmentVal]) => {
            const enrollment = enrollmentVal ?? null;
            if (enrollment) {
              const studentKey = enrollment.student_id || serverKey;
              const normalized = normalizeEnrollment(enrollment);
              if (normalized) {
                enrollmentMap.set(studentKey, normalized);
              }
            }
          });
          return enrollmentMap;
        }
      } catch (bulkError) {
        console.warn('Bulk enrollment endpoint failed, falling back to individual requests:', bulkError);
      }

      // Fallback: individual fetch per student (batched)
      const batchSize = 10;
      for (let i = 0; i < studentIds.length; i += batchSize) {
        const batch = studentIds.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (studentId) => {
            try {
              const response = await client.get<any>(
                `/people/students/${studentId}/enrollments/current`
              );

              let enrollment: any | null = null;
              if (Array.isArray(response) && response.length > 0) {
                enrollment = response[0];
              } else if (response && (response as { enrollment: any }).enrollment) {
                enrollment = (response as { enrollment: any }).enrollment;
              } else if (response && (response as any).id) {
                enrollment = response as any;
              }

              const normalized = normalizeEnrollment(enrollment);
              if (normalized) {
                enrollmentMap.set(studentId, normalized);
              }
            } catch (err) {
              console.warn(`Failed to get enrollment for student ${studentId}:`, err);
            }
          })
        );
      }

      return enrollmentMap;
    },
    // Promotion operations
    promoteStudents: async (fromGradeId: string, toGradeId: string, academicYearId: string, studentIds?: string[]): Promise<Enrollment[]> => {
      const client: ApiClient = await waitForApiClientReady();
      const resp = await client.post<any[]>('/academics/enrollments/bulk-promote', {
        student_ids: studentIds ?? [],
        promotion_type: 'grade',
        target_academic_year: academicYearId,
      });
      return resp.map(mapEnrollment);
    },
    // Transfer operations
    transferStudent: async (
      enrollmentId: string,
      transferDate?: string,
      reason?: string
    ): Promise<Enrollment> => {
      const client: ApiClient = await waitForApiClientReady();
      const payload: { status: 'transferred'; withdrawal_date?: string; withdrawal_reason?: string } = { status: 'transferred' };
      if (transferDate) payload.withdrawal_date = transferDate;
      if (reason) payload.withdrawal_reason = reason;
      const resp = await client.put<any>(`/academics/enrollments/${enrollmentId}/status`, payload);
      return mapEnrollment(resp);
    },
    updateEnrollmentStatus: async (
      id: string,
      status: 'active' | 'inactive' | 'transferred' | 'graduated' | 'withdrawn',
      withdrawal_date?: string,
      withdrawal_reason?: string,
      transfer_school?: string
    ): Promise<Enrollment> => {
      const client: ApiClient = await waitForApiClientReady();
      const payload: {
        status: 'active' | 'inactive' | 'transferred' | 'graduated' | 'withdrawn';
        withdrawal_date?: string;
        withdrawal_reason?: string;
        transfer_school?: string;
      } = { status };
      if (withdrawal_date) payload.withdrawal_date = withdrawal_date;
      if (withdrawal_reason) payload.withdrawal_reason = withdrawal_reason;
      if (transfer_school) payload.transfer_school = transfer_school;
      const resp = await client.put<any>(`/academics/enrollments/${id}/status`, payload);
      return mapEnrollment(resp);
    },
    getGraduationCandidates: async (academicYearName: string): Promise<{ student_id: string; enrollment_id: string }[]> => {
      const client: ApiClient = await waitForApiClientReady();
      // Use the implemented enrollments endpoint with filters.
      const params = new URLSearchParams({
        academic_year: academicYearName,
        status: 'active',
        semester: '2'
      });
      const enrollments = await client.get<Enrollment[]>(`/academics/enrollments?${params.toString()}`);
      return enrollments.map(e => ({ student_id: e.student_id, enrollment_id: e.id }));
    },
    graduateStudents: async (academicYearId: string, studentIds: string[]): Promise<void> => {
      const client: ApiClient = await waitForApiClientReady();
      // Graduation is terminal on student status rather than enrollment move
      await client.post<void>('/academics/enrollments/graduate', {
        academic_year_id: academicYearId,
        student_ids: studentIds
      });
    },
  }), [waitForApiClientReady]);

  return service;
}
