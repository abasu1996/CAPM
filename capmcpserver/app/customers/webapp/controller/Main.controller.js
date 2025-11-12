sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (Controller, History, MessageBox, MessageToast) {
    "use strict";

    return Controller.extend("capmcpserver.customers.controller.Main", {
        onInit: function () {
            // Initialization if needed
        },

        onPress: function (oEvent) {
            var oItem = oEvent.getSource();
            var oRouter = this.getOwnerComponent().getRouter();
            var sCustomerID = oItem.getBindingContext().getProperty("CustomerID");
            console.log(sCustomerID);
            
            oRouter.navTo("RouteDetail", {
                key: sCustomerID
            });
        },

        onSelectionChange: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("listItem");
            if (oSelectedItem) {
                var oRouter = this.getOwnerComponent().getRouter();
                var sCustomerID = oSelectedItem.getBindingContext().getProperty("ID");
                
                oRouter.navTo("RouteDetail", {
                    key: sCustomerID
                });
            }
        },

        onCreatePress: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("RouteDetail", {
                key: "create"
            });
        },

        onRefresh: function () {
            var oBinding = this.byId("customersTable").getBinding("items");
            if (oBinding) {
                oBinding.refresh();
                MessageToast.show("Data refreshed");
            }
        }
    });
});
