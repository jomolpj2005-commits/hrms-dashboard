// =====================================================
// GLOBAL VARIABLES
// =====================================================

let currentEmployee = null;

let attendanceHistoryRecords = [];

let holidayDates = new Set();

let employeeHolidays = [];


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


        console.log(
            "Logged user:",
            currentUser
        );


        if (!currentUser) {

            throw new Error(
                "Unable to identify logged-in user."
            );

        }


        return fetch(
            `/api/resource/Employee?filters=${encodeURIComponent(
                JSON.stringify([
                    ["user_id", "=", currentUser],
                    ["status", "=", "Active"]
                ])
            )}&fields=${encodeURIComponent(
                JSON.stringify([
                    "name",
                    "employee_name"
                ])
            )}`
        );

    })

    .then(response => response.json())

    .then(data => {

        console.log(
            "Employee response:",
            data
        );


        if (
            !data.data ||
            data.data.length === 0
        ) {

            throw new Error(
                "Active employee not found."
            );

        }


        currentEmployee =
            data.data[0];


        console.log(
            "Current employee:",
            currentEmployee
        );

    });

}


// =====================================================
// LOAD EMPLOYEE HOLIDAYS
// =====================================================

function loadEmployeeHolidays() {

    console.log(
        "Loading employee holidays..."
    );


    return fetch(
        "/api/method/hrms_assignment.api.attendance.get_employee_holidays"
    )

    .then(response => response.json())

    .then(data => {

        console.log(
            "Holiday API response:",
            data
        );


        if (!data.message) {

            throw new Error(
                "Unable to load company holidays."
            );

        }


        // =================================================
        // BACKEND RETURNS THE HOLIDAY LIST DIRECTLY
        // =================================================

        employeeHolidays =
            data.message || [];


        console.log(
            "Employee holidays:",
            employeeHolidays
        );


        // =================================================
        // STORE HOLIDAY DATES
        // =================================================

        holidayDates =
            new Set();


        employeeHolidays.forEach(
            holiday => {

                if (
                    holiday.holiday_date
                ) {

                    holidayDates.add(
                        String(
                            holiday.holiday_date
                        )
                    );

                }

            }
        );


        console.log(
            "Holiday dates:",
            holidayDates
        );


        displayHolidayList();

    })

    .catch(error => {

        console.error(
            "Holiday loading error:",
            error
        );

        employeeHolidays = [];

        holidayDates =
            new Set();

    });

}


// =====================================================
// DISPLAY HOLIDAY LIST
// =====================================================

function displayHolidayList() {

    const holidayList =
        document.getElementById(
            "holiday-list"
        );


    if (!holidayList) {

        console.warn(
            "holiday-list element not found."
        );

        return;

    }


    holidayList.innerHTML = "";


    // =================================================
    // NO HOLIDAYS
    // =================================================

    if (
        employeeHolidays.length === 0
    ) {

        holidayList.innerHTML = `
            <div class="holiday-empty">
                No holidays found.
            </div>
        `;

        return;

    }


    // =================================================
    // SORT HOLIDAYS BY DATE
    // =================================================

    const sortedHolidays =
        [...employeeHolidays].sort(
            (a, b) => {

                return String(
                    a.holiday_date || ""
                ).localeCompare(
                    String(
                        b.holiday_date || ""
                    )
                );

            }
        );


    // =================================================
    // CREATE HOLIDAY ITEMS
    // =================================================

    sortedHolidays.forEach(
        holiday => {

            if (
                !holiday.holiday_date
            ) {

                return;

            }


            const date =
                String(
                    holiday.holiday_date
                );


            const description =
                holiday.description ||
                "Holiday";


            const holidayItem =
                document.createElement(
                    "div"
                );


            holidayItem.className =
                "holiday-item";


            holidayItem.innerHTML = `
                <div class="holiday-date">
                    ${formatHolidayDate(date)}
                </div>

                <div class="holiday-description">
                    ${description}
                </div>
            `;


            holidayList.appendChild(
                holidayItem
            );

        }
    );

}


// =====================================================
// FORMAT HOLIDAY DATE
// =====================================================

function formatHolidayDate(dateString) {

    if (!dateString) {

        return "";

    }


    const parts =
        dateString.split("-");


    if (
        parts.length !== 3
    ) {

        return dateString;

    }


    return `${parts[2]}-${parts[1]}-${parts[0]}`;

}


// =====================================================
// GET SELECTED YEAR
// =====================================================

function getSelectedYear() {

    const yearElement =
        document.getElementById(
            "attendance-year"
        );

    if (!yearElement) {
        return "";
    }

    return yearElement.value;
}




// =====================================================
// GET SELECTED MONTH
// =====================================================

function getSelectedMonth() {

    const monthElement =
        document.getElementById(
            "attendance-month"
        );

    if (!monthElement) {
        return "";
    }

    return monthElement.value;
}


function populateYears() {

    const yearElement =
        document.getElementById(
            "attendance-year"
        );

    if (!yearElement) {
        return;
    }

    yearElement.innerHTML = `
        <option value="">
            Select Year
        </option>
    `;

    const currentYear =
        new Date().getFullYear();

    // Show current year and previous 5 years
    for (
        let year = currentYear;
        year >= currentYear - 5;
        year--
    ) {

        const option =
            document.createElement("option");

        option.value = year;
        option.textContent = year;

        yearElement.appendChild(option);
    }

    // Automatically select current year
    yearElement.value =
        String(currentYear);
}  



// =====================================================
// LOAD ATTENDANCE
// =====================================================

function loadAttendance() {

    if (!currentEmployee) {

        console.error(
            "Current employee is not available."
        );

        return;

    }


    const year =
        getSelectedYear();


    const month =
        getSelectedMonth();
        
        if (!year || !month) {

        const message =
            document.getElementById(
                "attendance-filter-message"
            );

        if (message) {

            message.textContent =
                "Please select Year and Month.";

        }

        return;

    }


    console.log(
        "Loading attendance:",
        year,
        month
    );


    const startDate =
        `${year}-${String(month).padStart(2, "0")}-01`;


    const endDate =
        new Date(
            Number(year),
            Number(month),
            0
        )
        .toISOString()
        .split("T")[0];


    const filters = [
        ["employee", "=", currentEmployee.name],
        ["time", ">=", `${startDate} 00:00:00`],
        ["time", "<=", `${endDate} 23:59:59`]
    ];


    const url =
        `/api/resource/Employee Checkin?filters=${encodeURIComponent(
            JSON.stringify(filters)
        )}&fields=${encodeURIComponent(
            JSON.stringify([
                "name",
                "employee",
                "time",
                "log_type",
                "shift"
            ])
        )}&order_by=time desc&limit_page_length=500`;


    fetch(url)

    .then(response => {

        if (!response.ok) {

            throw new Error(
                "Unable to load attendance."
            );

        }


        return response.json();

    })

    .then(data => {

        console.log(
            "Attendance response:",
            data
        );


        attendanceHistoryRecords =
            data.data || [];


        renderAttendanceHistory(
            attendanceHistoryRecords,
            holidayDates
        );

    })

    .catch(error => {

        console.error(
            "Attendance loading error:",
            error
        );


        const historyBody =
            document.getElementById(
                "attendance-history-body"
            );


        if (historyBody) {

            historyBody.innerHTML = `
                <tr>
                    <td colspan="4">
                        Unable to load attendance records.
                    </td>
                </tr>
            `;

        }

    });

}


// =====================================================
// RENDER ATTENDANCE HISTORY
// =====================================================

function renderAttendanceHistory(
    records,
    filteredHolidayDates = holidayDates
) {

    const historyBody =
        document.getElementById(
            "attendance-history-body"
        );


    if (!historyBody) {

        console.error(
            "attendance-history-body not found."
        );

        return;

    }


    historyBody.innerHTML = "";


    // =================================================
    // GROUP ATTENDANCE BY DATE
    // =================================================

    const attendanceByDate = {};


    records.forEach(
        record => {

            if (!record.time) {

                return;

            }


            // =================================================
            // GET DATE ONLY
            // =================================================

            const date =
                String(
                    record.time
                ).split(" ")[0];


            if (
                !attendanceByDate[date]
            ) {

                attendanceByDate[date] = {
                    IN: null,
                    OUT: null
                };

            }


            // =================================================
            // FIRST IN
            // =================================================

            if (
                record.log_type === "IN" &&
                !attendanceByDate[date].IN
            ) {

                attendanceByDate[date].IN =
                    record;

            }


            // =================================================
            // LAST OUT
            // =================================================

            if (
                record.log_type === "OUT"
            ) {

                attendanceByDate[date].OUT =
                    record;

            }

        }
    );


    // =================================================
    // SORT ATTENDANCE DATES
    // =================================================

    const attendanceDates =
        Object.keys(
            attendanceByDate
        )
        .sort()
        .reverse();


    // =================================================
    // CREATE ATTENDANCE ROWS
    // =================================================

    attendanceDates.forEach(
        date => {

            const attendance =
                attendanceByDate[date];


            // =================================================
            // CHECK IN
            // =================================================

            const checkIn =
                attendance.IN
                    ? attendance.IN.time
                    : "-";


            // =================================================
            // CHECK OUT
            // =================================================

            const checkOut =
                attendance.OUT
                    ? attendance.OUT.time
                    : "-";


            // =================================================
            // STATUS
            // =================================================

            let status;


            if (
                attendance.IN &&
                attendance.OUT
            ) {

                status =
                    "Completed";

            }

            else if (
                attendance.IN
            ) {

                status =
                    "Checked In";

            }

            else if (
                attendance.OUT
            ) {

                status =
                    "Checked Out";

            }

            else {

                status =
                    "-";

            }


            // =================================================
            // CREATE ROW
            // =================================================

            const row =
                document.createElement(
                    "tr"
                );


            row.innerHTML = `
                <td>${date}</td>
                <td>${checkIn}</td>
                <td>${checkOut}</td>
                <td>${status}</td>
            `;


            // =================================================
            // HOLIDAY WORKED
            // =================================================
            //
            // IMPORTANT:
            //
            // Holiday dates are NOT added as new rows.
            //
            // Only an existing attendance row is marked
            // red when that attendance date is a holiday.
            //
            // =================================================

            if (
                filteredHolidayDates.has(
                    date
                )
            ) {

                row.style.color =
                    "#dc2626";

                row.style.fontWeight =
                    "600";

            }


            historyBody.appendChild(
                row
            );

        }
    );


    // =================================================
    // NO ATTENDANCE RECORDS
    // =================================================

    if (
        attendanceDates.length === 0
    ) {

        historyBody.innerHTML = `
            <tr>
                <td colspan="4">
                    No attendance records found.
                </td>
            </tr>
        `;

    }

}


// =====================================================
// VIEW ATTENDANCE BUTTON
// =====================================================

function setupViewAttendanceButton() {

    const button =
        document.getElementById(
            "view-attendance-button"
        );


    if (!button) {

        console.warn(
            "View Attendance button not found."
        );

        return;

    }


    button.addEventListener(
        "click",
        function () {

            loadAttendance();

        }
    );

}

function setupBackButton() {

    const button =
        document.getElementById(
            "back-dashboard-button"
        );

    if (!button) {
        console.warn(
            "Back dashboard button not found."
        );
        return;
    }

    button.addEventListener(
        "click",
        function () {

            window.location.href =
                "/employee-dashboard";

        }
    );

}
// =====================================================
// PAGE INITIALIZATION
// =====================================================


document.addEventListener(
    "DOMContentLoaded",
    function () {

        console.log(
            "Attendance History page loaded."
        );

        populateYears();

        const monthElement =
            document.getElementById(
                "attendance-month"
            );

        if (
            monthElement &&
            !monthElement.value
        ) {

            const currentMonth =
                String(
                    new Date().getMonth() + 1
                ).padStart(2, "0");

            monthElement.value =
                currentMonth;
        }

        setupViewAttendanceButton();

        setupBackButton();

        getCurrentEmployee()

        .then(() => {

            return loadEmployeeHolidays();

        })

        .then(() => {

            loadAttendance();

        })

        .catch(error => {

            console.error(
                "Attendance History initialization error:",
                error
            );

        });

    }
); 
// =====================================================
// BACK TO EMPLOYEE DASHBOARD
// =====================================================

function setupBackButton() {

    const button =
        document.getElementById(
            "back-dashboard-button"
        );

    if (!button) {

        console.error(
            "Back dashboard button not found."
        );

        return;
    }

    button.onclick = function () {

        console.log(
            "Employee Dashboard button clicked."
        );

        window.location.href =
            "/employee-dashboard";

    };

}