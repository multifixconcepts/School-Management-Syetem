'use client';

import React from 'react';
import { Enrollment } from '@/types/enrollment';
import { Student } from '@/types/student';
import { Button } from '@/components/ui/button';
import PermissionGuard from '@/components/auth/permission-guard';
import { Pencil, Trash2, Archive, RotateCcw } from 'lucide-react';

interface Props {
  enrollments: Enrollment[];
  loading: boolean;
  totalItems: number;
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  onEdit: (e: Enrollment) => void;
  onDelete: (id: string) => Promise<void>;
  onPageChange: (page: number) => void;
  students: Student[];
  onTransfer: (e: Enrollment) => void;
  onPromote: (e: Enrollment) => void;
  onArchive: (id: string) => Promise<void>;
  onUnarchive: (id: string) => Promise<void>;
}

export default function EnrollmentTable({
  enrollments,
  loading,
  totalItems,
  currentPage,
  totalPages,
  itemsPerPage,
  onEdit,
  onDelete,
  onPageChange,
  students,
  onTransfer,
  onPromote,
  onArchive,
  onUnarchive,
}: Props) {
  const toDisplay = (value: string | { name: string } | undefined): string => {
    if (!value) return '';
    return typeof value === 'string' ? value : (value.name ?? '');
  };

  const studentById = React.useMemo(() => {
    const map = new Map<string, Student>();
    for (const s of students) {
      map.set((s as any).id, s);
    }
    return map;
  }, [students]);

  return (
    <div className="rounded-md border bg-white shadow-sm overflow-hidden">
      <div className="p-0">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2"></div>
            <div className="text-sm text-muted-foreground">Loading enrollments...</div>
          </div>
        ) : enrollments.length === 0 ? (
          <div className="text-sm text-muted-foreground py-20 text-center">No enrollments found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/30 border-b">
                <tr className="text-left text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  <th className="p-4 bg-muted/50 sticky left-0 z-10">Student</th>
                  <th className="p-4">Year</th>
                  <th className="p-4">Grade</th>
                  <th className="p-4">Section</th>
                  <th className="p-4 text-center">Sem</th>
                  <th className="p-4">Date</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Promotion</th>
                  <th className="p-4 text-right bg-muted/50 sticky right-0 z-10">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {enrollments.map(e => {
                  const student = e.student || studentById.get(e.student_id);
                  const promoStatus = e.promotion_status?.status;

                  return (
                    <tr key={e.id} className="hover:bg-muted/5 transition-colors group">
                      <td className="p-4 sticky left-0 bg-white/80 backdrop-blur-sm z-10 group-hover:bg-muted/10">
                        {student ? (
                          <div className="flex flex-col min-w-[140px]">
                            <span className="font-bold text-foreground text-sm leading-tight">
                              {student.firstName} {student.lastName}
                            </span>
                            <span className="text-[10px] uppercase font-mono text-muted-foreground mt-0.5">
                              {student.admission_number || 'No ID'}
                            </span>
                          </div>
                        ) : (
                          <span className="font-mono text-xs text-muted-foreground">{e.student_id.substring(0, 8)}...</span>
                        )}
                      </td>
                      <td className="p-4 text-muted-foreground whitespace-nowrap text-xs">{toDisplay(e.academic_year)}</td>
                      <td className="p-4 whitespace-nowrap">
                        <span className="px-2 py-1 rounded bg-secondary/30 text-secondary-foreground font-semibold text-xs border border-secondary/20">
                          {toDisplay(e.grade)}
                        </span>
                      </td>
                      <td className="p-4 text-center whitespace-nowrap font-medium">{toDisplay(e.section)}</td>
                      <td className="p-4 text-center font-bold text-primary/80">{e.semester || '1'}</td>
                      <td className="p-4 text-muted-foreground whitespace-nowrap font-mono text-[10px]">
                        {e.enrollment_date ? e.enrollment_date.split('T')[0] : 'N/A'}
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter border ${e.status === 'active' ? 'bg-green-50 text-green-700 border-green-200' :
                          e.status === 'withdrawn' ? 'bg-red-50 text-red-700 border-red-200' :
                            e.status === 'graduated' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-700 border-gray-200'
                          }`}>
                          {e.status}
                        </span>
                      </td>
                      <td className="p-4">
                        {promoStatus ? (
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter border transition-all ${promoStatus === 'Eligible' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            promoStatus === 'Conditional' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                              'bg-rose-50 text-rose-700 border-rose-200'
                            }`}>
                            {promoStatus}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-[10px] italic opacity-40">Not evaluated</span>
                        )}
                      </td>
                      <td className="p-4 sticky right-0 bg-white/80 backdrop-blur-sm z-10 group-hover:bg-muted/10 shadow-[-4px_0_12px_rgba(0,0,0,0.02)]">
                        <div className="flex gap-1 justify-end items-center">
                          <Button size="icon" variant="ghost" onClick={() => onEdit(e)} className="h-7 w-7 text-muted-foreground hover:text-foreground" title="Edit">
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => onPromote(e)} className="h-7 text-[10px] font-bold px-2 hover:bg-primary/5 hover:text-primary transition-colors" title="Promote">
                            Promote
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => onTransfer(e)} className="h-7 text-[10px] font-bold px-2 hover:bg-amber-50 hover:text-amber-700 transition-colors" title="Transfer">
                            Transfer
                          </Button>
                          <PermissionGuard requiredRole="admin">
                            {e.is_active ? (
                              <Button size="icon" variant="ghost" onClick={() => onArchive(e.id)} className="h-7 w-7 text-amber-500 hover:text-amber-700 hover:bg-amber-50" title="Archive">
                                <Archive className="h-3 w-3" />
                              </Button>
                            ) : (
                              <Button size="icon" variant="ghost" onClick={() => onUnarchive(e.id)} className="h-7 w-7 text-green-500 hover:text-green-700 hover:bg-green-50" title="Unarchive">
                                <RotateCcw className="h-3 w-3" />
                              </Button>
                            )}
                          </PermissionGuard>
                          <Button size="icon" variant="ghost" onClick={() => onDelete(e.id)} className="h-7 w-7 text-rose-400 hover:text-rose-700 hover:bg-rose-50" title="Delete">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between p-4 bg-muted/20 border-t">
        <div className="text-[11px] text-muted-foreground">
          Showing <span className="font-semibold text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span>-
          <span className="font-semibold text-foreground">{Math.min(currentPage * itemsPerPage, totalItems)}</span> of <span className="font-semibold text-foreground">{totalItems}</span> total enrollments
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
            className="h-8 text-[11px]"
          >
            ← Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
            className="h-8 text-[11px]"
          >
            Next →
          </Button>
        </div>
      </div>
    </div>
  );
}
