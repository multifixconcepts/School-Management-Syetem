from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field

class GradingCategoryBase(BaseModel):
    name: str
    weight: float = Field(..., ge=0, le=100)
    description: Optional[str] = None

class GradingCategoryCreate(GradingCategoryBase):
    pass

class GradingCategoryUpdate(BaseModel):
    name: Optional[str] = None
    weight: Optional[float] = Field(None, ge=0, le=100)
    description: Optional[str] = None

class GradingCategory(GradingCategoryBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    schema_id: UUID

class GradingCategoryWithStatus(GradingCategory):
    allocated_marks: float
    remaining_marks: float

class GradingSchemaBase(BaseModel):
    name: str
    description: Optional[str] = None
    is_active: bool = True
    academic_year_id: Optional[UUID] = None

class GradingSchemaCreate(GradingSchemaBase):
    categories: List[GradingCategoryCreate]

class GradingSchemaUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    academic_year_id: Optional[UUID] = None
    categories: Optional[List[GradingCategoryCreate]] = None

class GradingSchema(GradingSchemaBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    categories: List[GradingCategory]
