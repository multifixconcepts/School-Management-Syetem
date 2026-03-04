# Module imports
from typing import Any, List, Optional, Dict, Literal
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from sqlalchemy.orm import Session

from src.services.academics.enrollment import EnrollmentService
from src.db.session import get_db
from src.schemas.academics.enrollment import (
    Enrollment, 
    EnrollmentCreate, 
    EnrollmentUpdate, 
    EnrollmentWithStudent,
    EnrollmentListResponse, 
)
from src.core.middleware.tenant import get_tenant_from_request
from src.core.auth.dependencies import has_any_role, get_current_user, has_permission
from src.schemas.auth import User
from src.core.exceptions.business import (
    EntityNotFoundError,
    DuplicateEntityError,
    InvalidStatusTransitionError,
    BusinessRuleViolationError
)
from src.db.crud.academics.academic_year_crud import academic_year_crud
from src.db.crud.academics.academic_grade import academic_grade
from src.db.crud.academics.section import section
from src.services.academics.promotion_service import PromotionService

router = APIRouter()

# Enrollment endpoints
@router.get("/enrollments", response_model=EnrollmentListResponse)
async def get_enrollments(
    *,
    enrollment_service: EnrollmentService = Depends(),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=1000, description="Number of records to return"),
    academic_year_id: Optional[UUID] = Query(None, description="Filter by academic year"),
    grade_id: Optional[UUID] = Query(None, description="Filter by grade"),
    section_id: Optional[UUID] = Query(None, description="Filter by section"),
    status: Optional[str] = Query(None, description="Filter by enrollment status"),
    search: Optional[str] = Query(None, description="Search by student name or admission number"),
    include_archived: bool = Query(False, description="Include archived enrollments (is_active=False)"),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Get all enrollments for a tenant with pagination and filtering."""
    try:
        filters: Dict[str, Any] = {}
        if academic_year_id:
            filters["academic_year_id"] = academic_year_id
        if grade_id:
            filters["grade_id"] = grade_id
        if section_id:
            filters["section_id"] = section_id
        if status:
            filters["status"] = status
        if not include_archived:
            filters["is_active"] = True

        enrollments = await enrollment_service.get_multi(skip=skip, limit=limit, search=search, **filters)
        total_count = await enrollment_service.count(search=search, **filters)

        return {
            "items": enrollments,
            "total": total_count,
            "skip": skip,
            "limit": limit,
            "has_next": (skip + limit) < total_count,
            "has_prev": skip > 0
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch enrollments: {str(e)}"
        )

# create_enrollment
@router.post("/enrollments", response_model=Enrollment, status_code=status.HTTP_201_CREATED)
async def create_enrollment(
    *,
    enrollment_service: EnrollmentService = Depends(),
    enrollment_in: EnrollmentCreate,
    db: Session = Depends(get_db),
    tenant: Any = Depends(get_tenant_from_request),
    current_user: User = Depends(has_permission("manage_enrollment"))
) -> Any:
    """Create a new enrollment (requires admin or teacher role)."""
    tenant_id = tenant.id if hasattr(tenant, "id") else tenant
    # Pre-validate ID presence
    missing = []
    if not enrollment_in.academic_year_id:
        missing.append("academic_year_id")
    if not enrollment_in.grade_id:
        missing.append("grade_id")
    if not enrollment_in.section_id:
        missing.append("section_id")
    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "Missing required fields", "fields": missing}
        )
    # Check existence to tighten 422 messages
    if not academic_year_crud.get_by_id(db, tenant_id=tenant_id, id=enrollment_in.academic_year_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"field": "academic_year_id", "error": "AcademicYear not found", "value": str(enrollment_in.academic_year_id)}
        )
    if not academic_grade.get_by_id(db, tenant_id=tenant_id, id=enrollment_in.grade_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"field": "grade_id", "error": "AcademicGrade not found", "value": str(enrollment_in.grade_id)}
        )
    if not section.get_by_id(db, tenant_id=tenant_id, id=enrollment_in.section_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"field": "section_id", "error": "Section not found", "value": str(enrollment_in.section_id)}
        )
    try:
        return await enrollment_service.create(obj_in=enrollment_in)
    except DuplicateEntityError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e)
        )
    except (EntityNotFoundError, BusinessRuleViolationError) as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create enrollment: {str(e)}"
        )

@router.get("/enrollments/{enrollment_id}", response_model=Enrollment)
async def get_enrollment(
    *,
    enrollment_service: EnrollmentService = Depends(),
    enrollment_id: UUID,
    current_user: User = Depends(get_current_user)
) -> Any:
    """Get a specific enrollment by ID."""
    try:
        enrollment = await enrollment_service.get(id=enrollment_id)
        if not enrollment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Enrollment with ID {enrollment_id} not found"
            )
        return enrollment
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch enrollment: {str(e)}"
        )

# update_enrollment
@router.put("/enrollments/{enrollment_id}", response_model=Enrollment)
async def update_enrollment(
    *,
    enrollment_service: EnrollmentService = Depends(),
    enrollment_id: UUID,
    enrollment_in: EnrollmentUpdate,
    current_user: User = Depends(has_permission("manage_enrollment"))
) -> Any:
    """Update an enrollment (requires admin or teacher role)."""
    try:
        # Check if enrollment exists
        existing_enrollment = await enrollment_service.get(id=enrollment_id)
        if not existing_enrollment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Enrollment with ID {enrollment_id} not found"
            )
        
        # Update the enrollment
        updated_enrollment = await enrollment_service.update(id=enrollment_id, obj_in=enrollment_in)
        return updated_enrollment
    except HTTPException:
        raise
    except InvalidStatusTransitionError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e)
        )
    except BusinessRuleViolationError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update enrollment: {str(e)}"
        )

# delete_enrollment
@router.delete("/enrollments/{enrollment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_enrollment(
    *,
    enrollment_service: EnrollmentService = Depends(),
    enrollment_id: UUID,
    current_user: User = Depends(has_permission("manage_enrollment"))
):
    """Delete an enrollment (requires admin role)."""
    try:
        # Check if enrollment exists
        existing_enrollment = await enrollment_service.get(id=enrollment_id)
        if not existing_enrollment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Enrollment with ID {enrollment_id} not found"
            )
        
        # Delete the enrollment
        await enrollment_service.delete(id=enrollment_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete enrollment: {str(e)}"
        )

# bulk_create_enrollments
@router.post("/enrollments/bulk", response_model=Any, status_code=status.HTTP_201_CREATED)
async def bulk_create_enrollments(
    *,
    enrollment_service: EnrollmentService = Depends(),
    bulk_data: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    tenant: Any = Depends(get_tenant_from_request),
    current_user: User = Depends(has_permission("manage_enrollment"))
) -> Any:
    """Create multiple enrollments at once (requires admin or teacher role)."""
    try:
        # Extract data from bulk request
        student_ids = bulk_data.get("student_ids", [])
        academic_year_id = bulk_data.get("academic_year_id")
        grade_id = bulk_data.get("grade_id")
        section_id = bulk_data.get("section_id")
        enrollment_date = bulk_data.get("enrollment_date")
        status_value = bulk_data.get("status", "active")
        is_active_value = bulk_data.get("is_active", True)

        # Resolve tenant_id from tenant dependency
        tenant_id = tenant.id if hasattr(tenant, "id") else tenant

        if not student_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="student_ids is required and cannot be empty"
            )

        if not all([academic_year_id, grade_id, section_id]):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="academic_year_id, grade_id, and section_id are required"
            )

        # Resolve entities by ID with tenant scoping
        try:
            ay = academic_year_crud.get_by_id(db, tenant_id=tenant_id, id=UUID(academic_year_id))
        except Exception:
            ay = None
        if not ay:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"AcademicYear with ID {academic_year_id} not found")

        try:
            gr = academic_grade.get_by_id(db, tenant_id=tenant_id, id=UUID(grade_id))
        except Exception:
            gr = None
        if not gr:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"AcademicGrade with ID {grade_id} not found")

        try:
            sec = section.get_by_id(db, tenant_id=tenant_id, id=UUID(section_id))
        except Exception:
            sec = None
        if not sec:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Section with ID {section_id} not found")

        created_enrollments = []
        failed_enrollments = []

        for student_id in student_ids:
            try:
                enrollment_kwargs = {
                    "student_id": UUID(student_id),
                    "academic_year": ay.name,
                    "grade": gr.name,
                    "section": sec.name,
                    "status": status_value,
                    "is_active": is_active_value,
                    "academic_year_id": ay.id,
                    "grade_id": gr.id,
                    "section_id": sec.id,
                }
                if enrollment_date:
                    enrollment_kwargs["enrollment_date"] = enrollment_date

                enrollment = await enrollment_service.create(obj_in=EnrollmentCreate(**enrollment_kwargs))
                created_enrollments.append(enrollment)
            except Exception as e:
                # Catch business exceptions and return their messages specifically
                error_msg = str(e)
                if hasattr(e, 'detail'):
                    error_msg = e.detail
                elif hasattr(e, 'message'):
                    error_msg = e.message
                
                failed_enrollments.append({"student_id": student_id, "error": error_msg})

        return {
            "status": "success" if not failed_enrollments else "partial",
            "message": f"Processed {len(student_ids)} students",
            "created_count": len(created_enrollments),
            "failed_count": len(failed_enrollments),
            "created": created_enrollments,
            "failed": failed_enrollments
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to bulk create enrollments: {str(e)}"
        )

# Additional utility endpoints
@router.get("/enrollments/{enrollment_id}/with-student", response_model=EnrollmentWithStudent)
async def get_enrollment_with_student(
    *,
    enrollment_service: EnrollmentService = Depends(),
    enrollment_id: UUID,
    current_user: User = Depends(get_current_user)
) -> Any:
    """Get enrollment with student details."""
    try:
        enrollment_data = await enrollment_service.get_with_student_details(id=enrollment_id)
        if not enrollment_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Enrollment with ID {enrollment_id} not found"
            )
        return enrollment_data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch enrollment with student details: {str(e)}"
        )

@router.put("/enrollments/{enrollment_id}/status", response_model=Enrollment)
async def update_enrollment_status(
    *,
    enrollment_service: EnrollmentService = Depends(),
    enrollment_id: UUID,
    status_data: Dict[str, Any] = Body(...),
    current_user: User = Depends(has_any_role(["admin"]))
) -> Any:
    """Update enrollment status with validation."""
    try:
        new_status = status_data.get("status")
        withdrawal_date = status_data.get("withdrawal_date")
        withdrawal_reason = status_data.get("withdrawal_reason")
        transfer_school = status_data.get("transfer_school")
        
        if not new_status:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="status is required"
            )
        
        updated_enrollment = await enrollment_service.update_status(
            id=enrollment_id,
            status=new_status,
            withdrawal_date=withdrawal_date,
            withdrawal_reason=withdrawal_reason,
            transfer_school=transfer_school
        )
        
        return updated_enrollment
        
    except EntityNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except InvalidStatusTransitionError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update enrollment status: {str(e)}"
        )

@router.put("/enrollments/{enrollment_id}/semester-status", response_model=Enrollment)
async def update_enrollment_semester_status(
    *,
    enrollment_service: EnrollmentService = Depends(),
    enrollment_id: UUID,
    body: Dict[str, Any] = Body(...),
    current_user: User = Depends(has_any_role(["admin"]))
) -> Any:
    """Update semester status and optional completion date."""
    try:
        semester = int(body.get("semester"))
        status = str(body.get("status"))
        completion_date = body.get("completionDate")
        return await enrollment_service.update_semester_status(
            id=enrollment_id,
            semester=semester,
            status=status,
            completion_date=completion_date
        )
    except (EntityNotFoundError, BusinessRuleViolationError) as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to update semester status: {str(e)}")

@router.post("/enrollments/{enrollment_id}/promote", response_model=Dict[str, Any])
async def promote_enrollment(
    *,
    db: Session = Depends(get_db),
    tenant: Any = Depends(get_tenant_from_request),
    enrollment_service: EnrollmentService = Depends(),
    enrollment_id: UUID,
    promotion_type: Literal["semester", "grade", "graduation"] = Body("semester"),
    target_academic_year: Optional[str] = Body(None),
    target_semester: Optional[int] = Body(2),
    current_user: User = Depends(has_any_role(["admin"]))
) -> Any:
    """Promote a single enrollment’s student (next semester/grade/graduation)."""
    try:
        enrollment = await enrollment_service.get(id=enrollment_id)
        if not enrollment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enrollment not found")

        tenant_id = tenant.id if hasattr(tenant, "id") else tenant
        service = PromotionService(db=db, tenant_id=tenant_id)
        result = service.bulk_promote_students(
            student_ids=[enrollment.student_id],
            promotion_type=promotion_type,
            target_academic_year=target_academic_year,
            target_semester=target_semester
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to promote enrollment: {str(e)}"
        )