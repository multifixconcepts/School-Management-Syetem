from typing import Any, Dict, List, Optional, Union
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from datetime import date

from src.db.crud.base import TenantCRUDBase
from src.db.models.academics.enrollment import Enrollment
from src.db.models.people.student import Student
from src.schemas.academics.enrollment import EnrollmentCreate, EnrollmentUpdate


class CRUDEnrollment(TenantCRUDBase[Enrollment, EnrollmentCreate, EnrollmentUpdate]):
    """CRUD operations for Enrollment model."""
    
    def get_by_student_academic_year(self, db: Session, tenant_id: Any, student_id: Any, academic_year_id: Any) -> Optional[Enrollment]:
        """Get a student's enrollment for a specific academic year within a tenant."""
        return db.query(Enrollment).filter(
            Enrollment.tenant_id == tenant_id,
            Enrollment.student_id == student_id,
            Enrollment.academic_year_id == academic_year_id
        ).first()
    
    def get_active_enrollment(self, db: Session, tenant_id: Any, student_id: Any) -> Optional[Enrollment]:
        return (
            db.query(Enrollment)
            .filter(
                Enrollment.tenant_id == tenant_id,
                Enrollment.student_id == student_id,
                Enrollment.is_active == True,
                Enrollment.status == "active",
            )
            .order_by(Enrollment.updated_at.desc())
            .first()
        )
    
    def get_by_grade_section(self, db: Session, tenant_id: Any, academic_year: str, grade: str, section: str) -> List[Enrollment]:
        """Get all enrollments for a specific grade and section within a tenant."""
        return db.query(Enrollment).filter(
            Enrollment.tenant_id == tenant_id,
            Enrollment.academic_year == academic_year,
            Enrollment.grade == grade,
            Enrollment.section == section
        ).all()
    
    def get_with_student_details(self, db: Session, tenant_id: Any, id: Any) -> Optional[Dict]:
        """Get enrollment with student details."""
        result = db.query(
            Enrollment,
            Student.full_name.label("student_name"),
            Student.email.label("student_email"),
            Student.admission_number.label("student_admission_number")
        ).join(Student, Enrollment.student_id == Student.id).filter(
            Enrollment.tenant_id == tenant_id,
            Enrollment.id == id
        ).first()
        
        if not result:
            return None
            
        enrollment_dict = {c.name: getattr(result[0], c.name) for c in result[0].__table__.columns}
        enrollment_dict.update({
            "student_name": result.student_name,
            "student_email": result.student_email,
            "student_admission_number": result.student_admission_number
        })
        return enrollment_dict
    
    def update_status(self, db: Session, tenant_id: Any, id: Any, status: str, 
                     withdrawal_date: Optional[date] = None, 
                     withdrawal_reason: Optional[str] = None) -> Optional[Enrollment]:
        """Update an enrollment's status."""
        enrollment = self.get_by_id(db, tenant_id, id)
        if not enrollment:
            return None
            
        enrollment.status = status
        if status == "withdrawn" or status == "transferred":
            enrollment.is_active = False
            enrollment.withdrawal_date = withdrawal_date or date.today()
            enrollment.withdrawal_reason = withdrawal_reason
            
        db.add(enrollment)
        db.commit()
        db.refresh(enrollment)
        return enrollment
    
    def remove(self, db: Session, tenant_id: Any, *, id: Any) -> Optional[Enrollment]:
        """Remove an enrollment with tenant validation."""
        enrollment = self.get_by_id(db, tenant_id, id)
        if not enrollment:
            return None
        
        db.delete(enrollment)
        db.commit()
        return enrollment
    
    def count(self, db: Session, tenant_id: Any, search: Optional[str] = None, **filters) -> int:
        """Count enrollments with optional filters and search."""
        tenant_id = self._ensure_uuid(tenant_id)
        query = db.query(self.model).filter(self.model.tenant_id == tenant_id)
        
        # Apply search if provided
        if search:
            search_filter = f"%{search}%"
            query = query.join(Student, self.model.student_id == Student.id).filter(
                or_(
                    Student.first_name.ilike(search_filter),
                    Student.last_name.ilike(search_filter),
                    # full name search
                    func.concat(Student.first_name, ' ', Student.last_name).ilike(search_filter),
                    Student.admission_number.ilike(search_filter)
                )
            )

        # Apply filters
        for field, value in filters.items():
            if hasattr(self.model, field) and value is not None:
                query = query.filter(getattr(self.model, field) == value)
        
        return query.count()
    
    def get_multi(
        self, 
        db: Session, 
        tenant_id: Any, 
        *, 
        skip: int = 0, 
        limit: int = 100, 
        options: Optional[List[Any]] = None,
        search: Optional[str] = None,
        **filters
    ) -> List[Enrollment]:
        """Get multiple enrollments with pagination, filters, and search support."""
        from sqlalchemy.orm import joinedload
        
        tenant_id = self._ensure_uuid(tenant_id)
        
        # Use joinedload for efficient and reliable relationship data inclusion
        query = db.query(Enrollment)
        
        # Apply passed options if any
        if options:
            for option in options:
                query = query.options(option)
        else:
            # Default joinedloads if none provided
            query = query.options(
                joinedload(Enrollment.student),
                joinedload(Enrollment.academic_year_obj),
                joinedload(Enrollment.grade_obj),
                joinedload(Enrollment.section_obj),
                joinedload(Enrollment.promotion_status)
            )
        
        query = query.filter(Enrollment.tenant_id == tenant_id)

        # Apply search if provided
        if search:
            search_filter = f"%{search}%"
            # Ensure we only join Student once
            query = query.join(Student, Enrollment.student_id == Student.id).filter(
                or_(
                    Student.first_name.ilike(search_filter),
                    Student.last_name.ilike(search_filter),
                    # Use concatenation for full name search
                    func.concat(Student.first_name, ' ', Student.last_name).ilike(search_filter),
                    Student.admission_number.ilike(search_filter)
                )
            )
        
        # Apply filters
        for field, value in filters.items():
            if hasattr(Enrollment, field) and value is not None:
                query = query.filter(getattr(Enrollment, field) == value)
        
        return query.offset(skip).limit(limit).all()


enrollment = CRUDEnrollment(Enrollment)

