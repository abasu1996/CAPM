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

    const SERVICE_V4_URL = "/odata/v4/flowmate/";

    return BaseController.extend("flowmate.controller.MyRequests", {
        onInit() {
            this.getView().setModel(new JSONModel(this._createEmptyTask()), "newTask");
            this.getRouter().getRoute("RouteMyRequests").attachPatternMatched(this.onRouteMatched, this);
        },

        onRouteMatched() {
            this.setOneColumnLayout();
            this._setRequestsLayout(fLibrary.LayoutType.OneColumn);
        },

        onCreateRequest() {
            this.navTo("RouteRequestCreate");
        },

        onRequestPress(oEvent) {
            this._openRequest(oEvent.getSource().getBindingContext());
        },

        onRequestTaskPress(oEvent) {
            const oContext = oEvent.getSource().getBindingContext();
            const sTaskId = oContext && oContext.getProperty("ID");

            if (!sTaskId) {
                MessageToast.show(this.getText("selectTaskMessage"));
                return;
            }

            this._showRequestTaskDetail(sTaskId);
        },

        onOpenSelectedRequest() {
            const oSelectedItem = this.byId("requestsTable").getSelectedItem();
            const oContext = oSelectedItem && oSelectedItem.getBindingContext();

            if (!oContext) {
                MessageToast.show(this.getText("selectRequestMessage"));
                return;
            }

            this._showRequestDetail(oContext);
        },

        onSearch(oEvent) {
            const sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
            const oBinding = this.byId("requestsTable").getBinding("items");

            if (!sQuery) {
                oBinding.filter([]);
                return;
            }

            oBinding.filter([
                new Filter({
                    filters: [
                        new Filter("title", FilterOperator.Contains, sQuery),
                        new Filter("processType_code", FilterOperator.Contains, sQuery),
                        new Filter("status_code", FilterOperator.Contains, sQuery),
                        new Filter("department", FilterOperator.Contains, sQuery),
                        new Filter("priority", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                })
            ]);
        },

        onCloseRequestDetail() {
            this._setRequestsLayout(fLibrary.LayoutType.OneColumn);
        },

        onCloseRequestTaskDetail() {
            this._setRequestsLayout(fLibrary.LayoutType.TwoColumnsMidExpanded);
        },

        async onApproveRequestTask() {
            await this._completeRequestTask("approveTask", "taskApprovedMessage");
        },

        async onRejectRequestTask() {
            await this._completeRequestTask("rejectTask", "taskRejectedMessage");
        },

        async onSendBackRequestTask() {
            await this._completeRequestTask("sendBack", "taskSentBackMessage");
        },

        onOpenAddTaskDialog() {
            if (!this._sSelectedRequestId) {
                MessageToast.show(this.getText("selectRequestMessage"));
                return;
            }

            this.getView().getModel("newTask").setData(this._createEmptyTask());
            this.byId("addTaskDialog").open();
        },

        onAddTaskCancel() {
            this.byId("addTaskDialog").close();
        },

        async onAddTaskConfirm() {
            const oTask = this.getView().getModel("newTask").getData();

            if (!oTask.taskName || !oTask.stepNo) {
                MessageBox.warning(this.getText("taskRequiredMessage"));
                return;
            }

            this.getView().setBusy(true);

            try {
                await this.createEntry("/ProcessTasks", {
                    request_ID: this._sSelectedRequestId,
                    stepNo: Number(oTask.stepNo),
                    taskName: oTask.taskName,
                    assignedTo: oTask.assignedTo,
                    role: oTask.role,
                    status_code: "OPEN"
                });
                this.byId("addTaskDialog").close();
                MessageToast.show(this.getText("taskCreatedMessage"));
                this._refreshSelectedRequest();
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("taskCreateErrorMessage"));
            } finally {
                this.getView().setBusy(false);
            }
        },

        async onRequestAttachmentsSelected(oEvent) {
            const aFiles = Array.from(oEvent.getParameter("files") || []);

            oEvent.getSource().clear();

            if (!this._sSelectedRequestId) {
                MessageToast.show(this.getText("selectRequestMessage"));
                return;
            }

            if (!aFiles.length) {
                return;
            }

            this.getView().setBusy(true);

            try {
                await this._uploadAttachments(this._sSelectedRequestId, aFiles);
                MessageToast.show(this.getText("attachmentsUploadedMessage"));
                this._refreshSelectedRequest();
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("attachmentContentErrorMessage", [""]));
            } finally {
                this.getView().setBusy(false);
            }
        },

        async onViewAttachment(oEvent) {
            const oContext = oEvent.getSource().getBindingContext();

            try {
                const oFile = await this._fetchAttachmentContent(oContext);
                const sUrl = URL.createObjectURL(oFile.blob);

                window.open(sUrl, "_blank", "noopener,noreferrer");
                setTimeout(() => URL.revokeObjectURL(sUrl), 60000);
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("attachmentOpenErrorMessage"));
            }
        },

        async onDownloadAttachment(oEvent) {
            const oContext = oEvent.getSource().getBindingContext();

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
                MessageBox.error(oError.message || this.getText("attachmentDownloadErrorMessage"));
            }
        },

        async onDeleteRequestTask(oEvent) {
            
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
                    this.onCloseRequestTaskDetail();
                }

                this._refreshSelectedRequest();
                this.byId("requestsTable").getBinding("items").refresh();
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("taskDeleteErrorMessage"));
            } finally {
                this.getView().setBusy(false);
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

            this.getView().setBusy(true);

            try {
                await this.removeEntry(`/ProcessAttachments(guid'${sAttachmentId}')`);
                MessageToast.show(this.getText("attachmentDeletedMessage"));
                this._refreshSelectedRequest();
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("attachmentDeleteErrorMessage"));
            } finally {
                this.getView().setBusy(false);
            }
        },

        formatPriorityHighlight(sPriority) {
            switch ((sPriority || "").toLowerCase()) {
                case "critical":
                    return "Error";
                case "high":
                    return "Warning";
                case "medium":
                    return "Information";
                case "low":
                    return "Success";
                default:
                    return "None";
            }
        },

        formatPriorityState(sPriority) {
            switch ((sPriority || "").toLowerCase()) {
                case "critical":
                    return "Error";
                case "high":
                    return "Warning";
                case "medium":
                    return "Information";
                case "low":
                    return "Success";
                default:
                    return "None";
            }
        },

        _openRequest(oContext) {
            this._showRequestDetail(oContext);
        },

        _showRequestDetail(oContext) {
            const sRequestId = oContext.getProperty("ID");

            this._sSelectedRequestId = sRequestId;
            this.byId("requestObjectPage").bindElement({
                path: `/ProcessRequests(guid'${sRequestId}')`,
                parameters: {
                    expand: "tasks,comments,attachments,history"
                }
            });
            this._setRequestsLayout(fLibrary.LayoutType.TwoColumnsMidExpanded);
        },

        _setRequestsLayout(sLayout) {
            this.byId("requestsFlexibleColumnLayout").setLayout(sLayout);
        },

        _showRequestTaskDetail(sTaskId) {
            this._sSelectedTaskId = sTaskId;
            this.byId("requestTaskObjectPage").bindElement({
                path: `/ProcessTasks(guid'${sTaskId}')`,
                parameters: {
                    expand: "request"
                }
            });
            this._setRequestsLayout(fLibrary.LayoutType.ThreeColumnsEndExpanded);
        },

        async _completeRequestTask(sAction, sSuccessTextKey) {
            if (!this._sSelectedTaskId) {
                MessageToast.show(this.getText("selectTaskMessage"));
                return;
            }

            this.getView().setBusy(true);

            try {
                await this.callAction(sAction, {
                    taskId: this._sSelectedTaskId,
                    remarks: this.byId("requestTaskRemarksTextArea").getValue()
                });
                MessageToast.show(this.getText(sSuccessTextKey));
                this.byId("requestTaskRemarksTextArea").setValue("");
                this._refreshSelectedRequest();
                this.byId("requestTaskObjectPage").getElementBinding().refresh();
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("actionFailedMessage"));
            } finally {
                this.getView().setBusy(false);
            }
        },

        _createEmptyTask() {
            return {
                taskName: "",
                stepNo: "",
                assignedTo: "",
                role: ""
            };
        },

        _refreshSelectedRequest() {
            const oBinding = this.byId("requestObjectPage").getElementBinding();

            if (oBinding) {
                oBinding.refresh();
            }
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

        async _uploadAttachments(sRequestId, aFiles) {
            const sToken = await this._fetchCsrfToken();

            for (const oFile of aFiles) {
                const oAttachment = await this._createAttachmentMetadata(sRequestId, oFile, sToken);
                await this._uploadAttachmentContent(oAttachment.ID, oFile, sToken);
            }
        },

        async _createAttachmentMetadata(sRequestId, oFile, sToken) {
            const oResponse = await fetch(`${SERVICE_V4_URL}ProcessAttachments`, {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "X-CSRF-Token": sToken
                },
                body: JSON.stringify({
                    request_ID: sRequestId,
                    filename: oFile.name,
                    mimeType: oFile.type || "application/octet-stream"
                })
            });

            if (!oResponse.ok) {
                throw new Error(this.getText("attachmentMetadataErrorMessage", [oFile.name]));
            }

            return oResponse.json();
        },

        async _uploadAttachmentContent(sAttachmentId, oFile, sToken) {
            const oResponse = await fetch(`${SERVICE_V4_URL}ProcessAttachments(ID=${sAttachmentId})/content`, {
                method: "PUT",
                credentials: "same-origin",
                headers: {
                    "Content-Type": oFile.type || "application/octet-stream",
                    "X-CSRF-Token": sToken
                },
                body: oFile
            });

            if (!oResponse.ok) {
                throw new Error(this.getText("attachmentContentErrorMessage", [oFile.name]));
            }
        },

        async _fetchAttachmentContent(oContext) {
            const sAttachmentId = oContext.getProperty("ID");
            const sFilename = oContext.getProperty("filename") || this.getText("attachmentFallbackFileName");
            const sMimeType = oContext.getProperty("mimeType") || "application/octet-stream";
            const oResponse = await fetch(`${SERVICE_V4_URL}ProcessAttachments(ID=${sAttachmentId})/content`, {
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
