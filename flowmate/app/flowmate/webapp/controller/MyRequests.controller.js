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
    const MAX_ATTACHMENT_SIZE_MB = 400;
    const MAX_ATTACHMENT_SIZE_BYTES = MAX_ATTACHMENT_SIZE_MB * 1024 * 1024;

    return BaseController.extend("flowmate.controller.MyRequests", {
        onInit() {
            this.getView().setModel(new JSONModel(this._createEmptyTask()), "newTask");
            this.getView().setModel(new JSONModel({
                active: false,
                items: []
            }), "uploads");
            this.getRouter().getRoute("RouteMyRequests").attachPatternMatched(this.onRouteMatched, this);
        },

        onRouteMatched() {
            this.setOneColumnLayout();
            this._setRequestsLayout(fLibrary.LayoutType.OneColumn);
        },

        onCreateRequest() {
            this.navTo("RouteRequestCreate");
        },

        onBeforeRebindRequestsTable(oEvent) {
            const oBindingParams = oEvent.getParameter("bindingParams");
            const oEvents = oBindingParams.events || {};
            const fnDataRequested = oEvents.dataRequested;
            const fnDataReceived = oEvents.dataReceived;

            oBindingParams.events = oEvents;
            oEvents.dataRequested = (...aArgs) => {
                fnDataRequested?.(...aArgs);
                this.onDataRequested();
            };
            oEvents.dataReceived = (...aArgs) => {
                fnDataReceived?.(...aArgs);
                this.onDataReceived();
            };
        },

        onRequestPress(oEvent) {
            const oItem = oEvent.getParameter("listItem") || oEvent.getSource();
            this._openRequest(oItem.getBindingContext());
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

        onAssigneeValueHelpRequest() {
            this.byId("assigneeValueHelpDialog").open();
        },

        onAssigneeValueHelpSearch(oEvent) {
            this._filterUsers(oEvent.getSource(), oEvent.getParameter("value") || "");
        },

        onAssigneeValueHelpConfirm(oEvent) {
            const oContext = oEvent.getParameter("selectedItem")?.getBindingContext();

            if (!oContext) {
                return;
            }

            const oTaskModel = this.getView().getModel("newTask");
            oTaskModel.setProperty("/assignedUser_ID", oContext.getProperty("ID"));
            oTaskModel.setProperty("/assignedToName", oContext.getProperty("displayName"));
            oTaskModel.setProperty("/assignedTo", oContext.getProperty("email") || oContext.getProperty("userPrincipalName"));
            this.onAssigneeValueHelpClose(oEvent);
        },

        onAssigneeValueHelpClose(oEvent) {
            oEvent.getSource().getBinding("items")?.filter([]);
        },

        async onAddTaskConfirm() {
            const oTask = this.getView().getModel("newTask").getData();

            if (!oTask.taskName || !oTask.stepNo) {
                MessageBox.warning(this.getText("taskRequiredMessage"));
                return;
            }

            this.showBusy();

            try {
                await this.createEntry("/ProcessTasks", {
                    request_ID: this._sSelectedRequestId,
                    stepNo: Number(oTask.stepNo),
                    taskName: oTask.taskName,
                    assignedUser_ID: oTask.assignedUser_ID || undefined,
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
                this.hideBusy();
            }
        },

        async onRequestAttachmentsSelected(oEvent) {
            const aFiles = Array.from(oEvent.getParameter("files") || []);

            oEvent.getSource().clear();

            if (!this._validateAttachmentFiles(aFiles)) {
                return;
            }

            if (!this._sSelectedRequestId) {
                MessageToast.show(this.getText("selectRequestMessage"));
                return;
            }

            if (!aFiles.length) {
                return;
            }

            this._startAttachmentUploads(aFiles);

            try {
                await this._uploadAttachments(this._sSelectedRequestId, aFiles);
                MessageToast.show(this.getText("attachmentsUploadedMessage"));
                this._refreshSelectedRequest();
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("attachmentContentErrorMessage", [""]));
            } finally {
                this.getView().getModel("uploads").setProperty("/active", false);
            }
        },

        onAttachmentFileSizeExceed(oEvent) {
            MessageBox.warning(this.getText("attachmentSizeExceededMessage", [
                oEvent.getParameter("fileName"),
                MAX_ATTACHMENT_SIZE_MB
            ]));
            oEvent.getSource().clear();
        },

        async onViewAttachment(oEvent) {
            const oContext = oEvent.getSource().getBindingContext();

            this.showBusy();

            try {
                const oFile = await this._fetchAttachmentContent(oContext);
                const sUrl = URL.createObjectURL(oFile.blob);

                window.open(sUrl, "_blank", "noopener,noreferrer");
                setTimeout(() => URL.revokeObjectURL(sUrl), 60000);
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("attachmentOpenErrorMessage"));
            } finally {
                this.hideBusy();
            }
        },

        async onDownloadAttachment(oEvent) {
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
                MessageBox.error(oError.message || this.getText("attachmentDownloadErrorMessage"));
            } finally {
                this.hideBusy();
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

            this.showBusy();

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
                this._refreshSelectedRequest();
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("attachmentDeleteErrorMessage"));
            } finally {
                this.hideBusy();
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
                },
                events: {
                    dataRequested: this.onDataRequested.bind(this),
                    dataReceived: this.onDataReceived.bind(this)
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
                },
                events: {
                    dataRequested: this.onDataRequested.bind(this),
                    dataReceived: this.onDataReceived.bind(this)
                }
            });
            this._setRequestsLayout(fLibrary.LayoutType.ThreeColumnsEndExpanded);
        },

        async _completeRequestTask(sAction, sSuccessTextKey) {
            if (!this._sSelectedTaskId) {
                MessageToast.show(this.getText("selectTaskMessage"));
                return;
            }

            this.showBusy();

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
                this.hideBusy();
            }
        },

        _createEmptyTask() {
            return {
                taskName: "",
                stepNo: "",
                assignedUser_ID: "",
                assignedToName: "",
                assignedTo: "",
                role: ""
            };
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
                        new Filter("userPrincipalName", FilterOperator.Contains, sQuery),
                        new Filter("department", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                })
            ]);
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

            for (let iIndex = 0; iIndex < aFiles.length; iIndex += 1) {
                const oFile = aFiles[iIndex];

                this._setAttachmentUploadStatus(iIndex, {
                    statusText: this.getText("attachmentUploadingStatus"),
                    statusState: "Information"
                });

                try {
                    const oAttachment = await this._createAttachmentMetadata(sRequestId, oFile, sToken);
                    await this._uploadAttachmentContent(oAttachment.ID, oFile, sToken, (iPercent) => {
                        this._setAttachmentUploadStatus(iIndex, {
                            progress: iPercent,
                            progressText: `${iPercent}%`,
                            statusText: iPercent === 100
                                ? this.getText("attachmentProcessingStatus")
                                : this.getText("attachmentUploadingStatus")
                        });
                    });
                    this._setAttachmentUploadStatus(iIndex, {
                        progress: 100,
                        progressText: "100%",
                        statusText: this.getText("attachmentUploadedStatus"),
                        statusState: "Success"
                    });
                } catch (oError) {
                    this._setAttachmentUploadStatus(iIndex, {
                        statusText: this.getText("attachmentUploadFailedStatus"),
                        statusState: "Error"
                    });
                    throw oError;
                }
            }
        },

        _startAttachmentUploads(aFiles) {
            this.getView().getModel("uploads").setData({
                active: true,
                items: aFiles.map((oFile) => ({
                    name: oFile.name,
                    progress: 0,
                    progressText: "0%",
                    statusText: this.getText("attachmentQueuedStatus"),
                    statusState: "None"
                }))
            });
        },

        _setAttachmentUploadStatus(iIndex, oValues) {
            const oModel = this.getView().getModel("uploads");

            Object.entries(oValues).forEach(([sProperty, vValue]) => {
                oModel.setProperty(`/items/${iIndex}/${sProperty}`, vValue);
            });
        },

        _validateAttachmentFiles(aFiles) {
            const oOversizedFile = aFiles.find((oFile) => oFile.size > MAX_ATTACHMENT_SIZE_BYTES);

            if (!oOversizedFile) {
                return true;
            }

            MessageBox.warning(this.getText("attachmentSizeExceededMessage", [
                oOversizedFile.name,
                MAX_ATTACHMENT_SIZE_MB
            ]));
            return false;
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

        _uploadAttachmentContent(sAttachmentId, oFile, sToken, fnProgress) {
            return new Promise((resolve, reject) => {
                const oRequest = new XMLHttpRequest();

                oRequest.open("PUT", `${SERVICE_V4_URL}ProcessAttachments(ID=${sAttachmentId})/content`);
                oRequest.withCredentials = true;
                oRequest.setRequestHeader("Content-Type", oFile.type || "application/octet-stream");
                oRequest.setRequestHeader("X-CSRF-Token", sToken);
                oRequest.upload.onprogress = (oEvent) => {
                    if (oEvent.lengthComputable) {
                        fnProgress(Math.round((oEvent.loaded / oEvent.total) * 100));
                    }
                };
                oRequest.onload = () => {
                    if (oRequest.status >= 200 && oRequest.status < 300) {
                        resolve();
                        return;
                    }

                    reject(new Error(this.getText("attachmentContentErrorMessage", [oFile.name])));
                };
                oRequest.onerror = () => {
                    reject(new Error(this.getText("attachmentContentErrorMessage", [oFile.name])));
                };
                oRequest.send(oFile);
            });
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
