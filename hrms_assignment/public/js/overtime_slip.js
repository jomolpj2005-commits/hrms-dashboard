frappe.ui.form.on("Overtime Details", {

    overtime_duration: function(frm, cdt, cdn) {

        const row = locals[cdt][cdn];

        if (!frm.doc.employee) {
            return;
        }

        const enteredHours = parseFloat(
            row.overtime_duration
        );

        if (isNaN(enteredHours)) {
            return;
        }

        frappe.db.get_value(
            "Employee",
            frm.doc.employee,
            "custom_maximum_overtime_hours_per_day"
        ).then(response => {

            const maximumHours = parseFloat(
                response.message.custom_maximum_overtime_hours_per_day
            );

            if (
                !isNaN(maximumHours) &&
                maximumHours > 0 &&
                enteredHours > maximumHours
            ) {

                frappe.model.set_value(
                    cdt,
                    cdn,
                    "overtime_duration",
                    maximumHours
                );

                frappe.msgprint({
                    title: __("Overtime Limit Exceeded"),
                    message: __(
                        "You are only allowed {0} hours of overtime per day."
                    ).replace(
                        "{0}",
                        maximumHours
                    ),
                    indicator: "red"
                });

            }

        });

    }

});
