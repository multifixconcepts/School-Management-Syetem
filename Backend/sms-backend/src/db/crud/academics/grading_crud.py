from typing import List, Optional, Any, Union, Dict
from sqlalchemy.orm import Session
from uuid import UUID

from src.db.crud.base import TenantCRUDBase
from src.db.models.academics.grading_schema import GradingSchema, GradingCategory
from src.schemas.academics.grading_schema import (
    GradingSchemaCreate, GradingSchemaUpdate,
    GradingCategoryCreate, GradingCategoryUpdate
)

class CRUDGradingSchema(TenantCRUDBase[GradingSchema, GradingSchemaCreate, GradingSchemaUpdate]):
    def create_with_categories(
        self, db: Session, *, tenant_id: Any, obj_in: GradingSchemaCreate
    ) -> GradingSchema:
        # Create schema first
        db_obj = GradingSchema(
            name=obj_in.name,
            description=obj_in.description,
            is_active=obj_in.is_active,
            academic_year_id=obj_in.academic_year_id,
            tenant_id=tenant_id
        )
        db.add(db_obj)
        db.flush()  # Get ID
        
        # Add categories
        for cat_in in obj_in.categories:
            category = GradingCategory(
                **cat_in.model_dump(),
                schema_id=db_obj.id,
                tenant_id=tenant_id
            )
            db.add(category)
        
        db.commit()
        db.refresh(db_obj)
        return db_obj
    
    def update_with_categories(
        self, db: Session, *, tenant_id: Any, db_obj: GradingSchema, obj_in: GradingSchemaUpdate
    ) -> GradingSchema:
        """Update schema and replace all categories."""
        # Update main schema fields
        update_data = obj_in.model_dump(exclude_unset=True, exclude={'categories'})
        for field, value in update_data.items():
            setattr(db_obj, field, value)
        
        # If categories are provided, replace them all
        if obj_in.categories is not None:
            # Delete existing categories
            db.query(GradingCategory).filter(
                GradingCategory.schema_id == db_obj.id,
                GradingCategory.tenant_id == tenant_id
            ).delete(synchronize_session=False)
            
            # Add new categories
            for cat_in in obj_in.categories:
                category = GradingCategory(
                    **cat_in.model_dump(),
                    schema_id=db_obj.id,
                    tenant_id=tenant_id
                )
                db.add(category)
        
        db.commit()
        db.refresh(db_obj)
        return db_obj

class CRUDGradingCategory(TenantCRUDBase[GradingCategory, GradingCategoryCreate, GradingCategoryUpdate]):
    def get_by_schema(self, db: Session, *, tenant_id: Any, schema_id: UUID) -> List[GradingCategory]:
        return db.query(GradingCategory).filter(
            GradingCategory.tenant_id == tenant_id,
            GradingCategory.schema_id == schema_id
        ).all()

grading_schema = CRUDGradingSchema(GradingSchema)
grading_category = CRUDGradingCategory(GradingCategory)
