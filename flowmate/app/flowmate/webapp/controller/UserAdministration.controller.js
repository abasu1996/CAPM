sap.ui.define([
    "flowmate/controller/BaseController",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/json/JSONModel"
], (BaseController, MessageBox, MessageToast, Filter, FilterOperator, JSONModel) => {
    "use strict";

    return BaseController.extend("flowmate.controller.UserAdministration", {
        onInit() {
            this.getView().setModel(new JSONModel(this._emptyUser()), "userEdit");
            this.getView().setModel(new JSONModel({
                isEdit: false,
                canMaintainUsers: false
            }), "userAdmin");
            this.getRouter().getRoute("RouteUserAdministration").attachPatternMatched(this.onRouteMatched, this);
        },

        async onRouteMatched() {
            if (!await this.requireAdministrator()) {
                return;
            }

            this.setOneColumnLayout();

            try {
                const oCapabilities = await this.callAction("getUserAdministrationCapabilities");
                this.getView().getModel("userAdmin").setProperty("/canMaintainUsers", oCapabilities.canMaintainUsers);
            } catch (oError) {
                this.getView().getModel("userAdmin").setProperty("/canMaintainUsers", false);
            }
        },

        onSearch(oEvent) {
            const sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
            const oBinding = this.byId("usersTable").getBinding("items");

            if (!sQuery) {
                oBinding.filter([]);
                return;
            }

            oBinding.filter([
                new Filter({
                    filters: [
                        new Filter("referenceNumber", FilterOperator.Contains, sQuery),
                        new Filter("displayName", FilterOperator.Contains, sQuery),
                        new Filter("email", FilterOperator.Contains, sQuery),
                        new Filter("userPrincipalName", FilterOperator.Contains, sQuery),
                        new Filter("department", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                })
            ]);
        },

        onOpenCreateDialog() {
            this.getView().getModel("userEdit").setData(this._emptyUser());
            this.getView().getModel("userAdmin").setProperty("/isEdit", false);
            this.byId("userDialog").open();
        },

        onOpenEditDialog(oEvent) {
            const oUser = oEvent.getSource().getBindingContext().getObject();

            this.getView().getModel("userEdit").setData({ ...oUser });
            this.getView().getModel("userAdmin").setProperty("/isEdit", true);
            this.byId("userDialog").open();
        },

        onCloseDialog() {
            this.byId("userDialog").close();
        },

        async onSaveUser() {
            const oUser = this.getView().getModel("userEdit").getData();
            const bIsEdit = this.getView().getModel("userAdmin").getProperty("/isEdit");

            if (!oUser.displayName || !oUser.email || !oUser.userPrincipalName) {
                MessageBox.warning(this.getText("userRequiredMessage"));
                return;
            }

            this.showBusy();

            try {
                const oPayload = {
                    azureObjectId: oUser.azureObjectId,
                    userPrincipalName: oUser.userPrincipalName,
                    displayName: oUser.displayName,
                    email: oUser.email,
                    department: oUser.department,
                    isActive: oUser.isActive
                };

                if (bIsEdit) {
                    await this.updateEntry(`/Users(guid'${oUser.ID}')`, oPayload);
                    MessageToast.show(this.getText("userUpdatedMessage"));
                } else {
                    await this.createEntry("/Users", oPayload);
                    MessageToast.show(this.getText("userCreatedMessage"));
                }

                this.byId("usersTable").getBinding("items").refresh();
                this.onCloseDialog();
            } catch (oError) {
                MessageBox.error(this._getErrorMessage(oError));
            } finally {
                this.hideBusy();
            }
        },

        formatActiveState(bActive) {
            return bActive ? "Success" : "None";
        },

        formatActiveText(bActive) {
            return this.getText(bActive ? "activeStatus" : "inactiveStatus");
        },

        _emptyUser() {
            return {
                azureObjectId: "",
                userPrincipalName: "",
                displayName: "",
                email: "",
                department: "",
                isActive: true
            };
        },

        _getErrorMessage(oError) {
            try {
                return JSON.parse(oError.responseText).error.message.value || this.getText("userSaveErrorMessage");
            } catch (oParseError) {
                return this.getText("userSaveErrorMessage");
            }
        }
    });
});
