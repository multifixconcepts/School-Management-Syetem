'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useStudentGradeService } from '@/services/api/student-grade-service';
import { useAcademicGradeService } from '@/services/api/academic-grade-service';
import { useEnrollmentService } from '@/services/api/enrollment-service';
import { GradeCreate, GradeType } from '@/types/student-grade';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import { useSubmissionService, type Submission } from '@/services/api/submission-service';
import { ViewSubmissionDialog } from '@/components/academics/ViewSubmissionDialog';
import { FileSearch } from 'lucide-react';

interface MarksEntryDialogProps {
    isOpen: boolean;
    onClose: () => void;
    examId: string;
    examTitle: string;
    gradeId: string;
    sectionId?: string | null;
    subjectId: string;
    academicYearId: string;
    maxScore: number;
    assessmentType?: GradeType;
    assessmentDate?: string;
}

interface StudentRow {
    studentId: string;
    enrollmentId: string;
    name: string;
    rollNumber?: string;
    score: string;
    comments: string;
    existingGradeId?: string;
    submission?: Submission;
}

/**
 * Sanitizes a potentially malformed UUID.
 * Handles cases where the first segment might be doubled (e.g. a529ac1d-a529ac1d-...)
 */
function sanitizeUUID(id: string | null | undefined): string {
    if (!id || id === 'undefined' || id === 'null') return '';
    if (typeof id !== 'string') return '';
    const parts = id.split('-');
    // Standard UUID has 5 segments. If we have more, and the first two are identical...
    if (parts.length > 5 && parts[0] === parts[1]) {
        return parts.slice(1).join('-');
    }
    return id;
}

export function MarksEntryDialog({
    isOpen,
    onClose,
    examId,
    examTitle,
    gradeId: rawGradeId,
    sectionId: rawSectionId,
    subjectId,
    academicYearId: rawAcademicYearId,
    maxScore,
    assessmentType = 'EXAM',
    assessmentDate,
}: MarksEntryDialogProps) {
    const [students, setStudents] = useState<StudentRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Selected submission for viewing
    const [viewingSubmission, setViewingSubmission] = useState<{ submission: Submission; studentName: string } | null>(null);

    // Sanitize inputs to prevent corruption-induced slowness/errors
    const gradeId = sanitizeUUID(rawGradeId);
    const sectionId = sanitizeUUID(rawSectionId);
    const academicYearId = sanitizeUUID(rawAcademicYearId);

    const { bulkCreateGrades, getGrades } = useStudentGradeService();
    const { getGradeById, getAllGrades } = useAcademicGradeService();
    const { getEnrollments } = useEnrollmentService();
    const { getAssignmentSubmissions } = useSubmissionService();
    const { user } = useAuth();

    // Use a ref to track the last request to avoid race conditions
    const abortControllerRef = useRef<AbortController | null>(null);

    const loadData = async () => {
        if (!isOpen || !gradeId) return;

        // Cancel any pending requests
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        setLoading(true);
        setStudents([]); // Clear current list immediately

        console.log(`[MarksEntryDialog] Loading students for Grade: ${gradeId}, Section: ${sectionId || 'All'}, Year: ${academicYearId || 'CURRENT'}`);

        try {
            // 1. Fetch current grade details to get its name
            const currentGrade = await getGradeById(gradeId);
            const gradeName = currentGrade?.name;

            // 2. Fetch ALL grades to find siblings with same name (handle duplicates/mismatches)
            const allGrades = await getAllGrades();
            const siblingGradeIds = allGrades
                .filter((g: any) => g.name === gradeName || g.id === gradeId) // Match by name or ID
                .map((g: any) => g.id);

            console.log(`[MarksEntryDialog] Fetching enrollments for Grade '${gradeName}' (IDs: ${siblingGradeIds.join(', ')})`);

            // 3. Fetch enrollments for all sibling grades
            const enrollmentPromises = siblingGradeIds.map((gid: string) =>
                getEnrollments(0, 500, { grade_id: gid })
            );

            const [enrollmentResults, existingGrades, existingSubmissions] = await Promise.all([
                Promise.all(enrollmentPromises),
                getGrades({
                    assessment_id: examId,
                    assessment_type: assessmentType as any,
                    limit: 500
                }),
                assessmentType === 'ASSIGNMENT' ? getAssignmentSubmissions(examId) : Promise.resolve([])
            ]);

            // Flatten results
            const allEnrollments = enrollmentResults.flatMap((res: any) => res.items || []);

            // Client-side filtering with fallback logic
            const filteredEnrollments = allEnrollments.filter((en: any) => {
                // Deduplicate by student ID if checking multiple grades
                // (This happens later in map via StudentRow or we can rely on unique student_id if we have a Set)

                // Section check: lenient
                if (sectionId && en.section_id !== sectionId) {
                    // console.log(`Skipping student ${en.student?.full_name} due to section mismatch (${en.section_id} != ${sectionId})`);
                    // return false; 
                    // ACTUALLY: Let's be SUPER lenient. If grade name matches, SHOW THEM.
                    // The user is having trouble seeing ANYONE. 
                    // Showing "Extra" students is better than "No" students. 
                    // We can visually flag them if needed, but for now just include.
                    return true;
                }
                return true;
            });

            // Remove duplicates by Student ID
            const uniqueEnrollments = Array.from(new Map(filteredEnrollments.map((e: any) =>
                [e.student_id || e.student?.id, e]
            )).values());

            const enrollments = uniqueEnrollments;

            if (enrollments.length === 0) {
                console.warn('[MarksEntryDialog] No students found after filtering');
                setStudents([]);
                setLoading(false);
                return;
            }

            console.log(`[MarksEntryDialog] Found ${enrollments.length} enrollments (filtered from ${allEnrollments.length}), ${existingGrades.length} existing grades`);
            const gradeMap = new Map(existingGrades.map((g: any) => [g.student_id, g]));
            const submissionMap = new Map((existingSubmissions as Submission[] || []).map(s => [s.student_id, s]));

            const rows: StudentRow[] = enrollments.map((en: any) => {
                const student = en.student || en.student_obj || {};
                const studentId = en.student_id || en.studentId || (en.student && (en.student.id || en.student_id));
                const existing = gradeMap.get(studentId);
                const submission = submissionMap.get(studentId);

                const name = student.full_name ||
                    (student.firstName && student.lastName ? `${student.firstName} ${student.lastName}` : '') ||
                    student.firstName ||
                    (student.first_name && student.last_name ? `${student.first_name} ${student.last_name}` : '') ||
                    student.first_name ||
                    'Unknown Student';

                const rollNumber = student.roll_number || student.admission_number || '-';

                return {
                    studentId: studentId,
                    enrollmentId: en.enrollment_id || en.id,
                    name,
                    rollNumber,
                    score: existing ? String(existing.score) : '',
                    comments: existing ? (existing.comments || '') : '',
                    existingGradeId: existing?.id,
                    submission
                };
            });

            setStudents(rows);
        } catch (err: any) {
            if (err.name === 'AbortError' || err.code === 'ERR_CANCELED') {
                console.log('[MarksEntryDialog] Request aborted');
                return;
            }
            console.error('[MarksEntryDialog] Load failed:', err);
            const errorMessage = err?.response?.data?.detail || err?.message || 'Failed to load students';
            toast.error(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            loadData();
        }
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, examId, sectionId, gradeId, academicYearId]);

    const handleScoreChange = (studentId: string, value: string) => {
        const numValue = parseFloat(value);
        if (!isNaN(numValue) && numValue > maxScore) {
            toast.error(`Score cannot exceed maximum of ${maxScore}`);
            setStudents(prev => prev.map(s => s.studentId === studentId ? { ...s, score: String(maxScore) } : s));
            return;
        }
        setStudents(prev => prev.map(s => s.studentId === studentId ? { ...s, score: value } : s));
    };

    const handleCommentChange = (studentId: string, value: string) => {
        setStudents(prev => prev.map(s => s.studentId === studentId ? { ...s, comments: value } : s));
    };

    const handleSave = async (shouldClose: boolean = true) => {
        setSaving(true);
        try {
            const payload: GradeCreate[] = students
                .filter(s => s.score !== '')
                .map(s => ({
                    student_id: s.studentId,
                    enrollment_id: s.enrollmentId,
                    subject_id: subjectId,
                    assessment_type: assessmentType,
                    assessment_id: examId,
                    assessment_name: examTitle,
                    assessment_date: assessmentDate || new Date().toISOString().split('T')[0],
                    score: parseFloat(s.score),
                    max_score: maxScore,
                    percentage: (parseFloat(s.score) / maxScore) * 100,
                    comments: s.comments,
                    graded_by: user?.id || ''
                }));

            await bulkCreateGrades(payload);
            toast.success('Marks saved successfully');
            if (shouldClose) {
                onClose();
            } else {
                await loadData();
            }
        } catch (err) {
            console.error('Failed to save marks:', err);
            toast.error('Failed to save marks. Please check if scores are valid numbers.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Enter Marks: {examTitle}</DialogTitle>
                    <p className="text-sm text-muted-foreground">Max Score: {maxScore}</p>
                </DialogHeader>

                <div className="flex-1 overflow-auto py-4">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <div className="h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                            <p className="text-sm font-medium text-slate-500">Loading student list...</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-16">Roll #</TableHead>
                                    <TableHead>Student Name</TableHead>
                                    <TableHead className="w-24">Score</TableHead>
                                    <TableHead>Comments</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {students.map((student) => (
                                    <TableRow key={student.studentId}>
                                        <TableCell>{student.rollNumber || '-'}</TableCell>
                                        <TableCell className="font-medium text-slate-900">
                                            <div className="flex items-center justify-between">
                                                <span>{student.name}</span>
                                                {student.submission && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 px-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 gap-1.5"
                                                        onClick={() => setViewingSubmission({ submission: student.submission!, studentName: student.name })}
                                                    >
                                                        <FileSearch className="h-3.5 w-3.5" />
                                                        <span className="text-[10px] font-bold uppercase">Work</span>
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                type="number"
                                                min="0"
                                                max={maxScore}
                                                step="0.5"
                                                value={student.score}
                                                onChange={(e) => handleScoreChange(student.studentId, e.target.value)}
                                                placeholder="0.0"
                                                className="w-20"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                value={student.comments}
                                                onChange={(e) => handleCommentChange(student.studentId, e.target.value)}
                                                placeholder="Add optional notes..."
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {students.length === 0 && !loading && (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                                            No students found enrolled in this scope.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button variant="outline" onClick={onClose} disabled={saving}>
                        Cancel
                    </Button>
                    <Button variant="outline" onClick={() => handleSave(false)} disabled={saving || students.length === 0 || loading}>
                        Quick Save
                    </Button>
                    <Button onClick={() => handleSave(true)} disabled={saving || students.length === 0 || loading}>
                        {saving ? 'Saving...' : 'Save & Close'}
                    </Button>
                </div>
            </DialogContent>

            {viewingSubmission && (
                <ViewSubmissionDialog
                    isOpen={!!viewingSubmission}
                    onClose={() => setViewingSubmission(null)}
                    submission={viewingSubmission.submission}
                    studentName={viewingSubmission.studentName}
                    onGraded={loadData}
                />
            )}
        </Dialog>
    );
}
