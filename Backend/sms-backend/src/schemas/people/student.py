from datetime import date
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel

from src.schemas.auth.user import UserBase, UserCreate, UserUpdate, User


class StudentBase(UserBase):
    """Base schema for Student model."""
    admission_number: str
    roll_number: Optional[int] = None
    grade: Optional[str] = None
    section: Optional[str] = None
    admission_date: Optional[date] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    nationality: Optional[str] = None
    religion: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    county: Optional[str] = None
    country: Optional[str] = None
    whatsapp_number: Optional[str] = None
    emergency_contact: Optional[str] = None
    photo: Optional[str] = None
    status: str = "active"


class StudentCreate(UserCreate):
    """Schema for creating a new student."""
    admission_number: Optional[str] = None
    roll_number: Optional[int] = None
    grade: Optional[str] = None
    section: Optional[str] = None
    admission_date: Optional[date] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    nationality: Optional[str] = None
    religion: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    county: Optional[str] = None
    country: Optional[str] = None
    whatsapp_number: Optional[str] = None
    emergency_contact: Optional[str] = None
    photo: Optional[str] = None
    status: str = "active"


class StudentUpdate(UserUpdate):
    """Schema for updating a student."""
    admission_number: Optional[str] = None
    roll_number: Optional[int] = None
    grade: Optional[str] = None
    section: Optional[str] = None
    admission_date: Optional[date] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    nationality: Optional[str] = None
    religion: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    county: Optional[str] = None
    country: Optional[str] = None
    whatsapp_number: Optional[str] = None
    emergency_contact: Optional[str] = None
    photo: Optional[str] = None
    status: Optional[str] = None
    exit_date: Optional[date] = None
    graduation_date: Optional[date] = None
    withdrawal_reason: Optional[str] = None


class Student(User):
    """Schema for Student model response."""
    admission_number: str
    roll_number: Optional[int] = None
    grade: Optional[str] = None
    section: Optional[str] = None
    admission_date: Optional[date] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    nationality: Optional[str] = None
    religion: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    county: Optional[str] = None
    country: Optional[str] = None
    whatsapp_number: Optional[str] = None
    emergency_contact: Optional[str] = None
    photo: Optional[str] = None
    status: str
    exit_date: Optional[date] = None
    graduation_date: Optional[date] = None
    withdrawal_reason: Optional[str] = None


class StudentCreateResponse(Student):
    """Schema for student creation response with optional generated password and admission number."""
    generated_password: Optional[str] = None
    generated_admission_number: Optional[str] = None
    
    class Config:
        from_attributes = True

class StudentListResponse(BaseModel):
    """Schema for paginated student list."""
    items: List[Student]
    total: int

class StudentBulkDelete(BaseModel):
    """Schema for bulk student deletion."""
    student_ids: List[UUID]

