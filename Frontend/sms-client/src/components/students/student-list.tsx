import React, { useState, useMemo, useEffect } from 'react';
import { Search, Eye, Edit, Trash2, UserCheck, UserX, UserPlus, KeyRound, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useTenantNavigation } from '@/hooks/use-tenant';
import { Student } from '@/types/student';
import { Enrollment } from '@/types/enrollment';
import { useStudents } from '@/hooks/queries/students';
import { useBulkCurrentEnrollments, useEnrollmentGrades, useEnrollmentSections } from '@/hooks/queries/enrollments';
import { useQueryClient } from '@tanstack/react-query';
import Pagination from '@/components/common/Pagination';

interface StudentListProps {
  onEdit?: (student: Student) => void;
  onView?: (student: Student) => void;
  onDelete?: (student: Student) => void;
  onStatusToggle?: (student: Student) => Promise<void>;
  onAssign?: (student: Student) => void;
  onBulkDelete?: (ids: string[]) => void;
  onResetPassword?: (student: Student) => void;
}

export default function StudentList({ onEdit, onView, onDelete, onStatusToggle, onAssign, onBulkDelete, onResetPassword }: StudentListProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState({
    search: '',
    grade: 'all',
    section: 'all',
    status: 'all',
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { createTenantPath } = useTenantNavigation();
  const queryClient = useQueryClient();

  const queryParams = useMemo(() => {
    const params: { grade?: string; section?: string; status?: string; search?: string; skip: number; limit: number } = {
      skip: (currentPage - 1) * pageSize,
      limit: pageSize
    };
    if (filters.grade && filters.grade !== 'all') params.grade = filters.grade;
    if (filters.section && filters.section !== 'all') params.section = filters.section;
    if (filters.status && filters.status !== 'all') params.status = filters.status;
    if (filters.search) params.search = filters.search;
    return params;
  }, [filters, currentPage, pageSize]);

  const { data: studentsData, isLoading: studentsLoading, isError, error: studentsError } = useStudents(queryParams);

  const students = useMemo(() => studentsData?.items || [], [studentsData]);
  const totalItems = studentsData?.total || 0;
  const totalPages = Math.ceil(totalItems / pageSize);

  const studentIds = useMemo(() => students.map((s: Student) => s.id), [students]);

  const { data: enrollmentsMap = new Map<string, Enrollment>(), isLoading: enrollmentsLoading } = useBulkCurrentEnrollments(studentIds);

  const { data: gradeOptions = [] } = useEnrollmentGrades();
  const { data: sectionOptions = [] } = useEnrollmentSections();

  const toggleSelectAll = () => {
    if (selectedIds.size === students.length && students.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(students.map((s: Student) => s.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setSelectedIds(new Set()); // Clear selection on filter change
    setCurrentPage(1); // Reset to first page on filter change
  };

  const handleRetry = () => {
    queryClient.invalidateQueries({ queryKey: ['students'] });
    queryClient.invalidateQueries({ queryKey: ['enrollments'] });
  };

  if (studentsLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading students...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        <p>{studentsError instanceof Error ? studentsError.message : 'An error occurred'}</p>
        <button
          onClick={handleRetry}
          className="mt-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters and Bulk Actions */}
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 flex-grow">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search students..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <select
              value={filters.grade}
              onChange={(e) => handleFilterChange('grade', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Grades</option>
              {gradeOptions.map((g) => (
                <option key={g.id} value={g.name}>{g.name}</option>
              ))}
            </select>

            <select
              value={filters.section}
              onChange={(e) => handleFilterChange('section', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Sections</option>
              {sectionOptions.map((s) => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>

            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="graduated">Graduated</option>
              <option value="withdrawn">Withdrawn</option>
            </select>
          </div>

          {selectedIds.size > 0 && onBulkDelete && (
            <div className="ml-4 flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
              <span className="text-sm font-medium text-gray-700">{selectedIds.size} selected</span>
              <button
                onClick={() => onBulkDelete(Array.from(selectedIds))}
                className="bg-red-50 text-red-600 hover:bg-red-100 px-3 py-2 rounded-md border border-red-200 flex items-center gap-2 transition-colors"
                title="Bulk Delete"
              >
                <Trash2 className="h-4 w-4" />
                <span>Bulk Delete</span>
              </button>
            </div>
          )}
        </div>
        <div className="mt-2 text-xs text-gray-500">
          Filters apply to the student’s current enrollment (grade/section).
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 table-fixed">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left sticky left-0 z-10 bg-gray-50 border-r w-16">
                  <input
                    type="checkbox"
                    checked={students.length > 0 && selectedIds.size === students.length}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-16 z-10 bg-gray-50 border-r w-64 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                  Student
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-40">
                  Admission No.
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-40">
                  Academic Year
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-48">
                  Grade/Section
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-48">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {students.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    <div className="flex flex-col items-center">
                      <p className="text-lg font-medium">No students found</p>
                      <p className="text-sm">Students are added during enrollment. Manage enrollments to onboard.</p>
                      <Link
                        href={createTenantPath('/academics/enrollments')}
                        className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
                      >
                        Manage Enrollments
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : (
                students.map((student: Student) => {
                  const enrollment = enrollmentsMap.get(student.id);
                  const isSelected = selectedIds.has(student.id);
                  return (
                    <tr key={student.id} className={`hover:bg-gray-50 transition-colors ${isSelected ? 'bg-blue-50/30 font-medium' : ''}`}>
                      <td className="px-6 py-4 whitespace-nowrap sticky left-0 z-10 bg-inherit border-r">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(student.id)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap sticky left-16 z-10 bg-inherit border-r shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            {student.photo ? (
                              <div className="h-10 w-10 relative overflow-hidden rounded-full border border-gray-100 shadow-sm">
                                <img
                                  src={student.photo}
                                  alt={`${student.firstName} ${student.lastName}`}
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center border border-blue-200">
                                <span className="text-sm font-semibold text-blue-600">
                                  {student.firstName?.charAt(0)}{student.lastName?.charAt(0)}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {student.firstName} {student.lastName}
                            </div>
                            <div className="text-sm text-gray-500">{student.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {student.admission_number}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {enrollmentsLoading ? (
                          <span className="text-gray-400 animate-pulse">Loading...</span>
                        ) : (
                          (() => {
                            if (enrollment) {
                              const yearLabel =
                                typeof enrollment.academic_year === 'string'
                                  ? enrollment.academic_year
                                  : (enrollment.academic_year as any)?.name || 'Unknown Year';
                              return yearLabel;
                            }
                            return 'Not assigned';
                          })()
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {enrollmentsLoading ? (
                          <span className="text-gray-400 animate-pulse">Loading...</span>
                        ) : (
                          (() => {
                            if (enrollment) {
                              const gradeLabel =
                                typeof enrollment.grade === 'string'
                                  ? enrollment.grade
                                  : (enrollment.grade as any)?.name || 'Unknown Grade';
                              const sectionLabel =
                                typeof enrollment.section === 'string'
                                  ? enrollment.section
                                  : (enrollment.section as any)?.name || 'Unknown Section';
                              return `${gradeLabel} - ${sectionLabel}`;
                            }
                            return 'Not assigned';
                          })()
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${student.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : student.status === 'graduated'
                            ? 'bg-blue-100 text-blue-800'
                            : student.status === 'withdrawn'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                          {student.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          {onView && (
                            <button
                              onClick={() => onView(student)}
                              className="text-blue-600 hover:text-blue-900"
                              title="View Details"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          )}
                          {onEdit && (
                            <button
                              onClick={() => onEdit(student)}
                              className="text-indigo-600 hover:text-indigo-900"
                              title="Edit Student"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                          )}
                          {onAssign && (
                            <button
                              onClick={() => onAssign(student)}
                              className="text-green-600 hover:text-green-900"
                              title="Assign to Grade/Section"
                            >
                              <UserPlus className="h-4 w-4" />
                            </button>
                          )}
                          {onResetPassword && (
                            <button
                              onClick={() => onResetPassword(student)}
                              className="text-amber-600 hover:text-amber-900"
                              title="Reset Password"
                            >
                              <KeyRound className="h-4 w-4" />
                            </button>
                          )}
                          {onStatusToggle && (
                            <button
                              onClick={() => onStatusToggle(student)}
                              className={`${student.status === 'active'
                                ? 'text-red-600 hover:text-red-900'
                                : 'text-green-600 hover:text-green-900'
                                }`}
                              title={student.status === 'active' ? 'Archive Student' : 'Restore Student'}
                            >
                              {student.status === 'active' ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                            </button>
                          )}
                          {onDelete && (
                            <button
                              onClick={() => onDelete(student)}
                              className="text-red-600 hover:text-red-900"
                              title="Delete Student"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        {totalItems > 0 && (
          <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Showing <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> to{' '}
              <span className="font-medium">{Math.min(currentPage * pageSize, totalItems)}</span> of{' '}
              <span className="font-medium">{totalItems}</span> students
            </div>
            <Pagination
              currentPage={currentPage}
              totalItems={totalItems}
              itemsPerPage={pageSize}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </div>
    </div>
  );
}
