sap.ui.define([
    "flowmate/controller/BaseController",
    "sap/m/MessageToast",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], (BaseController, MessageToast, Filter, FilterOperator) => {
    "use strict";

    return BaseController.extend("flowmate.controller.MyRequests", {
        onInit() {
            this.getRouter().getRoute("RouteMyRequests").attachPatternMatched(this.onRouteMatched, this);
        },

        onRouteMatched() {
            this.setOneColumnLayout();
        },

        onCreateRequest() {
            this.navTo("RouteRequestCreate");
        },

        onRequestPress(oEvent) {
            this._openRequest(oEvent.getSource().getBindingContext());
        },

        onOpenSelectedRequest() {
            const oSelectedItem = this.byId("requestsTable").getSelectedItem();
            const oContext = oSelectedItem && oSelectedItem.getBindingContext();

            if (!oContext) {
                MessageToast.show(this.getText("selectRequestMessage"));
                return;
            }

            this._openRequest(oContext);
        },

        onSearch(oEvent) {
            const sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
            const oBinding = this.byId("requestsTable").getBinding("items");

            if (!sQuery) {
                oBinding.filter([]);
                return;
            }

            oBinding.filter([
                new Filter({
                    filters: [
                        new Filter("title", FilterOperator.Contains, sQuery),
                        new Filter("processType_code", FilterOperator.Contains, sQuery),
                        new Filter("status_code", FilterOperator.Contains, sQuery),
                        new Filter("department", FilterOperator.Contains, sQuery),
                        new Filter("priority", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                })
            ]);
        },

        _openRequest(oContext) {
            this.navTo("RouteRequestDetail", {
                requestId: encodeURIComponent(oContext.getProperty("ID"))
            });
        }
    });
});
