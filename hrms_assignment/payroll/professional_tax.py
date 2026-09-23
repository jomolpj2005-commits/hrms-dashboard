import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, add_months

from hrms.payroll.doctype.salary_slip.salary_slip import SalarySlip


class CustomSalarySlip(SalarySlip):
    """
    Custom Salary Slip.

    Features:
    1. Correct payment-days calculation for earnings.
    2. Correct balancing calculation for formula-based
       components such as Other Allowance.
    3. Professional Tax based on the employee's
       six-month PT cycle.
    4. PT Cycle 1:
           October -> March
    5. PT Cycle 2:
           April -> September
    6. PT changes dynamically when salary/gross changes.
    """

    # =========================================================
    # SALARY STRUCTURE EARNINGS
    # =========================================================

    def add_structure_components(self, component_type):
        """
        Calculate salary structure earnings using the actual
        payment days.

        Formula-based components such as Other Allowance are
        recalculated from the Salary Structure itself.
        """

        if component_type != "earnings":
            return super().add_structure_components(component_type)

        total_working_days = cint(self.total_working_days)
        actual_payment_days = flt(self.payment_days)

        if not total_working_days:
            return super().add_structure_components(component_type)

        # -----------------------------------------------------
        # First calculate structure using full working days.
        #
        # This allows ERPNext to evaluate formulas such as:
        #
        # Basic = base * 0.50
        # HRA = base * 0.35
        # Other Allowance = base - (B + HRA + CA)
        # -----------------------------------------------------

        self.payment_days = total_working_days

        try:
            super().add_structure_components(component_type)
        finally:
            self.payment_days = actual_payment_days

        # -----------------------------------------------------
        # Now apply payment-day calculation to components
        # which have Depends on Payment Days enabled.
        # -----------------------------------------------------

        if not self.earnings:
            return

        for row in self.earnings:
            if not cint(row.depends_on_payment_days):
                continue

            row.amount, row.additional_amount = (
                self.get_amount_based_on_payment_days(row)
            )

        # -----------------------------------------------------
        # Recalculate formula-based balancing components.
        # -----------------------------------------------------

        self._calculate_balancing_formula_components(
            actual_payment_days,
            total_working_days,
        )

    # =========================================================
    # BALANCING FORMULA
    # =========================================================

    def _calculate_balancing_formula_components(
        self,
        actual_payment_days,
        total_working_days,
    ):
        """
        Recalculate formula-based components which do NOT
        depend directly on payment days.

        Example:

            Base = 20,000
            Payment Days = 13
            Working Days = 25

            Prorated Base:
                20,000 * 13 / 25 = 10,400

            Basic:
                10,400 * 50% = 5,200

            HRA:
                10,400 * 35% = 3,640

            Conveyance:
                2,000 * 13 / 25 = 1,040

            Other Allowance:
                10,400 - 5,200 - 3,640 - 1,040
                = 520
        """

        if not self.earnings:
            return

        if not total_working_days:
            return

        # -----------------------------------------------------
        # Find the active Salary Structure Assignment.
        # -----------------------------------------------------

        assignment = self._get_salary_structure_assignment()

        if not assignment:
            return

        base = flt(assignment.base)

        if not base:
            return

        # -----------------------------------------------------
        # Get the Salary Structure.
        # -----------------------------------------------------

        salary_structure = frappe.get_doc(
            "Salary Structure",
            assignment.salary_structure,
        )

        # -----------------------------------------------------
        # Calculate prorated base.
        # -----------------------------------------------------

        prorated_base = flt(
            base
            * flt(actual_payment_days)
            / flt(total_working_days),
            2,
        )

        # -----------------------------------------------------
        # Prepare formula evaluation data.
        # -----------------------------------------------------

        data = getattr(self, "data", None)

        if data is None:
            data = {}

        old_base = data.get("base")

        data["base"] = prorated_base

        try:
            # -------------------------------------------------
            # Read formula directly from Salary Structure.
            # -------------------------------------------------

            for structure_row in salary_structure.earnings:

                if not structure_row.amount_based_on_formula:
                    continue

                if structure_row.depends_on_payment_days:
                    continue

                if not structure_row.formula:
                    continue

                # Find corresponding Salary Slip row.
                salary_row = None

                for row in self.earnings:
                    if (
                        row.salary_component
                        == structure_row.salary_component
                    ):
                        salary_row = row
                        break

                if not salary_row:
                    continue

                # -------------------------------------------------
                # Make sure formula variables use current
                # calculated salary values.
                # -------------------------------------------------

                for row in self.earnings:
                    if row.abbr:
                        data[row.abbr] = flt(row.amount)

                # -------------------------------------------------
                # Evaluate original Salary Structure formula.
                # -------------------------------------------------

                amount = self.eval_condition_and_formula(
                    structure_row,
                    data,
                )

                if amount is None:
                    continue

                amount = flt(
                    amount,
                    salary_row.precision("amount"),
                )

                salary_row.amount = amount
                salary_row.default_amount = amount
                salary_row.additional_amount = 0

                if salary_row.abbr:
                    data[salary_row.abbr] = amount

        finally:
            if old_base is not None:
                data["base"] = old_base
            else:
                data.pop("base", None)

    # =========================================================
    # SALARY STRUCTURE ASSIGNMENT
    # =========================================================

    def _get_salary_structure_assignment(self):
        """
        Find the submitted Salary Structure Assignment applicable
        to this Salary Slip.

        The latest assignment whose from_date is on or before
        the Salary Slip end date is selected.
        """

        assignments = frappe.get_all(
            "Salary Structure Assignment",
            filters={
                "employee": self.employee,
                "docstatus": 1,
                "from_date": ["<=", self.end_date],
            },
            fields=[
                "name",
                "salary_structure",
                "base",
                "from_date",
                "company",
            ],
            order_by="from_date desc",
        )

        if not assignments:
            return None

        return frappe.get_doc(
            "Salary Structure Assignment",
            assignments[0].name,
        )

    # =========================================================
    # PROFESSIONAL TAX ROW
    # =========================================================

    def add_structure_component(
        self,
        struct_row,
        component_type,
    ):
        """
        Always keep Professional Tax in the deduction table,
        even when the calculated amount is zero.
        """

        if (
            component_type == "deductions"
            and struct_row.salary_component
            == "Professional Tax"
        ):
            existing_row = None

            for row in self.deductions:
                if row.salary_component == "Professional Tax":
                    existing_row = row
                    break

            if not existing_row:
                existing_row = self.append("deductions")

            existing_row.salary_component = "Professional Tax"
            existing_row.amount = 0
            existing_row.default_amount = 0
            existing_row.additional_amount = 0

            return

        return super().add_structure_component(
            struct_row,
            component_type,
        )

    # =========================================================
    # PROFESSIONAL TAX
    # =========================================================

    def apply_regional_deductions(self):
        """
        Calculate Professional Tax dynamically using the
        employee's six-month PT cycle.

        PT is NOT calculated from only the current month's
        gross salary.

        The calculation considers:

        1. Current PT cycle.
        2. Gross salary already available in the cycle.
        3. Current Salary Slip gross.
        4. Expected/projected gross for remaining months
           based on the current salary level.
        5. PT already deducted in the cycle.

        This allows PT to change dynamically when salary changes.
        """

        super().apply_regional_deductions()

        # -----------------------------------------------------
        # Find Professional Tax row.
        # -----------------------------------------------------

        pt_row = None

        for row in self.deductions:
            if row.salary_component == "Professional Tax":
                pt_row = row
                break

        if not pt_row:
            return

        # -----------------------------------------------------
        # Current Salary Slip date.
        # -----------------------------------------------------

        slip_date = getdate(
            self.start_date
            or self.end_date
        )

        # -----------------------------------------------------
        # Find the PT cycle.
        # -----------------------------------------------------

        cycle_start, cycle_end = self.get_pt_cycle(
            slip_date
        )

        # -----------------------------------------------------
        # Current Salary Slip gross.
        # -----------------------------------------------------

        current_gross = flt(self.gross_pay)

        # -----------------------------------------------------
        # Calculate gross already available in the cycle.
        #
        # Current Salary Slip is excluded because current_gross
        # will be added separately.
        # -----------------------------------------------------

        previous_cycle_gross = self.get_previous_cycle_gross(
            cycle_start,
            cycle_end,
        )

        # -----------------------------------------------------
        # Calculate number of months from current month
        # through the end of the PT cycle.
        # -----------------------------------------------------

        remaining_months = self.get_remaining_months(
            slip_date,
            cycle_end,
        )

        if remaining_months <= 0:
            remaining_months = 1

        # -----------------------------------------------------
        # Project the complete PT cycle.
        #
        # Current month:
        #     Use the ACTUAL Salary Slip gross because the
        #     current month may have partial payment days.
        #
        # Future months:
        #     Use the full-month BASE from the Salary Structure
        #     Assignment applicable to each future month.
        #
        # A prorated current gross must NOT be projected into
        # future full months.
        # -----------------------------------------------------

        future_projected_gross = 0

        future_month_date = add_months(
            getdate(slip_date).replace(day=1),
            1,
        )

        while future_month_date <= cycle_end:
            future_projected_gross += (
                self.get_projected_future_month_gross(
                    future_month_date
                )
            )

            future_month_date = add_months(
                future_month_date,
                1,
            )

        projected_cycle_gross = (
            previous_cycle_gross
            + current_gross
            + future_projected_gross
        )

        # -----------------------------------------------------
        # Determine applicable PT slab from projected
        # six-month cycle income.
        # -----------------------------------------------------

        target_pt = self.get_pt_slab_amount(
            projected_cycle_gross
        )

        # -----------------------------------------------------
        # Find PT already deducted in this cycle.
        # -----------------------------------------------------

        previous_pt = self.get_previous_pt(
            cycle_start,
            cycle_end,
        )

        # -----------------------------------------------------
        # Calculate PT still required for the cycle.
        # -----------------------------------------------------

        remaining_pt = max(
            target_pt - previous_pt,
            0,
        )

        # -----------------------------------------------------
        # Spread remaining PT across current and remaining
        # months.
        #
        # Example:
        #
        # Target PT = 1000
        # Previous PT = 450
        # Remaining PT = 550
        # Remaining months = 2
        #
        # Current PT = 550 / 2 = 275
        # -----------------------------------------------------

        current_pt = (
            remaining_pt
            / remaining_months
        )

        current_pt = round(
            current_pt,
            2,
        )

        # -----------------------------------------------------
        # Final month reconciliation.
        #
        # This prevents rounding from leaving a few paise
        # or rupees outstanding at the end of the cycle.
        # -----------------------------------------------------

        if remaining_months == 1:
            current_pt = round(
                remaining_pt,
                2,
            )

        pt_row.amount = current_pt
        pt_row.default_amount = current_pt
        pt_row.additional_amount = 0

    # =========================================================
    # FUTURE MONTH SALARY PROJECTION
    # =========================================================

    def get_projected_future_month_gross(self, month_date):
        """
        Determine the projected full-month gross for a future
        month in the current PT cycle.

        The projection uses the BASE from the submitted Salary
        Structure Assignment applicable to that month.

        The current Salary Slip gross is intentionally NOT used
        here because the current month may be prorated due to
        partial payment days.

        If a new Salary Structure Assignment becomes effective
        for a future month, its base is used automatically.
        """

        month_date = getdate(month_date)

        assignments = frappe.get_all(
            "Salary Structure Assignment",
            filters={
                "employee": self.employee,
                "docstatus": 1,
                "from_date": ["<=", month_date],
            },
            fields=[
                "name",
                "base",
                "from_date",
                "salary_structure",
            ],
            order_by="from_date desc",
            limit_page_length=1,
        )

        if not assignments:
            return 0

        return flt(assignments[0].base)


    # =========================================================
    # PT CYCLE
    # =========================================================

    def get_pt_cycle(self, slip_date):
        """
        Professional Tax cycles:

            Cycle 1:
                October -> March

            Cycle 2:
                April -> September
        """

        slip_date = getdate(slip_date)

        year = slip_date.year
        month = slip_date.month

        # -----------------------------------------------------
        # Cycle 1: October -> March
        # -----------------------------------------------------

        if month >= 10:

            cycle_start = getdate(
                f"{year}-10-01"
            )

            cycle_end = getdate(
                f"{year + 1}-03-31"
            )

        # -----------------------------------------------------
        # January -> March belongs to the previous October
        # cycle.
        # -----------------------------------------------------

        elif month <= 3:

            cycle_start = getdate(
                f"{year - 1}-10-01"
            )

            cycle_end = getdate(
                f"{year}-03-31"
            )

        # -----------------------------------------------------
        # Cycle 2: April -> September
        # -----------------------------------------------------

        else:

            cycle_start = getdate(
                f"{year}-04-01"
            )

            cycle_end = getdate(
                f"{year}-09-30"
            )

        return cycle_start, cycle_end

    # =========================================================
    # PT SLABS
    # =========================================================

    def get_pt_slab_amount(self, cycle_gross):
        """
        Professional Tax slabs.

        IMPORTANT:
        The slab is selected using the cumulative/projected
        gross income for the complete six-month PT cycle.

        It is NOT selected from only one month's gross salary.
        """

        cycle_gross = flt(cycle_gross)

        if cycle_gross <= 11999:
            return 0

        elif cycle_gross <= 17999:
            return 320

        elif cycle_gross <= 29999:
            return 450

        elif cycle_gross <= 44999:
            return 600

        elif cycle_gross <= 99999:
            return 750

        elif cycle_gross <= 124999:
            return 1000

        else:
            return 1250

    # =========================================================
    # PREVIOUS CYCLE GROSS
    # =========================================================

    def get_previous_cycle_gross(
        self,
        cycle_start,
        cycle_end,
    ):
        """
        Get actual gross salary from submitted Salary Slips
        already available in the current PT cycle.

        Current Salary Slip is excluded because its gross
        is added separately.
        """

        previous_slips = frappe.get_all(
            "Salary Slip",
            filters={
                "employee": self.employee,
                "docstatus": 1,
                "start_date": [">=", cycle_start],
                "end_date": ["<=", cycle_end],
            },
            fields=[
                "name",
                "gross_pay",
                "start_date",
                "end_date",
            ],
        )

        previous_gross = 0

        for slip in previous_slips:

            # Do not count the current Salary Slip twice.
            if slip.name == self.name:
                continue

            previous_gross += flt(
                slip.gross_pay
            )

        return previous_gross

    # =========================================================
    # PREVIOUS PT
    # =========================================================

    def get_previous_pt(
        self,
        cycle_start,
        cycle_end,
    ):
        """
        Calculate Professional Tax already deducted from
        submitted Salary Slips in the same PT cycle.

        Current Salary Slip is excluded.
        """

        previous_slips = frappe.get_all(
            "Salary Slip",
            filters={
                "employee": self.employee,
                "docstatus": 1,
                "start_date": [">=", cycle_start],
                "end_date": ["<=", cycle_end],
            },
            fields=["name"],
        )

        previous_pt = 0

        for slip in previous_slips:

            if slip.name == self.name:
                continue

            deductions = frappe.get_all(
                "Salary Detail",
                filters={
                    "parent": slip.name,
                    "parenttype": "Salary Slip",
                    "parentfield": "deductions",
                    "salary_component": "Professional Tax",
                },
                fields=["amount"],
            )

            for row in deductions:
                previous_pt += flt(
                    row.amount
                )

        return previous_pt

    # =========================================================
    # REMAINING PT MONTHS
    # =========================================================

    def get_remaining_months(
        self,
        slip_date,
        cycle_end,
    ):
        """
        Count the current month plus the remaining months
        in the Professional Tax cycle.

        Example:

            November -> March

            November = 5 months

            December = 4 months

            January = 3 months

            February = 2 months

            March = 1 month
        """

        slip_date = getdate(slip_date)
        cycle_end = getdate(cycle_end)

        year_difference = (
            cycle_end.year
            - slip_date.year
        )

        month_difference = (
            cycle_end.month
            - slip_date.month
        )

        return (
            year_difference * 12
            + month_difference
            + 1
        )