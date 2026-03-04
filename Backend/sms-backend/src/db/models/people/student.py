from sqlalchemy import Column, String, Date, ForeignKey, Integer
from sqlalchemy.orm import relationship
from src.db.models.auth.user import User
from datetime import date
from sqlalchemy.dialects.postgresql import UUID

class Student(User):
    """Model representing a student in the system."""
    
    __tablename__ = "students"
    
    # Link to parent table
    id = Column(UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
    
    # Student-specific fields
    admission_number = Column(String(50), nullable=False, unique=True)
    roll_number = Column(Integer, nullable=True)
    # grade = Column(String(20), nullable=True) class_enrollments instead
    # section = Column(String(10), nullable=True)  
    admission_date = Column(Date, nullable=True)

    # Personal info
    date_of_birth = Column(Date, nullable=True)
    gender = Column(String(10), nullable=True)
    blood_group = Column(String(5), nullable=True)
    nationality = Column(String(50), nullable=True)
    religion = Column(String(50), nullable=True)

    # Override address column from User model to avoid conflicts
    address = Column('student_address', String(255), nullable=True)
    city = Column(String(100), nullable=True)
    county = Column(String(100), nullable=True)
    country = Column(String(100), nullable=True)
    whatsapp_number = Column(String(20), nullable=True)
    emergency_contact = Column(String(255), nullable=True)
    photo = Column(String(500), nullable=True, comment="URL to student profile photo")

    status = Column(
        String(20),
        nullable=False,
        default="active",
        comment="One of: active, graduated, transferred, withdrawn"
    )
    exit_date = Column(Date, nullable=True)
    graduation_date = Column(Date, nullable=True)
    withdrawal_reason = Column(String(255), nullable=True)
    
    transfer_school = Column(String(255), nullable=True, comment="Name of the school the student transferred to")
    transfer_reason = Column(String(255), nullable=True, comment="Reason for transfer")
    
    __mapper_args__ = {
        "polymorphic_identity": "student",
    }

    def graduate(self, grad_date: date):
        self.status = "graduated"
        self.graduation_date = grad_date

    def withdraw(self, date_left: date, reason: str):
        self.status = "withdrawn"
        self.exit_date = date_left
        self.withdrawal_reason = reason

    def transfer(self, date_left: date, new_school: str, reason: str = None):
        self.status = "transferred"
        self.exit_date = date_left
        self.transfer_school = new_school
        self.transfer_reason = reason
    
    # Relationships - Updated with proper class enrollment relationship
    class_enrollments = relationship("ClassEnrollment", back_populates="student", lazy="dynamic")
    enrollments = relationship("Enrollment", back_populates="student", lazy="dynamic")
    grades = relationship("Grade", back_populates="student", lazy="dynamic", foreign_keys="[Grade.student_id]")
    attendances = relationship("Attendance", back_populates="student")
    
    # Helper methods to get current grade/section information
    def get_current_grade_section(self, academic_year_id=None):
        """Get the current grade and section for the student."""
        # Get active enrollment for the specified or current academic year
        enrollment_query = self.enrollments.filter_by(is_active=True)
        if academic_year_id:
            enrollment_query = enrollment_query.filter_by(academic_year_id=academic_year_id)
        
        enrollment = enrollment_query.first()
        if enrollment:
            return enrollment.grade, enrollment.section
        return None, None
    
    def get_enrolled_classes(self, academic_year_id=None):
        """Get all classes the student is enrolled in for a specific academic year."""
        query = self.class_enrollments.filter_by(is_active=True)
        if academic_year_id:
            query = query.filter_by(academic_year_id=academic_year_id)
        return [enrollment.class_obj for enrollment in query.all()]
    
    def __repr__(self):
        return f"<Student {self.email} - {self.admission_number}>"

        