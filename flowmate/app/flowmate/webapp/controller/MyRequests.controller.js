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
            this.getView().setModel(new JSONModel(this._createEmptyParty()), "newParty");
            this.getView().setModel(new JSONModel({
                active: false,
                items: []
            }), "uploads");
            this.getView().setModel(new JSONModel({
                requestStatus: "",
                taskStatus: ""
            }), "statusEdit");
            this.getView().setModel(new JSONModel({
                requestProcessorUser_ID: "",
                requestProcessorName: "",
                taskProcessorUser_ID: "",
                taskProcessorName: ""
            }), "processorEdit");
            this.getView().setModel(new JSONModel({
                midFullScreen: false,
                endFullScreen: false
            }), "fclState");
            this.getView().setModel(new JSONModel({
                editable: true
            }), "requestEdit");
            this.getView().setModel(new JSONModel({
                visible: false,
                loading: false,
                steps: []
            }), "processFlow");
            this.getRouter().getRoute("RouteMyRequests").attachPatternMatched(this.onRouteMatched, this);
        },

        onRouteMatched(oEvent) {
            const oQuery = oEvent.getParameter("arguments")["?query"];
            const sRequestId = oQuery && oQuery.requestId;

            this.setOneColumnLayout();
            this._rebindRequestsTable();

            if (sRequestId) {
                this._showRequestDetailById(sRequestId);
                return;
            }

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
            const sExpand = oBindingParams.parameters.expand || "";

            oBindingParams.events = oEvents;
            oBindingParams.parameters.expand = sExpand
                ? `${sExpand},processType`
                : "processType";
            oEvents.dataRequested = (...aArgs) => {
                fnDataRequested?.(...aArgs);
                this.onDataRequested();
            };
            oEvents.dataReceived = (...aArgs) => {
                fnDataReceived?.(...aArgs);
                this.onDataReceived();
            };
        },

        _rebindRequestsTable() {
            const oSmartTable = this.byId("requestsSmartTable");

            if (oSmartTable.isInitialised()) {
                oSmartTable.rebindTable(true);
                return;
            }

            oSmartTable.attachEventOnce("initialise", () => {
                oSmartTable.rebindTable(true);
            });
        },

        onRequestPress(oEvent) {
            const oItem = oEvent.getParameter("listItem") || oEvent.getSource();
            this._openRequest(oItem.getBindingContext());
        },

        onRequestReferencePress(oEvent) {
            oEvent.cancelBubble?.();

            const oContext = oEvent.getSource().getBindingContext();

            if (oContext) {
                this._openRequest(oContext);
            }
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

        onRequestTaskReferencePress(oEvent) {
            oEvent.cancelBubble?.();
            this.onRequestTaskPress(oEvent);
        },

        onRelatedRequestPress(oEvent) {
            oEvent.cancelBubble?.();

            const oContext = oEvent.getSource().getBindingContext();
            const sRequestId = oContext?.getProperty("request/ID")
                || oContext?.getProperty("request_ID")
                || this._sSelectedRequestId;

            if (!sRequestId) {
                MessageToast.show(this.getText("selectRequestMessage"));
                return;
            }

            this._showRequestDetailById(sRequestId);
        },

        onRequestPartyPress(oEvent) {
            const oContext = oEvent.getSource().getBindingContext();
            const sPartyId = oContext && oContext.getProperty("ID");

            if (!sPartyId) {
                MessageToast.show(this.getText("selectPartyMessage"));
                return;
            }

            this._showInvolvedPartyDetail(sPartyId);
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
                        new Filter("referenceNumber", FilterOperator.Contains, sQuery),
                        new Filter("title", FilterOperator.Contains, sQuery),
                        new Filter("processor", FilterOperator.Contains, sQuery),
                        new Filter("processType_code", FilterOperator.Contains, sQuery),
                        new Filter("processType/descr", FilterOperator.Contains, sQuery),
                        new Filter("status_code", FilterOperator.Contains, sQuery),
                        new Filter("department", FilterOperator.Contains, sQuery),
                        new Filter("priority", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                })
            ]);
        },

        onCloseRequestDetail() {
            this._resetRequestSelection();
            this.navTo("RouteMyRequests", {}, true);
        },

        onCloseRequestTaskDetail() {
            this._sSelectedTaskId = null;
            this._setRequestsLayout(fLibrary.LayoutType.TwoColumnsMidExpanded);
        },

        onCloseInvolvedPartyDetail() {
            this._resetRequestSelection();
            this.navTo("RouteMyRequests", {}, true);
        },

        onRefreshRequestDetail() {
            this._refreshSelectedRequest();
            this.byId("requestsTable").getBinding("items")?.refresh();
        },

        onRefreshRequestTaskDetail() {
            this.byId("requestTaskObjectPage").getElementBinding()?.refresh();
            this._refreshSelectedRequest();
        },

        onRefreshInvolvedPartyDetail() {
            this.byId("requestPartyObjectPage").getElementBinding()?.refresh();
            this._refreshSelectedRequest();
        },

        onToggleRequestFullScreen() {
            const sLayout = this.byId("requestsFlexibleColumnLayout").getLayout();

            if (sLayout === fLibrary.LayoutType.MidColumnFullScreen) {
                this._setRequestsLayout(this._sMidRestoreLayout || fLibrary.LayoutType.TwoColumnsMidExpanded);
                return;
            }

            this._sMidRestoreLayout = sLayout;
            this._setRequestsLayout(fLibrary.LayoutType.MidColumnFullScreen);
        },

        onToggleRequestTaskFullScreen() {
            const sLayout = this.byId("requestsFlexibleColumnLayout").getLayout();

            if (sLayout === fLibrary.LayoutType.EndColumnFullScreen) {
                this._setRequestsLayout(this._sEndRestoreLayout || fLibrary.LayoutType.ThreeColumnsEndExpanded);
                return;
            }

            this._sEndRestoreLayout = sLayout;
            this._setRequestsLayout(fLibrary.LayoutType.EndColumnFullScreen);
        },

        async onSaveRequestStatus() {
            const sStatusCode = this.getView().getModel("statusEdit").getProperty("/requestStatus");

            if (!this._sSelectedRequestId || !sStatusCode) {
                return;
            }

            this.showBusy();

            try {
                await this.callAction("updateRequestStatus", {
                    requestId: this._sSelectedRequestId,
                    statusCode: sStatusCode
                });
                MessageToast.show(this.getText("requestStatusUpdatedMessage"));
                this._refreshSelectedRequest();
                this.byId("requestsTable").getBinding("items").refresh();
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("statusUpdateErrorMessage"));
            } finally {
                this.hideBusy();
            }
        },

        async onSaveRequestTaskStatus() {
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
                this._refreshSelectedRequest();
                this.byId("requestTaskObjectPage").getElementBinding().refresh();
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("statusUpdateErrorMessage"));
            } finally {
                this.hideBusy();
            }
        },

        onRequestProcessorValueHelpRequest() {
            this._sProcessorValueHelpTarget = "request";
            this.byId("myRequestsProcessorValueHelpDialog").open();
        },

        onRequestTaskProcessorValueHelpRequest() {
            this._sProcessorValueHelpTarget = "task";
            this.byId("myRequestsProcessorValueHelpDialog").open();
        },

        onNewTaskProcessorValueHelpRequest() {
            this._sProcessorValueHelpTarget = "newTask";
            this.byId("myRequestsProcessorValueHelpDialog").open();
        },

        onProcessorValueHelpSearch(oEvent) {
            this._filterUsers(oEvent.getSource(), oEvent.getParameter("value") || "");
        },

        onProcessorValueHelpConfirm(oEvent) {
            const oContext = oEvent.getParameter("selectedItem")?.getBindingContext();

            if (!oContext) {
                return;
            }

            const sId = oContext.getProperty("ID");
            const sName = oContext.getProperty("displayName");

            if (this._sProcessorValueHelpTarget === "newTask") {
                const oTaskModel = this.getView().getModel("newTask");
                oTaskModel.setProperty("/processorUser_ID", sId);
                oTaskModel.setProperty("/processorName", sName);
                oTaskModel.setProperty("/processor", sName);
            } else {
                const oProcessorModel = this.getView().getModel("processorEdit");
                const sPrefix = this._sProcessorValueHelpTarget === "request" ? "request" : "task";

                oProcessorModel.setProperty(`/${sPrefix}ProcessorUser_ID`, sId);
                oProcessorModel.setProperty(`/${sPrefix}ProcessorName`, sName);
            }

            this.onProcessorValueHelpClose(oEvent);
        },

        onProcessorValueHelpClose(oEvent) {
            oEvent.getSource().getBinding("items")?.filter([]);
        },

        async onSaveRequestProcessor() {
            const sProcessorUserId = this.getView().getModel("processorEdit").getProperty("/requestProcessorUser_ID");

            if (!this._sSelectedRequestId || !sProcessorUserId) {
                MessageToast.show(this.getText("selectProcessorMessage"));
                return;
            }

            this.showBusy();

            try {
                await this.callAction("assignRequestProcessor", {
                    requestId: this._sSelectedRequestId,
                    processorUserId: sProcessorUserId
                });
                MessageToast.show(this.getText("requestProcessorUpdatedMessage"));
                this._refreshSelectedRequest();
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("processorUpdateErrorMessage"));
            } finally {
                this.hideBusy();
            }
        },

        async onSaveRequestTaskProcessor() {
            const sProcessorUserId = this.getView().getModel("processorEdit").getProperty("/taskProcessorUser_ID");

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
                this._refreshSelectedRequest();
                this.byId("requestTaskObjectPage").getElementBinding().refresh();
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("processorUpdateErrorMessage"));
            } finally {
                this.hideBusy();
            }
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

            this.showBusy();

            try {
                await this.createEntry("/ProcessTasks", {
                    request_ID: this._sSelectedRequestId,
                    stepNo: Number(oTask.stepNo),
                    taskName: oTask.taskName,
                    processorUser_ID: oTask.processorUser_ID || undefined,
                    processor: oTask.processor,
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

        onOpenAddPartyDialog() {
            if (!this._sSelectedRequestId) {
                MessageToast.show(this.getText("selectRequestMessage"));
                return;
            }

            this.getView().getModel("newParty").setData(this._createEmptyParty());
            this.byId("addPartyDialog").open();
        },

        onAddPartyCancel() {
            this.byId("addPartyDialog").close();
        },

        onPartyValueHelpRequest() {
            this.byId("involvedPartyValueHelpDialog").open();
        },

        onPartyValueHelpSearch(oEvent) {
            this._filterUsers(oEvent.getSource(), oEvent.getParameter("value") || "");
        },

        onPartyValueHelpConfirm(oEvent) {
            const oContext = oEvent.getParameter("selectedItem")?.getBindingContext();

            if (oContext) {
                const oModel = this.getView().getModel("newParty");
                oModel.setProperty("/user_ID", oContext.getProperty("ID"));
                oModel.setProperty("/displayName", oContext.getProperty("displayName"));
                oModel.setProperty("/email", oContext.getProperty("email"));
                oModel.setProperty("/department", oContext.getProperty("department"));
            }

            this.onPartyValueHelpClose(oEvent);
        },

        onPartyValueHelpClose(oEvent) {
            oEvent.getSource().getBinding("items")?.filter([]);
        },

        async onAddPartyConfirm() {
            const oParty = this.getView().getModel("newParty").getData();

            if (!oParty.user_ID) {
                MessageBox.warning(this.getText("selectPartyMessage"));
                return;
            }

            this.showBusy();

            try {
                await this.createEntry("/ProcessInvolvedParties", {
                    request_ID: this._sSelectedRequestId,
                    user_ID: oParty.user_ID,
                    purpose: oParty.purpose
                });
                this.byId("addPartyDialog").close();
                MessageToast.show(this.getText("partyCreatedMessage"));
                this._refreshSelectedRequest();
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("partyCreateErrorMessage"));
            } finally {
                this.hideBusy();
            }
        },

        async onNotifyInvolvedParty(oEvent) {
            oEvent.cancelBubble?.();

            const oContext = oEvent.getSource().getBindingContext();
            const sPartyId = oContext && oContext.getProperty("ID");

            if (!sPartyId) {
                MessageToast.show(this.getText("selectPartyMessage"));
                return;
            }

            this.showBusy();

            try {
                const oRecipient = await this.callAction("resolveInvolvedPartyNotificationRecipient", {
                    partyId: sPartyId
                });
                const sRequestTitle = oContext.getProperty("request/title")
                    || this.byId("requestObjectPage").getBindingContext()?.getProperty("title")
                    || "";
                const sPurpose = oContext.getProperty("purpose") || "";
                const sSubject = this.getText("partyNotificationSubject", [sRequestTitle]);
                const sBody = this.getText("partyNotificationBody", [sRequestTitle, sPurpose, window.location.href]);

                if (oRecipient.delegated) {
                    MessageToast.show(this.getText("notificationDelegatedMessage", [oRecipient.recipient]));
                }

                window.location.href = `mailto:${encodeURIComponent(oRecipient.recipient)}?subject=${encodeURIComponent(sSubject)}&body=${encodeURIComponent(sBody)}`;
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("partyEmailMissingMessage"));
            } finally {
                this.hideBusy();
            }
        },

        async onDeleteParty(oEvent) {
            oEvent.cancelBubble?.();

            const sPartyId = oEvent.getSource().getBindingContext()?.getProperty("ID");

            if (!sPartyId || !await this._confirmDelete("deletePartyConfirmMessage")) {
                return;
            }

            this.showBusy();

            try {
                await this.removeEntry(`/ProcessInvolvedParties(guid'${sPartyId}')`);
                MessageToast.show(this.getText("partyDeletedMessage"));

                if (this._sSelectedPartyId === sPartyId) {
                    this._sSelectedPartyId = null;
                    this.onCloseInvolvedPartyDetail();
                }

                this._refreshSelectedRequest();
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("partyDeleteErrorMessage"));
            } finally {
                this.hideBusy();
            }
        },

        async onDeleteSelectedParties() {
            const oTable = this.byId("requestPartiesTable");
            const aIds = oTable.getSelectedContexts().map((oContext) => oContext.getProperty("ID"));

            if (!aIds.length) {
                MessageToast.show(this.getText("selectItemsToDeleteMessage"));
                return;
            }

            if (!await this._confirmDelete("deleteSelectedPartiesConfirmMessage", [aIds.length])) {
                return;
            }

            this.showBusy();

            try {
                await Promise.all(aIds.map((sId) => this.removeEntry(`/ProcessInvolvedParties(guid'${sId}')`)));
                MessageToast.show(this.getText("selectedPartiesDeletedMessage", [aIds.length]));

                if (aIds.includes(this._sSelectedPartyId)) {
                    this._sSelectedPartyId = null;
                    this.onCloseInvolvedPartyDetail();
                }

                oTable.removeSelections(true);
                this._refreshSelectedRequest();
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("partyDeleteErrorMessage"));
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
            oEvent.cancelBubble?.();

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

        onAttachmentReferencePress(oEvent) {
            oEvent.cancelBubble?.();
            this.onViewAttachment(oEvent);
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

        async onDeleteSelectedRequestTasks() {
            const oTable = this.byId("requestTasksTable");
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
                    this.onCloseRequestTaskDetail();
                }

                oTable.removeSelections(true);
                this._refreshSelectedRequest();
                this.byId("requestsTable").getBinding("items").refresh();
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("taskDeleteErrorMessage"));
            } finally {
                this.hideBusy();
            }
        },

        async onDeleteRequest(oEvent) {
            oEvent.cancelBubble?.();

            const oContext = oEvent.getSource().getBindingContext();
            const sRequestId = oContext && oContext.getProperty("ID");

            if (!sRequestId) {
                MessageToast.show(this.getText("selectRequestMessage"));
                return;
            }

            const bConfirmed = await this._confirmDelete("deleteRequestConfirmMessage");

            if (!bConfirmed) {
                return;
            }

            this.showBusy();

            try {
                await this.removeEntry(`/ProcessRequests(guid'${sRequestId}')`);
                MessageToast.show(this.getText("requestDeletedMessage"));

                if (this._sSelectedRequestId === sRequestId) {
                    this._sSelectedRequestId = null;
                    this._sSelectedTaskId = null;
                    this._setRequestsLayout(fLibrary.LayoutType.OneColumn);
                }

                this.byId("requestsTable").getBinding("items").refresh();
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("requestDeleteErrorMessage"));
            } finally {
                this.hideBusy();
            }
        },

        async onDeleteSelectedRequests() {
            const oTable = this.byId("requestsTable");
            const aRequestIds = oTable.getSelectedContexts().map((oContext) => oContext.getProperty("ID"));

            if (!aRequestIds.length) {
                MessageToast.show(this.getText("selectItemsToDeleteMessage"));
                return;
            }

            const bConfirmed = await this._confirmDelete("deleteSelectedRequestsConfirmMessage", [aRequestIds.length]);

            if (!bConfirmed) {
                return;
            }

            this.showBusy();

            try {
                await Promise.all(aRequestIds.map((sRequestId) => this.removeEntry(`/ProcessRequests(guid'${sRequestId}')`)));
                MessageToast.show(this.getText("selectedRequestsDeletedMessage", [aRequestIds.length]));

                if (aRequestIds.includes(this._sSelectedRequestId)) {
                    this._sSelectedRequestId = null;
                    this._sSelectedTaskId = null;
                    this._setRequestsLayout(fLibrary.LayoutType.OneColumn);
                }

                oTable.removeSelections(true);
                oTable.getBinding("items").refresh();
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("requestDeleteErrorMessage"));
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

        async onDeleteSelectedAttachments() {
            const oTable = this.byId("requestAttachmentsTable");
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
            this._showRequestDetailById(oContext.getProperty("ID"));
        },

        _showRequestDetailById(sRequestId) {
            this._sSelectedRequestId = sRequestId;
            this.byId("requestObjectPage").bindElement({
                path: `/ProcessRequests(guid'${sRequestId}')`,
                parameters: {
                    expand: "processType,tasks,involvedParties,comments,attachments,history"
                },
                events: {
                    dataRequested: this.onDataRequested.bind(this),
                    dataReceived: () => {
                        this.onDataReceived();
                        const oRequestContext = this.byId("requestObjectPage").getBindingContext();
                        const oRequest = oRequestContext?.getObject();

                        this.getView().getModel("statusEdit").setProperty(
                            "/requestStatus",
                            oRequest?.status_code || ""
                        );
                        this.getView().getModel("requestEdit").setProperty(
                            "/editable",
                            this._isRequestEditable(oRequest)
                        );
                        this.getView().getModel("processorEdit").setProperty(
                            "/requestProcessorUser_ID",
                            oRequest?.processorUser_ID || ""
                        );
                        this.getView().getModel("processorEdit").setProperty(
                            "/requestProcessorName",
                            oRequest?.processor || ""
                        );
                        this._loadProcessFlow(sRequestId, oRequest);
                    }
                }
            });
            this._setRequestsLayout(fLibrary.LayoutType.TwoColumnsMidExpanded);
        },

        _setRequestsLayout(sLayout) {
            this.byId("requestsFlexibleColumnLayout").setLayout(sLayout);
            this.getView().getModel("fclState").setData({
                midFullScreen: sLayout === fLibrary.LayoutType.MidColumnFullScreen,
                endFullScreen: sLayout === fLibrary.LayoutType.EndColumnFullScreen
            });
        },

        _resetRequestSelection() {
            this._sSelectedRequestId = null;
            this._sSelectedTaskId = null;
            this._sSelectedPartyId = null;
            this._setRequestsLayout(fLibrary.LayoutType.OneColumn);
            this.getView().getModel("requestEdit").setProperty("/editable", true);
            this.getView().getModel("processFlow").setData({
                visible: false,
                loading: false,
                steps: []
            });
        },

        _showRequestTaskDetail(sTaskId) {
            this._sSelectedTaskId = sTaskId;
            this.byId("requestsFlexibleColumnLayout").toEndColumnPage(this.byId("requestTaskObjectPage").getId());
            this.byId("requestTaskObjectPage").bindElement({
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
                            this.byId("requestTaskObjectPage").getBindingContext()?.getProperty("status_code") || ""
                        );
                        this.getView().getModel("processorEdit").setProperty(
                            "/taskProcessorUser_ID",
                            this.byId("requestTaskObjectPage").getBindingContext()?.getProperty("processorUser_ID") || ""
                        );
                        this.getView().getModel("processorEdit").setProperty(
                            "/taskProcessorName",
                            this.byId("requestTaskObjectPage").getBindingContext()?.getProperty("processor") || ""
                        );
                    }
                }
            });
            this._setRequestsLayout(fLibrary.LayoutType.ThreeColumnsEndExpanded);
        },

        _showInvolvedPartyDetail(sPartyId) {
            this._sSelectedPartyId = sPartyId;
            this.byId("requestsFlexibleColumnLayout").toEndColumnPage(this.byId("requestPartyObjectPage").getId());
            this.byId("requestPartyObjectPage").bindElement({
                path: `/ProcessInvolvedParties(guid'${sPartyId}')`,
                parameters: {
                    expand: "request,user"
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

        async onCompleteGuidedStep(oEvent) {
            const oStep = oEvent.getSource().getBindingContext("processFlow")?.getObject()
                || this.getView().getModel("processFlow").getProperty("/selectedStep");
            const sTaskId = oStep?.taskId;

            if (!sTaskId) {
                MessageToast.show(this.getText("selectTaskMessage"));
                return;
            }

            this.showBusy();

            try {
                await this.callAction("approveTask", {
                    taskId: sTaskId,
                    remarks: this.getText("completeStepButton")
                });
                MessageToast.show(this.getText("guidedStepCompletedMessage"));
                this._refreshSelectedRequest();

                if (this._sSelectedTaskId === sTaskId) {
                    this.byId("requestTaskObjectPage").getElementBinding()?.refresh();
                }
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("guidedStepCompleteErrorMessage"));
            } finally {
                this.hideBusy();
            }
        },

        _createEmptyTask() {
            return {
                taskName: "",
                stepNo: "",
                processorUser_ID: "",
                processorName: "",
                processor: "",
                role: ""
            };
        },

        _createEmptyParty() {
            return {
                user_ID: "",
                displayName: "",
                email: "",
                department: "",
                purpose: ""
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

            if (this._sSelectedRequestId) {
                this._loadProcessFlow(this._sSelectedRequestId);
            }
        },

        async _loadProcessFlow(sRequestId, oBoundRequest) {
            const oProcessFlowModel = this.getView().getModel("processFlow");

            if (!sRequestId) {
                oProcessFlowModel.setData({ visible: false, loading: false, steps: [] });
                return;
            }

            oProcessFlowModel.setProperty("/loading", true);

            try {
                const oRequest = oBoundRequest && Object.prototype.hasOwnProperty.call(oBoundRequest, "tasks")
                    ? oBoundRequest
                    : await this._readEntry(`/ProcessRequests(guid'${sRequestId}')`, {
                    urlParameters: {
                        "$expand": "tasks"
                    }
                });
                const aSteps = await this._readList("/ProcessStepConfig", {
                    filters: [new Filter("processType_code", FilterOperator.EQ, oRequest.processType_code)]
                });

                aSteps.sort((oLeft, oRight) => Number(oLeft.stepNo || 0) - Number(oRight.stepNo || 0));
                const aProcessSteps = this._buildProcessFlowSteps(aSteps, oRequest);
                const oSelectedStep = aProcessSteps.find((oStep) => oStep.isCurrent)
                    || aProcessSteps.find((oStep) => oStep.completeEnabled)
                    || aProcessSteps.find((oStep) => oStep.state !== "Success")
                    || aProcessSteps[0]
                    || {};

                this._markSelectedProcessStep(aProcessSteps, oSelectedStep.stepNo);

                oProcessFlowModel.setData({
                    visible: Boolean(aSteps.length),
                    loading: false,
                    steps: aProcessSteps,
                    selectedStep: oSelectedStep
                });
            } catch (oError) {
                oProcessFlowModel.setData({ visible: false, loading: false, steps: [] });
            }
        },

        onGuideMilestonePress(oEvent) {
            const oStep = oEvent.getSource().getBindingContext("processFlow")?.getObject();

            if (!oStep) {
                return;
            }

            const oProcessFlowModel = this.getView().getModel("processFlow");
            const aSteps = oProcessFlowModel.getProperty("/steps") || [];

            this._markSelectedProcessStep(aSteps, oStep.stepNo);
            oProcessFlowModel.setProperty("/steps", aSteps);
            oProcessFlowModel.setProperty("/selectedStep", {
                ...oStep,
                selected: true
            });
        },

        _buildProcessFlowSteps(aSteps, oRequest) {
            const aTasks = oRequest.tasks?.results || oRequest.tasks || [];
            const iCurrentStep = Number(oRequest.currentStep || 0);
            const bRequestEditable = this._isRequestEditable(oRequest);
            const mTasksByStep = aTasks.reduce((mResult, oTask) => {
                const sStepNo = String(Number(oTask.stepNo || 0));
                const aStepTasks = mResult.get(sStepNo) || [];

                aStepTasks.push(oTask);
                mResult.set(sStepNo, aStepTasks);
                return mResult;
            }, new Map());

            return aSteps.map((oStep) => {
                const aStepTasks = mTasksByStep.get(String(Number(oStep.stepNo || 0))) || [];
                const bMandatory = this._isTruthy(oStep.isMandatory);
                const oOpenTask = aStepTasks.find((oTask) => oTask.status_code === "OPEN");
                const bCompleted = Boolean(aStepTasks.length) && aStepTasks.every((oTask) => oTask.status_code === "APPROVED");
                const bRejected = aStepTasks.some((oTask) => oTask.status_code === "REJECTED");
                const bSentBack = aStepTasks.some((oTask) => oTask.status_code === "SENT_BACK");
                const bCurrent = Number(oStep.stepNo || 0) === iCurrentStep && !bCompleted;
                let sState = "None";
                let sStatusText = this.getText("processStepPendingLabel");
                let sIcon = "sap-icon://circle-task";
                let sButtonType = "Transparent";

                if (bRejected) {
                    sState = "Error";
                    sStatusText = this.getText("processStepRejectedLabel");
                    sIcon = "sap-icon://decline";
                    sButtonType = "Reject";
                } else if (bSentBack) {
                    sState = "Warning";
                    sStatusText = this.getText("processStepSentBackLabel");
                    sIcon = "sap-icon://undo";
                    sButtonType = "Default";
                } else if (bCompleted) {
                    sState = "Success";
                    sStatusText = this.getText("processStepCompletedLabel");
                    sIcon = "sap-icon://accept";
                    sButtonType = "Accept";
                } else if (bCurrent) {
                    sState = "Information";
                    sStatusText = this.getText("processStepCurrentLabel");
                    sIcon = "sap-icon://process";
                    sButtonType = "Emphasized";
                }

                return {
                    stepNo: oStep.stepNo,
                    stepName: oStep.stepName,
                    activityDescription: oStep.activityDescription,
                    role: oStep.role,
                    isMandatory: bMandatory,
                    mandatoryText: bMandatory ? this.getText("mandatoryLabel") : this.getText("optionalLabel"),
                    sequenceText: this.getText("processStepNumberLabel", [oStep.stepNo]),
                    statusText: sStatusText,
                    state: sState,
                    icon: sIcon,
                    buttonType: sButtonType,
                    isCurrent: bCurrent,
                    selected: false,
                    taskId: oOpenTask?.ID || "",
                    completeEnabled: bRequestEditable && !bMandatory && Boolean(oOpenTask)
                };
            });
        },

        _isRequestEditable(oRequest) {
            return !["COMPLETED", "REJECTED"].includes(oRequest?.status_code);
        },

        _isTruthy(vValue) {
            if (typeof vValue === "string") {
                return vValue.toLowerCase() === "true" || vValue === "1";
            }

            return Boolean(vValue);
        },

        _markSelectedProcessStep(aSteps, iSelectedStepNo) {
            aSteps.forEach((oStep) => {
                oStep.selected = Number(oStep.stepNo || 0) === Number(iSelectedStepNo || 0);
            });
        },

        _readEntry(sPath, oParameters) {
            return new Promise((resolve, reject) => {
                this.getModel().read(sPath, {
                    ...(oParameters || {}),
                    success: resolve,
                    error: reject
                });
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
