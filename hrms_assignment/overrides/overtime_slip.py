import frappe
from frappe import _
from datetime import timedelta

from hrms.hr.doctype.overtime_slip.overtime_slip import (
    OvertimeSlip,
)


class CustomOvertimeSlip(OvertimeSlip):

    # =====================================================
    # EMPLOYEE OVERTIME LIMIT
    # =====================================================

    def get_employee_overtime_limit(self):
        """
        Get Maximum Overtime Hours Per Day from Employee.

        If the field is empty or 0, return None.
        """

        if not self.employee:
            return None

        employee_limit = frappe.db.get_value(
            "Employee",
            self.employee,
            "custom_maximum_overtime_hours_per_day",
        )

        if employee_limit is not None:
            employee_limit = float(employee_limit)

            if employee_limit > 0:
                return employee_limit

        return None

    # =====================================================
    # OVERTIME TYPE LIMIT
    # =====================================================

    def get_overtime_type_limit(self, overtime_type):
        """
        Get Maximum Overtime Hours Allowed Per Day
        from Overtime Type.
        """

        if not overtime_type:
            return None

        overtime_type_limit = frappe.db.get_value(
            "Overtime Type",
            overtime_type,
            "maximum_overtime_hours_allowed",
        )

        if overtime_type_limit is not None:
            overtime_type_limit = float(
                overtime_type_limit
            )

            if overtime_type_limit > 0:
                return overtime_type_limit

        return None

    # =====================================================
    # HOLIDAY OVERTIME LIMIT
    # =====================================================

    def get_holiday_overtime_limit(self, overtime_type):
        """
        Holiday rule:

        1. Employee Maximum Overtime Hours Per Day
        2. If empty, Overtime Type Maximum Overtime
           Hours Allowed Per Day
        """

        employee_limit = (
            self.get_employee_overtime_limit()
        )

        if employee_limit is not None:
            return employee_limit

        return self.get_overtime_type_limit(
            overtime_type
        )

    # =====================================================
    # HOLIDAY LIST
    # =====================================================

    def get_employee_holiday_list(self):

        if not self.employee:
            return None

        employee_holiday_list = frappe.db.get_value(
            "Employee",
            self.employee,
            "holiday_list",
        )

        if employee_holiday_list:
            return employee_holiday_list

        company = frappe.db.get_value(
            "Employee",
            self.employee,
            "company",
        )

        if not company:
            return None

        company_holiday_list = frappe.db.get_value(
            "Company",
            company,
            "default_holiday_list",
        )

        if company_holiday_list:
            return company_holiday_list

        return None

    # =====================================================
    # GET SHIFT TYPE
    # =====================================================

    def get_shift_type_for_date(
        self,
        attendance_date,
        attendance_shift=None,
    ):

        if attendance_shift:

            if frappe.db.exists(
                "Shift Type",
                attendance_shift,
            ):
                return attendance_shift

        assignment = frappe.db.get_value(
            "Shift Assignment",
            {
                "employee": self.employee,
                "start_date": ("<=", attendance_date),
                "end_date": (">=", attendance_date),
            },
            "shift_type",
            order_by="start_date desc",
        )

        if assignment:
            return assignment

        return None

    # =====================================================
    # GET SHIFT SETTINGS
    # =====================================================

    def get_shift_settings(
        self,
        attendance_date,
        attendance_shift=None,
    ):

        shift_type = self.get_shift_type_for_date(
            attendance_date,
            attendance_shift,
        )

        if not shift_type:
            return None

        shift = frappe.db.get_value(
            "Shift Type",
            shift_type,
            [
                "name",
                "start_time",
                "end_time",
                "begin_check_in_before_shift_start_time",
                "allow_check_out_after_shift_end_time",
                "holiday_list",
                "allow_overtime",
                "overtime_type",
            ],
            as_dict=True,
        )

        return shift

    # =====================================================
    # GET STANDARD SHIFT HOURS
    # =====================================================

    def get_standard_working_hours(
        self,
        attendance_date,
        attendance_shift=None,
    ):
        """
        Calculate standard working hours directly from
        the assigned Shift Type.

        Example:

        09:00 -> 18:00 = 9 hours
        09:00 -> 17:00 = 8 hours

        This is used whenever Attendance contains
        standard_working_hours = 0 or empty.
        """

        shift = self.get_shift_settings(
            attendance_date,
            attendance_shift,
        )

        if not shift:
            return 0.0

        if not shift.start_time or not shift.end_time:
            return 0.0

        start_seconds = (
            shift.start_time.total_seconds()
        )

        end_seconds = (
            shift.end_time.total_seconds()
        )

        standard_hours = (
            end_seconds - start_seconds
        ) / 3600

        # Handle overnight shifts.
        if standard_hours < 0:
            standard_hours += 24

        return round(
            standard_hours,
            2,
        )

    # =====================================================
    # CHECK HOLIDAY
    # =====================================================

    def is_holiday(
        self,
        attendance_date,
        holiday_list=None,
    ):

        if not holiday_list:
            holiday_list = (
                self.get_employee_holiday_list()
            )

        if not holiday_list:
            return False

        holiday_exists = frappe.db.exists(
            "Holiday",
            {
                "parent": holiday_list,
                "holiday_date": attendance_date,
            },
        )

        return bool(holiday_exists)

    # =====================================================
    # GET CHECK-IN RECORDS
    # =====================================================

    def get_checkins_for_date(
        self,
        attendance_date,
    ):

        records = frappe.get_all(
            "Employee Checkin",
            filters={
                "employee": self.employee,
                "time": [
                    "between",
                    [
                        f"{attendance_date} 00:00:00",
                        f"{attendance_date} 23:59:59",
                    ],
                ],
            },
            fields=[
                "name",
                "employee",
                "time",
                "log_type",
                "shift",
                "shift_start",
                "shift_end",
                "attendance",
            ],
            order_by="time asc",
        )

        return records

    # =====================================================
    # GET FIRST CHECK-IN / LAST CHECK-OUT
    # =====================================================

    def get_first_and_last_checkin(
        self,
        attendance_date,
    ):

        records = self.get_checkins_for_date(
            attendance_date
        )

        if not records:
            return None, None, None, None

        first_checkin = None
        first_checkin_name = None
        last_checkout = None
        shift_name = None

        for record in records:
            if record.shift and not shift_name:
                shift_name = record.shift

        for record in records:
            if record.log_type == "IN":
                first_checkin = record.time
                first_checkin_name = record.name
                break

        if not first_checkin:
            first_checkin = records[0].time
            first_checkin_name = records[0].name

        for record in reversed(records):
            if record.log_type == "OUT":
                last_checkout = record.time
                break

        if not last_checkout and len(records) > 1:
            last_checkout = records[-1].time

        return (
            first_checkin,
            last_checkout,
            shift_name,
            first_checkin_name,
        )

    # =====================================================
    # GET ATTENDANCE REFERENCE
    # =====================================================

    def get_attendance_reference(
        self,
        attendance_date,
        shift_name=None,
        overtime_type=None,
    ):
        """
        Return a real submitted Attendance document name.

        Overtime Details.reference_document expects
        an Attendance document, NOT an Employee Checkin.

        For normal days, Attendance should already exist.

        For holiday overtime where only Employee Checkins
        exist, create a submitted Attendance record.
        """

        # -------------------------------------------------
        # 1. Check existing submitted Attendance
        # -------------------------------------------------

        existing_attendance = frappe.db.get_value(
            "Attendance",
            {
                "employee": self.employee,
                "attendance_date": attendance_date,
                "docstatus": 1,
            },
            "name",
        )

        if existing_attendance:
            return existing_attendance

        # -------------------------------------------------
        # 2. Get checkins
        # -------------------------------------------------

        (
            first_checkin,
            last_checkout,
            detected_shift,
            first_checkin_name,
        ) = self.get_first_and_last_checkin(
            attendance_date
        )

        if not first_checkin or not last_checkout:
            return None

        # -------------------------------------------------
        # 3. Determine shift
        # -------------------------------------------------

        if not shift_name:
            shift_name = detected_shift

        shift = self.get_shift_settings(
            attendance_date,
            shift_name,
        )

        if shift:
            shift_name = shift.name

        # -------------------------------------------------
        # 4. Calculate actual working hours
        # -------------------------------------------------

        first_datetime = frappe.utils.get_datetime(
            first_checkin
        )

        last_datetime = frappe.utils.get_datetime(
            last_checkout
        )

        working_seconds = (
            last_datetime - first_datetime
        ).total_seconds()

        working_hours = round(
            working_seconds / 3600,
            2,
        )

        # -------------------------------------------------
        # 5. Determine standard working hours
        # -------------------------------------------------

        standard_working_hours = (
            self.get_standard_working_hours(
                attendance_date,
                shift_name,
            )
        )

        # -------------------------------------------------
        # 6. Create Attendance
        # -------------------------------------------------

        attendance = frappe.new_doc(
            "Attendance"
        )

        attendance.employee = self.employee
        attendance.attendance_date = attendance_date
        attendance.status = "Present"

        if shift_name:
            attendance.shift = shift_name

        attendance.in_time = first_datetime
        attendance.out_time = last_datetime
        attendance.working_hours = working_hours

        if overtime_type:
            attendance.overtime_type = overtime_type

        attendance.standard_working_hours = (
            standard_working_hours
        )

        # -------------------------------------------------
        # Holiday overtime
        # -------------------------------------------------

        holiday_list = None

        if shift:
            holiday_list = shift.holiday_list

        if self.is_holiday(
            attendance_date,
            holiday_list,
        ):

            attendance.actual_overtime_duration = (
                working_hours
            )

        else:

            if (
                standard_working_hours > 0
                and working_hours > standard_working_hours
            ):

                attendance.actual_overtime_duration = round(
                    working_hours
                    - standard_working_hours,
                    2,
                )

            else:

                attendance.actual_overtime_duration = 0

        # -------------------------------------------------
        # Save + submit Attendance
        # -------------------------------------------------

        attendance.insert(
            ignore_permissions=True
        )

        attendance.submit()

        # -------------------------------------------------
        # Link Employee Checkins to Attendance
        # -------------------------------------------------

        checkins = frappe.get_all(
            "Employee Checkin",
            filters={
                "employee": self.employee,
                "time": [
                    "between",
                    [
                        f"{attendance_date} 00:00:00",
                        f"{attendance_date} 23:59:59",
                    ],
                ],
            },
            pluck="name",
        )

        if checkins:

            frappe.db.set_value(
                "Employee Checkin",
                checkins,
                "attendance",
                attendance.name,
            )

        return attendance.name

    # =====================================================
    # CALCULATE NORMAL DAY OVERTIME
    # =====================================================

    def calculate_normal_day_overtime(
        self,
        attendance_date,
        attendance_shift=None,
    ):

        shift = self.get_shift_settings(
            attendance_date,
            attendance_shift,
        )

        if not shift:
            return 0.0

        if not shift.start_time or not shift.end_time:
            return 0.0

        if not shift.allow_overtime:
            return 0.0

        (
            first_checkin,
            last_checkout,
            shift_name,
            first_checkin_name,
        ) = self.get_first_and_last_checkin(
            attendance_date
        )

        if not first_checkin or not last_checkout:
            return 0.0

        shift_start = frappe.utils.get_datetime(
            f"{attendance_date} {shift.start_time}"
        )

        shift_end = frappe.utils.get_datetime(
            f"{attendance_date} {shift.end_time}"
        )

        first_checkin = frappe.utils.get_datetime(
            first_checkin
        )

        last_checkout = frappe.utils.get_datetime(
            last_checkout
        )

        begin_before = float(
            shift.begin_check_in_before_shift_start_time
            or 0
        )

        allowed_early_start = (
            shift_start
            - timedelta(minutes=begin_before)
        )

        allow_after = float(
            shift.allow_check_out_after_shift_end_time
            or 0
        )

        allowed_late_end = (
            shift_end
            + timedelta(minutes=allow_after)
        )

        early_ot_hours = 0.0

        if first_checkin < shift_start:

            early_start = max(
                first_checkin,
                allowed_early_start,
            )

            early_seconds = (
                shift_start - early_start
            ).total_seconds()

            early_ot_hours = (
                early_seconds / 3600
            )

        late_ot_hours = 0.0

        if last_checkout > shift_end:

            late_end = min(
                last_checkout,
                allowed_late_end,
            )

            late_seconds = (
                late_end - shift_end
            ).total_seconds()

            late_ot_hours = (
                late_seconds / 3600
            )

        total_ot = (
            early_ot_hours
            + late_ot_hours
        )

        return round(
            total_ot,
            2,
        )

    # =====================================================
    # CALCULATE HOLIDAY OVERTIME
    # =====================================================

    def calculate_holiday_overtime(
        self,
        attendance_date,
        attendance_shift=None,
        overtime_type=None,
    ):
        """
        Holiday OT = complete time between first IN
        and last OUT.
        """

        (
            first_checkin,
            last_checkout,
            shift_name,
            first_checkin_name,
        ) = self.get_first_and_last_checkin(
            attendance_date
        )

        if not first_checkin or not last_checkout:
            return 0.0

        first_checkin = frappe.utils.get_datetime(
            first_checkin
        )

        last_checkout = frappe.utils.get_datetime(
            last_checkout
        )

        overtime_duration = (
            last_checkout - first_checkin
        )

        overtime_hours = (
            overtime_duration.total_seconds()
            / 3600
        )

        overtime_hours = round(
            overtime_hours,
            2,
        )

        maximum_hours = (
            self.get_holiday_overtime_limit(
                overtime_type
            )
        )

        if (
            maximum_hours is not None
            and overtime_hours > maximum_hours
        ):

            frappe.throw(
                _(
                    "Maximum allowed overtime for employee "
                    "{0} on holiday {1} is {2} hours. "
                    "Actual overtime is {3} hours."
                ).format(
                    self.employee,
                    attendance_date,
                    maximum_hours,
                    overtime_hours,
                )
            )

        return overtime_hours

    # =====================================================
    # GET EFFECTIVE OVERTIME LIMIT
    # =====================================================

    def get_effective_overtime_limit(
        self,
        overtime_type,
        attendance_date=None,
    ):

        if not attendance_date:

            employee_limit = (
                self.get_employee_overtime_limit()
            )

            if employee_limit is not None:
                return employee_limit

            return self.get_overtime_type_limit(
                overtime_type
            )

        shift = self.get_shift_settings(
            attendance_date
        )

        holiday_list = None

        if shift:
            holiday_list = shift.holiday_list

        if self.is_holiday(
            attendance_date,
            holiday_list,
        ):

            return self.get_holiday_overtime_limit(
                overtime_type
            )

        if shift:

            begin_before = float(
                shift.begin_check_in_before_shift_start_time
                or 0
            )

            allow_after = float(
                shift.allow_check_out_after_shift_end_time
                or 0
            )

            maximum_normal_minutes = (
                begin_before + allow_after
            )

            if maximum_normal_minutes > 0:

                return round(
                    maximum_normal_minutes / 60,
                    2,
                )

        return None

    # =====================================================
    # VALIDATE OVERTIME DATE AND DURATION
    # =====================================================

    def validate_overtime_date_and_duration(
        self,
    ):

        dates = set()

        for detail in self.overtime_details:

            if detail.date in dates:

                frappe.throw(
                    _(
                        "Date {0} is repeated in "
                        "Overtime Details"
                    ).format(
                        detail.date
                    )
                )

            dates.add(detail.date)

            if not detail.overtime_duration:
                continue

            entered_hours = float(
                detail.overtime_duration
            )

            shift = self.get_shift_settings(
                detail.date
            )

            holiday_list = None

            if shift:
                holiday_list = shift.holiday_list

            holiday = self.is_holiday(
                detail.date,
                holiday_list,
            )

            overtime_type = detail.overtime_type

            if not overtime_type and shift:
                overtime_type = shift.overtime_type

            if holiday:

                maximum_hours = (
                    self.get_holiday_overtime_limit(
                        overtime_type
                    )
                )

                if (
                    maximum_hours is not None
                    and entered_hours > maximum_hours
                ):

                    frappe.throw(
                        _(
                            "Maximum allowed overtime for "
                            "employee {0} on holiday {1} "
                            "is {2} hours. Entered overtime "
                            "is {3} hours."
                        ).format(
                            self.employee,
                            detail.date,
                            maximum_hours,
                            entered_hours,
                        )
                    )

                continue

            maximum_hours = (
                self.get_effective_overtime_limit(
                    overtime_type,
                    detail.date,
                )
            )

            if (
                maximum_hours is not None
                and entered_hours > maximum_hours
            ):

                frappe.throw(
                    _(
                        "Maximum allowed overtime on "
                        "normal working day {0} is {1} "
                        "hours. Entered overtime is {2} "
                        "hours."
                    ).format(
                        detail.date,
                        maximum_hours,
                        entered_hours,
                    )
                )

    # =====================================================
    # GET ATTENDANCE RECORDS
    # =====================================================

    def get_attendance_records(self):

        records = []

        if not self.start_date or not self.end_date:
            return records

        start_date = frappe.utils.getdate(
            self.start_date
        )

        end_date = frappe.utils.getdate(
            self.end_date
        )

        # -------------------------------------------------
        # NORMAL / EXISTING ATTENDANCE
        # -------------------------------------------------

        attendance_records = frappe.get_all(
            "Attendance",
            fields=[
                "name",
                "employee",
                "attendance_date",
                "status",
                "shift",
                "overtime_type",
                "actual_overtime_duration",
                "standard_working_hours",
            ],
            filters={
                "employee": self.employee,
                "docstatus": 1,
                "attendance_date": (
                    "between",
                    [
                        start_date,
                        end_date,
                    ],
                ),
                "status": "Present",
            },
            order_by="attendance_date asc",
        )

        for attendance in attendance_records:

            attendance_date = (
                attendance.attendance_date
            )

            shift = self.get_shift_settings(
                attendance_date,
                attendance.shift,
            )

            holiday_list = None

            if shift:
                holiday_list = shift.holiday_list

            holiday = self.is_holiday(
                attendance_date,
                holiday_list,
            )

            overtime_type = (
                attendance.overtime_type
            )

            if not overtime_type and shift:
                overtime_type = shift.overtime_type

            if not overtime_type:
                continue

            # -------------------------------------------------
            # ALWAYS repair zero standard hours in memory.
            #
            # This is important for both normal days and
            # holidays.
            # -------------------------------------------------

            standard_working_hours = float(
                attendance.standard_working_hours or 0
            )

            if standard_working_hours <= 0:

                standard_working_hours = (
                    self.get_standard_working_hours(
                        attendance_date,
                        attendance.shift,
                    )
                )

            if holiday:

                overtime_duration = (
                    self.calculate_holiday_overtime(
                        attendance_date,
                        attendance.shift,
                        overtime_type,
                    )
                )

                if overtime_duration <= 0:

                    overtime_duration = float(
                        attendance.actual_overtime_duration
                        or 0
                    )

                    maximum_hours = (
                        self.get_holiday_overtime_limit(
                            overtime_type
                        )
                    )

                    if (
                        maximum_hours is not None
                        and overtime_duration > maximum_hours
                    ):

                        frappe.throw(
                            _(
                                "Maximum allowed overtime for "
                                "employee {0} on holiday {1} "
                                "is {2} hours. Attendance "
                                "overtime is {3} hours."
                            ).format(
                                self.employee,
                                attendance_date,
                                maximum_hours,
                                overtime_duration,
                            )
                        )

            else:

                overtime_duration = (
                    self.calculate_normal_day_overtime(
                        attendance_date,
                        attendance.shift,
                    )
                )

                if overtime_duration <= 0:

                    overtime_duration = float(
                        attendance.actual_overtime_duration
                        or 0
                    )

                    maximum_hours = (
                        self.get_effective_overtime_limit(
                            overtime_type,
                            attendance_date,
                        )
                    )

                    if (
                        maximum_hours is not None
                        and overtime_duration > maximum_hours
                    ):

                        frappe.throw(
                            _(
                                "Maximum allowed overtime on "
                                "normal working day {0} is {1} "
                                "hours. Overtime for {2} is {3} "
                                "hours."
                            ).format(
                                attendance_date,
                                maximum_hours,
                                self.employee,
                                overtime_duration,
                            )
                        )

            if overtime_duration > 0:

                records.append(
                    frappe._dict(
                        {
                            "name": attendance.name,
                            "attendance_date": (
                                attendance_date
                            ),
                            "overtime_type": (
                                overtime_type
                            ),
                            "actual_overtime_duration": (
                                overtime_duration
                            ),
                            "standard_working_hours": (
                                standard_working_hours
                            ),
                            "source": "Attendance",
                        }
                    )
                )

        # -------------------------------------------------
        # HOLIDAY CHECKINS WITHOUT ATTENDANCE
        # -------------------------------------------------

        employee_holiday_list = (
            self.get_employee_holiday_list()
        )

        if employee_holiday_list:

            holiday_dates = frappe.get_all(
                "Holiday",
                filters={
                    "parent": employee_holiday_list,
                    "holiday_date": (
                        "between",
                        [
                            start_date,
                            end_date,
                        ],
                    ),
                },
                fields=[
                    "holiday_date",
                    "description",
                ],
                order_by="holiday_date asc",
            )

            for holiday_record in holiday_dates:

                holiday_date = (
                    holiday_record.holiday_date
                )

                already_added = False

                for existing_record in records:

                    if (
                        str(
                            existing_record.attendance_date
                        )
                        == str(holiday_date)
                    ):

                        already_added = True
                        break

                if already_added:
                    continue

                (
                    first_checkin,
                    last_checkout,
                    shift_name,
                    first_checkin_name,
                ) = self.get_first_and_last_checkin(
                    holiday_date
                )

                if (
                    not first_checkin
                    or not last_checkout
                ):
                    continue

                # -------------------------------------------------
                # Get shift
                # -------------------------------------------------

                shift = self.get_shift_settings(
                    holiday_date,
                    shift_name,
                )

                overtime_type = None

                if shift:
                    overtime_type = (
                        shift.overtime_type
                    )

                # -------------------------------------------------
                # If Shift Type did not provide Overtime Type,
                # try existing Attendance.
                # -------------------------------------------------

                if not overtime_type:

                    holiday_attendance = frappe.db.get_value(
                        "Attendance",
                        {
                            "employee": self.employee,
                            "attendance_date": holiday_date,
                            "docstatus": 1,
                        },
                        "overtime_type",
                    )

                    if holiday_attendance:
                        overtime_type = (
                            holiday_attendance
                        )

                if not overtime_type:
                    continue

                # -------------------------------------------------
                # Calculate holiday overtime
                # -------------------------------------------------

                overtime_duration = (
                    self.calculate_holiday_overtime(
                        holiday_date,
                        shift_name,
                        overtime_type,
                    )
                )

                if overtime_duration <= 0:
                    continue

                # -------------------------------------------------
                # Make sure Attendance exists
                # -------------------------------------------------

                attendance_name = (
                    self.get_attendance_reference(
                        holiday_date,
                        shift_name,
                        overtime_type,
                    )
                )

                if not attendance_name:
                    continue

                # -------------------------------------------------
                # Get standard working hours
                # -------------------------------------------------

                standard_working_hours = (
                    self.get_standard_working_hours(
                        holiday_date,
                        shift_name,
                    )
                )

                records.append(
                    frappe._dict(
                        {
                            "name": attendance_name,
                            "attendance_date": (
                                holiday_date
                            ),
                            "overtime_type": (
                                overtime_type
                            ),
                            "actual_overtime_duration": (
                                overtime_duration
                            ),
                            "standard_working_hours": (
                                standard_working_hours
                            ),
                            "source": (
                                "Holiday Employee Checkin"
                            ),
                        }
                    )
                )

        # -------------------------------------------------
        # NO RECORDS
        # -------------------------------------------------

        if not records:

            frappe.throw(
                _(
                    "No overtime attendance records found "
                    "for employee {0} between {1} and {2}."
                ).format(
                    self.employee,
                    self.start_date,
                    self.end_date,
                )
            )

        records.sort(
            key=lambda record: str(
                record.attendance_date
            )
        )

        return records

    # =====================================================
    # CREATE OVERTIME DETAILS
    # =====================================================

    def create_overtime_details_row_for_attendance(
        self,
        records,
    ):

        self.overtime_details = []

        for record in records:

            overtime_duration = float(
                record.actual_overtime_duration
                or 0
            )

            if overtime_duration <= 0:
                continue

            shift = self.get_shift_settings(
                record.attendance_date
            )

            holiday_list = None

            if shift:
                holiday_list = shift.holiday_list

            holiday = self.is_holiday(
                record.attendance_date,
                holiday_list,
            )

            overtime_type = record.overtime_type

            if not overtime_type and shift:
                overtime_type = shift.overtime_type

            maximum_hours = (
                self.get_effective_overtime_limit(
                    overtime_type,
                    record.attendance_date,
                )
            )

            if (
                maximum_hours is not None
                and overtime_duration > maximum_hours
            ):

                if holiday:

                    frappe.throw(
                        _(
                            "Maximum allowed overtime for "
                            "employee {0} on holiday {1} "
                            "is {2} hours. Actual overtime "
                            "is {3} hours."
                        ).format(
                            self.employee,
                            record.attendance_date,
                            maximum_hours,
                            overtime_duration,
                        )
                    )

                else:

                    frappe.throw(
                        _(
                            "Maximum allowed overtime on "
                            "normal working day {0} is {1} "
                            "hours. Actual overtime is "
                            "{2} hours."
                        ).format(
                            record.attendance_date,
                            maximum_hours,
                            overtime_duration,
                        )
                    )

            # -------------------------------------------------
            # IMPORTANT FIX:
            #
            # Never allow 0 standard working hours to reach
            # HRMS Salary Component Based calculation.
            # -------------------------------------------------

            standard_working_hours = float(
                record.standard_working_hours or 0
            )

            if standard_working_hours <= 0:

                standard_working_hours = (
                    self.get_standard_working_hours(
                        record.attendance_date,
                        shift.name if shift else None,
                    )
                )

            if standard_working_hours <= 0:

                frappe.throw(
                    _(
                        "Could not determine standard working "
                        "hours for employee {0} on {1}. "
                        "Please check the assigned Shift Type."
                    ).format(
                        self.employee,
                        record.attendance_date,
                    )
                )

            self.append(
                "overtime_details",
                {
                    # IMPORTANT:
                    # record.name is always Attendance.
                    "reference_document": record.name,
                    "date": record.attendance_date,
                    "overtime_type": overtime_type,
                    "overtime_duration": (
                        overtime_duration
                    ),
                    "standard_working_hours": (
                        standard_working_hours
                    ),
                },
            )


     # =====================================================
    # CALCULATE OVERTIME COMPONENT AMOUNTS
    # =====================================================

    def get_overtime_component_amounts(self):
        """
        Permanently protect HRMS Salary Component Based
        overtime calculation from zero standard working hours.

        HRMS divides the applicable daily amount by
        standard_working_hours.

        If an Overtime Detail has 0 or empty standard
        working hours, calculate it from the employee's
        assigned Shift Type before calling the standard
        HRMS calculation.
        """

        if not self.overtime_details:
            return {}

        # -------------------------------------------------
        # Repair missing standard working hours
        # -------------------------------------------------

        for detail in self.overtime_details:

            standard_working_hours = float(
                detail.standard_working_hours or 0
            )

            if standard_working_hours <= 0:

                shift = self.get_shift_settings(
                    detail.date
                )

                standard_working_hours = (
                    self.get_standard_working_hours(
                        detail.date,
                        shift.name if shift else None,
                    )
                )

                if standard_working_hours <= 0:

                    frappe.throw(
                        _(
                            "Could not determine standard "
                            "working hours for employee {0} "
                            "on {1}. Please check the assigned "
                            "Shift Type."
                        ).format(
                            self.employee,
                            detail.date,
                        )
                    )

                # Fix the child row in memory
                detail.standard_working_hours = (
                    standard_working_hours
                )

        # -------------------------------------------------
        # Call standard HRMS calculation
        # -------------------------------------------------

        return super().get_overtime_component_amounts()           