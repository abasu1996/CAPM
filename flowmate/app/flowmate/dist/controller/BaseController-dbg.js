sap.ui.define([
    "sap/m/MessageToast",
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "flowmate/model/serviceUrl"
], (MessageToast, Controller, History, Filter, FilterOperator, serviceUrl) => {
    "use strict";

    const SERVICE_V4_URL = "odata/v4/flowmate/";

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

        resolveAppUri(sUri) {
            return serviceUrl.resolve(sUri);
        },

        getServiceV4Url(sPath) {
            return this.resolveAppUri(`${SERVICE_V4_URL}${sPath || ""}`);
        },

        formatStatusState(sStatus) {
            switch ((sStatus || "").toUpperCase()) {
                case "APPROVED":
                case "COMPLETED":
                case "SUBMITTED":
                case "CLEAN":
                    return "Success";
                case "OPEN":
                case "DRAFT":
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

        formatStatusText(sStatus) {
            return (sStatus || "")
                .toLowerCase()
                .replace(/_/g, " ")
                .replace(/\b\w/g, (sCharacter) => sCharacter.toUpperCase());
        },

        formatPriorityState(sPriority) {
            switch ((sPriority || "").toLowerCase()) {
                case "critical":
                    return "Error";
                case "high":
                    return "Warning";
                case "medium":
                    return "Information";
                case "low":
                    return "Success";
                default:
                    return "None";
            }
        },

        formatTeamMemberSummary(vTeamMembers) {
            const aMembers = this._normalizeExpandedCollection(vTeamMembers);
            const aNames = [...new Set(aMembers
                .map((oMember) => oMember.displayName || oMember.email)
                .filter(Boolean))];

            return aNames.join(", ");
        },

        onUserSuggest(oEvent) {
            this._filterSuggestionItems(oEvent, [
                "displayName",
                "email",
                "userPrincipalName"
            ], [new Filter("isActive", FilterOperator.EQ, true)]);
        },

        onTeamSuggest(oEvent) {
            this._filterSuggestionItems(oEvent, [
                "teamCode",
                "name",
                "description"
            ], [new Filter("isActive", FilterOperator.EQ, true)]);
        },

        _filterSuggestionItems(oEvent, aSearchProperties, aFixedFilters = []) {
            const oBinding = oEvent.getSource().getBinding("suggestionItems");

            if (!oBinding) {
                return;
            }

            const sQuery = (oEvent.getParameter("suggestValue") || "").trim();
            const aFilters = [...aFixedFilters];

            if (sQuery) {
                aFilters.push(new Filter({
                    filters: aSearchProperties.map((sProperty) => new Filter({
                        path: sProperty,
                        operator: FilterOperator.Contains,
                        value1: sQuery,
                        caseSensitive: false
                    })),
                    and: false
                }));
            }

            oBinding.filter(aFilters);
        },

        _getSuggestionContext(oEvent) {
            return oEvent.getParameter("selectedItem")?.getBindingContext();
        },

        _normalizeExpandedCollection(vCollection) {
            if (Array.isArray(vCollection)) {
                return vCollection;
            }

            if (Array.isArray(vCollection?.results)) {
                return vCollection.results;
            }

            if (Array.isArray(vCollection?.__list)) {
                return vCollection.__list
                    .map((sPath) => this.getModel().getProperty(`/${sPath}`))
                    .filter(Boolean);
            }

            return [];
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

        navTo(sRoute, oParameters, bReplace) {
            this.getRouter().navTo(sRoute, oParameters || {}, Boolean(bReplace));
        },

        navBack(sFallbackRoute, oFallbackParameters) {
            const sPreviousHash = History.getInstance().getPreviousHash();

            if (sPreviousHash !== undefined) {
                window.history.go(-1);
                return;
            }

            this.navTo(sFallbackRoute, oFallbackParameters || {}, true);
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

        async onNotifyProcessor(oEvent) {
            oEvent.cancelBubble?.();

            const oContext = oEvent.getSource().getBindingContext();
            const sTaskId = oContext && oContext.getProperty("ID");

            if (!sTaskId) {
                MessageToast.show(this.getText("selectTaskMessage"));
                return;
            }

            let sRecipient;

            this.showBusy();

            try {
                const oResolvedRecipient = await this.callAction("resolveTaskNotificationRecipient", {
                    taskId: sTaskId
                });

                sRecipient = oResolvedRecipient.recipient;

                if (oResolvedRecipient.delegated) {
                    MessageToast.show(this.getText("notificationDelegatedMessage", [sRecipient]));
                }
            } catch (oError) {
                MessageToast.show(oError.message || this.getText("processorEmailMissingMessage"));
                return;
            } finally {
                this.hideBusy();
            }

            const sTaskName = oContext.getProperty("taskName") || this.getText("taskFallbackName");
            const sRequestTitle = oContext.getProperty("request/title") || oContext.getProperty("request/referenceNumber") || "";
            const sSubject = this.getText("taskNotificationSubject", [sTaskName]);
            const sBody = this.getText("taskNotificationBody", [
                sTaskName,
                sRequestTitle,
                window.location.href
            ]);

            window.location.href = `mailto:${encodeURIComponent(sRecipient)}?subject=${encodeURIComponent(sSubject)}&body=${encodeURIComponent(sBody)}`;
        },

        async onNotifyTaskTeamMembers(oEvent) {
            oEvent.cancelBubble?.();

            const oContext = oEvent.getSource().getBindingContext();
            const sTaskId = oContext && oContext.getProperty("ID");

            if (!sTaskId) {
                MessageToast.show(this.getText("selectTaskMessage"));
                return;
            }

            this.showBusy();

            try {
                const oResolvedRecipients = await this.callAction("resolveTaskTeamNotificationRecipients", {
                    taskId: sTaskId
                });
                const oValue = oResolvedRecipients.value || oResolvedRecipients;
                const sRecipients = oValue.recipients || "";

                if (!sRecipients) {
                    MessageToast.show(this.getText("teamMembersEmailMissingMessage"));
                    return;
                }

                if (oValue.delegatedCount) {
                    MessageToast.show(this.getText("teamNotificationDelegatedMessage", [oValue.delegatedCount]));
                }

                const sTaskName = oContext.getProperty("taskName") || this.getText("taskFallbackName");
                const sRequestTitle = oContext.getProperty("request/title") || oContext.getProperty("request/referenceNumber") || "";
                const sSubject = this.getText("taskNotificationSubject", [sTaskName]);
                const sBody = this.getText("taskNotificationBody", [
                    sTaskName,
                    sRequestTitle,
                    window.location.href
                ]);

                window.location.href = `mailto:${encodeURIComponent(sRecipients)}?subject=${encodeURIComponent(sSubject)}&body=${encodeURIComponent(sBody)}`;
            } catch (oError) {
                MessageToast.show(oError.message || this.getText("teamMembersEmailMissingMessage"));
            } finally {
                this.hideBusy();
            }
        },

        createEntry(sPath, oPayload) {
            return new Promise((resolve, reject) => {
                this.getModel().create(sPath, oPayload, {
                    success: (oData) => resolve(oData || oPayload),
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
            const oResponse = await fetch(this.getServiceV4Url(sAction), {
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
            const oResponse = await fetch(this.getServiceV4Url(), {
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
