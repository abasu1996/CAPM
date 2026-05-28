sap.ui.define([
    "flowmate/controller/BaseController",
    "sap/ui/model/json/JSONModel"
], (BaseController, JSONModel) => {
    "use strict";

    return BaseController.extend("flowmate.controller.MainView", {
        onInit() {
            this.getView().setModel(new JSONModel({
                requestsCount: 0,
                requestsState: "Loading",
                tasksCount: 0,
                tasksState: "Loading"
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

        onOpenDelegations() {
            this.navTo("RouteDelegations");
        },

        _loadDashboardCounts() {
            const oDashboardModel = this.getView().getModel("dashboard");

            oDashboardModel.setProperty("/requestsState", "Loading");
            oDashboardModel.setProperty("/tasksState", "Loading");

            Promise.allSettled([
                this._readCount("/ProcessRequests"),
                this._readCount("/ProcessTasks")
            ]).then(([oRequestsResult, oTasksResult]) => {
                if (oRequestsResult.status === "fulfilled") {
                    oDashboardModel.setProperty("/requestsCount", oRequestsResult.value);
                    oDashboardModel.setProperty("/requestsState", "Loaded");
                } else {
                    oDashboardModel.setProperty("/requestsState", "Failed");
                }

                if (oTasksResult.status === "fulfilled") {
                    oDashboardModel.setProperty("/tasksCount", oTasksResult.value);
                    oDashboardModel.setProperty("/tasksState", "Loaded");
                } else {
                    oDashboardModel.setProperty("/tasksState", "Failed");
                }
            });
        },

        _readCount(sPath) {
            const oModel = this.getModel();

            return new Promise((resolve, reject) => {
                oModel.read(`${sPath}/$count`, {
                    success: (sCount) => resolve(Number(sCount)),
                    error: reject
                });
            });
        }
    });
});
