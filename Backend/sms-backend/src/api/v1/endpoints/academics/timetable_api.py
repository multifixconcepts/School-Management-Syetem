from typing import Any, List, Optional, Dict
from uuid import UUID
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from src.services.academics.timetable_service import TimetableService, SuperAdminTimetableService
from src.db.session import get_db
from src.schemas.academics.timetable import Timetable, TimetableCreate, TimetableUpdate, TimetableWithDetails
from src.core.middleware.tenant import get_tenant_from_request
from src.core.auth.dependencies import has_any_role, get_current_user, has_permission
from src.schemas.auth import User
from src.core.exceptions.business import (
    BusinessLogicError,
    EntityNotFoundError,
    DuplicateEntityError,
    BusinessRuleViolationError
)

router = APIRouter()

# Dependency function for TimetableService
def get_timetable_service(
    tenant_id: Any = Depends(get_tenant_from_request),
    db: Session = Depends(get_db)
) -> TimetableService:
    return TimetableService(tenant_id=tenant_id, db=db)

# Timetable endpoints
@router.post("/timetables", response_model=TimetableWithDetails, status_code=status.HTTP_201_CREATED)
async def create_timetable(
    *,
    timetable_service: TimetableService = Depends(get_timetable_service),
    timetable_in: TimetableCreate,
    current_user: User = Depends(has_any_role(["admin"]))
) -> Any:
    """Create a new timetable (requires admin role)."""
    try:
        return await timetable_service.create(obj_in=timetable_in)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.get("/timetables", response_model=List[TimetableWithDetails])
async def get_timetables(
    *,
    timetable_service: TimetableService = Depends(get_timetable_service),
    skip: int = 0,
    limit: int = 100,
    academic_year: Optional[str] = None,
    academic_year_id: Optional[UUID] = None,
    grade_id: Optional[UUID] = None,
    section_id: Optional[UUID] = None,
    is_active: Optional[bool] = None,
    teacher_id: Optional[UUID] = None
) -> Any:
    """Get all timetables for a tenant with optional filtering."""
    filters: Dict[str, Any] = {}
    if academic_year_id:
        filters["academic_year_id"] = academic_year_id
    if academic_year:
        filters["academic_year"] = academic_year
    if grade_id:
        filters["grade_id"] = grade_id
    if section_id:
        filters["section_id"] = section_id
    if is_active is not None:
        filters["is_active"] = is_active
    if teacher_id:
        filters["teacher_id"] = teacher_id

    return await timetable_service.list(skip=skip, limit=limit, filters=filters)


@router.get("/timetables/current", response_model=List[TimetableWithDetails])
async def get_current_timetables(
    *,
    timetable_service: TimetableService = Depends(get_timetable_service),
    date: Optional[date] = None
) -> Any:
    """Get timetables effective on the current date or specified date."""
    return await timetable_service.get_current_timetables(current_date=date)

@router.get("/timetables/{timetable_id}", response_model=TimetableWithDetails)
async def get_timetable(
    *,
    timetable_service: TimetableService = Depends(get_timetable_service),
    timetable_id: UUID
) -> Any:
    """Get a specific timetable by ID."""
    timetable = await timetable_service.get(id=timetable_id)
    if not timetable:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Timetable with ID {timetable_id} not found"
        )
    return timetable

@router.put("/timetables/{timetable_id}", response_model=TimetableWithDetails)
async def update_timetable(
    *,
    timetable_service: TimetableService = Depends(get_timetable_service),
    timetable_id: UUID,
    timetable_in: TimetableUpdate,
    current_user: User = Depends(has_any_role(["admin"]))
) -> Any:
    """Update a timetable."""
    try:
        timetable = await timetable_service.get(id=timetable_id)
        if not timetable:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Timetable with ID {timetable_id} not found"
            )
        return await timetable_service.update(id=timetable_id, obj_in=timetable_in)
    except BusinessLogicError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.delete("/timetables/{timetable_id}", response_model=TimetableWithDetails)
async def delete_timetable(
    *,
    timetable_service: TimetableService = Depends(get_timetable_service),
    timetable_id: UUID,
    current_user: User = Depends(has_any_role(["admin"]))
) -> Any:
    """Delete a timetable (admin only)."""
    timetable = await timetable_service.get(id=timetable_id)
    if not timetable:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Timetable with ID {timetable_id} not found"
        )
    return await timetable_service.delete(id=timetable_id)