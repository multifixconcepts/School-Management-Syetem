from .student import Student, StudentCreate, StudentUpdate, StudentBulkDelete, StudentListResponse
from .teacher import Teacher, TeacherCreate, TeacherUpdate, TeacherCreateResponse
from .parent import Parent, ParentCreate, ParentUpdate

__all__ = [
    "Student", "StudentCreate", "StudentUpdate", "StudentBulkDelete", "StudentListResponse",
    "Teacher", "TeacherCreate", "TeacherUpdate", "TeacherCreateResponse",
    "Parent", "ParentCreate", "ParentUpdate"
]

