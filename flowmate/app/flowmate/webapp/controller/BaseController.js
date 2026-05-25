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

        formatStatusState(sStatus) {
            switch ((sStatus || "").toUpperCase()) {
                case "APPROVED":
                case "COMPLETED":
                case "SUBMITTED":
                case "CLEAN":
                    return "Success";
                case "OPEN":
                case "IN_PROGRESS":
                case "PENDING":
                    return "Information";
                case "SENT_BACK":
                    return "Warning";
                case "REJECTED":
                case "FAILED":
                case "INFECTED":
                    return "Error";
                default:
                    return "None";
            }
        },

        onDataRequested() {
            this._iPendingDataRequests = (this._iPendingDataRequests || 0) + 1;
            this._updateBusyState();
        },

        onDataReceived() {
            this._iPendingDataRequests = Math.max((this._iPendingDataRequests || 0) - 1, 0);
            this._updateBusyState();
        },

        showBusy() {
            this._iPendingOperations = (this._iPendingOperations || 0) + 1;
            this._updateBusyState();
        },

        hideBusy() {
            this._iPendingOperations = Math.max((this._iPendingOperations || 0) - 1, 0);
            this._updateBusyState();
        },

        _updateBusyState() {
            const oView = this.getView();
            const bBusy = Boolean(this._iPendingDataRequests || this._iPendingOperations);

            oView.setBusyIndicatorDelay(0);
            oView.setBusy(bBusy);
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
            if (this.getModel("permissions").getProperty("/isAdmin")) {
                this.navTo("RouteAdminProcessConfig");
            }
        },

        onNavToDelegations() {
            this.navTo("RouteDelegations");
        },

        onNavToUserAdministration() {
            if (this.getModel("permissions").getProperty("/isAdmin")) {
                this.navTo("RouteUserAdministration");
            }
        },

        async requireAdministrator() {
            const oPermissions = this.getModel("permissions");

            if (!oPermissions.getProperty("/loaded")) {
                await this.getOwnerComponent()._loadPermissions();
            }

            if (!oPermissions.getProperty("/isAdmin")) {
                MessageToast.show(this.getText("administratorRequiredMessage"));
                this.navTo("RouteDashboard");
                return false;
            }

            return true;
        },

        async onNotifyAssignee(oEvent) {
            const oContext = oEvent.getSource().getBindingContext();
            const sAssignee = oContext && oContext.getProperty("assignedTo");

            if (!sAssignee) {
                MessageToast.show(this.getText("assigneeMissingMessage"));
                return;
            }

            let sRecipient = sAssignee;

            this.showBusy();

            try {
                const oResolvedRecipient = await this.callAction("resolveNotificationRecipient", {
                    userId: sAssignee
                });

                sRecipient = oResolvedRecipient.recipient || sAssignee;

                if (oResolvedRecipient.delegated) {
                    MessageToast.show(this.getText("notificationDelegatedMessage", [sRecipient]));
                }
            } catch (oError) {
                MessageToast.show(oError.message || this.getText("actionFailedMessage"));
                return;
            } finally {
                this.hideBusy();
            }

            const sTaskName = oContext.getProperty("taskName") || this.getText("taskFallbackName");
            const sRequestTitle = oContext.getProperty("request/title") || oContext.getProperty("request_ID") || "";
            const sSubject = this.getText("taskNotificationSubject", [sTaskName]);
            const sBody = this.getText("taskNotificationBody", [
                sTaskName,
                sRequestTitle,
                window.location.href
            ]);

            window.location.href = `mailto:${encodeURIComponent(sRecipient)}?subject=${encodeURIComponent(sSubject)}&body=${encodeURIComponent(sBody)}`;
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

        updateEntry(sPath, oPayload) {
            return new Promise((resolve, reject) => {
                this.getModel().update(sPath, oPayload, {
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
