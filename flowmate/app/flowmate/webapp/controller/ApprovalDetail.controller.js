sap.ui.define([
    "flowmate/controller/BaseController",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/model/json/JSONModel"
], (BaseController, MessageBox, MessageToast, JSONModel) => {
    "use strict";

    return BaseController.extend("flowmate.controller.ApprovalDetail", {
        onInit() {
            this.getView().setModel(new JSONModel({
                taskStatus: ""
            }), "statusEdit");
            this.getRouter().getRoute("RouteApprovalDetail").attachPatternMatched(this.onRouteMatched, this);
        },

        onRouteMatched(oEvent) {
            const sTaskId = decodeURIComponent(oEvent.getParameter("arguments").taskId);

            this._sTaskId = sTaskId;
            this.setTwoColumnLayout();
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
                    }
                }
            });
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
                MessageBox.error(oError.message || this.getText("statusUpdateErrorMessage"));
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
            this.navTo("RouteMyTasks");
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
                MessageBox.error(oError.message || this.getText("actionFailedMessage"));
            } finally {
                this.hideBusy();
            }
        }
    });
});
