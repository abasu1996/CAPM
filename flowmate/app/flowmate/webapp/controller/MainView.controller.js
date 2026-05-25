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
            this._readCount("/ProcessRequests", "/requestsCount", "/requestsState");
            this._readCount("/ProcessTasks", "/tasksCount", "/tasksState");
        },

        _readCount(sPath, sPropertyPath, sStatePath) {
            const oModel = this.getModel();
            const oDashboardModel = this.getView().getModel("dashboard");

            oDashboardModel.setProperty(sStatePath, "Loading");
            oModel.read(`${sPath}/$count`, {
                success: (sCount) => {
                    oDashboardModel.setProperty(sPropertyPath, Number(sCount));
                    oDashboardModel.setProperty(sStatePath, "Loaded");
                },
                error: () => {
                    oDashboardModel.setProperty(sStatePath, "Failed");
                }
            });
        }
    });
});
