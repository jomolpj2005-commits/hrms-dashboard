document.getElementById("login-form").addEventListener("submit", function (event) {
    event.preventDefault();

    const loginId = document.getElementById("login-id").value.trim();
    const password = document.getElementById("password").value;

    fetch("/api/method/login", {
        method: "POST",
        headers: {
            "Accept": "application/json",
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            usr: loginId,
            pwd: password
        })
    })
    .then(response => response.json())
    .then(data => {

        console.log("Login response:", data);

        if (data.message === "Logged In" || data.message === "Logged in") {

            // Get the name of the currently logged-in user
            return fetch("/api/method/frappe.auth.get_logged_user", {
                method: "GET",
                headers: {
                    "Accept": "application/json"
                }
            });
        }

        throw new Error("Login failed");

    })
    .then(response => response.json())
    .then(userData => {

        console.log("Logged-in user:", userData);

        const loggedInUser = userData.message;

        // Get full name from User
        return fetch(
            "/api/method/frappe.client.get_value?doctype=User&fieldname=full_name&filters=" +
            encodeURIComponent(JSON.stringify({
                name: loggedInUser
            })),
            {
                method: "GET",
                headers: {
                    "Accept": "application/json"
                }
            }
        );

    })
    .then(response => response.json())
    .then(userData => {

        console.log("User name:", userData);

        let employeeName = userData.message && userData.message.full_name;

        // Fallback if full name is not available
        if (!employeeName) {
            employeeName = document.getElementById("login-id").value;
        }

        showLoginSuccess(employeeName);

    })
    .catch(error => {

        console.error("Login error:", error);

        alert("Login failed. Check Login ID and Password.");

    });
});


// =====================================================
// LOGIN SUCCESS POPUP
// =====================================================

function showLoginSuccess(employeeName) {

    const popup = document.createElement("div");

    popup.id = "login-success-popup";

    popup.innerHTML = `
        <div class="login-success-box">

            <div class="login-success-icon">
                ✓
            </div>

            <h2>Welcome, ${escapeHtml(employeeName)}!</h2>

            <p>Login successful.</p>

        </div>
    `;

    document.body.appendChild(popup);

    const style = document.createElement("style");

    style.innerHTML = `
        #login-success-popup {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.45);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 99999;
        }

        .login-success-box {
            width: 360px;
            max-width: 90%;
            background: #ffffff;
            border-radius: 16px;
            padding: 35px 30px;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
        }

        .login-success-icon {
            width: 65px;
            height: 65px;
            margin: 0 auto 18px;
            border-radius: 50%;
            background: #e8f7ee;
            color: #198754;
            font-size: 36px;
            font-weight: bold;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .login-success-box h2 {
            margin: 0 0 8px;
            font-size: 24px;
            color: #222222;
        }

        .login-success-box p {
            margin: 0;
            font-size: 16px;
            color: #666666;
        }
    `;

    document.head.appendChild(style);

    setTimeout(function () {
        window.location.href = "/employee-dashboard";
    }, 1500);
}


// =====================================================
// SECURITY: ESCAPE HTML
// =====================================================

function escapeHtml(value) {

    const div = document.createElement("div");

    div.textContent = value;

    return div.innerHTML;
}