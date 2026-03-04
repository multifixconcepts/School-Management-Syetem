import React, { useState, useEffect } from 'react';
import { X, User, GraduationCap, Users, Calendar } from 'lucide-react';
import { Student } from '@/types/student';
import { AcademicGrade } from '@/types/academic-grade';
import { Section } from '@/types/section';
import { useStudentService } from '@/services/api/student-service';
import { toast } from 'sonner';

interface StudentAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  grades: AcademicGrade[];
  sections: Section[];
  onAssignmentComplete: () => void;
}

export function StudentAssignmentModal({
  isOpen,
  onClose,
  student,
  grades,
  sections,
  onAssignmentComplete
}: StudentAssignmentModalProps) {
  const [selectedGradeId, setSelectedGradeId] = useState<string>('');
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [academicYear, setAcademicYear] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [filteredSections, setFilteredSections] = useState<Section[]>([]);

  const studentService = useStudentService();

  useEffect(() => {
    if (selectedGradeId) {
      // Filter sections based on selected grade
      const gradeSections = sections.filter(section => section.grade_id === selectedGradeId);
      setFilteredSections(gradeSections);
      setSelectedSectionId(''); // Reset section selection
    } else {
      setFilteredSections([]);
    }
  }, [selectedGradeId, sections]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedGradeId('');
      setSelectedSectionId('');
      setAcademicYear('');
      setLoading(false);
    } else {
      // Set current academic year as default
      const currentYear = new Date().getFullYear();
      setAcademicYear(`${currentYear}-${currentYear + 1}`);
    }
  }, [isOpen]);

  const handleAssign = async () => {
    if (!student || !selectedGradeId || !selectedSectionId || !academicYear) {
      toast.error('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      await studentService.updateStudent(student.id, {
        grade_id: selectedGradeId,
        section_id: selectedSectionId,
        academic_year: academicYear
      });

      toast.success(`Successfully assigned ${student.firstName} ${student.lastName} to the class`);
      onAssignmentComplete();
      onClose();
    } catch (error) {
      console.error('Error assigning student:', error);
      toast.error('Failed to assign student to class');
    } finally {
      setLoading(false);
    }
  };

  const getSelectedGradeName = () => {
    const grade = grades.find(g => g.id === selectedGradeId);
    return grade?.name || '';
  };

  const getSelectedSectionName = () => {
    const section = filteredSections.find(s => s.id === selectedSectionId);
    return section?.name || '';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <User className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Assign Student to Class</h2>
              <p className="text-sm text-gray-500">
                Assign {student?.firstName} {student?.lastName} to a grade and section
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Student Info */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-sm font-medium text-gray-900 mb-2">Student Information</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Name:</span>
                <span className="ml-2 font-medium">{student?.firstName} {student?.lastName}</span>
              </div>
              <div>
                <span className="text-gray-500">Student ID:</span>
                <span className="ml-2">{student?.admission_number || 'Not assigned'}</span>
              </div>
              <div>
                <span className="text-gray-500">Date of Birth:</span>
                <span className="ml-2">{student?.date_of_birth ? new Date(student.date_of_birth).toLocaleDateString() : 'Not specified'}</span>
              </div>
              <div>
                <span className="text-gray-500">Current Grade:</span>
                <span className="ml-2">{student?.grade_id ? 'Assigned' : 'Not assigned'}</span>
              </div>
            </div>
          </div>

          {/* Assignment Form */}
          <div className="space-y-6">
            {/* Academic Year */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="inline h-4 w-4 mr-1" />
                Academic Year *
              </label>
              <input
                type="text"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="e.g., 2024-2025"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            {/* Grade Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <GraduationCap className="inline h-4 w-4 mr-1" />
                Select Grade *
              </label>
              <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto">
                {grades.map((grade) => (
                  <div
                    key={grade.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-all ${selectedGradeId === grade.id
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    onClick={() => setSelectedGradeId(grade.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-gray-900">{grade.name}</h4>
                        {grade.description && (
                          <p className="text-sm text-gray-500">{grade.description}</p>
                        )}
                      </div>
                      <div className={`w-4 h-4 rounded-full border-2 ${selectedGradeId === grade.id
                        ? 'border-green-500 bg-green-500'
                        : 'border-gray-300'
                        }`}>
                        {selectedGradeId === grade.id && (
                          <div className="w-full h-full rounded-full bg-white scale-50"></div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Section Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Users className="inline h-4 w-4 mr-1" />
                Select Section *
              </label>
              {!selectedGradeId ? (
                <div className="text-center py-8 text-gray-500">
                  <Users className="mx-auto h-12 w-12 text-gray-400 mb-3" />
                  <p>Please select a grade first</p>
                </div>
              ) : filteredSections.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Users className="mx-auto h-12 w-12 text-gray-400 mb-3" />
                  <p>No sections available for selected grade</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto">
                  {filteredSections.map((section) => (
                    <div
                      key={section.id}
                      className={`p-3 border rounded-lg cursor-pointer transition-all ${selectedSectionId === section.id
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      onClick={() => setSelectedSectionId(section.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-gray-900">{section.name}</h4>
                          {section.description && (
                            <p className="text-sm text-gray-500">{section.description}</p>
                          )}
                        </div>
                        <div className={`w-4 h-4 rounded-full border-2 ${selectedSectionId === section.id
                          ? 'border-green-500 bg-green-500'
                          : 'border-gray-300'
                          }`}>
                          {selectedSectionId === section.id && (
                            <div className="w-full h-full rounded-full bg-white scale-50"></div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Assignment Summary */}
            {selectedGradeId && selectedSectionId && academicYear && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <h4 className="font-medium text-green-900 mb-2">Assignment Summary</h4>
                <div className="text-sm text-green-700">
                  <p><strong>Student:</strong> {student?.firstName} {student?.lastName}</p>
                  <p><strong>Grade:</strong> {getSelectedGradeName()}</p>
                  <p><strong>Section:</strong> {getSelectedSectionName()}</p>
                  <p><strong>Academic Year:</strong> {academicYear}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={!selectedGradeId || !selectedSectionId || !academicYear || loading}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Assigning...' : 'Assign Student'}
          </button>
        </div>
      </div>
    </div>
  );
}
