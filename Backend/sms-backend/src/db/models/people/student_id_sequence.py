from sqlalchemy import Column, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from src.db.models.base import Base

class StudentIdSequence(Base):
    """
    Table to track the last used admission number sequence for each tenant.
    This ensures uniqueness even if students are deleted.
    """
    __tablename__ = "student_id_sequences"

    # Composite primary key: tenant_id + prefix
    tenant_id = Column(UUID(as_uuid=True), primary_key=True, nullable=False)
    prefix = Column(String(10), primary_key=True, nullable=False, default="STU")
    last_number = Column(Integer, default=0, nullable=False)
