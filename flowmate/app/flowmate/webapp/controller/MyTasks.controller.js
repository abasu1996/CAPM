sap.ui.define([
    "flowmate/controller/BaseController",
    "sap/f/library",
    "sap/m/Button",
    "sap/m/Dialog",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/m/Select",
    "sap/m/Text",
    "sap/ui/core/Item",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/json/JSONModel"
], (BaseController, fLibrary, Button, Dialog, MessageBox, MessageToast, Select, Text, Item, Filter, FilterOperator, JSONModel) => {
    "use strict";

    return BaseController.extend("flowmate.controller.MyTasks", {
        onInit() {
            this.getView().setModel(new JSONModel({
                taskStatus: ""
            }), "statusEdit");
            this.getView().setModel(new JSONModel({
                sendBackStepNo: "",
                steps: []
            }), "taskAction");
            this.getView().setModel(new JSONModel({
                processorUser_ID: "",
                processorName: ""
            }), "processorEdit");
            this.getView().setModel(new JSONModel({
                teamMode: false,
                title: this.getText("myTasksTitle"),
                tableHeader: this.getText("tasksTableHeader")
            }), "taskView");
            this.getRouter().getRoute("RouteMyTasks").attachPatternMatched(this.onRouteMatched, this);
        },

        onRouteMatched(oEvent) {
            const oQuery = oEvent.getParameter("arguments")["?query"];
            const sTaskId = oQuery && oQuery.taskId;
            const bTeamMode = oQuery?.team === "true";

            this._iPendingDataRequests = 0;
            this._updateBusyState();
            this._bTeamMode = bTeamMode;
            this.getView().getModel("taskView").setData({
                teamMode: bTeamMode,
                title: this.getText(bTeamMode ? "myTeamTasksTitle" : "myTasksTitle"),
                tableHeader: this.getText(bTeamMode ? "myTeamTasksTableHeader" : "tasksTableHeader")
            });
            this._bindTasksTable();

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

        async onAssignTeamTaskToMe(oEvent) {
            oEvent.cancelBubble?.();

            const oContext = oEvent.getSource().getBindingContext();
            const sTaskId = oContext?.getProperty("ID");

            if (!sTaskId) {
                MessageToast.show(this.getText("selectTaskMessage"));
                return;
            }

            this.showBusy();

            try {
                await this.callAction("assignTeamTaskToMe", {
                    taskId: sTaskId
                });
                MessageToast.show(this.getText("teamTaskAssignedToMeMessage"));
                this.byId("tasksTable").getBinding("items")?.refresh();

                if (this._sSelectedTaskId === sTaskId) {
                    this._sSelectedTaskId = null;
                    this._setTasksLayout(fLibrary.LayoutType.OneColumn);
                }
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("teamTaskAssignErrorMessage"));
            } finally {
                this.hideBusy();
            }
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
                path: `${this._taskCollectionPath()}(guid'${sTaskId}')`,
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
                        this._loadTaskStepOptions();
                    }
                }
            });
            this._setTasksLayout(fLibrary.LayoutType.TwoColumnsMidExpanded);
        },

        _setTasksLayout(sLayout) {
            this.byId("tasksFlexibleColumnLayout").setLayout(sLayout);
        },

        _taskCollectionPath() {
            return this._bTeamMode ? "/MyTeamTasks" : "/MyAssignedTasks";
        },

        _bindTasksTable() {
            const oTable = this.byId("tasksTable");
            const oBindingInfo = oTable?.getBindingInfo("items");
            const oTemplate = oBindingInfo?.template || this._oTasksTableTemplate || oTable?.getItems()[0];

            if (!oTable || !oTemplate) {
                return;
            }

            if (!this._oTasksTableTemplate) {
                this._oTasksTableTemplate = oTemplate;
                oTable.removeAllItems();
            }

            oTable.bindItems({
                path: this._taskCollectionPath(),
                parameters: {
                    expand: "request"
                },
                template: this._oTasksTableTemplate,
                templateShareable: true,
                events: {
                    dataRequested: this.onDataRequested.bind(this),
                    dataReceived: this.onDataReceived.bind(this)
                }
            });
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
                        new Filter("userPrincipalName", FilterOperator.Contains, sQuery)
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

            let iSendBackStepNo;

            if (sAction === "sendBack") {
                iSendBackStepNo = await this._chooseSendBackStep();

                if (!iSendBackStepNo) {
                    return;
                }
            }

            this.showBusy();

            try {
                const oPayload = {
                    taskId: this._sSelectedTaskId,
                    remarks: this.byId("taskRemarksTextArea").getValue()
                };

                if (sAction === "sendBack") {
                    oPayload.targetStepNo = iSendBackStepNo;
                }

                await this.callAction(sAction, oPayload);
                MessageToast.show(this.getText(sSuccessTextKey));
                this.byId("taskRemarksTextArea").setValue("");
                this.byId("tasksTable").getBinding("items").refresh();
                this.byId("taskObjectPage").getElementBinding().refresh();
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("actionFailedMessage"));
            } finally {
                this.hideBusy();
            }
        },

        async _loadTaskStepOptions() {
            const oTaskActionModel = this.getView().getModel("taskAction");
            const oContext = this.byId("taskObjectPage")?.getBindingContext();
            const sProcessTypeCode = oContext?.getProperty("request/processType_code");
            const iCurrentStepNo = Number(oContext?.getProperty("stepNo") || 0);

            oTaskActionModel.setData({
                sendBackStepNo: "",
                steps: []
            });

            if (!sProcessTypeCode) {
                return;
            }

            try {
                const aSteps = await this._readList("/ProcessStepConfig", {
                    filters: [new Filter("processType_code", FilterOperator.EQ, sProcessTypeCode)]
                });
                const aStepItems = aSteps
                    .sort((oLeft, oRight) => Number(oLeft.stepNo || 0) - Number(oRight.stepNo || 0))
                    .filter((oStep) => Number(oStep.stepNo || 0) < iCurrentStepNo)
                    .map((oStep) => ({
                        stepNo: String(oStep.stepNo),
                        text: this.getText("sendBackStepOptionText", [oStep.stepNo, oStep.stepName || ""])
                    }));

                oTaskActionModel.setData({
                    sendBackStepNo: aStepItems[0]?.stepNo || "",
                    steps: aStepItems
                });
            } catch (oError) {
                MessageToast.show(this.getText("sendBackStepsLoadErrorMessage"));
            }
        },

        _chooseSendBackStep() {
            const aSteps = this.getView().getModel("taskAction").getProperty("/steps") || [];

            if (!aSteps.length) {
                MessageBox.warning(this.getText("noPreviousSendBackStepsMessage"));
                return Promise.resolve(null);
            }

            return new Promise((resolve) => {
                const oSelect = new Select({
                    width: "100%",
                    selectedKey: aSteps[0].stepNo,
                    items: aSteps.map((oStep) => new Item({
                        key: oStep.stepNo,
                        text: oStep.text
                    }))
                });
                const oDialog = new Dialog({
                    title: this.getText("sendBackTargetStepDialogTitle"),
                    contentWidth: "24rem",
                    content: [
                        new Text({
                            text: this.getText("sendBackTargetStepDialogText"),
                            wrapping: true
                        }),
                        oSelect
                    ],
                    beginButton: new Button({
                        text: this.getText("sendBackButton"),
                        type: "Emphasized",
                        press: () => {
                            resolve(Number(oSelect.getSelectedKey()));
                            oDialog.close();
                        }
                    }),
                    endButton: new Button({
                        text: this.getText("cancelButton"),
                        press: () => {
                            resolve(null);
                            oDialog.close();
                        }
                    })
                });

                oDialog.attachAfterClose(() => oDialog.destroy());
                this.getView().addDependent(oDialog);
                oDialog.open();
            });
        },

        _readList(sPath, oParameters) {
            return new Promise((resolve, reject) => {
                this.getModel().read(sPath, {
                    ...(oParameters || {}),
                    success: (oData) => resolve(oData.results || []),
                    error: reject
                });
            });
        }
    });
});
