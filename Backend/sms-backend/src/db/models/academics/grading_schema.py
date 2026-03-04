from sqlalchemy import Column, String, ForeignKey, Float, Text, Boolean, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID

from src.db.models.base import TenantModel

class GradingSchema(TenantModel):
    """Model representing a set of grading rules for a category of classes.
    
    Examples: "Standard Primary", "Advanced High School", "UK GCSE Level".
    """
    __tablename__ = "grading_schemas"
    
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    
    # Link to Academic Year
    academic_year_id = Column(UUID(as_uuid=True), ForeignKey("academic_years.id"), nullable=True)
    
    # Relationships
    academic_year = relationship("AcademicYear", backref="grading_schemas")
    categories = relationship("GradingCategory", back_populates="schema", cascade="all, delete-orphan", lazy="joined")
    class_subjects = relationship("ClassSubject", back_populates="grading_schema")

    def __repr__(self):
        return f"<GradingSchema {self.name}>"

    __table_args__ = (
        UniqueConstraint('tenant_id', 'academic_year_id', 'name', name='uq_grading_schema_tenant_ay_name'),
    )

class GradingCategory(TenantModel):
    """Model representing a specific component of a grading schema.
    
    Examples: "Exam (35%)", "Quiz (20%)", "Attendance (10%)".
    Marks allocation is tracked per category.
    """
    __tablename__ = "grading_categories"
    
    name = Column(String(100), nullable=False)
    weight = Column(Float, nullable=False)  # Percentage out of 100
    description = Column(Text, nullable=True)
    
    # Relationship to Schema
    schema_id = Column(UUID(as_uuid=True), ForeignKey("grading_schemas.id"), nullable=False)
    schema = relationship("GradingSchema", back_populates="categories")
    
    # Tracking marks allocation
    # total_marks_allocated across all assessments in this category for a specific class
    # should be handled at the service level logic, but we can store metadata here if needed.
    
    __table_args__ = (
        UniqueConstraint('schema_id', 'name', name='uq_grading_category_schema_name'),
    )

    def __repr__(self):
        return f"<GradingCategory {self.name} ({self.weight}%)>"
