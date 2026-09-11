// =====================================================
// GLOBAL VARIABLES
// =====================================================

let currentEmployee = null;


// =====================================================
// GET LOGGED-IN EMPLOYEE
// =====================================================

function getCurrentEmployee() {

    return fetch(
        "/api/method/frappe.auth.get_logged_user"
    )

    .then(response => response.json())

    .then(userData => {

        const currentUser =
            userData.message;

        if (
            !currentUser ||
            currentUser === "Guest"
        ) {

            throw new Error(
                "User is not logged in."
            );

        }

        const filters =
            encodeURIComponent(
                JSON.stringify([
                    [
                        "Employee",
                        "user_id",
                        "=",
                        currentUser
                    ],
                    [
                        "Employee",
                        "status",
                        "=",
                        "Active"
                    ]
                ])
            );

        return fetch(
            "/api/resource/Employee" +
            "?filters=" +
            filters +
            "&fields=" +
            encodeURIComponent(
                JSON.stringify([
                    "name",
                    "employee_name",
                    "company",
                    "department"
                ])
            )
        );

    })

    .then(response => response.json())

    .then(employeeData => {

        if (
            !employeeData.data ||
            employeeData.data.length === 0
        ) {

            throw new Error(
                "Employee record not found."
            );

        }

        currentEmployee =
            employeeData.data[0];

        document.getElementById(
            "employee-id"
        ).innerText =
            currentEmployee.name;

        document.getElementById(
            "employee-name"
        ).innerText =
            currentEmployee.employee_name;

        document.getElementById(
            "employee-company"
        ).innerText =
            currentEmployee.company;

        document.getElementById(
            "employee-department"
        ).innerText =
            currentEmployee.department || "-";

    });

}


// =====================================================
// INITIALIZE YEAR DROPDOWN
// =====================================================

function initializeYearDropdown() {

    const yearSelect =
        document.getElementById(
            "salary-year"
        );

    const currentYear =
        new Date().getFullYear();

    yearSelect.innerHTML = "";

    for (
        let year = currentYear - 5;
        year <= currentYear + 1;
        year++
    ) {

        const option =
            document.createElement("option");

        option.value = year;
        option.textContent = year;

        if (year === currentYear) {
            option.selected = true;
        }

        yearSelect.appendChild(option);
    }

}


// =====================================================
// INITIALIZE MONTH
// =====================================================

function initializeMonthDropdown() {

    const monthSelect =
        document.getElementById(
            "salary-month"
        );

    const currentMonth =
        new Date().getMonth() + 1;

    monthSelect.value =
        currentMonth.toString();

}


// =====================================================
// SHOW MESSAGE
// =====================================================

function showMessage(
    message,
    type = "error"
) {

    const messageElement =
        document.getElementById(
            "salary-message"
        );

    messageElement.innerText =
        message;

    messageElement.style.display =
        "block";

    if (type === "success") {

        messageElement.style.background =
            "#ecfdf5";

        messageElement.style.color =
            "#047857";

        messageElement.style.border =
            "1px solid #a7f3d0";

    }
    else {

        messageElement.style.background =
            "#fef2f2";

        messageElement.style.color =
            "#b91c1c";

        messageElement.style.border =
            "1px solid #fecaca";
    }

}


// =====================================================
// HIDE MESSAGE
// =====================================================

function hideMessage() {

    const messageElement =
        document.getElementById(
            "salary-message"
        );

    messageElement.style.display =
        "none";

}


// =====================================================
// FORMAT MONEY
// =====================================================

function formatMoney(
    amount,
    currency = "INR"
) {

    const numericAmount =
        Number(amount || 0);

    try {

        return new Intl.NumberFormat(
            "en-IN",
            {
                style: "currency",
                currency: currency,
                minimumFractionDigits: 2
            }
        ).format(numericAmount);

    }
    catch (error) {

        return numericAmount.toFixed(2);
    }

}


// =====================================================
// FORMAT DATE
// =====================================================

function formatDate(value) {

    if (!value) {
        return "-";
    }

    const date =
        new Date(value);

    if (isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleDateString(
        "en-IN"
    );

}


// =====================================================
// ESCAPE HTML
// =====================================================

function escapeHtml(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


// =====================================================
// LOAD SALARY SLIP
// =====================================================

function loadSalarySlip() {

    hideMessage();

    const year =
        document.getElementById(
            "salary-year"
        ).value;

    const month =
        document.getElementById(
            "salary-month"
        ).value;

    if (!year || !month) {

        showMessage(
            "Please select Year and Month."
        );

        return;
    }


    const button =
        document.getElementById(
            "view-salary-button"
        );

    button.disabled = true;

    button.innerText =
        "Loading...";


    document.getElementById(
        "salary-section"
    ).style.display = "none";

    document.getElementById(
        "overtime-section"
    ).style.display = "none";


    const url =
        "/api/method/" +
        "hrms_assignment.api.get_employee_salary_slip" +
        "?year=" +
        encodeURIComponent(year) +
        "&month=" +
        encodeURIComponent(month);


    fetch(url)

        .then(response => {

            if (!response.ok) {

                throw new Error(
                    "Unable to fetch Salary Slip."
                );

            }

            return response.json();

        })

        .then(result => {

            if (!result.message) {

                throw new Error(
                    "Invalid response from server."
                );

            }

            const data =
                result.message;


            if (
                data.employee &&
                data.employee.id
            ) {

                currentEmployee =
                    data.employee;

                document.getElementById(
                    "employee-id"
                ).innerText =
                    data.employee.id;

                document.getElementById(
                    "employee-name"
                ).innerText =
                    data.employee.name;

                document.getElementById(
                    "employee-company"
                ).innerText =
                    data.employee.company;

                document.getElementById(
                    "employee-department"
                ).innerText =
                    data.employee.department || "-";
            }


            renderSalarySlip(
                data.salary_slip
            );

            renderOvertimeSlips(
                data.overtime_slips
            );

        })

        .catch(error => {

            console.error(
                "Salary Slip Error:",
                error
            );

            showMessage(
                error.message ||
                "Failed to load Salary Slip."
            );

        })

        .finally(() => {

            button.disabled = false;

            button.innerText =
                "View Salary Slip";

        });

}


// =====================================================
// RENDER SALARY SLIP
// =====================================================

function renderSalarySlip(
    salarySlip
) {

    const salarySection =
        document.getElementById(
            "salary-section"
        );


   if (!salarySlip) {

        salarySection.style.display =
            "block";

        document.getElementById(
            "salary-header-grid"
        ).innerHTML = "";

        document.getElementById(
            "earnings-body"
        ).innerHTML = `
            <tr>
                <td colspan="3">
                    No Salary Slip found for the selected month.
                </td>
            </tr>
        `;

        document.getElementById(
            "deductions-body"
        ).innerHTML = "";

        document.getElementById(
            "salary-totals"
        ).innerHTML = "";

        return;
    }


    const slip =
    salarySlip;


    salarySection.style.display =
        "block";


    const currency =
        slip.currency || "INR";


    // =================================================
    // HEADER DETAILS
    // =================================================

    document.getElementById(
        "salary-header-grid"
    ).innerHTML = `

        <div class="salary-detail">

            <span>Employee</span>

            <strong>
                ${escapeHtml(
                    slip.employee || "-"
                )}
            </strong>

        </div>


        <div class="salary-detail">

            <span>Employee Name</span>

            <strong>
                ${escapeHtml(
                    slip.employee_name || "-"
                )}
            </strong>

        </div>


        <div class="salary-detail">

            <span>Company</span>

            <strong>
                ${escapeHtml(
                    slip.company || "-"
                )}
            </strong>

        </div>


        <div class="salary-detail">

            <span>Department</span>

            <strong>
                ${escapeHtml(
                    slip.department || "-"
                )}
            </strong>

        </div>


        <div class="salary-detail">

            <span>Posting Date</span>

            <strong>
                ${formatDate(
                    slip.posting_date
                )}
            </strong>

        </div>


        <div class="salary-detail">

            <span>Salary Structure</span>

            <strong>
                ${escapeHtml(
                    slip.salary_structure || "-"
                )}
            </strong>

        </div>


        <div class="salary-detail">

            <span>Payroll Entry</span>

            <strong>
                ${escapeHtml(
                    slip.payroll_entry || "-"
                )}
            </strong>

        </div>


        <div class="salary-detail">

            <span>Status</span>

            <strong>
                ${escapeHtml(
                    slip.status || "-"
                )}
            </strong>

        </div>


        <div class="salary-detail">

            <span>Start Date</span>

            <strong>
                ${formatDate(
                    slip.start_date
                )}
            </strong>

        </div>


        <div class="salary-detail">

            <span>End Date</span>

            <strong>
                ${formatDate(
                    slip.end_date
                )}
            </strong>

        </div>

    `;


    // =================================================
    // EARNINGS
    // =================================================

    const earningsBody =
        document.getElementById(
            "earnings-body"
        );

    earningsBody.innerHTML = "";


    const earnings =
        slip.earnings || [];


    if (!earnings.length) {

        earningsBody.innerHTML = `
            <tr>
                <td colspan="3">
                    No earnings found.
                </td>
            </tr>
        `;

    }
    else {

        earnings.forEach(
            earning => {

                const row =
                    document.createElement(
                        "tr"
                    );

                row.innerHTML = `

                    <td>
                        ${escapeHtml(
                            earning.salary_component || "-"
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            earning.type || "-"
                        )}
                    </td>

                    <td class="amount">
                        ${formatMoney(
                            earning.amount,
                            currency
                        )}
                    </td>

                `;

                earningsBody.appendChild(
                    row
                );

            }
        );

    }


    // =================================================
    // DEDUCTIONS
    // =================================================

    const deductionsBody =
        document.getElementById(
            "deductions-body"
        );

    deductionsBody.innerHTML = "";


    const deductions =
        slip.deductions || [];


    if (!deductions.length) {

        deductionsBody.innerHTML = `
            <tr>
                <td colspan="3">
                    No deductions found.
                </td>
            </tr>
        `;

    }
    else {

        deductions.forEach(
            deduction => {

                const row =
                    document.createElement(
                        "tr"
                    );

                row.innerHTML = `

                    <td>
                        ${escapeHtml(
                            deduction.salary_component || "-"
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            deduction.type || "-"
                        )}
                    </td>

                    <td class="amount">
                        ${formatMoney(
                            deduction.amount,
                            currency
                        )}
                    </td>

                `;

                deductionsBody.appendChild(
                    row
                );

            }
        );

    }


    // =================================================
    // TOTALS
    // =================================================

    document.getElementById(
        "salary-totals"
    ).innerHTML = `

        <div class="total-box">

            <span>
                Gross Pay
            </span>

            <strong>
                ${formatMoney(
                    slip.gross_pay,
                    currency
                )}
            </strong>

        </div>


        <div class="total-box">

            <span>
                Total Deduction
            </span>

            <strong>
                ${formatMoney(
                    slip.total_deduction,
                    currency
                )}
            </strong>

        </div>


        <div class="total-box net-pay">

            <span>
                Net Pay
            </span>

            <strong>
                ${formatMoney(
                    slip.net_pay,
                    currency
                )}
            </strong>

        </div>


        <div class="total-box">

            <span>
                Rounded Total
            </span>

            <strong>
                ${formatMoney(
                    slip.rounded_total,
                    currency
                )}
            </strong>

        </div>


        <div class="total-box">

            <span>
                Year To Date
            </span>

            <strong>
                ${formatMoney(
                    slip.year_to_date,
                    currency
                )}
            </strong>

        </div>


        <div class="total-box">

            <span>
                Month To Date
            </span>

            <strong>
                ${formatMoney(
                    slip.month_to_date,
                    currency
                )}
            </strong>

        </div>


        <div
            class="total-box"
            style="grid-column: span 2;"
        >

            <span>
                Total in Words
            </span>

            <strong>
                ${escapeHtml(
                    slip.total_in_words || "-"
                )}
            </strong>

        </div>

    `;

}


// =====================================================
// RENDER OVERTIME SLIPS
// =====================================================

function renderOvertimeSlips(
    overtimeSlips
) {

    const section =
        document.getElementById(
            "overtime-section"
        );

    const content =
        document.getElementById(
            "overtime-content"
        );


    section.style.display =
        "block";

    content.innerHTML = "";


    if (
        !overtimeSlips ||
        !overtimeSlips.length
    ) {

        content.innerHTML = `
            <div class="empty-message">
                No Overtime Slip found for the selected month.
            </div>
        `;

        return;
    }


    overtimeSlips.forEach(
        overtime => {

            const card =
                document.createElement(
                    "div"
                );

            card.className =
                "overtime-card";


            let detailsHtml = "";


            const details =
                overtime.details ||
                [];


            if (details.length) {

                detailsHtml = `

                    <h3>
                        Overtime Details
                    </h3>

                    <table>

                        <thead>

                            <tr>

                                <th>
                                    Overtime Date
                                </th>

                                <th>
                                    Overtime Type
                                </th>

                                <th>
                                    Overtime Duration
                                </th>

                                <th>
                                    Reference Document
                                </th>

                            </tr>

                        </thead>

                        <tbody>

                            ${details.map(
                                detail => `

                                <tr>

                                    <td>
                                        ${formatDate(
                                            detail.date
                                        )}
                                    </td>

                                    <td>
                                        ${escapeHtml(
                                            detail.overtime_type || "-"
                                        )}
                                    </td>

                                    <td>
                                        ${escapeHtml(
                                            detail.overtime_duration || "-"
                                        )}
                                    </td>

                                    <td>
                                        ${escapeHtml(
                                            detail.reference_document || "-"
                                        )}
                                    </td>

                                </tr>

                            `
                            ).join("")}

                        </tbody>

                    </table>

                `;

            }
            else {

                detailsHtml = `

                    <div class="empty-message">
                        No overtime details found.
                    </div>

                `;

            }


            // =========================================
            // ADDITIONAL SALARY / OVERTIME AMOUNT
            // =========================================

            let amountHtml = "";


           if (
              overtime.additional_salary &&
              overtime.additional_salary.length
            ) {

                amountHtml = `

                    <h3>
                        Overtime Earnings
                    </h3>

                    <table>

                        <thead>

                            <tr>

                                <th>
                                    Salary Component
                                </th>

                                <th>
                                    Payroll Date
                                </th>

                                <th class="amount">
                                    Amount
                                </th>

                            </tr>

                        </thead>

                        <tbody>

                            ${overtime.additional_salary.map(
                                salary => `

                                <tr>

                                    <td>
                                        ${escapeHtml(
                                            salary.salary_component || "-"
                                        )}
                                    </td>

                                    <td>
                                        ${formatDate(
                                            salary.payroll_date
                                        )}
                                    </td>

                                    <td class="amount">
                                        ${formatMoney(
                                            salary.amount,
                                            "INR"
                                        )}
                                    </td>

                                </tr>

                            `
                            ).join("")}

                        </tbody>

                    </table>

                `;

            }


            card.innerHTML = `

                <h3>
                    Overtime Slip:
                    ${escapeHtml(
                        overtime.name || "-"
                    )}
                </h3>


                <div class="salary-header-grid">

                    <div class="salary-detail">

                        <span>
                            Posting Date
                        </span>

                        <strong>
                            ${formatDate(
                                overtime.posting_date
                            )}
                        </strong>

                    </div>


                    <div class="salary-detail">

                        <span>
                            Company
                        </span>

                        <strong>
                            ${escapeHtml(
                                overtime.company || "-"
                            )}
                        </strong>

                    </div>


                    <div class="salary-detail">

                        <span>
                            Employee
                        </span>

                        <strong>
                            ${escapeHtml(
                                overtime.employee || "-"
                            )}
                        </strong>

                    </div>


                    <div class="salary-detail">

                        <span>
                            Employee Name
                        </span>

                        <strong>
                            ${escapeHtml(
                                overtime.employee_name || "-"
                            )}
                        </strong>

                    </div>


                    <div class="salary-detail">

                        <span>
                            Department
                        </span>

                        <strong>
                            ${escapeHtml(
                                overtime.department || "-"
                            )}
                        </strong>

                    </div>


                    <div class="salary-detail">

                        <span>
                            Start Date
                        </span>

                        <strong>
                            ${formatDate(
                                overtime.start_date
                            )}
                        </strong>

                    </div>


                    <div class="salary-detail">

                        <span>
                            End Date
                        </span>

                        <strong>
                            ${formatDate(
                                overtime.end_date
                            )}
                        </strong>

                    </div>


                    <div class="salary-detail">

                        <span>
                            Total Overtime Duration
                        </span>

                        <strong>
                            ${escapeHtml(
                                overtime.total_overtime_duration || "-"
                            )}
                        </strong>

                    </div>

                </div>


                ${detailsHtml}

                ${amountHtml}

            `;


            content.appendChild(
                card
            );

        }
    );

}


// =====================================================
// BACK TO DASHBOARD
// =====================================================

document
    .getElementById(
        "back-dashboard-button"
    )
    .addEventListener(
        "click",
        function () {

            window.location.href =
                "/employee-dashboard";

        }
    );


// =====================================================
// VIEW SALARY BUTTON
// =====================================================

document
    .getElementById(
        "view-salary-button"
    )
    .addEventListener(
        "click",
        function () {

            loadSalarySlip();

        }
    );


// =====================================================
// PAGE INITIALIZATION
// =====================================================

document.addEventListener(
    "DOMContentLoaded",
    function () {

        initializeYearDropdown();

        initializeMonthDropdown();

        getCurrentEmployee()

            .catch(error => {

                console.error(
                    "Employee Loading Error:",
                    error
                );

                showMessage(
                    error.message ||
                    "Unable to load employee information."
                );

            });

    }
);