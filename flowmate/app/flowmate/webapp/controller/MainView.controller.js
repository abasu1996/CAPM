sap.ui.define([
    "flowmate/controller/BaseController"
], (BaseController) => {
    "use strict";

    return BaseController.extend("flowmate.controller.MainView", {
        onInit() {
            this.getRouter().getRoute("RouteDashboard").attachPatternMatched(this.onRouteMatched, this);
        },

        onRouteMatched() {
            this.setOneColumnLayout();
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
        }
    });
});
