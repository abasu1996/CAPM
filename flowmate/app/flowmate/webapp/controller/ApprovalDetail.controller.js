sap.ui.define([
    "flowmate/controller/BaseController",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/m/Button",
    "sap/m/Dialog",
    "sap/m/Select",
    "sap/m/Text",
    "sap/m/Label",
    "sap/m/Input",
    "sap/m/SelectDialog",
    "sap/m/StandardListItem",
    "sap/ui/core/Item",
    "sap/ui/core/ListItem",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "sap/ui/model/json/JSONModel"
], (BaseController, MessageBox, MessageToast, Button, Dialog, Select, Text, Label, Input, SelectDialog, StandardListItem, Item, ListItem, Filter, FilterOperator, Sorter, JSONModel) => {
    "use strict";
    const GFA_CONFIRMATION_STEP_NO = 2;
    const PAYMENT_COMPLETION_STEP_NO = 6;

    return BaseController.extend("flowmate.controller.ApprovalDetail", {
        onInit() {
            this.getView().setModel(new JSONModel({
                taskStatus: ""
            }), "statusEdit");
            this.getView().setModel(new JSONModel({
                processorUser_ID: "",
                processorName: ""
            }), "processorEdit");
            this.getView().setModel(new JSONModel({
                sendBackStepNo: "",
                steps: [],
                requestTeamId: ""
            }), "taskAction");
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
                    expand: "request,treasuryEntries,whtEntries"
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
                        this._loadTaskStepOptions();
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
            const oContext = this.getView().getBindingContext();
            const sTaskName = oContext?.getProperty("taskName");
            const iStepNo = Number(oContext?.getProperty("stepNo") || 0);
            const sSubProcessTypeCode = oContext?.getProperty("request/subProcessType_code");
            const sRequestId = oContext?.getProperty("request/ID") || oContext?.getProperty("request_ID");

            if (iStepNo === GFA_CONFIRMATION_STEP_NO && sSubProcessTypeCode === "NON_PO_MISC_RECEIPTS") {
                const sDebitGL = (this.byId("gfaDebitGL").getValue() || "").trim();

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
            if (iStepNo === PAYMENT_COMPLETION_STEP_NO && sSubProcessTypeCode === "NON_PO_TAX_LIAB_PAY_PAYORDER") {
                const sVoucherNumber = (this.byId("ivVoucherNumberInput").getValue() || "").trim();
                const sConfirmationValue = (this.byId("ivConfirmationValueInput").getValue() || "").trim();
                const sBankStatus = (this.byId("ivBankStatusInput").getValue() || "").trim();

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

        onClose() {
            this.navBack("RouteMyTasks");
        },

        onRefresh() {
            this.getView().getElementBinding()?.refresh();
        },
          onNavToTeamTasks() {
            this.navTo("RouteMyTasks", {
                "?query": { team: "true" }
            });
        },

        onRelatedRequestPress(oEvent) {
            const oContext = oEvent.getSource().getBindingContext();
            const sRequestId = oContext?.getProperty("request/ID") || oContext?.getProperty("request_ID");

            if (!sRequestId) {
                MessageToast.show(this.getText("selectRequestMessage"));
                return;
            }

            this.navTo("RouteMyRequests", {
                "?query": { requestId: sRequestId }
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
                        new Filter("department", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                })
            ]);
        },

        // async _completeTask(sAction, sSuccessTextKey) {
        //     this.showBusy();

        //     try {
        //         await this.callAction(sAction, {
        //             taskId: this._sTaskId,
        //             remarks: this.byId("remarksTextArea").getValue()
        //         });
        //         MessageToast.show(this.getText(sSuccessTextKey));
        //         this.navTo("RouteMyTasks");
        //     } catch (oError) {
        //         MessageBox.error(this.getErrorMessage(oError, this.getText("actionFailedMessage")));
        //     } finally {
        //         this.hideBusy();
        //     }
        // }
        async _completeTask(sAction, sSuccessTextKey) {
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
                    taskId: this._sTaskId,
                    remarks: this.byId("remarksTextArea").getValue()
                };

                if (sAction === "sendBack") {
                    oPayload.targetStepNo = oSendBack.stepNo;
                    if (oSendBack.processorUserId) {
                        oPayload.processorUserId = oSendBack.processorUserId;
                    }
                }

                await this.callAction(sAction, oPayload);
                MessageToast.show(this.getText(sSuccessTextKey));
                this.navTo("RouteMyTasks");
            } catch (oError) {
                MessageBox.error(this.getErrorMessage(oError, this.getText("actionFailedMessage")));
            } finally {
                this.hideBusy();
            }
        },

        _readList(sPath, oParameters) {
            return new Promise((resolve, reject) => {
                this.getModel().read(sPath, {
                    ...(oParameters || {}),
                    success: (oData) => resolve(oData.results || []),
                    error: reject
                });
            });
        },

        async _loadTaskStepOptions() {
            const oTaskActionModel = this.getView().getModel("taskAction");
            const oContext = this.getView().getBindingContext();
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
    });
});
