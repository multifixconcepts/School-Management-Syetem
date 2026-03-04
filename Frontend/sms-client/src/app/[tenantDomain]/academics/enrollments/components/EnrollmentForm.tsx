'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEnrollmentService } from '@/services/api/enrollment-service';
import { useStudentService } from '@/services/api/student-service';
import {
  Enrollment,
  AcademicYear,
  Grade,
  Section,
  EnrollmentCreate,
  EnrollmentUpdate
} from '@/types/enrollment';
import { Student } from '@/types/student';
import { useSectionService } from '@/services/api/section-service';
import { useClassService } from '@/services/api/class-service';
import { useCreateEnrollment, useUpdateEnrollment } from '@/hooks/queries/enrollments';
import { useCreateStudent } from '@/hooks/queries/students';
import { useSectionsByGrade } from '@/hooks/queries/sections';
import { toast } from 'sonner';
import { AppError, ErrorType } from '@/utils/error-utils';

interface EnrollmentFormProps {
  enrollment?: Enrollment;
  students: Student[];
  academicYears: AcademicYear[];
  grades: Grade[];
  sections: Section[]; // aligned with EnrollmentDialogs
  currentAcademicYear: AcademicYear | null;
  onSuccess: () => void;
}

type EnrollmentFormState = {
  student_id: string;
  academic_year: string;
  academic_year_id: string;
  grade: string;
  grade_id: string;
  section: string;
  section_id: string;
  semester: number;
  enrollment_date: string;
  status: 'active' | 'inactive' | 'transferred' | 'graduated' | 'withdrawn';
};

export default function EnrollmentForm({
  enrollment,
  students,
  academicYears,
  grades,
  sections,
  currentAcademicYear,
  onSuccess
}: EnrollmentFormProps) {
  const extractName = (value: string | { name: string } | undefined): string => {
    return typeof value === 'string' ? value : value?.name ?? '';
  };

  const [formData, setFormData] = useState<EnrollmentFormState>({
    student_id: enrollment?.student_id ?? '',
    academic_year: extractName(enrollment?.academic_year) || (currentAcademicYear?.name ?? ''),
    academic_year_id: enrollment?.academic_year_id ?? (currentAcademicYear?.id ?? ''),
    grade: extractName(enrollment?.grade) || '',
    grade_id: enrollment?.grade_id ?? '',
    section: extractName(enrollment?.section) || '',
    section_id: enrollment?.section_id ?? '',
    semester: enrollment?.semester ?? 1,
    enrollment_date: (enrollment?.enrollment_date?.split('T')[0]) ?? (new Date().toISOString().split('T')[0]),
    status: (enrollment?.status ?? 'active') as EnrollmentFormState['status'],
  });

  const enrollmentService = useEnrollmentService();
  const createEnrollmentMutation = useCreateEnrollment();
  const updateEnrollmentMutation = useUpdateEnrollment();
  const createStudentMutation = useCreateStudent();

  // Loading state derived from mutations
  const isSubmitting = createEnrollmentMutation.isPending || updateEnrollmentMutation.isPending || createStudentMutation.isPending;

  const studentService = useStudentService();

  const [creatingNewStudent, setCreatingNewStudent] = useState(false);
  const [newStudent, setNewStudent] = useState({
    first_name: '',
    last_name: '',
    email: '',
    admission_number: ''
  });

  // Section and Class services
  const classService = useClassService();

  // Use TanStack Query for sections
  const { data: sectionsData, isLoading: loadingSections } = useSectionsByGrade(formData.grade_id);
  const filteredSections = React.useMemo(() => {
    return Array.isArray(sectionsData) ? sectionsData : [];
  }, [sectionsData]);

  // Reset section when grade changes (effect for form data sync only)
  useEffect(() => {
    if (!formData.grade_id) {
      setFormData(prev => ({ ...prev, section_id: '', section: '' }));
    }
  }, [formData.grade_id]);

  // NEW: track auto-enrollment detected for newly created student
  const [autoEnrollmentDetected, setAutoEnrollmentDetected] = useState<Enrollment | null>(null);

  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [enrollmentCount, setEnrollmentCount] = useState<number>(0);
  const [checkingCapacity, setCheckingCapacity] = useState(false);

  useEffect(() => {
    const checkCapacity = async () => {
      if (!formData.academic_year || !formData.grade_id || !formData.section_id) {
        setSelectedClass(null);
        setEnrollmentCount(0);
        return;
      }

      setCheckingCapacity(true);
      try {

        const classes = await classService.getClasses({
          academic_year_id: formData.academic_year_id,
          grade_id: formData.grade_id,
          section_id: formData.section_id,
          is_active: true
        });

        if (classes.length > 0) {
          const cls = classes[0];
          setSelectedClass(cls);
          const count = await classService.getClassEnrollmentCount(cls.id, {
            academic_year_id: formData.academic_year_id,
            is_active: true
          });
          setEnrollmentCount(count);
        } else {
          setSelectedClass(null);
          setEnrollmentCount(0);
        }
      } catch (err) {
        console.error('Error checking class capacity:', err);
      } finally {
        setCheckingCapacity(false);
      }
    };

    checkCapacity();
  }, [formData.academic_year, formData.grade_id, formData.section_id, formData.academic_year_id]);

  // NEW: when auto-enrollment is detected, prefill grade/section IDs by name
  useEffect(() => {
    const applyAutoEnrollment = async () => {
      if (!autoEnrollmentDetected) return;

      const autoGradeName = typeof autoEnrollmentDetected.grade === 'string'
        ? autoEnrollmentDetected.grade
        : (autoEnrollmentDetected.grade?.name ?? '');

      const autoSectionName = typeof autoEnrollmentDetected.section === 'string'
        ? autoEnrollmentDetected.section
        : (autoEnrollmentDetected.section?.name ?? '');

      const gradeMatch = grades.find(g => g.name === autoGradeName);
      const gradeId = gradeMatch?.id ?? '';

      let sectionId = '';
      if (gradeId) {
        const sectionMatch = filteredSections.find(s => s.name === autoSectionName);
        sectionId = sectionMatch?.id ?? '';
      }

      setFormData(prev => ({
        ...prev,
        grade: autoGradeName,
        grade_id: gradeId,
        section: autoSectionName,
        section_id: sectionId,
      }));
    };

    applyAutoEnrollment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEnrollmentDetected]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // setLoading no longer needed

    try {
      // Validate selections
      if (!formData.academic_year_id || !formData.grade_id || !formData.section_id) {
        toast.error('Please select academic year, grade, and section.');
        return;
      }
      if (filteredSections.length === 0) {
        toast.error('Selected grade has no sections.');
        return;
      }

      // Derive names
      const selectedYear = academicYears.find(y => y.id === formData.academic_year_id);
      const selectedGrade = grades.find(g => g.id === formData.grade_id);
      const selectedSection = filteredSections.find(s => s.id === formData.section_id);

      const academicYearName = selectedYear?.name || '';
      const gradeName = selectedGrade?.name || '';
      const sectionName = selectedSection?.name || '';

      if (!academicYearName || !gradeName || !sectionName) {
        toast.error('Please select academic year, grade, and section.');
        return;
      }

      if (enrollment) {
        const payload: EnrollmentUpdate = {
          academic_year_id: formData.academic_year_id,
          grade_id: formData.grade_id,
          section_id: formData.section_id,
          semester: formData.semester,
          enrollment_date: formData.enrollment_date,
          status: formData.status,
        };
        await updateEnrollmentMutation.mutateAsync({ id: enrollment.id, data: payload });
        toast.success('Enrollment updated successfully');
      } else {
        // Create student first when needed
        let studentId = formData.student_id;
        if (creatingNewStudent || !studentId) {
          if (!newStudent.first_name || !newStudent.last_name || !newStudent.email) {
            toast.error('First name, last name and email are required.');
            return;
          }

          try {
            const created = await createStudentMutation.mutateAsync({
              firstName: newStudent.first_name,
              lastName: newStudent.last_name,
              email: newStudent.email,
              admission_number: newStudent.admission_number || undefined
            });
            studentId = created.id;
            toast.success(`Student ${created.firstName} ${created.lastName} created`);
          } catch (err: any) {
            const raw = String(
              err?.message ||
              err?.detail ||
              err?.error ||
              ''
            );
            const errorMessage = err?.message || 'Could not create student. Please try again.';
            toast.error(errorMessage);
            setCreatingNewStudent(false); // Assuming setIsCreatingStudent was a typo for setCreatingNewStudent
            return;
          }

          // Detect backend auto-enrollment for the newly created student
          const auto = await enrollmentService.getCurrentEnrollment(studentId);
          if (auto) {
            setAutoEnrollmentDetected(auto);
            toast.info('Student auto-enrolled', {
              description: `Successfully enrolled in ${typeof auto.grade === 'string' ? auto.grade : auto.grade?.name} / ${typeof auto.section === 'string' ? auto.section : auto.section?.name} for ${typeof auto.academic_year === 'string' ? auto.academic_year : auto.academic_year?.name}.`,
            });

            // Short delay to allow toasts to be perceived before dialog closes
            setTimeout(() => {
              onSuccess(); // refresh lists
            }, 500);
            return; // prevent duplicate enrollments
          }
        }

        // Final safety check for studentId
        if (!studentId) {
          toast.error('Please select a student.');
          return;
        }

        // Narrow create payload status to match EnrollmentCreate
        const createStatus: EnrollmentCreate['status'] =
          formData.status === 'inactive' ? 'inactive' : 'active';

        const payload: EnrollmentCreate = {
          student_id: studentId,
          academic_year_id: formData.academic_year_id,
          grade_id: formData.grade_id,
          section_id: formData.section_id,
          semester: formData.semester,
          enrollment_date: formData.enrollment_date,
          status: createStatus,
        };
        await createEnrollmentMutation.mutateAsync(payload);
        toast.success('Enrollment created successfully');
      }

      onSuccess();
    } catch (error: any) {
      // Friendly, concise error for users
      const raw =
        (typeof error?.message === 'string' && error.message) ||
        (typeof error?.detail === 'string' && error.detail) ||
        (typeof error?.error === 'string' && error.error) ||
        '';

      const isDuplicateEmail =
        /UniqueViolation|duplicate key|already exists|users_email_key/i.test(raw);

      const message = isDuplicateEmail
        ? 'That email is already in use.'
        : 'Could not save enrollment. Please try again.';

      if (error instanceof AppError) {
        const msg =
          error.type === ErrorType.VALIDATION || error.statusCode === 422
            ? error.message
            : 'Could not save enrollment. Please try again.';
        toast.error(msg);
      } else {
        toast.error('Could not save enrollment. Please try again.');
      }
    }
    // Loading state handled by mutations
  };

  // Derived gating flags for submit button
  const hasSelections =
    !!formData.academic_year_id &&
    !!formData.grade_id &&
    filteredSections.length > 0 &&
    !!formData.section_id;

  const newStudentValid =
    !!newStudent.first_name &&
    !!newStudent.last_name &&
    !!newStudent.email;

  // NEW: disable submit if auto-enrollment was detected
  const canSubmit =
    !isSubmitting &&
    hasSelections &&
    !autoEnrollmentDetected &&
    (creatingNewStudent ? newStudentValid : !!formData.student_id);

  const submitLabel = autoEnrollmentDetected
    ? 'Student Already Enrolled'
    : enrollment
      ? 'Update Enrollment'
      : creatingNewStudent
        ? 'Create Student & Enroll'
        : 'Create Enrollment';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Student */}
        <div>
          <Label htmlFor="student">Student *</Label>
          <Select
            value={formData.student_id}
            onValueChange={(value) => setFormData(prev => ({ ...prev, student_id: value }))}
            disabled={!!enrollment || creatingNewStudent}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select student" />
            </SelectTrigger>
            <SelectContent>
              {students.map((student) => (
                <SelectItem key={student.id} value={student.id}>
                  {student.firstName} {student.lastName} ({student.admission_number})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!enrollment && (
            <div className="mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setCreatingNewStudent((prev) => {
                    const next = !prev;
                    if (next) {
                      setFormData(f => ({ ...f, student_id: '' }));
                    }
                    return next;
                  })
                }
              >
                {creatingNewStudent ? 'Use existing student' : 'Create new student'}
              </Button>
            </div>
          )}
        </div>

        {/* Academic Year */}
        <div>
          <Label htmlFor="academicYear">Academic Year *</Label>
          <Select
            value={formData.academic_year_id || ''}
            onValueChange={(value) => {
              const year = academicYears.find(y => y.id === value);
              setFormData(prev => ({
                ...prev,
                academic_year_id: value,
                academic_year: year?.name || ''
              }));
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select academic year" />
            </SelectTrigger>
            <SelectContent>
              {academicYears.map((year) => (
                <SelectItem key={year.id} value={year.id}>
                  {year.name} {year.is_current && '(Current)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Grade */}
        <div>
          <Label htmlFor="grade">Grade *</Label>
          <Select
            value={formData.grade_id || ''}
            onValueChange={(value) => {
              const grade = grades.find(g => g.id === value);
              setFormData(prev => ({
                ...prev,
                grade_id: value,
                grade: grade?.name || ''
              }));
            }}
            // NEW: lock the control if auto-enrollment detected
            disabled={!!autoEnrollmentDetected}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select grade" />
            </SelectTrigger>
            <SelectContent>
              {grades.map((grade) => (
                <SelectItem key={grade.id} value={grade.id}>
                  {grade.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Section */}
        <div>
          <Label htmlFor="section">Section *</Label>
          <Select
            value={formData.section_id || ''}
            disabled={!!autoEnrollmentDetected || !formData.grade_id || loadingSections || filteredSections.length === 0}
            onValueChange={(value) => {
              const sec = filteredSections.find(s => s.id === value);
              setFormData(prev => ({
                ...prev,
                section_id: value,
                section: sec?.name || ''
              }));
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={loadingSections ? 'Loading sections...' : 'Select section'} />
            </SelectTrigger>
            <SelectContent>
              {filteredSections.map((section) => (
                <SelectItem key={section.id} value={section.id}>
                  {section.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!formData.grade_id && !autoEnrollmentDetected && (
            <p className="text-xs text-muted-foreground mt-1">Select a grade to see sections.</p>
          )}
          {autoEnrollmentDetected && (
            <p className="text-xs text-muted-foreground mt-1">
              Auto-enrolled: {typeof autoEnrollmentDetected.grade === 'string' ? autoEnrollmentDetected.grade : autoEnrollmentDetected.grade?.name}
              {' / '}
              {typeof autoEnrollmentDetected.section === 'string' ? autoEnrollmentDetected.section : autoEnrollmentDetected.section?.name}
            </p>
          )}
          {selectedClass && !checkingCapacity && (
            <div className="mt-2">
              <p className={
                `text-xs font-semibold ${enrollmentCount >= (selectedClass.capacity || 30) ? 'text-red-600' : 'text-green-600'}`
              }>
                Capacity: {enrollmentCount} / {selectedClass.capacity || 30}
                {enrollmentCount >= (selectedClass.capacity || 30) && ' (Full!)'}
              </p>
            </div>
          )}
          {checkingCapacity && <p className="text-xs text-muted-foreground mt-1 animate-pulse">Checking capacity...</p>}
        </div>

        {/* Semester */}
        <div>
          <Label htmlFor="semester">Semester *</Label>
          <Select
            value={String(formData.semester)}
            onValueChange={(value) => setFormData(prev => ({ ...prev, semester: parseInt(value) }))}
          >
            <SelectTrigger id="semester">
              <SelectValue placeholder="Select semester" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Semester 1</SelectItem>
              <SelectItem value="2">Semester 2</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Enrollment Date */}
        <div>
          <Label htmlFor="enrollmentDate">Enrollment Date *</Label>
          <Input
            id="enrollmentDate"
            type="date"
            value={formData.enrollment_date}
            onChange={(e) => setFormData(prev => ({ ...prev, enrollment_date: e.target.value }))}
          />
        </div>

        {/* Status (only editable when updating an existing enrollment) */}
        {enrollment && (
          <div className="md:col-span-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={formData.status}
              onValueChange={(value) => setFormData(prev => ({
                ...prev,
                status: value as EnrollmentFormState['status']
              }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="transferred">Transferred</SelectItem>
                <SelectItem value="graduated">Graduated</SelectItem>
                <SelectItem value="withdrawn">Withdrawn</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Inline new student form */}
      {!enrollment && creatingNewStudent && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border rounded-md p-3">
          <div>
            <Label>First Name *</Label>
            <Input value={newStudent.first_name} onChange={(e) => setNewStudent(prev => ({ ...prev, first_name: e.target.value }))} />
          </div>
          <div>
            <Label>Last Name *</Label>
            <Input value={newStudent.last_name} onChange={(e) => setNewStudent(prev => ({ ...prev, last_name: e.target.value }))} />
          </div>
          <div>
            <Label>Email *</Label>
            <Input type="email" value={newStudent.email} onChange={(e) => setNewStudent(prev => ({ ...prev, email: e.target.value }))} />
          </div>
          <div>
            <Label>Admission Number</Label>
            <Input value={newStudent.admission_number} onChange={(e) => setNewStudent(prev => ({ ...prev, admission_number: e.target.value }))} />
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={!canSubmit || isSubmitting}>
          {isSubmitting ? 'Saving...' : submitLabel}
        </Button>
      </div>
    </form>
  );
}