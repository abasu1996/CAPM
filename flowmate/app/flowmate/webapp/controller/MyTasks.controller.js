sap.ui.define([
    "flowmate/controller/BaseController",
    "sap/f/library",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], (BaseController, fLibrary, MessageBox, MessageToast, Filter, FilterOperator) => {
    "use strict";

    return BaseController.extend("flowmate.controller.MyTasks", {
        onInit() {
            this.getRouter().getRoute("RouteMyTasks").attachPatternMatched(this.onRouteMatched, this);
        },

        onRouteMatched(oEvent) {
            const oQuery = oEvent.getParameter("arguments")["?query"];
            const sTaskId = oQuery && oQuery.taskId;

            this.setOneColumnLayout();

            if (sTaskId) {
                this._showTaskDetailById(sTaskId);
                return;
            }

            this._setTasksLayout(fLibrary.LayoutType.OneColumn);
        },

        onTaskPress(oEvent) {
            this._showTaskDetail(oEvent.getSource().getBindingContext());
        },

        onOpenSelectedTask() {
            const oSelectedItem = this.byId("tasksTable").getSelectedItem();
            const oContext = oSelectedItem && oSelectedItem.getBindingContext();

            if (!oContext) {
                MessageToast.show(this.getText("selectTaskMessage"));
                return;
            }

            this._showTaskDetail(oContext);
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

        onCloseTaskDetail() {
            this._setTasksLayout(fLibrary.LayoutType.OneColumn);
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

        async onDeleteTask(oEvent) {
            oEvent.cancelBubble?.();

            const oContext = oEvent.getSource().getBindingContext();
            const sTaskId = oContext && oContext.getProperty("ID");

            if (!sTaskId) {
                MessageToast.show(this.getText("selectTaskMessage"));
                return;
            }

            const bConfirmed = await this._confirmDelete("deleteTaskConfirmMessage");

            if (!bConfirmed) {
                return;
            }

            this.getView().setBusy(true);

            try {
                await this.removeEntry(`/ProcessTasks(guid'${sTaskId}')`);
                MessageToast.show(this.getText("taskDeletedMessage"));

                if (this._sSelectedTaskId === sTaskId) {
                    this._sSelectedTaskId = null;
                    this._setTasksLayout(fLibrary.LayoutType.OneColumn);
                }

                this.byId("tasksTable").getBinding("items").refresh();
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("taskDeleteErrorMessage"));
            } finally {
                this.getView().setBusy(false);
            }
        },

        _showTaskDetail(oContext) {
            this._showTaskDetailById(oContext.getProperty("ID"));
        },

        _showTaskDetailById(sTaskId) {
            this._sSelectedTaskId = sTaskId;
            this.byId("taskObjectPage").bindElement({
                path: `/ProcessTasks(guid'${sTaskId}')`,
                parameters: {
                    expand: "request"
                }
            });
            this._setTasksLayout(fLibrary.LayoutType.TwoColumnsMidExpanded);
        },

        _setTasksLayout(sLayout) {
            this.byId("tasksFlexibleColumnLayout").setLayout(sLayout);
        },

        _confirmDelete(sMessageKey) {
            return new Promise((resolve) => {
                MessageBox.confirm(this.getText(sMessageKey), {
                    actions: [MessageBox.Action.DELETE, MessageBox.Action.CANCEL],
                    emphasizedAction: MessageBox.Action.DELETE,
                    onClose: (sAction) => resolve(sAction === MessageBox.Action.DELETE)
                });
            });
        },

        async _completeTask(sAction, sSuccessTextKey) {
            if (!this._sSelectedTaskId) {
                MessageToast.show(this.getText("selectTaskMessage"));
                return;
            }

            this.getView().setBusy(true);

            try {
                await this.callAction(sAction, {
                    taskId: this._sSelectedTaskId,
                    remarks: this.byId("taskRemarksTextArea").getValue()
                });
                MessageToast.show(this.getText(sSuccessTextKey));
                this.byId("taskRemarksTextArea").setValue("");
                this.byId("tasksTable").getBinding("items").refresh();
                this.byId("taskObjectPage").getElementBinding().refresh();
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("actionFailedMessage"));
            } finally {
                this.getView().setBusy(false);
            }
        }
    });
});
