sap.ui.define([
    "flowmate/controller/BaseController",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/json/JSONModel"
], (BaseController, MessageBox, MessageToast, Filter, FilterOperator, JSONModel) => {
    "use strict";

    return BaseController.extend("flowmate.controller.RequestDetail", {
        onInit() {
            this.getView().setModel(new JSONModel({
                requestStatus: ""
            }), "statusEdit");
            this.getView().setModel(new JSONModel({
                processorUser_ID: "",
                processorName: ""
            }), "processorEdit");
            this.getRouter().getRoute("RouteRequestDetail").attachPatternMatched(this.onRouteMatched, this);
        },

        onRouteMatched(oEvent) {
            const sRequestId = decodeURIComponent(oEvent.getParameter("arguments").requestId);

            this.setTwoColumnLayout();
            this.getView().bindElement({
                path: `/ProcessRequests(guid'${sRequestId}')`,
                parameters: {
                    expand: "processType,subProcessType,paymentCategory,businessEntity,predecessor,successors,tasks/request,comments,attachments,history"
                },
                events: {
                    dataRequested: this.onDataRequested.bind(this),
                    dataReceived: () => {
                        this.onDataReceived();
                        this.getView().getModel("statusEdit").setProperty(
                            "/requestStatus",
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
            const oBinding = this.getView().getElementBinding();

            if (oBinding) {
                oBinding.refresh(true);
            }
        },

        async onSaveRequestStatus() {
            const sRequestId = this.getView().getBindingContext()?.getProperty("ID");
            const sStatusCode = this.getView().getModel("statusEdit").getProperty("/requestStatus");

            return this._updateRequestStatus(sRequestId, sStatusCode);
        },

        async onRequestStatusAction(oEvent) {
            return this._updateRequestStatus(
                this.getView().getBindingContext()?.getProperty("ID"),
                oEvent.getSource().getKey()
            );
        },

        async _updateRequestStatus(sRequestId, sStatusCode) {

            if (!sRequestId || !sStatusCode) {
                return;
            }

            this.showBusy();

            try {
                await this.callAction("updateRequestStatus", {
                    requestId: sRequestId,
                    statusCode: sStatusCode
                });
                MessageToast.show(this.getText("requestStatusUpdatedMessage"));
                this._refreshRequest();
            } catch (oError) {
                MessageBox.error(this.getErrorMessage(oError, this.getText("statusUpdateErrorMessage")));
            } finally {
                this.hideBusy();
            }
        },

        async onReserveRequest() {
            const sRequestId = this.getView().getBindingContext()?.getProperty("ID");
            if (!sRequestId) {
                return;
            }

            this.showBusy();
            try {
                await this.callAction("reserveRequest", { requestId: sRequestId });
                MessageToast.show(this.getText("requestReservedMessage"));
                this._refreshRequest();
            } catch (oError) {
                MessageBox.error(this.getErrorMessage(oError, this.getText("requestReserveErrorMessage")));
            } finally {
                this.hideBusy();
            }
        },

        onOpenAssignRequestUserDialog() {
            this.byId("requestDetailAssignUserDialog").open();
        },

        onAssignRequestUserSearch(oEvent) {
            this._filterUsers(oEvent.getSource(), oEvent.getParameter("value") || "");
        },

        async onAssignRequestUserConfirm(oEvent) {
            const oContext = oEvent.getParameter("selectedItem")?.getBindingContext();
            const sRequestId = this.getView().getBindingContext()?.getProperty("ID");
            const sUserId = oContext?.getProperty("ID");
            if (!sRequestId || !sUserId) {
                return;
            }

            this.showBusy();
            try {
                await this.callAction("assignRequestToUser", { requestId: sRequestId, userId: sUserId });
                MessageToast.show(this.getText("requestAssignedToUserMessage", [oContext.getProperty("displayName")]));
                this._refreshRequest();
            } catch (oError) {
                MessageBox.error(this.getErrorMessage(oError, this.getText("requestAssignToUserErrorMessage")));
            } finally {
                this.hideBusy();
            }
        },

        onAssignRequestUserClose(oEvent) {
            oEvent.getSource().getBinding("items")?.filter([]);
        },

        onProcessorValueHelpRequest() {
            this.byId("requestDetailProcessorValueHelpDialog").open();
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

        async onSaveRequestProcessor() {
            const sRequestId = this.getView().getBindingContext()?.getProperty("ID");
            const sProcessorUserId = this.getView().getModel("processorEdit").getProperty("/processorUser_ID");

            if (!sRequestId || !sProcessorUserId) {
                MessageToast.show(this.getText("selectProcessorMessage"));
                return;
            }

            this.showBusy();

            try {
                await this.callAction("assignRequestProcessor", {
                    requestId: sRequestId,
                    processorUserId: sProcessorUserId
                });
                MessageToast.show(this.getText("requestProcessorUpdatedMessage"));
                this._refreshRequest();
            } catch (oError) {
                MessageBox.error(this.getErrorMessage(oError, this.getText("processorUpdateErrorMessage")));
            } finally {
                this.hideBusy();
            }
        },

        onClose() {
            this.navTo("RouteMyRequests", {}, true);
        },

        onRefresh() {
            this._refreshRequest();
        },

        onCreateSuccessorRequest() {
            const sRequestId = this.getView().getBindingContext()?.getProperty("ID");

            if (!sRequestId) {
                MessageToast.show(this.getText("selectRequestMessage"));
                return;
            }

            this.navTo("RouteRequestCreate", {
                "?query": {
                    predecessorId: sRequestId
                }
            });
        },

        onRelatedRequestPress(oEvent) {
            oEvent.cancelBubble?.();

            const oContext = oEvent.getSource().getBindingContext();
            const sRequestId = oContext?.getProperty("predecessor/ID")
                || oContext?.getProperty("ID");

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

        onTaskReferencePress(oEvent) {
            oEvent.cancelBubble?.();

            const oContext = oEvent.getSource().getBindingContext();
            const sTaskId = oContext && oContext.getProperty("ID");

            if (!sTaskId) {
                MessageToast.show(this.getText("selectTaskMessage"));
                return;
            }

            this.navTo("RouteMyTasks", {
                "?query": {
                    taskId: sTaskId
                }
            });
        },

        onAttachmentReferencePress(oEvent) {
            oEvent.cancelBubble?.();
            this.onViewAttachment(oEvent);
        },

        async onViewAttachment(oEvent) {
            oEvent.cancelBubble?.();

            const oContext = oEvent.getSource().getBindingContext();

            this.showBusy();

            try {
                const oFile = await this._fetchAttachmentContent(oContext);
                const sUrl = URL.createObjectURL(oFile.blob);

                window.open(sUrl, "_blank", "noopener,noreferrer");
                setTimeout(() => URL.revokeObjectURL(sUrl), 60000);
            } catch (oError) {
                MessageBox.error(this.getErrorMessage(oError, this.getText("attachmentOpenErrorMessage")));
            } finally {
                this.hideBusy();
            }
        },

        async onDownloadAttachment(oEvent) {
            oEvent.cancelBubble?.();

            const oContext = oEvent.getSource().getBindingContext();

            this.showBusy();

            try {
                const oFile = await this._fetchAttachmentContent(oContext);
                const sUrl = URL.createObjectURL(oFile.blob);
                const oLink = document.createElement("a");

                oLink.href = sUrl;
                oLink.download = oFile.filename;
                document.body.appendChild(oLink);
                oLink.click();
                document.body.removeChild(oLink);
                URL.revokeObjectURL(sUrl);
            } catch (oError) {
                MessageBox.error(this.getErrorMessage(oError, this.getText("attachmentDownloadErrorMessage")));
            } finally {
                this.hideBusy();
            }
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
                this._refreshRequest();
            } catch (oError) {
                MessageBox.error(this.getErrorMessage(oError, this.getText("taskDeleteErrorMessage")));
            } finally {
                this.hideBusy();
            }
        },

        async onDeleteSelectedTasks() {
            const oTable = this.byId("requestDetailTasksTable");
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
                oTable.removeSelections(true);
                this._refreshRequest();
            } catch (oError) {
                MessageBox.error(this.getErrorMessage(oError, this.getText("taskDeleteErrorMessage")));
            } finally {
                this.hideBusy();
            }
        },

        async onDeleteAttachment(oEvent) {
            oEvent.cancelBubble?.();

            const oContext = oEvent.getSource().getBindingContext();
            const sAttachmentId = oContext && oContext.getProperty("ID");

            if (!sAttachmentId) {
                return;
            }

            const bConfirmed = await this._confirmDelete("deleteAttachmentConfirmMessage");

            if (!bConfirmed) {
                return;
            }

            this.showBusy();

            try {
                await this.removeEntry(`/ProcessAttachments(guid'${sAttachmentId}')`);
                MessageToast.show(this.getText("attachmentDeletedMessage"));
                this._refreshRequest();
            } catch (oError) {
                MessageBox.error(this.getErrorMessage(oError, this.getText("attachmentDeleteErrorMessage")));
            } finally {
                this.hideBusy();
            }
        },

        async onDeleteSelectedAttachments() {
            const oTable = this.byId("requestDetailAttachmentsTable");
            const aAttachmentIds = oTable.getSelectedContexts().map((oContext) => oContext.getProperty("ID"));

            if (!aAttachmentIds.length) {
                MessageToast.show(this.getText("selectItemsToDeleteMessage"));
                return;
            }

            const bConfirmed = await this._confirmDelete("deleteSelectedAttachmentsConfirmMessage", [aAttachmentIds.length]);

            if (!bConfirmed) {
                return;
            }

            this.showBusy();

            try {
                await Promise.all(aAttachmentIds.map((sAttachmentId) => this.removeEntry(`/ProcessAttachments(guid'${sAttachmentId}')`)));
                MessageToast.show(this.getText("selectedAttachmentsDeletedMessage", [aAttachmentIds.length]));
                oTable.removeSelections(true);
                this._refreshRequest();
            } catch (oError) {
                MessageBox.error(this.getErrorMessage(oError, this.getText("attachmentDeleteErrorMessage")));
            } finally {
                this.hideBusy();
            }
        },

        _refreshRequest() {
            const oBinding = this.getView().getElementBinding();

            if (oBinding) {
                oBinding.refresh(true);
            }
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

        _isTruthy(vValue) {
            if (typeof vValue === "string") {
                return vValue.toLowerCase() === "true" || vValue === "1";
            }

            return Boolean(vValue);
        },

        async _fetchAttachmentContent(oContext) {
            const sAttachmentId = oContext.getProperty("ID");
            const sFilename = oContext.getProperty("filename") || this.getText("attachmentFallbackFileName");
            const sMimeType = oContext.getProperty("mimeType") || "application/octet-stream";
            const oResponse = await fetch(this.getServiceV4Url(`ProcessAttachments(ID=${sAttachmentId})/content`), {
                method: "GET",
                credentials: "same-origin"
            });

            if (!oResponse.ok) {
                throw new Error(this.getText("attachmentReadErrorMessage", [sFilename]));
            }

            return {
                filename: sFilename,
                blob: await oResponse.blob(),
                mimeType: sMimeType
            };
        }
    });
});
