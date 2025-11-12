sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/model/json/JSONModel"
], function (Controller, History, MessageBox, MessageToast, JSONModel) {
    "use strict";

    return Controller.extend("capmcpserver.customers.controller.Detail", {
        onInit: function () {
            var oEditModel = new JSONModel({
                isEdit: false,
                isCreate: false
            });
            this.getView().setModel(oEditModel, "editModel");

            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("RouteDetail").attachPatternMatched(this._onObjectMatched, this);
        },

        _onObjectMatched: function (oEvent) {
            var sObjectId = oEvent.getParameter("arguments").key;
            var oModel = this.getView().getModel();
            var oEditModel = this.getView().getModel("editModel");

            if (sObjectId === "create") {
                // Create new customer
                oEditModel.setProperty("/isCreate", true);
                oEditModel.setProperty("/isEdit", false);
                
                var oContext = oModel.createEntry("/Customers", {
                    properties: {
                        CustomerID: "",
                        Name: "",
                        Email: "",
                        Phone: "",
                        Address: ""
                    }
                });
                this.getView().setBindingContext(oContext);
            } else {
                // View/Edit existing customer
                oEditModel.setProperty("/isCreate", false);
                oEditModel.setProperty("/isEdit", false);
                
                this.getView().bindElement({
                    path: "/Customers(" + sObjectId + ")",
                    events: {
                        dataRequested: function () {
                            this.getView().setBusy(true);
                        }.bind(this),
                        dataReceived: function () {
                            this.getView().setBusy(false);
                        }.bind(this)
                    }
                });
            }
        },

        onNavBack: function () {
            var oHistory = History.getInstance();
            var sPreviousHash = oHistory.getPreviousHash();

            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                var oRouter = this.getOwnerComponent().getRouter();
                oRouter.navTo("RouteMain", {}, true);
            }
        },

        onEdit: function () {
            var oEditModel = this.getView().getModel("editModel");
            oEditModel.setProperty("/isEdit", true);
        },

        onSave: function () {
            var oModel = this.getView().getModel();
            var oEditModel = this.getView().getModel("editModel");
            var oContext = this.getView().getBindingContext();

            // Validate required fields
            var sCustomerID = this.byId("customerIDInput").getValue();
            var sName = this.byId("nameInput").getValue();

            if (!sCustomerID || !sName) {
                MessageBox.error("Please fill in all required fields (Customer ID and Name)");
                return;
            }

            var that = this;
            oModel.submitChanges({
                success: function () {
                    MessageToast.show("Customer saved successfully");
                    oEditModel.setProperty("/isEdit", false);
                    oEditModel.setProperty("/isCreate", false);
                    
                    if (oEditModel.getProperty("/isCreate")) {
                        that.onNavBack();
                    }
                },
                error: function (oError) {
                    MessageBox.error("Error saving customer: " + oError.message);
                }
            });
        },

        onCancel: function () {
            var oModel = this.getView().getModel();
            var oEditModel = this.getView().getModel("editModel");

            if (oEditModel.getProperty("/isCreate")) {
                oModel.resetChanges();
                this.onNavBack();
            } else {
                oModel.resetChanges();
                oEditModel.setProperty("/isEdit", false);
            }
        },

        onDelete: function () {
            var that = this;
            var oModel = this.getView().getModel();
            var oContext = this.getView().getBindingContext();

            MessageBox.confirm("Are you sure you want to delete this customer?", {
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        oModel.remove(oContext.getPath(), {
                            success: function () {
                                MessageToast.show("Customer deleted successfully");
                                that.onNavBack();
                            },
                            error: function (oError) {
                                MessageBox.error("Error deleting customer: " + oError.message);
                            }
                        });
                    }
                }
            });
        }
    });
});
