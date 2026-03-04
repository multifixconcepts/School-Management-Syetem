from datetime import date, datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field

class EnrollmentBase(BaseModel):
    """Base schema for Enrollment model."""
    student_id: UUID
    academic_year: str
    grade: str
    section: str
    enrollment_date: Optional[date] = None
    roll_number: Optional[int] = None
    status: str = "active"
    is_active: bool = True
    comments: Optional[str] = None
    semester: int = 1
    semester_1_status: Optional[str] = None
    semester_2_status: Optional[str] = None
    semester_1_completion_date: Optional[date] = None
    semester_2_completion_date: Optional[date] = None

class EnrollmentCreate(EnrollmentBase):
    """Schema for creating a new enrollment."""
    enrollment_date: date = date.today()
    academic_year: Optional[str] = None
    grade: Optional[str] = None
    section: Optional[str] = None
    academic_year_id: UUID
    grade_id: UUID
    section_id: UUID
    semester: int = 1
    semester_1_status: Optional[str] = None
    semester_2_status: Optional[str] = None
    semester_1_completion_date: Optional[date] = None
    semester_2_completion_date: Optional[date] = None

class EnrollmentUpdate(BaseModel):
    """Schema for updating an enrollment."""
    academic_year: Optional[str] = None
    grade: Optional[str] = None
    section: Optional[str] = None
    roll_number: Optional[int] = None
    status: Optional[str] = None
    is_active: Optional[bool] = None
    withdrawal_date: Optional[date] = None
    withdrawal_reason: Optional[str] = None
    comments: Optional[str] = None
    transfer_school: Optional[str] = None

class EnrollmentInDB(EnrollmentBase):
    """Schema for Enrollment model in database."""
    id: UUID
    tenant_id: UUID
    withdrawal_date: Optional[date] = None
    withdrawal_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    # IDs for normalized relations, included in responses
    academic_year_id: UUID
    grade_id: UUID
    section_id: UUID
    # Pydantic v2: enable ORM serialization
    model_config = ConfigDict(from_attributes=True)

class StudentMinimal(BaseModel):
    """Minimal student information for nested responses."""
    id: UUID
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    full_name: Optional[str] = None
    email: Optional[str] = None
    admission_number: Optional[str] = None
    roll_number: Optional[int] = None
    
    model_config = ConfigDict(from_attributes=True)

class PromotionStatusMinimal(BaseModel):
    """Minimal promotion status information."""
    id: UUID
    status: str
    
    model_config = ConfigDict(from_attributes=True)

class Enrollment(EnrollmentInDB):
    """Schema for Enrollment model response."""
    student: Optional[StudentMinimal] = None
    promotion_status: Optional[PromotionStatusMinimal] = None
    student_name: Optional[str] = None
    grade_name: Optional[str] = None
    section_name: Optional[str] = None

class EnrollmentWithStudent(Enrollment):
    """Schema for Enrollment with Student details."""
    student_name: str
    student_email: str
    student_admission_number: str

# New: Typed wrapper for list responses used by GET /enrollments
class EnrollmentListResponse(BaseModel):
    items: List[Enrollment]
    total: int
    skip: int
    limit: int
    has_next: bool
    has_prev: bool
