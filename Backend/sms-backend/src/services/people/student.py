from typing import List, Optional, Dict, Any
from uuid import UUID

from src.db.crud import student as student_crud
from src.db.models.people import Student
from src.schemas.people import StudentCreate, StudentUpdate, StudentBulkDelete
from src.services.base.base import TenantBaseService, SuperAdminBaseService
from src.core.exceptions.business import (
    EntityNotFoundError, 
    DuplicateEntityError,
    InvalidStatusTransitionError,
    BusinessRuleViolationError
)
from datetime import date
from fastapi import Depends
from sqlalchemy.orm import Session
from src.db.session import get_db
from src.core.middleware.tenant import get_tenant_from_request

from src.db.models.logging.activity_log import ActivityLog

from src.db.crud.auth.user import user as user_crud

class StudentService(TenantBaseService[Student, StudentCreate, StudentUpdate]):
    """
    Service for managing students within a tenant.
    """
    def __init__(
        self,
        db: Session = Depends(get_db),
        tenant: Any = Depends(get_tenant_from_request),
        tenant_id: Optional[UUID] = None
    ):
        # Allow explicit tenant_id (for manual instantiation) or extract from dependency
        if tenant_id:
            tid = tenant_id
        else:
            tid = tenant.id if hasattr(tenant, 'id') else tenant
            
        # Ensure we have a valid-looking UUID to prevent crashes in base class
        # if both are missing/invalid during manual instantiation
        from uuid import UUID
        if not tid or (isinstance(tid, str) and not tid):
             tid = UUID('00000000-0000-0000-0000-000000000000')

        super().__init__(crud=student_crud, model=Student, tenant_id=tid, db=db)
    
    async def delete(self, *, id: UUID) -> Optional[Student]:
        """Delete a student, handling dependencies manually."""
        # 1. Handle Activity Logs (set user_id to NULL)
        self.db.query(ActivityLog).filter(
            ActivityLog.user_id == id
        ).update({ActivityLog.user_id: None}, synchronize_session=False)
        self.db.commit()
        
        return await super().delete(id=id)
    
    async def get_by_user_id(self, user_id: UUID) -> Optional[Student]:
        """Get student by their user ID (which is the same as student ID due to inheritance)."""
        return await self.get(id=user_id)
    
    # Add student-specific business logic methods here
    # For example:
    # Add to StudentService class
    async def get_by_admission_number(self, admission_number: str) -> Optional[Student]:
        """Get a student by admission number within the current tenant."""
        return student_crud.get_by_admission_number(self.db, tenant_id=self.tenant_id, admission_number=admission_number)
    
    async def create(self, *, obj_in: StudentCreate) -> Student:
        """Create a new student with duplicate checking."""
        # Check for duplicate email globally
        if obj_in.email:
            existing_user = user_crud.get_by_email_any_tenant(self.db, email=obj_in.email)
            if existing_user:
                raise DuplicateEntityError("User", "email", obj_in.email)

        # Check for duplicate admission number
        if obj_in.admission_number:
            existing = await self.get_by_admission_number(obj_in.admission_number)
            if existing:
                raise DuplicateEntityError("Student", "admission_number", obj_in.admission_number)
        
        return await super().create(obj_in=obj_in)
    
    async def bulk_create(self, *, students_in: List[StudentCreate]) -> List[Dict[str, Any]]:
        """Create multiple students with individual status reporting."""
        results = []
        for s_in in students_in:
            try:
                created = await self.create(obj_in=s_in)
                results.append({"success": True, "student": created, "id": str(created.id)})
            except DuplicateEntityError as e:
                results.append({"success": False, "error": str(e), "email": s_in.email})
            except Exception as e:
                results.append({"success": False, "error": str(e), "email": s_in.email})
        return results
    
    async def update_status(self, id: UUID, status: str, reason: Optional[str] = None) -> Student:
        """Update a student's status with validation."""
        student = await self.get(id=id)
        if not student:
            raise EntityNotFoundError("Student", id)
        
        # Define valid status transitions
        valid_transitions = {
            "active": ["inactive", "graduated", "transferred"],
            "inactive": ["active"],
            "graduated": [],  # Terminal state
            "transferred": []  # Terminal state
        }
        
        if status not in valid_transitions.get(student.status, []):
            raise InvalidStatusTransitionError("Student", student.status, status)
        
        updated_student = student_crud.update_status(self.db, tenant_id=self.tenant_id, id=id, status=status, reason=reason)

        # Secondary effect: if student is archived (inactive), mark active enrollments as inactive
        if status == "inactive":
            from src.services.academics.enrollment import EnrollmentService
            enrollment_service = EnrollmentService(tenant=self.tenant_id, db=self.db)
            active_enrollments = await enrollment_service.get_multi(student_id=id, is_active=True)
            for enrollment in active_enrollments:
                await enrollment_service.update(id=enrollment.id, obj_in={"is_active": False})
            
            # Also inactivate Class Enrollments
            from src.services.academics.class_enrollment_service import ClassEnrollmentService
            ce_service = ClassEnrollmentService(tenant=self.tenant_id, db=self.db)
            active_ces = await ce_service.get_multi(student_id=id, is_active=True)
            for ce in active_ces:
                await ce_service.update(id=ce.id, obj_in=ClassEnrollmentUpdate(is_active=False))
        
        return updated_student

    async def bulk_delete(self, student_ids: List[UUID]) -> int:
        """Delete multiple students. Returns the number of students deleted."""
        deleted_count = 0
        from src.services.academics.enrollment import EnrollmentService
        enrollment_service = EnrollmentService(tenant=self.tenant_id, db=self.db)
        
        for student_id in student_ids:
            try:
                # Check for enrollments before deleting
                # Properly await the async count method
                enroll_count = await enrollment_service.count(student_id=student_id)
                if enroll_count == 0:
                    await self.delete(id=student_id)
                    deleted_count += 1
            except Exception as e:
                print(f"Failed to delete student {student_id}: {str(e)}")
                continue
        return deleted_count


class SuperAdminStudentService(SuperAdminBaseService[Student, StudentCreate, StudentUpdate]):
    """
    Super-admin service for managing students across all tenants.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(crud=student_crud, model=Student, *args, **kwargs)
    
    # Add super-admin specific methods here
    def get_all_students(self, skip: int = 0, limit: int = 100,
                       grade: Optional[str] = None,
                       section: Optional[str] = None,
                       status: Optional[str] = None,
                       tenant_id: Optional[UUID] = None) -> List[Student]:
        """Get all students across all tenants with filtering."""
        query = self.db.query(Student)
        
        # Apply filters
        if grade:
            query = query.filter(Student.grade == grade)
        if section:
            query = query.filter(Student.section == section)
        if status:
            query = query.filter(Student.status == status)
        if tenant_id:
            query = query.filter(Student.tenant_id == tenant_id)
        
        # Apply pagination
        return query.offset(skip).limit(limit).all()

    async def promote_student(self, id: UUID, new_grade: str, new_section: Optional[str] = None) -> Student:
        """Promote a student to a new grade and optionally a new section."""
        student = await self.get(id=id)
        if not student:
            raise EntityNotFoundError("Student", id)
        
        if student.status != "active":
            raise BusinessRuleViolationError(f"Cannot promote student with status '{student.status}'")
        
        # Define grade sequence
        grade_sequence = [
            "Kindergarten", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5",
            "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"
        ]
        
        # Validate grade progression
        current_index = grade_sequence.index(student.grade) if student.grade in grade_sequence else -1
        new_index = grade_sequence.index(new_grade) if new_grade in grade_sequence else -1
        
        if new_index == -1:
            raise BusinessRuleViolationError(f"Invalid grade: {new_grade}")
        
        if new_index != current_index + 1:
            raise BusinessRuleViolationError(f"Invalid grade progression from {student.grade} to {new_grade}")
        
        # Store current grade in academic history
        if not student.academic_history:
            student.academic_history = []
        
        student.academic_history.append({
            "academic_year": date.today().year,
            "grade": student.grade,
            "section": student.section,
            "promotion_date": date.today().isoformat()
        })
        
        # Update student grade and section
        update_data = {"grade": new_grade}
        if new_section:
            update_data["section"] = new_section
        
        return await self.update(id=id, obj_in=update_data)

    async def graduate_student(self, id: UUID, graduation_date: date, honors: Optional[List[str]] = None) -> Student:
        """Graduate a student from the school."""
        student = await self.get(id=id)
        if not student:
            raise EntityNotFoundError("Student", id)
        
        if student.grade != "Grade 12":
            raise BusinessRuleViolationError(f"Only Grade 12 students can graduate, current grade: {student.grade}")
        
        if student.status != "active":
            raise BusinessRuleViolationError(f"Cannot graduate student with status '{student.status}'")
        
        # Record graduation details
        graduation_details = {
            "graduation_date": graduation_date.isoformat(),
            "honors": honors or []
        }
        
        # Update student status and add graduation details
        return await self.update(id=id, obj_in={
            "status": "graduated",
            "graduation_details": graduation_details
        })

