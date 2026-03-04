'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEnrollmentService } from '@/services/api/enrollment-service';
import { useStudentService } from '@/services/api/student-service';
import { AcademicYear, Grade, Section, BulkEnrollmentCreate } from '@/types/enrollment';
import { Student } from '@/types/student';
import { useBulkCreateEnrollments } from '@/hooks/queries/enrollments';
import { useCreateStudentsBulk } from '@/hooks/queries/students';
import { useSectionsByGrade } from '@/hooks/queries/sections';
import { toast } from 'sonner';
import { AppError, ErrorType } from '@/utils/error-utils';
import { Loader2 } from 'lucide-react';

interface BulkEnrollmentFormProps {
  students: Student[];
  academicYears: AcademicYear[];
  grades: Grade[];
  sections: Section[];
  currentAcademicYear: AcademicYear | null;
  onSuccess: () => void;
}

export default function BulkEnrollmentForm({
  students,
  academicYears,
  grades,
  sections,
  currentAcademicYear,
  onSuccess,
}: BulkEnrollmentFormProps) {
  const enrollmentService = useEnrollmentService();
  const studentService = useStudentService();

  const createStudentsBulkMutation = useCreateStudentsBulk();
  const bulkCreateEnrollmentsMutation = useBulkCreateEnrollments();

  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [lastSummary, setLastSummary] =
    useState<{ created: string[]; failed: Array<{ student_id: string; reason: string }> } | null>(null);

  // Define row detail type and fix state typings
  type CsvRowDetail = {
    resolvedId?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    year_name?: string;
    grade_name?: string;
    section_name?: string;
    date_text?: string;
  };

  const [csvRowsDetail, setCsvRowsDetail] = useState<CsvRowDetail[]>([]);
  const [csvMetaLocked, setCsvMetaLocked] = useState(false);

  const creatableCount = React.useMemo(
    () =>
      csvRowsDetail.filter(
        (r: CsvRowDetail) => !r.resolvedId && r.first_name && r.last_name && r.email
      ).length,
    [csvRowsDetail]
  );

  const normalizeDate = (d?: string) => {
    if (!d) return '';
    const t = d.trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(t)) {
      const [dd, mm, yyyy] = t.split('/');
      return `${yyyy}-${mm}-${dd}`;
    }
    return t;
  };

  const [formData, setFormData] = useState({
    student_ids: [] as string[],
    academic_year_id: '',
    grade_id: '',
    section_id: '',
    semester: 1,
    enrollment_date: new Date().toISOString().split('T')[0],
  });

  const [importSummary, setImportSummary] = useState<{ matched: number; notMatched: string[] }>({ matched: 0, notMatched: [] });

  useEffect(() => {
    if (currentAcademicYear?.id) {
      setFormData((prev) => (prev.academic_year_id ? prev : { ...prev, academic_year_id: currentAcademicYear.id }));
    }
  }, [currentAcademicYear?.id]);

  // Section filtering
  const { data: filteredSectionsData, isLoading: loadingSections } = useSectionsByGrade(formData.grade_id);
  const filteredSections = React.useMemo(() => {
    return Array.isArray(filteredSectionsData) ? filteredSectionsData : [];
  }, [filteredSectionsData]);

  // Reset section on grade change moved to manual handler to prevent CSV auto-fill wipe-out

  const norm = (s: string) => s?.toString().trim().toLowerCase();
  const digits = (s: string) => {
    const m = s.match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
  };

  const resolveAcademicYearId = (value?: string): string | undefined => {
    if (!value) return undefined;
    const v = norm(value).replace('-', '/');
    const hit = academicYears.find((y) => norm(y.name).replace('-', '/') === v);
    return hit?.id;
  };

  const resolveGradeId = (value?: string): string | undefined => {
    if (!value) return undefined;
    const v = norm(value);
    const n = digits(v);
    if (n != null) {
      const byLevel = grades.find((g: any) => (g?.level ?? null) === n);
      if (byLevel) return byLevel.id;
      const byNameNum = grades.find((g) => norm(g.name).includes(String(n)));
      if (byNameNum) return byNameNum.id;
    }
    const cleaned = v.replace(/^grade\s+/, '').replace(/^g\s+/, '').trim();
    const byExact = grades.find((g) => norm(g.name) === v);
    if (byExact) return byExact.id;
    const byClean = grades.find((g) => norm(g.name) === cleaned || norm(g.name).includes(cleaned));
    return byClean?.id;
  };

  const resolveSectionId = (value?: string): string | undefined => {
    if (!value) return undefined;
    const v = norm(value);
    const cleaned = v.replace(/^section\s+/, '').replace(/^sec\s+/, '').replace(/^s\s+/, '').trim();

    // First try exact match
    const byExact = sections.find((s) => norm(s.name) === v || norm(s.name) === cleaned);
    if (byExact) return byExact.id;

    // Then try partial match
    const byCleanTail = sections.find((s) => norm(s.name).endsWith(cleaned) || cleaned.endsWith(norm(s.name)));
    if (byCleanTail) return byCleanTail.id;

    const byCleanIncl = sections.find((s) => norm(s.name).includes(cleaned) || cleaned.includes(norm(s.name)));
    return byCleanIncl?.id;
  };

  const buildAdmissionToIdMap = () => {
    const m = new Map<string, string>();
    students.forEach((s) => {
      if (s.admission_number) m.set(String(s.admission_number).trim(), s.id);
    });
    return m;
  };

  // NEW: email and name indexes for matching
  const buildEmailToIdMap = () => {
    const m = new Map<string, string>();
    students.forEach((s) => {
      if (s.email) m.set(norm(s.email), s.id);
    });
    return m;
  };

  const buildNameIndex = () => {
    const index = new Map<string, string[]>();
    students.forEach((s) => {
      const key = norm(`${s.firstName} ${s.lastName}`);
      if (!key) return;
      index.set(key, [...(index.get(key) || []), s.id]);
    });
    const unique = new Map<string, string>();
    const ambiguous = new Set<string>();
    index.forEach((ids, key) => {
      if (ids.length === 1) unique.set(key, ids[0]);
      else ambiguous.add(key);
    });
    return { unique, ambiguous };
  };

  // Fix: keep this pure; do NOT use hooks here.
  const parseSimpleCsv = (
    text: string
  ): {
    importedIds: string[];
    notMatchedAdmissions: string[];
    csvIdFields: Partial<Pick<BulkEnrollmentCreate, 'academic_year_id' | 'grade_id' | 'section_id' | 'enrollment_date'>>;
    multiWarnings: string[];
    nameWarnings: string[];
    rowsDetail: CsvRowDetail[];
  } => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) {
      return { importedIds: [], notMatchedAdmissions: [], csvIdFields: {}, multiWarnings: [], nameWarnings: [], rowsDetail: [] };
    }

    const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const first = (aliases: string[]) => header.findIndex((h) => aliases.includes(h));

    // Student identity columns (now more flexible)
    const idxAdmission = first(['admission', 'admission_number', 'admission_no', 'adm_no', 'admission number', 'admission number']);
    const idxStudentId = first(['student_id', 'id', 'student id', 'studentid', 'student_uuid', 'uuid']);
    const idxFirstName = first(['first_name', 'firstname', 'first', 'fname', 'first name']);
    const idxLastName = first(['last_name', 'lastname', 'last', 'lname', 'last name']);
    const idxEmail = first(['email', 'student_email', 'e-mail']);
    const idxFullName = first(['name', 'full_name', 'fullname', 'student_name', 'student name']);

    // Per-row names for enrollment meta
    const idxYearName = first(['academic_year', 'year', 'academic_year_name', 'academic year']);
    const idxGradeName = first(['grade', 'class', 'grade_name', 'level']);
    const idxSectionName = first(['section', 'section_name', 'class_section', 'sec']);
    const idxDate = first(['enrollment_date', 'date', 'enrolled_at', 'enrollment date']);

    const admissionToId = buildAdmissionToIdMap();
    const emailToId = buildEmailToIdMap();
    const { unique: nameToId, ambiguous: ambiguousNameKeys } = buildNameIndex();

    const importedIds: string[] = [];
    const notMatchedAdmissions: string[] = [];
    const observedYearText = new Set<string>();
    const observedGradeText = new Set<string>();
    const observedSectionText = new Set<string>();
    const observedDates = new Set<string>();

    const rowsDetail: Array<{
      resolvedId?: string;
      first_name?: string;
      last_name?: string;
      email?: string;
      year_name?: string;
      grade_name?: string;
      section_name?: string;
      date_text?: string;
    }> = [];

    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));

      const firstName = idxFirstName >= 0 ? cells[idxFirstName] : '';
      const lastName = idxLastName >= 0 ? cells[idxLastName] : '';
      const fullName = idxFullName >= 0 ? cells[idxFullName] : '';
      const email = idxEmail >= 0 ? cells[idxEmail] : '';
      const admission = idxAdmission >= 0 ? cells[idxAdmission] : '';

      let nameKey = '';
      if (firstName && lastName) {
        nameKey = norm(`${firstName} ${lastName}`);
      } else if (fullName) {
        nameKey = norm(fullName);
      }

      let resolvedId: string | undefined;

      // Match priority: student_id → admission → email → name
      if (idxStudentId >= 0 && cells[idxStudentId]) {
        resolvedId = cells[idxStudentId];
      } else if (admission) {
        resolvedId = admissionToId.get(String(admission).trim());
      } else if (email) {
        resolvedId = emailToId.get(norm(email));
      } else if (nameKey) {
        const id = nameToId.get(nameKey);
        if (id) resolvedId = id;
        else if (ambiguousNameKeys.has(nameKey)) {
          notMatchedAdmissions.push(`${firstName || lastName || fullName} (ambiguous)`);
        }
      }

      if (!resolvedId) {
        const label = (firstName || lastName || fullName) ? `${firstName} ${lastName} ${fullName}`.trim()
          : (email || admission || `(row ${i + 1})`);
        notMatchedAdmissions.push(label || `(row ${i + 1})`);
      } else {
        importedIds.push(resolvedId);
      }

      const yText = idxYearName >= 0 ? cells[idxYearName] : '';
      const gText = idxGradeName >= 0 ? cells[idxGradeName] : '';
      const sText = idxSectionName >= 0 ? cells[idxSectionName] : '';
      const dText = idxDate >= 0 ? cells[idxDate] : '';

      if (yText) observedYearText.add(yText);
      if (gText) observedGradeText.add(gText);
      if (sText) observedSectionText.add(sText);
      if (dText) observedDates.add(dText);

      rowsDetail.push({
        resolvedId,
        first_name: firstName || undefined,
        last_name: lastName || undefined,
        email: email || undefined,
        year_name: yText || undefined,
        grade_name: gText || undefined,
        section_name: sText || undefined,
        date_text: normalizeDate(dText || undefined) || undefined, // use top-level helper
      });
    }

    const csvIdFields: Partial<Pick<BulkEnrollmentCreate, 'academic_year_id' | 'grade_id' | 'section_id' | 'enrollment_date'>> = {};
    const multiWarnings: string[] = [];
    const nameWarnings: string[] = [];

    if (observedYearText.size === 1) {
      const only = [...observedYearText][0];
      const id = resolveAcademicYearId(only);
      if (id) csvIdFields.academic_year_id = id;
      else nameWarnings.push(`Academic year "${only}" not found.`);
    } else if (observedYearText.size > 1) {
      multiWarnings.push('CSV has multiple academic year values; using selector above.');
    }

    if (observedGradeText.size === 1) {
      const only = [...observedGradeText][0];
      const id = resolveGradeId(only);
      if (id) csvIdFields.grade_id = id;
      else nameWarnings.push(`Grade "${only}" not found.`);
    } else if (observedGradeText.size > 1) {
      multiWarnings.push('CSV has multiple grade values; using selector above.');
    }

    if (observedSectionText.size === 1) {
      const only = [...observedSectionText][0];
      const id = resolveSectionId(only);
      if (id) csvIdFields.section_id = id;
      else nameWarnings.push(`Section "${only}" not found.`);
    } else if (observedSectionText.size > 1) {
      multiWarnings.push('CSV has multiple section values; using selector above.');
    }

    if (observedDates.size === 1) {
      csvIdFields.enrollment_date = normalizeDate([...observedDates][0]);
    } else if (observedDates.size > 1) {
      multiWarnings.push('CSV has multiple enrollment_date values; using selector above.');
    }

    return { importedIds, notMatchedAdmissions, csvIdFields, multiWarnings, nameWarnings, rowsDetail };
  };

  const handleCsvFile = async (file: File | null) => {
    if (!file) {
      setSelectedStudents([]);
      setCsvRowsDetail([]);
      setImportSummary({ matched: 0, notMatched: [] });
      setCsvMetaLocked(false);
      return;
    }
    const text = await file.text();
    const { importedIds, notMatchedAdmissions, csvIdFields, multiWarnings, nameWarnings, rowsDetail } = parseSimpleCsv(text);

    setSelectedStudents(importedIds);
    setCsvRowsDetail(rowsDetail);
    setImportSummary({ matched: importedIds.length, notMatched: notMatchedAdmissions });

    setFormData((prev) => ({
      ...prev,
      academic_year_id: csvIdFields.academic_year_id ?? prev.academic_year_id,
      grade_id: csvIdFields.grade_id ?? prev.grade_id,
      section_id: csvIdFields.section_id ?? prev.section_id,
      enrollment_date: csvIdFields.enrollment_date ?? prev.enrollment_date,
    }));

    // Fix: lock selectors if CSV provides consistent values
    setCsvMetaLocked(Boolean(
      csvIdFields.academic_year_id &&
      csvIdFields.grade_id &&
      csvIdFields.section_id &&
      csvIdFields.enrollment_date &&
      multiWarnings.length === 0
    ));

    const notices = [...multiWarnings, ...nameWarnings];
    if (notices.length) toast.info(notices.join(' '));
  };

  const downloadCsvTemplate = () => {
    // Prefer human-friendly template; still backwards-compatible with admission/student_id
    const headers = ['first_name', 'last_name', 'email', 'academic_year', 'grade', 'section', 'enrollment_date'];
    const rows = students.slice(0, 5).map((s) => [
      s.firstName || '',
      s.lastName || '',
      s.email || '',
      currentAcademicYear?.name || '',
      '',
      '',
      ''
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bulk-enrollment-template.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.academic_year_id || !formData.grade_id || !formData.section_id) {
      toast.error('Academic year, grade, and section are required');
      return;
    }

    try {
      const missingCandidates = csvRowsDetail.filter(
        (r: CsvRowDetail) => !r.resolvedId && r.first_name && r.last_name && r.email
      );

      let newlyCreatedIds: string[] = [];
      const creationFailures: Array<{ label: string; reason: string }> = [];

      if (missingCandidates.length > 0) {
        const studentsToCreate = missingCandidates.map(r => ({
          firstName: r.first_name!,
          lastName: r.last_name!,
          email: r.email!,
        }));

        console.log('[BulkEnrollment] Attempting to create missing students:', studentsToCreate);
        const results = await createStudentsBulkMutation.mutateAsync(studentsToCreate);
        console.log('[BulkEnrollment] Student creation results:', results);

        results.forEach((res, idx) => {
          if (res.success) {
            newlyCreatedIds.push(res.id);
          } else {
            const candidate = missingCandidates[idx];
            creationFailures.push({
              label: `${candidate.first_name} ${candidate.last_name}`,
              reason: res.error || 'Failed to create student'
            });
          }
        });
      }

      const allIds = [...selectedStudents, ...newlyCreatedIds];
      if (allIds.length === 0) {
        toast.error('No students matched or created from CSV');
        return;
      }

      if (newlyCreatedIds.length) {
        toast.info(`Created ${newlyCreatedIds.length} missing students`);
      }
      if (creationFailures.length) {
        toast.error(`Failed to create ${creationFailures.length} students`, {
          description:
            creationFailures.slice(0, 3).map((f) => f.label).join(', ') +
            (creationFailures.length > 3 ? '...' : ''),
        });
      }

      console.log('[BulkEnrollment] Enrolling all student IDs:', allIds);
      const resp: any = await bulkCreateEnrollmentsMutation.mutateAsync({
        ...formData,
        student_ids: allIds,
      });

      let created: string[] = [];
      let failed: Array<{ student_id: string; reason: string }> = [];

      if (Array.isArray(resp)) {
        created = resp.map((e: any) => e.student_id || e.id).filter(Boolean);
      } else if (resp && typeof resp === 'object') {
        if (Array.isArray(resp.created)) {
          created = resp.created.map((e: any) => e.student_id || e.id).filter(Boolean);
        }
        if (Array.isArray(resp.failed)) {
          failed = resp.failed.map((e: any) => ({
            student_id: e.student_id || e.id,
            reason: e.error || e.message || 'Failed',
          }));
        }
      }

      setLastSummary({ created, failed });
      toast.success(`Enrolled ${created.length} students`, {
        description: failed.length ? `${failed.length} failed` : undefined,
      });
      onSuccess();
    } catch (error: any) {
      console.error('[BulkEnrollment] Process failed:', error);
      if (error instanceof AppError) {
        if (error.statusCode === 401 || error.statusCode === 403) {
          toast.error('Session expired. Please log out and back in.');
        } else if (error.statusCode === 422 || error.type === ErrorType.VALIDATION) {
          toast.error(error.message);
        } else {
          toast.error(error.message || 'Bulk enrollment failed');
        }
      } else {
        toast.error('An unexpected error occurred during bulk enrollment');
      }
    }
  };

  const isSubmitting = createStudentsBulkMutation.isPending || bulkCreateEnrollmentsMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="academicYear">Academic Year *</Label>
          <Select
            value={formData.academic_year_id}
            onValueChange={(value) => setFormData((prev) => ({ ...prev, academic_year_id: value }))}
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

        <div>
          <Label htmlFor="grade">Grade *</Label>
          <Select
            value={formData.grade_id}
            onValueChange={(value) => setFormData((prev) => ({ ...prev, grade_id: value, section_id: '' }))}
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

        <div>
          <Label htmlFor="section">Section *</Label>
          <Select
            value={formData.section_id}
            onValueChange={(value) => setFormData((prev) => ({ ...prev, section_id: value }))}
            disabled={!formData.grade_id || loadingSections || filteredSections.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder={loadingSections ? 'Loading...' : 'Select section'} />
            </SelectTrigger>
            <SelectContent>
              {filteredSections.map((section) => (
                <SelectItem key={section.id} value={section.id}>
                  {section.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="enrollmentDate">Enrollment Date *</Label>
          <Input
            id="enrollmentDate"
            type="date"
            value={formData.enrollment_date}
            onChange={(e) => setFormData((prev) => ({ ...prev, enrollment_date: e.target.value }))}
          />
        </div>

        <div>
          <Label htmlFor="semester">Semester *</Label>
          <Select
            value={String(formData.semester)}
            onValueChange={(value) => setFormData((prev) => ({ ...prev, semester: parseInt(value) }))}
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
      </div>

      <div className="space-y-2">
        <Label htmlFor="csvFile">
          Upload CSV (student_id or admission or email or first+last; use names for academic year, grade, section)
        </Label>
        <div className="flex items-center gap-2">
          <Input id="csvFile" type="file" accept=".csv" onChange={(e) => handleCsvFile(e.target.files?.[0] ?? null)} />
          <Button type="button" variant="secondary" onClick={downloadCsvTemplate}>
            Download CSV template
          </Button>
          <Button type="button" variant="ghost" onClick={() => handleCsvFile(null)}>
            Clear import
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Optional CSV columns: academic_year, grade, section, enrollment_date. If consistent across rows, they auto-fill above.
        </p>
        <p className="text-sm text-muted-foreground">
          Matched: {importSummary.matched}
          {importSummary.notMatched.length ? ` | Not matched: ${importSummary.notMatched.length}` : ''}
          {creatableCount ? ` | Will create: ${creatableCount}` : ''}
        </p>
        {importSummary.notMatched.length > 0 && (
          <div className="rounded-md border p-3">
            <div className="font-medium">Unmatched students</div>
            <ul className="text-sm list-disc ml-5">
              {importSummary.notMatched.slice(0, 20).map((val, idx) => (
                <li key={idx}>{val || '(empty)'}</li>
              ))}
            </ul>
            {importSummary.notMatched.length > 20 && (
              <p className="text-xs text-muted-foreground mt-1">+{importSummary.notMatched.length - 20} more</p>
            )}
          </div>
        )}
      </div>

      {lastSummary && (
        <div className="rounded-md border p-3">
          <div className="font-medium">Bulk Enrollment Summary</div>
          <div className="text-sm">
            Created: {lastSummary.created.length} | Failed: {lastSummary.failed.length}
          </div>
          {lastSummary.failed.length > 0 && (
            <ul className="mt-2 text-sm">
              {lastSummary.failed.map(({ student_id, reason }) => {
                const s = students.find((st) => st.id === student_id);
                return <li key={student_id}>{s ? `${s.firstName} ${s.lastName}` : student_id}: {reason}</li>;
              })}
            </ul>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" disabled={isSubmitting || (selectedStudents.length === 0 && creatableCount === 0)}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : `Enroll ${selectedStudents.length + creatableCount} Students`}
        </Button>
      </div>
    </form>
  );
}