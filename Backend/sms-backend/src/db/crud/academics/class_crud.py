from typing import Any, Dict, List, Optional, Union
from uuid import UUID
from sqlalchemy.orm import Session

from src.db.crud.base import TenantCRUDBase
from src.db.models.academics.class_model import Class
from src.schemas.academics.class_schema import ClassCreate, ClassUpdate


class CRUDClass(TenantCRUDBase[Class, ClassCreate, ClassUpdate]):
    """CRUD operations for Class model."""
    
    def get_by_name(self, db: Session, tenant_id: Any, name: str) -> Optional[Class]:
        """Get a class by name within a tenant."""
        return db.query(Class).filter(
            Class.tenant_id == tenant_id,
            Class.name == name
        ).first()
    
    def get_by_academic_year(self, db: Session, tenant_id: Any, academic_year_id: UUID) -> List[Class]:
        """Get classes by academic year ID within a tenant."""
        return db.query(Class).filter(
            Class.tenant_id == tenant_id,
            Class.academic_year_id == academic_year_id
        ).all()
    
    def get_by_grade_and_section(self, db: Session, tenant_id: Any, academic_year_id: UUID, grade_id: UUID, section_id: UUID) -> List[Class]:
        """Get classes by academic year, grade and section within a tenant."""
        return db.query(Class).filter(
            Class.tenant_id == tenant_id,
            Class.academic_year_id == academic_year_id,
            Class.grade_id == grade_id,
            Class.section_id == section_id
        ).all()
    
    def get_by_teacher(self, db: Session, tenant_id: Any, teacher_id: UUID) -> List[Class]:
        """Get classes where a teacher is the Class Sponsor within a tenant."""
        return db.query(Class).filter(
            Class.tenant_id == tenant_id,
            Class.class_teacher_id == teacher_id
        ).all()
    
    def get_by_identity(
        self,
        db: Session,
        tenant_id: Any,
        academic_year_id: UUID,
        grade_id: UUID,
        section_id: UUID,
    ) -> Optional[Class]:
        """Get a class by its unique identity (Year + Grade + Section)."""
        return db.query(Class).filter(
            Class.tenant_id == tenant_id,
            Class.academic_year_id == academic_year_id,
            Class.grade_id == grade_id,
            Class.section_id == section_id
        ).first()
    
    def get_by_subject(self, db: Session, tenant_id: Any, subject_id: UUID) -> List[Class]:
        """Get classes associated with a specific subject via ClassSubject."""
        from src.db.models.academics.class_subject import ClassSubject
        return db.query(Class).join(ClassSubject).filter(
            Class.tenant_id == tenant_id,
            ClassSubject.subject_id == subject_id
        ).all()
    
    def list(self, db: Session, *, tenant_id: Any = None, skip: int = 0, limit: int = 100, options: Optional[List[Any]] = None, **kwargs) -> List[Class]:
        """Override list to handle subject_id and teacher_id filtering through ClassSubject."""
        from src.db.models.academics.class_subject import ClassSubject
        from src.utils.uuid_utils import ensure_uuid
        
        tenant_id_uuid = ensure_uuid(tenant_id)
        query = db.query(Class).filter(Class.tenant_id == tenant_id_uuid)
        
        if options:
            for option in options:
                query = query.options(option)
        
        filters = kwargs.get('filters', {})
        
        # Handle subject_id filter
        if "subject_id" in filters and filters["subject_id"]:
            query = query.join(ClassSubject).filter(ClassSubject.subject_id == filters["subject_id"])
            
        # Handle teacher_id filter (specific to subjects)
        if "teacher_id" in filters and filters["teacher_id"]:
            # If we haven't joined already
            if "subject_id" not in filters:
                query = query.join(ClassSubject)
            query = query.filter(ClassSubject.teacher_id == filters["teacher_id"])
            
        # Handle other standard filters
        for field, value in filters.items():
            if field in ["subject_id", "teacher_id"]:
                continue
            if hasattr(self.model, field):
                column = getattr(self.model, field)
                if isinstance(value, list) and value:
                    query = query.filter(column.in_(value))
                elif value is not None:
                    query = query.filter(column == value)
        
        query = query.order_by(Class.created_at.desc())
        return query.offset(skip).limit(limit).all()

    def get_active_classes(self, db: Session, tenant_id: Any) -> List[Class]:
        """Get all active classes within a tenant."""
        return db.query(Class).filter(
            Class.tenant_id == tenant_id,
            Class.is_active == True
        ).all()


class_crud = CRUDClass(Class)

