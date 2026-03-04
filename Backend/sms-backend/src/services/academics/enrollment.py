from typing import List, Optional, Dict, Any, Union
from uuid import UUID
from datetime import date

from src.db.crud.academics import enrollment as enrollment_crud
from src.db.crud.academics.academic_year_crud import academic_year_crud
from src.db.crud.academics.academic_grade import academic_grade
from src.db.crud.academics.section import section
from src.db.crud.people import student as student_crud
from src.db.models.academics.enrollment import Enrollment
from src.db.models.academics.class_enrollment import ClassEnrollment
from src.schemas.academics.enrollment import EnrollmentCreate, EnrollmentUpdate
from src.services.base.base import TenantBaseService, SuperAdminBaseService
from src.core.exceptions.business import (
    EntityNotFoundError, 
    DuplicateEntityError,
    InvalidStatusTransitionError,
    BusinessRuleViolationError
)
from src.core.middleware.tenant import get_tenant_from_request
from src.db.session import get_db
from sqlalchemy.orm import Session
from fastapi import Depends
from src.core.cache import cached
from src.core.redis import cache

class EnrollmentService(TenantBaseService[Enrollment, EnrollmentCreate, EnrollmentUpdate]):
    """Service for managing student enrollments within a tenant."""
    
    def __init__(
        self,
        tenant: Any = Depends(get_tenant_from_request),
        db: Session = Depends(get_db)
    ):
        tenant_id = tenant.id if hasattr(tenant, 'id') else tenant
        super().__init__(crud=enrollment_crud, model=Enrollment, tenant_id=tenant_id, db=db)
    
    @cached(prefix="enrollments:get", expire=300)
    async def get(self, id: Any) -> Optional[Enrollment]:
        """Get a specific enrollment (Cached)."""
        return await super().get(id=id)
    
    async def update(self, id: Any, obj_in: Union[EnrollmentUpdate, Dict[str, Any]]) -> Optional[Enrollment]:
        """Update an enrollment and invalidate caches."""
        result = await super().update(id=id, obj_in=obj_in)
        if result:
            await cache.delete(f"enrollments:get:id={id}:tenant={self.tenant_id}")
            await cache.delete(f"enrollments:multi:tenant={self.tenant_id}")
            await cache.delete(f"enrollments:active:student_id={result.student_id}:tenant={self.tenant_id}")
        return result
    
    @cached(prefix="enrollments:active", expire=300)
    async def get_active_enrollment(self, student_id: UUID) -> Optional[Enrollment]:
        """Get a student's active enrollment (Cached)."""
        return enrollment_crud.get_active_enrollment(
            self.db, tenant_id=self.tenant_id, student_id=student_id
        )
    
    async def get_by_grade_section(self, academic_year: str, grade: str, section: str) -> List[Enrollment]:
        """Get all enrollments for a specific grade and section."""
        return enrollment_crud.get_by_grade_section(
            self.db, tenant_id=self.tenant_id, academic_year=academic_year, grade=grade, section=section
        )
    
    async def get_with_student_details(self, id: UUID) -> Optional[Dict]:
        """Get enrollment with student details."""
        return enrollment_crud.get_with_student_details(
            self.db, tenant_id=self.tenant_id, id=id
        )
    
    async def create(self, *, obj_in: EnrollmentCreate) -> Enrollment:
        """Create a new enrollment with IDs-only validation."""
        # Validate student exists
        student = student_crud.get_by_id(self.db, tenant_id=self.tenant_id, id=obj_in.student_id)
        if not student:
            raise EntityNotFoundError("Student", obj_in.student_id)
        
        # Require IDs
        if not obj_in.academic_year_id or not obj_in.grade_id or not obj_in.section_id:
            raise BusinessRuleViolationError("academic_year_id, grade_id, and section_id are required")
        
        # Resolve related entities by ID for display-only names
        ay = academic_year_crud.get_by_id(self.db, tenant_id=self.tenant_id, id=obj_in.academic_year_id)
        if not ay:
            raise EntityNotFoundError("AcademicYear", obj_in.academic_year_id)
        gr = academic_grade.get_by_id(self.db, tenant_id=self.tenant_id, id=obj_in.grade_id)
        if not gr:
            raise EntityNotFoundError("AcademicGrade", obj_in.grade_id)
        sec = section.get_by_id(self.db, tenant_id=self.tenant_id, id=obj_in.section_id)
        if not sec:
            raise EntityNotFoundError("Section", obj_in.section_id)
        
        # Check duplicate in the same academic year (ID-based)
        existing = self.crud.get_by_student_academic_year(
            self.db, self.tenant_id, obj_in.student_id, obj_in.academic_year_id
        )
        
        # If an active enrollment already exists for this year, it's a conflict
        if existing and existing.is_active and existing.status == "active":
            raise DuplicateEntityError("Enrollment", "academic_year_id", obj_in.academic_year_id)
        
        # If creating an active enrollment, deactivate any other active enrollments for this student
        if obj_in.is_active:
            active_enrollment = await self.get_active_enrollment(obj_in.student_id)
            if active_enrollment and (not existing or active_enrollment.id != existing.id):
                await self.update(id=active_enrollment.id, obj_in={"is_active": False})
        
        # Prepare data with mirrors for display
        data = obj_in.model_dump()
        data["academic_year"] = ay.name
        data["grade"] = gr.name
        data["section"] = sec.name
        
        # Invalidate caches for this student
        await cache.delete(f"enrollments:multi:tenant={self.tenant_id}")
        await cache.delete(f"enrollments:active:student_id={obj_in.student_id}:tenant={self.tenant_id}")
        
        if existing:
            # Reactivate and update existing record
            data["is_active"] = True
            data["status"] = "active"
            enrollment = await self.update(id=existing.id, obj_in=data)
        else:
            # Create new enrollment record
            enrollment = await super().create(obj_in=EnrollmentCreate(**data))

        # Auto-enroll in all classes configured for this Grade & Section
        try:
            from src.db.crud.academics.class_crud import class_crud
            from src.services.academics.class_enrollment_service import ClassEnrollmentService
            from src.schemas.academics.class_enrollment import ClassEnrollmentCreate
            
            # Find classes for this grade/section
            eligible_classes = class_crud.get_by_grade_and_section(
                self.db, 
                tenant_id=self.tenant_id, 
                academic_year_id=obj_in.academic_year_id,
                grade_id=obj_in.grade_id, 
                section_id=obj_in.section_id
            )
            
            if eligible_classes:
                ce_service = ClassEnrollmentService(tenant=self.tenant_id, db=self.db)
                for cls in eligible_classes:
                    try:
                        # Skip if not active class?
                        if not cls.is_active:
                            continue
                            
                        await ce_service.enroll_student(obj_in=ClassEnrollmentCreate(
                            student_id=obj_in.student_id,
                            class_id=cls.id,
                            academic_year_id=obj_in.academic_year_id,
                            enrollment_date=obj_in.enrollment_date or date.today(),
                            status="active",
                            is_active=True
                        ))
                    except DuplicateEntityError:
                        # Already enrolled, skip
                        continue
                    except Exception as e:
                        print(f"Auto-enrollment warning for class {cls.id}: {e}")
                        
        except Exception as e:
            print(f"Auto-enrollment failed: {e}")
            # We don't block the main enrollment if class auto-enrollment fails
            
        return enrollment
    
    async def update_status(self, id: UUID, status: str, 
                     withdrawal_date: Optional[date] = None, 
                     withdrawal_reason: Optional[str] = None,
                     transfer_school: Optional[str] = None) -> Enrollment:
        """Update an enrollment's status with validation."""
        enrollment = await self.get(id=id)
        if not enrollment:
            raise EntityNotFoundError("Enrollment", id)
        
        # Define valid status transitions
        valid_transitions = {
            "active": ["completed", "withdrawn", "transferred"],
            "completed": [],  # Terminal state
            "withdrawn": [],   # Terminal state
            "transferred": []  # Terminal state
        }
        
        if status not in valid_transitions.get(enrollment.status, []):
            raise InvalidStatusTransitionError("Enrollment", enrollment.status, status)
        
        # Update enrollment status
        updated_enrollment = enrollment_crud.update_status(
            self.db, tenant_id=self.tenant_id, id=id, 
            status=status, withdrawal_date=withdrawal_date, withdrawal_reason=withdrawal_reason
        )

        # If transferred, update student record
        if status == "transferred" and updated_enrollment:
             from src.db.crud.people import student as student_crud
             student = student_crud.get_by_id(self.db, tenant_id=self.tenant_id, id=updated_enrollment.student_id)
             if student:
                 # Helper method on Student model: transfer(self, date_left: date, new_school: str, reason: str = None)
                 student.transfer(
                     date_left=withdrawal_date or date.today(),
                     new_school=transfer_school,
                     reason=withdrawal_reason
                 )
                 self.db.add(student)
                 self.db.commit()

        return updated_enrollment
    


    async def promote_student(self, student_id: UUID, new_academic_year: str, new_grade: str, new_section: str) -> Enrollment:
        """Promote a student to a new grade and section for a new academic year."""
        # Get current active enrollment
        current_enrollment = await self.get_active_enrollment(student_id)
        if not current_enrollment:
            raise EntityNotFoundError("Active Enrollment", student_id)
        
        # Mark current enrollment as completed
        await self.update_status(current_enrollment.id, "completed")
        
        # Create new enrollment for the next academic year
        new_enrollment = await self.create(obj_in=EnrollmentCreate(
            student_id=student_id,
            academic_year=new_academic_year,
            grade=new_grade,
            section=new_section,
            enrollment_date=date.today(),
            status="active",
            is_active=True
        ))
        
        return new_enrollment
    
    async def count(self, search: Optional[str] = None, **filters) -> int:
        """Count enrollments with optional filters and search."""
        return self.crud.count(self.db, self.tenant_id, search=search, **filters)
    
    async def get_multi(self, *, skip: int = 0, limit: int = 100, options: Optional[List[Any]] = None, search: Optional[str] = None, **filters) -> List[Enrollment]:
        """Get multiple enrollments with pagination, filters, and search."""
        return self.crud.get_multi(self.db, self.tenant_id, skip=skip, limit=limit, options=options, search=search, **filters)


    
    async def remove(self, *, id: Any) -> Optional[Enrollment]:
        """Remove an enrollment and associated class enrollments."""
        db_obj = await self.get(id=id)
        if not db_obj:
            return None
        
        # Cleanup associated class enrollments first
        self.db.query(ClassEnrollment).filter(
            ClassEnrollment.tenant_id == self.tenant_id,
            ClassEnrollment.student_id == db_obj.student_id,
            ClassEnrollment.academic_year_id == db_obj.academic_year_id
        ).delete(synchronize_session=False)
        self.db.commit()
        
        return self.crud.remove(self.db, self.tenant_id, id=id)


class SuperAdminEnrollmentService(SuperAdminBaseService[Enrollment, EnrollmentCreate, EnrollmentUpdate]):
    """Super-admin service for managing enrollments across all tenants."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(crud=enrollment_crud, model=Enrollment, *args, **kwargs)
    
    async def get_all_enrollments(self, skip: int = 0, limit: int = 100,
                          academic_year: Optional[str] = None,
                          grade: Optional[str] = None,
                          section: Optional[str] = None,
                          status: Optional[str] = None,
                          tenant_id: Optional[UUID] = None) -> List[Enrollment]:
        """Get all enrollments across all tenants with filtering."""
        query = self.db.query(Enrollment)
        
        # Apply filters
        if academic_year:
            query = query.filter(Enrollment.academic_year == academic_year)
        if grade:
            query = query.filter(Enrollment.grade == grade)
        if section:
            query = query.filter(Enrollment.section == section)
        if status:
            query = query.filter(Enrollment.status == status)
        if tenant_id:
            query = query.filter(Enrollment.tenant_id == tenant_id)
        
        # Apply pagination
        return query.offset(skip).limit(limit).all()

    async def update_semester_status(
        self,
        *,
        id: UUID,
        semester: int,
        status: str,
        completion_date: Optional[date] = None
    ) -> Enrollment:
        """Update semester status and optional completion date."""
        enrollment = await self.get(id=id)
        if not enrollment:
            raise EntityNotFoundError("Enrollment", id)

        if semester not in (1, 2):
            raise BusinessRuleViolationError("semester must be 1 or 2")

        allowed = {"pending", "active", "completed", "failed"}
        if status not in allowed:
            raise BusinessRuleViolationError("Invalid semester status")

        payload: Dict[str, Any] = {}
        if semester == 1:
            payload["semester_1_status"] = status
            if status == "completed":
                payload["semester_1_completion_date"] = completion_date or date.today()
        else:
            payload["semester_2_status"] = status
            if status == "completed":
                payload["semester_2_completion_date"] = completion_date or date.today()

        # Persist via base update
        return await self.crud.update(self.db, self.tenant_id, db_obj=enrollment, obj_in=payload)

