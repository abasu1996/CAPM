sap.ui.define([
    "sap/m/MessageToast",
    "sap/ui/core/mvc/Controller"
], (MessageToast, Controller) => {
    "use strict";

    const SERVICE_V4_URL = "/odata/v4/flowmate/";

    return Controller.extend("flowmate.controller.BaseController", {
        getRouter() {
            return this.getOwnerComponent().getRouter();
        },

        getModel(sName) {
            return this.getOwnerComponent().getModel(sName);
        },

        getText(sKey, aArgs) {
            return this.getModel("i18n").getResourceBundle().getText(sKey, aArgs);
        },

        setOneColumnLayout() {
        },

        setTwoColumnLayout() {
        },

        navTo(sRoute, oParameters) {
            this.getRouter().navTo(sRoute, oParameters || {});
        },

        onNavToDashboard() {
            this.navTo("RouteDashboard");
        },

        onNavToRequests() {
            this.navTo("RouteMyRequests");
        },

        onNavToTasks() {
            this.navTo("RouteMyTasks");
        },

        onNavToCreateRequest() {
            this.navTo("RouteRequestCreate");
        },

        onNavToAdminConfig() {
            this.navTo("RouteAdminProcessConfig");
        },

        onNotifyAssignee(oEvent) {
            const oContext = oEvent.getSource().getBindingContext();
            const sAssignee = oContext && oContext.getProperty("assignedTo");

            if (!sAssignee) {
                MessageToast.show(this.getText("assigneeMissingMessage"));
                return;
            }

            const sTaskName = oContext.getProperty("taskName") || this.getText("taskFallbackName");
            const sRequestTitle = oContext.getProperty("request/title") || oContext.getProperty("request_ID") || "";
            const sSubject = this.getText("taskNotificationSubject", [sTaskName]);
            const sBody = this.getText("taskNotificationBody", [
                sTaskName,
                sRequestTitle,
                window.location.href
            ]);

            window.location.href = `mailto:${encodeURIComponent(sAssignee)}?subject=${encodeURIComponent(sSubject)}&body=${encodeURIComponent(sBody)}`;
        },

        createEntry(sPath, oPayload) {
            return new Promise((resolve, reject) => {
                this.getModel().create(sPath, oPayload, {
                    success: resolve,
                    error: reject
                });
            });
        },

        removeEntry(sPath) {
            return new Promise((resolve, reject) => {
                this.getModel().remove(sPath, {
                    success: resolve,
                    error: reject
                });
            });
        },

        async callAction(sAction, oPayload) {
            const sToken = await this._fetchCsrfToken();
            const oResponse = await fetch(`${SERVICE_V4_URL}${sAction}`, {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "X-CSRF-Token": sToken
                },
                body: JSON.stringify(oPayload || {})
            });

            if (!oResponse.ok) {
                let sMessage = this.getText("actionFailedMessage");

                try {
                    const oBody = await oResponse.json();
                    sMessage = oBody?.error?.message || sMessage;
                } catch (oError) {
                    // Keep fallback message.
                }

                throw new Error(sMessage);
            }

            return oResponse.json();
        },

        async _fetchCsrfToken() {
            const oResponse = await fetch(SERVICE_V4_URL, {
                method: "GET",
                credentials: "same-origin",
                headers: {
                    "X-CSRF-Token": "Fetch"
                }
            });

            return oResponse.headers.get("X-CSRF-Token") || "";
        }
    });
});
