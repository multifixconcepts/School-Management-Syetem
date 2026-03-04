from typing import Any, Dict, List, Optional
from uuid import UUID
from datetime import date
from fastapi import Depends
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from src.core.middleware.tenant import get_tenant_from_request
from src.db.session import get_db
from src.core.exceptions.business import (
    EntityNotFoundError,
    DuplicateEntityError,
    InvalidStatusTransitionError,
)
from sqlalchemy import and_
from sqlalchemy.orm import joinedload
from src.db.models.academics.class_enrollment import ClassEnrollment
from src.db.models.academics.enrollment import Enrollment as MainEnrollment
from src.db.crud.people import student as student_crud
from src.db.crud.academics.class_crud import class_crud
from src.db.crud.academics.academic_year_crud import academic_year_crud
from src.schemas.academics.class_enrollment import (
    ClassEnrollmentCreate,
    ClassEnrollmentUpdate,
    BulkClassEnrollmentCreate,
    ClassEnrollmentWithDetails,
)


class ClassEnrollmentService:
    """Service for managing enrollments of students into specific classes."""

    def __init__(
        self,
        tenant: Any = Depends(get_tenant_from_request),
        db: Session = Depends(get_db),
    ):
        self.db = db
        self.tenant_id = tenant.id if hasattr(tenant, "id") else tenant

    def _query(self):
        return self.db.query(ClassEnrollment).filter(ClassEnrollment.tenant_id == self.tenant_id)

    async def get(self, id: UUID) -> Optional[ClassEnrollment]:
        return self._query().filter(ClassEnrollment.id == id).first()

    async def get_multi(self, *, skip: int = 0, limit: int = 100, **filters) -> List[ClassEnrollment]:
        q = self._query()
        if "class_id" in filters and filters["class_id"]:
            q = q.filter(ClassEnrollment.class_id == filters["class_id"])
        if "student_id" in filters and filters["student_id"]:
            q = q.filter(ClassEnrollment.student_id == filters["student_id"])
        if "academic_year_id" in filters and filters["academic_year_id"]:
            q = q.filter(ClassEnrollment.academic_year_id == filters["academic_year_id"])
        if "status" in filters and filters["status"]:
            q = q.filter(ClassEnrollment.status == filters["status"])
        if "is_active" in filters and filters["is_active"] is not None:
            q = q.filter(ClassEnrollment.is_active == filters["is_active"])
        return q.offset(skip).limit(limit).all()

    async def count(self, **filters) -> int:
        q = self._query()
        if "class_id" in filters and filters["class_id"]:
            q = q.filter(ClassEnrollment.class_id == filters["class_id"])
        if "student_id" in filters and filters["student_id"]:
            q = q.filter(ClassEnrollment.student_id == filters["student_id"])
        if "academic_year_id" in filters and filters["academic_year_id"]:
            q = q.filter(ClassEnrollment.academic_year_id == filters["academic_year_id"])
        if "status" in filters and filters["status"]:
            q = q.filter(ClassEnrollment.status == filters["status"])
        if "is_active" in filters and filters["is_active"] is not None:
            q = q.filter(ClassEnrollment.is_active == filters["is_active"])
        return q.count()

    def _ensure_entities_exist(self, student_id: UUID, class_id: UUID, academic_year_id: UUID):
        if not student_crud.get_by_id(self.db, tenant_id=self.tenant_id, id=student_id):
            raise EntityNotFoundError("Student", student_id)
        if not class_crud.get_by_id(self.db, tenant_id=self.tenant_id, id=class_id):
            raise EntityNotFoundError("Class", class_id)
        if not academic_year_crud.get_by_id(self.db, tenant_id=self.tenant_id, id=academic_year_id):
            raise EntityNotFoundError("AcademicYear", academic_year_id)

    async def enroll_student(self, *, obj_in: ClassEnrollmentCreate) -> ClassEnrollment:
        self._ensure_entities_exist(obj_in.student_id, obj_in.class_id, obj_in.academic_year_id)

        existing = (
            self._query()
            .filter(
                ClassEnrollment.student_id == obj_in.student_id,
                ClassEnrollment.class_id == obj_in.class_id,
                ClassEnrollment.academic_year_id == obj_in.academic_year_id,
            )
            .first()
        )
        if existing and existing.is_active and existing.status == "active":
            raise DuplicateEntityError("ClassEnrollment", "unique_student_class_year", "active duplicate")

        if existing:
            # Reactivate and update existing record
            return await self.update(
                id=existing.id,
                obj_in=ClassEnrollmentUpdate(
                    enrollment_date=obj_in.enrollment_date,
                    status="active",
                    is_active=True
                )
            )

        enroll = ClassEnrollment(
            tenant_id=self.tenant_id,
            student_id=obj_in.student_id,
            class_id=obj_in.class_id,
            academic_year_id=obj_in.academic_year_id,
            enrollment_date=obj_in.enrollment_date or date.today(),
            status=obj_in.status or "active",
            is_active=True,
        )
        try:
            self.db.add(enroll)
            self.db.commit()
            self.db.refresh(enroll)
            return enroll
        except IntegrityError:
            self.db.rollback()
            # UniqueConstraint('student_id', 'class_id', 'academic_year_id')
            raise DuplicateEntityError("ClassEnrollment", "unique_student_class_year", "duplicate")

    async def bulk_enroll_students(self, *, bulk_data: BulkClassEnrollmentCreate) -> Dict[str, List[Any]]:
        # Validate class and year once
        if not class_crud.get_by_id(self.db, tenant_id=self.tenant_id, id=bulk_data.class_id):
            raise EntityNotFoundError("Class", bulk_data.class_id)
        if not academic_year_crud.get_by_id(self.db, tenant_id=self.tenant_id, id=bulk_data.academic_year_id):
            raise EntityNotFoundError("AcademicYear", bulk_data.academic_year_id)

        created: List[ClassEnrollment] = []
        failed: List[Dict[str, Any]] = []

        for student_id in bulk_data.student_ids:
            # Skip missing students gracefully and record failure
            if not student_crud.get_by_id(self.db, tenant_id=self.tenant_id, id=student_id):
                failed.append({"student_id": student_id, "error": "Student not found"})
                continue

            obj = ClassEnrollmentCreate(
                student_id=student_id,
                class_id=bulk_data.class_id,
                academic_year_id=bulk_data.academic_year_id,
                enrollment_date=bulk_data.enrollment_date,
                status=bulk_data.status or "active",
            )
            try:
                created.append(await self.enroll_student(obj_in=obj))
            except DuplicateEntityError:
                failed.append({"student_id": student_id, "error": "duplicate"})
            except Exception as e:
                failed.append({"student_id": student_id, "error": str(e)})

        return {"created": created, "failed": failed}

    async def update(self, *, id: UUID, obj_in: ClassEnrollmentUpdate) -> ClassEnrollment:
        enroll = await self.get(id=id)
        if not enroll:
            raise EntityNotFoundError("ClassEnrollment", id)

        data = obj_in.model_dump(exclude_unset=True)
        for field, value in data.items():
            setattr(enroll, field, value)

        self.db.add(enroll)
        self.db.commit()
        self.db.refresh(enroll)
        return enroll

    async def remove(self, *, id: UUID) -> Optional[ClassEnrollment]:
        enroll = await self.get(id=id)
        if not enroll:
            return None
        self.db.delete(enroll)
        self.db.commit()
        return enroll

    async def drop_student_from_class(self, *, enrollment_id: UUID, drop_date: Optional[date] = None) -> ClassEnrollment:
        enroll = await self.get(id=enrollment_id)
        if not enroll:
            raise EntityNotFoundError("ClassEnrollment", enrollment_id)
        if enroll.status == "completed":
            raise InvalidStatusTransitionError("Cannot drop a completed enrollment")

        enroll.drop_class(drop_date=drop_date)
        self.db.add(enroll)
        self.db.commit()
        self.db.refresh(enroll)
        return enroll

    async def complete_student_enrollment(self, *, enrollment_id: UUID, completion_date: Optional[date] = None) -> ClassEnrollment:
        enroll = await self.get(id=enrollment_id)
        if not enroll:
            raise EntityNotFoundError("ClassEnrollment", enrollment_id)

        enroll.complete_class(completion_date=completion_date)
        self.db.add(enroll)
        self.db.commit()
        self.db.refresh(enroll)
        return enroll

    async def reactivate_enrollment(self, *, enrollment_id: UUID) -> ClassEnrollment:
        enroll = await self.get(id=enrollment_id)
        if not enroll:
            raise EntityNotFoundError("ClassEnrollment", enrollment_id)
        if enroll.status != "dropped":
            raise InvalidStatusTransitionError("Only dropped enrollments can be reactivated")

        enroll.reactivate()
        self.db.add(enroll)
        self.db.commit()
        self.db.refresh(enroll)
        return enroll

    async def get_students_in_class(
        self,
        *,
        class_id: UUID,
        academic_year_id: Optional[UUID] = None,
        is_active: Optional[bool] = True,
        skip: int = 0,
        limit: int = 200,
    ) -> List[ClassEnrollmentWithDetails]:
        """Get all students in a class with full details in a single optimized query."""
        # Use joinedload for student/class/year to fix N+1 performance lag
        q = self.db.query(ClassEnrollment).options(
            joinedload(ClassEnrollment.student),
            joinedload(ClassEnrollment.class_obj),
            joinedload(ClassEnrollment.academic_year)
        ).filter(
            ClassEnrollment.tenant_id == self.tenant_id,
            ClassEnrollment.class_id == class_id
        )
        
        if academic_year_id:
            q = q.filter(ClassEnrollment.academic_year_id == academic_year_id)
        if is_active is not None:
            q = q.filter(ClassEnrollment.is_active == is_active)
        
        # Apply pagination
        enrollments = q.offset(skip).limit(limit).all()
        
        if not enrollments:
            return []
            
        # Efficiently fetch the corresponding main Enrollment IDs for these students
        # This is needed because the Grade model depends on enrollments.id, not class_enrollments.id
        student_ids = [e.student_id for e in enrollments]
        ay_id = academic_year_id or enrollments[0].academic_year_id
        
        main_enrollments = self.db.query(MainEnrollment).filter(
            MainEnrollment.tenant_id == self.tenant_id,
            MainEnrollment.student_id.in_(student_ids),
            MainEnrollment.academic_year_id == ay_id
        ).all()
        
        # Map student_id to main enrollment_id
        enrollment_map = {me.student_id: me.id for me in main_enrollments}
        
        # Convert to detailed schema
        return [
            ClassEnrollmentWithDetails(
                id=e.id,
                tenant_id=e.tenant_id,
                student_id=e.student_id,
                class_id=e.class_id,
                academic_year_id=e.academic_year_id,
                enrollment_date=e.enrollment_date,
                status=e.status,
                is_active=e.is_active,
                drop_date=e.drop_date,
                completion_date=e.completion_date,
                created_at=e.created_at,
                updated_at=e.updated_at,
                student_name=e.student.full_name if e.student else "Unknown",
                student_admission_number=e.student.admission_number if e.student else "N/A",
                class_name=e.class_obj.name if e.class_obj else "Unknown",
                academic_year_name=e.academic_year.name if e.academic_year else "N/A",
                enrollment_id=enrollment_map.get(e.student_id)
            )
            for e in enrollments
        ]

    async def get_student_classes(
        self,
        *,
        student_id: UUID,
        academic_year_id: Optional[UUID] = None,
        is_active: Optional[bool] = True,
    ) -> List[ClassEnrollment]:
        q = self._query().filter(ClassEnrollment.student_id == student_id)
        if academic_year_id:
            q = q.filter(ClassEnrollment.academic_year_id == academic_year_id)
        if is_active is not None:
            q = q.filter(ClassEnrollment.is_active == is_active)
        return q.all()

    async def get_class_enrollment_count(
        self,
        *,
        class_id: UUID,
        academic_year_id: Optional[UUID] = None,
        is_active: Optional[bool] = None,
        status: Optional[str] = None,
    ) -> int:
        q = self._query().filter(ClassEnrollment.class_id == class_id)
        if academic_year_id:
            q = q.filter(ClassEnrollment.academic_year_id == academic_year_id)
        if is_active is not None:
            q = q.filter(ClassEnrollment.is_active == is_active)
        if status:
            q = q.filter(ClassEnrollment.status == status)
        return q.count()

    async def get_with_details(self, *, id: UUID) -> Optional[ClassEnrollmentWithDetails]:
        """Get a single enrollment with details using efficient joined loading."""
        enroll = self.db.query(ClassEnrollment).options(
            joinedload(ClassEnrollment.student),
            joinedload(ClassEnrollment.class_obj),
            joinedload(ClassEnrollment.academic_year)
        ).filter(
            ClassEnrollment.tenant_id == self.tenant_id,
            ClassEnrollment.id == id
        ).first()
        
        if not enroll:
            return None

        # Fetch main enrollment ID
        main_enroll = self.db.query(MainEnrollment).filter(
            MainEnrollment.tenant_id == self.tenant_id,
            MainEnrollment.student_id == enroll.student_id,
            MainEnrollment.academic_year_id == enroll.academic_year_id
        ).first()


        return ClassEnrollmentWithDetails(
            id=enroll.id,
            tenant_id=enroll.tenant_id,
            student_id=enroll.student_id,
            class_id=enroll.class_id,
            academic_year_id=enroll.academic_year_id,
            enrollment_date=enroll.enrollment_date,
            status=enroll.status,
            is_active=enroll.is_active,
            drop_date=enroll.drop_date,
            completion_date=enroll.completion_date,
            created_at=enroll.created_at,
            updated_at=enroll.updated_at,
            student_name=enroll.student.full_name if enroll.student else "Unknown",
            student_admission_number=enroll.student.admission_number if enroll.student else "N/A",
            class_name=enroll.class_obj.name if enroll.class_obj else "Unknown",
            academic_year_name=enroll.academic_year.name if enroll.academic_year else "N/A",
        )