from typing import Any, List, Optional
from uuid import UUID
from datetime import time

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from src.services.academics.schedule_service import ScheduleService, SuperAdminScheduleService
from src.db.session import get_db
from src.schemas.academics.schedule import Schedule, ScheduleCreate, ScheduleUpdate, ScheduleWithDetails
from src.db.models.academics.schedule import DayOfWeek
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

# Dependency function for ScheduleService
def get_schedule_service(
    tenant_id: Any = Depends(get_tenant_from_request),
    db: Session = Depends(get_db)
) -> ScheduleService:
    return ScheduleService(tenant_id=tenant_id, db=db)

# Schedule endpoints
@router.post("/schedules", response_model=Schedule, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    *,
    schedule_service: ScheduleService = Depends(get_schedule_service),
    schedule_in: ScheduleCreate,
    current_user: User = Depends(has_any_role(["admin"]))
) -> Any:
    """Create a new schedule (requires admin or teacher role)."""
    try:
        return await schedule_service.create(obj_in=schedule_in)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.get("/schedules", response_model=List[Schedule])
async def get_schedules(
    *,
    schedule_service: ScheduleService = Depends(get_schedule_service),
    skip: int = 0,
    limit: int = 100,
    class_id: Optional[UUID] = None,
    day_of_week: Optional[str] = None,
    period: Optional[int] = None
) -> Any:
    """Get all schedules for a tenant with optional filtering."""
    filters = {}
    if class_id:
        filters["class_id"] = class_id
    if day_of_week:
        try:
            day_enum = DayOfWeek(day_of_week.lower())
            filters["day_of_week"] = day_enum
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid day of week: {day_of_week}"
            )
    if period is not None:
        filters["period"] = period
    
    return await schedule_service.list(skip=skip, limit=limit, filters=filters)

@router.get("/schedules/my-schedule", response_model=List[Schedule])
async def get_my_schedule(
    *,
    schedule_service: ScheduleService = Depends(get_schedule_service),
    current_user: User = Depends(has_any_role(["teacher"]))
) -> Any:
    """Get the logged-in teacher's personal schedule."""
    return await schedule_service.get_teacher_schedule(teacher_id=current_user.id)

@router.get("/schedules/{schedule_id}", response_model=Schedule)
async def get_schedule(
    *,
    schedule_service: ScheduleService = Depends(get_schedule_service),
    schedule_id: UUID
) -> Any:
    """Get a specific schedule by ID."""
    schedule = await schedule_service.get(id=schedule_id)
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Schedule with ID {schedule_id} not found"
        )
    return schedule

@router.put("/schedules/{schedule_id}", response_model=Schedule)
async def update_schedule(
    *,
    schedule_service: ScheduleService = Depends(get_schedule_service),
    schedule_id: UUID,
    schedule_in: ScheduleUpdate,
    current_user: User = Depends(has_any_role(["admin"]))
) -> Any:
    """Update a schedule."""
    try:
        schedule = await schedule_service.get(id=schedule_id)
        if not schedule:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Schedule with ID {schedule_id} not found"
            )
        return await schedule_service.update(id=schedule_id, obj_in=schedule_in)
    except BusinessLogicError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.delete("/schedules/{schedule_id}", response_model=Schedule)
async def delete_schedule(
    *,
    schedule_service: ScheduleService = Depends(get_schedule_service),
    schedule_id: UUID,
    current_user: User = Depends(has_any_role(["admin"]))
) -> Any:
    """Delete a schedule (admin only)."""
    schedule = await schedule_service.get(id=schedule_id)
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Schedule with ID {schedule_id} not found"
        )
    return await schedule_service.delete(id=schedule_id)


@router.get("/super-admin/schedules", response_model=List[ScheduleWithDetails])
async def get_all_schedules(
    *,
    schedule_service: SuperAdminScheduleService = Depends(),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1),
    tenant_id: Optional[UUID] = None,
    class_id: Optional[UUID] = None,
    day_of_week: Optional[str] = None,
    current_user: User = Depends(has_permission("view_all_schedules"))
) -> Any:
    """Get all schedules across all tenants with filtering (super-admin only)."""
    return await schedule_service.get_all_schedules(
        skip=skip,
        limit=limit,
        tenant_id=tenant_id,
        class_id=class_id,
        day_of_week=day_of_week
    )