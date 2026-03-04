from typing import Any, Dict, List, Optional, Union
from sqlalchemy.orm import Session

from src.db.crud.base import TenantCRUDBase
from src.db.models.people import Student
from src.schemas.people.student import StudentCreate, StudentUpdate
from src.core.security.password import get_password_hash
import secrets
import string

def generate_default_password(length=12):
    """Generate a secure random password."""
    alphabet = string.ascii_letters + string.digits + string.punctuation
    return ''.join(secrets.choice(alphabet) for _ in range(length))

class CRUDStudent(TenantCRUDBase[Student, StudentCreate, StudentUpdate]):
    """CRUD operations for Student model."""
    
    def get_by_admission_number(self, db: Session, tenant_id: Any, admission_number: str) -> Optional[Student]:
        """Get a student by admission number within a tenant."""
        return db.query(Student).filter(
            Student.tenant_id == tenant_id,
            Student.admission_number == admission_number
        ).first()
    
    def get_by_grade_section(self, db: Session, tenant_id: Any, grade: str, section: str) -> List[Student]:
        """Get students by grade and section within a tenant."""
        return db.query(Student).filter(
            Student.tenant_id == tenant_id,
            Student.grade == grade,
            Student.section == section
        ).all()
    
    def update_status(self, db: Session, tenant_id: Any, id: Any, status: str, reason: Optional[str] = None) -> Optional[Student]:
        """Update a student's status."""
        student = self.get_by_id(db, tenant_id, id)
        if not student:
            return None
            
        student.status = status
        if status == "withdrawn" and reason:
            student.withdrawal_reason = reason
            
        db.add(student)
        db.commit()
        db.refresh(student)
        return student
    
    def generate_admission_number(self, db: Session, tenant_id: Any, prefix: str = "STU", digits: int = 4) -> str:
        """
        Generate a unique admission number for a student within a tenant.
        Uses a dedicated sequence table to ensure gaps (from deletions) are not reused.
        """
        from src.db.models.people.student_id_sequence import StudentIdSequence
        
        # Lock the sequence row for update to prevent race conditions
        sequence = db.query(StudentIdSequence).filter(
            StudentIdSequence.tenant_id == tenant_id,
            StudentIdSequence.prefix == prefix
        ).with_for_update().first()
        
        if not sequence:
            # First time initialization: check if manual records exist to set baseline
            latest_student = db.query(Student).filter(
                Student.tenant_id == tenant_id,
                Student.admission_number.like(f"{prefix}%")
            ).order_by(Student.admission_number.desc()).first()
            
            start_number = 0
            if latest_student and latest_student.admission_number:
                try:
                    number_part = latest_student.admission_number[len(prefix):]
                    if number_part.isdigit():
                        start_number = int(number_part)
                except (ValueError, IndexError):
                    pass
            
            sequence = StudentIdSequence(
                tenant_id=tenant_id,
                prefix=prefix,
                last_number=start_number
            )
            db.add(sequence)
            db.flush() # Ensure it exists for subsequent ops
            
        # Increment sequence
        sequence.last_number += 1
        db.add(sequence)
        db.commit()
        db.refresh(sequence)
        
        next_num = sequence.last_number
        
        return f"{prefix}{str(next_num).zfill(digits)}"
    
    def create(self, db: Session, *, tenant_id: Any, obj_in: Union[StudentCreate, Dict[str, Any]]) -> Student:
        """Create a new student with auto-generated admission number and password hashing."""
        if isinstance(obj_in, dict):
            create_data = obj_in.copy()
        else:
            create_data = obj_in.dict(exclude_unset=True)
        
        # Generate admission number if not provided
        if not create_data.get('admission_number'):
            create_data['admission_number'] = self.generate_admission_number(db, tenant_id)
        
        # Handle password hashing
        password = create_data.get('password')
        if not password:  # Generate default password if not provided
            password = generate_default_password()
        
        # Convert password to password_hash
        create_data['password_hash'] = get_password_hash(password)
        if 'password' in create_data:
            del create_data['password']  # Remove plain password
        
        # Set first login flag
        create_data['is_first_login'] = True
        
        # Store generated values for response
        created_student = super().create(db=db, tenant_id=tenant_id, obj_in=create_data)
        
        # Attach generated values to the student object for the response
        if not obj_in.dict().get('password'):
            created_student.generated_password = password
        if not obj_in.dict().get('admission_number'):
            created_student.generated_admission_number = create_data['admission_number']
            
        return created_student
    
    def update(
        self, 
        db: Session, 
        tenant_id: Any, 
        *, 
        db_obj: Student, 
        obj_in: Union[StudentUpdate, Dict[str, Any]]
    ) -> Student:
        """Update a student with proper handling of inherited fields."""
        
        tenant_id = self._ensure_uuid(tenant_id)
        
        # Ensure the object belongs to the tenant
        if str(db_obj.tenant_id) != str(tenant_id):
            raise ValueError("Object does not belong to the tenant")
            
        if isinstance(obj_in, dict):
            update_data = obj_in
        else:
            update_data = obj_in.model_dump(exclude_unset=True)
        
        # Separate fields that belong to User table vs Student table
        from src.db.models.auth.user import User
        user_fields = {}
        student_fields = {}
        
        # Get User model columns
        user_columns = {col.name for col in User.__table__.columns}
        student_columns = {col.name for col in Student.__table__.columns}
        
        for field, value in update_data.items():
            if field in user_columns and field != 'id':  # Don't update ID
                user_fields[field] = value
            elif field in student_columns and field != 'id':  # Don't update ID
                student_fields[field] = value
            elif field == 'address':  # Handle the address mapping explicitly
                student_fields['student_address'] = value
        
        # Update User table fields if any
        if user_fields:
            db.query(User).filter(
                User.id == db_obj.id,
                User.tenant_id == tenant_id
            ).update(user_fields)
        
        # Update Student table fields if any
        if student_fields:
            db.query(Student).filter(
                Student.id == db_obj.id,
                Student.tenant_id == tenant_id
            ).update(student_fields)
        
        db.commit()
        db.refresh(db_obj)
        return db_obj

student = CRUDStudent(Student)

