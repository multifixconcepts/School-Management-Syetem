from typing import Any, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from src.services.academics import AssignmentService, SuperAdminAssignmentService
from src.schemas.academics.assignment import Assignment, AssignmentCreate, AssignmentUpdate
from src.core.auth.dependencies import has_any_role, has_permission
from src.schemas.auth import User
from src.core.exceptions.business import (
    EntityNotFoundError,
    BusinessRuleViolationError,
)

router = APIRouter()

# Create
@router.post("/assignments", response_model=Assignment, status_code=status.HTTP_201_CREATED)
async def create_assignment(
    *,
    assignment_service: AssignmentService = Depends(),
    assignment_in: AssignmentCreate,
    current_user: User = Depends(has_any_role(["admin", "teacher"]))
) -> Any:
    return await assignment_service.create(obj_in=assignment_in)

# List with filters
@router.get("/assignments", response_model=List[Assignment])
async def get_assignments(
    *,
    assignment_service: AssignmentService = Depends(),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1),
    subject_id: Optional[UUID] = None,
    teacher_id: Optional[UUID] = None,
    grade_id: Optional[UUID] = None,
    section_id: Optional[UUID] = None,
    academic_year_id: Optional[UUID] = None,
    period_id: Optional[UUID] = Query(None, description="Optional filter by period"),
    semester_id: Optional[UUID] = Query(None, description="Optional filter by semester"),
    is_published: Optional[bool] = None
) -> Any:
    filters = {}
    if subject_id:
        filters["subject_id"] = subject_id
    if teacher_id:
        filters["teacher_id"] = teacher_id
    if grade_id:
        filters["grade_id"] = grade_id
    if section_id:
        filters["section_id"] = section_id
    if academic_year_id:
        filters["academic_year_id"] = academic_year_id
    if period_id:
        filters["period_id"] = period_id
    if semester_id:
        filters["semester_id"] = semester_id
    if is_published is not None:
        filters["is_published"] = is_published
    return assignment_service.list(skip=skip, limit=limit, filters=filters)

# Get by ID
@router.get("/assignments/{assignment_id}", response_model=Assignment)
async def get_assignment(
    *,
    assignment_service: AssignmentService = Depends(),
    assignment_id: UUID
) -> Any:
    assignment = await assignment_service.get(id=assignment_id)
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Assignment with ID {assignment_id} not found")
    return assignment

# Update
@router.put("/assignments/{assignment_id}", response_model=Assignment)
async def update_assignment(
    *,
    assignment_service: AssignmentService = Depends(),
    assignment_id: UUID,
    assignment_in: AssignmentUpdate,
    current_user: User = Depends(has_any_role(["admin", "teacher"]))
) -> Any:
    db_obj = await assignment_service.get(id=assignment_id)
    if not db_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Assignment with ID {assignment_id} not found")
    try:
        return await assignment_service.update(db_obj=db_obj, obj_in=assignment_in)
    except BusinessRuleViolationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

# Delete
@router.delete("/assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_assignment(
    *,
    assignment_service: AssignmentService = Depends(),
    assignment_id: UUID,
    current_user: User = Depends(has_any_role(["admin"]))
) -> None:
    assignment = await assignment_service.get(id=assignment_id)
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Assignment with ID {assignment_id} not found")
    await assignment_service.delete(id=assignment_id)

# Publish/Unpublish
@router.put("/assignments/{assignment_id}/publish", response_model=Assignment)
async def publish_assignment(
    *,
    assignment_service: AssignmentService = Depends(),
    assignment_id: UUID,
    current_user: User = Depends(has_any_role(["admin", "teacher"]))
) -> Any:
    return await assignment_service.update_publication_status(id=assignment_id, is_published=True)
@router.put("/assignments/{assignment_id}/unpublish", response_model=Assignment)
async def unpublish_assignment(
    *,
    assignment_service: AssignmentService = Depends(),
    assignment_id: UUID,
    current_user: User = Depends(has_any_role(["admin", "teacher"]))
) -> Any:
    return await assignment_service.update_publication_status(id=assignment_id, is_published=False)

# Super Admin (global listing)
@router.get("/super-admin/assignments", response_model=List[Assignment])
async def get_all_assignments(
    *,
    assignment_service: SuperAdminAssignmentService = Depends(),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1),
    subject_id: Optional[UUID] = None,
    teacher_id: Optional[UUID] = None,
    grade_id: Optional[UUID] = None,
    is_published: Optional[bool] = None,
    tenant_id: Optional[UUID] = None,
    current_user: User = Depends(has_permission("view_all_assignments"))
) -> Any:
    return await assignment_service.get_all_assignments(
        skip=skip,
        limit=limit,
        subject_id=subject_id,
        teacher_id=teacher_id,
        grade_id=grade_id,
        is_published=is_published,
        tenant_id=tenant_id
    )