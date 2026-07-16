sap.ui.define([
    "flowmate/controller/BaseController",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/json/JSONModel"
], (BaseController, MessageBox, MessageToast, Filter, FilterOperator, JSONModel) => {
    "use strict";

    return BaseController.extend("flowmate.controller.Delegations", {
        onInit() {
            this.getView().setModel(new JSONModel(this._emptyDelegation()), "newDelegation");
            this.getRouter().getRoute("RouteDelegations").attachPatternMatched(this.onRouteMatched, this);
        },

        onRouteMatched() {
            this.setOneColumnLayout();
        },

        onSearch(oEvent) {
            const sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
            const oBinding = this.byId("delegationsTable").getBinding("items");

            if (!sQuery) {
                oBinding.filter([]);
                return;
            }

            oBinding.filter([
                new Filter({
                    filters: [
                        new Filter("referenceNumber", FilterOperator.Contains, sQuery),
                        new Filter("delegatorUser/displayName", FilterOperator.Contains, sQuery),
                        new Filter("delegateUser/displayName", FilterOperator.Contains, sQuery),
                        new Filter("delegator", FilterOperator.Contains, sQuery),
                        new Filter("delegate", FilterOperator.Contains, sQuery),
                        new Filter("createdBy", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                })
            ]);
        },

        onOpenCreateDialog() {
            this.getView().getModel("newDelegation").setData(this._emptyDelegation());
            this.byId("createDelegationDialog").open();
        },

        onCloseCreateDialog() {
            this.byId("createDelegationDialog").close();
        },

        async onCreateDelegation() {
            const oDelegation = this.getView().getModel("newDelegation").getData();

            if (!oDelegation.delegateUser_ID || !oDelegation.startDate || !oDelegation.endDate ||
                (oDelegation.onBehalfOfUser && !oDelegation.delegatorUser_ID)) {
                MessageBox.warning(this.getText("delegationRequiredMessage"));
                return;
            }

            if (oDelegation.startDate > oDelegation.endDate) {
                MessageBox.warning(this.getText("delegationDateErrorMessage"));
                return;
            }

            this.showBusy();

            try {
                await this.createEntry("/Delegations", {
                    delegatorUser_ID: oDelegation.onBehalfOfUser ? oDelegation.delegatorUser_ID : undefined,
                    delegator: oDelegation.onBehalfOfUser ? oDelegation.delegator : undefined,
                    delegateUser_ID: oDelegation.delegateUser_ID,
                    delegate: oDelegation.delegate,
                    startDate: oDelegation.startDate,
                    endDate: oDelegation.endDate,
                    forwardNotifications: oDelegation.forwardNotifications,
                    enabled: true
                });
                this.byId("delegationsTable").getBinding("items").refresh();
                this.onCloseCreateDialog();
                MessageToast.show(this.getText("delegationCreatedMessage"));
            } catch (oError) {
                MessageBox.error(this._getErrorMessage(oError, "delegationCreateErrorMessage"));
            } finally {
                this.hideBusy();
            }
        },

        onDelegatorValueHelpRequest() {
            this.byId("delegatorValueHelpDialog").open();
        },

        onDelegateValueHelpRequest() {
            this.byId("delegateValueHelpDialog").open();
        },

        onUserValueHelpSearch(oEvent) {
            const sQuery = oEvent.getParameter("value") || "";
            const oBinding = oEvent.getSource().getBinding("items");

            if (!sQuery) {
                oBinding.filter([]);
                return;
            }

            oBinding.filter([
                new Filter({
                    filters: [
                        new Filter("displayName", FilterOperator.Contains, sQuery),
                        new Filter("email", FilterOperator.Contains, sQuery),
                        new Filter("userPrincipalName", FilterOperator.Contains, sQuery),
                        new Filter("department", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                })
            ]);
        },

        onDelegatorValueHelpConfirm(oEvent) {
            this._setSelectedUser(oEvent, "delegator");
        },

        onDelegateValueHelpConfirm(oEvent) {
            this._setSelectedUser(oEvent, "delegate");
        },

        onUserValueHelpClose(oEvent) {
            oEvent.getSource().getBinding("items")?.filter([]);
        },

        async onDeleteDelegation(oEvent) {
            const oContext = oEvent.getSource().getBindingContext();
            const sId = oContext && oContext.getProperty("ID");
            const bConfirmed = await this._confirmDelete();

            if (!sId || !bConfirmed) {
                return;
            }

            this.showBusy();

            try {
                await this.removeEntry(`/Delegations(guid'${sId}')`);
                MessageToast.show(this.getText("delegationDeletedMessage"));
                this.byId("delegationsTable").getBinding("items").refresh();
            } catch (oError) {
                MessageBox.error(this._getErrorMessage(oError, "delegationDeleteErrorMessage"));
            } finally {
                this.hideBusy();
            }
        },

        async onDeleteSelectedDelegations() {
            const oTable = this.byId("delegationsTable");
            const aIds = oTable.getSelectedContexts().map((oContext) => oContext.getProperty("ID"));

            if (!aIds.length) {
                MessageToast.show(this.getText("selectItemsToDeleteMessage"));
                return;
            }

            const bConfirmed = await this._confirmDelete("deleteSelectedDelegationsConfirmMessage", [aIds.length]);

            if (!bConfirmed) {
                return;
            }

            this.showBusy();

            try {
                await Promise.all(aIds.map((sId) => this.removeEntry(`/Delegations(guid'${sId}')`)));
                MessageToast.show(this.getText("selectedDelegationsDeletedMessage", [aIds.length]));
                oTable.removeSelections(true);
                oTable.getBinding("items").refresh();
            } catch (oError) {
                MessageBox.error(this._getErrorMessage(oError, "delegationDeleteErrorMessage"));
            } finally {
                this.hideBusy();
            }
        },

        formatDelegationStatus(sStartDate, sEndDate, bEnabled, bForwardNotifications) {
            const sToday = new Date().toISOString().slice(0, 10);

            if (!bEnabled || !bForwardNotifications) {
                return this.getText("delegationDisabledStatus");
            }

            if (sToday < sStartDate) {
                return this.getText("delegationScheduledStatus");
            }

            if (sToday > sEndDate) {
                return this.getText("delegationExpiredStatus");
            }

            return this.getText("delegationActiveStatus");
        },

        formatDelegationState(sStartDate, sEndDate, bEnabled, bForwardNotifications) {
            const sToday = new Date().toISOString().slice(0, 10);

            if (!bEnabled || !bForwardNotifications || sToday > sEndDate) {
                return "None";
            }

            return sToday < sStartDate ? "Information" : "Success";
        },

        _emptyDelegation() {
            return {
                onBehalfOfUser: false,
                delegatorUser_ID: "",
                delegatorName: "",
                delegator: "",
                delegateUser_ID: "",
                delegateName: "",
                delegate: "",
                startDate: "",
                endDate: "",
                forwardNotifications: true
            };
        },

        _setSelectedUser(oEvent, sRole) {
            const oContext = oEvent.getParameter("selectedItem")?.getBindingContext();

            if (!oContext) {
                return;
            }

            const oModel = this.getView().getModel("newDelegation");
            oModel.setProperty(`/${sRole}User_ID`, oContext.getProperty("ID"));
            oModel.setProperty(`/${sRole}Name`, oContext.getProperty("displayName"));
            oModel.setProperty(`/${sRole}`, oContext.getProperty("email") || oContext.getProperty("userPrincipalName"));
            this.onUserValueHelpClose(oEvent);
        },

        _confirmDelete(sMessageKey = "deleteDelegationConfirmMessage", aArguments) {
            return new Promise((resolve) => {
                MessageBox.confirm(this.getText(sMessageKey, aArguments), {
                    emphasizedAction: MessageBox.Action.DELETE,
                    actions: [MessageBox.Action.DELETE, MessageBox.Action.CANCEL],
                    onClose: (sAction) => resolve(sAction === MessageBox.Action.DELETE)
                });
            });
        },

        _getErrorMessage(oError, sFallbackKey) {
            try {
                return JSON.parse(oError.responseText).error.message.value || this.getText(sFallbackKey);
            } catch (oParseError) {
                return this.getText(sFallbackKey);
            }
        }
    });
});
