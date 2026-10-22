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
    "sap/ui/model/Sorter",
    "sap/ui/model/json/JSONModel",
    "sap/m/Label",
    "sap/ui/core/ListItem",
    "sap/m/Input",
    "sap/m/SelectDialog",
    "sap/m/StandardListItem"
], (BaseController, fLibrary, Button, Dialog, MessageBox, MessageToast, Select, Text, Item, Filter, FilterOperator, Sorter, JSONModel, Label, ListItem, Input, SelectDialog, StandardListItem) => {
    "use strict";

    return BaseController.extend("flowmate.controller.MyTasks", {
        onInit() {
            this.getView().setModel(new JSONModel({
                taskStatus: ""
            }), "statusEdit");
            this.getView().setModel(new JSONModel({
                sendBackStepNo: "",
                steps: [],
                requestTeamId: ""
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
            const bApprovalMode = oQuery?.approval === "true";

            this._iPendingDataRequests = 0;
            this._updateBusyState();
            this._bTeamMode = bTeamMode;
            this._bApprovalMode = bApprovalMode;
            this.getView().getModel("taskView").setData({
                teamMode: bTeamMode,
                approvalMode: bApprovalMode,
                title: this.getText(bApprovalMode ? "pendingApprovalsTitle" : (bTeamMode ? "myTeamTasksTitle" : "myTasksTitle")),
                tableHeader: this.getText(bApprovalMode ? "pendingApprovalsTableHeader" : (bTeamMode ? "myTeamTasksTableHeader" : "tasksTableHeader"))
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
                MessageBox.error(this.getErrorMessage(oError, this.getText("teamTaskAssignErrorMessage")));
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
                MessageBox.error(this.getErrorMessage(oError, this.getText("statusUpdateErrorMessage")));
            } finally {
                this.hideBusy();
            }
        },

        onProcessorValueHelpRequest() {
            this.byId("myTasksProcessorValueHelpDialog").open();
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
                MessageBox.error(this.getErrorMessage(oError, this.getText("processorUpdateErrorMessage")));
            } finally {
                this.hideBusy();
            }
        },

        async onApprove() {
            const oContext = this.byId("taskObjectPage").getBindingContext();
            const sTaskName = oContext?.getProperty("taskName");
            const sSubProcessTypeCode = oContext?.getProperty("request/subProcessType_code");
            const sRequestId = oContext?.getProperty("request/ID") || oContext?.getProperty("request_ID");

            if (sTaskName === "GFA Team Confirmation" && sSubProcessTypeCode === "NON_PO_MISC_RECEIPTS") {
                const sDebitGL = (this.byId("gfaDebitGLInput").getValue() || "").trim();

                if (!sDebitGL) {
                    MessageBox.warning(this.getText("debitGLRequiredMessage"));
                    return;
                }

                if (!sRequestId) {
                    MessageBox.error(this.getText("selectRequestMessage"));
                    return;
                }

                this.showBusy();

                try {
                    await this.updateEntry(`/ProcessRequests(guid'${sRequestId}')`, {
                        debitGL: sDebitGL
                    });
                } catch (oError) {
                    this.hideBusy();
                    MessageBox.error(this.getErrorMessage(oError, this.getText("debitGLSaveErrorMessage")));
                    return;
                }

                this.hideBusy();
            }
            if (sTaskName === "IV Confirmation and Document Archiving" && sSubProcessTypeCode === "NON_PO_TAX_LIAB_PAY_PAYORDER") {
                const sVoucherNumber = (this.byId("taskIvVoucherNumberInput").getValue() || "").trim();
                const sConfirmationValue = (this.byId("taskIvConfirmationValueInput").getValue() || "").trim();
                const sBankStatus = (this.byId("taskIvBankStatusInput").getValue() || "").trim();

                if (!sVoucherNumber || !sConfirmationValue || !sBankStatus) {
                    MessageBox.warning(this.getText("ivConfirmationFieldsRequiredMessage"));
                    return;
                }

                if (!sRequestId) {
                    MessageBox.error(this.getText("selectRequestMessage"));
                    return;
                }

                this.showBusy();

                try {
                    await this.updateEntry(`/ProcessRequests(guid'${sRequestId}')`, {
                        voucherNumber: sVoucherNumber,
                        ivConfirmationValue: sConfirmationValue,
                        bankStatus: sBankStatus
                    });
                } catch (oError) {
                    this.hideBusy();
                    MessageBox.error(this.getErrorMessage(oError, this.getText("ivConfirmationSaveErrorMessage")));
                    return;
                }

                this.hideBusy();
            }
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

            if (this._isTruthy(oContext.getProperty("isMandatory"))) {
                MessageBox.warning(this.getText("mandatoryTaskDeleteBlockedMessage"));
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
                MessageBox.error(this.getErrorMessage(oError, this.getText("taskDeleteErrorMessage")));
            } finally {
                this.hideBusy();
            }
        },

        async onDeleteSelectedTasks() {
            const oTable = this.byId("tasksTable");
            const aSelectedContexts = oTable.getSelectedContexts();
            const aTaskIds = aSelectedContexts.map((oContext) => oContext.getProperty("ID"));

            if (!aTaskIds.length) {
                MessageToast.show(this.getText("selectItemsToDeleteMessage"));
                return;
            }

            if (aSelectedContexts.some((oContext) => this._isTruthy(oContext.getProperty("isMandatory")))) {
                MessageBox.warning(this.getText("mandatoryTaskDeleteBlockedMessage"));
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
                MessageBox.error(this.getErrorMessage(oError, this.getText("taskDeleteErrorMessage")));
            } finally {
                this.hideBusy();
            }
        },

        _showTaskDetail(oContext) {
            this._showTaskDetailById(oContext.getProperty("ID"));
        },

        _showTaskDetailById(sTaskId) {
            this._sSelectedTaskId = sTaskId;
            const oTaskPage = this.byId("taskObjectPage");

            oTaskPage.unbindElement();
            this.getView().getModel("statusEdit").setProperty("/taskStatus", "");
            this.getView().getModel("processorEdit").setData({
                processorUser_ID: "",
                processorName: ""
            });
            oTaskPage.bindElement({
                path: `${this._taskCollectionPath()}(guid'${sTaskId}')`,
                parameters: {
                    expand: "request,treasuryEntries,whtEntries"
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
            oTaskPage.getElementBinding()?.refresh(true);
            this._setTasksLayout(fLibrary.LayoutType.TwoColumnsMidExpanded);
        },

        _setTasksLayout(sLayout) {
            this.byId("tasksFlexibleColumnLayout").setLayout(sLayout);
        },

        _taskCollectionPath() {
            if (this._bApprovalMode) {
                return "/MyPendingApprovalTasks";
            }
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
                filters: this._bApprovalMode
                    ? [
                        new Filter("isLoaApproval", FilterOperator.EQ, true),
                        new Filter("status_code", FilterOperator.EQ, "OPEN")
                    ]
                    : [new Filter("isLoaApproval", FilterOperator.EQ, false)],
                sorter: new Sorter("referenceNumber", true),
                parameters: {
                    expand: "request,treasuryEntries,whtEntries"
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

        _isTruthy(vValue) {
            if (typeof vValue === "string") {
                return vValue.toLowerCase() === "true" || vValue === "1";
            }

            return Boolean(vValue);
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

            let oSendBack;

                if (sAction === "sendBack") {
                    oSendBack = await this._chooseSendBackStep();

                    if (!oSendBack) {
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
                    oPayload.targetStepNo = oSendBack.stepNo;
                    if (oSendBack.processorUserId) {
                        oPayload.processorUserId = oSendBack.processorUserId;
                    }
                }

                await this.callAction(sAction, oPayload);
                MessageToast.show(this.getText(sSuccessTextKey));
                // this.byId("taskRemarksTextArea").setValue("");
                this.byId("tasksTable").getBinding("items").refresh();
                this.byId("taskObjectPage").getElementBinding().refresh();
            } catch (oError) {
                MessageBox.error(this.getErrorMessage(oError, this.getText("actionFailedMessage")));
            } finally {
                this.hideBusy();
            }
        },

        async _loadTaskStepOptions() {
            const oTaskActionModel = this.getView().getModel("taskAction");
            const oContext = this.byId("taskObjectPage")?.getBindingContext();
            const sSubProcessTypeCode = oContext?.getProperty("request/subProcessType_code");
            const iCurrentStepNo = Number(oContext?.getProperty("stepNo") || 0);

            oTaskActionModel.setData({
                sendBackStepNo: "",
                steps: [],
                requestTeamId: ""
            });

            if (!sSubProcessTypeCode) {
                return;
            }

            try {
                const aSteps = await this._readList("/ProcessStepConfig", {
                    filters: [new Filter("subProcessType_code", FilterOperator.EQ, sSubProcessTypeCode)]
                });
                const aStepItems = aSteps
                    .sort((oLeft, oRight) => Number(oLeft.stepNo || 0) - Number(oRight.stepNo || 0))
                    .filter((oStep) => Number(oStep.stepNo || 0) < iCurrentStepNo)
                    .map((oStep) => ({
                        stepNo: String(oStep.stepNo),
                        text: this.getText("sendBackStepOptionText", [oStep.stepNo, oStep.stepName || ""]),
                        teamId: oStep.processorTeam_ID || ""
                    }));

                oTaskActionModel.setData({
                    sendBackStepNo: aStepItems[0]?.stepNo || "",
                    steps: aStepItems,
                    requestTeamId: oContext?.getProperty("request/processorTeam_ID") || ""
                });
            } catch (oError) {
                MessageToast.show(this.getText("sendBackStepsLoadErrorMessage"));
            }
        },

        _chooseSendBackStep() {
            const oTaskActionModel = this.getView().getModel("taskAction");
            const aSteps = oTaskActionModel.getProperty("/steps") || [];

            if (!aSteps.length) {
                MessageBox.warning(this.getText("noPreviousSendBackStepsMessage"));
                return Promise.resolve(null);
            }

            return new Promise((resolve) => {
                let sTeamId = "";
                let sSelectedUserId = "";
                let iSearchTimer;
                let oPickerDialog = null;

                const oHint = new Text({ wrapping: true }).addStyleClass("sapUiTinyMarginTop");

                // Backend filters: active users, optional team, optional typed text
                const fnBuildFilters = (sQuery) => {
                    const aFilters = [new Filter("isActive", FilterOperator.EQ, true)];

                    if (sTeamId) {
                        aFilters.push(new Filter("team_ID", FilterOperator.EQ, sTeamId));
                    }
                    if (sQuery) {
                        aFilters.push(new Filter({
                            filters: [
                                new Filter("displayName", FilterOperator.Contains, sQuery),
                                new Filter("email", FilterOperator.Contains, sQuery)
                            ],
                            and: false
                        }));
                    }
                    return aFilters;
                };

                const sUserPath = () => (sTeamId ? "/TeamMembers" : "/Users");
                const sUserKeyField = () => (sTeamId ? "user_ID" : "ID");

                const oProcessorInput = new Input({
                    width: "100%",
                    placeholder: this.getText("selectProcessorPlaceholder"),
                    showSuggestion: true,
                    startSuggestion: 1,
                    filterSuggests: false,
                    maxSuggestionWidth: "28rem",
                    showValueHelp: true,
                    valueHelpIconSrc: "sap-icon://slim-arrow-down",
                    // Typing clears the previous pick, then asks the backend (debounced)
                    liveChange: (oEvent) => {
                        sSelectedUserId = "";
                        const sQuery = (oEvent.getParameter("value") || "").trim();

                        clearTimeout(iSearchTimer);
                        iSearchTimer = setTimeout(() => {
                            oProcessorInput.getBinding("suggestionItems")?.filter(fnBuildFilters(sQuery));
                        }, 300);
                    },
                    suggestionItemSelected: (oEvent) => {
                        const oItem = oEvent.getParameter("selectedItem");

                        sSelectedUserId = oItem?.getKey() || "";
                        oProcessorInput.setValue(oItem?.getText() || "");
                    },
                    // Arrow icon: full list with its own backend search
                    valueHelpRequest: () => {
                        if (!oPickerDialog) {
                            oPickerDialog = new SelectDialog({
                                title: this.getText("sendBackProcessorLabel"),
                                growing: true,
                                growingThreshold: 50,
                                noDataText: this.getText("noUsersFoundText"),
                                search: (oEvt) => {
                                    oEvt.getSource().getBinding("items")
                                        ?.filter(fnBuildFilters((oEvt.getParameter("value") || "").trim()));
                                },
                                liveChange: (oEvt) => {
                                    oEvt.getSource().getBinding("items")
                                        ?.filter(fnBuildFilters((oEvt.getParameter("value") || "").trim()));
                                },
                                confirm: (oEvt) => {
                                    const oContext = oEvt.getParameter("selectedItem")?.getBindingContext();

                                    if (oContext) {
                                        sSelectedUserId = oContext.getProperty(sUserKeyField());
                                        oProcessorInput.setValue(oContext.getProperty("displayName"));
                                    }
                                }
                            });
                            this.getView().addDependent(oPickerDialog);
                        }

                        oPickerDialog.unbindAggregation("items");
                        oPickerDialog.bindAggregation("items", {
                            path: sUserPath(),
                            filters: fnBuildFilters(""),
                            sorter: new Sorter("displayName"),
                            templateShareable: false,
                            template: new StandardListItem({
                                title: "{displayName}",
                                description: "{email}",
                                type: "Active"
                            })
                        });
                        oPickerDialog.open();
                    }
                });

                // Step with a team -> its members; no team -> all active users
                const fnBindItems = () => {
                    const oStep = aSteps.find((oItem) =>
                        String(oItem.stepNo) === String(oStepSelect.getSelectedKey())
                    );

                    sTeamId = oStep?.teamId || "";
                    sSelectedUserId = "";
                    oProcessorInput.setValue("");
                    oProcessorInput.unbindAggregation("suggestionItems");
                    oProcessorInput.bindAggregation("suggestionItems", {
                        path: sUserPath(),
                        filters: fnBuildFilters(""),
                        sorter: new Sorter("displayName"),
                        templateShareable: false,
                        template: new ListItem({
                            key: sTeamId ? "{user_ID}" : "{ID}",
                            text: "{displayName}",
                            additionalText: "{email}"
                        })
                    });
                    oHint.setText(sTeamId
                        ? this.getText("sendBackProcessorHintText")
                        : this.getText("sendBackAllUsersHintText"));
                };

                const oStepSelect = new Select({
                    width: "100%",
                    selectedKey: aSteps[0].stepNo,
                    items: aSteps.map((oStep) => new Item({ key: oStep.stepNo, text: oStep.text })),
                    change: fnBindItems
                });

                const oDialog = new Dialog({
                    title: this.getText("sendBackTargetStepDialogTitle"),
                    contentWidth: "26rem",
                    content: [
                        new Text({ text: this.getText("sendBackTargetStepDialogText"), wrapping: true }),
                        oStepSelect,
                        new Label({
                            text: this.getText("sendBackProcessorLabel"),
                            labelFor: oProcessorInput
                        }).addStyleClass("sapUiSmallMarginTop"),
                        oProcessorInput,
                        oHint
                    ],
                    beginButton: new Button({
                        text: this.getText("sendBackButton"),
                        type: "Emphasized",
                        press: () => {
                            // Text typed but no user picked
                            if (oProcessorInput.getValue().trim() && !sSelectedUserId) {
                                MessageToast.show(this.getText("selectProcessorFromListMessage"));
                                return;
                            }

                            resolve({
                                stepNo: Number(oStepSelect.getSelectedKey()),
                                processorUserId: sSelectedUserId || null
                            });
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

                oDialog.addStyleClass("sapUiContentPadding");
                oDialog.attachAfterClose(() => {
                    clearTimeout(iSearchTimer);
                    resolve(null); // no-op if already resolved (covers Esc)
                    oPickerDialog?.destroy();
                    oDialog.destroy();
                });

                this.getView().addDependent(oDialog);
                fnBindItems();
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
