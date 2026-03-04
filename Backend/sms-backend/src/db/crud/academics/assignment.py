from typing import Any, Dict, List, Optional, Union
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from datetime import date

from src.db.crud.base import TenantCRUDBase
from src.db.models.academics.assignment import Assignment
from src.db.models.academics.subject import Subject
from src.db.models.academics.academic_grade import AcademicGrade
from src.db.models.academics.section import Section
from src.db.models.auth.user import User
from src.schemas.academics.assignment import AssignmentCreate, AssignmentUpdate


class CRUDAssignment(TenantCRUDBase[Assignment, AssignmentCreate, AssignmentUpdate]):
    """CRUD operations for Assignment model."""
    
    def get_by_subject(self, db: Session, tenant_id: Any, subject_id: Any) -> List[Assignment]:
        """Get all assignments for a specific subject within a tenant."""
        return db.query(Assignment).filter(
            Assignment.tenant_id == tenant_id,
            Assignment.subject_id == subject_id
        ).all()
    
    def get_by_teacher(self, db: Session, tenant_id: Any, teacher_id: Any) -> List[Assignment]:
        """Get all assignments created by a specific teacher within a tenant."""
        return db.query(Assignment).filter(
            Assignment.tenant_id == tenant_id,
            Assignment.teacher_id == teacher_id
        ).all()
    
    def get_by_grade_section(self, db: Session, tenant_id: Any, grade_id: Any, section_id: Optional[Any] = None) -> List[Assignment]:
        """Get all assignments for a specific grade and optionally section within a tenant."""
        query = db.query(Assignment).filter(
            Assignment.tenant_id == tenant_id,
            Assignment.grade_id == grade_id
        )
        
        if section_id:
            query = query.filter(Assignment.section_id == section_id)
        
        return query.all()
    
    def get_published(self, db: Session, tenant_id: Any) -> List[Assignment]:
        """Get all published assignments within a tenant."""
        return db.query(Assignment).filter(
            Assignment.tenant_id == tenant_id,
            Assignment.is_published == True
        ).all()
    
    def get_upcoming(self, db: Session, tenant_id: Any, days: int = 7) -> List[Assignment]:
        """Get all assignments due within the next X days within a tenant."""
        today = date.today()
        future_date = today + date.timedelta(days=days)
        
        return db.query(Assignment).filter(
            Assignment.tenant_id == tenant_id,
            Assignment.due_date >= today,
            Assignment.due_date <= future_date
        ).all()
    
    def get_overdue(self, db: Session, tenant_id: Any) -> List[Assignment]:
        """Get all assignments that are past their due date within a tenant."""
        today = date.today()
        
        return db.query(Assignment).filter(
            Assignment.tenant_id == tenant_id,
            Assignment.due_date < today
        ).all()
    
    def get_with_details(self, db: Session, tenant_id: Any, id: Any) -> Optional[Dict]:
        """Get assignment with additional details."""
        result = db.query(
            Assignment,
            Subject.name.label("subject_name"),
            User.full_name.label("teacher_name"),
            AcademicGrade.name.label("grade_name"),
            Section.name.label("section_name")
        ).join(Subject, Assignment.subject_id == Subject.id
        ).join(User, Assignment.teacher_id == User.id
        ).join(AcademicGrade, Assignment.grade_id == AcademicGrade.id
        ).outerjoin(Section, Assignment.section_id == Section.id
        ).filter(
            Assignment.tenant_id == tenant_id,
            Assignment.id == id
        ).first()
        
        if not result:
            return None
            
        assignment_dict = {c.name: getattr(result[0], c.name) for c in result[0].__table__.columns}
        assignment_dict.update({
            "subject_name": result.subject_name,
            "teacher_name": result.teacher_name,
            "grade_name": result.grade_name,
            "section_name": result.section_name
        })
        return assignment_dict
    
    def update_publication_status(self, db: Session, tenant_id: Any, id: Any, is_published: bool) -> Optional[Assignment]:
        """Update an assignment's publication status."""
        assignment = self.get_by_id(db, tenant_id, id)
        if not assignment:
            return None
            
        assignment.is_published = is_published
        db.add(assignment)
        db.commit()
        db.refresh(assignment)
        return assignment


    def list_with_details(self, db: Session, tenant_id: Any, skip: int = 0, limit: int = 100, **filters) -> List[Assignment]:
        """List assignments with basic relationship eager loading."""
        from sqlalchemy.orm import joinedload
        query = db.query(Assignment).options(
            joinedload(Assignment.subject),
            joinedload(Assignment.grade),
            joinedload(Assignment.academic_year),
            joinedload(Assignment.teacher),
            joinedload(Assignment.section)
        ).filter(Assignment.tenant_id == tenant_id)
        
        for field, value in filters.items():
            if field == "period_id" and value:
                from src.db.models.academics.period import Period
                period = db.query(Period).filter(Period.id == value).first()
                if period:
                    query = query.filter(Assignment.due_date >= period.start_date, Assignment.due_date <= period.end_date)
            elif field == "semester_id" and value:
                from src.db.models.academics.semester import Semester
                semester = db.query(Semester).filter(Semester.id == value).first()
                if semester:
                    query = query.filter(Assignment.due_date >= semester.start_date, Assignment.due_date <= semester.end_date)
            elif hasattr(Assignment, field) and value is not None:
                query = query.filter(getattr(Assignment, field) == value)
                
        return query.offset(skip).limit(limit).all()

assignment = CRUDAssignment(Assignment)

