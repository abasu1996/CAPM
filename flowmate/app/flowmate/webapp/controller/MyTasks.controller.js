sap.ui.define([
    "flowmate/controller/BaseController",
    "sap/f/library",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/json/JSONModel"
], (BaseController, fLibrary, MessageBox, MessageToast, Filter, FilterOperator, JSONModel) => {
    "use strict";

    return BaseController.extend("flowmate.controller.MyTasks", {
        onInit() {
            this.getView().setModel(new JSONModel({
                taskStatus: ""
            }), "statusEdit");
            this.getView().setModel(new JSONModel({
                processorUser_ID: "",
                processorName: ""
            }), "processorEdit");
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
            const oItem = oEvent.getParameter("listItem");

            if (oItem) {
                this._showTaskDetail(oItem.getBindingContext());
            }
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

        onTaskReferencePress(oEvent) {
            oEvent.cancelBubble?.();

            const oContext = oEvent.getSource().getBindingContext();

            if (oContext) {
                this._showTaskDetail(oContext);
            }
        },

        onRelatedRequestPress(oEvent) {
            oEvent.cancelBubble?.();

            const oContext = oEvent.getSource().getBindingContext();
            const sRequestId = oContext?.getProperty("request/ID") || oContext?.getProperty("request_ID");

            if (!sRequestId) {
                MessageToast.show(this.getText("selectRequestMessage"));
                return;
            }

            this.navTo("RouteMyRequests", {
                "?query": {
                    requestId: sRequestId
                }
            });
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
                        new Filter("referenceNumber", FilterOperator.Contains, sQuery),
                        new Filter("taskName", FilterOperator.Contains, sQuery),
                        new Filter("processor", FilterOperator.Contains, sQuery),
                        new Filter("role", FilterOperator.Contains, sQuery),
                        new Filter("status_code", FilterOperator.Contains, sQuery),
                        new Filter("decision", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                })
            ]);
        },

        onCloseTaskDetail() {
            this._sSelectedTaskId = null;
            this._setTasksLayout(fLibrary.LayoutType.OneColumn);
        },

        onRefreshTaskDetail() {
            this.byId("taskObjectPage").getElementBinding()?.refresh();
            this.byId("tasksTable").getBinding("items")?.refresh();
        },

        async onSaveTaskStatus() {
            const sStatusCode = this.getView().getModel("statusEdit").getProperty("/taskStatus");

            if (!this._sSelectedTaskId || !sStatusCode) {
                return;
            }

            this.showBusy();

            try {
                await this.callAction("updateTaskStatus", {
                    taskId: this._sSelectedTaskId,
                    statusCode: sStatusCode
                });
                MessageToast.show(this.getText("taskStatusUpdatedMessage"));
                this.byId("tasksTable").getBinding("items").refresh();
                this.byId("taskObjectPage").getElementBinding().refresh();
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("statusUpdateErrorMessage"));
            } finally {
                this.hideBusy();
            }
        },

        onProcessorValueHelpRequest() {
            this.byId("myTasksProcessorValueHelpDialog").open();
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

            if (!this._sSelectedTaskId || !sProcessorUserId) {
                MessageToast.show(this.getText("selectProcessorMessage"));
                return;
            }

            this.showBusy();

            try {
                await this.callAction("assignTaskProcessor", {
                    taskId: this._sSelectedTaskId,
                    processorUserId: sProcessorUserId
                });
                MessageToast.show(this.getText("taskProcessorUpdatedMessage"));
                this.byId("tasksTable").getBinding("items").refresh();
                this.byId("taskObjectPage").getElementBinding().refresh();
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("processorUpdateErrorMessage"));
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

            this.showBusy();

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
                this.hideBusy();
            }
        },

        async onDeleteSelectedTasks() {
            const oTable = this.byId("tasksTable");
            const aTaskIds = oTable.getSelectedContexts().map((oContext) => oContext.getProperty("ID"));

            if (!aTaskIds.length) {
                MessageToast.show(this.getText("selectItemsToDeleteMessage"));
                return;
            }

            const bConfirmed = await this._confirmDelete("deleteSelectedTasksConfirmMessage", [aTaskIds.length]);

            if (!bConfirmed) {
                return;
            }

            this.showBusy();

            try {
                await Promise.all(aTaskIds.map((sTaskId) => this.removeEntry(`/ProcessTasks(guid'${sTaskId}')`)));
                MessageToast.show(this.getText("selectedTasksDeletedMessage", [aTaskIds.length]));

                if (aTaskIds.includes(this._sSelectedTaskId)) {
                    this._sSelectedTaskId = null;
                    this._setTasksLayout(fLibrary.LayoutType.OneColumn);
                }

                oTable.removeSelections(true);
                oTable.getBinding("items").refresh();
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("taskDeleteErrorMessage"));
            } finally {
                this.hideBusy();
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
                },
                events: {
                    dataRequested: this.onDataRequested.bind(this),
                    dataReceived: () => {
                        this.onDataReceived();
                        this.getView().getModel("statusEdit").setProperty(
                            "/taskStatus",
                            this.byId("taskObjectPage").getBindingContext()?.getProperty("status_code") || ""
                        );
                        this.getView().getModel("processorEdit").setProperty(
                            "/processorUser_ID",
                            this.byId("taskObjectPage").getBindingContext()?.getProperty("processorUser_ID") || ""
                        );
                        this.getView().getModel("processorEdit").setProperty(
                            "/processorName",
                            this.byId("taskObjectPage").getBindingContext()?.getProperty("processor") || ""
                        );
                    }
                }
            });
            this._setTasksLayout(fLibrary.LayoutType.TwoColumnsMidExpanded);
        },

        _setTasksLayout(sLayout) {
            this.byId("tasksFlexibleColumnLayout").setLayout(sLayout);
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

        _confirmDelete(sMessageKey, aArguments) {
            return new Promise((resolve) => {
                MessageBox.confirm(this.getText(sMessageKey, aArguments), {
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

            this.showBusy();

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
                this.hideBusy();
            }
        }
    });
});
