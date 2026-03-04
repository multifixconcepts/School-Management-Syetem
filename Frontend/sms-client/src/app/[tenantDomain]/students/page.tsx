'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTenantNavigation } from '@/hooks/use-tenant';
import StudentList from '@/components/students/student-list';
import StudentForm from '@/components/students/student-form';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FileText } from 'lucide-react';
import { useStudentService } from '@/services/api/student-service';
import { useEnrollmentService } from '@/services/api/enrollment-service';
import { usePromotionService, PromotionEvaluationResult } from '@/services/api/promotion-service';
import { useCurrentEnrollment } from '@/hooks/queries/enrollments';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Student, StudentUpdate } from '@/types/student';
import type { Enrollment } from '@/types/enrollment';
import ConfirmationModal from '@/components/common/ConfirmationModal';
import StudentAssignmentDialog from '@/components/students/student-assignment-dialog';
import RemedialPanel from '@/components/students/remedial-panel';
import { useDeleteStudent, useUpdateStudent, useBulkDeleteStudents, useUpdateStudentStatus } from '@/hooks/queries/students';
import { PasswordResetDialog } from '@/components/common/PasswordResetDialog';

export default function StudentsPage() {
  const router = useRouter();
  const { createTenantPath } = useTenantNavigation();
  const queryClient = useQueryClient();
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [viewingStudent, setViewingStudent] = useState<Student | null>(null);
  const [deletingStudent, setDeletingStudent] = useState<Student | null>(null);
  const [deletingMany, setDeletingMany] = useState<string[] | null>(null);
  const [assigningStudent, setAssigningStudent] = useState<Student | null>(null);
  const [resettingStudent, setResettingStudent] = useState<Student | null>(null);
  const [statusTogglingStudent, setStatusTogglingStudent] = useState<Student | null>(null);

  // ... (previous code)

  const handleStatusToggle = async (student: Student) => {
    setStatusTogglingStudent(student);
  };

  const confirmStatusToggle = async () => {
    if (!statusTogglingStudent) return;

    const newStatus = statusTogglingStudent.status === 'active' ? 'inactive' : 'active';

    updateStatusMutation.mutate({ id: statusTogglingStudent.id, status: newStatus }, {
      onSuccess: () => {
        toast.success(`Student ${newStatus === 'active' ? 'restored' : 'archived'} successfully`);
        setStatusTogglingStudent(null);
      },
      onError: (error) => {
        console.error('Failed to update student status:', error);
        toast.error("Failed to update student status");
        setStatusTogglingStudent(null);
      }
    });
  };
  const studentService = useStudentService();
  const enrollmentService = useEnrollmentService();

  const deleteStudentMutation = useDeleteStudent();
  const updateStudentMutation = useUpdateStudent();
  const updateStatusMutation = useUpdateStudentStatus();
  const bulkDeleteMutation = useBulkDeleteStudents();
  const { data: currentEnrollment, isLoading: enrollmentLoading } = useCurrentEnrollment(viewingStudent?.id || '');

  const { getPromotionStatusByEnrollment, reEvaluateEnrollment } = usePromotionService();

  const { data: promotionStatus } = useQuery({
    queryKey: ['promotions', 'status', currentEnrollment?.id],
    queryFn: () => getPromotionStatusByEnrollment(currentEnrollment!.id),
    enabled: !!currentEnrollment?.id,
  });

  const displayEntityName = (value: string | { name?: string } | null | undefined): string => {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object' && 'name' in value) {
      return (value as { name?: string }).name ?? '-';
    }
    return '-';
  };

  const handleEditSuccess = () => {
    setEditingStudent(null);
    toast.success("Student updated successfully");
  };

  const handleEdit = (student: Student) => {
    setEditingStudent(student);
  };

  const handleView = (student: Student) => {
    setViewingStudent(student);
  };

  const handleDelete = (student: Student) => {
    setDeletingStudent(student);
  };

  const handleAddNew = () => {
    router.push(createTenantPath('/students/new'));
  };

  const handleAssign = (student: Student) => {
    setAssigningStudent(student);
  };

  const handleAssignmentSuccess = () => {
    setAssigningStudent(null);
    // query invalidation handled by mutation or manual if it was a separate service call? 
    // Assignment likely uses a different service. We might want to invalidate 'students' here just in case assignments affect list view.
    queryClient.invalidateQueries({ queryKey: ['students'] });
    queryClient.invalidateQueries({ queryKey: ['enrollments'] }); // Enrollment changes
    toast.success("Student assigned successfully");
  };

  const handleResetPassword = (student: Student) => {
    setResettingStudent(student);
  };

  const handlePasswordResetSubmit = async (userId: string, newPassword: string, newEmail?: string) => {
    try {
      const updatePayload: StudentUpdate = {};
      if (newPassword) updatePayload.password = newPassword;
      if (newEmail) updatePayload.email = newEmail;

      await updateStudentMutation.mutateAsync({
        id: userId,
        student: updatePayload
      });
    } catch (error) {
      throw error;
    }
  };

  const handleBulkDelete = (ids: string[]) => {
    setDeletingMany(ids);
  };

  const confirmBulkDelete = async () => {
    if (!deletingMany || deletingMany.length === 0) return;

    bulkDeleteMutation.mutate(deletingMany, {
      onSuccess: (result: any) => { // Assuming result triggers onSuccess
        // Adjust based on actual return type if needed, but hook handles invalidation.
        // If result contains error info (partial failure), we handle it here.
        // The service returns { deleted_count, errors }.
        // Mutation onSuccess receives that data.
        if (result && result.errors && result.errors.length > 0) {
          toast.error(`Deleted ${result.deleted_count} students. ${result.errors.length} failed due to existing enrollments.`);
        } else {
          toast.success(`Successfully deleted students`);
        }
        setDeletingMany(null);
      },
      onError: (error) => {
        console.error('Bulk delete failed:', error);
        toast.error('Failed to perform bulk deletion');
      }
    });
  };

  const confirmDelete = async () => {
    if (!deletingStudent) return;

    deleteStudentMutation.mutate(deletingStudent.id, {
      onSuccess: () => {
        setDeletingStudent(null);
        toast.success('Student deleted successfully');
      },
      onError: (error: any) => {
        console.error('Error deleting student:', error);
        const detail = error.response?.data?.detail || 'Failed to delete student';
        toast.error(detail);
      }
    });
  };



  const onReEvaluate = async () => {
    try {
      if (!currentEnrollment?.id) return;
      await reEvaluateEnrollment(currentEnrollment.id);
      queryClient.invalidateQueries({
        queryKey: ['promotions', 'status', currentEnrollment.id]
      });
      toast.success('Re-evaluated promotion status');
    } catch (err) {
      console.error('Re-evaluate failed', err);
      toast.error('Failed to re-evaluate status');
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Students</h1>
          <p className="text-gray-600 mt-1">Manage your school&apos;s student enrollment</p>
        </div>

        <div className="flex gap-3">
          <Button
            variant="default"
            className="rounded-lg px-6 py-2.5 font-medium"
            onClick={handleAddNew}
          >
            Add Student
          </Button>
          <Button
            variant="black"
            className="flex items-center gap-2 bg-black hover:bg-gray-800 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-200 rounded-lg px-6 py-2.5 font-medium"
            onClick={() => router.push(createTenantPath('/academics/enrollments'))}
          >
            <FileText className="h-4 w-4" />
            Manage Enrollments
          </Button>
        </div>
      </div>

      {/* Edit Student Dialog */}
      <Dialog open={!!editingStudent} onOpenChange={(open) => !open && setEditingStudent(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Student</DialogTitle>
          </DialogHeader>
          {editingStudent && (
            <StudentForm
              student={editingStudent}
              mode="edit"
              onSave={handleEditSuccess}
              onCancel={() => setEditingStudent(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* View Student Dialog */}
      <Dialog open={!!viewingStudent} onOpenChange={(open) => !open && setViewingStudent(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Student Details</DialogTitle>
          </DialogHeader>
          {/* View Student Dialog snippet */}
          {viewingStudent && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="font-medium">Name:</label>
                  <p>{viewingStudent.firstName} {viewingStudent.lastName}</p>
                </div>
                <div>
                  <label className="font-medium">Email:</label>
                  <p>{viewingStudent.email}</p>
                </div>
                <div>
                  <label className="font-medium">Admission Number:</label>
                  <p>{viewingStudent.admission_number}</p>
                </div>
                <div>
                  <label className="font-medium">Grade:</label>
                  <p>{enrollmentLoading ? 'Loading…' : displayEntityName(currentEnrollment?.grade)}</p>
                </div>
                <div>
                  <label className="font-medium">Section:</label>
                  <p>{enrollmentLoading ? 'Loading…' : displayEntityName(currentEnrollment?.section)}</p>
                </div>
                <div>
                  <label className="font-medium">Academic Year:</label>
                  <p>{enrollmentLoading ? 'Loading…' : displayEntityName(currentEnrollment?.academic_year)}</p>
                </div>
                <div>
                  <label className="font-medium">Status:</label>
                  <p className={`capitalize ${viewingStudent.status === 'active' ? 'text-green-600' : 'text-red-600'
                    }`}>
                    {viewingStudent.status}
                  </p>
                </div>
                <div>
                  <label className="font-medium">Promotion Status:</label>
                  <p className="flex items-center gap-2">
                    {promotionStatus?.status ? (
                      <span className={
                        promotionStatus.status === 'Eligible' ? 'text-green-600' :
                          promotionStatus.status === 'Conditional' ? 'text-amber-600' :
                            'text-red-600'
                      }>
                        {promotionStatus.status}
                      </span>
                    ) : (enrollmentLoading ? 'Loading…' : '-')}
                    <Button size="sm" variant="outline" onClick={onReEvaluate} disabled={!currentEnrollment?.id}>
                      Re-evaluate
                    </Button>
                  </p>
                </div>
                {/* Small remedial management UI */}
                {currentEnrollment?.id && (
                  <div className="mt-4">
                    <RemedialPanel enrollmentId={currentEnrollment.id} />
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmationModal
        isOpen={!!deletingStudent}
        onCancel={() => setDeletingStudent(null)}
        onConfirm={confirmDelete}
        title="Delete Student"
        message={`Are you sure you want to delete ${deletingStudent?.firstName} ${deletingStudent?.lastName}? This action cannot be undone.`}
        confirmButtonText="Delete"
        cancelButtonText="Cancel"
        confirmButtonColor="red"
      />

      <ConfirmationModal
        isOpen={!!deletingMany && deletingMany.length > 0}
        onCancel={() => setDeletingMany(null)}
        onConfirm={confirmBulkDelete}
        title="Bulk Delete Students"
        message={`Are you sure you want to delete ${deletingMany?.length} students? This action cannot be undone and will only succeed for students without active enrollments.`}
        confirmButtonText="Delete All"
        cancelButtonText="Cancel"
        confirmButtonColor="red"
      />

      <ConfirmationModal
        isOpen={!!statusTogglingStudent}
        onCancel={() => setStatusTogglingStudent(null)}
        onConfirm={confirmStatusToggle}
        title={statusTogglingStudent?.status === 'active' ? 'Archive Student' : 'Restore Student'}
        message={`Are you sure you want to ${statusTogglingStudent?.status === 'active' ? 'archive' : 'restore'} ${statusTogglingStudent?.firstName} ${statusTogglingStudent?.lastName}?`}
        confirmButtonText={statusTogglingStudent?.status === 'active' ? 'Archive' : 'Restore'}
        cancelButtonText="Cancel"
        confirmButtonColor={statusTogglingStudent?.status === 'active' ? 'red' : 'blue'}
      />

      {/* Student Assignment Dialog */}
      <StudentAssignmentDialog
        student={assigningStudent}
        isOpen={!!assigningStudent}
        onClose={() => setAssigningStudent(null)}
        onSuccess={handleAssignmentSuccess}
      />

      {/* Student List */}
      <StudentList
        // refreshKey removed

        onEdit={handleEdit}
        onView={handleView}
        onDelete={handleDelete}
        onStatusToggle={handleStatusToggle}
        onAssign={handleAssign}
        onBulkDelete={handleBulkDelete}
        onResetPassword={handleResetPassword}
      />

      {/* Password Reset Dialog */}
      {resettingStudent && (
        <PasswordResetDialog
          isOpen={!!resettingStudent}
          onClose={() => setResettingStudent(null)}
          userId={resettingStudent.id}
          userName={`${resettingStudent.firstName} ${resettingStudent.lastName}`}
          userEmail={resettingStudent.email}
          userType="Student"
          onReset={handlePasswordResetSubmit}
        />
      )}
    </div>
  );
}