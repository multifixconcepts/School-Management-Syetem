from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import date, datetime, timedelta
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from src.db.crud.academics.attendance_crud import attendance_crud
from src.db.models.academics.attendance import Attendance, AttendanceStatus
from src.schemas.academics.attendance import (
    AttendanceCreate, AttendanceUpdate, AttendanceWithDetails,
    AttendanceSummary, BulkAttendanceCreate, AttendanceReport
)
from src.services.base.base import TenantBaseService, SuperAdminBaseService
from src.core.exceptions.business import EntityNotFoundError, DuplicateEntityError, BusinessRuleViolationError
from src.db.session import get_db, get_super_admin_db
from src.core.middleware.tenant import get_tenant_from_request
from src.db.crud.people import student as student_crud
from src.db.crud.academics.class_crud import class_crud
from src.db.crud.academics.schedule_crud import schedule_crud
from src.db.crud.academics.academic_year_crud import academic_year_crud
from src.db.crud.academics.grade import grade as grade_crud
from src.db.models.academics.grade import Grade, GradeType

class AttendanceService(TenantBaseService[Attendance, AttendanceCreate, AttendanceUpdate]):
    """Service for managing attendance within a tenant."""
    
    def __init__(
        self,
        tenant: Any = Depends(get_tenant_from_request),
        db: Session = Depends(get_db)
    ):
        tenant_id = tenant.id if hasattr(tenant, 'id') else tenant
        super().__init__(crud=attendance_crud, model=Attendance, tenant_id=tenant_id, db=db)
    
    # Core CRUD Operations
    async def get_by_student_and_date(
        self, 
        student_id: UUID, 
        attendance_date: date,
        class_id: Optional[UUID] = None
    ) -> Optional[Attendance]:
        """Get attendance record for a student on a specific date and class."""
        return attendance_crud.get_by_student_and_date(
            self.db, self.tenant_id, student_id, attendance_date, class_id
        )
    
    async def get_by_class_and_date(
        self, 
        class_id: UUID, 
        attendance_date: date
    ) -> List[Attendance]:
        """Get all attendance records for a class on a specific date."""
        return attendance_crud.get_by_class_and_date(
            self.db, self.tenant_id, class_id, attendance_date
        )
    
    async def get_by_schedule_and_date(
        self, 
        schedule_id: UUID, 
        attendance_date: date
    ) -> List[Attendance]:
        """Get all attendance records for a schedule on a specific date."""
        return attendance_crud.get_by_schedule_and_date(
            self.db, self.tenant_id, schedule_id, attendance_date
        )
    
    # Daily Attendance Management
    async def mark_daily_attendance(
        self, 
        student_id: UUID,
        class_id: UUID,
        academic_year_id: UUID,
        status: AttendanceStatus,
        marked_by: UUID,
        schedule_id: Optional[UUID] = None,
        attendance_date: Optional[date] = None,
        check_in_time: Optional[datetime] = None,
        check_out_time: Optional[datetime] = None,
        comments: Optional[str] = None,
        period: Optional[str] = None
    ) -> Attendance:
        if attendance_date is None:
            attendance_date = date.today()
        # Validate entities
        student = student_crud.get_by_id(self.db, tenant_id=self.tenant_id, id=student_id)
        if not student:
            raise EntityNotFoundError("Student", student_id)
        cls = class_crud.get_by_id(self.db, tenant_id=self.tenant_id, id=class_id)
        if not cls:
            raise EntityNotFoundError("Class", class_id)
        if schedule_id:
            sch = schedule_crud.get_by_id(self.db, tenant_id=self.tenant_id, id=schedule_id)
            if not sch:
                raise EntityNotFoundError("Schedule", schedule_id)
        elif not period:
            raise BusinessRuleViolationError("Either schedule_id or period (ad-hoc name) must be provided")
        ay = academic_year_crud.get_by_id(self.db, tenant_id=self.tenant_id, id=academic_year_id)
        if not ay:
            raise EntityNotFoundError("AcademicYear", academic_year_id)
        # Permission check: Only admin or the section sponsor can mark attendance
        # We check if marked_by is an admin separately in the API layer usually, 
        # but here we can check if it's the sponsor of the class's section.
        from src.db.models.auth import User as UserModel
        from src.db.models.academics.section import Section as SectionModel

        is_sponsor = False
        section_obj = self.db.query(SectionModel).filter(
            SectionModel.id == cls.section_id,
            SectionModel.class_teacher_id == marked_by
        ).first()
        
        if section_obj:
            is_sponsor = True
            
        # If not sponsor, check if it's an admin (this is a bit redundant if API handles it, but safe)
        if not is_sponsor:
            user = self.db.query(UserModel).filter(UserModel.id == marked_by).first()
            if user and not any(role.name in ["admin", "super_admin"] for role in getattr(user, "roles", [])):
                raise BusinessRuleViolationError("Only the section sponsor or an administrator can mark attendance.")

        # Check if attendance already exists
        existing = await self.get_by_student_and_date(student_id, attendance_date, class_id)
        if existing:
            return await self.update_attendance_status(
                existing.id, status, marked_by, check_in_time, check_out_time, comments
            )
        # Create new attendance record
        attendance_data = AttendanceCreate(
            student_id=student_id,
            class_id=class_id,
            schedule_id=schedule_id,
            academic_year_id=academic_year_id,
            date=attendance_date,
            status=status,
            check_in_time=check_in_time,
            check_out_time=check_out_time,
            marked_by=marked_by,
            marked_at=datetime.utcnow(),
            notes=comments,
            period=period
        )
        return await self.create(obj_in=attendance_data)
    
    async def bulk_mark_attendance(
        self, 
        attendance_in: BulkAttendanceCreate
    ) -> List[Attendance]:
        """Bulk mark attendance with upsert logic."""
        results = []
        student_ids = set()
        
        for record in attendance_in.attendances:
            student_id = record['student_id']
            status = record['status']
            student_ids.add(student_id)
            
            # Use the mark_daily_attendance logic which handles upsert via update_attendance_status
            att = await self.mark_daily_attendance(
                student_id=student_id,
                class_id=attendance_in.class_id,
                schedule_id=attendance_in.schedule_id,
                academic_year_id=attendance_in.academic_year_id,
                status=status,
                marked_by=attendance_in.marked_by,
                attendance_date=attendance_in.date,
                period=attendance_in.period
            )
            results.append(att)
        
        # Sync attendance to grade model for all affected students
        for sid in student_ids:
            try:
                await self.sync_attendance_to_grade(
                    student_id=sid,
                    academic_year_id=attendance_in.academic_year_id,
                    marked_by=attendance_in.marked_by
                )
            except Exception as e:
                # Log but don't fail the bulk operation if grade sync fails
                print(f"[WARN] Failed to sync attendance to grade for student {sid}: {e}")
        
        return results
    
    async def update_attendance_status(
        self, 
        attendance_id: UUID, 
        status: AttendanceStatus,
        marked_by: UUID,
        check_in_time: Optional[datetime] = None,
        check_out_time: Optional[datetime] = None,
        comments: Optional[str] = None
    ) -> Optional[Attendance]:
        """Update attendance status and related fields."""
        return attendance_crud.update_attendance_status(
            self.db, self.tenant_id, attendance_id, status, marked_by,
            check_in_time, check_out_time, comments
        )
    
    # Reporting and Analytics
    async def get_student_attendance_range(
        self, 
        student_id: UUID, 
        start_date: date, 
        end_date: date
    ) -> List[Attendance]:
        """Get student attendance records within a date range."""
        return attendance_crud.get_student_attendance_range(
            self.db, self.tenant_id, student_id, start_date, end_date
        )
    
    async def get_class_attendance_range(
        self, 
        class_id: UUID, 
        start_date: date, 
        end_date: date
    ) -> List[Attendance]:
        """Get class attendance records within a date range."""
        return attendance_crud.get_class_attendance_range(
            self.db, self.tenant_id, class_id, start_date, end_date
        )
    
    async def get_attendance_summary(
        self, 
        student_id: Optional[UUID] = None,
        class_id: Optional[UUID] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> AttendanceSummary:
        """Get attendance summary statistics."""
        summary_data = attendance_crud.get_attendance_summary(
            self.db, self.tenant_id, student_id, class_id, start_date, end_date
        )
        
        # Use the current date if no specific date range is provided
        summary_date = start_date or date.today()
        
        return AttendanceSummary(
            date=summary_date,
            total_students=summary_data['total_records'],
            present_count=summary_data['status_breakdown'].get('present', 0),
            absent_count=summary_data['status_breakdown'].get('absent', 0),
            late_count=summary_data['status_breakdown'].get('late', 0),
            excused_count=summary_data['status_breakdown'].get('excused', 0),
            attendance_percentage=summary_data['attendance_rate']
        )

    def get_multi(
        self,
        *,
        skip: int = 0,
        limit: int = 100,
        student_id: Optional[UUID] = None,
        class_id: Optional[UUID] = None,
        schedule_id: Optional[UUID] = None,
        academic_year_id: Optional[UUID] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        status_filter: Optional[Any] = None,
    ) -> List[Attendance]:
        # Normalize status_filter if passed as schema enum or string
        if status_filter is not None:
            try:
                normalized = getattr(status_filter, "value", status_filter)
                status_filter = AttendanceStatus(normalized)
            except Exception:
                status_filter = None

        return attendance_crud.get_multi(
            self.db,
            self.tenant_id,
            skip=skip,
            limit=limit,
            student_id=student_id,
            class_id=class_id,
            schedule_id=schedule_id,
            academic_year_id=academic_year_id,
            start_date=start_date,
            end_date=end_date,
            status_filter=status_filter,
        )

    
    async def generate_attendance_report(
        self, 
        class_id: Optional[UUID] = None,
        student_id: Optional[UUID] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        report_type: str = "summary"
    ) -> AttendanceReport:
        """Generate comprehensive attendance report."""
        if start_date is None:
            start_date = date.today() - timedelta(days=30)  # Default to last 30 days
        if end_date is None:
            end_date = date.today()
        
        # Get attendance records
        if student_id:
            records = await self.get_student_attendance_range(student_id, start_date, end_date)
        elif class_id:
            records = await self.get_class_attendance_range(class_id, start_date, end_date)
        else:
            # Get all records for the tenant within date range
            records = attendance_crud.list(
                self.db, 
                tenant_id=self.tenant_id,
                filters={'date__gte': start_date, 'date__lte': end_date}
            )
        
        # Get summary statistics
        summary = await self.get_attendance_summary(student_id, class_id, start_date, end_date)
        
        return AttendanceReport(
            report_type=report_type,
            period_start=start_date,
            period_end=end_date,
            class_id=class_id,
            student_id=student_id,
            summary=summary,
            records=records,
            generated_at=datetime.utcnow()
        )
    
    async def get_absent_students(
        self, 
        class_id: Optional[UUID] = None,
        attendance_date: Optional[date] = None
    ) -> List[Attendance]:
        """Get list of absent students for a specific date and class."""
        if attendance_date is None:
            attendance_date = date.today()
        
        return attendance_crud.get_attendance_by_status(
            self.db, self.tenant_id, AttendanceStatus.ABSENT, attendance_date, class_id
        )
    
    async def get_late_students(
        self, 
        class_id: Optional[UUID] = None,
        attendance_date: Optional[date] = None
    ) -> List[Attendance]:
        """Get list of late students for a specific date and class."""
        if attendance_date is None:
            attendance_date = date.today()
        
        return attendance_crud.get_attendance_by_status(
            self.db, self.tenant_id, AttendanceStatus.LATE, attendance_date, class_id
        )
    
    # Integration Features
    async def get_student_attendance_percentage(
        self, 
        student_id: UUID, 
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> float:
        """Calculate student's attendance percentage for a period."""
        summary = await self.get_attendance_summary(
            student_id=student_id, 
            start_date=start_date, 
            end_date=end_date
        )
        return summary.attendance_percentage
    
    async def sync_attendance_to_grade(
        self,
        student_id: UUID,
        academic_year_id: UUID,
        marked_by: UUID,
        subject_id: Optional[UUID] = None
    ) -> None:
        """Sync attendance percentage to Grade model as ATTENDANCE assessment type.
        
        This creates or updates a Grade record for the student's cumulative attendance.
        The attendance score contributes to the student's final weighted grade if
        the grading schema includes an ATTENDANCE category.
        """
        # Get current attendance percentage
        attendance_pct = await self.get_student_attendance_percentage(student_id)
        
        # Use 100 as max score (percentage-based)
        max_score = 100
        score = attendance_pct
        
        # Calculate letter grade based on percentage
        def get_letter_grade(pct: float) -> str:
            if pct >= 90: return 'A'
            if pct >= 80: return 'B'
            if pct >= 70: return 'C'
            if pct >= 60: return 'D'
            return 'F'
        
        letter_grade = get_letter_grade(score)
        
        # Build assessment name
        assessment_name = "Attendance Record"
        
        # Check if an ATTENDANCE grade already exists for this student/year
        existing_grades = grade_crud.list(
            self.db,
            tenant_id=self.tenant_id,
            filters={
                'student_id': student_id,
                'academic_year_id': academic_year_id,
                'assessment_type': GradeType.ATTENDANCE
            },
            limit=1
        )
        
        if existing_grades:
            # Update existing grade
            existing = existing_grades[0]
            grade_crud.update(
                self.db,
                tenant_id=self.tenant_id,
                db_obj=existing,
                obj_in={
                    'score': score,
                    'percentage': score,  # Since max is 100
                    'letter_grade': letter_grade,
                    'graded_by': marked_by,
                    'assessment_date': date.today()
                }
            )
        else:
            # Create new attendance grade
            from src.schemas.academics.grade import GradeCreate
            grade_data = GradeCreate(
                student_id=student_id,
                subject_id=subject_id,  # May be None for general attendance
                graded_by=marked_by,
                academic_year_id=academic_year_id,
                assessment_type=GradeType.ATTENDANCE,
                assessment_name=assessment_name,
                assessment_date=date.today(),
                score=score,
                max_score=max_score,
                percentage=score,
                letter_grade=letter_grade,
                period_number=1,
                comments="Auto-generated from attendance records"
            )
            grade_crud.create(self.db, tenant_id=self.tenant_id, obj_in=grade_data)

    async def sync_assessment_attendance(
        self,
        assessment: Any,
        marked_by: UUID
    ) -> int:
        """Automatically populate grades for an ATTENDANCE assessment for all students in the target class/section."""
        from src.db.models.academics.enrollment import Enrollment
        from src.db.crud.academics.grade import grade as grade_crud
        from src.schemas.academics.grade import GradeCreate
        
        # 1. Get all students enrolled in the class/grade for this academic year
        query = self.db.query(Enrollment).filter(
            Enrollment.tenant_id == self.tenant_id,
            Enrollment.academic_year_id == assessment.academic_year_id,
            Enrollment.is_active == True
        )
        
        if assessment.section_id:
            query = query.filter(Enrollment.section_id == assessment.section_id)
        else:
            query = query.filter(Enrollment.grade_id == assessment.grade_id)
            
        enrollments = query.all()
        
        # Helper for letter grade
        def get_letter_grade(pct: float) -> str:
            if pct >= 90: return 'A'
            if pct >= 80: return 'B'
            if pct >= 70: return 'C'
            if pct >= 60: return 'D'
            return 'F'

        count = 0
        for enrollment in enrollments:
            # 2. Get attendance percentage for this student
            ay = academic_year_crud.get_by_id(self.db, self.tenant_id, assessment.academic_year_id)
            
            attendance_pct = await self.get_student_attendance_percentage(
                student_id=enrollment.student_id,
                start_date=ay.start_date if ay else None,
                end_date=assessment.assessment_date
            )
            
            # 3. Calculate score based on assessment max_score
            score = (attendance_pct / 100.0) * assessment.max_score
            
            # 4. Upsert Grade
            existing_grade = self.db.query(Grade).filter(
                Grade.tenant_id == self.tenant_id,
                Grade.student_id == enrollment.student_id,
                Grade.assessment_type == GradeType.ATTENDANCE,
                Grade.assessment_id == assessment.id
            ).first()
            
            if existing_grade:
                grade_crud.update(
                    self.db,
                    tenant_id=self.tenant_id,
                    db_obj=existing_grade,
                    obj_in={
                        "score": score,
                        "percentage": attendance_pct,
                        "letter_grade": get_letter_grade(attendance_pct),
                        "graded_date": date.today(),
                        "graded_by": marked_by
                    }
                )
            else:
                grade_data = GradeCreate(
                    student_id=enrollment.student_id,
                    enrollment_id=enrollment.id,
                    subject_id=assessment.subject_id,
                    graded_by=marked_by,
                    academic_year_id=assessment.academic_year_id,
                    assessment_type=GradeType.ATTENDANCE,
                    assessment_id=assessment.id,
                    assessment_name=assessment.title,
                    assessment_date=assessment.assessment_date,
                    score=score,
                    max_score=assessment.max_score,
                    percentage=attendance_pct,
                    letter_grade=get_letter_grade(attendance_pct),
                    grading_category_id=assessment.grading_category_id,
                    comments="Auto-generated from daily attendance records"
                )
                grade_crud.create(self.db, tenant_id=self.tenant_id, obj_in=grade_data)
            count += 1
            
        return count
    
    async def get_class_attendance_trends(
        self, 
        class_id: UUID, 
        days: int = 30
    ) -> Dict[str, Any]:
        """Get attendance trends for a class over specified days."""
        end_date = date.today()
        start_date = end_date - timedelta(days=days)
        
        records = await self.get_class_attendance_range(class_id, start_date, end_date)
        
        # Group by date and calculate daily attendance rates
        daily_stats = {}
        for record in records:
            record_date = record.date.isoformat()
            if record_date not in daily_stats:
                daily_stats[record_date] = {'total': 0, 'present': 0, 'late': 0}
            
            daily_stats[record_date]['total'] += 1
            if record.status in [AttendanceStatus.PRESENT, AttendanceStatus.LATE]:
                daily_stats[record_date]['present'] += 1
            if record.status == AttendanceStatus.LATE:
                daily_stats[record_date]['late'] += 1
        
        # Calculate daily rates
        trends = []
        for date_str, stats in daily_stats.items():
            attendance_rate = (stats['present'] / stats['total'] * 100) if stats['total'] > 0 else 0
            trends.append({
                'date': date_str,
                'total_students': stats['total'],
                'present_students': stats['present'],
                'late_students': stats['late'],
                'attendance_rate': attendance_rate
            })
        
        return {
            'class_id': str(class_id),
            'period_days': days,
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat(),
            'daily_trends': sorted(trends, key=lambda x: x['date'])
        }


class SuperAdminAttendanceService(SuperAdminBaseService[Attendance, AttendanceCreate, AttendanceUpdate]):
    """Super-admin service for managing attendance across all tenants."""
    
    def __init__(self, db: Session = Depends(get_super_admin_db)):
        super().__init__(crud=attendance_crud, model=Attendance, db=db)
    
    def get_global_attendance_stats(
        self, 
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> Dict[str, Any]:
        """Get global attendance statistics across all tenants."""
        query = self.db.query(Attendance)
        
        if start_date:
            query = query.filter(Attendance.date >= start_date)
        if end_date:
            query = query.filter(Attendance.date <= end_date)
        
        # Get status counts across all tenants
        from sqlalchemy import func
        status_counts = (
            query.with_entities(
                Attendance.status,
                func.count(Attendance.id).label('count')
            )
            .group_by(Attendance.status)
            .all()
        )
        
        total_records = sum(count for _, count in status_counts)
        present_count = sum(count for status, count in status_counts 
                          if status in [AttendanceStatus.PRESENT, AttendanceStatus.LATE])
        
        return {
            'total_records': total_records,
            'status_breakdown': {status.value: count for status, count in status_counts},
            'global_attendance_rate': (present_count / total_records * 100) if total_records > 0 else 0,
            'period_start': start_date.isoformat() if start_date else None,
            'period_end': end_date.isoformat() if end_date else None
        }
    
    def get_multi(
        self,
        *,
        skip: int = 0,
        limit: int = 100,
        student_id: Optional[UUID] = None,
        class_id: Optional[UUID] = None,
        schedule_id: Optional[UUID] = None,
        academic_year_id: Optional[UUID] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        status_filter: Optional[Any] = None,
    ) -> List[Attendance]:
        # Normalize status_filter if passed as schema enum or string
        if status_filter is not None:
            try:
                normalized = getattr(status_filter, "value", status_filter)
                status_filter = AttendanceStatus(normalized)
            except Exception:
                status_filter = None

        return attendance_crud.get_multi(
            self.db,
            self.tenant_id,
            skip=skip,
            limit=limit,
            student_id=student_id,
            class_id=class_id,
            schedule_id=schedule_id,
            academic_year_id=academic_year_id,
            start_date=start_date,
            end_date=end_date,
            status_filter=status_filter,
        )