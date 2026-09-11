// =====================================================
// GLOBAL VARIABLES
// =====================================================

let currentEmployee = null;
let employeeLeaveBalances = [];
let csrfToken = "";

// =====================================================
// GET CSRF TOKEN FROM PAGE
// =====================================================

function getCSRFToken() {

    const csrfMeta =
        document.querySelector(
            'meta[name="csrf-token"]'
        );

    if (
        !csrfMeta ||
        !csrfMeta.content
    ) {

        throw new Error(
            "CSRF token not found on page."
        );

    }

    csrfToken =
        csrfMeta.content;

    console.log(
        "CSRF Token:",
        csrfToken
    );

    return csrfToken;

}

// =====================================================
// GET LOGGED-IN EMPLOYEE
// =====================================================

function loadEmployee() {

    return fetch(
        "/api/method/frappe.auth.get_logged_user"
    )

    .then(response => {

        if (!response.ok) {

            throw new Error(
                "Unable to get logged-in user."
            );

        }

        return response.json();

    })

    .then(userData => {

        const currentUser =
            userData.message;

        return fetch(
            "/api/resource/Employee"
            + "?filters="
            + encodeURIComponent(
                JSON.stringify([
                    [
                        "user_id",
                        "=",
                        currentUser
                    ],
                    [
                        "status",
                        "=",
                        "Active"
                    ]
                ])
            )
            + "&fields="
            + encodeURIComponent(
                JSON.stringify([
                    "name",
                    "employee_name",
                    "company",
                    "department",
                    "leave_approver"
                ])
            )
        );

    })

    .then(response => {

        if (!response.ok) {

            throw new Error(
                "Unable to load employee."
            );

        }

        return response.json();

    })

    .then(data => {

        if (
            !data.data ||
            data.data.length === 0
        ) {

            throw new Error(
                "No active Employee found."
            );

        }

        currentEmployee =
            data.data[0];


        document.getElementById(
            "employee"
        ).innerText =
            currentEmployee.name;


        document.getElementById(
            "employee-name"
        ).innerText =
            currentEmployee.employee_name;


        document.getElementById(
            "company"
        ).innerText =
            currentEmployee.company;


        document.getElementById(
            "department"
        ).innerText =
            currentEmployee.department || "-";

    });

}


// =====================================================
// LOAD EMPLOYEE LEAVE BALANCE
// =====================================================

function loadEmployeeLeaveBalance() {

    if (!currentEmployee) {

        return Promise.resolve();

    }


    return fetch(
        "/api/method/hrms_assignment.api.get_employee_leave_balance"
    )

    .then(response => {

        if (!response.ok) {

            throw new Error(
                "Unable to fetch leave balance."
            );

        }

        return response.json();

    })

    .then(data => {

        console.log(
            "Employee Leave Balance:",
            data
        );


        if (
            !data.message ||
            !data.message.leave_balance
        ) {

            employeeLeaveBalances = [];

            return;

        }


        employeeLeaveBalances =
            data.message.leave_balance;

    })

    .catch(error => {

        console.error(
            "Leave balance loading error:",
            error
        );

        employeeLeaveBalances = [];

    });

}


// =====================================================
// LOAD LEAVE TYPES
// =====================================================

function loadLeaveTypes() {

    return loadEmployeeLeaveBalance()

    .then(function() {

        const leaveTypeSelect =
            document.getElementById(
                "leave-type"
            );


        leaveTypeSelect.innerHTML = `
            <option value="">
                Select Leave Type
            </option>
        `;


        // Only show leave types allocated
        // to this employee

        employeeLeaveBalances.forEach(
            function(leave) {

                const option =
                    document.createElement(
                        "option"
                    );


                option.value =
                    leave.leave_type;


                option.innerText =
                    leave.leave_type;


                leaveTypeSelect.appendChild(
                    option
                );

            }
        );


        const balanceElement =
            document.getElementById(
                "leave-balance"
            );


        if (balanceElement) {

            balanceElement.innerText =
                "0";

        }

    });

}


// =====================================================
// UPDATE LEAVE BALANCE BEFORE APPLICATION
// =====================================================

function updateLeaveBalance() {

    const leaveType =
        document.getElementById(
            "leave-type"
        ).value;


    const balanceElement =
        document.getElementById(
            "leave-balance"
        );


    if (!balanceElement) {
        return;
    }


    if (!leaveType) {

        balanceElement.innerText =
            "0";

        return;

    }


    const selectedLeave =
        employeeLeaveBalances.find(
            function(leave) {

                return (
                    leave.leave_type ===
                    leaveType
                );

            }
        );


    if (!selectedLeave) {

        balanceElement.innerText =
            "0";

        return;

    }


    balanceElement.innerText =
        selectedLeave.available || 0;

}


// =====================================================
// CALCULATE TOTAL LEAVE DAYS
// =====================================================

function calculateLeaveDays() {

    const fromDate =
        document.getElementById(
            "from-date"
        ).value;


    const toDate =
        document.getElementById(
            "to-date"
        ).value;


    const halfDay =
        document.getElementById(
            "half-day"
        ).checked;


    const totalDaysElement =
        document.getElementById(
            "total-leave-days"
        );


    if (!fromDate || !toDate) {

        totalDaysElement.innerText =
            "0";

        return;

    }


    const start =
        new Date(fromDate);


    const end =
        new Date(toDate);


    if (end < start) {

        totalDaysElement.innerText =
            "0";

        return;

    }


    const difference =
        end.getTime() -
        start.getTime();


    let totalDays =
        Math.floor(
            difference /
            (1000 * 60 * 60 * 24)
        ) + 1;


    if (halfDay) {

        totalDays =
            0.5;

    }


    totalDaysElement.innerText =
        totalDays;

}


// =====================================================
// LOAD LEAVE HISTORY
// =====================================================

function loadLeaveHistory() {

    if (!currentEmployee) {
        return;
    }


    const filters = [
        [
            "employee",
            "=",
            currentEmployee.name
        ]
    ];


    fetch(
        "/api/resource/Leave Application"
        + "?filters="
        + encodeURIComponent(
            JSON.stringify(filters)
        )
        + "&fields="
        + encodeURIComponent(
            JSON.stringify([
                "name",
                "leave_type",
                "from_date",
                "to_date",
                "total_leave_days",
                "status"
            ])
        )
        + "&order_by=creation desc"
        + "&limit_page_length=100"
    )

    .then(response => {

        if (!response.ok) {

            throw new Error(
                "Unable to load leave history."
            );

        }

        return response.json();

    })

    .then(data => {

        const tbody =
            document.getElementById(
                "leave-history-body"
            );


        tbody.innerHTML = "";


        if (
            !data.data ||
            data.data.length === 0
        ) {

            tbody.innerHTML = `
                <tr>
                    <td colspan="6">
                        No leave applications found.
                    </td>
                </tr>
            `;

            return;

        }


        data.data.forEach(
            function(application) {

                const row =
                    document.createElement(
                        "tr"
                    );


                row.innerHTML = `
                    <td>
                        ${application.leave_type || "-"}
                    </td>

                    <td>
                        ${application.from_date || "-"}
                    </td>

                    <td>
                        ${application.to_date || "-"}
                    </td>

                    <td>
                        ${application.total_leave_days || "0"}
                    </td>

                    <td>
                        ${getApprovalStatus(
                            application.status
                        )}
                    </td>

                    <td>
                        ${application.status || "-"}
                    </td>
                `;


                tbody.appendChild(row);

            }
        );

    })

    .catch(error => {

        console.error(
            "Leave history error:",
            error
        );

    });

}


// =====================================================
// APPROVAL STATUS
// =====================================================

function getApprovalStatus(status) {

    if (!status) {

        return "Pending";

    }


    if (
        status === "Approved"
    ) {

        return "Approved";

    }


    if (
        status === "Rejected"
    ) {

        return "Rejected";

    }


    return "Pending";

}


// =====================================================
// APPLY LEAVE
// =====================================================

async function applyLeave() {

    if (!currentEmployee) {

        document.getElementById(
            "leave-message"
        ).innerText =
            "Employee information is not loaded.";

        return;

    }


    const leaveType =
        document.getElementById(
            "leave-type"
        ).value;


    const fromDate =
        document.getElementById(
            "from-date"
        ).value;


    const toDate =
        document.getElementById(
            "to-date"
        ).value;


    const reason =
        document.getElementById(
            "reason"
        ).value.trim();


    const halfDay =
        document.getElementById(
            "half-day"
        ).checked;


    // -------------------------------------------------
    // VALIDATION
    // -------------------------------------------------

    if (!leaveType) {

        alert(
            "Please select Leave Type."
        );

        return;

    }


    if (!fromDate || !toDate) {

        alert(
            "Please select From Date and To Date."
        );

        return;

    }


    if (toDate < fromDate) {

        alert(
            "To Date cannot be before From Date."
        );

        return;

    }


    if (!reason) {

        alert(
            "Please enter the reason for leave."
        );

        return;

    }


    const selectedLeave =
        employeeLeaveBalances.find(
            function(leave) {

                return (
                    leave.leave_type ===
                    leaveType
                );

            }
        );


    if (!selectedLeave) {

        alert(
            "This Leave Type is not allocated to this employee."
        );

        return;

    }


    const totalLeaveDays =
        halfDay
            ? 0.5
            : calculateApplicationDays(
                fromDate,
                toDate
            );


    if (
        totalLeaveDays <= 0
    ) {

        alert(
            "Invalid number of leave days."
        );

        return;

    }


    if (
        totalLeaveDays >
        Number(
            selectedLeave.available || 0
        )
    ) {

        alert(
            "Insufficient leave balance. Available balance: "
            + selectedLeave.available
        );

        return;

    }


    // -------------------------------------------------
    // GET CSRF TOKEN
    // -------------------------------------------------

    try {

        await getCSRFToken();

    } catch (error) {

        document.getElementById(
            "leave-message"
        ).innerText =
            "Unable to get security token. Please refresh the page and try again.";

        return;

    }


    // -------------------------------------------------
    // LEAVE APPLICATION DATA
    // -------------------------------------------------
 if (!currentEmployee.leave_approver) {

    alert(
        "Leave Approver is not assigned to this employee."
    );

    return;

}


    const leaveApplication = {

        

        doctype:
            "Leave Application",

        employee:
            currentEmployee.name,

        employee_name:
            currentEmployee.employee_name,

        company:
            currentEmployee.company,

        department:
            currentEmployee.department,

        leave_approver:
        currentEmployee.leave_approver,    

        leave_type:
            leaveType,

        from_date:
            fromDate,

        to_date:
            toDate,

        description:
            reason,

        half_day:
            halfDay ? 1 : 0

    };


    document.getElementById(
        "leave-message"
    ).innerText =
        "Submitting leave application...";


    // -------------------------------------------------
    // CREATE LEAVE APPLICATION
    // -------------------------------------------------

    try {

        const response =
            await fetch(
                "/api/resource/Leave Application",
                {

                    method: "POST",

                    credentials:
                        "same-origin",

                    headers: {

                        "Content-Type":
                            "application/json",

                        "X-Frappe-CSRF-Token":
                            csrfToken

                    },

                    body:
                        JSON.stringify(
                            leaveApplication
                        )

                }
            );


        const data =
            await response.json();


        console.log(
            "Leave Application Response:",
            data
        );


        // -------------------------------------------------
        // ERROR RESPONSE
        // -------------------------------------------------

        if (
            !response.ok ||
            data.exc
        ) {

            let errorMessage =
                "Leave application failed.";


            if (
                data._server_messages
            ) {

                try {

                    const messages =
                        JSON.parse(
                            data._server_messages
                        );


                    errorMessage =
                        messages
                            .map(
                                function(message) {

                                    try {

                                        const parsed =
                                            JSON.parse(
                                                message
                                            );

                                        return (
                                            parsed.message ||
                                            message
                                        );

                                    } catch (e) {

                                        return message;

                                    }

                                }
                            )
                            .join("\n");

                } catch (e) {

                    console.error(
                        "Error reading server message:",
                        e
                    );

                }

            }


            if (
                data.exception &&
                errorMessage ===
                    "Leave application failed."
            ) {

                errorMessage =
                    data.exception;

            }


            throw new Error(
                errorMessage
            );

        }


        // -------------------------------------------------
        // SUCCESS
        // -------------------------------------------------

            showSuccessPopup();

        document.getElementById(
            "leave-status"
        ).innerText =
            (
                data.data &&
                data.data.status
            )
                ? data.data.status
                : "Open";

        document.getElementById(
            "approval-status"
        ).innerText =
            "Pending";


            
        document.getElementById(
            "leave-status"
        ).innerText =
            (
                data.data &&
                data.data.status
            )
                ? data.data.status
                : "Open";


        document.getElementById(
            "approval-status"
        ).innerText =
            "Pending";


        // Clear form

        document.getElementById(
            "leave-type"
        ).value = "";


        document.getElementById(
            "from-date"
        ).value = "";


        document.getElementById(
            "to-date"
        ).value = "";


        document.getElementById(
            "reason"
        ).value = "";


        document.getElementById(
            "half-day"
        ).checked = false;


        calculateLeaveDays();


        updateLeaveBalance();


        // Refresh balance and history

        await loadEmployeeLeaveBalance();

        updateLeaveBalance();

        loadLeaveHistory();


    } catch (error) {

        console.error(
            "Leave application error:",
            error
        );


        document.getElementById(
            "leave-message"
        ).innerText =
            error.message ||
            "Unable to submit leave application.";

    }

}


// =====================================================
// CALCULATE APPLICATION DAYS
// =====================================================

function calculateApplicationDays(
    fromDate,
    toDate
) {

    const start =
        new Date(fromDate);


    const end =
        new Date(toDate);


    if (end < start) {

        return 0;

    }


    const difference =
        end.getTime() -
        start.getTime();


    return Math.floor(
        difference /
        (1000 * 60 * 60 * 24)
    ) + 1;

}


// =====================================================
// DISPLAY EMPLOYEE LEAVE BALANCE
// =====================================================

function displayEmployeeLeaveBalance() {

    const section =
        document.getElementById(
            "leave-balance-section"
        );


    const tableBody =
        document.getElementById(
            "employee-leave-balance-body"
        );


    if (
        section.style.display === "block"
    ) {

        section.style.display =
            "none";

        return;

    }


    section.style.display =
        "block";


    tableBody.innerHTML = `
        <tr>
            <td colspan="4">
                Loading...
            </td>
        </tr>
    `;


    loadEmployeeLeaveBalance()

    .then(function() {

        if (
            employeeLeaveBalances.length === 0
        ) {

            tableBody.innerHTML = `
                <tr>
                    <td colspan="4">
                        No leave balance available.
                    </td>
                </tr>
            `;

            return;

        }


        tableBody.innerHTML = "";


        employeeLeaveBalances.forEach(
            function(leave) {

                const row =
                    document.createElement(
                        "tr"
                    );


                row.innerHTML = `
                    <td>
                        ${leave.leave_type || "-"}
                    </td>

                    <td>
                        ${leave.allocated || 0}
                    </td>

                    <td>
                        ${leave.used || 0}
                    </td>

                    <td>
                        ${leave.available || 0}
                    </td>
                `;


                tableBody.appendChild(
                    row
                );

            }
        );

    })

    .catch(function(error) {

        console.error(
            "Leave balance error:",
            error
        );


        tableBody.innerHTML = `
            <tr>
                <td colspan="4">
                    Unable to load leave balance.
                </td>
            </tr>
        `;

    });

}


// =====================================================
// DATE EVENTS
// =====================================================

document.getElementById(
    "from-date"
).addEventListener(
    "change",
    calculateLeaveDays
);


document.getElementById(
    "to-date"
).addEventListener(
    "change",
    calculateLeaveDays
);


document.getElementById(
    "half-day"
).addEventListener(
    "change",
    calculateLeaveDays
);


// =====================================================
// LEAVE TYPE CHANGE
// =====================================================

document.getElementById(
    "leave-type"
).addEventListener(
    "change",
    updateLeaveBalance
);


// =====================================================
// APPLY BUTTON
// =====================================================

document.getElementById(
    "apply-leave-button"
).addEventListener(
    "click",
    applyLeave
);


// =====================================================
// EMPLOYEE LEAVE BALANCE BUTTON
// =====================================================

document.getElementById(
    "employee-leave-balance-button"
).addEventListener(
    "click",
    displayEmployeeLeaveBalance
);


// =====================================================
// INITIAL LOAD
// =====================================================

loadEmployee()

.then(function() {

    return loadLeaveTypes();

})

.then(function() {

    loadLeaveHistory();

})

.catch(function(error) {

    console.error(
        "Leave page loading error:",
        error
    );

});


function showSuccessPopup() {

    const popup =
        document.getElementById(
            "success-popup"
        );

    popup.style.display = "flex";

    setTimeout(function() {

        closeSuccessPopup();

    }, 5000);
}


function closeSuccessPopup() {

    const popup =
        document.getElementById(
            "success-popup"
        );

    popup.style.display = "none";
}