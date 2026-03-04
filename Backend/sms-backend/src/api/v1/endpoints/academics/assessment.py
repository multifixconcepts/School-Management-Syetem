from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Query, HTTPException, status
from src.services.academics.assessment_service import AssessmentService
from src.schemas.academics.assessment import Assessment, AssessmentCreate, AssessmentUpdate
from src.core.auth.dependencies import get_current_user
from src.schemas.auth import User

router = APIRouter()

@router.get("/assessments", response_model=List[Assessment])
async def list_assessments(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1),
    subject_id: Optional[UUID] = None,
    grade_id: Optional[UUID] = None,
    section_id: Optional[UUID] = None,
    academic_year_id: Optional[UUID] = None,
    period_id: Optional[UUID] = Query(None, description="Optional filter by period"),
    semester_id: Optional[UUID] = Query(None, description="Optional filter by semester"),
    is_published: Optional[bool] = None,
    teacher_id: Optional[UUID] = None,
    service: AssessmentService = Depends(),
    current_user: User = Depends(get_current_user)
):
    filters = {}
    if subject_id:
        filters["subject_id"] = subject_id
    if grade_id:
        filters["grade_id"] = grade_id
    if section_id:
        filters["section_id"] = section_id
    if academic_year_id:
        filters["academic_year_id"] = academic_year_id
    if is_published is not None:
        filters["is_published"] = is_published
    if teacher_id:
        filters["teacher_id"] = teacher_id
    if period_id:
        filters["period_id"] = period_id
    if semester_id:
        filters["semester_id"] = semester_id
        
    return await service.list_assessments(skip=skip, limit=limit, filters=filters, current_user=current_user)

@router.post("/assessments", response_model=Assessment, status_code=status.HTTP_201_CREATED)
async def create_assessment(
    payload: AssessmentCreate,
    service: AssessmentService = Depends(),
    current_user: User = Depends(get_current_user)
):
    # Ensure teacher_id is set to current_user if not provided or if user is teacher
    if any(role.name == "teacher" for role in current_user.roles):
        payload.teacher_id = current_user.id
    elif not payload.teacher_id:
        payload.teacher_id = current_user.id
        
    return await service.create(obj_in=payload)

@router.get("/assessments/{id}", response_model=Assessment)
async def get_assessment(
    id: UUID,
    service: AssessmentService = Depends(),
    current_user: User = Depends(get_current_user)
):
    item = await service.get_assessment(id=id, current_user=current_user)
    if not item:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return item

@router.put("/assessments/{id}", response_model=Assessment)
async def update_assessment(
    id: UUID,
    payload: AssessmentUpdate,
    service: AssessmentService = Depends(),
    current_user: User = Depends(get_current_user)
):
    return await service.update_assessment(id=id, obj_in=payload, current_user=current_user)

@router.delete("/assessments/{id}")
async def delete_assessment(
    id: UUID,
    service: AssessmentService = Depends(),
    current_user: User = Depends(get_current_user)
):
    await service.delete_assessment(id=id, current_user=current_user)
    return {"message": "Assessment deleted successfully"}
