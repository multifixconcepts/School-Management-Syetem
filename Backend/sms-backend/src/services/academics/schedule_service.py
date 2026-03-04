from typing import List, Optional, Dict, Any
from uuid import UUID

from src.db.crud.academics import schedule_crud
from src.db.models.academics.schedule import Schedule, DayOfWeek
from src.schemas.academics.schedule import ScheduleCreate, ScheduleUpdate
from src.services.base.base import TenantBaseService, SuperAdminBaseService
from src.core.exceptions.business import EntityNotFoundError


class ScheduleService(TenantBaseService[Schedule, ScheduleCreate, ScheduleUpdate]):
    """Service for managing schedules within a tenant."""
    
    def __init__(self, tenant=None, *args, **kwargs):
        if tenant and hasattr(tenant, 'id'):
            kwargs['tenant_id'] = tenant.id
        super().__init__(crud=schedule_crud, model=Schedule, *args, **kwargs)
    
    async def get_by_class(self, class_id: UUID) -> List[Schedule]:
        """Get schedules by class."""
        return schedule_crud.get_by_class(self.db, tenant_id=self.tenant_id, class_id=class_id)
    
    async def get_by_day(self, day_of_week: DayOfWeek) -> List[Schedule]:
        """Get schedules by day of week."""
        return schedule_crud.get_by_day(self.db, tenant_id=self.tenant_id, day_of_week=day_of_week)
    
    async def get_by_period(self, period: int) -> List[Schedule]:
        """Get schedules by period."""
        return schedule_crud.get_by_period(self.db, tenant_id=self.tenant_id, period=period)
    
    async def get_teacher_schedule(self, teacher_id: UUID) -> List[Schedule]:
        """Get personal schedule for a specific teacher."""
        from src.db.models.academics.class_subject import ClassSubject
        return self.db.query(Schedule).join(Schedule.class_obj).filter(
            ClassSubject.teacher_id == teacher_id,
            Schedule.tenant_id == self.tenant_id
        ).all()

    async def list(self, *, skip: int = 0, limit: int = 100, filters: Dict[str, Any] = {}) -> List[Schedule]:
        """List schedules with advanced filtering (handling container class_id)."""
        from sqlalchemy import or_
        from src.db.models.academics.class_subject import ClassSubject
        
        query = self.db.query(Schedule).filter(Schedule.tenant_id == self.tenant_id)
        
        # Handle class_id specially
        if "class_id" in filters:
            cid = filters["class_id"]
            # Join ClassSubject to allow filtering by either the container Class ID or the ClassSubject ID
            query = query.join(Schedule.class_obj).filter(
                or_(
                    ClassSubject.class_id == cid,
                    ClassSubject.id == cid
                )
            )
        
        # Apply other filters
        for field, value in filters.items():
            if field != "class_id" and hasattr(Schedule, field) and value is not None:
                query = query.filter(getattr(Schedule, field) == value)
                
        return query.offset(skip).limit(limit).all()


class SuperAdminScheduleService(SuperAdminBaseService[Schedule, ScheduleCreate, ScheduleUpdate]):
    """Super-admin service for managing schedules across all tenants."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(crud=schedule_crud, model=Schedule, *args, **kwargs)
    
    def get_all_schedules(self, skip: int = 0, limit: int = 100,
                         day_of_week: Optional[DayOfWeek] = None,
                         tenant_id: Optional[UUID] = None) -> List[Schedule]:
        """Get all schedules across all tenants with filtering."""
        query = self.db.query(Schedule)
        
        # Apply filters
        if day_of_week:
            query = query.filter(Schedule.day_of_week == day_of_week)
        if tenant_id:
            query = query.filter(Schedule.tenant_id == tenant_id)
        
        return query.offset(skip).limit(limit).all()

