sap.ui.define([
    "flowmate/controller/BaseController",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], (BaseController, Filter, FilterOperator) => {
    "use strict";

    return BaseController.extend("flowmate.controller.AdminProcessConfig", {
        onInit() {
            this.getRouter().getRoute("RouteAdminProcessConfig").attachPatternMatched(this.onRouteMatched, this);
        },

        onRouteMatched() {
            this.setOneColumnLayout();
        },

        onSearch(oEvent) {
            const sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
            const oBinding = this.byId("configTable").getBinding("items");

            if (!sQuery) {
                oBinding.filter([]);
                return;
            }

            oBinding.filter([
                new Filter({
                    filters: [
                        new Filter("processType_code", FilterOperator.Contains, sQuery),
                        new Filter("stepName", FilterOperator.Contains, sQuery),
                        new Filter("role", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                })
            ]);
        }
    });
});
