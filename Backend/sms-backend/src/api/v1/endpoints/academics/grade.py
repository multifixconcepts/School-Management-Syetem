from typing import Any, List, Optional, Dict
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, Query, Body

from src.services.academics.grade_calculation import GradeCalculationService
from src.schemas.academics.grade import Grade as GradeSchema, GradeCreate, GradeUpdate, GradeWithDetails, ReportCardResponse
from src.db.models.academics.grade import GradeType
from src.core.auth.dependencies import has_any_role, has_permission
from src.schemas.auth import User
from src.core.exceptions.business import (
    BusinessLogicError,
    EntityNotFoundError,
    BusinessRuleViolationError
)

router = APIRouter()

@router.get("/grades/subject-summary", response_model=Dict[str, Any])
async def subject_performance_summary(
    *,
    grade_service: GradeCalculationService = Depends(),
    student_id: UUID = Query(..., description="ID of the student"),
    subject_id: UUID = Query(..., description="ID of the subject"),
    academic_year_id: UUID = Query(..., description="ID of the academic year"),
    period_id: Optional[UUID] = Query(None, description="Optional filter by period"),
    semester_id: Optional[UUID] = Query(None, description="Optional filter by semester"),
    current_user: User = Depends(has_any_role(["admin", "teacher", "student"]))
) -> Any:
    """Get a detailed summary of a student's performance in a specific subject."""
    # Security check: Students can only view their own summaries
    user_roles = {role.name for role in current_user.roles}
    if "student" in user_roles and "admin" not in user_roles and "teacher" not in user_roles:
        if student_id != current_user.id:
            raise HTTPException(status_code=403, detail="Students can only view their own performance summaries.")
            
    try:
        return await grade_service.get_subject_performance_summary(
            student_id=student_id, 
            subject_id=subject_id, 
            academic_year_id=academic_year_id,
            period_id=period_id,
            semester_id=semester_id
        )
    except EntityNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except (BusinessLogicError, BusinessRuleViolationError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.get("/students/{student_id}/academic-history", response_model=List[Dict[str, Any]])
async def get_student_academic_history(
    student_id: UUID,
    grade_service: GradeCalculationService = Depends(),
    current_user: User = Depends(has_any_role(["admin", "teacher", "student"]))
) -> Any:
    """Get multi-year academic history for a student."""
    # Security check: Students can only view their own history
    user_roles = {role.name for role in current_user.roles}
    if "student" in user_roles and "admin" not in user_roles and "teacher" not in user_roles:
        if student_id != current_user.id:
            raise HTTPException(status_code=403, detail="Students can only view their own academic history.")
            
    return await grade_service.get_student_academic_history(student_id=student_id)

# Create a grade
@router.post("/grades", response_model=GradeSchema, status_code=status.HTTP_201_CREATED)
async def create_grade(
    *,
    grade_service: GradeCalculationService = Depends(),
    grade_in: GradeCreate,
    current_user: User = Depends(has_any_role(["admin", "teacher"]))
) -> Any:
    """Create a new grade (admin/teacher only)."""
    try:
        payload = grade_in.model_dump()
        # Always stamp who graded
        payload["graded_by"] = current_user.id
        created = await grade_service.create(obj_in=GradeCreate(**payload))
        return created
    except (EntityNotFoundError, BusinessRuleViolationError) as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

# Bulk create grades
@router.post("/grades/bulk", response_model=List[GradeSchema], status_code=status.HTTP_201_CREATED)
async def bulk_create_grades(
    *,
    grade_service: GradeCalculationService = Depends(),
    grades_in: List[GradeCreate],
    current_user: User = Depends(has_any_role(["admin", "teacher"]))
) -> Any:
    """Bulk create grades (admin/teacher only)."""
    try:
        # Stamp who graded for all
        for g in grades_in:
            g.graded_by = current_user.id
        
        return await grade_service.bulk_create_academic_grades(obj_in_list=grades_in)
    except (BusinessRuleViolationError, EntityNotFoundError) as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

# List grades with optional filters
@router.get("/grades", response_model=List[GradeSchema])
async def list_grades(
    *,
    grade_service: GradeCalculationService = Depends(),
    skip: int = 0,
    limit: int = 100,
    student_id: Optional[UUID] = Query(None),
    student_ids: Optional[List[UUID]] = Query(None),
    subject_id: Optional[UUID] = None,
    assessment_type: Optional[GradeType] = Query(None),
    assessment_id: Optional[UUID] = Query(None),
    current_user: User = Depends(has_any_role(["admin", "teacher", "student"]))
) -> Any:
    """List grades for the tenant with optional filters."""
    filters: Dict[str, Any] = {}
    
    # Security check: Students can only view their own grades
    user_roles = {role.name for role in current_user.roles}
    if "student" in user_roles and "admin" not in user_roles and "teacher" not in user_roles:
        if student_id and current_user.id != student_id:
            raise HTTPException(status_code=403, detail="Students can only view their own grades.")
        if student_ids and any(sid != current_user.id for sid in student_ids):
            raise HTTPException(status_code=403, detail="Students can only view their own grades.")
        # Force student_id to be current_user.id if not specified or specified correctly
        filters["student_id"] = current_user.id
    else:
        if student_id:
            filters["student_id"] = student_id
        if student_ids:
            filters["student_id"] = student_ids
            
    if subject_id:
        filters["subject_id"] = subject_id
    if assessment_type:
        filters["assessment_type"] = assessment_type
    if assessment_id:
        filters["assessment_id"] = assessment_id

    return await grade_service.list(skip=skip, limit=limit, filters=filters)

# Analytics: subject average
@router.get("/grades/subject-average", response_model=Dict[str, Optional[float]])
async def subject_average(
    *,
    grade_service: GradeCalculationService = Depends(),
    student_id: UUID = Query(...),
    subject_id: UUID = Query(...),
    current_user: User = Depends(has_any_role(["admin", "teacher", "student"]))
) -> Any:
    """Calculate average percentage for a student in a subject."""
    # Security check: Students can only view their own averages
    user_roles = {role.name for role in current_user.roles}
    if "student" in user_roles and "admin" not in user_roles and "teacher" not in user_roles:
        if current_user.id != student_id:
            raise HTTPException(status_code=403, detail="Students can only view their own grade averages.")

    avg = await grade_service.calculate_subject_average(student_id=student_id, subject_id=subject_id)
    return {"average_percentage": avg}

# Analytics: report card
@router.get("/grades/report-card", response_model=ReportCardResponse)
async def report_card(
    *,
    grade_service: GradeCalculationService = Depends(),
    student_id: UUID = Query(...),
    academic_year: str = Query(...),
    current_user: User = Depends(has_any_role(["admin", "teacher", "student"]))
) -> Any:
    """Generate a report card for a student in an academic year."""
    # Security check: Students can only view their own report card
    user_roles = {role.name for role in current_user.roles}
    if "student" in user_roles and "admin" not in user_roles and "teacher" not in user_roles:
        if current_user.id != student_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Students are only allowed to view their own report card."
            )
            
    try:
        return await grade_service.generate_report_card(student_id=student_id, academic_year=academic_year)
    except EntityNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except BusinessRuleViolationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# Get a specific grade
@router.get("/grades/{grade_id}", response_model=GradeSchema)
async def get_grade(
    *,
    grade_service: GradeCalculationService = Depends(),
    grade_id: UUID,
    current_user: User = Depends(has_any_role(["admin", "teacher", "student"]))
) -> Any:
    """Get a grade by ID."""
    grade_obj = await grade_service.get(id=grade_id)
    if not grade_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Grade {grade_id} not found")
        
    # Security check: Students can only view their own grades
    user_roles = {role.name for role in current_user.roles}
    if "student" in user_roles and "admin" not in user_roles and "teacher" not in user_roles:
        if grade_obj.student_id != current_user.id:
            raise HTTPException(status_code=403, detail="Students can only view their own grades.")
            
    return grade_obj

# Get grade with details (student/subject/teacher names)
@router.get("/grades/{grade_id}/details", response_model=GradeWithDetails)
async def get_grade_details(
    *,
    grade_service: GradeCalculationService = Depends(),
    grade_id: UUID,
    current_user: User = Depends(has_any_role(["admin", "teacher", "student"]))
) -> Any:
    """Get grade details with joined student/subject/teacher names."""
    details = await grade_service.get_with_details(id=grade_id)
    if not details:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Grade {grade_id} not found")
        
    # Security check: Students can only view their own grades
    user_roles = {role.name for role in current_user.roles}
    if "student" in user_roles and "admin" not in user_roles and "teacher" not in user_roles:
        # details is a dict if it came from get_with_details in CRUD usually
        sid = details.get("student_id")
        if sid and sid != current_user.id:
            raise HTTPException(status_code=403, detail="Students can only view their own grade details.")
            
    return details

# Update a grade
@router.put("/grades/{grade_id}", response_model=GradeSchema)
async def update_grade(
    *,
    grade_service: GradeCalculationService = Depends(),
    grade_id: UUID,
    grade_in: GradeUpdate,
    current_user: User = Depends(has_any_role(["admin", "teacher"]))
) -> Any:
    """Update a grade (admin/teacher only)."""
    try:
        updated = await grade_service.update(id=grade_id, obj_in=grade_in)
        if not updated:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Grade {grade_id} not found")
        return updated
    except BusinessLogicError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except BusinessRuleViolationError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

# Recalculate score/percentage/letter-grade in one shot
@router.put("/grades/{grade_id}/recalculate", response_model=GradeSchema)
async def recalculate_grade(
    *,
    grade_service: GradeCalculationService = Depends(),
    grade_id: UUID,
    payload: Dict[str, Any] = Body(...),
    current_user: User = Depends(has_any_role(["admin", "teacher"]))
) -> Any:
    """Update score+max_score and recalc percentage and letter grade."""
    try:
        score = payload.get("score")
        max_score = payload.get("max_score")
        comments = payload.get("comments")
        return await grade_service.update_grade(id=grade_id, score=score, max_score=max_score, comments=comments)
    except EntityNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except BusinessRuleViolationError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

# Delete a grade
@router.delete("/grades/{grade_id}", response_model=GradeSchema)
async def delete_grade(
    *,
    grade_service: GradeCalculationService = Depends(),
    grade_id: UUID,
    current_user: User = Depends(has_any_role(["admin"]))
) -> Any:
    """Delete a grade (admin only)."""
    grade_obj = await grade_service.get(id=grade_id)
    if not grade_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Grade {grade_id} not found")
    return await grade_service.delete(id=grade_id)


# Analytics: weighted average
# weighted_average endpoint in grade.py
@router.post("/grades/weighted-average", response_model=Dict[str, Optional[float]])
async def weighted_average(
    *,
    grade_service: GradeCalculationService = Depends(),
    payload: Dict[str, Any] = Body(..., description="Student/subject IDs and weights per GradeType"),
    current_user: User = Depends(has_any_role(["admin", "teacher", "student"]))
) -> Any:
    """Calculate weighted average for a student in a subject."""
    try:
        student_id = UUID(payload["student_id"])
        
        # Security check: Students can only view their own averages
        user_roles = {role.name for role in current_user.roles}
        if "student" in user_roles and "admin" not in user_roles and "teacher" not in user_roles:
            if student_id != current_user.id:
                raise HTTPException(status_code=403, detail="Students can only view their own weighted averages.")
                
        subject_id = UUID(payload["subject_id"])
        weights = payload.get("weights", {}) or {}
        weights_enum: Dict[GradeType, float] = {}
        for k, v in weights.items():
            weights_enum[GradeType(k)] = float(v)
        avg = await grade_service.calculate_weighted_average(
            student_id=student_id, subject_id=subject_id, weights=weights_enum
        )
        return {"weighted_average": avg}
    except (ValueError, KeyError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid payload: {str(e)}")

# Analytics: Subject Performance Summary
    except (BusinessLogicError, BusinessRuleViolationError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

# Bulk publish grades
@router.post("/grades/publish", response_model=Dict[str, int])
async def publish_grades(
    *,
    grade_service: GradeCalculationService = Depends(),
    academic_year_id: UUID = Query(...),
    grade_id: UUID = Query(...),
    subject_id: UUID = Query(...),
    period_number: int = Query(...),
    current_user: User = Depends(has_any_role(["admin"]))
) -> Any:
    """Bulk publish grades for a specific class/subject/period."""
    try:
        count = await grade_service.publish_grades(
            academic_year_id=academic_year_id,
            grade_id=grade_id,
            subject_id=subject_id,
            period_number=period_number
        )
        return {"published_count": count}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))