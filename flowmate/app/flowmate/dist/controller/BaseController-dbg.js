sap.ui.define([
    "sap/m/MessageToast",
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "flowmate/model/serviceUrl",
    "flowmate/model/errorMessage"
], (MessageToast, Controller, History, Filter, FilterOperator, serviceUrl, errorMessage) => {
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

        getErrorMessage(oError, sFallback) {
            return errorMessage.getMessage(oError, sFallback);
        },

        normalizeError(oError, sFallback) {
            return errorMessage.normalize(oError, sFallback);
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

        isSlaBreached(vDueDate, sStatus) {
            const sNormalizedStatus = String(sStatus || "").toUpperCase();
            const aTerminalStatuses = ["APPROVED", "COMPLETED", "REJECTED", "CANCELLED", "CANCELED"];

            if (!vDueDate || aTerminalStatuses.includes(sNormalizedStatus)) {
                return false;
            }

            const oDueDate = vDueDate instanceof Date
                ? new Date(vDueDate.getFullYear(), vDueDate.getMonth(), vDueDate.getDate())
                : new Date(`${String(vDueDate).slice(0, 10)}T00:00:00`);
            const oToday = new Date();

            oToday.setHours(0, 0, 0, 0);
            return !Number.isNaN(oDueDate.getTime()) && oDueDate < oToday;
        },

        isSlaBreachedAt(vSlaDueAt, vDueDate, sStatus) {
            const sNormalizedStatus = String(sStatus || "").toUpperCase();
            if (["APPROVED", "COMPLETED", "REJECTED", "CANCELLED", "CANCELED"].includes(sNormalizedStatus)) {
                return false;
            }
            if (!vSlaDueAt) {
                return this.isSlaBreached(vDueDate, sStatus);
            }
            const oDeadline = new Date(vSlaDueAt);
            return !Number.isNaN(oDeadline.getTime()) && oDeadline < new Date();
        },

        formatSlaBreachedAtFlag(vSlaDueAt, vDueDate, sStatus) {
            return String(this.isSlaBreachedAt(vSlaDueAt, vDueDate, sStatus));
        },

        formatSlaBreachedFlag(vDueDate, sStatus) {
            return String(this.isSlaBreached(vDueDate, sStatus));
        },

        isWithinSla(vDueDate, sStatus, vCompletedAt) {
            const sNormalizedStatus = String(sStatus || "").toUpperCase();

            if (!vDueDate || ["REJECTED", "CANCELLED", "CANCELED"].includes(sNormalizedStatus)) {
                return false;
            }

            const oDueDate = new Date(`${String(vDueDate).slice(0, 10)}T23:59:59.999`);

            if (Number.isNaN(oDueDate.getTime())) {
                return false;
            }

            if (["APPROVED", "COMPLETED"].includes(sNormalizedStatus)) {
                const oCompletedAt = vCompletedAt ? new Date(vCompletedAt) : null;
                return Boolean(oCompletedAt && !Number.isNaN(oCompletedAt.getTime()) && oCompletedAt <= oDueDate);
            }

            return !this.isSlaBreached(vDueDate, sStatus);
        },

        isWithinSlaAt(vSlaDueAt, vDueDate, sStatus, vCompletedAt) {
            if (!vSlaDueAt) {
                return this.isWithinSla(vDueDate, sStatus, vCompletedAt);
            }
            const sNormalizedStatus = String(sStatus || "").toUpperCase();
            if (["REJECTED", "CANCELLED", "CANCELED"].includes(sNormalizedStatus)) return false;
            const oDeadline = new Date(vSlaDueAt);
            if (Number.isNaN(oDeadline.getTime())) return false;
            if (["APPROVED", "COMPLETED"].includes(sNormalizedStatus)) {
                const oCompletedAt = vCompletedAt ? new Date(vCompletedAt) : null;
                return Boolean(oCompletedAt && !Number.isNaN(oCompletedAt.getTime()) && oCompletedAt <= oDeadline);
            }
            return !this.isSlaBreachedAt(vSlaDueAt, vDueDate, sStatus);
        },

        formatSlaWithinAtFlag(vSlaDueAt, vDueDate, sStatus, vCompletedAt) {
            return String(this.isWithinSlaAt(vSlaDueAt, vDueDate, sStatus, vCompletedAt));
        },

        formatSlaHighlightAt(vSlaDueAt, vDueDate, sStatus, vCompletedAt) {
            if (this.isSlaBreachedAt(vSlaDueAt, vDueDate, sStatus)) return "Error";
            return this.isWithinSlaAt(vSlaDueAt, vDueDate, sStatus, vCompletedAt) ? "Success" : "None";
        },

        formatRequestHighlightAt(vSlaDueAt, vDueDate, sStatus, sPriority, vCompletedAt) {
            if (this.isSlaBreachedAt(vSlaDueAt, vDueDate, sStatus)) return "Error";
            if (this.isWithinSlaAt(vSlaDueAt, vDueDate, sStatus, vCompletedAt)) return "Success";
            return this.formatRequestHighlight(null, sStatus, sPriority, vCompletedAt);
        },

        formatSlaWithinFlag(vDueDate, sStatus, vCompletedAt) {
            return String(this.isWithinSla(vDueDate, sStatus, vCompletedAt));
        },

        formatSlaHighlight(vDueDate, sStatus, vCompletedAt) {
            if (this.isSlaBreached(vDueDate, sStatus)) {
                return "Error";
            }

            return this.isWithinSla(vDueDate, sStatus, vCompletedAt) ? "Success" : "None";
        },

        formatRequestHighlight(vDueDate, sStatus, sPriority, vCompletedAt) {
            if (this.isSlaBreached(vDueDate, sStatus)) {
                return "Error";
            }

            if (this.isWithinSla(vDueDate, sStatus, vCompletedAt)) {
                return "Success";
            }

            switch ((sPriority || "").toLowerCase()) {
                case "critical": return "Error";
                case "high": return "Warning";
                case "medium": return "Information";
                case "low": return "Success";
                default: return "None";
            }
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

        onNavToReports() {
            this.navTo("RouteReports");
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

            this.showBusy();

            try {
                const oResult = await this.callAction("notifyTaskProcessor", {
                    taskId: sTaskId
                });
                MessageToast.show(this.getText("processorNotificationSentMessage", [oResult.recipientCount]));
            } catch (oError) {
                MessageToast.show(this.getErrorMessage(oError, this.getText("processorEmailMissingMessage")));
            } finally {
                this.hideBusy();
            }
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
                MessageToast.show(this.getErrorMessage(oError, this.getText("teamMembersEmailMissingMessage")));
            } finally {
                this.hideBusy();
            }
        },

        createEntry(sPath, oPayload) {
            return new Promise((resolve, reject) => {
                this.getModel().create(sPath, oPayload, {
                    success: (oData) => resolve(oData || oPayload),
                    error: (oError) => reject(this.normalizeError(oError))
                });
            });
        },

        removeEntry(sPath) {
            return new Promise((resolve, reject) => {
                this.getModel().remove(sPath, {
                    success: resolve,
                    error: (oError) => reject(this.normalizeError(oError))
                });
            });
        },

        updateEntry(sPath, oPayload) {
            return new Promise((resolve, reject) => {
                this.getModel().update(sPath, oPayload, {
                    success: resolve,
                    error: (oError) => reject(this.normalizeError(oError))
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
                const sBody = await oResponse.text();
                throw errorMessage.normalize(sBody, this.getText("actionFailedMessage"), oResponse.status);
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

            if (!oResponse.ok) {
                const sBody = await oResponse.text();
                throw errorMessage.normalize(sBody, this.getText("actionFailedMessage"), oResponse.status);
            }

            return oResponse.headers.get("X-CSRF-Token") || "";
        }
    });
});
