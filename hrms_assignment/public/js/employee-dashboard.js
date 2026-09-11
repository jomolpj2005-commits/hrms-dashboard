// =====================================================
// GLOBAL VARIABLES
// =====================================================

let currentEmployee = null;

let activeCheckInDate = null;

let employeeHolidays = [];

let activeHolidayAttendanceDate = null;


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


        const employeeFilters =
            encodeURIComponent(
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
            );


        const employeeFields =
            encodeURIComponent(
                JSON.stringify([
                    "name",
                    "employee_name",
                    "image",
                    "cell_number",
                    "company_email",
                    "personal_email",
                    "company",
                    "department",
                    "designation",
                    "date_of_joining"
                ])
            );


        return fetch(
            "/api/resource/Employee?filters=" +
            employeeFilters +
            "&fields=" +
            employeeFields
        );

    })

    .then(response => response.json())

    .then(employeeData => {

        console.log(
            "Employee response:",
            employeeData
        );


        if (
            !employeeData.data ||
            employeeData.data.length === 0
        ) {

            throw new Error(
                "No active Employee is linked to this user."
            );

        }


        currentEmployee =
            employeeData.data[0];


        console.log(
            "Current Employee:",
            currentEmployee
        );


        displayEmployeeProfile(
            currentEmployee
        );


        return currentEmployee;

    });

}


// =====================================================
// DISPLAY EMPLOYEE PROFILE
// =====================================================

function displayEmployeeProfile(employee) {

    console.log(
        "Displaying employee profile:",
        employee
    );


    document.getElementById(
        "profile-employee-name"
    ).innerText =
        employee.employee_name ||
        "Employee";


    document.getElementById(
        "profile-employee-id"
    ).innerText =
        "Employee ID: " +
        (
            employee.name ||
            "Not available"
        );


    document.getElementById(
        "profile-designation"
    ).innerText =
        employee.designation ||
        "Designation not available";


    document.getElementById(
        "profile-phone"
    ).innerText =
        employee.cell_number ||
        "Not available";


    document.getElementById(
        "profile-company-email"
    ).innerText =
        employee.company_email ||
        "Not available";


    document.getElementById(
        "profile-personal-email"
    ).innerText =
        employee.personal_email ||
        "Not available";


    document.getElementById(
        "profile-department"
    ).innerText =
        employee.department ||
        "Not available";


    document.getElementById(
        "profile-company"
    ).innerText =
        employee.company ||
        "Not available";


    document.getElementById(
        "profile-date-of-joining"
    ).innerText =
        formatEmployeeDate(
            employee.date_of_joining
        );


    const employeeImage =
        document.getElementById(
            "employee-image"
        );


    const imagePlaceholder =
        document.getElementById(
            "employee-image-placeholder"
        );


    if (employee.image) {

        employeeImage.src =
            employee.image;

        employeeImage.style.display =
            "block";

        imagePlaceholder.style.display =
            "none";

    }

    else {

        employeeImage.style.display =
            "none";

        imagePlaceholder.style.display =
            "flex";

    }

}


// =====================================================
// FORMAT EMPLOYEE DATE
// =====================================================

function formatEmployeeDate(dateValue) {

    if (!dateValue) {

        return "Not available";

    }


    const parts =
        dateValue.split("-");


    if (parts.length !== 3) {

        return dateValue;

    }


    return (
        parts[2] +
        "-" +
        parts[1] +
        "-" +
        parts[0]
    );

}


// =====================================================
// GET TODAY'S DATE
// =====================================================

function getTodayDate() {

    const now =
        new Date();


    const year =
        now.getFullYear();


    const month =
        String(
            now.getMonth() + 1
        ).padStart(
            2,
            "0"
        );


    const day =
        String(
            now.getDate()
        ).padStart(
            2,
            "0"
        );


    return (
        year +
        "-" +
        month +
        "-" +
        day
    );

}


// =====================================================
// FORMAT HOLIDAY DATE
// =====================================================

function formatHolidayDate(dateValue) {

    if (!dateValue) {

        return "";

    }


    const parts =
        dateValue.split("-");


    if (parts.length !== 3) {

        return dateValue;

    }


    return (
        parts[2] +
        "-" +
        parts[1] +
        "-" +
        parts[0]
    );

}


// =====================================================
// FIND HOLIDAY
// =====================================================

function findHoliday(dateValue) {

    if (!dateValue) {

        return null;

    }


    return employeeHolidays.find(
        holiday =>
            holiday.holiday_date === dateValue
    ) || null;

}


// =====================================================
// SHOW HOLIDAY POPUP
// =====================================================

function showHolidayPopup(
    holiday
) {

    const modal =
        document.getElementById(
            "holiday-modal"
        );

    const message =
        document.getElementById(
            "holiday-modal-message"
        );

    if (
        !modal ||
        !message
    ) {

        return;

    }

    // -------------------------------------------------
    // POPUP MESSAGE
    // -------------------------------------------------

    let popupMessage =
        "That is a holiday.";

    if (
        holiday &&
        holiday.description
    ) {

        popupMessage =
            "That is a holiday: " +
            holiday.description;

    }

    message.innerText =
        popupMessage;

    modal.style.display =
        "flex";


    // -------------------------------------------------
    // CHECK EXISTING HOLIDAY ATTENDANCE
    // -------------------------------------------------

    if (
        !holiday ||
        !holiday.holiday_date
    ) {

        return;

    }


    fetch(
        "/api/method/hrms_assignment.api.attendance.get_holiday_attendance_status"
        +
        "?attendance_date="
        +
        encodeURIComponent(
            holiday.holiday_date
        )
    )
    .then(
        response =>
            response.json()
    )
    .then(
        data => {

            console.log(
                "Holiday attendance status:",
                data
            );


            if (
                !data.message
            ) {

                return;

            }


            const status =
                data.message.status;


            // -------------------------------------------------
            // NOT CHECKED IN
            // -------------------------------------------------

            if (
                status ===
                "NOT_CHECKED_IN"
            ) {

                activeHolidayAttendanceDate =
                    null;

                document.getElementById(
                    "submit-holiday-check-in-button"
                ).style.display =
                    "inline-block";

                document.getElementById(
                    "submit-holiday-check-out-button"
                ).style.display =
                    "none";

                return;

            }


            // -------------------------------------------------
            // ALREADY CHECKED IN
            // -------------------------------------------------

            if (
                status ===
                "CHECKED_IN"
            ) {

                activeHolidayAttendanceDate =
                    holiday.holiday_date;

                document.getElementById(
                    "submit-holiday-check-in-button"
                ).style.display =
                    "none";

                document.getElementById(
                    "submit-holiday-check-out-button"
                ).style.display =
                    "inline-block";

                message.innerText =
                    popupMessage +
                    "\n\nHoliday check-in already exists. " +
                    "You can now mark Holiday Check Out.";

                return;

            }


            // -------------------------------------------------
            // COMPLETED
            // -------------------------------------------------

            if (
                status ===
                "COMPLETED"
            ) {

                activeHolidayAttendanceDate =
                    null;

                document.getElementById(
                    "submit-holiday-check-in-button"
                ).style.display =
                    "none";

                document.getElementById(
                    "submit-holiday-check-out-button"
                ).style.display =
                    "none";

                message.innerText =
                    popupMessage +
                    "\n\nHoliday attendance is already completed.";

                return;

            }

        }
    )
    .catch(
        error => {

            console.error(
                "Holiday attendance status error:",
                error
            );

        }
    );

}


// =====================================================
// LOAD COMPANY HOLIDAYS
// =====================================================

function loadEmployeeHolidays() {

    console.log(
        "Loading company holidays..."
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


        if (
            !data.message
        ) {

            throw new Error(
                "Unable to load company holidays."
            );

        }


        // Backend returns the holiday list directly
        employeeHolidays =
            data.message ||
            [];


        console.log(
            "Employee holidays:",
            employeeHolidays
        );


        displayEmployeeHolidays();

    })

    .catch(error => {

        console.error(
            "Holiday loading error:",
            error
        );


        const holidaySection =
            document.getElementById(
                "holiday-section"
            );


        if (holidaySection) {

            holidaySection.style.display =
                "none";

        }

    });

}


// =====================================================
// DISPLAY COMPANY HOLIDAYS
// =====================================================

function displayEmployeeHolidays() {

    const holidaySection =
        document.getElementById(
            "holiday-section"
        );


    const holidayList =
        document.getElementById(
            "holiday-list"
        );


    const holidayAttendanceButton =
        document.getElementById(
            "mark-holiday-attendance-button"
        );


    if (
        !holidaySection ||
        !holidayList
    ) {

        return;

    }


    holidayList.innerHTML =
        "";


    if (
        employeeHolidays.length === 0
    ) {

        holidaySection.style.display =
            "none";


        if (holidayAttendanceButton) {

            holidayAttendanceButton.style.display =
                "none";

        }

        return;

    }


    holidaySection.style.display =
        "block";


    if (holidayAttendanceButton) {

        holidayAttendanceButton.style.display =
            "inline-block";

    }


    employeeHolidays.forEach(
        holiday => {

            const button =
                document.createElement(
                    "button"
                );


            button.type =
                "button";


            button.className =
                "holiday-date-button";


            const dateSpan =
                document.createElement(
                    "span"
                );


            dateSpan.className =
                "holiday-date";


            dateSpan.innerText =
                formatHolidayDate(
                    holiday.holiday_date
                );


            const descriptionSpan =
                document.createElement(
                    "span"
                );


            descriptionSpan.className =
                "holiday-description";


            descriptionSpan.innerText =
                holiday.description ||
                "Company Holiday";


            button.appendChild(
                dateSpan
            );


            button.appendChild(
                descriptionSpan
            );


            button.addEventListener(
                "click",
                function () {

                    showHolidayPopup(
                        holiday
                    );

                }
            );


            holidayList.appendChild(
                button
            );

        }
    );

}


// =====================================================
// LOAD ATTENDANCE FROM BACKEND
// =====================================================

function loadAttendance() {

    if (!currentEmployee) {

        return;

    }


    console.log(
        "Loading attendance for:",
        currentEmployee.name
    );


    const filters =
        encodeURIComponent(
            JSON.stringify([
                [
                    "employee",
                    "=",
                    currentEmployee.name
                ]
            ])
        );


    const fields =
        encodeURIComponent(
            JSON.stringify([
                "name",
                "time",
                "log_type"
            ])
        );


    fetch(
        "/api/resource/Employee%20Checkin?" +
        "filters=" +
        filters +
        "&fields=" +
        fields +
        "&order_by=time desc" +
        "&limit_page_length=100"
    )

    .then(
        response =>
            response.json()
    )

    .then(
        data => {

            console.log(
                "Attendance records:",
                data
            );


            const records =
                data.data || [];


            // =================================================
            // NO ATTENDANCE
            // =================================================

            if (records.length === 0) {

                document.getElementById(
                    "attendance-status"
                ).innerText =
                    "Not Checked In";


                document.getElementById(
                    "last-attendance-date"
                ).innerText =
                    "Last Attendance Date: Not yet";


                document.getElementById(
                    "last-check-in-time"
                ).innerText =
                    "Last Check In: Not yet";


                document.getElementById(
                    "last-check-out-time"
                ).innerText =
                    "Last Check Out: Not yet";


                activeCheckInDate =
                    null;


                document.getElementById(
                    "check-in-button"
                ).style.display =
                    "inline-block";


                document.getElementById(
                    "check-in-form"
                ).style.display =
                    "none";


                document.getElementById(
                    "check-out-button"
                ).style.display =
                    "none";


                document.getElementById(
                    "check-out-form"
                ).style.display =
                    "none";


                return;

            }


            // =================================================
            // GROUP ATTENDANCE BY DATE
            // =================================================

            const attendanceByDate = {};


            records.forEach(
                record => {

                    if (!record.time) {

                        return;

                    }


                    const date =
                        record.time.split(" ")[0];


                    if (!attendanceByDate[date]) {

                        attendanceByDate[date] = {
                            IN: null,
                            OUT: null
                        };

                    }


                    if (
                        record.log_type === "IN" &&
                        !attendanceByDate[date].IN
                    ) {

                        attendanceByDate[date].IN =
                            record;

                    }


                    if (
                        record.log_type === "OUT" &&
                        !attendanceByDate[date].OUT
                    ) {

                        attendanceByDate[date].OUT =
                            record;

                    }

                }
            );


            const attendanceDates =
                Object.keys(
                    attendanceByDate
                )
                .sort()
                .reverse();


            const latestAttendanceDate =
                attendanceDates[0];


            const latestAttendance =
                attendanceByDate[
                    latestAttendanceDate
                ];


            // =================================================
            // LAST ATTENDANCE INFORMATION
            // =================================================

            document.getElementById(
                "last-attendance-date"
            ).innerText =
                "Last Attendance Date: " +
                latestAttendanceDate;


            if (
                latestAttendance &&
                latestAttendance.IN
            ) {

                document.getElementById(
                    "last-check-in-time"
                ).innerText =
                    "Last Check In: " +
                    latestAttendance.IN.time;

            }

            else {

                document.getElementById(
                    "last-check-in-time"
                ).innerText =
                    "Last Check In: Not yet";

            }


            if (
                latestAttendance &&
                latestAttendance.OUT
            ) {

                document.getElementById(
                    "last-check-out-time"
                ).innerText =
                    "Last Check Out: " +
                    latestAttendance.OUT.time;

            }

            else {

                document.getElementById(
                    "last-check-out-time"
                ).innerText =
                    "Last Check Out: Not yet";

            }


            // =================================================
            // FIND ACTIVE NORMAL ATTENDANCE
            // =================================================

            let activeNormalAttendance =
                null;


            for (
                const date of attendanceDates
            ) {

                // ---------------------------------------------
                // IMPORTANT:
                // IGNORE COMPANY HOLIDAYS
                // ---------------------------------------------

                const holiday =
                    findHoliday(
                        date
                    );


                if (holiday) {

                    console.log(
                        "Ignoring holiday attendance from normal attendance:",
                        date
                    );

                    continue;

                }


                const attendance =
                    attendanceByDate[
                        date
                    ];


                if (
                    attendance &&
                    attendance.IN &&
                    !attendance.OUT
                ) {

                    activeNormalAttendance = {
                        date: date,
                        record: attendance.IN
                    };

                    break;

                }


                // Once we find the latest normal
                // completed attendance, stop looking.

                if (
                    attendance &&
                    attendance.IN &&
                    attendance.OUT
                ) {

                    break;

                }

            }


            // =================================================
            // NORMAL ATTENDANCE IS CURRENTLY CHECKED IN
            // =================================================

            if (
                activeNormalAttendance
            ) {

                const normalDate =
                    activeNormalAttendance.date;


                const normalRecord =
                    activeNormalAttendance.record;


                document.getElementById(
                    "attendance-status"
                ).innerText =
                    "Checked In";


                activeCheckInDate =
                    normalDate;


                document.getElementById(
                    "check-in-button"
                ).style.display =
                    "none";


                document.getElementById(
                    "check-in-form"
                ).style.display =
                    "none";


                document.getElementById(
                    "check-out-button"
                ).style.display =
                    "inline-block";


                document.getElementById(
                    "check-out-form"
                ).style.display =
                    "none";


                document.getElementById(
                    "check-out-date"
                ).value =
                    normalDate;


                console.log(
                    "Normal attendance is active:",
                    normalDate
                );


                return;

            }


            // =================================================
            // NO ACTIVE NORMAL ATTENDANCE
            //
            // This includes:
            // - Holiday IN
            // - Holiday IN + OUT
            // - Completed normal attendance
            // =================================================

            document.getElementById(
                "attendance-status"
            ).innerText =
                "Not Checked In";


            activeCheckInDate =
                null;


            document.getElementById(
                "check-in-button"
            ).style.display =
                "inline-block";


            document.getElementById(
                "check-in-form"
            ).style.display =
                "none";


            document.getElementById(
                "check-out-button"
            ).style.display =
                "none";


            document.getElementById(
                "check-out-form"
            ).style.display =
                "none";


            console.log(
                "No active normal attendance."
            );

        }
    )

    .catch(
        error => {

            console.error(
                "Attendance loading error:",
                error
            );


            document.getElementById(
                "attendance-status"
            ).innerText =
                "Unable to load attendance.";

        }
    );

}

// =====================================================
// ATTENDANCE HISTORY BUTTON
// =====================================================

document
    .getElementById(
        "attendance-history-button"
    )
    .addEventListener(
        "click",
        function () {

            window.location.href =
                "/attendance-history";

        }
    );


// =====================================================
// PARSE FRAPPE ERROR
// =====================================================
function getBackendErrorMessage(data) {

    let errorMessage =
        data._server_messages ||
        data.exception ||
        "Attendance failed.";

    // --------------------------------------------------
    // FIRST JSON DECODE
    // --------------------------------------------------

    try {

        if (
            typeof errorMessage === "string" &&
            errorMessage.startsWith("[")
        ) {

            const messages =
                JSON.parse(errorMessage);

            if (
                messages.length > 0
            ) {

                errorMessage =
                    messages[0];
            }
        }

    }
    catch (error) {

        console.log(
            "First error message parsing failed:",
            error
        );

    }

    // --------------------------------------------------
    // SECOND JSON DECODE
    // --------------------------------------------------

    try {

        if (
            typeof errorMessage === "string" &&
            errorMessage.startsWith("{")
        ) {

            const errorObject =
                JSON.parse(errorMessage);

            if (
                errorObject.message
            ) {

                errorMessage =
                    errorObject.message;
            }
        }

    }
    catch (error) {

        console.log(
            "Second error message parsing failed:",
            error
        );

    }

    // --------------------------------------------------
    // REMOVE FRAPPE EXCEPTION PREFIX
    // --------------------------------------------------

    if (
        typeof errorMessage === "string"
    ) {

        errorMessage = errorMessage.replace(
           /^frappe\.exceptions\.[^:]+:\s*/,
           ""
           );   

        // Remove duplicate spaces
        errorMessage =
            errorMessage.replace(
                /\s+/g,
                " "
            ).trim();
    }

    return errorMessage;
}

// =====================================================
// SUBMIT NORMAL ATTENDANCE
// =====================================================

function submitAttendance(
    action,
    attendanceDate,
    attendanceTime
) {

    let messageElement;


    if (action === "IN") {

        messageElement =
            document.getElementById(
                "check-in-message"
            );

    }

    else {

        messageElement =
            document.getElementById(
                "check-out-message"
            );

    }


    if (!attendanceDate) {

        messageElement.innerText =
            "Please select a date.";

        return;

    }


    if (!attendanceTime) {

        messageElement.innerText =
            "Please select a time.";

        return;

    }


    // =================================================
    // CHECK COMPANY HOLIDAY
    // =================================================

    const holiday =
        findHoliday(
            attendanceDate
        );


    if (holiday) {

        messageElement.innerText =
            "This date is a company holiday. " +
            "Please use Holiday Attendance.";

        showHolidayPopup(
            holiday
        );

        return;

    }


    // =================================================
    // NORMAL ATTENDANCE
    // =================================================

    console.log(
        "Sending normal attendance:",
        {
            action:
                action,

            date:
                attendanceDate,

            time:
                attendanceTime
        }
    );


    messageElement.innerText =
        action === "IN"
            ? "Checking in..."
            : "Checking out...";


    fetch(
        "/api/method/hrms_assignment.api.attendance.employee_attendance",
        {
            method: "POST",

            headers: {

                "Accept":
                    "application/json",

                "Content-Type":
                    "application/json",

                "X-Frappe-CSRF-Token":
                    document.querySelector(
                        'meta[name="csrf-token"]'
                    ).content

            },

            body: JSON.stringify({

                action:
                    action,

                attendance_date:
                    attendanceDate,

                attendance_time:
                    attendanceTime

            })

        }
    )

    .then(
        response =>
            response.json()
    )

    .then(
        data => {

            console.log(
                "Attendance API response:",
                data
            );


            if (
                data.message &&
                data.message.success
            ) {

                messageElement.innerText =
                    data.message.message;


                if (action === "IN") {

                    activeCheckInDate =
                        attendanceDate;


                    document.getElementById(
                        "check-in-form"
                    ).style.display =
                        "none";


                    document.getElementById(
                        "check-in-button"
                    ).style.display =
                        "none";


                    document.getElementById(
                        "check-out-button"
                    ).style.display =
                        "inline-block";


                    document.getElementById(
                        "check-out-date"
                    ).value =
                        attendanceDate;


                    document.getElementById(
                        "check-out-time"
                    ).value =
                        "";


                    document.getElementById(
                        "attendance-status"
                    ).innerText =
                        "Checked In";


                    document.getElementById(
                        "last-attendance-date"
                    ).innerText =
                        "Last Attendance Date: " +
                        attendanceDate;


                    document.getElementById(
                        "last-check-in-time"
                    ).innerText =
                        "Last Check In: " +
                        data.message.time;


                    document.getElementById(
                        "last-check-out-time"
                    ).innerText =
                        "Last Check Out: Not yet";

                }


                if (action === "OUT") {

                    activeCheckInDate =
                        null;


                    document.getElementById(
                        "check-out-form"
                    ).style.display =
                        "none";


                    document.getElementById(
                        "check-out-button"
                    ).style.display =
                        "none";


                    document.getElementById(
                        "check-in-button"
                    ).style.display =
                        "inline-block";


                    document.getElementById(
                        "attendance-status"
                    ).innerText =
                        "Completed";


                    document.getElementById(
                        "last-attendance-date"
                    ).innerText =
                        "Last Attendance Date: " +
                        attendanceDate;


                    document.getElementById(
                        "last-check-out-time"
                    ).innerText =
                        "Last Check Out: " +
                        data.message.time;

                }


                loadAttendance();

                return;

            }


            const errorMessage =
                getBackendErrorMessage(
                    data
                );


            // =================================================
            // HOLIDAY BACKEND ERROR
            // =================================================

            if (
                errorMessage
                    .toLowerCase()
                    .includes("holiday")
            ) {

                const holiday =
                    findHoliday(
                        attendanceDate
                    );


                messageElement.innerText =
                    "";


                showHolidayPopup(
                    holiday
                );


                return;

            }


            messageElement.innerText =
                errorMessage;

        }
    )

    .catch(
        error => {

            console.error(
                "Attendance error:",
                error
            );


            messageElement.innerText =
                "Something went wrong.";

        }
    );

}
// =====================================================
// CONTROL NORMAL ATTENDANCE FOR HOLIDAY
// =====================================================

function updateNormalAttendanceForDate(
    attendanceDate
) {

    if (!attendanceDate) {
        return;
    }


    const holiday =
        findHoliday(
            attendanceDate
        );


    const checkInButton =
        document.getElementById(
            "check-in-button"
        );


    const checkOutButton =
        document.getElementById(
            "check-out-button"
        );


    const checkInForm =
        document.getElementById(
            "check-in-form"
        );


    const checkOutForm =
        document.getElementById(
            "check-out-form"
        );


    if (holiday) {

        // ---------------------------------------------
        // HOLIDAY
        // ---------------------------------------------

        if (checkInButton) {

            checkInButton.style.display =
                "none";

        }


        if (checkOutButton) {

            checkOutButton.style.display =
                "none";

        }


        if (checkInForm) {

            checkInForm.style.display =
                "none";

        }


        if (checkOutForm) {

            checkOutForm.style.display =
                "none";

        }


        console.log(
            "Normal attendance disabled for holiday:",
            attendanceDate
        );


        return;

    }


    // ---------------------------------------------
    // NORMAL WORKING DAY
    // ---------------------------------------------

    if (
        activeCheckInDate
    ) {

        if (checkInButton) {

            checkInButton.style.display =
                "none";

        }


        if (checkOutButton) {

            checkOutButton.style.display =
                "inline-block";

        }

    }

    else {

        if (checkInButton) {

            checkInButton.style.display =
                "inline-block";

        }


        if (checkOutButton) {

            checkOutButton.style.display =
                "none";

        }

    }


    console.log(
        "Normal attendance enabled:",
        attendanceDate
    );

}

// =====================================================
// NORMAL CHECK IN DATE CHANGE
// =====================================================

const checkInDateInput =
    document.getElementById(
        "check-in-date"
    );

if (checkInDateInput) {

    checkInDateInput.addEventListener(
        "change",
        function () {

            updateNormalAttendanceForDate(
                this.value
            );

        }
    );

}


// =====================================================
// NORMAL CHECK OUT DATE CHANGE
// =====================================================

const checkOutDateInput =
    document.getElementById(
        "check-out-date"
    );

if (checkOutDateInput) {

    checkOutDateInput.addEventListener(
        "change",
        function () {

            updateNormalAttendanceForDate(
                this.value
            );

        }
    );

}

// =====================================================
// CHECK IN BUTTON
// =====================================================

document
    .getElementById(
        "check-in-button"
    )
    .addEventListener(
        "click",
        function () {

            this.style.display =
                "none";


            document.getElementById(
                "check-in-form"
            ).style.display =
                "block";


            document.getElementById(
                "check-in-message"
            ).innerText =
                "";


            document.getElementById(
                "check-in-date"
            ).value =
                getTodayDate();


            document.getElementById(
                "check-in-time"
            ).value =
                "";

        }
    );


// =====================================================
// CHECK IN DATE CHANGE
// =====================================================

document
    .getElementById(
        "check-in-date"
    )
    .addEventListener(
        "change",
        function () {

            const holiday =
                findHoliday(
                    this.value
                );


            if (holiday) {

                showHolidayPopup(
                    holiday
                );

            }

        }
    );


// =====================================================
// CANCEL CHECK IN
// =====================================================

document
    .getElementById(
        "cancel-check-in-button"
    )
    .addEventListener(
        "click",
        function () {

            document.getElementById(
                "check-in-form"
            ).style.display =
                "none";


            document.getElementById(
                "check-in-button"
            ).style.display =
                "inline-block";


            document.getElementById(
                "check-in-message"
            ).innerText =
                "";

        }
    );


// =====================================================
// SUBMIT CHECK IN
// =====================================================

document
    .getElementById(
        "submit-check-in-button"
    )
    .addEventListener(
        "click",
        function () {

            const date =
                document.getElementById(
                    "check-in-date"
                ).value;


            const time =
                document.getElementById(
                    "check-in-time"
                ).value;


            if (!date) {

                document.getElementById(
                    "check-in-message"
                ).innerText =
                    "Please select a date.";

                return;

            }


            if (!time) {

                document.getElementById(
                    "check-in-message"
                ).innerText =
                    "Please select a time.";

                return;

            }


            submitAttendance(
                "IN",
                date,
                time
            );

        }
    );


// =====================================================
// CHECK OUT BUTTON
// =====================================================

document
    .getElementById(
        "check-out-button"
    )
    .addEventListener(
        "click",
        function () {

            this.style.display =
                "none";


            document.getElementById(
                "check-out-form"
            ).style.display =
                "block";


            document.getElementById(
                "check-out-message"
            ).innerText =
                "";


            if (activeCheckInDate) {

                document.getElementById(
                    "check-out-date"
                ).value =
                    activeCheckInDate;

            }

            else {

                document.getElementById(
                    "check-out-date"
                ).value =
                    getTodayDate();

            }


            document.getElementById(
                "check-out-time"
            ).value =
                "";

        }
    );


// =====================================================
// CHECK OUT DATE CHANGE
// =====================================================

document
    .getElementById(
        "check-out-date"
    )
    .addEventListener(
        "change",
        function () {

            const holiday =
                findHoliday(
                    this.value
                );


            if (holiday) {

                showHolidayPopup(
                    holiday
                );

            }

        }
    );


// =====================================================
// CANCEL CHECK OUT
// =====================================================

document
    .getElementById(
        "cancel-check-out-button"
    )
    .addEventListener(
        "click",
        function () {

            document.getElementById(
                "check-out-form"
            ).style.display =
                "none";


            document.getElementById(
                "check-out-button"
            ).style.display =
                "inline-block";


            document.getElementById(
                "check-out-message"
            ).innerText =
                "";

        }
    );


// =====================================================
// SUBMIT CHECK OUT
// =====================================================

document
    .getElementById(
        "submit-check-out-button"
    )
    .addEventListener(
        "click",
        function () {

            const date =
                document.getElementById(
                    "check-out-date"
                ).value;


            const time =
                document.getElementById(
                    "check-out-time"
                ).value;


            if (!date) {

                document.getElementById(
                    "check-out-message"
                ).innerText =
                    "Please select a date.";

                return;

            }


            if (!time) {

                document.getElementById(
                    "check-out-message"
                ).innerText =
                    "Please select a time.";

                return;

            }


            submitAttendance(
                "OUT",
                date,
                time
            );

        }
    );


// =====================================================
// HOLIDAY ATTENDANCE BUTTON
// =====================================================

document
    .getElementById(
        "mark-holiday-attendance-button"
    )
    .addEventListener(
        "click",
        function () {

            const form =
                document.getElementById(
                    "holiday-attendance-form"
                );


            const message =
                document.getElementById(
                    "holiday-attendance-message"
                );


            form.style.display =
                "block";


            message.innerText =
                "";


            activeHolidayAttendanceDate =
                null;


            loadHolidayDropdown();

        }
    );


// =====================================================
// LOAD HOLIDAY DROPDOWN
// =====================================================
function loadHolidayDropdown() {

    const select =
        document.getElementById(
            "holiday-attendance-date"
        );

    if (!select) {
        return;
    }

    select.innerHTML = "";

    const defaultOption =
        document.createElement(
            "option"
        );

    defaultOption.value = "";

    defaultOption.innerText =
        "Select Holiday";

    select.appendChild(
        defaultOption
    );

    employeeHolidays.forEach(
        holiday => {

            const option =
                document.createElement(
                    "option"
                );

            option.value =
                holiday.holiday_date;

            option.innerText =
                formatHolidayDate(
                    holiday.holiday_date
                ) +
                " - " +
                (
                    holiday.description ||
                    "Company Holiday"
                );

            select.appendChild(
                option
            );

        }
    );

    document.getElementById(
        "holiday-attendance-time"
    ).value = "";

    // --------------------------------------------------
    // RESET BUTTONS
    // --------------------------------------------------

    const checkInButton =
        document.getElementById(
            "submit-holiday-check-in-button"
        );

    const checkOutButton =
        document.getElementById(
            "submit-holiday-check-out-button"
        );

    const message =
        document.getElementById(
            "holiday-attendance-message"
        );

    if (checkInButton) {
        checkInButton.style.display =
            "inline-block";
    }

    if (checkOutButton) {
        checkOutButton.style.display =
            "none";
    }

    if (message) {
        message.innerText = "";
    }

    // --------------------------------------------------
    // CHECK SELECTED HOLIDAY ATTENDANCE STATUS
    // --------------------------------------------------

    select.addEventListener(
        "change",
        function () {

            const selectedDate =
                select.value;

            if (!selectedDate) {

                if (checkInButton) {
                    checkInButton.style.display =
                        "inline-block";
                }

                if (checkOutButton) {
                    checkOutButton.style.display =
                        "none";
                }

                if (message) {
                    message.innerText = "";
                }

                activeHolidayAttendanceDate =
                    null;

                return;
            }

            message.innerText =
                "Checking holiday attendance status...";

            fetch(
                "/api/method/hrms_assignment.api.attendance.get_holiday_attendance_status"
                + "?attendance_date="
                + encodeURIComponent(
                    selectedDate
                )
            )
            .then(
                response =>
                    response.json()
            )
            .then(
                data => {

                    console.log(
                        "Holiday attendance status:",
                        data
                    );

                    const status =
                        data.message &&
                        data.message.status;

                    // ----------------------------------
                    // NOT CHECKED IN
                    // ----------------------------------

                    if (
                        status ===
                        "NOT_CHECKED_IN"
                    ) {

                        activeHolidayAttendanceDate =
                            null;

                        if (checkInButton) {
                            checkInButton.style.display =
                                "inline-block";
                        }

                        if (checkOutButton) {
                            checkOutButton.style.display =
                                "none";
                        }

                        message.innerText =
                            "You can check in for this holiday.";

                        return;
                    }

                    // ----------------------------------
                    // CHECKED IN - SHOW CHECKOUT
                    // ----------------------------------

                    if (
                        status ===
                        "CHECKED_IN"
                    ) {

                        activeHolidayAttendanceDate =
                            selectedDate;

                        if (checkInButton) {
                            checkInButton.style.display =
                                "none";
                        }

                        if (checkOutButton) {
                            checkOutButton.style.display =
                                "inline-block";
                        }

                        message.innerText =
                            "Holiday check-in already exists. You can check out.";

                        return;
                    }

                    // ----------------------------------
                    // COMPLETED
                    // ----------------------------------

                    if (
                        status ===
                        "COMPLETED"
                    ) {

                        activeHolidayAttendanceDate =
                            null;

                        if (checkInButton) {
                            checkInButton.style.display =
                                "none";
                        }

                        if (checkOutButton) {
                            checkOutButton.style.display =
                                "none";
                        }

                        message.innerText =
                            "Holiday attendance is already completed.";

                        return;
                    }

                    // ----------------------------------
                    // UNKNOWN STATUS
                    // ----------------------------------

                    activeHolidayAttendanceDate =
                        null;

                    if (checkInButton) {
                        checkInButton.style.display =
                            "inline-block";
                    }

                    if (checkOutButton) {
                        checkOutButton.style.display =
                            "none";
                    }

                    message.innerText =
                        "Unable to determine holiday attendance status.";

                }
            )
            .catch(
                error => {

                    console.error(
                        "Holiday attendance status error:",
                        error
                    );

                    if (checkInButton) {
                        checkInButton.style.display =
                            "inline-block";
                    }

                    if (checkOutButton) {
                        checkOutButton.style.display =
                            "none";
                    }

                    message.innerText =
                        "Unable to check holiday attendance status.";

                }
            );

        }
    );
}


// =====================================================
// SUBMIT HOLIDAY ATTENDANCE
// =====================================================

function submitHolidayAttendance(
    action
) {

    const date =
        document.getElementById(
            "holiday-attendance-date"
        ).value;


    const time =
        document.getElementById(
            "holiday-attendance-time"
        ).value;


    const message =
        document.getElementById(
            "holiday-attendance-message"
        );


    if (!date) {

        message.innerText =
            "Please select a holiday.";

        return;

    }


    if (!time) {

        message.innerText =
            "Please select a time.";

        return;

    }


    const holiday =
        findHoliday(
            date
        );


    if (!holiday) {

        message.innerText =
            "Please select a valid company holiday.";

        return;

    }


    message.innerText =
        action === "IN"
            ? "Marking holiday check in..."
            : "Marking holiday check out...";


    fetch(
        "/api/method/hrms_assignment.api.attendance.employee_holiday_attendance",
        {

            method: "POST",

            headers: {

                "Accept":
                    "application/json",

                "Content-Type":
                    "application/json",

                "X-Frappe-CSRF-Token":
                    document.querySelector(
                        'meta[name="csrf-token"]'
                    ).content

            },

            body: JSON.stringify({

                action:
                    action,

                attendance_date:
                    date,

                attendance_time:
                    time

            })

        }
    )

    .then(response => response.json())

    .then(data => {

        console.log(
            "Holiday attendance response:",
            data
        );


        if (
            data.message &&
            data.message.success
        ) {

            message.innerText =
                data.message.message;


            if (action === "IN") {

                activeHolidayAttendanceDate =
                    date;


                document.getElementById(
                    "submit-holiday-check-in-button"
                ).style.display =
                    "none";


                document.getElementById(
                    "submit-holiday-check-out-button"
                ).style.display =
                    "inline-block";


                document.getElementById(
                    "holiday-attendance-time"
                ).value =
                    "";


                return;

            }


            if (action === "OUT") {

                activeHolidayAttendanceDate =
                    null;


                document.getElementById(
                    "submit-holiday-check-in-button"
                ).style.display =
                    "inline-block";


                document.getElementById(
                    "submit-holiday-check-out-button"
                ).style.display =
                    "none";


                document.getElementById(
                    "holiday-attendance-time"
                ).value =
                    "";


                loadAttendance();

                return;

            }

        }


        message.innerText =
            getBackendErrorMessage(
                data
            );

    })

    .catch(error => {

        console.error(
            "Holiday attendance error:",
            error
        );


        message.innerText =
            "Something went wrong while recording holiday attendance.";

    });

}


// =====================================================
// HOLIDAY CHECK IN
// =====================================================

document
    .getElementById(
        "submit-holiday-check-in-button"
    )
    .addEventListener(
        "click",
        function () {

            submitHolidayAttendance(
                "IN"
            );

        }
    );


// =====================================================
// HOLIDAY CHECK OUT
// =====================================================

document
    .getElementById(
        "submit-holiday-check-out-button"
    )
    .addEventListener(
        "click",
        function () {

            submitHolidayAttendance(
                "OUT"
            );

        }
    );


// =====================================================
// CANCEL HOLIDAY ATTENDANCE
// =====================================================

document
    .getElementById(
        "cancel-holiday-attendance-button"
    )
    .addEventListener(
        "click",
        function () {

            document.getElementById(
                "holiday-attendance-form"
            ).style.display =
                "none";


            document.getElementById(
                "holiday-attendance-message"
            ).innerText =
                "";


            activeHolidayAttendanceDate =
                null;

        }
    );


// =====================================================
// PAGE INITIALIZATION
// =====================================================
getCurrentEmployee()
    .then(() => {

        return loadEmployeeHolidays();

    })
    .then(() => {

        loadAttendance();

    })
    .catch(error => {

        console.error(
            "Employee loading error:",
            error
        );

        document.getElementById(
            "attendance-status"
        ).innerText =
            error.message;

    });

// =====================================================
// LOGOUT
// =====================================================

document
    .getElementById(
        "logout-button"
    )
    .addEventListener(
        "click",
        function () {

            fetch(
                "/api/method/logout",
                {

                    method: "POST",

                    headers: {

                        "X-Frappe-CSRF-Token":
                            document.querySelector(
                                'meta[name="csrf-token"]'
                            ).content

                    }

                }
            )

            .then(() => {

                window.location.href =
                    "/employee-login";

            });

        }
    );


// =====================================================
// LEAVE APPLICATION
// =====================================================

document
    .getElementById(
        "leave-application-button"
    )
    .addEventListener(
        "click",
        function () {

            window.location.href =
                "/leave-application";

        }
    );


// =====================================================
// SALARY SLIP
// =====================================================

document
    .getElementById(
        "salary-slip-button"
    )
    .addEventListener(
        "click",
        function () {

            window.location.href =
                "/salary-slip";

        }
    );
// =====================================================
// HOLIDAY POPUP - OK BUTTON
// =====================================================

document.addEventListener(
    "click",
    function (event) {

        if (
            event.target &&
            event.target.id ===
                "holiday-modal-close"
        ) {

            const modal =
                document.getElementById(
                    "holiday-modal"
                );

            if (modal) {

                modal.style.display =
                    "none";

            }

        }

    }
);