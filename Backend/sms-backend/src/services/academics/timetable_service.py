from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import date

from src.db.crud.academics import timetable_crud
from src.db.models.academics.timetable import Timetable
from src.db.models.academics.schedule import Schedule
from src.db.models.academics.class_model import Class
from src.schemas.academics.timetable import TimetableCreate, TimetableUpdate
from src.services.base.base import TenantBaseService, SuperAdminBaseService
from src.core.exceptions.business import EntityNotFoundError, DuplicateEntityError
from src.core.exceptions.business import BusinessRuleViolationError
from src.db.crud.academics.academic_year_crud import academic_year_crud
from src.db.crud.academics.academic_grade import academic_grade as grade_crud
from src.db.crud.academics.section import section as section_crud
from src.utils.uuid_utils import ensure_uuid
from src.utils.academic_year_validator import validate_academic_year_editable


class TimetableService(TenantBaseService[Timetable, TimetableCreate, TimetableUpdate]):
    """Service for managing timetables within a tenant."""
    
    def __init__(self, tenant=None, *args, **kwargs):
        if tenant and hasattr(tenant, 'id'):
            kwargs['tenant_id'] = tenant.id
        super().__init__(crud=timetable_crud, model=Timetable, *args, **kwargs)
    
    async def get_by_name(self, name: str) -> Optional[Timetable]:
        """Get a timetable by name."""
        return timetable_crud.get_by_name(self.db, tenant_id=self.tenant_id, name=name)
    
    async def get_by_academic_year(self, academic_year: str) -> List[Timetable]:
        """Get timetables by academic year."""
        return timetable_crud.get_by_academic_year(self.db, tenant_id=self.tenant_id, academic_year=academic_year)
    
    async def get_by_grade_and_section(self, grade_id: UUID, section_id: UUID = None) -> List[Timetable]:
        """Get timetables by grade and optional section."""
        return timetable_crud.get_by_grade_and_section(
            self.db, tenant_id=self.tenant_id, grade_id=grade_id, section_id=section_id
        )
    
    async def get(self, id: UUID) -> Optional[Timetable]:
        """Get a specific timetable and enrich it."""
        tt = await super().get(id=id)
        if tt:
            return self._enrich_timetable_slots(tt)
        return None
    
    async def get_active_timetables(self) -> List[Timetable]:
        """Get all active timetables."""
        return timetable_crud.get_active_timetables(self.db, tenant_id=self.tenant_id)
    
    async def get_current_timetables(self, current_date: date = None) -> List[Timetable]:
        """Get timetables effective on the current date."""
        if current_date is None:
            current_date = date.today()
        timetables = timetable_crud.get_current_timetables(self.db, tenant_id=self.tenant_id, current_date=current_date)
        return [self._enrich_timetable_slots(t) for t in timetables]
    
    def _enrich_timetable_slots(self, timetable: Timetable) -> Timetable:
        """Enrich timetable slots with subject and teacher names from Classes.
        Returns the modified Timetable object."""
        if not hasattr(timetable, 'timetable_data') or not timetable.timetable_data:
            return timetable
        
        data = dict(timetable.timetable_data)
        if 'time_slots' not in data:
            return timetable
        
        slots = data.get('time_slots', [])
        enriched_slots = []
        
        for slot in slots:
            if isinstance(slot, dict):
                class_id = slot.get('class_id')
                enriched_slot = dict(slot)
                
                # Fetch ClassSubject details if class_id exists
                if class_id:
                    from src.db.models.academics.class_subject import ClassSubject
                    class_obj = self.db.query(ClassSubject).filter(
                        ClassSubject.id == class_id,
                        ClassSubject.tenant_id == self.tenant_id
                    ).first()
                    
                    if class_obj:
                        enriched_slot['subject_name'] = class_obj.subject.name if class_obj.subject else None
                        enriched_slot['teacher_name'] = f"{class_obj.teacher.first_name} {class_obj.teacher.last_name}" if class_obj.teacher else None
                
                enriched_slots.append(enriched_slot)
            else:
                enriched_slots.append(slot)
        
        # Set the enriched data back to the object
        timetable.timetable_data = {**data, 'time_slots': enriched_slots}
        return timetable
    
    async def list(self, *, skip: int = 0, limit: int = 100, filters: Dict[str, Any] = {}) -> List[Timetable]:
        converted = dict(filters or {})
        teacher_id = converted.pop("teacher_id", None)
        ay_name = converted.get("academic_year")
        
        if ay_name:
            ay = academic_year_crud.get_by_name(self.db, tenant_id=self.tenant_id, name=ay_name)
            if ay:
                converted["academic_year_id"] = ay.id
            converted.pop("academic_year", None)
        
        query = self.db.query(Timetable).filter(Timetable.tenant_id == self.tenant_id)
        
        # Apply teacher filter if provided
        if teacher_id:
            from src.db.models.academics.class_subject import ClassSubject
            from src.db.models.academics.class_model import Class
            
            # Subquery to find Class IDs where the teacher has at least one subject
            # We match Timetable to Class by Grade, Section, and Academic Year
            query = query.join(
                Class,
                (Class.grade_id == Timetable.grade_id) & 
                (Class.section_id == Timetable.section_id) & 
                (Class.academic_year_id == Timetable.academic_year_id)
            ).join(
                ClassSubject,
                Class.id == ClassSubject.class_id
            ).filter(
                ClassSubject.teacher_id == teacher_id
            )
        
        # Apply other filters
        for field, value in converted.items():
            if hasattr(Timetable, field) and value is not None:
                query = query.filter(getattr(Timetable, field) == value)
                
        timetables = query.offset(skip).limit(limit).all()
        
        # Enrich each timetable with subject and teacher names
        return [self._enrich_timetable_slots(t) for t in timetables]
    
    async def create(self, *, obj_in: TimetableCreate) -> Timetable:
        """Create a new timetable with validation."""
        # Validate academic year is not locked
        validate_academic_year_editable(self.db, obj_in.academic_year_id, self.tenant_id, operation="create timetables for")
        
        # Check for duplicate timetable name
        existing = await self.get_by_name(obj_in.name)
        if existing:
            raise DuplicateEntityError("Timetable", "name", obj_in.name)
        # Validate effective date window
        if obj_in.effective_until and obj_in.effective_until < obj_in.effective_from:
            raise BusinessRuleViolationError("effective_until must be on or after effective_from")
        # Validate academic year
        ay = academic_year_crud.get_by_id(self.db, tenant_id=self.tenant_id, id=obj_in.academic_year_id)
        if not ay:
            raise EntityNotFoundError("AcademicYear", obj_in.academic_year_id)
        # Validate grade
        gr = grade_crud.get_by_id(self.db, tenant_id=self.tenant_id, id=obj_in.grade_id)
        if not gr:
            raise EntityNotFoundError("AcademicGrade", obj_in.grade_id)
        # Validate section if provided and belongs to grade
        if obj_in.section_id:
            sec = section_crud.get_by_id(self.db, tenant_id=self.tenant_id, id=obj_in.section_id)
            if not sec:
                raise EntityNotFoundError("Section", obj_in.section_id)
            if sec.grade_id != obj_in.grade_id:
                raise BusinessRuleViolationError("Section does not belong to the specified grade")
        # Create the timetable
        created_timetable = await super().create(obj_in=obj_in)
        self._sync_schedules(created_timetable)
        return self._enrich_timetable_slots(created_timetable)

    async def update(self, *, id: UUID, obj_in: TimetableUpdate) -> Timetable:
        """Update a timetable and sync schedules."""
        # Get existing timetable to validate its academic year
        existing = await self.get(id=id)
        if not existing:
            raise EntityNotFoundError("Timetable", id)
        
        # Validate academic year is not locked
        validate_academic_year_editable(self.db, existing.academic_year_id, self.tenant_id, operation="update timetables for")
        
        updated_timetable = await super().update(id=id, obj_in=obj_in)
        self._sync_schedules(updated_timetable)
        return self._enrich_timetable_slots(updated_timetable)

    def _sync_schedules(self, timetable: Timetable):
        """Syncs the schedules table based on the timetable definition with conflict detection."""
        from datetime import datetime
        from collections import defaultdict
        
        # 1. Clear existing schedules ONLY for the classes mentioned in this timetable
        data = timetable.timetable_data or {}
        slots = data.get("time_slots", []) if isinstance(data, dict) else []
        
        # Get all class_ids (ClassSubject IDs) that are being updated by this timetable
        class_ids_to_update = set()
        for slot in slots:
            cid = slot.get("class_id") if isinstance(slot, dict) else getattr(slot, "class_id", None)
            if cid:
                class_ids_to_update.add(cid)

        if class_ids_to_update:
            # Delete existing schedules for these specific class-subjects
            self.db.query(Schedule).filter(
                Schedule.class_id.in_(list(class_ids_to_update))
            ).delete(synchronize_session=False)
            self.db.flush()
        
        # 2. Create new schedules from timetable slots
        data = timetable.timetable_data or {}
        if hasattr(data, "get"):
            slots = data.get("time_slots", [])
        else:
            slots = []

        # Cache for checking self-conflicts within this new batch
        # Key: (teacher_id, day) -> List of (start_time, end_time)
        batch_teacher_schedules = defaultdict(list)

        for slot in slots:
            if isinstance(slot, dict):
                cls_id = slot.get("class_id")
                day = slot.get('day_of_week')
                start_val = slot.get('start_time')
                end_val = slot.get('end_time')
            else:
                cls_id = getattr(slot, "class_id", None)
                day = getattr(slot, "day_of_week", None)
                start_val = getattr(slot, "start_time", None)
                end_val = getattr(slot, "end_time", None)
                
            if not cls_id:
                continue
                
            # Parse times
            try:
                if isinstance(start_val, str):
                    start_time = datetime.strptime(start_val, "%H:%M" if len(start_val) == 5 else "%H:%M:%S").time()
                else:
                    start_time = start_val
                    
                if isinstance(end_val, str):
                    end_time = datetime.strptime(end_val, "%H:%M" if len(end_val) == 5 else "%H:%M:%S").time()
                else:
                    end_time = end_val
            except (ValueError, TypeError):
                # Invalid time format, skip or raise? 
                # For now let's skip/allow DB to error if null, but safe is raise.
                continue

            # Get ClassSubject for this slot
            from src.db.models.academics.class_subject import ClassSubject
            class_obj = self.db.query(ClassSubject).get(cls_id)
            if not class_obj: 
                continue # Should not happen if foreign key valid, but safe
                
            teacher_id = class_obj.teacher_id
            
            # --- CONFLICT CHECK ---
            if teacher_id:
                # 1. Check Batch Conflict (Self-overlap in this upload)
                for b_start, b_end in batch_teacher_schedules[(teacher_id, day)]:
                    if start_time < b_end and end_time > b_start:
                         teacher_name = f"{class_obj.teacher.first_name} {class_obj.teacher.last_name}" if class_obj.teacher else "Teacher"
                         raise BusinessRuleViolationError(
                             f"Double Booking in this Timetable: {teacher_name} is assigned to multiple classes at {day} {start_time}."
                         )

                # 2. Check DB Conflict (Overlap with other Timetables)
                # Note: We already deleted schedules for THIS grade/section. 
                # So this checks against OTHER grades/sections.
                from src.db.models.academics.class_subject import ClassSubject
                conflict = self.db.query(Schedule).join(ClassSubject).filter(
                    ClassSubject.teacher_id == teacher_id,
                    Schedule.day_of_week == day,
                    Schedule.start_time < end_time,
                    Schedule.end_time > start_time
                ).first()
                
                if conflict:
                    teacher_name = f"{class_obj.teacher.first_name} {class_obj.teacher.last_name}" if class_obj.teacher else "Teacher"
                    conflict_class = conflict.class_obj
                    conflict_subject = conflict_class.subject.name if conflict_class.subject else "Unknown Subject"
                    conflict_grade = conflict_class.grade.name if conflict_class.grade else ""
                    raise BusinessRuleViolationError(
                        f"Conflict: {teacher_name} is already teaching {conflict_subject} ({conflict_grade}) on {day} at {conflict.start_time}."
                    )
                
                # Add to batch
                batch_teacher_schedules[(teacher_id, day)].append((start_time, end_time))

            new_sched = Schedule(
                tenant_id=self.tenant_id,
                class_id=cls_id,
                day_of_week=day,
                start_time=start_time,
                end_time=end_time,
                period=None 
            )
            self.db.add(new_sched)
            
        self.db.commit()


class SuperAdminTimetableService(SuperAdminBaseService[Timetable, TimetableCreate, TimetableUpdate]):
    """Super-admin service for managing timetables across all tenants."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(crud=timetable_crud, model=Timetable, *args, **kwargs)
    
    def get_all_timetables(self, skip: int = 0, limit: int = 100,
                          academic_year: Optional[str] = None,
                          academic_year_id: Optional[UUID] = None,
                          is_active: Optional[bool] = None,
                          tenant_id: Optional[UUID] = None) -> List[Timetable]:
        """Get all timetables across all tenants with filtering."""
        query = self.db.query(Timetable)

        # Apply filters
        if academic_year_id:
            query = query.filter(Timetable.academic_year_id == academic_year_id)
        elif academic_year:
            query = query.filter(Timetable.academic_year.has(name=academic_year))

        if is_active is not None:
            query = query.filter(Timetable.is_active == is_active)
        if tenant_id:
            query = query.filter(Timetable.tenant_id == tenant_id)

        return query.offset(skip).limit(limit).all()

