sap.ui.define([
    "flowmate/controller/BaseController",
    "sap/m/MessageToast",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], (BaseController, MessageToast, Filter, FilterOperator) => {
    "use strict";

    return BaseController.extend("flowmate.controller.MyTasks", {
        onInit() {
            this.getRouter().getRoute("RouteMyTasks").attachPatternMatched(this.onRouteMatched, this);
        },

        onRouteMatched() {
            this.setOneColumnLayout();
        },

        onTaskPress(oEvent) {
            this._openTask(oEvent.getSource().getBindingContext());
        },

        onOpenSelectedTask() {
            const oSelectedItem = this.byId("tasksTable").getSelectedItem();
            const oContext = oSelectedItem && oSelectedItem.getBindingContext();

            if (!oContext) {
                MessageToast.show(this.getText("selectTaskMessage"));
                return;
            }

            this._openTask(oContext);
        },

        onSearch(oEvent) {
            const sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
            const oBinding = this.byId("tasksTable").getBinding("items");

            if (!sQuery) {
                oBinding.filter([]);
                return;
            }

            oBinding.filter([
                new Filter({
                    filters: [
                        new Filter("taskName", FilterOperator.Contains, sQuery),
                        new Filter("assignedTo", FilterOperator.Contains, sQuery),
                        new Filter("role", FilterOperator.Contains, sQuery),
                        new Filter("status_code", FilterOperator.Contains, sQuery),
                        new Filter("decision", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                })
            ]);
        },

        _openTask(oContext) {
            this.navTo("RouteApprovalDetail", {
                taskId: encodeURIComponent(oContext.getProperty("ID"))
            });
        }
    });
});
