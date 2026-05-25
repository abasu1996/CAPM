sap.ui.define([
    "flowmate/controller/BaseController",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], (BaseController, MessageBox, MessageToast) => {
    "use strict";

    return BaseController.extend("flowmate.controller.ApprovalDetail", {
        onInit() {
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
                    dataReceived: this.onDataReceived.bind(this)
                }
            });
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
