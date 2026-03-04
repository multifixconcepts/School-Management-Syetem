from typing import Any, List, Optional, Dict
from uuid import UUID
from fastapi import Depends
from sqlalchemy.orm import Session

from src.core.middleware.tenant import get_tenant_from_request
from src.db.session import get_db
from src.services.base.base import TenantBaseService
from src.db.crud.academics.assessment_crud import assessment_crud
from src.db.models.academics.assessment import Assessment
from src.db.models.academics.grade import GradeType
from src.schemas.academics.assessment import AssessmentCreate, AssessmentUpdate
from src.services.academics.grading_service import GradingService
from src.core.exceptions.business import BusinessRuleViolationError, EntityNotFoundError

from src.schemas.auth import User

class AssessmentService(TenantBaseService[Assessment, AssessmentCreate, AssessmentUpdate]):
    def __init__(self, tenant: Any = Depends(get_tenant_from_request), db: Session = Depends(get_db)):
        tenant_id = tenant.id if hasattr(tenant, "id") else tenant
        self.grading_service = GradingService(db, tenant_id)
        super().__init__(crud=assessment_crud, model=Assessment, tenant_id=tenant_id, db=db)

    def _apply_rbac_filter(self, query: Any, current_user: User) -> Any:
        """Apply RBAC filters to the assessment query."""
        user_roles = {role.name for role in current_user.roles}
        
        # Admin, Principal, Dean can see everything
        if any(role in ["admin", "super-admin", "principal", "dean"] for role in user_roles):
            return query
            
        # Teacher can see assessments they created OR for classes they are assigned to
        if "teacher" in user_roles:
            # For now, simplify to assessments they created. 
            # In a more complex system, we'd join with ClassSubject or ClassTeacher.
            return query.filter(Assessment.teacher_id == current_user.id)
            
        # Student can see assessments for classes they are enrolled in
        if "student" in user_roles:
            from src.db.models.academics.enrollment import Enrollment
            return query.join(
                Enrollment,
                (Enrollment.grade_id == Assessment.grade_id) & 
                ((Assessment.section_id == None) | (Enrollment.section_id == Assessment.section_id)) &
                (Enrollment.academic_year_id == Assessment.academic_year_id)
            ).filter(
                Enrollment.student_id == current_user.id,
                Enrollment.is_active == True
            )
            
        # Default: No access if no recognized role
        return query.filter(Assessment.id == None)

    async def list_assessments(self, *, skip: int = 0, limit: int = 100, filters: Optional[Dict] = None, current_user: User) -> List[Assessment]:
        """List assessments with RBAC filtering."""
        query = self.db.query(Assessment).filter(Assessment.tenant_id == self.tenant_id)
        
        # Apply filters
        if filters:
            for field, value in filters.items():
                if field == "period_id" and value:
                    from src.db.models.academics.period import Period
                    period = self.db.query(Period).filter(Period.id == value).first()
                    if period:
                        query = query.filter(Assessment.assessment_date >= period.start_date, Assessment.assessment_date <= period.end_date)
                elif field == "semester_id" and value:
                    from src.db.models.academics.semester import Semester
                    semester = self.db.query(Semester).filter(Semester.id == value).first()
                    if semester:
                        query = query.filter(Assessment.assessment_date >= semester.start_date, Assessment.assessment_date <= semester.end_date)
                elif hasattr(Assessment, field) and value is not None:
                    query = query.filter(getattr(Assessment, field) == value)
        
        # Apply RBAC
        query = self._apply_rbac_filter(query, current_user)
        
        return query.offset(skip).limit(limit).all()

    async def get_assessment(self, id: UUID, current_user: User) -> Optional[Assessment]:
        """Get a single assessment with RBAC check."""
        query = self.db.query(Assessment).filter(Assessment.id == id, Assessment.tenant_id == self.tenant_id)
        query = self._apply_rbac_filter(query, current_user)
        return query.first()

    async def update_assessment(self, id: UUID, obj_in: AssessmentUpdate, current_user: User) -> Assessment:
        """Update assessment with RBAC check (Owner or Admin)."""
        assessment = await self.get(id=id)
        if not assessment:
            raise EntityNotFoundError("Assessment", id)
            
        user_roles = {role.name for role in current_user.roles}
        is_admin = any(role in ["admin", "super-admin", "principal", "dean"] for role in user_roles)
        
        if not is_admin and assessment.teacher_id != current_user.id:
            raise BusinessRuleViolationError("You can only update your own assessments.")
            
        return await self.update(id=id, obj_in=obj_in)

    async def delete_assessment(self, id: UUID, current_user: User):
        """Delete assessment with RBAC check (Owner or Admin)."""
        assessment = await self.get(id=id)
        if not assessment:
            raise EntityNotFoundError("Assessment", id)
            
        user_roles = {role.name for role in current_user.roles}
        is_admin = any(role in ["admin", "super-admin", "principal", "dean"] for role in user_roles)
        
        if not is_admin and assessment.teacher_id != current_user.id:
            raise BusinessRuleViolationError("You can only delete your own assessments.")
            
        await self.delete(id=id)

    async def create(self, *, obj_in: AssessmentCreate) -> Assessment:
        """Create a new assessment with mark allocation validation."""
        if obj_in.class_id and obj_in.grading_category_id:
            # Validate that this assessment doesn't exceed the category weight
            await self.grading_service.validate_assessment_allocation(
                class_id=obj_in.class_id,
                category_id=obj_in.grading_category_id,
                max_score=obj_in.max_score
            )
        
        assessment = await super().create(obj_in=obj_in)

        # Automatic Attendance Population
        if obj_in.type == GradeType.ATTENDANCE:
            try:
                from src.services.academics.attendance_service import AttendanceService
                att_service = AttendanceService(db=self.db, tenant=self.tenant_id)
                await att_service.sync_assessment_attendance(
                    assessment=assessment,
                    marked_by=obj_in.teacher_id
                )
            except Exception as e:
                print(f"Warning: Failed to auto-sync attendance marks: {e}")
        
        return assessment

    async def get_by_subject(self, subject_id: Any) -> list[Assessment]:
        return self.crud.get_by_subject(self.db, tenant_id=self.tenant_id, subject_id=subject_id)

    async def get_by_grade(self, grade_id: Any) -> list[Assessment]:
        return self.crud.get_by_grade(self.db, tenant_id=self.tenant_id, grade_id=grade_id)
