sap.ui.define([
    "flowmate/controller/BaseController",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/json/JSONModel"
], (BaseController, MessageBox, MessageToast, Filter, FilterOperator, JSONModel) => {
    "use strict";

    return BaseController.extend("flowmate.controller.ApprovalDetail", {
        onInit() {
            this.getView().setModel(new JSONModel({
                taskStatus: ""
            }), "statusEdit");
            this.getView().setModel(new JSONModel({
                processorUser_ID: "",
                processorName: ""
            }), "processorEdit");
            this.getRouter().getRoute("RouteApprovalDetail").attachPatternMatched(this.onRouteMatched, this);
        },

        onRouteMatched(oEvent) {
            const sTaskId = decodeURIComponent(oEvent.getParameter("arguments").taskId);

            this._sTaskId = sTaskId;
            this.setTwoColumnLayout();
            this.getView().unbindElement();
            this.getView().getModel("statusEdit").setProperty("/taskStatus", "");
            this.getView().getModel("processorEdit").setData({
                processorUser_ID: "",
                processorName: ""
            });
            this.getView().bindElement({
                path: `/ProcessTasks(guid'${sTaskId}')`,
                parameters: {
                    expand: "request"
                },
                events: {
                    dataRequested: this.onDataRequested.bind(this),
                    dataReceived: () => {
                        this.onDataReceived();
                        this.getView().getModel("statusEdit").setProperty(
                            "/taskStatus",
                            this.getView().getBindingContext()?.getProperty("status_code") || ""
                        );
                        this.getView().getModel("processorEdit").setProperty(
                            "/processorUser_ID",
                            this.getView().getBindingContext()?.getProperty("processorUser_ID") || ""
                        );
                        this.getView().getModel("processorEdit").setProperty(
                            "/processorName",
                            this.getView().getBindingContext()?.getProperty("processor") || ""
                        );
                    }
                }
            });
            this.getView().getElementBinding()?.refresh(true);
        },

        async onSaveTaskStatus() {
            const sStatusCode = this.getView().getModel("statusEdit").getProperty("/taskStatus");

            if (!this._sTaskId || !sStatusCode) {
                return;
            }

            this.showBusy();

            try {
                await this.callAction("updateTaskStatus", {
                    taskId: this._sTaskId,
                    statusCode: sStatusCode
                });
                MessageToast.show(this.getText("taskStatusUpdatedMessage"));
                this.getView().getElementBinding().refresh();
            } catch (oError) {
                MessageBox.error(this.getErrorMessage(oError, this.getText("statusUpdateErrorMessage")));
            } finally {
                this.hideBusy();
            }
        },

        onProcessorValueHelpRequest() {
            this.byId("approvalDetailProcessorValueHelpDialog").open();
        },

        onProcessorSuggestionSelected(oEvent) {
            const oContext = this._getSuggestionContext(oEvent);

            if (!oContext) {
                return;
            }

            const oModel = this.getView().getModel("processorEdit");
            oModel.setProperty("/processorUser_ID", oContext.getProperty("ID"));
            oModel.setProperty("/processorName", oContext.getProperty("displayName"));
        },

        onProcessorLiveChange() {
            this.getView().getModel("processorEdit").setProperty("/processorUser_ID", "");
        },

        onProcessorValueHelpSearch(oEvent) {
            this._filterUsers(oEvent.getSource(), oEvent.getParameter("value") || "");
        },

        onProcessorValueHelpConfirm(oEvent) {
            const oContext = oEvent.getParameter("selectedItem")?.getBindingContext();

            if (!oContext) {
                return;
            }

            const oModel = this.getView().getModel("processorEdit");
            oModel.setProperty("/processorUser_ID", oContext.getProperty("ID"));
            oModel.setProperty("/processorName", oContext.getProperty("displayName"));
            this.onProcessorValueHelpClose(oEvent);
        },

        onProcessorValueHelpClose(oEvent) {
            oEvent.getSource().getBinding("items")?.filter([]);
        },

        async onSaveTaskProcessor() {
            const sProcessorUserId = this.getView().getModel("processorEdit").getProperty("/processorUser_ID");

            if (!this._sTaskId || !sProcessorUserId) {
                MessageToast.show(this.getText("selectProcessorMessage"));
                return;
            }

            this.showBusy();

            try {
                await this.callAction("assignTaskProcessor", {
                    taskId: this._sTaskId,
                    processorUserId: sProcessorUserId
                });
                MessageToast.show(this.getText("taskProcessorUpdatedMessage"));
                this.getView().getElementBinding().refresh();
            } catch (oError) {
                MessageBox.error(this.getErrorMessage(oError, this.getText("processorUpdateErrorMessage")));
            } finally {
                this.hideBusy();
            }
        },

        async onApprove() {
            await this._completeTask("approveTask", "taskApprovedMessage");
        },

        async onReject() {
            await this._completeTask("rejectTask", "taskRejectedMessage");
        },

        async onSendBack() {
            await this._completeTask("sendBack", "taskSentBackMessage");
        },

        onClose() {
            this.navBack("RouteMyTasks");
        },

        onRefresh() {
            this.getView().getElementBinding()?.refresh();
        },

        _filterUsers(oDialog, sQuery) {
            const oBinding = oDialog.getBinding("items");

            if (!sQuery) {
                oBinding.filter([]);
                return;
            }

            oBinding.filter([
                new Filter({
                    filters: [
                        new Filter("displayName", FilterOperator.Contains, sQuery),
                        new Filter("email", FilterOperator.Contains, sQuery),
                        new Filter("department", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                })
            ]);
        },

        async _completeTask(sAction, sSuccessTextKey) {
            this.showBusy();

            try {
                await this.callAction(sAction, {
                    taskId: this._sTaskId,
                    remarks: this.byId("remarksTextArea").getValue()
                });
                MessageToast.show(this.getText(sSuccessTextKey));
                this.navTo("RouteMyTasks");
            } catch (oError) {
                MessageBox.error(this.getErrorMessage(oError, this.getText("actionFailedMessage")));
            } finally {
                this.hideBusy();
            }
        }
    });
});
