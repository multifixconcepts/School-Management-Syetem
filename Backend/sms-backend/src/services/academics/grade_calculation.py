from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy import String
from sqlalchemy.orm import Session, joinedload
from uuid import UUID
from datetime import date
from fastapi import Depends

from src.db.crud.academics import grade as grade_crud
from src.db.crud.academics import subject as subject_crud
from src.db.crud.people import student as student_crud
from src.db.models.academics.grade import Grade, GradeType
from src.schemas.academics.grade import GradeCreate, GradeUpdate
from src.services.base.base import TenantBaseService, SuperAdminBaseService
from src.db.session import get_db
from src.core.middleware.tenant import get_tenant_from_request
from src.core.exceptions.business import (
    EntityNotFoundError, 
    BusinessRuleViolationError
)
# Promotion and Attendance integration
from src.services.academics.promotion_criteria_service import PromotionCriteriaService
from src.services.academics.attendance_service import AttendanceService
from src.db.crud.academics.academic_year_crud import academic_year_crud
from src.db.crud.tenant.tenant_settings import tenant_settings as tenant_settings_crud
from src.db.models.academics.period import Period
from src.db.models.academics.semester import Semester
from src.db.models.academics.class_model import Class
from src.db.models.academics.class_subject import ClassSubject

class GradeCalculationService(TenantBaseService[Grade, GradeCreate, GradeUpdate]):
    """Service for calculating and managing student grades within a tenant."""
    
    def __init__(
        self,
        db: Session = Depends(get_db),
        tenant_id: Any = Depends(get_tenant_from_request)
    ):
        super().__init__(crud=grade_crud, model=Grade, db=db, tenant_id=tenant_id)
    
    async def get_by_student_subject(self, student_id: UUID, subject_id: UUID) -> List[Grade]:
        """Get all grades for a student in a specific subject."""
        return grade_crud.get_by_student_subject(
            self.db, tenant_id=self.tenant_id, student_id=student_id, subject_id=subject_id
        )
    
    async def get_by_enrollment_subject(self, enrollment_id: UUID, subject_id: UUID) -> List[Grade]:
        """Get all grades for an enrollment in a specific subject."""
        return grade_crud.get_by_enrollment_subject(
            self.db, tenant_id=self.tenant_id, enrollment_id=enrollment_id, subject_id=subject_id
        )
    
    async def get_by_assessment(self, assessment_type: GradeType, assessment_id: UUID) -> List[Grade]:
        """Get all grades for a specific assessment."""
        return grade_crud.get_by_assessment(
            self.db, tenant_id=self.tenant_id, assessment_type=assessment_type, assessment_id=assessment_id
        )
    
    async def get_with_details(self, id: UUID) -> Optional[Dict]:
        """Get grade with additional details."""
        return grade_crud.get_with_details(
            self.db, tenant_id=self.tenant_id, id=id
        )
    
    async def create(self, *, obj_in: GradeCreate) -> Grade:
        """Create a new grade with validation."""
        # Check if student exists
        student = student_crud.get_by_id(self.db, tenant_id=self.tenant_id, id=obj_in.student_id)
        if not student:
            raise EntityNotFoundError("Student", obj_in.student_id)
        
        # Check if subject exists
        subject = subject_crud.get_by_id(self.db, tenant_id=self.tenant_id, id=obj_in.subject_id)
        if not subject:
            raise EntityNotFoundError("Subject", obj_in.subject_id)
        
        # Validate score and max_score
        if obj_in.score < 0 or obj_in.max_score <= 0 or obj_in.score > obj_in.max_score:
            raise BusinessRuleViolationError(f"Invalid score ({obj_in.score}) or max_score ({obj_in.max_score})")
        
        # Calculate percentage if not provided
        if not obj_in.percentage:
            obj_in.percentage = (obj_in.score / obj_in.max_score) * 100
        
        # Determine letter grade if not provided
        if not obj_in.letter_grade:
            obj_in.letter_grade = self._calculate_letter_grade(obj_in.percentage)
        
        # Auto-set period and semester if not provided
        if obj_in.period_number is None or obj_in.semester is None:
            from src.db.models.academics.enrollment import Enrollment
            enrollment = self.db.query(Enrollment).filter(Enrollment.id == obj_in.enrollment_id).first()
            if enrollment:
                ay = academic_year_crud.get_by_id(self.db, self.tenant_id, enrollment.academic_year_id)
                settings_obj = tenant_settings_crud.get_by_tenant_id(self.db, self.tenant_id)
                config = settings_obj.settings.get("reporting", {}) if settings_obj else {}
                ctx = self._get_period_context(ay, obj_in.assessment_date, config)
                obj_in.period_number = ctx["number"]
                obj_in.semester = ctx["semester"]

        # Create the grade
        return await super().create(obj_in=obj_in)
    
    async def update_grade(self, id: UUID, score: float, max_score: float, comments: Optional[str] = None) -> Grade:
        """Update a grade's score and recalculate percentage and letter grade."""
        grade = await self.get(id=id)
        if not grade:
            raise EntityNotFoundError("Grade", id)
        
        # Validate score and max_score
        if score < 0 or max_score <= 0 or score > max_score:
            raise BusinessRuleViolationError(f"Invalid score ({score}) or max_score ({max_score})")
        
        # Calculate percentage
        percentage = (score / max_score) * 100
        
        # Determine letter grade
        letter_grade = self._calculate_letter_grade(percentage)
        
        # Update the grade
        update_data = {
            "score": score,
            "max_score": max_score,
            "percentage": percentage,
            "letter_grade": letter_grade,
            "graded_date": date.today()
        }
        
        if comments is not None:
            update_data["comments"] = comments
        
        return await self.update(id=id, obj_in=update_data)
    
    async def bulk_create_academic_grades(self, *, obj_in_list: List[GradeCreate]) -> List[Grade]:
        """Bulk create multiple grades with validation."""
        # Simple validation: ensure students and subjects exist
        # (In a large system we'd use set-based validation, but this is fine for class-size bulk)
        
        # Fetch config once for bulk mapping
        settings_obj = tenant_settings_crud.get_by_tenant_id(self.db, self.tenant_id)
        config = settings_obj.settings.get("reporting", {}) if settings_obj else {}
        
        # Cache for enrollment -> academic year
        enrollment_ay_cache = {}

        for obj_in in obj_in_list:
            if obj_in.score < 0 or obj_in.max_score <= 0 or obj_in.score > obj_in.max_score:
                raise BusinessRuleViolationError(f"Invalid score for student {obj_in.student_id}")
            
            if not obj_in.percentage:
                obj_in.percentage = (obj_in.score / obj_in.max_score) * 100
            if not obj_in.letter_grade:
                obj_in.letter_grade = self._calculate_letter_grade(obj_in.percentage)
            
            # Auto-set period and semester
            eid = obj_in.enrollment_id
            if eid not in enrollment_ay_cache:
                from src.db.models.academics.enrollment import Enrollment
                enrollment = self.db.query(Enrollment).filter(Enrollment.id == eid).first()
                ay = academic_year_crud.get_by_id(self.db, self.tenant_id, enrollment.academic_year_id) if enrollment else None
                enrollment_ay_cache[eid] = ay
            
            ay = enrollment_ay_cache[eid]
            if ay:
                ctx = self._get_period_context(ay, obj_in.assessment_date, config)
                obj_in.period_number = ctx["number"]
                obj_in.semester = ctx["semester"]
                
                # Check if obj_in has period_id/semester_id fields (as part of GradeCreate refactor)
                if hasattr(obj_in, 'period_id'):
                    obj_in.period_id = ctx["period_id"]
                if hasattr(obj_in, 'semester_id'):
                    obj_in.semester_id = ctx["semester_id"]

        grades = grade_crud.bulk_create_grades(self.db, tenant_id=self.tenant_id, obj_in_list=obj_in_list)
        
        # Sync with Submissions for assignments to ensure visibility on student dashboard/assignments list
        try:
            from src.db.models.academics.submission import Submission
            from src.db.crud.academics.submission import submission as submission_crud
            from datetime import datetime

            for grade in grades:
                if grade.assessment_type == GradeType.ASSIGNMENT:
                    # Check if submission already exists
                    existing_sub = submission_crud.get_by_assignment_and_student(
                        self.db, 
                        assignment_id=grade.assessment_id, 
                        student_id=grade.student_id, 
                        tenant_id=self.tenant_id
                    )
                    
                    if existing_sub:
                        # Update status and score
                        existing_sub.score = grade.score
                        existing_sub.status = "GRADED"
                        existing_sub.feedback = grade.comments
                        self.db.add(existing_sub)
                    else:
                        # Create a "pseudo-submission" so it shows up in the student list
                        new_sub = Submission(
                            tenant_id=self.tenant_id,
                            assignment_id=grade.assessment_id,
                            student_id=grade.student_id,
                            status="GRADED",
                            score=grade.score,
                            feedback=grade.comments,
                            submitted_at=datetime.utcnow(),
                            content="Automatically created via marks entry"
                        )
                        self.db.add(new_sub)
            
            self.db.commit()
        except Exception as e:
            print(f"Warning: Failed to sync submissions in bulk_create_academic_grades: {e}")
            self.db.rollback() # Rollback the sync attempt but don't fail the whole request
            
        return grades

    async def publish_grades(self, academic_year_id: UUID, grade_id: UUID, subject_id: UUID, period_number: int) -> int:
        """Bulk publish grades for a specific period/subject/class."""
        from src.db.models.academics.enrollment import Enrollment
        
        # Filter grades for students enrolled in this grade/year for this subject and period
        count = self.db.query(Grade).filter(
            Grade.tenant_id == self.tenant_id,
            Grade.subject_id == subject_id,
            Grade.period_number == period_number,
            Grade.enrollment_id.in_(
                self.db.query(Enrollment.id).filter(
                    Enrollment.tenant_id == self.tenant_id,
                    Enrollment.academic_year_id == academic_year_id,
                    Enrollment.grade_id == grade_id
                )
            )
        ).update({Grade.is_published: True}, synchronize_session=False)
        
        self.db.commit()
        return count
    
    async def calculate_subject_average(self, student_id: UUID, subject_id: UUID) -> Optional[float]:
        """Calculate the average percentage for a student in a subject."""
        return grade_crud.calculate_subject_average(
            self.db, tenant_id=self.tenant_id, student_id=student_id, subject_id=subject_id
        )
    
    async def calculate_weighted_average(self, student_id: UUID, subject_id: UUID, 
                                 weights: Dict[GradeType, float]) -> Optional[float]:
        """Calculate the weighted average percentage for a student in a subject."""
        return grade_crud.calculate_weighted_average(
            self.db, tenant_id=self.tenant_id, student_id=student_id, subject_id=subject_id, weights=weights
        )
    
    async def calculate_gpa(self, student_id: UUID, academic_year: str) -> Optional[float]:
        """Calculate the GPA for a student in a specific academic year."""
        # Get all subjects for the student in the academic year
        # For each subject, calculate the average grade
        # Calculate the GPA based on the average grades and subject credits
        # This is a simplified implementation
        
        # Get all grades for the student in the academic year
        grades = self.db.query(Grade).filter(
            Grade.tenant_id == self.tenant_id,
            Grade.student_id == student_id,
            # Filter by academic year using the enrollment
            Grade.enrollment.has(academic_year=academic_year)
        ).all()
        
        if not grades:
            return 0.0
        
        # Group grades by subject
        subject_grades = {}
        for grade in grades:
            if grade.subject_id not in subject_grades:
                subject_grades[grade.subject_id] = []
            subject_grades[grade.subject_id].append(grade)
        
        # Calculate average grade for each subject
        subject_averages = {}
        for subject_id, grades in subject_grades.items():
            total_percentage = sum(grade.percentage for grade in grades)
            subject_averages[subject_id] = total_percentage / len(grades)
        
        # Get subject credits
        subject_credits = {}
        for subject_id in subject_averages.keys():
            subject = subject_crud.get_by_id(self.db, tenant_id=self.tenant_id, id=subject_id)
            if subject:
                subject_credits[subject_id] = subject.credits
            else:
                subject_credits[subject_id] = 1  # Default to 1 credit if subject not found
        
        # Calculate GPA
        total_credits = sum(subject_credits.values())
        weighted_sum = sum(subject_averages[subject_id] * subject_credits[subject_id] for subject_id in subject_averages.keys())
        
        return weighted_sum / total_credits if total_credits > 0 else 0.0
    
    async def generate_report_card(self, student_id: UUID, academic_year: str) -> Dict[str, Any]:
        """Generate a report card for a student in a specific academic year."""
        # Get student details
        student = student_crud.get_by_id(self.db, tenant_id=self.tenant_id, id=student_id)
        if not student:
            raise EntityNotFoundError("Student", student_id)
        
        # Get Academic Year details first to resolve by ID if name is provided
        target_ay = academic_year_crud.get_by_name(self.db, self.tenant_id, academic_year)
        if not target_ay:
            # Try by ID if it looks like a versioned ID
            try:
                target_ay = academic_year_crud.get_by_id(self.db, self.tenant_id, UUID(academic_year))
            except:
                pass
        
        if not target_ay:
            raise EntityNotFoundError("AcademicYear", academic_year)

        # Get enrollment for specific academic year to get grade/section
        from src.db.models.academics.enrollment import Enrollment
        enrollment = self.db.query(Enrollment).filter(
            Enrollment.tenant_id == self.tenant_id,
            Enrollment.student_id == student_id,
            Enrollment.academic_year_id == target_ay.id
        ).first()

        if not enrollment:
            # Fallback: Try to find ANY active enrollment for this student to be helpful
            enrollment = self.db.query(Enrollment).filter(
                Enrollment.tenant_id == self.tenant_id,
                Enrollment.student_id == student_id,
                Enrollment.is_active == True
            ).order_by(Enrollment.created_at.desc()).first()
            
            if enrollment:
                # Update target_ay to match the actual enrollment found
                target_ay = academic_year_crud.get_by_id(self.db, self.tenant_id, enrollment.academic_year_id)
            else:
                raise BusinessRuleViolationError(f"Student {student.full_name} is not enrolled in any class for the selected academic year. Please enroll the student first.")

        academic_year_id = enrollment.academic_year_id if enrollment else None
        grade_id = enrollment.grade_id if enrollment else None
        
        ay = academic_year_crud.get_by_id(self.db, self.tenant_id, academic_year_id) if academic_year_id else None

        # Load Promotion Criteria for weighting
        criteria_service = PromotionCriteriaService(tenant=self.tenant_id, db=self.db)
        criteria = None
        if academic_year_id and grade_id:
            criteria = criteria_service.get_by_year_and_grade(
                academic_year_id=academic_year_id, grade_id=grade_id
            )
        
        weighting_schema = (criteria.weighting_schema if criteria else None) or {}
        aggregate_method = (criteria.aggregate_method if criteria else "average")
        
        # Get Reporting Configuration from database instead of settings if possible
        semesters = self.db.query(Semester).filter(Semester.academic_year_id == target_ay.id).order_by(Semester.semester_number).all()
        semester_ids = [s.id for s in semesters]
        
        # Get only PUBLISHED grades based on GLOBAL Period/Semester publication status
        query = self.db.query(Grade).join(Period, Grade.period_id == Period.id).options(
            joinedload(Grade.period_obj)
        ).filter(
            Grade.tenant_id == self.tenant_id,
            Grade.student_id == student_id,
            Period.is_published == True
        )
        
        if enrollment:
            query = query.filter(Grade.enrollment_id == enrollment.id)
        else:
            raise EntityNotFoundError("Enrollment", student_id)
            
        grades = query.all()
        
        # Determine active periods based on GLOBAL PUBLICATION
        published_periods = self.db.query(Period).filter(
            Period.semester_id.in_(semester_ids),
            Period.is_published == True
        ).order_by(Period.period_number).all()
        
        published_period_numbers = [p.period_number for p in published_periods]
        period_names = [p.name for p in published_periods] # Only names of published periods
        
        active_columns = []
        for s in semesters:
            s_periods = [p for p in published_periods if p.semester_id == s.id]
            for p in s_periods:
                active_columns.append(p.name)
            
            # Add semester average if all periods in this semester are published OR if the semester itself is published
            # Logic: If we have ANY published periods in a semester, we show them. 
            # If the WHOLE semester is marked as published, or if we have all expected periods published.
            expected_count = self.db.query(Period).filter(Period.semester_id == s.id).count()
            if len(s_periods) == expected_count and expected_count > 0:
                 active_columns.append(f"S{s.semester_number}")

        # Add Final column if all semesters are fully published
        all_periods_count = self.db.query(Period).join(Semester).filter(Semester.academic_year_id == target_ay.id).count()
        if len(published_periods) == all_periods_count and all_periods_count > 0:
            active_columns.append("Final")

        # Group grades by subject
        subject_data = {}
        for grade in grades:
            sid = grade.subject_id
            if not sid: continue
                
            if sid not in subject_data:
                subject = subject_crud.get_by_id(self.db, tenant_id=self.tenant_id, id=sid)
                subject_name = subject.name if subject else "Unknown Subject"
                subject_data[sid] = {
                    "subject_id": sid,
                    "subject_name": subject_name,
                    "grades_by_type": {},
                    "grades_by_period": {p: [] for p in period_names},
                    "average_score": 0.0,
                    "percentage": 0.0,
                    "letter_grade": "N/A"
                }
            
            gtype = str(grade.assessment_type)
            if gtype not in subject_data[sid]["grades_by_type"]:
                subject_data[sid]["grades_by_type"][gtype] = []
            subject_data[sid]["grades_by_type"][gtype].append(float(grade.percentage))

            # Track by period
            period_name = grade.period_obj.name if grade.period_obj else "Unknown"
            if period_name in subject_data[sid]["grades_by_period"]:
                subject_data[sid]["grades_by_period"][period_name].append(float(grade.percentage))

        # Attendance Integration
        att_service = AttendanceService(tenant=self.tenant_id, db=self.db)
        attendance_percentage = await att_service.get_student_attendance_percentage(
            student_id=student_id,
            start_date=ay.start_date if ay else None,
            end_date=ay.end_date if ay else None
        )

        # Process remarks (heuristic: longest comment per period)
        remarks = {}
        for grade in grades:
            if grade.comments:
                period = self._determine_period(ay, grade.assessment_date)
                if period not in remarks or len(grade.comments) > len(remarks[period]):
                    remarks[period] = grade.comments

        # Calculate aggregated scores
        for sid, data in subject_data.items():
            final_percentage = 0.0
            if aggregate_method == "weighted" and weighting_schema:
                total_weight = 0.0
                weighted_sum = 0.0
                for gtype, weight in weighting_schema.items():
                    weight = float(weight)
                    if gtype == "attendance":
                        weighted_sum += attendance_percentage * weight
                        total_weight += weight
                    elif gtype in data["grades_by_type"]:
                        type_avg = sum(data["grades_by_type"][gtype]) / len(data["grades_by_type"][gtype])
                        weighted_sum += type_avg * weight
                        total_weight += weight
                final_percentage = weighted_sum / total_weight if total_weight > 0 else 0.0
            else:
                all_vals = [v for types in data["grades_by_type"].values() for v in types]
                final_percentage = sum(all_vals) / len(all_vals) if all_vals else 0.0
            
            data["percentage"] = round(final_percentage, 2)
            data["letter_grade"] = self._calculate_letter_grade(data["percentage"])
            
            # Period and Semester averages
            data["period_grades"] = {
                p: (sum(gs) / len(gs) if gs else None) 
                for p, gs in data["grades_by_period"].items()
            }
            
            # Dynamic semester grades calculation
            semester_averages = {}
            for s in semesters:
                s_p_names = [p.name for p in s.periods if p.is_published]
                s_vals = [data["period_grades"].get(p_n) for p_n in s_p_names if data["period_grades"].get(p_n) is not None]
                avg = sum(s_vals) / len(s_vals) if s_vals else None
                semester_averages[f"S{s.semester_number}"] = avg
            
            data["semester_grades"] = semester_averages
            data["assessment_grades"] = []

        # Period-based Attendance Summary
        period_attendance = {p: {"absent": 0, "late": 0, "total": 0} for p in period_names}
        att_records = await att_service.get_student_attendance_range(
            student_id=student_id,
            start_date=ay.start_date if ay else None,
            end_date=ay.end_date if ay else None
        )
        for att in att_records:
            period = self._determine_period(ay, att.date)
            if period in period_attendance:
                period_attendance[period]["total"] += 1
                if att.status == "absent": period_attendance[period]["absent"] += 1
                elif att.status == "late": period_attendance[period]["late"] += 1

        gpa = float(await self.calculate_gpa(student_id, academic_year) or 0.0)
        
        # Construct response
        return {
            "student_id": student_id,
            "student_name": str(student.full_name),
            "admission_number": str(student.admission_number) if student.admission_number else "N/A",
            "academic_year": str(academic_year),
            "grade": str(enrollment.grade_name if enrollment else "N/A"),
            "section": str(enrollment.section_name if enrollment else "N/A"),
            "subjects": list(subject_data.values()),
            "attendance_percentage": round(attendance_percentage, 2),
            "period_attendance": period_attendance,
            "gpa": gpa,
            "generated_date": date.today().isoformat(),
            "active_columns": active_columns,
            "remarks": remarks,
            "signatures": {
                "class_teacher": None, # Placeholder for URL
                "academic_dean": None,
                "principal": None
            },
            "signatory_names": {
                "class_teacher": "Class Teacher",
                "academic_dean": "Academic Dean",
                "principal": "Principal"
            }
        }

    async def get_subject_performance_summary(
        self, 
        student_id: UUID, 
        subject_id: UUID, 
        academic_year_id: UUID,
        period_id: Optional[UUID] = None,
        semester_id: Optional[UUID] = None
    ) -> Dict[str, Any]:
        """Get a detailed summary of a student's performance in a specific subject."""
        # 1. Fetch Student and Subject
        student = student_crud.get_by_id(self.db, tenant_id=self.tenant_id, id=student_id)
        if not student:
            raise EntityNotFoundError("Student", student_id)
        subject = subject_crud.get_by_id(self.db, tenant_id=self.tenant_id, id=subject_id)
        if not subject:
            raise EntityNotFoundError("Subject", subject_id)

        # 2. Get Enrollment to determine Grade Level and Class (for attendance)
        from src.db.models.academics.enrollment import Enrollment
        from src.db.models.academics.class_model import Class
        from src.db.models.academics.class_subject import ClassSubject
        
        enrollment = self.db.query(Enrollment).filter(
            Enrollment.tenant_id == self.tenant_id,
            Enrollment.student_id == student_id,
            Enrollment.academic_year_id == academic_year_id
        ).first()

        if not enrollment:
            raise BusinessRuleViolationError(f"Student is not enrolled for the selected academic year.")

        # Fetch academic year to get its name for class lookup
        target_ay = academic_year_crud.get_by_id(self.db, self.tenant_id, academic_year_id)

        # Find the specific class for this subject/grade/section
        cls = self.db.query(Class).filter(
            Class.tenant_id == self.tenant_id,
            Class.grade_id == enrollment.grade_id,
            Class.section_id == enrollment.section_id,
            Class.academic_year_id == academic_year_id
        ).first()

        # 2. Get the grading schema for this subject within the class
        cls_subject = None
        if cls:
            cls_subject = self.db.query(ClassSubject).filter(
                ClassSubject.class_id == cls.id,
                ClassSubject.subject_id == subject_id
            ).first()

        # 3. Load Weighting Logic (Academic Year Wide Schema)
        use_dynamic_schema = False
        grading_schema = None
        
        from src.db.models.academics.grading_schema import GradingSchema
        
        # Look for a grading schema explicitly linked to this academic year (Active first)
        grading_schema = self.db.query(GradingSchema).filter(
            GradingSchema.tenant_id == self.tenant_id,
            GradingSchema.academic_year_id == academic_year_id,
            GradingSchema.is_active == True
        ).first()

        # Fallback 1: Any schema for this year
        if not grading_schema:
            grading_schema = self.db.query(GradingSchema).filter(
                GradingSchema.tenant_id == self.tenant_id,
                GradingSchema.academic_year_id == academic_year_id
            ).first()

        # Fallback 2: ClassSubject specific
        if not grading_schema and cls_subject and cls_subject.grading_schema_id:
            grading_schema = cls_subject.grading_schema
            
        # Fallback 3: Any active schema for tenant
        if not grading_schema:
            grading_schema = self.db.query(GradingSchema).filter(
                GradingSchema.tenant_id == self.tenant_id,
                GradingSchema.is_active == True
            ).first()

        if grading_schema:
            use_dynamic_schema = True

        weighting_schema = {}
        aggregate_method = "average"
        
        if use_dynamic_schema:
            aggregate_method = "weighted"
            for cat in grading_schema.categories:
                weighting_schema[str(cat.id)] = cat.weight / 100.0 # Convert to fraction
        else:
            criteria_service = PromotionCriteriaService(tenant=self.tenant_id, db=self.db)
            criteria = criteria_service.get_by_year_and_grade(
                academic_year_id=academic_year_id, grade_id=enrollment.grade_id
            )
            raw_schema = (criteria.weighting_schema if criteria else None) or {
                "assignment": 0.2,
                "quiz": 0.2,
                "test": 0.2,
                "exam": 0.4
            }
            # Ensure keys are consistently lowercase for matching
            weighting_schema = {str(k).lower(): v for k, v in raw_schema.items()}
            aggregate_method = (criteria.aggregate_method if criteria else "average")

        # 4. Fetch all grades
        from src.db.models.academics.grade import Grade
        query = self.db.query(Grade).filter(
            Grade.tenant_id == self.tenant_id,
            Grade.student_id == student_id,
            Grade.subject_id == subject_id,
            Grade.enrollment_id == enrollment.id if enrollment else None
        )
        
        if period_id:
            query = query.filter(Grade.period_id == period_id)
        if semester_id:
            query = query.filter(Grade.semester_id == semester_id)
            
        grades = query.all()

        # Group grades by type
        grades_by_type = {}
        for g in grades:
            gtype = str(g.assessment_type)
            if gtype not in grades_by_type:
                grades_by_type[gtype] = []
            grades_by_type[gtype].append({
                "id": str(g.id),
                "assessment_name": g.assessment_name,
                "score": g.score,
                "max_score": g.max_score,
                "percentage": g.percentage,
                "date": g.assessment_date.isoformat() if g.assessment_date else None
            })

        # 5. Calculate Attendance Percentage
        attendance_percentage = 100.0
        if cls:
            att_service = AttendanceService(tenant=self.tenant_id, db=self.db)
            summary = await att_service.get_attendance_summary(
                student_id=student_id,
                class_id=cls.id
            )
            attendance_percentage = summary.attendance_percentage

        # 6. Calculate Final Cumulative Grade
        final_percentage = 0.0
        details = []

        if aggregate_method == "weighted":
            total_weight = 0.0
            weighted_sum = 0.0
            
            if use_dynamic_schema:
                for cat in grading_schema.categories:
                    cat_name_upper = cat.name.upper()
                    cat_grades = [
                        g for g in grades 
                        if (g.grading_category_id and str(g.grading_category_id) == str(cat.id)) or 
                        (not g.grading_category_id and str(g.assessment_type).upper() == cat_name_upper)
                    ]
                    
                    if cat_grades:
                        total_score = sum(g.score for g in cat_grades)
                        total_max = sum(g.max_score for g in cat_grades)
                        if total_max > 0:
                            cat_weight = weighting_schema[str(cat.id)]
                            cat_score_percent = (total_score / total_max) * 100.0
                            weighted_sum += cat_score_percent * cat_weight
                            total_weight += cat_weight
                            details.append({
                                "type": cat.name, 
                                "weight": cat_weight * 100.0, 
                                "score": cat_score_percent,
                                "count": len(cat_grades)
                            })
            else:
                for gtype, weight in weighting_schema.items():
                    weight = float(weight)
                    gtype_lower = gtype.lower()
                    
                    if gtype_lower == "attendance":
                        weighted_sum += attendance_percentage * weight
                        total_weight += weight
                        details.append({"type": "attendance", "weight": weight, "score": attendance_percentage})
                    else:
                        found_type = None
                        for actual_type in grades_by_type.keys():
                            if actual_type.lower() == gtype_lower:
                                found_type = actual_type
                                break
                                
                        if found_type:
                            type_avg = sum(g["percentage"] for g in grades_by_type[found_type]) / len(grades_by_type[found_type])
                            weighted_sum += type_avg * weight
                            total_weight += weight
                            details.append({"type": gtype, "weight": weight, "score": type_avg})
            
            if total_weight > 0:
                final_percentage = weighted_sum / total_weight
            else:
                all_percentages = [g["percentage"] for types in grades_by_type.values() for g in types]
                final_percentage = sum(all_percentages) / len(all_percentages) if all_percentages else 0.0
        else:
            all_percentages = [g["percentage"] for types in grades_by_type.values() for g in types]
            final_percentage = sum(all_percentages) / len(all_percentages) if all_percentages else 0.0

        return {
            "student_id": str(student_id),
            "subject_id": str(subject_id),
            "subject_name": subject.name,
            "academic_year_id": str(academic_year_id),
            "cumulative_percentage": round(final_percentage, 2),
            "letter_grade": self._calculate_letter_grade(final_percentage),
            "attendance_percentage": round(attendance_percentage, 2),
            "breakdown": grades_by_type,
            "calculation_details": details,
            "weighting_schema": weighting_schema
        }

    async def get_student_academic_history(self, student_id: UUID) -> List[Dict[str, Any]]:
        """Get multi-year academic history for a student."""
        from src.db.models.academics.enrollment import Enrollment
        from src.db.models.academics.academic_year import AcademicYear
        
        enrollments = self.db.query(Enrollment).filter(
            Enrollment.student_id == student_id,
            Enrollment.tenant_id == self.tenant_id
        ).join(AcademicYear).order_by(AcademicYear.start_date.desc()).all()
        
        history = []
        for enrollment in enrollments:
            ay = enrollment.academic_year
            history.append({
                "academic_year_id": str(ay.id),
                "academic_year_name": ay.name,
                "grade_level": enrollment.grade.name if enrollment.grade else "Unknown",
                "enrollment_id": str(enrollment.id),
                "is_active": enrollment.is_active,
                "status": "COMPLETED" if not enrollment.is_active else "IN_PROGRESS"
            })
            
        return history

    def _calculate_letter_grade(self, percentage: float) -> str:
        """Calculate letter grade based on percentage."""
        if percentage >= 90:
            return "A"
        elif percentage >= 80:
            return "B"
        elif percentage >= 70:
            return "C"
        elif percentage >= 60:
            return "D"
        else:
            return "F"

    def _get_period_context(self, ay: Any, assessment_date: date, config: Dict[str, Any] = None) -> Dict[str, Any]:
        """Returns the period context: name, number, semester, and IDs from the database."""
        if not ay or not assessment_date:
            return {"name": "P1", "number": 1, "semester": 1, "period_id": None, "semester_id": None}
            
        # Try to find the semester from the database
        semester = self.db.query(Semester).filter(
            Semester.academic_year_id == ay.id,
            Semester.start_date <= assessment_date,
            Semester.end_date >= assessment_date
        ).first()
        
        # Fallback if dates don't align perfectly (e.g. edge cases)
        if not semester:
             semester = self.db.query(Semester).filter(
                Semester.academic_year_id == ay.id
            ).order_by(Semester.semester_number).first()
            
        if not semester:
            return {"name": "P1", "number": 1, "semester": 1, "period_id": None, "semester_id": None}

        # Try to find the period from the database
        period = self.db.query(Period).filter(
            Period.semester_id == semester.id,
            Period.start_date <= assessment_date,
            Period.end_date >= assessment_date
        ).first()

        # Fallback for period
        if not period:
            period = self.db.query(Period).filter(
                Period.semester_id == semester.id
            ).order_by(Period.period_number).first()

        if not period:
            return {
                "name": "P1", 
                "number": 1, 
                "semester": semester.semester_number, 
                "period_id": None, 
                "semester_id": semester.id
            }

        return {
            "name": period.name,
            "number": period.period_number,
            "semester": semester.semester_number,
            "period_id": period.id,
            "semester_id": semester.id
        }

    def _determine_period(self, ay: Any, assessment_date: date, config: Dict[str, Any] = None) -> str:
        """Determines the academic period (P1-P6/Dynamic) based on assessment date."""
        ctx = self._get_period_context(ay, assessment_date, config)
        return ctx["name"]

    async def sync_attendance_grades(self, academic_year_id: UUID) -> int:
        """
        Synchronizes attendance percentages into Grade records of type ATTENDANCE.
        This allows the Gradebook to show attendance scores consistently.
        """
        from src.db.models.academics.enrollment import Enrollment
        from src.db.models.academics.academic_year import AcademicYear
        
        # Get academic year details
        ay = self.db.query(AcademicYear).filter(
            AcademicYear.tenant_id == self.tenant_id,
            AcademicYear.id == academic_year_id
        ).first()
        if not ay:
            return 0
            
        # Get all enrollments for this year
        enrollments = self.db.query(Enrollment).filter(
            Enrollment.tenant_id == self.tenant_id,
            Enrollment.academic_year_id == academic_year_id
        ).all()
        
        att_service = AttendanceService(tenant=self.tenant_id, db=self.db)
        sync_count = 0
        
        for enrollment in enrollments:
            percentage = await att_service.get_student_attendance_percentage(
                student_id=enrollment.student_id,
                start_date=ay.start_date,
                end_date=ay.end_date
            )
            
            # Check for existing attendance grade
            existing_grade = self.db.query(Grade).filter(
                Grade.tenant_id == self.tenant_id,
                Grade.student_id == enrollment.student_id,
                Grade.enrollment_id == enrollment.id,
                Grade.assessment_type == "attendance",
                Grade.subject_id == None
            ).first()
            
            if existing_grade:
                existing_grade.score = percentage
                existing_grade.max_score = 100.0
                existing_grade.percentage = percentage
                existing_grade.assessment_date = date.today()
            else:
                new_grade = Grade(
                    tenant_id=self.tenant_id,
                    student_id=enrollment.student_id,
                    enrollment_id=enrollment.id,
                    subject_id=None,
                    assessment_type="attendance",
                    assessment_name="Cumulative Attendance",
                    assessment_date=date.today(),
                    score=percentage,
                    max_score=100.0,
                    percentage=percentage,
                    graded_date=date.today()
                )
                self.db.add(new_grade)
            
            sync_count += 1
            
        self.db.commit()
        return sync_count


class SuperAdminGradeCalculationService(SuperAdminBaseService[Grade, GradeCreate, GradeUpdate]):
    """Super-admin service for managing grades across all tenants."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(crud=grade_crud, model=Grade, *args, **kwargs)
    
    def get_all_grades(self, skip: int = 0, limit: int = 100,
                      student_id: Optional[UUID] = None,
                      subject_id: Optional[UUID] = None,
                      assessment_type: Optional[GradeType] = None,
                      tenant_id: Optional[UUID] = None) -> List[Grade]:
        """Get all grades across all tenants with filtering."""
        query = self.db.query(Grade)
        
        # Apply filters
        if student_id:
            query = query.filter(Grade.student_id == student_id)
        if subject_id:
            query = query.filter(Grade.subject_id == subject_id)
        if assessment_type:
            query = query.filter(Grade.assessment_type == assessment_type)
        if tenant_id:
            query = query.filter(Grade.tenant_id == tenant_id)
        
        # Apply pagination
        return query.offset(skip).limit(limit).all()

 
