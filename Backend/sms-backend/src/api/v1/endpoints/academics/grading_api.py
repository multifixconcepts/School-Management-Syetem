from typing import Any, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from src.db.session import get_db
from src.schemas.academics.grading_schema import (
    GradingSchema, GradingSchemaCreate, GradingSchemaUpdate,
    GradingCategory, GradingCategoryCreate, GradingCategoryUpdate,
    GradingCategoryWithStatus
)
from src.db.crud.academics.grading_crud import grading_schema, grading_category
from src.core.auth.dependencies import has_any_role, get_current_user
from src.schemas.auth import User
from src.services.academics.grading_service import GradingService
from src.core.exceptions.business import DuplicateEntityError, EntityNotFoundError

router = APIRouter()

@router.post("/grading-schemas", response_model=GradingSchema, status_code=status.HTTP_201_CREATED)
async def create_schema(
    *,
    db: Session = Depends(get_db),
    schema_in: GradingSchemaCreate,
    current_user: User = Depends(has_any_role(["admin"]))
) -> Any:
    """Create a new grading schema with categories (Admin only)."""
    # Validate sum of weights is 100
    total_weight = sum(cat.weight for cat in schema_in.categories)
    if total_weight != 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Total weight must be exactly 100%. Current total: {total_weight}%"
        )
    
    tenant_id = current_user.tenant_id if hasattr(current_user, 'tenant_id') else None
    print(f"[DEBUG] Creating schema for tenant: {tenant_id}")
    try:
        result = grading_schema.create_with_categories(db, tenant_id=tenant_id, obj_in=schema_in)
        print(f"[DEBUG] Schema created successfully: {result.id}")
        return result
    except Exception as e:
        print(f"[DEBUG] Error in create_schema: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise e

@router.get("/grading-schemas", response_model=List[GradingSchema])
async def get_schemas(
    *,
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(has_any_role(["admin", "teacher", "student"]))
) -> Any:
    """Get all grading schemas for the tenant."""
    tenant_id = current_user.tenant_id if hasattr(current_user, 'tenant_id') else None
    return grading_schema.list(db, tenant_id=tenant_id, skip=skip, limit=limit)

@router.get("/grading-schemas/{schema_id}", response_model=GradingSchema)
async def get_schema(
    *,
    db: Session = Depends(get_db),
    schema_id: UUID,
    current_user: User = Depends(has_any_role(["admin", "teacher", "student"]))
) -> Any:
    """Get a specific grading schema by ID."""
    tenant_id = current_user.tenant_id if hasattr(current_user, 'tenant_id') else None
    db_obj = grading_schema.get_by_id(db, tenant_id=tenant_id, id=schema_id)
    if not db_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grading schema not found")
    return db_obj

@router.put("/grading-schemas/{schema_id}", response_model=GradingSchema)
async def update_schema(
    *,
    db: Session = Depends(get_db),
    schema_id: UUID,
    schema_in: GradingSchemaUpdate,
    current_user: User = Depends(has_any_role(["admin"]))
) -> Any:
    """Update a grading schema."""
    tenant_id = current_user.tenant_id if hasattr(current_user, 'tenant_id') else None
    db_obj = grading_schema.get_by_id(db, tenant_id=tenant_id, id=schema_id)
    if not db_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grading schema not found")
    return grading_schema.update_with_categories(db, tenant_id=tenant_id, db_obj=db_obj, obj_in=schema_in)

@router.delete("/grading-schemas/{schema_id}", response_model=GradingSchema)
async def delete_schema(
    *,
    db: Session = Depends(get_db),
    schema_id: UUID,
    current_user: User = Depends(has_any_role(["admin"]))
) -> Any:
    """Delete a grading schema."""
    tenant_id = current_user.tenant_id if hasattr(current_user, 'tenant_id') else None
    return grading_schema.delete(db, tenant_id=tenant_id, id=schema_id)

@router.get("/categories-status", response_model=List[GradingCategoryWithStatus])
async def get_categories_status(
    class_id: UUID,
    subject_id: UUID,
    period_id: Optional[UUID] = Query(None, description="Optional filter by specific period"),
    semester_id: Optional[UUID] = Query(None, description="Optional filter by specific semester"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Any:
    """Get grading categories with weight allocation status for a class/subject."""
    tenant_id = current_user.tenant_id if hasattr(current_user, 'tenant_id') else None
    service = GradingService(db, tenant_id)
    return await service.get_categories_with_status(
        class_id=class_id, 
        subject_id=subject_id,
        period_id=period_id,
        semester_id=semester_id
    )
