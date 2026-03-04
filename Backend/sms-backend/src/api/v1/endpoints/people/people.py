# Import services instead of direct CRUD operations
from typing import Any, List, Optional, Dict
from uuid import UUID
from datetime import date  # Add this import
from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks, Body
from sqlalchemy.orm import Session

# WhatsApp service
# REMOVED: from src.services.notification.whatsapp_service import MultiTenantWhatsAppService
from src.services.auth.password import generate_default_password

# Replace CRUD imports with service imports
from src.db.crud.people import student, teacher, parent
from src.schemas import tenant
from src.schemas.tenant import Tenant
from src.services.people import StudentService, TeacherService, ParentService
from src.services.people import SuperAdminStudentService, SuperAdminTeacherService, SuperAdminParentService
from src.db.session import get_db
from src.schemas.people import Student, StudentCreate, StudentUpdate, StudentBulkDelete, StudentListResponse
from src.schemas.people import Teacher, TeacherCreate, TeacherUpdate, TeacherCreateResponse
from src.schemas.people import Parent, ParentCreate, ParentUpdate
from src.core.middleware.tenant import get_tenant_id_from_request, get_tenant_from_request 
from src.core.auth.dependencies import has_any_role, get_current_user, get_current_active_user, has_permission
from src.schemas.auth import User
from src.schemas.auth import User
from src.db.crud.auth.user import user
from src.db.models.auth.user_role import UserRole
from src.core.exceptions.business import (
    BusinessLogicError,
    EntityNotFoundError,
    DuplicateEntityError,
    InvalidStatusTransitionError,
    BusinessRuleViolationError,
    DatabaseError
)
from src.schemas.people.student import StudentCreateResponse
from src.schemas.academics.enrollment import Enrollment as EnrollmentSchema
from src.services.academics.enrollment import EnrollmentService
from src.services.academics.class_enrollment_service import ClassEnrollmentService
from src.services.academics.attendance_service import AttendanceService
from src.db.models.academics.grade import Grade
from src.db.models.academics.enrollment import Enrollment as EnrollmentModel
from src.db.models.academics.class_enrollment import ClassEnrollment as ClassEnrollmentModel
from src.utils.uuid_utils import ensure_uuid

router = APIRouter()

# Student endpoints
# create_student
@router.post("/students", response_model=Student, status_code=status.HTTP_201_CREATED)
async def create_student(
    *,
    student_service: StudentService = Depends(),
    student_in: StudentCreate,
    current_user: User = Depends(has_permission("manage_students"))
) -> Any:
    """Create a new student with admission number generation."""
    try:
        created_student = await student_service.create(obj_in=student_in)
        
        # Explicitly assign 'student' role
        # We need to do this manually because the base User creation logic doesn't assign specific roles
        # aside from 'super_admin' check in some contexts.
        student_role = student_service.db.query(UserRole).filter(UserRole.name == "student").first()
        if student_role:
            # Re-fetch the student object to ensure it's attached to the session
            db_student = student_service.db.query(student_service.model).filter(student_service.model.id == created_student.id).first()
            if db_student:
                if student_role not in db_student.roles:
                    db_student.roles.append(student_role)
                    student_service.db.commit()
                    student_service.db.refresh(db_student)
                    # Update the returned object to include the new role if needed (or just let it be)
        else:
            print(f"WARNING: 'student' role not found in database. Created student {created_student.email} has no role assigned.")

        return created_student
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.post("/students/bulk", response_model=List[Dict[str, Any]], status_code=status.HTTP_201_CREATED)
async def create_students_bulk(
    *,
    student_service: StudentService = Depends(),
    students_in: List[StudentCreate],
    current_user: User = Depends(has_permission("manage_students"))
) -> Any:
    """Create multiple students with individual status reporting."""
    try:
        created_students = await student_service.bulk_create(students_in=students_in)
        
        # Assign 'student' role to all successfully created students
        student_role = student_service.db.query(UserRole).filter(UserRole.name == "student").first()
        if not student_role:
            print("WARNING: 'student' role not found in database for bulk creation.")

        for student_dict in created_students:
            # bulk_create returns a list of dictionaries like {"success": True, "student": student, "id": str(student.id)}
            if student_dict.get("success") and "id" in student_dict:
                try:
                    student_id = student_dict["id"]
                    db_student = student_service.db.query(student_service.model).filter(student_service.model.id == student_id).first()
                    if db_student:
                        # Assign role if found
                        if student_role and student_role not in db_student.roles:
                            db_student.roles.append(student_role)
                        
                        # Convert model to schema for serialization UNCONDITIONALLY
                        # This avoids the "identity crisis" where SQLAlchemy models are sent directly
                        student_dict["student"] = Student.model_validate(db_student)
                except Exception as e:
                    print(f"Error processing bulk student result for {student_dict.get('email', 'unknown')}: {str(e)}")
                    # Don't fail the whole batch, just record the serialization error
                    student_dict["success"] = False
                    student_dict["error"] = f"Serialization error: {str(e)}"
        
        student_service.db.commit()
        return created_students
    except Exception as e:
        print(f"CRITICAL ERROR in create_students_bulk: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Bulk creation failed: {str(e)}"
        )

# get_students
@router.get("/students", response_model=StudentListResponse)
async def get_students(
    *,
    student_service: StudentService = Depends(),
    skip: int = 0,
    limit: int = 100,
    grade: Optional[str] = None,
    section: Optional[str] = None,
    status: Optional[str] = None,
    current_user: User = Depends(has_permission("view_students"))
) -> Any:
    """Get all students with optional filtering."""
    filters = {}
    if grade:
        filters["grade"] = grade
    if section:
        filters["section"] = section
    if status:
        filters["status"] = status

    # For super_admin users, we might need to use SuperAdminStudentService instead
    if "super_admin" in {role.name for role in current_user.roles}:
        # Use SuperAdminStudentService for cross-tenant access
        super_admin_service = SuperAdminStudentService(db=student_service.db) # Assuming student_service has a db attribute
        items, total = await super_admin_service.list_with_count(skip=skip, limit=limit, filters=filters)
    else:
        # Regular tenant-scoped access
        items, total = await student_service.list_with_count(skip=skip, limit=limit, filters=filters)
    
    return {
        "items": items,
        "total": total
    }

# second get_student (the one with explicit deps)
@router.get("/students/{student_id}", response_model=Student)
async def get_student(
    *,
    student_service: StudentService = Depends(),
    student_id: UUID,
    current_user: User = Depends(has_permission("view_students"))
) -> Any:
    """Get a student by ID."""
    student = await student_service.get(student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return student

# update_student
@router.put("/students/{student_id}", response_model=Student)
async def update_student(
    *,
    student_service: StudentService = Depends(),
    student_id: UUID,
    student_in: StudentUpdate,
    current_user: User = Depends(has_permission("manage_students"))
) -> Any:
    """Update a student record."""
    try:
        return await student_service.update(id=student_id, obj_in=student_in)
    except EntityNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found"
        )

@router.put("/students/{student_id}/status", response_model=Student)
async def update_student_status(
    *,
    student_service: StudentService = Depends(),
    student_id: UUID,
    status: str = Query(..., description="New status for the student"),
    reason: Optional[str] = Query(None, description="Reason for status change"),
    current_user: User = Depends(has_permission("manage_students"))
) -> Any:
    """Update a student's status with validation and secondary effects."""
    try:
        return await student_service.update_status(id=student_id, status=status, reason=reason)
    except EntityNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found"
        )
    except InvalidStatusTransitionError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred: {str(e)}"
        )

@router.delete("/students/bulk", status_code=status.HTTP_200_OK)
@router.post("/students/bulk-delete", status_code=status.HTTP_200_OK)
async def bulk_delete_students(
    *,
    student_service: StudentService = Depends(),
    payload: StudentBulkDelete = Body(...),
    current_user: User = Depends(has_permission("manage_students"))
) -> Any:
    """Bulk delete students."""
    tenant_id = ensure_uuid(student_service.tenant_id)
    enrollment_service = EnrollmentService(tenant=tenant_id, db=student_service.db)
    
    deleted_ids = []
    errors = []
    
    for student_id in payload.student_ids:
        try:
            # 1. Check for "Human" Data (Grades, Attendance) - These BLOCK deletion
            has_human_data = False
            
            # Grades check
            if student_service.db.query(Grade).filter(Grade.student_id == student_id).count() > 0:
                has_human_data = True
            
            # Attendance check
            if not has_human_data:
                attendance_service = AttendanceService(tenant=tenant_id, db=student_service.db)
                if len(attendance_service.get_multi(student_id=student_id, limit=1)) > 0:
                    has_human_data = True

            if has_human_data:
                errors.append({
                    "id": str(student_id), 
                    "error": "Cannot delete student with existing grades or attendance records. please archive the student instead to preserve history."
                })
                continue
            
            # 2. Automated Cleanup of "System" Records (Enrollments, Class Enrollments)
            # This breaks the "circle" of orphan records
            student_service.db.query(ClassEnrollmentModel).filter(ClassEnrollmentModel.student_id == student_id).delete(synchronize_session=False)
            student_service.db.query(EnrollmentModel).filter(EnrollmentModel.student_id == student_id).delete(synchronize_session=False)
            student_service.db.commit()
                
            await student_service.delete(id=student_id)
            deleted_ids.append(str(student_id))
        except Exception as e:
            errors.append({"id": str(student_id), "error": str(e)})
            
    return {
        "status": "success",
        "deleted_count": len(deleted_ids),
        "deleted_ids": deleted_ids,
        "errors": errors
    }

# delete_student
@router.delete("/students/{student_id}", response_model=Student)
async def delete_student(
    *,
    student_id: UUID,
    current_user: User = Depends(has_any_role(["admin"])),
    db: Session = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id_from_request)
) -> Any:
    """Delete a student."""
    student_service = StudentService(
        tenant=tenant_id,
        db=db
    )
    # 1. Check for "Human" Data (Grades, Attendance) - These BLOCK deletion
    
    # Grades check
    if db.query(Grade).filter(Grade.student_id == student_id).count() > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete student: The student has existing grade records. These must be preserved; consider archiving instead."
        )

    # Attendance check
    attendance_service = AttendanceService(tenant=tenant_id, db=db)
    if len(attendance_service.get_multi(student_id=student_id, limit=1)) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete student: The student has attendance records. These must be preserved; consider archiving instead."
        )

    # 2. Automated Cleanup of "System" Records (Enrollments, Class Enrollments)
    # This prevents the "circle" of orphan records
    db.query(ClassEnrollmentModel).filter(ClassEnrollmentModel.student_id == student_id).delete(synchronize_session=False)
    db.query(EnrollmentModel).filter(EnrollmentModel.student_id == student_id).delete(synchronize_session=False)
    db.commit()
    try:
        return await student_service.delete(id=student_id)
    except EntityNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found"
        )

# promote_student
@router.put("/students/{student_id}/promote", response_model=Student)
async def promote_student(
    *,
    student_id: UUID,
    new_grade: str = Query(..., description="New grade for the student"),
    new_section: Optional[str] = Query(None, description="New section for the student"),
    current_user: User = Depends(has_any_role(["admin"])),
    db: Session = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id_from_request)
) -> Any:
    """Promote a student to a new grade and optionally a new section."""
    student_service = StudentService(
        tenant=tenant_id,
        db=db
    )
    
    try:
        return await student_service.promote_student(id=student_id, new_grade=new_grade, new_section=new_section)
    except EntityNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student with ID {student_id} not found"
        )
    except BusinessRuleViolationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

# graduate_student
@router.put("/students/{student_id}/graduate", response_model=Student)
async def graduate_student(
    *,
    student_id: UUID,
    graduation_date: date = Query(..., description="Graduation date"),
    honors: List[str] = Query(None, description="Honors received"),
    current_user: User = Depends(has_any_role(["admin"])),
    db: Session = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id_from_request)
) -> Any:
    """Graduate a student from the school."""
    student_service = StudentService(
        tenant=tenant_id,
        db=db
    )
    
    try:
        return await student_service.graduate_student(id=student_id, graduation_date=graduation_date, honors=honors)
    except EntityNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student with ID {student_id} not found"
        )
    except BusinessRuleViolationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.post("/teachers", response_model=TeacherCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_teacher(*, 
    db: Session = Depends(get_db), 
    tenant_id: UUID = Depends(get_tenant_id_from_request), 
    teacher_in: TeacherCreate,
    background_tasks: BackgroundTasks
) -> Any:
    """Create a new teacher with auto-generated employee ID."""
    # Add tenant_id to the request data
    teacher_data = teacher_in.model_copy()
    # teacher_data.tenant_id = tenant_id  <-- REMOVED: Causing ValueError as TeacherCreate model has no such field
    
    # Check for duplicate email first
    existing_user = user.get_by_email_any_tenant(db, email=teacher_data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A user with email '{teacher_data.email}' already exists in the system"
        )
    
    # Check for duplicate employee ID only if provided
    if teacher_data.employee_id:
        existing_teacher = teacher.get_by_employee_id(db, tenant_id=tenant_id, employee_id=teacher_data.employee_id)
        if existing_teacher:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Teacher with this employee ID already exists"
            )
    
    # Generate password if not provided
    password = teacher_data.password if teacher_data.password else generate_default_password()
    password_was_generated = not teacher_data.password
    teacher_data.password = password
    
    # Employee ID will be auto-generated in CRUD if not provided
    new_teacher = teacher.create(db, tenant_id=tenant_id, obj_in=teacher_data)
    
    # Explicitly assign 'teacher' role
    teacher_role = db.query(UserRole).filter(UserRole.name == "teacher").first()
    if teacher_role:
        if teacher_role not in new_teacher.roles:
            new_teacher.roles.append(teacher_role)
            db.commit()
            db.refresh(new_teacher)
    else:
        print(f"WARNING: 'teacher' role not found in database. Created teacher {teacher_data.email} has no role assigned.")
    
    # Send WhatsApp notification in background if phone number is provided
    # REMOVED: WhatsApp notification scheduling
    # if teacher_data.whatsapp_number:
    #             'last_name': new_teacher.last_name,
    #             'email': new_teacher.email,
    #             'password': password,
    #             'employee_id': new_teacher.employee_id
    #         }
    #     )
    
    # Create response with generated password if it was auto-generated
    response = TeacherCreateResponse.model_validate(new_teacher, from_attributes=True)
    if password_was_generated:
        response.generated_password = password
    
    return response

@router.post("/teachers/bulk", response_model=List[TeacherCreateResponse], status_code=status.HTTP_201_CREATED)
async def create_teachers_bulk(*, db: Session = Depends(get_db), tenant_id: UUID = Depends(get_tenant_id_from_request), teachers_in: List[TeacherCreate]) -> Any:
    """Create multiple teachers with auto-generated employee IDs and return credentials."""
    created_teachers = []
    for teacher_data in teachers_in:
        # Check for duplicate employee ID only if provided
        if teacher_data.employee_id:
            existing_teacher = teacher.get_by_employee_id(db, tenant_id=tenant_id, employee_id=teacher_data.employee_id)
            if existing_teacher:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Teacher with employee ID {teacher_data.employee_id} already exists"
                )
        
        # Check for duplicate email
        existing_user = user.get_by_email_any_tenant(db, email=teacher_data.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"A user with email '{teacher_data.email}' already exists in the system"
            )
        
        # Generate password if not provided
        password = teacher_data.password if teacher_data.password else generate_default_password()
        password_was_generated = not teacher_data.password
        teacher_data.password = password
        
        # Employee ID will be auto-generated in CRUD if not provided
        created_teacher = teacher.create(db, tenant_id=tenant_id, obj_in=teacher_data)
        
        # Explicitly assign 'teacher' role
        teacher_role = db.query(UserRole).filter(UserRole.name == "teacher").first()
        if teacher_role:
            if teacher_role not in created_teacher.roles:
                created_teacher.roles.append(teacher_role)
                db.commit() # Commit inside loop to ensure role is saved even if subsequent creates fail (though strictly this batch should be all or nothing, but schema allows partials generally)
                db.refresh(created_teacher)
        
        # Create response with generated password if it was auto-generated
        response = TeacherCreateResponse.model_validate(created_teacher, from_attributes=True)
        if password_was_generated:
            response.generated_password = password
        
        created_teachers.append(response)
    
    return created_teachers

@router.get("/teachers", response_model=List[Teacher])
async def get_teachers(
    *, 
    db: Session = Depends(get_db), 
    tenant_id: UUID = Depends(get_tenant_id_from_request),
    skip: int = 0, 
    limit: int = 100,
    department: Optional[str] = None,
    is_class_teacher: Optional[bool] = None,
    status: Optional[str] = None,
    search: Optional[str] = None
) -> Any:
    """Get all teachers for a tenant with optional filtering and search."""
    
    filters = {}
    if department:
        filters["department"] = department
    if is_class_teacher is not None:
        filters["is_class_teacher"] = is_class_teacher
    if status:
        filters["status"] = status
    
    return teacher.list_with_search(
        db, 
        tenant_id=tenant_id, 
        skip=skip, 
        limit=limit, 
        search=search,
        **filters
    )

@router.get("/teachers/class-teachers", response_model=List[Teacher])
async def get_class_teachers(*, db: Session = Depends(get_db), tenant_id: UUID = Depends(get_tenant_id_from_request)) -> Any:
    """Get all class teachers for a tenant."""
    return teacher.get_class_teachers(db, tenant_id=tenant_id)

@router.get("/teachers/departments", response_model=List[str])
async def get_teacher_departments(
    *, 
    db: Session = Depends(get_db), 
    tenant_id: UUID = Depends(get_tenant_id_from_request)
) -> Any:
    """Get all unique departments from teachers."""
    print(f"[BACKEND] Departments endpoint received tenant_id: {tenant_id} (type: {type(tenant_id)})")
    teachers = teacher.list(db, tenant_id=tenant_id, skip=0, limit=1000)
    departments = set()
    for t in teachers:
        if t.department and t.department.strip():
            departments.add(t.department.strip())
    return sorted(list(departments))

@router.get("/teachers/{teacher_id}", response_model=Teacher)
async def get_teacher(*, db: Session = Depends(get_db), tenant_id: UUID = Depends(get_tenant_id_from_request), teacher_id: UUID) -> Any:
    """Get a specific teacher by ID."""
    teacher_obj = teacher.get_by_id(db, tenant_id=tenant_id, id=teacher_id)
    if not teacher_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Teacher not found"
        )
    return teacher_obj

@router.put("/teachers/{teacher_id}", response_model=Teacher)
async def update_teacher(*, db: Session = Depends(get_db), tenant_id: UUID = Depends(get_tenant_id_from_request), teacher_id: UUID, teacher_in: TeacherUpdate) -> Any:
    """Update a teacher."""
    teacher_obj = teacher.get_by_id(db, tenant_id=tenant_id, id=teacher_id)
    if not teacher_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Teacher not found"
        )
    return teacher.update(db, tenant_id=tenant_id, db_obj=teacher_obj, obj_in=teacher_in)

@router.delete("/teachers/{teacher_id}", response_model=Teacher)
async def delete_teacher(*, db: Session = Depends(get_db), tenant_id: UUID = Depends(get_tenant_id_from_request), teacher_id: UUID) -> Any:
    """Delete a teacher."""
    teacher_obj = teacher.get_by_id(db, tenant_id=tenant_id, id=teacher_id)
    if not teacher_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Teacher not found"
        )
    
    # Check for references in other tables before deletion to provide clear error message
    # 1. Check Class Sponsor assignments
    from src.db.models.academics.class_model import Class
    sponsor_classes = db.query(Class).filter(Class.tenant_id == tenant_id, Class.class_teacher_id == teacher_id).all()
    if sponsor_classes:
        class_names = ", ".join([c.name or "Unnamed Class" for c in sponsor_classes])
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete teacher. They are currently the class sponsor for: {class_names}. Reassign these classes first."
        )
    
    # 2. Check ClassSubject assignments
    from src.db.models.academics.class_subject import ClassSubject
    subject_assignments = db.query(ClassSubject).filter(ClassSubject.tenant_id == tenant_id, ClassSubject.teacher_id == teacher_id).all()
    if subject_assignments:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete teacher. They have active subject teaching assignments. Remove these assignments first."
        )
        
    # 3. Check legacy teacher_subject_assignments table (using raw SQL because no model exists)
    from sqlalchemy import text
    legacy_check = None
    try:
        # This table was identified in the database but might not be in the current models
        legacy_check = db.execute(
            text("SELECT 1 FROM teacher_subject_assignments WHERE teacher_id = :tid AND tenant_id = :tenant_id LIMIT 1"),
            {"tid": teacher_id, "tenant_id": tenant_id}
        ).fetchone()
    except Exception as e:
        # Table might not exist or schema might be different, log and continue
        print(f"Legacy table check skipped: {str(e)}")
    
    if legacy_check:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete teacher. They have legacy subject assignments. Please clear them in the Academics setup."
        )

    # 4. Check for active assignments
    from src.db.models.academics.assignment import Assignment
    active_assignments = db.query(Assignment).filter(Assignment.tenant_id == tenant_id, Assignment.teacher_id == teacher_id).all()
    if active_assignments:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete teacher. They have created assessments/assignments. Remove these assignments first."
        )

    # 5. Check for grades given by this teacher
    from src.db.models.academics.grade import Grade
    grades_given = db.query(Grade).filter(Grade.tenant_id == tenant_id, Grade.graded_by == teacher_id).all()
    if grades_given:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete teacher. They have recorded grades for students. To preserve academic history, please deactivate their account instead of deleting it."
        )

    # 6. Check for attendance marked by this teacher
    from src.db.models.academics.attendance import Attendance
    attendance_marked = db.query(Attendance).filter(Attendance.tenant_id == tenant_id, Attendance.marked_by == teacher_id).all()
    if attendance_marked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete teacher. They have marked attendance records. Please deactivate their account instead of deleting it."
        )

    # Create service instance
    from src.services.people.teacher import TeacherService
    teacher_service = TeacherService(db=db, tenant=tenant_id)
    return await teacher_service.delete(id=teacher_id)

# Parent endpoints
@router.post("/parents", response_model=Parent, status_code=status.HTTP_201_CREATED)
async def create_parent(*, 
    db: Session = Depends(get_db), 
    tenant_id: UUID = Depends(get_tenant_id_from_request), 
    parent_in: ParentCreate,
    background_tasks: BackgroundTasks
) -> Any:
    """Create a new parent."""
    # Check for duplicate email globally
    existing_user = user.get_by_email_any_tenant(db, email=parent_in.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A user with email '{parent_in.email}' already exists in the system"
        )

    # Generate password if not provided
    password = parent_in.password if parent_in.password else generate_default_password()
    parent_in.password = password
    
    new_parent = parent.create(db, tenant_id=tenant_id, obj_in=parent_in)
    
    return new_parent

def send_parent_whatsapp_notification(tenant_id: str, phone_number: str, parent_data: dict):
    # No-op: WhatsApp notifications removed
    return None

@router.get("/parents", response_model=List[Parent])
async def get_parents(*, db: Session = Depends(get_db), tenant_id: UUID = Depends(get_tenant_id_from_request), skip: int = 0, limit: int = 100) -> Any:
    """Get all parents for a tenant."""
    return parent.list(db, tenant_id=tenant_id, skip=skip, limit=limit)

@router.get("/parents/by-student/{student_id}", response_model=List[Parent])
async def get_parents_by_student(*, db: Session = Depends(get_db), tenant_id: UUID = Depends(get_tenant_id_from_request), student_id: UUID) -> Any:
    """Get all parents of a specific student."""
    return parent.get_by_student(db, tenant_id=tenant_id, student_id=student_id)

@router.get("/parents/{parent_id}", response_model=Parent)
async def get_parent(*, db: Session = Depends(get_db), tenant_id: UUID = Depends(get_tenant_id_from_request), parent_id: UUID) -> Any:
    """Get a specific parent by ID."""
    parent_obj = parent.get_by_id(db, tenant_id=tenant_id, id=parent_id)
    if not parent_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Parent not found"
        )
    return parent_obj

@router.put("/parents/{parent_id}", response_model=Parent)
async def update_parent(*, db: Session = Depends(get_db), tenant_id: UUID = Depends(get_tenant_id_from_request), parent_id: UUID, parent_in: ParentUpdate) -> Any:
    """Update a parent."""
    parent_obj = parent.get_by_id(db, tenant_id=tenant_id, id=parent_id)
    if not parent_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Parent not found"
        )
    return parent.update(db, tenant_id=tenant_id, db_obj=parent_obj, obj_in=parent_in)

@router.delete("/parents/{parent_id}", response_model=Parent)
async def delete_parent(*, db: Session = Depends(get_db), tenant_id: UUID = Depends(get_tenant_id_from_request), parent_id: UUID) -> Any:
    """Delete a parent."""
    parent_obj = parent.get_by_id(db, tenant_id=tenant_id, id=parent_id)
    if not parent_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Parent not found"
        )
    # Create service instance
    from src.services.people.parent import ParentService
    parent_service = ParentService(db=db, tenant=tenant_id)
    return await parent_service.delete(id=parent_id)

@router.post("/parents/{parent_id}/students/{student_id}", response_model=Parent)
async def add_student_to_parent(*, db: Session = Depends(get_db), tenant_id: UUID = Depends(get_tenant_id_from_request), parent_id: UUID, student_id: UUID) -> Any:
    """Add a student to a parent."""
    parent_obj = parent.get_by_id(db, tenant_id=tenant_id, id=parent_id)
    if not parent_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Parent not found"
        )
    return parent.add_student(db, tenant_id=tenant_id, parent_id=parent_id, student_id=student_id)

@router.delete("/parents/{parent_id}/students/{student_id}", response_model=Parent)
async def remove_student_from_parent(*, db: Session = Depends(get_db), tenant_id: UUID = Depends(get_tenant_id_from_request), parent_id: UUID, student_id: UUID) -> Any:
    """Remove a student from a parent."""
    parent_obj = parent.get_by_id(db, tenant_id=tenant_id, id=parent_id)
    if not parent_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Parent not found"
        )
    return parent.remove_student(db, tenant_id=tenant_id, parent_id=parent_id, student_id=student_id)

# Add this helper function
def send_teacher_whatsapp_notification(db_session: Session, tenant_id: str, phone_number: str, teacher_data: dict):
    """Background task to send WhatsApp notification"""
    try:
        whatsapp_service = MultiTenantWhatsAppService(db=db_session, tenant_id=tenant_id)
        whatsapp_service.send_teacher_credentials(
            phone_number=phone_number,
            teacher_data=teacher_data
        )
    except Exception as e:
        print(f"Failed to send WhatsApp notification: {str(e)}")
        # Log the error but don't fail the background task

@router.get("/students/{student_id}/enrollments", response_model=List[EnrollmentSchema])
async def get_student_enrollments(
    *,
    student_id: UUID,
    current_user: User = Depends(has_any_role(["admin", "teacher", "student", "parent"])),
    db: Session = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id_from_request),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """List all enrollments for a given student within the tenant."""
    # Security check for students
    roles = [r.name for r in current_user.roles]
    if "student" in roles and "admin" not in roles and "teacher" not in roles:
        if str(current_user.id) != str(student_id):
            raise HTTPException(status_code=403, detail="Students can only view their own enrollments")
            
    enrollment_service = EnrollmentService(
        tenant=tenant_id,
        db=db
    )
    return await enrollment_service.get_multi(skip=skip, limit=limit, student_id=student_id)

@router.get("/students/{student_id}/enrollments/current", response_model=Optional[EnrollmentSchema])
async def get_student_current_enrollment(
    *,
    student_id: UUID,
    current_user: User = Depends(has_any_role(["admin", "teacher", "student", "parent"])),
    db: Session = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id_from_request)
) -> Any:
    """Get the current active enrollment for a student."""
    # Security check for students
    roles = [r.name for r in current_user.roles]
    if "student" in roles and "admin" not in roles and "teacher" not in roles:
        if str(current_user.id) != str(student_id):
            raise HTTPException(status_code=403, detail="Students can only view their own enrollment")

    try:
        enrollment_service = EnrollmentService(tenant=tenant_id, db=db)
        return await enrollment_service.get_active_enrollment(student_id)
    except Exception:
        # Reliability: never blow up this endpoint; return None on unexpected errors
        return None

@router.post("/students/bulk-enrollments", response_model=Dict[str, Optional[EnrollmentSchema]])
async def get_bulk_current_enrollments(
    *,
    payload: Dict[str, Any] = Body(...),
    current_user: User = Depends(has_any_role(["admin", "teacher", "student", "parent"])),
    db: Session = Depends(get_db),
    tenant_id: UUID = Depends(get_tenant_id_from_request)
) -> Any:
    """
    Fetch current active enrollments for multiple students.
    Expects: { "student_ids": [UUID|string, ...] }
    Returns: { "<student_id>": Enrollment | None }
    """
    student_ids = payload.get("student_ids", [])
    if not student_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="student_ids is required and cannot be empty"
        )

    enrollment_service = EnrollmentService(tenant=tenant_id, db=db)

    result: Dict[str, Optional[Enrollment]] = {}
    for sid in student_ids:
        try:
            sid_uuid = UUID(str(sid))
            result[str(sid_uuid)] = await enrollment_service.get_active_enrollment(sid_uuid)
        except Exception:
            # Non-fatal: if ID is invalid or lookup fails, return None for that student
            result[str(sid)] = None

    return result
