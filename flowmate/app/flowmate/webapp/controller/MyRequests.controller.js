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
            this.getView().setModel(new JSONModel(this._createEmptyEmailDraft()), "emailDraft");
            this.getView().setModel(new JSONModel({
                requestStatus: "",
                taskStatus: ""
            }), "statusEdit");
            this.getView().setModel(new JSONModel({
                sendBackStepNo: "",
                steps: []
            }), "taskAction");
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
            this.getView().setModel(new JSONModel({
                showUnreservedOnly: false
            }), "viewState");
            this.getView().setModel(new JSONModel({
                processType_code: "",
                subProcessType_code: "",
                search: ""
            }), "requestQueueFilter");
            this.getView().setModel(new JSONModel({
                selectedKey: "",
                items: []
            }), "requestQueueQueries");
            this.getView().setModel(new JSONModel({
                name: ""
            }), "newRequestQuery");
            this.getRouter().getRoute("RouteMyRequests").attachPatternMatched(this.onRouteMatched, this);
        },

        onRouteMatched(oEvent) {
            const oQuery = oEvent.getParameter("arguments")["?query"];
            const sRequestId = oQuery && oQuery.requestId;

            this._bShowUnreservedOnly = oQuery?.unreserved === "true";
            this._bShowReservedOnly = oQuery?.reserved === "true";
            this.getView().getModel("viewState").setProperty("/showUnreservedOnly", this._bShowUnreservedOnly);
            if (this._bShowUnreservedOnly) {
                this._loadRequestFilterQueries();
            }
            if (!this._bShowUnreservedOnly) {
                this._clearUnreservedQueueFilterState();
            }
            this.setOneColumnLayout();
            this._rebindRequestsTable();

            if (sRequestId) {
                this._showRequestDetailById(sRequestId);
                return;
            }

            this._setRequestsLayout(fLibrary.LayoutType.OneColumn);
        },

        onCreateRequest() {
            this.navTo("RouteRequestCreate", this._getRequestListRouteParameters());
        },

        onCreateSuccessorRequest() {
            if (!this._sSelectedRequestId) {
                MessageToast.show(this.getText("selectRequestMessage"));
                return;
            }

            this.navTo("RouteRequestCreate", this._getRequestListRouteParameters({
                predecessorId: this._sSelectedRequestId
            }));
        },

        onBeforeRebindRequestsTable(oEvent) {
            const oBindingParams = oEvent.getParameter("bindingParams");
            const oEvents = oBindingParams.events || {};
            const fnDataRequested = oEvents.dataRequested;
            const fnDataReceived = oEvents.dataReceived;
            const sExpand = oBindingParams.parameters.expand || "";

            oBindingParams.events = oEvents;
            oBindingParams.filters = oBindingParams.filters || [];
            oBindingParams.parameters.expand = sExpand
                ? `${sExpand},processType,subProcessType`
                : "processType,subProcessType";
            if (this._bShowUnreservedOnly) {
                oBindingParams.filters.push(new Filter("reservedBy", FilterOperator.EQ, null));
                this._addUnreservedQueueFilters(oBindingParams.filters);
            }
            if (this._bShowReservedOnly) {
                oBindingParams.filters.push(new Filter("reservedBy", FilterOperator.NE, null));
            }
            this._addRequestSearchFilter(oBindingParams.filters);
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

        onUnreservedQueueFilterSearch() {
            if (this._bShowUnreservedOnly) {
                this._syncUnreservedQueueFilterModelFromControls();
                this._filterUnreservedSubProcessTypes();
                this._rebindRequestsTable();
            }
        },

        onUnreservedProcessTypeChange() {
            this.getView().getModel("requestQueueFilter").setProperty("/subProcessType_code", "");
            this.byId("unreservedSubProcessTypeFilter")?.setSelectedKey("");
            this._filterUnreservedSubProcessTypes();
            this.onUnreservedQueueFilterSearch();
        },

        onClearUnreservedQueueFilters() {
            this._clearUnreservedQueueFilterState();
            this._filterUnreservedSubProcessTypes();
            this.onUnreservedQueueFilterSearch();
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
                || oContext?.getProperty("predecessor/ID")
                || oContext?.getProperty("ID")
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

        async onReserveRequest(oEvent) {
            oEvent.cancelBubble?.();

            const oContext = oEvent.getSource().getBindingContext() || this.byId("requestObjectPage").getBindingContext();
            const sRequestId = oContext?.getProperty("ID") || this._sSelectedRequestId;

            if (!sRequestId) {
                MessageToast.show(this.getText("selectRequestMessage"));
                return;
            }

            this.showBusy();

            try {
                await this.callAction("reserveRequest", {
                    requestId: sRequestId
                });
                MessageToast.show(this.getText("requestReservedMessage"));
                this._refreshRequestHeader();
                this.byId("requestsTable").getBinding("items")?.refresh();
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("requestReserveErrorMessage"));
            } finally {
                this.hideBusy();
            }
        },

        onSearch(oEvent) {
            const sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";

            this.getView().getModel("requestQueueFilter").setProperty("/search", sQuery);
            this._rebindRequestsTable();
        },

        onSavedRequestQueryChange(oEvent) {
            const sQueryId = oEvent.getSource().getSelectedKey();
            const aQueries = this.getView().getModel("requestQueueQueries").getProperty("/items") || [];
            const oQuery = aQueries.find((oItem) => oItem.ID === sQueryId);

            if (!oQuery) {
                return;
            }

            this._applyRequestFilterQuery(oQuery);
        },

        onOpenSaveQueryDialog() {
            const sSelectedQueryId = this.getView().getModel("requestQueueQueries").getProperty("/selectedKey");
            const aQueries = this.getView().getModel("requestQueueQueries").getProperty("/items") || [];
            const oSelectedQuery = aQueries.find((oItem) => oItem.ID === sSelectedQueryId);

            this._syncUnreservedQueueFilterModelFromControls();
            this.getView().getModel("newRequestQuery").setProperty("/name", oSelectedQuery?.name || "");
            this.byId("saveRequestQueryDialog").open();
        },

        onCloseSaveQueryDialog() {
            this.byId("saveRequestQueryDialog").close();
        },

        async onSaveRequestQuery() {
            const oNameModel = this.getView().getModel("newRequestQuery");
            const sName = (oNameModel.getProperty("/name") || "").trim();

            if (!sName) {
                MessageBox.error(this.getText("queryNameRequiredMessage"));
                return;
            }

            this._syncUnreservedQueueFilterModelFromControls();

            const oFilterData = this.getView().getModel("requestQueueFilter").getData();
            const oPayload = {
                name: sName,
                processType_code: oFilterData.processType_code || null,
                subProcessType_code: oFilterData.subProcessType_code || null,
                search: oFilterData.search || null
            };
            const oQueryModel = this.getView().getModel("requestQueueQueries");
            const sSelectedQueryId = oQueryModel.getProperty("/selectedKey");

            this.showBusy();

            try {
                if (sSelectedQueryId) {
                    await this.updateEntry(this._requestFilterQueryPath(sSelectedQueryId), oPayload);
                } else {
                    const oCreated = await this.createEntry("/RequestFilterQueries", oPayload);
                    oQueryModel.setProperty("/selectedKey", oCreated.ID || "");
                }

                await this._loadRequestFilterQueries(oQueryModel.getProperty("/selectedKey"));
                this.byId("saveRequestQueryDialog").close();
                MessageToast.show(this.getText("querySavedMessage"));
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("querySaveErrorMessage"));
            } finally {
                this.hideBusy();
            }
        },

        async onDeleteSavedRequestQuery() {
            const oQueryModel = this.getView().getModel("requestQueueQueries");
            const sQueryId = oQueryModel.getProperty("/selectedKey");

            if (!sQueryId) {
                return;
            }

            const bConfirmed = await new Promise((resolve) => {
                MessageBox.confirm(this.getText("deleteSavedQueryConfirmMessage"), {
                    onClose: (sAction) => resolve(sAction === MessageBox.Action.OK)
                });
            });

            if (!bConfirmed) {
                return;
            }

            this.showBusy();

            try {
                await this.removeEntry(this._requestFilterQueryPath(sQueryId));
                oQueryModel.setProperty("/selectedKey", "");
                await this._loadRequestFilterQueries();
                MessageToast.show(this.getText("queryDeletedMessage"));
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("queryDeleteErrorMessage"));
            } finally {
                this.hideBusy();
            }
        },

        onCloseRequestDetail() {
            this._resetRequestSelection();
            this.navTo("RouteMyRequests", this._getRequestListRouteParameters(), true);
        },

        onCloseRequestTaskDetail() {
            this._sSelectedTaskId = null;
            this._setRequestsLayout(fLibrary.LayoutType.TwoColumnsMidExpanded);
        },

        onCloseInvolvedPartyDetail() {
            this._sSelectedPartyId = null;
            this._setRequestsLayout(fLibrary.LayoutType.TwoColumnsMidExpanded);
        },

        onRefreshRequestDetail() {
            this._refreshAllRequestSections();
            this.byId("requestsTable").getBinding("items")?.refresh();
        },

        onRefreshRequestTaskDetail() {
            this.byId("requestTaskObjectPage").getElementBinding()?.refresh();
            this._refreshAfterTaskChange();
        },

        onRefreshInvolvedPartyDetail() {
            this.byId("requestPartyObjectPage").getElementBinding()?.refresh();
            this._refreshPartySection();
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
                this._refreshRequestHeader();
                this._refreshHistorySection();
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
                this._refreshAfterTaskChange();
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
            const sEmail = oContext.getProperty("email") || oContext.getProperty("userPrincipalName");

            if (this._sProcessorValueHelpTarget === "newTask") {
                const oTaskModel = this.getView().getModel("newTask");
                oTaskModel.setProperty("/processorUser_ID", sId);
                oTaskModel.setProperty("/processorName", sName);
                oTaskModel.setProperty("/processor", sName);
                oTaskModel.setProperty("/processorEmail", sEmail);
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
                this._refreshRequestHeader();
                this._refreshTaskSection();
                this._refreshHistorySection();
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
                this._refreshTaskSection();
                this._refreshHistorySection();
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

        async onOpenRequestEmailDialog() {
            if (!this._sSelectedRequestId) {
                MessageToast.show(this.getText("selectRequestMessage"));
                return;
            }

            const oContext = this.byId("requestObjectPage").getBindingContext();
            const oRequest = oContext?.getObject() || {};
            const sReferenceNumber = oRequest.referenceNumber || "";
            const sTitle = oRequest.title || "";

            this.showBusy();

            try {
                const aAttachments = await this._readList("/ProcessAttachments", {
                    filters: [new Filter("request_ID", FilterOperator.EQ, this._sSelectedRequestId)]
                });

                this.getView().getModel("emailDraft").setData({
                    requestId: this._sSelectedRequestId,
                    toRecipients: "",
                    toTokens: [],
                    ccRecipients: "",
                    subject: this.getText("requestEmailDefaultSubject", [sReferenceNumber, sTitle]),
                    body: this.getText("requestEmailDefaultBody", [sReferenceNumber, sTitle, window.location.href]),
                    attachments: aAttachments.map((oAttachment) => ({
                        ID: oAttachment.ID,
                        referenceNumber: oAttachment.referenceNumber,
                        filename: oAttachment.filename,
                        mimeType: oAttachment.mimeType,
                        status: oAttachment.status,
                        include: true
                    }))
                });
                this.byId("requestEmailDialog").open();
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("requestEmailAttachmentLoadErrorMessage"));
            } finally {
                this.hideBusy();
            }
        },

        onCloseRequestEmailDialog() {
            this.byId("requestEmailDialog").close();
        },

        onEmailToUserValueHelpRequest() {
            this.byId("requestEmailToUserDialog").open();
        },

        onEmailToUserValueHelpSearch(oEvent) {
            this._filterUsers(oEvent.getSource(), oEvent.getParameter("value") || "");
        },

        onEmailToUserValueHelpConfirm(oEvent) {
            const aContexts = oEvent.getParameter("selectedContexts")
                || (oEvent.getParameter("selectedItems") || [])
                    .map((oItem) => oItem.getBindingContext())
                    .filter(Boolean);

            if (aContexts.length) {
                this._addEmailToRecipients(aContexts.map((oContext) => ({
                    email: oContext.getProperty("email"),
                    displayName: oContext.getProperty("displayName")
                })));
            }

            this.onEmailToUserValueHelpClose(oEvent);
        },

        onEmailToUserValueHelpClose(oEvent) {
            oEvent.getSource().getBinding("items")?.filter([]);
        },

        onEmailToTokenUpdate(oEvent) {
            const aRemovedKeys = (oEvent.getParameter("removedTokens") || []).map((oToken) => oToken.getKey());

            if (!aRemovedKeys.length) {
                return;
            }

            const oModel = this.getView().getModel("emailDraft");
            const aTokens = (oModel.getProperty("/toTokens") || [])
                .filter((oToken) => !aRemovedKeys.includes(oToken.email));

            this._setEmailToTokens(aTokens);
        },

        async onSendRequestEmail() {
            const oEmail = this.getView().getModel("emailDraft").getData();

            if (!oEmail.toRecipients || !oEmail.body) {
                MessageBox.warning(this.getText("requestEmailRequiredMessage"));
                return;
            }

            const aAttachmentIds = (oEmail.attachments || [])
                .filter((oAttachment) => oAttachment.include)
                .map((oAttachment) => oAttachment.ID);

            this.showBusy();

            try {
                const oResult = await this.callAction("sendRequestEmail", {
                    requestId: this._sSelectedRequestId,
                    toRecipients: oEmail.toRecipients,
                    ccRecipients: oEmail.ccRecipients,
                    subject: oEmail.subject,
                    body: oEmail.body,
                    attachmentIds: JSON.stringify(aAttachmentIds)
                });
                const oValue = oResult.value || oResult;

                this.byId("requestEmailDialog").close();
                MessageToast.show(this.getText("requestEmailQueuedMessage", [oValue.attachmentCount || 0]));
                this._refreshEmailSection();
                this._refreshHistorySection();
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("requestEmailQueueErrorMessage"));
            } finally {
                this.hideBusy();
            }
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
                const iStepNo = Number(oTask.stepNo);

                await this.createEntry("/ProcessTasks", {
                    request_ID: this._sSelectedRequestId,
                    stepNo: iStepNo,
                    taskName: oTask.taskName,
                    processorUser_ID: oTask.processorUser_ID || undefined,
                    processor: oTask.processor,
                    processorEmail: oTask.processorEmail,
                    role: oTask.role,
                    isMandatory: Boolean(oTask.isMandatory),
                    status_code: "OPEN"
                });
                this.byId("addTaskDialog").close();
                MessageToast.show(this.getText("taskCreatedMessage"));
                this._refreshAfterTaskChange(iStepNo);
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
                this._refreshPartySection();
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

                this._refreshPartySection();
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
                this._refreshPartySection();
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
                this._refreshAttachmentSection();
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

                this._refreshAfterTaskChange();
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
                this._refreshAfterTaskChange();
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
                this._refreshAttachmentSection();
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
                this._refreshAttachmentSection();
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

        _addUnreservedQueueFilters(aFilters) {
            const oFilterData = this._getUnreservedQueueFilterData();

            if (oFilterData.processType_code) {
                aFilters.push(new Filter("processType_code", FilterOperator.EQ, oFilterData.processType_code));
            }

            if (oFilterData.subProcessType_code) {
                aFilters.push(new Filter("subProcessType_code", FilterOperator.EQ, oFilterData.subProcessType_code));
            }
        },

        _getUnreservedQueueFilterData() {
            return {
                processType_code: this.byId("unreservedProcessTypeFilter")?.getSelectedKey()
                    || this.getView().getModel("requestQueueFilter").getProperty("/processType_code")
                    || "",
                subProcessType_code: this.byId("unreservedSubProcessTypeFilter")?.getSelectedKey()
                    || this.getView().getModel("requestQueueFilter").getProperty("/subProcessType_code")
                    || ""
            };
        },

        _syncUnreservedQueueFilterModelFromControls() {
            const oFilterData = this._getUnreservedQueueFilterData();
            const oFilterModel = this.getView().getModel("requestQueueFilter");

            oFilterModel.setProperty("/processType_code", oFilterData.processType_code);
            oFilterModel.setProperty("/subProcessType_code", oFilterData.subProcessType_code);
        },

        async _loadRequestFilterQueries(sSelectedQueryId) {
            try {
                const oData = await new Promise((resolve, reject) => {
                    this.getModel().read("/RequestFilterQueries", {
                        success: resolve,
                        error: reject
                    });
                });
                const aQueries = (oData.results || []).sort((oFirst, oSecond) =>
                    (oFirst.name || "").localeCompare(oSecond.name || "")
                );
                const sSelectedKey = sSelectedQueryId && aQueries.some((oQuery) => oQuery.ID === sSelectedQueryId)
                    ? sSelectedQueryId
                    : "";

                this.getView().getModel("requestQueueQueries").setData({
                    selectedKey: sSelectedKey,
                    items: aQueries
                });
            } catch (oError) {
                MessageToast.show(this.getText("queryLoadErrorMessage"));
            }
        },

        _applyRequestFilterQuery(oQuery) {
            const oFilterModel = this.getView().getModel("requestQueueFilter");
            const sProcessTypeCode = oQuery.processType_code || "";
            const sSubProcessTypeCode = oQuery.subProcessType_code || "";

            oFilterModel.setData({
                processType_code: sProcessTypeCode,
                subProcessType_code: sSubProcessTypeCode,
                search: oQuery.search || ""
            });
            this.byId("unreservedProcessTypeFilter")?.setSelectedKey(sProcessTypeCode);
            this.byId("unreservedSubProcessTypeFilter")?.setSelectedKey(sSubProcessTypeCode);
            this._filterUnreservedSubProcessTypes();
            this._rebindRequestsTable();
        },

        _requestFilterQueryPath(sQueryId) {
            return `/RequestFilterQueries(guid'${sQueryId}')`;
        },

        _addRequestSearchFilter(aFilters) {
            const sQuery = this.getView().getModel("requestQueueFilter").getProperty("/search");

            if (!sQuery) {
                return;
            }

            aFilters.push(new Filter({
                filters: [
                    new Filter("referenceNumber", FilterOperator.Contains, sQuery),
                    new Filter("title", FilterOperator.Contains, sQuery),
                    new Filter("processor", FilterOperator.Contains, sQuery),
                    new Filter("processType_code", FilterOperator.Contains, sQuery),
                    new Filter("processType/name", FilterOperator.Contains, sQuery),
                    new Filter("subProcessType_code", FilterOperator.Contains, sQuery),
                    new Filter("subProcessType/name", FilterOperator.Contains, sQuery),
                    new Filter("status_code", FilterOperator.Contains, sQuery),
                    new Filter("department", FilterOperator.Contains, sQuery),
                    new Filter("priority", FilterOperator.Contains, sQuery)
                ],
                and: false
            }));
        },

        _clearUnreservedQueueFilterState() {
            this.getView().getModel("requestQueueFilter").setData({
                processType_code: "",
                subProcessType_code: "",
                search: ""
            });
            this.getView().getModel("requestQueueQueries")?.setProperty("/selectedKey", "");
            this.byId("unreservedProcessTypeFilter")?.setSelectedKey("");
            this.byId("unreservedSubProcessTypeFilter")?.setSelectedKey("");
        },

        _filterUnreservedSubProcessTypes() {
            const sProcessTypeCode = this.getView().getModel("requestQueueFilter").getProperty("/processType_code");
            const oSubProcessTypeFilter = this.byId("unreservedSubProcessTypeFilter");
            const oBinding = oSubProcessTypeFilter?.getBinding("items");

            if (!oBinding) {
                return;
            }

            oBinding.filter(sProcessTypeCode
                ? [new Filter("processType_code", FilterOperator.EQ, sProcessTypeCode)]
                : []);
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
                    expand: "processType,subProcessType,predecessor,successors"
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
                    }
                }
            });
            this._bindRequestSectionTables(sRequestId);
            this._setRequestsLayout(fLibrary.LayoutType.TwoColumnsMidExpanded);
            this._refreshProcessFlow();
        },

        _setRequestsLayout(sLayout) {
            this.byId("requestsFlexibleColumnLayout").setLayout(sLayout);
            this.getView().getModel("fclState").setData({
                midFullScreen: sLayout === fLibrary.LayoutType.MidColumnFullScreen,
                endFullScreen: sLayout === fLibrary.LayoutType.EndColumnFullScreen
            });
        },

        _bindRequestSectionTables(sRequestId) {
            this._bindRequestSectionTable("requestTasksTable", "/RequestDetailTasks", sRequestId);
            this._bindRequestSectionTable("requestPartiesTable", "/ProcessInvolvedParties", sRequestId);
            this._bindRequestSectionTable("requestAttachmentsTable", "/ProcessAttachments", sRequestId);
            this._bindRequestSectionTable("requestEmailsTable", "/ProcessEmailMessages", sRequestId, {
                parameters: {
                    expand: "attachments"
                }
            });
            this._bindRequestSectionTable("requestHistoryTable", "/ProcessHistory", sRequestId);
        },

        _bindRequestSectionTable(sTableId, sPath, sRequestId, oParameters = {}) {
            const oTable = this.byId(sTableId);
            const oBindingInfo = oTable?.getBindingInfo("items");

            if (!oTable || !oBindingInfo?.template) {
                return;
            }

            oTable.bindItems({
                path: sPath,
                template: oBindingInfo.template,
                templateShareable: true,
                filters: [new Filter("request_ID", FilterOperator.EQ, sRequestId)],
                ...(oParameters || {}),
                events: {
                    dataRequested: () => {
                        oTable.setBusyIndicatorDelay(0);
                        oTable.setBusy(true);
                    },
                    dataReceived: () => {
                        oTable.setBusy(false);
                    }
                }
            });
        },

        _getRequestListRouteParameters(oExtraQuery = {}) {
            const oQuery = { ...oExtraQuery };

            if (this._bShowUnreservedOnly) {
                oQuery.unreserved = "true";
            }

            if (this._bShowReservedOnly) {
                oQuery.reserved = "true";
            }

            return Object.keys(oQuery).length
                ? { "?query": oQuery }
                : {};
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
                path: `/RequestDetailTasks(guid'${sTaskId}')`,
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
                        this._loadTaskStepOptions("requestTaskObjectPage");
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

            const sRemarks = this.byId("requestTaskRemarksTextArea").getValue();
            let iSendBackStepNo;

            if (sAction === "sendBack") {
                iSendBackStepNo = await this._chooseSendBackStep();

                if (!iSendBackStepNo) {
                    return;
                }
            }

            this.showBusy();

            try {
                let bCompleted = true;

                if (sAction === "approveTask") {
                    bCompleted = await this._approveTaskWithGuidedDecision(this._sSelectedTaskId, sRemarks);
                } else {
                    const oPayload = {
                        taskId: this._sSelectedTaskId,
                        remarks: sRemarks
                    };

                    if (sAction === "sendBack") {
                        oPayload.targetStepNo = iSendBackStepNo;
                    }

                    await this.callAction(sAction, oPayload);
                }

                if (!bCompleted) {
                    return;
                }

                MessageToast.show(this.getText(sSuccessTextKey));
                this.byId("requestTaskRemarksTextArea").setValue("");
                this._refreshAfterTaskChange();
                this.byId("requestTaskObjectPage").getElementBinding().refresh();
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("actionFailedMessage"));
            } finally {
                this.hideBusy();
            }
        },

        async _approveTaskWithGuidedDecision(sTaskId, sRemarks) {
            await this.callAction("approveTask", {
                taskId: sTaskId,
                remarks: sRemarks
            });

            return true;
        },

        async _completeGuidedStepWithDecision(iStepNo, sRemarks) {
            let sProgressionMode = "continue";
            const oAnalysisResponse = await this.callAction("analyzeGuidedStepCompletion", {
                requestId: this._sSelectedRequestId,
                stepNo: iStepNo
            });
            const oAnalysis = oAnalysisResponse.value || oAnalysisResponse;

            this.hideBusy();

            if (oAnalysis.requiresDecision) {
                sProgressionMode = await this._chooseGuidedProgression(oAnalysis);

                if (!sProgressionMode) {
                    return false;
                }
            }

            this.showBusy();
            await this.callAction("completeGuidedStep", {
                requestId: this._sSelectedRequestId,
                stepNo: iStepNo,
                remarks: sRemarks,
                progressionMode: sProgressionMode
            });

            return true;
        },

        async onCompleteGuidedStep(oEvent) {
            const oStep = oEvent.getSource().getBindingContext("processFlow")?.getObject()
                || this.getView().getModel("processFlow").getProperty("/selectedStep");
            const iStepNo = Number(oStep?.stepNo || 0);

            if (!this._sSelectedRequestId || !iStepNo) {
                MessageToast.show(this.getText("selectRequestMessage"));
                return;
            }

            this.showBusy();

            try {
                const bCompleted = await this._completeGuidedStepWithDecision(
                    iStepNo,
                    this.getText("completeStepButton")
                );

                if (!bCompleted) {
                    return;
                }

                MessageToast.show(this.getText("guidedStepCompletedMessage"));
                this._refreshAfterTaskChange();
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("guidedStepCompleteErrorMessage"));
            } finally {
                this.hideBusy();
            }
        },

        _chooseGuidedProgression(oAnalysis) {
            return new Promise((resolve) => {
                const sRetrigger = this.getText("retriggerNextStepButton");
                const sJump = this.getText("jumpToIncompleteStepButton");
                const sCancel = MessageBox.Action.CANCEL;

                MessageBox.warning(this.getText("guidedStepAlreadyCompletedMessage", [
                    oAnalysis.nextStepName || oAnalysis.nextStepNo,
                    oAnalysis.incompleteStepName || oAnalysis.incompleteStepNo
                ]), {
                    actions: [sJump, sRetrigger, sCancel],
                    emphasizedAction: sJump,
                    onClose: (sAction) => {
                        if (sAction === sJump) {
                            resolve("jumpIncomplete");
                            return;
                        }

                        if (sAction === sRetrigger) {
                            resolve("retriggerNext");
                            return;
                        }

                        resolve(null);
                    }
                });
            });
        },

        _createEmptyTask() {
            return {
                taskName: "",
                stepNo: "",
                processorUser_ID: "",
                processorName: "",
                processor: "",
                processorEmail: "",
                role: "",
                isMandatory: false
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

        _createEmptyEmailDraft() {
            return {
                requestId: "",
                toRecipients: "",
                toTokens: [],
                ccRecipients: "",
                subject: "",
                body: "",
                attachments: []
            };
        },

        _addEmailToRecipients(aUsers) {
            const oModel = this.getView().getModel("emailDraft");
            const aTokens = [...(oModel.getProperty("/toTokens") || [])];
            const mExisting = new Map(aTokens.map((oToken) => [String(oToken.email || "").toLowerCase(), oToken]));

            aUsers
                .filter((oUser) => oUser.email)
                .forEach((oUser) => {
                    const sEmail = String(oUser.email).trim();
                    const sKey = sEmail.toLowerCase();

                    if (!mExisting.has(sKey)) {
                        mExisting.set(sKey, {
                            email: sEmail,
                            text: oUser.displayName
                                ? `${oUser.displayName} <${sEmail}>`
                                : sEmail
                        });
                    }
                });

            this._setEmailToTokens([...mExisting.values()]);
        },

        _setEmailToTokens(aTokens) {
            const oModel = this.getView().getModel("emailDraft");

            oModel.setProperty("/toTokens", aTokens);
            oModel.setProperty("/toRecipients", aTokens.map((oToken) => oToken.email).join(", "));
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

        _refreshRequestDetailBinding() {
            const oBinding = this.byId("requestObjectPage").getElementBinding();

            if (oBinding) {
                oBinding.refresh(true);
            }
        },

        _refreshRequestHeader() {
            this._refreshRequestDetailBinding();
        },

        _refreshProcessFlow(iPreferredStepNo) {
            if (this._sSelectedRequestId) {
                this._loadProcessFlow(this._sSelectedRequestId, null, iPreferredStepNo);
            }
        },

        _refreshSectionTable(sTableId) {
            this.byId(sTableId)?.getBinding("items")?.refresh(true);
        },

        _refreshTaskSection() {
            this._refreshSectionTable("requestTasksTable");
        },

        _refreshPartySection() {
            this._refreshSectionTable("requestPartiesTable");
        },

        _refreshAttachmentSection() {
            this._refreshSectionTable("requestAttachmentsTable");
        },

        _refreshHistorySection() {
            this._refreshSectionTable("requestHistoryTable");
        },

        _refreshEmailSection() {
            this._refreshSectionTable("requestEmailsTable");
        },

        _refreshAllRequestSections() {
            this._refreshRequestHeader();
            this._refreshTaskSection();
            this._refreshPartySection();
            this._refreshAttachmentSection();
            this._refreshHistorySection();
        },

        _refreshAfterTaskChange(iPreferredStepNo) {
            this._refreshRequestHeader();
            this._refreshTaskSection();
            this._refreshHistorySection();
            this._refreshProcessFlow(iPreferredStepNo);
        },

        async _loadProcessFlow(sRequestId, oBoundRequest, iPreferredStepNo) {
            const oProcessFlowModel = this.getView().getModel("processFlow");

            if (!sRequestId) {
                oProcessFlowModel.setData({ visible: false, loading: false, steps: [] });
                return;
            }

            oProcessFlowModel.setProperty("/loading", true);

            try {
                const oRequest = oBoundRequest?.processType_code
                    ? { ...oBoundRequest }
                    : await this._readEntry(`/ProcessRequests(guid'${sRequestId}')`);
                const oTaskResponse = await this.callAction("getGuidedProcessTasks", {
                    requestId: sRequestId
                });

                oRequest.tasks = oTaskResponse.value || oTaskResponse || [];
                const aSteps = await this._readList("/ProcessStepConfig", {
                    filters: [new Filter("processType_code", FilterOperator.EQ, oRequest.processType_code)]
                });

                aSteps.sort((oLeft, oRight) => Number(oLeft.stepNo || 0) - Number(oRight.stepNo || 0));
                const aProcessSteps = this._buildProcessFlowSteps(aSteps, oRequest, iPreferredStepNo);
                const oPreferredStep = iPreferredStepNo == null
                    ? null
                    : aProcessSteps.find((oStep) => Number(oStep.stepNo || 0) === Number(iPreferredStepNo || 0));
                const oSelectedStep = oPreferredStep
                    || aProcessSteps.find((oStep) => oStep.isCurrent)
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

            this._selectGuidedProcessStep(oStep);
        },

        onShowPreviousGuidedStep() {
            this._selectAdjacentGuidedProcessStep(-1);
        },

        onShowNextGuidedStep() {
            this._selectAdjacentGuidedProcessStep(1);
        },

        _selectAdjacentGuidedProcessStep(iDirection) {
            const oProcessFlowModel = this.getView().getModel("processFlow");
            const aSteps = oProcessFlowModel.getProperty("/steps") || [];
            const oSelectedStep = oProcessFlowModel.getProperty("/selectedStep") || {};

            if (!aSteps.length) {
                return;
            }

            const iCurrentIndex = Math.max(0, aSteps.findIndex((oStep) =>
                Number(oStep.stepNo || 0) === Number(oSelectedStep.stepNo || 0)
            ));
            const iNextIndex = (iCurrentIndex + iDirection + aSteps.length) % aSteps.length;

            this._selectGuidedProcessStep(aSteps[iNextIndex]);
        },

        _selectGuidedProcessStep(oStep) {
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

        _buildProcessFlowSteps(aSteps, oRequest, iPreferredStepNo) {
            const aTasks = this._normalizeCollection(oRequest.tasks);
            const iCurrentStep = Number(iPreferredStepNo || oRequest.currentStep || 0);
            const bRequestEditable = this._isRequestEditable(oRequest);
            const bRequestCompleted = oRequest.status_code === "COMPLETED";
            const mTasksByStep = aTasks.reduce((mResult, oTask) => {
                const sStepNo = String(Number(oTask.stepNo || 0));
                const aStepTasks = mResult.get(sStepNo) || [];

                aStepTasks.push(oTask);
                mResult.set(sStepNo, aStepTasks);
                return mResult;
            }, new Map());

            const bAllProcessTasksApproved = Boolean(aTasks.length)
                && aTasks.every((oTask) => this._taskStatusCode(oTask) === "APPROVED");

            return aSteps.map((oStep, iIndex) => {
                const aStepTasks = mTasksByStep.get(String(Number(oStep.stepNo || 0))) || [];
                const aMandatoryTasks = aStepTasks.filter((oTask) => this._isTruthy(oTask.isMandatory));
                const bMandatory = aMandatoryTasks.some((oTask) => this._taskStatusCode(oTask) !== "APPROVED");
                const bMandatoryTasksApproved = Boolean(aMandatoryTasks.length)
                    && aMandatoryTasks.every((oTask) => this._taskStatusCode(oTask) === "APPROVED");
                const oOpenTask = aStepTasks.find((oTask) => this._isOpenLikeTask(oTask));
                const bAllTasksApproved = Boolean(aStepTasks.length)
                    && aStepTasks.every((oTask) => this._taskStatusCode(oTask) === "APPROVED");
                const bRejected = aStepTasks.some((oTask) => this._taskStatusCode(oTask) === "REJECTED");
                const bSentBack = aStepTasks.some((oTask) => this._taskStatusCode(oTask) === "SENT_BACK");
                const bCurrent = Number(oStep.stepNo || 0) === iCurrentStep;
                const oNextStep = aSteps[iIndex + 1];
                const bFinalStep = !oNextStep;
                const bCanCompleteStep = bFinalStep
                    ? bAllProcessTasksApproved
                    : (!bMandatory || bMandatoryTasksApproved);
                let sState = "None";
                let sStatusText = this.getText("processStepPendingLabel");
                let sIcon = "sap-icon://circle-task";
                let sButtonType = "Transparent";

                if (bRequestCompleted) {
                    sState = "Success";
                    sStatusText = this.getText("processStepCompletedLabel");
                    sIcon = "sap-icon://accept";
                    sButtonType = "Accept";
                } else if (bRejected) {
                    sState = "Error";
                    sStatusText = this.getText("processStepRejectedLabel");
                    sIcon = "sap-icon://decline";
                    sButtonType = "Reject";
                } else if (bSentBack) {
                    sState = "Warning";
                    sStatusText = this.getText("processStepSentBackLabel");
                    sIcon = "sap-icon://undo";
                    sButtonType = "Default";
                } else if (bCurrent) {
                    sState = "Information";
                    sStatusText = bAllTasksApproved
                        ? this.getText("processStepReadyLabel")
                        : this.getText("processStepPendingLabel");
                    sIcon = "sap-icon://process";
                    sButtonType = "Emphasized";
                } else if (bAllTasksApproved) {
                    sState = "Success";
                    sStatusText = this.getText("processStepCompletedLabel");
                    sIcon = "sap-icon://accept";
                    sButtonType = "Accept";
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
                    isCurrent: bCurrent && !bRequestCompleted,
                    selected: false,
                    taskId: oOpenTask?.ID || "",
                    completeEnabled: bRequestEditable && bCurrent && bCanCompleteStep
                };
            });
        },

        _isClosingProcessStep(oStep) {
            return /closed|complete|completed/i.test(oStep?.stepName || "");
        },

        _taskStatusCode(oTask) {
            const vStatus = oTask?.status_code;

            return String(vStatus?.code || vStatus || "").toUpperCase();
        },

        _isOpenLikeTask(oTask) {
            return ["OPEN", "SENT_BACK"].includes(this._taskStatusCode(oTask));
        },

        async _loadTaskStepOptions(sObjectPageId) {
            const oTaskActionModel = this.getView().getModel("taskAction");
            const oContext = this.byId(sObjectPageId)?.getBindingContext();
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

        _isRequestEditable(oRequest) {
            return Boolean(oRequest?.reservedBy) && !["COMPLETED", "REJECTED"].includes(oRequest?.status_code);
        },

        _normalizeCollection(vCollection) {
            if (Array.isArray(vCollection)) {
                return vCollection;
            }

            return vCollection?.results || [];
        },

        formatCollectionCount(vCollection) {
            return this._normalizeCollection(vCollection).length;
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
