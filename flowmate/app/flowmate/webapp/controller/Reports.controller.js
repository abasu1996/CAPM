sap.ui.define([
    "flowmate/controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox"
], (BaseController, JSONModel, MessageBox) => {
    "use strict";

    return BaseController.extend("flowmate.controller.Reports", {
        onInit() {
            const oTo = new Date();
            const oFrom = new Date(oTo);
            oFrom.setDate(oFrom.getDate() - 89);
            this.getView().setModel(new JSONModel({
                catalogueVisible: true,
                selectedDashboard: "operational",
                selectedDashboardTitle: this.getText("operationalDashboardTitle"),
                dashboards: [
                    { key: "operational", title: this.getText("operationalDashboardTitle"), description: this.getText("operationalDashboardDescription"), icon: "sap-icon://business-objects-experience" },
                    { key: "sla", title: this.getText("slaDashboardTitle"), description: this.getText("slaDashboardDescription"), icon: "sap-icon://quality-issue" },
                    { key: "teams", title: this.getText("teamDashboardTitle"), description: this.getText("teamDashboardDescription"), icon: "sap-icon://collaborate" },
                    { key: "trends", title: this.getText("trendDashboardTitle"), description: this.getText("trendDashboardDescription"), icon: "sap-icon://line-chart" },
                    { key: "users", title: this.getText("userActivityDashboardTitle"), description: this.getText("userActivityDashboardDescription"), icon: "sap-icon://employee" },
                    { key: "audit", title: this.getText("auditDashboardTitle"), description: this.getText("auditDashboardDescription"), icon: "sap-icon://history" }
                ],
                filters: {
                    fromDate: oFrom,
                    toDate: oTo,
                    processTypeCode: "",
                    statusCode: ""
                },
                totalRequests: 0,
                openRequests: 0,
                completedRequests: 0,
                overdueRequests: 0,
                slaCompliancePercent: 100,
                statusBreakdown: [],
                processBreakdown: [],
                monthlyTrend: [],
                teamWorkload: [],
                userActivity: [],
                auditActivity: [],
                overdueTasks: [],
                loaded: false
            }), "reports");
            this.getRouter().getRoute("RouteReports").attachPatternMatched(this.onRouteMatched, this);
        },

        onRouteMatched() {
            this.setOneColumnLayout();
            this._showCatalogue();
        },

        onDashboardTilePress(oEvent) {
            this._openDashboard(oEvent.getSource().data("dashboardKey"));
        },

        onDashboardSelectionChange(oEvent) {
            this._openDashboard(oEvent.getParameter("selectedItem").getKey());
        },

        onShowDashboardCatalogue() {
            this._showCatalogue();
        },

        _showCatalogue() {
            this.getView().getModel("reports").setProperty("/catalogueVisible", true);
        },

        _openDashboard(sKey) {
            const oModel = this.getView().getModel("reports");
            const oDashboard = oModel.getProperty("/dashboards").find((oItem) => oItem.key === sKey);
            if (!oDashboard) {
                return;
            }
            oModel.setProperty("/selectedDashboard", sKey);
            oModel.setProperty("/selectedDashboardTitle", oDashboard.title);
            oModel.setProperty("/catalogueVisible", false);
            this._loadDashboard();
        },

        isDashboardSelected(sSelected, sExpected) {
            return sSelected === sExpected;
        },

        onApplyFilters() {
            this._loadDashboard();
        },

        onResetFilters() {
            const oTo = new Date();
            const oFrom = new Date(oTo);
            oFrom.setDate(oFrom.getDate() - 89);
            this.getView().getModel("reports").setProperty("/filters", {
                fromDate: oFrom,
                toDate: oTo,
                processTypeCode: "",
                statusCode: ""
            });
            this._loadDashboard();
        },

        async onExportPdf() {
            const oModel = this.getView().getModel("reports");
            const oFilters = oModel.getProperty("/filters");
            if (!oFilters.fromDate || !oFilters.toDate || oFilters.fromDate > oFilters.toDate) {
                MessageBox.warning(this.getText("reportsInvalidDateRange"));
                return;
            }

            try {
                // Always refresh first so the exported dashboard reflects the current filter controls.
                if (!await this._loadDashboard()) {
                    return;
                }
                const oResult = await this.callAction("exportReportDashboardPdf", {
                    dashboardKey: oModel.getProperty("/selectedDashboard"),
                    filter: {
                        fromDate: this._formatDate(oFilters.fromDate),
                        toDate: this._formatDate(oFilters.toDate),
                        processTypeCode: oFilters.processTypeCode || null,
                        statusCode: oFilters.statusCode || null
                    }
                });
                this._downloadPdf(oResult.value || oResult);
            } catch (oError) {
                MessageBox.error(this.getErrorMessage(oError, this.getText("dashboardPdfExportFailed")));
            }
        },

        _downloadPdf(oExport) {
            const sBinary = String(oExport.content || "").replace(/^data:application\/pdf;base64,/, "");
            const sDecoded = window.atob(sBinary);
            const aBytes = new Uint8Array(sDecoded.length);
            for (let iIndex = 0; iIndex < sDecoded.length; iIndex += 1) {
                aBytes[iIndex] = sDecoded.charCodeAt(iIndex);
            }
            const sUrl = URL.createObjectURL(new Blob([aBytes], { type: oExport.mimeType || "application/pdf" }));
            const oLink = document.createElement("a");
            oLink.href = sUrl;
            oLink.download = oExport.fileName || "flowmate-dashboard.pdf";
            oLink.click();
            URL.revokeObjectURL(sUrl);
        },

        onOverdueTaskPress(oEvent) {
            const sTaskId = oEvent.getSource().getBindingContext("reports")?.getProperty("ID");
            if (sTaskId) {
                this.navTo("RouteApprovalDetail", { taskId: sTaskId });
            }
        },

        async _loadDashboard() {
            const oModel = this.getView().getModel("reports");
            const oFilters = oModel.getProperty("/filters");
            if (!oFilters.fromDate || !oFilters.toDate || oFilters.fromDate > oFilters.toDate) {
                MessageBox.warning(this.getText("reportsInvalidDateRange"));
                return false;
            }

            this.showBusy();
            try {
                const oResult = await this.callAction("getReportDashboard", {
                    filter: {
                        fromDate: this._formatDate(oFilters.fromDate),
                        toDate: this._formatDate(oFilters.toDate),
                        processTypeCode: oFilters.processTypeCode || null,
                        statusCode: oFilters.statusCode || null
                    }
                });
                oModel.setData({
                    ...oModel.getData(),
                    filters: oFilters,
                    ...(oResult.value || oResult),
                    loaded: true
                });
                return true;
            } catch (oError) {
                MessageBox.error(this.getErrorMessage(oError, this.getText("reportsLoadFailed")));
                return false;
            } finally {
                this.hideBusy();
            }
        },

        _formatDate(oDate) {
            const iOffset = oDate.getTimezoneOffset();
            return new Date(oDate.getTime() - iOffset * 60000).toISOString().slice(0, 10);
        }
    });
});
