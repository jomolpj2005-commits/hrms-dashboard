import frappe
from frappe.utils import flt, get_datetime, getdate

from hrms.hr.doctype.attendance.attendance import Attendance


class CustomAttendance(Attendance):

    def validate(self):
        super().validate()

        self.calculate_monthly_cooloff()

    def calculate_monthly_cooloff(self):
        """
        Monthly Cool-Off Rule

        Employee has a monthly cool-off allowance stored in:
            Employee.custom_monthly_cooloff_hours

        Daily cool-off is calculated from BOTH:

            Late Coming
            +
            Early Going

        Example for a 09:00 - 18:00 shift:

            IN  10:00, OUT 18:00
            Late = 1 hour
            Early = 0
            Daily Cool-Off = 1 hour

            IN  09:00, OUT 17:00
            Late = 0
            Early = 1 hour
            Daily Cool-Off = 1 hour

            IN  10:00, OUT 17:00
            Late = 1 hour
            Early = 1 hour
            Daily Cool-Off = 2 hours

        Monthly rule:

            Previous monthly cool-off >= employee allowance
            AND
            today's cool-off > 0

            => Current Attendance becomes Half Day.

        The current day's cool-off is included in
        Monthly Cool-Off Used, but the current day is
        not allowed to make itself Half Day merely because
        today's total crossed the limit.
        """

        # ---------------------------------------------------------
        # Basic checks
        # ---------------------------------------------------------

        if not self.employee or not self.attendance_date:
            return

        # ---------------------------------------------------------
        # Get employee monthly cool-off allowance
        # ---------------------------------------------------------

        monthly_limit = flt(
            frappe.db.get_value(
                "Employee",
                self.employee,
                "custom_monthly_cooloff_hours",
            )
        )

        # No allowance configured
        if monthly_limit <= 0:
            self.custom_late_hours = 0
            self.custom_monthly_cooloff_used = 0
            self.custom_cooloff_over_limit = 0
            return

        # ---------------------------------------------------------
        # Get Shift Type
        # ---------------------------------------------------------

        shift_name = self.shift

        if not shift_name:
            shift_name = self.get_employee_shift_type()

        # No shift available
        if not shift_name:
            previous_used = self.get_previous_monthly_cooloff()

            self.custom_late_hours = 0
            self.custom_monthly_cooloff_used = previous_used
            self.custom_cooloff_over_limit = max(
                previous_used - monthly_limit,
                0,
            )

            return

        # ---------------------------------------------------------
        # Get Shift Start and End
        # ---------------------------------------------------------

        shift_settings = frappe.db.get_value(
            "Shift Type",
            shift_name,
            [
                "start_time",
                "end_time",
            ],
            as_dict=True,
        )

        if not shift_settings:
            return

        shift_start = shift_settings.start_time
        shift_end = shift_settings.end_time

        if not shift_start or not shift_end:
            return

        # ---------------------------------------------------------
        # Need both IN and OUT to calculate daily cool-off
        # ---------------------------------------------------------

        if not self.in_time or not self.out_time:

            previous_used = self.get_previous_monthly_cooloff()

            self.custom_late_hours = 0
            self.custom_monthly_cooloff_used = previous_used
            self.custom_cooloff_over_limit = max(
                previous_used - monthly_limit,
                0,
            )

            return

        # ---------------------------------------------------------
        # Build Shift Start / End datetime
        # ---------------------------------------------------------

        attendance_date = getdate(self.attendance_date)

        shift_start_datetime = get_datetime(
            f"{attendance_date} {shift_start}"
        )

        shift_end_datetime = get_datetime(
            f"{attendance_date} {shift_end}"
        )

        in_datetime = get_datetime(self.in_time)
        out_datetime = get_datetime(self.out_time)

        # ---------------------------------------------------------
        # Handle overnight shift
        #
        # Example:
        # 22:00 -> 06:00
        #
        # In this case the end time belongs to the next day.
        # ---------------------------------------------------------

        if shift_end_datetime <= shift_start_datetime:
            shift_end_datetime = shift_end_datetime.replace(
                day=shift_end_datetime.day
            )

            # Add one day to shift end
            from datetime import timedelta

            shift_end_datetime = shift_end_datetime + timedelta(days=1)

            # If OUT is after midnight but shift end is next day,
            # convert the OUT time correctly.
            if out_datetime < shift_start_datetime:
                out_datetime = out_datetime + timedelta(days=1)

        # ---------------------------------------------------------
        # Calculate Late Coming
        # ---------------------------------------------------------

        late_seconds = (
            in_datetime - shift_start_datetime
        ).total_seconds()

        if late_seconds <= 0:
            late_hours = 0
        else:
            late_hours = late_seconds / 3600

        # ---------------------------------------------------------
        # Calculate Early Going
        # ---------------------------------------------------------

        early_seconds = (
            shift_end_datetime - out_datetime
        ).total_seconds()

        if early_seconds <= 0:
            early_hours = 0
        else:
            early_hours = early_seconds / 3600

        # ---------------------------------------------------------
        # Total daily cool-off
        #
        # IMPORTANT:
        # This is NOT only late coming.
        #
        # It is:
        #
        # Late Coming + Early Going
        # ---------------------------------------------------------

        today_cooloff_hours = round(
            late_hours + early_hours,
            4,
        )

        # ---------------------------------------------------------
        # Get previous monthly cool-off
        #
        # Current Attendance is excluded.
        # ---------------------------------------------------------

        previous_used = self.get_previous_monthly_cooloff()

        # ---------------------------------------------------------
        # Calculate monthly total including today's cool-off
        # ---------------------------------------------------------

        monthly_used = round(
            previous_used + today_cooloff_hours,
            4,
        )

        # ---------------------------------------------------------
        # Calculate excess
        # ---------------------------------------------------------

        excess_hours = max(
            monthly_used - monthly_limit,
            0,
        )

        # ---------------------------------------------------------
        # Set Attendance custom fields
        #
        # custom_late_hours is kept as your existing fieldname,
        # but its value now means:
        #
        # Late Coming + Early Going
        # ---------------------------------------------------------

        self.custom_late_hours = today_cooloff_hours

        self.custom_monthly_cooloff_used = monthly_used

        self.custom_cooloff_over_limit = round(
            excess_hours,
            4,
        )

        # ---------------------------------------------------------
        # Half Day Rule
        #
        # IMPORTANT:
        #
        # We check PREVIOUS usage, not today's total.
        #
        # Example:
        #
        # Allowance = 4h
        #
        # Previous days = 4h
        # Today = 5 minutes
        #
        # Previous usage already exhausted allowance.
        # Therefore today's late/early occurrence
        # becomes Half Day.
        #
        # But if:
        #
        # Previous = 3h
        # Today = 2h
        #
        # Today crosses the limit.
        # We do NOT make today Half Day.
        # ---------------------------------------------------------

        if (
            today_cooloff_hours > 0
            and monthly_used > monthly_limit
        ):
            self.status = "Half Day"


    def get_previous_monthly_cooloff(self):
        """
        Return the total daily cool-off from previous Attendance
        records in the same calendar month.

        custom_late_hours contains:

            Late Coming + Early Going

        Current Attendance is excluded so editing/saving the
        Attendance does not double-count itself.
        """

        attendance_date = getdate(self.attendance_date)

        # First day of current month
        month_start = attendance_date.replace(
            day=1
        )

        # First day of next month
        if month_start.month == 12:
            next_month = month_start.replace(
                year=month_start.year + 1,
                month=1,
                day=1,
            )
        else:
            next_month = month_start.replace(
                month=month_start.month + 1,
                day=1,
            )

        filters = {
            "employee": self.employee,
            "attendance_date": [
                "between",
                [
                    month_start,
                    next_month,
                ],
            ],
        }

        # Exclude current Attendance
        if self.name:
            filters["name"] = [
                "!=",
                self.name,
            ]

        previous_records = frappe.get_all(
            "Attendance",
            filters=filters,
            fields=[
                "name",
                "custom_late_hours",
            ],
            order_by="attendance_date asc",
        )

        total = 0

        for record in previous_records:
            total += flt(
                record.custom_late_hours
            )

        return round(total, 4)

    def get_employee_shift_type(self):
        """
        Find the employee's Shift Assignment for the
        Attendance date.

        Shift Assignment has priority.

        If no valid Shift Assignment exists,
        Employee.default_shift is used.
        """

        attendance_date = getdate(
            self.attendance_date
        )

        assignment = frappe.get_all(
            "Shift Assignment",
            filters={
                "employee": self.employee,
                "start_date": [
                    "<=",
                    attendance_date,
                ],
                "end_date": [
                    ">=",
                    attendance_date,
                ],
                "docstatus": 1,
            },
            fields=[
                "shift_type",
                "start_date",
            ],
            order_by="start_date desc",
            limit=1,
        )

        if assignment:
            return assignment[0].shift_type

        # Fall back to Employee Default Shift
        return frappe.db.get_value(
            "Employee",
            self.employee,
            "default_shift",
        )
