import frappe
from frappe.utils import get_datetime, getdate


# =====================================================
# HOLIDAY HELPERS
# =====================================================

def get_employee_holiday_list(employee_id):
    """
    Get the Holiday List assigned to the employee.

    Priority:
    1. Employee Holiday List
    2. Company's Default Holiday List
    """

    employee_meta = frappe.get_meta("Employee")

    fields = ["company"]

    if employee_meta.has_field("holiday_list"):
        fields.append("holiday_list")

    employee = frappe.db.get_value(
        "Employee",
        employee_id,
        fields,
        as_dict=True
    )

    if not employee:
        return None

    # -------------------------------------------------
    # 1. Employee Holiday List
    # -------------------------------------------------

    holiday_list = None

    if employee_meta.has_field("holiday_list"):
        holiday_list = employee.get("holiday_list")

    if holiday_list:
        return holiday_list

    # -------------------------------------------------
    # 2. Company's Default Holiday List
    # -------------------------------------------------

    company = employee.get("company")

    if company:
        company_meta = frappe.get_meta("Company")

        if company_meta.has_field("default_holiday_list"):
            holiday_list = frappe.db.get_value(
                "Company",
                company,
                "default_holiday_list"
            )

    return holiday_list


def get_employee_holiday(employee_id, attendance_date):
    """
    Check whether the given date is a holiday
    according to the employee/company Holiday List.
    """

    holiday_list = get_employee_holiday_list(employee_id)

    if not holiday_list:
        return None

    attendance_date = getdate(attendance_date)

    holiday = frappe.db.sql(
        """
        SELECT
            holiday_date,
            description
        FROM `tabHoliday`
        WHERE
            parent = %s
            AND holiday_date = %s
        LIMIT 1
        """,
        (
            holiday_list,
            attendance_date
        ),
        as_dict=True
    )

    if holiday:
        return holiday[0]

    return None


# =====================================================
# GET EMPLOYEE HOLIDAYS
# =====================================================

@frappe.whitelist()
def get_employee_holidays():

    user = frappe.session.user

    if not user or user == "Guest":
        frappe.throw("Please login first.")

    employee = frappe.db.get_value(
        "Employee",
        {
            "user_id": user,
            "status": "Active"
        },
        [
            "name",
            "employee_name",
            "company"
        ],
        as_dict=True
    )

    if not employee:
        frappe.throw(
            "Active Employee record not found for this user."
        )

    # -------------------------------------------------
    # Get assigned Holiday List
    # -------------------------------------------------

    assignments = frappe.get_all(
        "Holiday List Assignment",
        filters={
            "assigned_to": employee.name,
            "docstatus": 1
        },
        fields=[
            "name",
            "holiday_list",
            "from_date"
        ],
        order_by="from_date desc"
    )

    holiday_dates = []

    # -------------------------------------------------
    # Read holidays from assigned Holiday Lists
    # -------------------------------------------------

    for assignment in assignments:

        if not assignment.holiday_list:
            continue

        holidays = frappe.get_all(
            "Holiday",
            filters={
                "parent": assignment.holiday_list
            },
            fields=[
                "holiday_date",
                "description"
            ],
            order_by="holiday_date asc"
        )

        for holiday in holidays:

            if not holiday.holiday_date:
                continue

            holiday_dates.append({
                "holiday_date": str(
                    holiday.holiday_date
                ),
                "description": (
                    holiday.description or ""
                ),
                "holiday_list": (
                    assignment.holiday_list
                )
            })

    return holiday_dates


# =====================================================
# NORMAL EMPLOYEE ATTENDANCE
# =====================================================

@frappe.whitelist()
def employee_attendance(
    action,
    attendance_date,
    attendance_time
):

    user = frappe.session.user

    if not user or user == "Guest":
        frappe.throw("Please login first.")

    # -------------------------------------------------
    # Get Employee
    # -------------------------------------------------

    employee = frappe.db.get_value(
        "Employee",
        {
            "user_id": user,
            "status": "Active"
        },
        [
            "name",
            "employee_name"
        ],
        as_dict=True
    )

    if not employee:
        frappe.throw(
            "Active Employee record not found for this user."
        )

    employee_id = employee.name

    # -------------------------------------------------
    # Validate action
    # -------------------------------------------------

    action = (action or "").upper().strip()

    if action not in ["IN", "OUT"]:
        frappe.throw(
            "Invalid attendance action."
        )

    # -------------------------------------------------
    # Validate date/time
    # -------------------------------------------------

    if not attendance_date:
        frappe.throw(
            "Attendance date is required."
        )

    if not attendance_time:
        frappe.throw(
            "Attendance time is required."
        )

    selected_date = getdate(
        attendance_date
    )

    attendance_datetime = get_datetime(
        f"{attendance_date} {attendance_time}"
    )

    # =================================================
    # HOLIDAY CHECK
    # =================================================

    holiday = get_employee_holiday(
        employee_id,
        selected_date
    )

    if holiday:

        description = (
            holiday.get("description")
            or "Company Holiday"
        )

        frappe.throw(
            f"{selected_date.strftime('%d-%m-%Y')} "
            f"is a holiday ({description}). "
            f"Please use 'Mark Attendance in Holiday'."
        )

    # =================================================
    # GET EXISTING CHECKINS
    # =================================================

    checkins = frappe.get_all(
        "Employee Checkin",
        filters={
            "employee": employee_id,
            "time": [
                "between",
                [
                    f"{selected_date} 00:00:00",
                    f"{selected_date} 23:59:59"
                ]
            ]
        },
        fields=[
            "name",
            "log_type",
            "time"
        ],
        order_by="time asc",
        ignore_permissions=True
    )

    # =================================================
    # NORMAL CHECK IN
    # =================================================

    if action == "IN":

        if checkins:
            frappe.throw(
                "Attendance already exists for this date."
            )

        checkin = frappe.get_doc({
            "doctype": "Employee Checkin",
            "employee": employee_id,
            "time": attendance_datetime,
            "log_type": "IN"
        })

        checkin.insert(
            ignore_permissions=True
        )

        frappe.db.commit()

        return {
            "success": True,
            "message": "Check In successful."
        }

    # =================================================
    # NORMAL CHECK OUT
    # =================================================

    if action == "OUT":

        if not checkins:
            frappe.throw(
                "Please Check In before Check Out."
            )

        in_records = [
            record
            for record in checkins
            if record.log_type == "IN"
        ]

        out_records = [
            record
            for record in checkins
            if record.log_type == "OUT"
        ]

        if not in_records:
            frappe.throw(
                "No Check In found for this date."
            )

        if out_records:
            frappe.throw(
                "Check Out already exists for this date."
            )

        last_in = in_records[-1]

        if attendance_datetime <= get_datetime(
            last_in.time
        ):
            frappe.throw(
                "Check Out time must be after Check In time."
            )

        checkin = frappe.get_doc({
            "doctype": "Employee Checkin",
            "employee": employee_id,
            "time": attendance_datetime,
            "log_type": "OUT"
        })

        checkin.insert(
            ignore_permissions=True
        )

        frappe.db.commit()

        return {
            "success": True,
            "message": "Check Out successful."
        }


# =====================================================
# HOLIDAY ATTENDANCE
# =====================================================

@frappe.whitelist()
def employee_holiday_attendance(
    action,
    attendance_date,
    attendance_time
):

    user = frappe.session.user

    if not user or user == "Guest":
        frappe.throw("Please login first.")

    # -------------------------------------------------
    # Get Employee
    # -------------------------------------------------

    employee = frappe.db.get_value(
        "Employee",
        {
            "user_id": user,
            "status": "Active"
        },
        [
            "name",
            "employee_name"
        ],
        as_dict=True
    )

    if not employee:
        frappe.throw(
            "Active Employee record not found for this user."
        )

    employee_id = employee.name

    # -------------------------------------------------
    # Validate action
    # -------------------------------------------------

    action = (action or "").upper().strip()

    if action not in ["IN", "OUT"]:
        frappe.throw(
            "Invalid holiday attendance action."
        )

    # -------------------------------------------------
    # Validate date/time
    # -------------------------------------------------

    if not attendance_date:
        frappe.throw(
            "Holiday date is required."
        )

    if not attendance_time:
        frappe.throw(
            "Holiday attendance time is required."
        )

    selected_date = getdate(
        attendance_date
    )

    attendance_datetime = get_datetime(
        f"{attendance_date} {attendance_time}"
    )

    # =================================================
    # CONFIRM IT IS ACTUALLY A COMPANY HOLIDAY
    # =================================================

    holiday = get_employee_holiday(
        employee_id,
        selected_date
    )

    if not holiday:

        frappe.throw(
            f"{selected_date.strftime('%d-%m-%Y')} "
            "is not a company holiday. "
            "Use normal Check In / Check Out."
        )

    holiday_description = (
        holiday.get("description")
        or "Company Holiday"
    )

    # =================================================
    # GET EXISTING CHECKINS
    # =================================================

    checkins = frappe.get_all(
        "Employee Checkin",
        filters={
            "employee": employee_id,
            "time": [
                "between",
                [
                    f"{selected_date} 00:00:00",
                    f"{selected_date} 23:59:59"
                ]
            ]
        },
        fields=[
            "name",
            "log_type",
            "time"
        ],
        order_by="time asc",
        ignore_permissions=True
    )

    # =================================================
    # HOLIDAY CHECK IN
    # =================================================

    if action == "IN":

        if checkins:
            frappe.throw(
                "Attendance already exists for this holiday."
            )

        checkin_values = {
            "doctype": "Employee Checkin",
            "employee": employee_id,
            "time": attendance_datetime,
            "log_type": "IN"
        }

        # Keep holiday attendance out of normal
        # automatic attendance processing when supported.

        checkin_meta = frappe.get_meta(
            "Employee Checkin"
        )

        if checkin_meta.has_field(
            "skip_auto_attendance"
        ):
            checkin_values[
                "skip_auto_attendance"
            ] = 1

        checkin = frappe.get_doc(
            checkin_values
        )

        checkin.insert(
            ignore_permissions=True
        )

        frappe.db.commit()

        return {
            "success": True,
            "attendance_type": "Holiday Overtime",
            "holiday": True,
            "holiday_description": (
                holiday_description
            ),
            "message": (
                "Holiday Check In successful. "
                "This attendance is recorded as holiday work."
            )
        }

    # =================================================
    # HOLIDAY CHECK OUT
    # =================================================

    if action == "OUT":

        if not checkins:
            frappe.throw(
                "Please mark Holiday Check In first."
            )

        in_records = [
            record
            for record in checkins
            if record.log_type == "IN"
        ]

        out_records = [
            record
            for record in checkins
            if record.log_type == "OUT"
        ]

        if not in_records:
            frappe.throw(
                "No Holiday Check In found for this date."
            )

        if out_records:
            frappe.throw(
                "Holiday Check Out already exists for this date."
            )

        last_in = in_records[-1]
        if attendance_datetime <= get_datetime(
            last_in.time
        ):
            frappe.throw(
                "Holiday Check Out time must be after "
                "Holiday Check In time."
            )

        # =================================================
        # CHECK MAXIMUM HOLIDAY OVERTIME
        # =================================================

        maximum_overtime_hours = frappe.db.get_value(
            "Employee",
            employee_id,
            "custom_maximum_overtime_hours_per_day"
        )

        if maximum_overtime_hours is not None:
            maximum_overtime_hours = float(
                maximum_overtime_hours
            )

        # If Employee maximum is empty, use Overtime Type
        if not maximum_overtime_hours:
            maximum_overtime_hours = 0

            # Get the employee's assigned shift for this date
            shift_assignment = frappe.db.get_value(
                "Shift Assignment",
                {
                    "employee": employee_id,
                    "start_date": ["<=", selected_date],
                    "end_date": [">=", selected_date]
                },
                "shift_type",
                order_by="start_date desc"
            )

            if shift_assignment:
                overtime_type = frappe.db.get_value(
                    "Shift Type",
                    shift_assignment,
                    "overtime_type"
                )

                if overtime_type:
                    maximum_overtime_hours = (
                        frappe.db.get_value(
                            "Overtime Type",
                            overtime_type,
                            "maximum_overtime_hours_allowed"
                        )
                        or 0
                    )

                    maximum_overtime_hours = float(
                        maximum_overtime_hours
                    )

        # Calculate holiday work duration
        holiday_work_seconds = (
            get_datetime(attendance_datetime)
            - get_datetime(last_in.time)
        ).total_seconds()

        holiday_work_hours = (
            holiday_work_seconds / 3600
        )

        # Reject checkout if maximum is exceeded
        if (
            maximum_overtime_hours > 0
            and holiday_work_hours
            > maximum_overtime_hours
        ):

            frappe.throw(
            f"Holiday overtime limit exceeded. "
            f"Recorded duration: {holiday_work_hours:.2f} hours. "
            f"Holiday overtime limit is {maximum_overtime_hours:g} hours. "
            "Please choose a checkout time within your allowed time."
        )

        checkin_values = {
            "doctype": "Employee Checkin",
            "employee": employee_id,
            "time": attendance_datetime,
            "log_type": "OUT"
        }

        checkin_meta = frappe.get_meta(
            "Employee Checkin"
        )

        if checkin_meta.has_field(
            "skip_auto_attendance"
        ):
            checkin_values[
                "skip_auto_attendance"
            ] = 1

        checkin = frappe.get_doc(
            checkin_values
        )

        checkin.insert(
            ignore_permissions=True
        )

        frappe.db.commit()

        return {
            "success": True,
            "attendance_type": "Holiday Overtime",
            "holiday": True,
            "holiday_description": (
                holiday_description
            ),
            "message": (
                "Holiday Check Out successful. "
                "Holiday work has been recorded."
            )
        }

# =====================================================
# GET HOLIDAY ATTENDANCE STATUS
# =====================================================

@frappe.whitelist()
def get_holiday_attendance_status(
    attendance_date
):

    employee_id = frappe.db.get_value(
        "Employee",
        {
            "user_id": frappe.session.user,
            "status": "Active"
        },
        "name"
    )

    if not employee_id:

        frappe.throw(
            "No active Employee found for the logged-in user."
        )

    checkins = frappe.get_all(
        "Employee Checkin",
        filters={
            "employee": employee_id,
            "time": [
                "between",
                [
                    f"{attendance_date} 00:00:00",
                    f"{attendance_date} 23:59:59"
                ]
            ]
        },
        fields=[
            "name",
            "time",
            "log_type"
        ],
        order_by="time asc"
    )

    if not checkins:

        return {
            "status": "NOT_CHECKED_IN",
            "message": "Holiday check-in not started."
        }

    has_in = any(
        checkin.log_type == "IN"
        for checkin in checkins
    )

    has_out = any(
        checkin.log_type == "OUT"
        for checkin in checkins
    )

    if has_in and has_out:

        return {
            "status": "COMPLETED",
            "message": "Holiday attendance completed."
        }

    if has_in:

        return {
            "status": "CHECKED_IN",
            "message": "Holiday check-in already exists."
        }

    return {
        "status": "NOT_CHECKED_IN",
        "message": "Holiday check-in not started."
    }    