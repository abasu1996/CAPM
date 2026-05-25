sap.ui.define([
    "flowmate/controller/BaseController",
    "sap/ui/model/json/JSONModel"
], (BaseController, JSONModel) => {
    "use strict";

    return BaseController.extend("flowmate.controller.MainView", {
        onInit() {
            this.getView().setModel(new JSONModel({
                requestsCount: 0,
                tasksCount: 0
            }), "dashboard");
            this.getRouter().getRoute("RouteDashboard").attachPatternMatched(this.onRouteMatched, this);
        },

        onRouteMatched() {
            this.setOneColumnLayout();
            this._loadDashboardCounts();
        },

        onOpenRequests() {
            this.navTo("RouteMyRequests");
        },

        onOpenTasks() {
            this.navTo("RouteMyTasks");
        },

        onCreateRequest() {
            this.navTo("RouteRequestCreate");
        },

        onOpenConfig() {
            this.navTo("RouteAdminProcessConfig");
        },

        _loadDashboardCounts() {
            this._readCount("/ProcessRequests", "/requestsCount");
            this._readCount("/ProcessTasks", "/tasksCount");
        },

        _readCount(sPath, sPropertyPath) {
            const oModel = this.getModel();
            const oDashboardModel = this.getView().getModel("dashboard");

            oModel.read(`${sPath}/$count`, {
                success: (sCount) => {
                    oDashboardModel.setProperty(sPropertyPath, Number(sCount));
                },
                error: () => {
                    oDashboardModel.setProperty(sPropertyPath, 0);
                }
            });
        }
    });
});
