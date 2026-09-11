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
        (holiday_list, attendance_date),
        as_dict=True
    )

    if holiday:
        return holiday[0]

    return None


@frappe.whitelist()
def get_employee_holidays():
    """
    Return all holidays from the Holiday List assigned to
    the logged-in employee.
    """

    user = frappe.session.user

    if not user or user == "Guest":
        frappe.throw("Please login first.")

    employee = frappe.db.get_value(
        "Employee",
        {
            "user_id": user,
            "status": "Active"
        },
        ["name", "employee_name", "company"],
        as_dict=True
    )

    if not employee:
        frappe.throw("Active Employee record not found for this user.")

    holiday_list = get_employee_holiday_list(
        employee.name
    )

    if not holiday_list:
        return {
            "holiday_list": None,
            "holidays": []
        }

    holidays = frappe.db.sql(
        """
        SELECT
            holiday_date,
            description
        FROM `tabHoliday`
        WHERE parent = %s
        ORDER BY holiday_date
        """,
        (holiday_list,),
        as_dict=True
    )

    for holiday in holidays:
        holiday["holiday_date"] = str(
            holiday["holiday_date"]
        )

    return {
        "holiday_list": holiday_list,
        "holidays": holidays
    }
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
            "holiday_description": holiday_description,
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
            "holiday_description": holiday_description,
            "message": (
                "Holiday Check Out successful. "
                "Holiday work has been recorded."
            )
        }

# =====================================================
# EMPLOYEE LEAVE BALANCE
# =====================================================

@frappe.whitelist()
def get_employee_leave_balance():

    user = frappe.session.user

    if user == "Guest":
        frappe.throw("Please login first.")

    employee = frappe.db.get_value(
        "Employee",
        {
            "user_id": user,
            "status": "Active"
        },
        ["name", "employee_name"],
        as_dict=True
    )

    if not employee:
        frappe.throw(
            "No active Employee is linked to this user."
        )

    allocations = frappe.get_all(
        "Leave Allocation",
        filters={
            "employee": employee.name,
            "docstatus": 1
        },
        fields=[
            "name",
            "leave_type",
            "new_leaves_allocated",
            "from_date",
            "to_date"
        ],
        order_by="leave_type asc",
        ignore_permissions=True
    )

    result = []

    for allocation in allocations:

        allocated = (
            allocation.new_leaves_allocated or 0
        )

        approved_leaves = frappe.get_all(
            "Leave Application",
            filters={
                "employee": employee.name,
                "leave_type": allocation.leave_type,
                "status": "Approved",
                "docstatus": 1,
                "from_date": [">=", allocation.from_date],
                "to_date": ["<=", allocation.to_date]
            },
            fields=[
                "total_leave_days",
                "half_day"
            ],
            ignore_permissions=True
        )

        used = 0

        for leave in approved_leaves:

            if leave.half_day:
                used += 0.5
            else:
                used += (
                    leave.total_leave_days or 0
                )

        available = allocated - used

        if available < 0:
            available = 0

        result.append({
            "leave_type": allocation.leave_type,
            "allocated": allocated,
            "used": used,
            "available": available
        })

    return {
        "employee": employee.name,
        "employee_name": employee.employee_name,
        "leave_balance": result
    }


# =====================================================
# EMPLOYEE LEAVE APPROVER
# =====================================================

@frappe.whitelist()
def get_employee_leave_approver():

    user = frappe.session.user

    if user == "Guest":
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
            "leave_approver"
        ],
        as_dict=True
    )

    if not employee:
        frappe.throw(
            "No active Employee is linked to this user."
        )

    if not employee.leave_approver:
        frappe.throw(
            "Leave Approver is not assigned to this employee."
        )

    return {
        "employee": employee.name,
        "employee_name": employee.employee_name,
        "leave_approver": employee.leave_approver
    }


# =====================================================
# EMPLOYEE SALARY SLIP + OVERTIME SLIP
# =====================================================

@frappe.whitelist()
def get_employee_salary_slip(year, month):

    # --------------------------------------------------
    # 1. CHECK LOGIN
    # --------------------------------------------------

    user = frappe.session.user

    if user == "Guest":
        frappe.throw(
            "Please login first."
        )


    # --------------------------------------------------
    # 2. VALIDATE YEAR AND MONTH
    # --------------------------------------------------

    if not year or not month:
        frappe.throw(
            "Year and Month are required."
        )

    try:

        year = int(year)
        month = int(month)

    except Exception:

        frappe.throw(
            "Invalid Year or Month."
        )

    if month < 1 or month > 12:

        frappe.throw(
            "Invalid Month."
        )


    # --------------------------------------------------
    # 3. FIND LOGGED-IN EMPLOYEE
    # --------------------------------------------------

    employee = frappe.db.get_value(
        "Employee",
        {
            "user_id": user,
            "status": "Active"
        },
        [
            "name",
            "employee_name",
            "company",
            "department"
        ],
        as_dict=True
    )

    if not employee:

        frappe.throw(
            "No active Employee is linked to this user."
        )

    employee_id = employee.name


    # --------------------------------------------------
    # 4. SELECTED MONTH DATE RANGE
    # --------------------------------------------------

    import calendar

    last_day = calendar.monthrange(
        year,
        month
    )[1]

    month_start = (
        f"{year:04d}-{month:02d}-01"
    )

    month_end = (
        f"{year:04d}-{month:02d}-{last_day:02d}"
    )


    # ==================================================
    # SALARY SLIP
    # ==================================================

    salary_slips = frappe.db.sql(
        """
        SELECT
            name,
            employee,
            employee_name,
            company,
            department,
            posting_date,
            status,
            currency,
            payroll_frequency,
            salary_structure,
            start_date,
            end_date,
            payroll_entry,
            gross_pay,
            total_deduction,
            net_pay,
            rounded_total,
            year_to_date,
            month_to_date,
            total_in_words
        FROM `tabSalary Slip`
        WHERE
            employee = %s
            AND docstatus = 1
            AND start_date <= %s
            AND end_date >= %s
        ORDER BY posting_date DESC
        LIMIT 1
        """,
        (
            employee_id,
            month_end,
            month_start
        ),
        as_dict=True
    )


    salary_slip_data = None


    if salary_slips:

        salary_slip = salary_slips[0]


        # --------------------------------------------------
        # EARNINGS
        # --------------------------------------------------

        earnings = frappe.db.sql(
            """
            SELECT
                salary_component,
                amount
            FROM `tabSalary Detail`
            WHERE
                parent = %s
                AND parenttype = 'Salary Slip'
                AND parentfield = 'earnings'
            ORDER BY idx ASC
            """,
            (salary_slip.name,),
            as_dict=True
        )


        # --------------------------------------------------
        # DEDUCTIONS
        # --------------------------------------------------

        deductions = frappe.db.sql(
            """
            SELECT
                salary_component,
                amount
            FROM `tabSalary Detail`
            WHERE
                parent = %s
                AND parenttype = 'Salary Slip'
                AND parentfield = 'deductions'
            ORDER BY idx ASC
            """,
            (salary_slip.name,),
            as_dict=True
        )


        salary_slip_data = {

            "name":
                salary_slip.name,

            "employee":
                salary_slip.employee,

            "employee_name":
                salary_slip.employee_name,

            "company":
                salary_slip.company,

            "department":
                salary_slip.department or "-",

            "posting_date":
                str(
                    salary_slip.posting_date
                )
                if salary_slip.posting_date
                else None,

            "status":
                salary_slip.status,

            "currency":
                salary_slip.currency or "INR",

            "payroll_frequency":
                salary_slip.payroll_frequency,

            "salary_structure":
                salary_slip.salary_structure,

            "start_date":
                str(
                    salary_slip.start_date
                )
                if salary_slip.start_date
                else None,

            "end_date":
                str(
                    salary_slip.end_date
                )
                if salary_slip.end_date
                else None,

            "payroll_entry":
                salary_slip.payroll_entry,

            "gross_pay":
                salary_slip.gross_pay or 0,

            "total_deduction":
                salary_slip.total_deduction or 0,

            "net_pay":
                salary_slip.net_pay or 0,

            "rounded_total":
                salary_slip.rounded_total or 0,

            "year_to_date":
                salary_slip.year_to_date or 0,

            "month_to_date":
                salary_slip.month_to_date or 0,

            "total_in_words":
                salary_slip.total_in_words,

            "earnings":
                earnings,

            "deductions":
                deductions
        }


    # ==================================================
    # OVERTIME SLIPS
    # ==================================================
     


    overtime_slips = frappe.db.sql(
        """
        SELECT
            name,
            posting_date,
            company,
            employee,
            employee_name,
            department,
            start_date,
            end_date,
            total_overtime_duration
        FROM `tabOvertime Slip`
        WHERE
            employee = %s
            AND docstatus = 1
            AND start_date <= %s
            AND end_date >= %s
        ORDER BY posting_date DESC
        LIMIT 20
        """,
        (
            employee_id,
            month_end,
            month_start
        ),
        as_dict=True
    )


    overtime_data = []


    # ==================================================
    # FIND ACTUAL OVERTIME DETAILS CHILD DOCTYPE
    # ==================================================

    overtime_details_field = frappe.db.sql(
        """
        SELECT
            options
        FROM `tabDocField`
        WHERE
            parent = 'Overtime Slip'
            AND fieldname = 'overtime_details'
            AND fieldtype = 'Table'
        LIMIT 1
        """,
        as_dict=True
    )


    overtime_detail_doctype = None


    if overtime_details_field:

        overtime_detail_doctype = (
            overtime_details_field[0].options
        )


    # ==================================================
    # PROCESS OVERTIME SLIPS
    # ==================================================

    for overtime_slip in overtime_slips:

        # --------------------------------------------------
        # Overtime Details
        # --------------------------------------------------

        overtime_details = []


        if overtime_detail_doctype:

            # Remove backticks if metadata somehow contains them
            safe_child_doctype = (
                overtime_detail_doctype
                .replace("`", "")
            )


            child_table = (
                f"`tab{safe_child_doctype}`"
            )


            overtime_details = frappe.db.sql(
                f"""
                SELECT
                    reference_document,
                    date,
                    overtime_type,
                    overtime_duration
                FROM {child_table}
                WHERE
                    parent = %s
                    AND parenttype = 'Overtime Slip'
                    AND parentfield = 'overtime_details'
                ORDER BY idx ASC
                """,
                (
                    overtime_slip.name,
                ),
                as_dict=True
            )


        # --------------------------------------------------
        # Additional Salary
        # --------------------------------------------------

        additional_salary = frappe.db.sql(
            """
            SELECT
                name,
                salary_component,
                amount,
                payroll_date
            FROM `tabAdditional Salary`
            WHERE
                employee = %s
                AND ref_doctype = 'Overtime Slip'
                AND ref_docname = %s
                AND docstatus = 1
            ORDER BY payroll_date DESC
            LIMIT 20
            """,
            (
                employee_id,
                overtime_slip.name
            ),
            as_dict=True
        )


        # --------------------------------------------------
        # Add Overtime Slip Result
        # --------------------------------------------------

        overtime_data.append({

            "name":
                overtime_slip.name,

            "posting_date":
                str(
                    overtime_slip.posting_date
                )
                if overtime_slip.posting_date
                else None,

            "company":
                overtime_slip.company,

            "employee":
                overtime_slip.employee,

            "employee_name":
                overtime_slip.employee_name,

            "department":
                overtime_slip.department or "-",

            "start_date":
                str(
                    overtime_slip.start_date
                )
                if overtime_slip.start_date
                else None,

            "end_date":
                str(
                    overtime_slip.end_date
                )
                if overtime_slip.end_date
                else None,

            "total_overtime_duration":
                overtime_slip.total_overtime_duration or 0,

            "details":
                overtime_details,

            "additional_salary":
                additional_salary
        })




    # ==================================================
    # RETURN RESULT
    # ==================================================

    return {

        "employee": {

            "id":
                employee.name,

            "name":
                employee.employee_name,

            "company":
                employee.company,

            "department":
                employee.department or "-"
        },

        "year":
            year,

        "month":
            month,

        "salary_slip":
            salary_slip_data,

        "overtime_slips":
            overtime_data
    }