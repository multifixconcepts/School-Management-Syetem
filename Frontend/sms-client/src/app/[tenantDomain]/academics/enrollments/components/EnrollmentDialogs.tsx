'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import EnrollmentForm from './EnrollmentForm';
import { Enrollment, AcademicYear, Grade, Section } from '@/types/enrollment';
import { Student } from '@/types/student';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useEnrollmentService } from '@/services/api/enrollment-service';
import BulkEnrollmentForm from './BulkEnrollmentForm';
import { usePromotionService } from '@/services/api/promotion-service';
import { toast } from 'sonner';
import { AppError, ErrorType } from '@/utils/error-utils';

interface Props {
  showCreateDialog: boolean;
  setShowCreateDialog: (v: boolean) => void;
  showBulkDialog: boolean;
  setShowBulkDialog: (v: boolean) => void;
  editingEnrollment: Enrollment | null;
  setEditingEnrollment: (e: Enrollment | null) => void;
  students: Student[];
  academicYears: AcademicYear[];
  grades: Grade[];
  sections: Section[];
  currentAcademicYear: AcademicYear | null;
  onSuccess: () => void;
  hideButtons?: boolean;
}

export default React.forwardRef<
  { setTransferEnrollment: (e: Enrollment | null) => void; setPromoteEnrollment: (e: Enrollment | null) => void },
  Props
>(function EnrollmentDialogs(
  {
    showCreateDialog,
    setShowCreateDialog,
    showBulkDialog,
    setShowBulkDialog,
    editingEnrollment,
    setEditingEnrollment,
    students,
    academicYears,
    grades,
    sections,
    currentAcademicYear,
    onSuccess,
    hideButtons,
  }: Props,
  ref
) {
  const [transferEnrollment, setTransferEnrollment] = React.useState<Enrollment | null>(null);
  const [promoteEnrollment, setPromoteEnrollment] = React.useState<Enrollment | null>(null);
  const [transferDate, setTransferDate] = React.useState<string>(new Date().toISOString().split('T')[0]);
  const [transferReason, setTransferReason] = React.useState<string>('');
  const [transferSchool, setTransferSchool] = React.useState<string>('');
  const [promoteToGradeId, setPromoteToGradeId] = React.useState<string>('');
  const enrollmentService = useEnrollmentService();
  const promotionService = usePromotionService();

  const getStudentDisplay = (studentId: string, enrollment?: Enrollment) => {
    // Try to get from enrollment's nested student first
    if (enrollment?.student) {
      const s = enrollment.student;
      return `${s.firstName || s.first_name} ${s.lastName || s.last_name} (${s.admission_number})`;
    }
    // Fallback to searching the students prop
    const student = students.find(s => s.id === studentId);
    if (student) {
      return `${student.firstName} ${student.lastName} (${student.admission_number})`;
    }
    return studentId;
  };

  React.useImperativeHandle(ref, () => ({
    setTransferEnrollment,
    setPromoteEnrollment,
  }));

  if (hideButtons && !showCreateDialog && !editingEnrollment && !showBulkDialog && !promoteEnrollment && !transferEnrollment) {
    return null;
  }

  return (
    <div className={hideButtons ? "" : "flex gap-2"}>
      {/* Update CTA label to reflect combined flow */}
      {!hideButtons && (
        <>
          <Button onClick={() => setShowCreateDialog(true)}>Add & Enroll</Button>
          <Button variant="outline" onClick={() => setShowBulkDialog(true)}>Bulk Upload</Button>
        </>
      )}

      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-md p-4 w-full max-w-2xl shadow">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-xl font-semibold">Create Enrollment</h2>
              <Button variant="ghost" onClick={() => setShowCreateDialog(false)}>Close</Button>
            </div>
            <EnrollmentForm
              students={students}
              academicYears={academicYears}
              grades={grades}
              sections={sections}
              currentAcademicYear={currentAcademicYear}
              onSuccess={() => {
                setShowCreateDialog(false);
                onSuccess();
              }}
            />
          </div>
        </div>
      )}

      {editingEnrollment && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-md p-4 w-full max-w-2xl shadow">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-xl font-semibold">Edit Enrollment</h2>
              <Button variant="ghost" onClick={() => setEditingEnrollment(null)}>Close</Button>
            </div>
            <EnrollmentForm
              enrollment={editingEnrollment}
              students={students}
              academicYears={academicYears}
              grades={grades}
              sections={sections}
              currentAcademicYear={currentAcademicYear}
              onSuccess={() => {
                setEditingEnrollment(null);
                onSuccess();
              }}
            />
          </div>
        </div>
      )}

      {showBulkDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-md p-4 w-full max-w-2xl shadow">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-xl font-semibold">Bulk Enrollment</h2>
              <Button variant="ghost" onClick={() => setShowBulkDialog(false)}>Close</Button>
            </div>
            <BulkEnrollmentForm
              students={students}
              academicYears={academicYears}
              grades={grades}
              sections={sections}
              currentAcademicYear={currentAcademicYear}
              onSuccess={() => {
                setShowBulkDialog(false);
                onSuccess();
              }}
            />
          </div>
        </div>
      )}

      {/* Promote Dialog */}
      {promoteEnrollment && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-md p-4 w-full max-w-md shadow">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-xl font-semibold">Promote Student</h2>
              <Button variant="ghost" onClick={() => setPromoteEnrollment(null)}>Close</Button>
            </div>
            <div className="space-y-3">
              <div className="text-sm">
                Promoting: <span className="font-medium text-blue-600">{getStudentDisplay(promoteEnrollment.student_id, promoteEnrollment)}</span>
              </div>
              <div>
                <Label>Target Grade</Label>
                <Select value={promoteToGradeId} onValueChange={setPromoteToGradeId}>
                  <SelectTrigger><SelectValue placeholder="Select higher grade" /></SelectTrigger>
                  <SelectContent>
                    {(() => {
                      const current = grades.find(g => g.id === promoteEnrollment.grade_id);
                      const currentLevel = current?.level ?? -Infinity;
                      return grades
                        .filter(g => g.level > currentLevel)
                        .map(g => (
                          <SelectItem key={g.id} value={String(g.id)}>
                            {g.name}
                          </SelectItem>
                        ));
                    })()}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  onClick={async () => {
                    try {
                      if (!promoteToGradeId || !currentAcademicYear?.name) return;
                      const from = grades.find(g => g.id === promoteEnrollment.grade_id);
                      const to = grades.find(g => g.id === promoteToGradeId);
                      if ((to?.level ?? -Infinity) <= (from?.level ?? -Infinity)) {
                        toast.error('Target grade must be higher than current grade.');
                        return;
                      }
                      // Switch from enrollmentService.promoteStudents to promotionService.promoteEnrollment
                      await promotionService.promoteEnrollment(promoteEnrollment.id, {
                        promotion_type: 'grade',
                        target_academic_year: currentAcademicYear.name,
                      });
                      toast.success('Student promoted successfully');
                      setPromoteEnrollment(null);
                      onSuccess();
                    } catch (error: any) {
                      if (error instanceof AppError && (error.statusCode === 422 || error.type === ErrorType.VALIDATION)) {
                        toast.error(error.message);
                      } else {
                        console.error('Promotion failed:', error);
                        toast.error('Failed to promote student');
                      }
                    }
                  }}
                  disabled={!promoteToGradeId || !currentAcademicYear?.name}
                >
                  Promote
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Transfer Dialog */}
      {transferEnrollment && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-md p-4 w-full max-w-md shadow">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-xl font-semibold">Transfer Student</h2>
              <Button variant="ghost" onClick={() => setTransferEnrollment(null)}>Close</Button>
            </div>
            <div className="space-y-3">
              <div className="text-sm">
                Transferring: <span className="font-medium text-blue-600">{getStudentDisplay(transferEnrollment.student_id, transferEnrollment)}</span>
              </div>
              <div>
                <Label>Transfer Date</Label>
                <Input
                  type="date"
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                />
              </div>
              <div>
                <Label>Reason</Label>
                <Input
                  type="text"
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  placeholder="Reason for transfer"
                />
              </div>
              <div>
                <Label>Transfer School (Optional)</Label>
                <Input
                  type="text"
                  value={transferSchool}
                  onChange={(e) => setTransferSchool(e.target.value)}
                  placeholder="Destination school name"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={async () => {
                    try {
                      await enrollmentService.updateEnrollmentStatus(
                        transferEnrollment.id,
                        'transferred',
                        transferDate,
                        transferReason || undefined,
                        transferSchool || undefined
                      );
                      toast.success('Student transferred successfully');
                      setTransferEnrollment(null);
                      onSuccess();
                    } catch (error: any) {
                      if (error instanceof AppError && (error.statusCode === 422 || error.type === ErrorType.VALIDATION)) {
                        toast.error(error.message);
                      } else {
                        console.error('Transfer failed:', error);
                        toast.error('Failed to transfer student');
                      }
                    }
                  }}
                >
                  Confirm Transfer
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});