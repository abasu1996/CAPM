sap.ui.define([
    "flowmate/controller/BaseController",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/json/JSONModel"
], (BaseController, MessageBox, MessageToast, Filter, FilterOperator, JSONModel) => {
    "use strict";

    const MAX_ATTACHMENT_SIZE_MB = 400;
    const MAX_ATTACHMENT_SIZE_BYTES = MAX_ATTACHMENT_SIZE_MB * 1024 * 1024;
    return BaseController.extend("flowmate.controller.RequestCreate", {
        onInit() {
            this.getRouter().getRoute("RouteRequestCreate").attachPatternMatched(this.onRouteMatched, this);
        },

        async onRouteMatched(oEvent) {
            const oQuery = oEvent.getParameter("arguments")["?query"] || {};

            this._bReturnToUnreservedOnly = oQuery.unreserved === "true";
            this._bReturnToReservedOnly = oQuery.reserved === "true";
            this._sPredecessorId = oQuery.predecessorId || "";
            this.setTwoColumnLayout();
            this._aAttachmentFiles = [];
            this.getView().setModel(new JSONModel({
                predecessor_ID: this._sPredecessorId,
                predecessorReferenceNumber: "",
                predecessorTitle: "",
                predecessorDisplay: "",
                processType_code: "",
                processTypeName: "",
                subProcessType_code: "",
                subProcessTypeName: "",
                hasSubProcessTypes: false,
                loaApprovalApplicable: false,
                isPaymentRequest: false,
                amount: null,
                role: "",
                isFtkFactoring: false,
                isFtkPoValidation: false,
                paymentCategory_code: "",
                businessEntity_code: "",
                vendor_ID: "",
                vendorCode: "",
                vendorName: "",
                remarks: "",
                title: "",
                description: "",
                requesterUser_ID: "",
                requesterName: "",
                requester: "",
                processorTeam_ID: "",
                processorTeamName: "",
                department: "",
                priorityConfig_code: "MEDIUM",
                creating: false,
                uploading: false,
                attachments: []
            }), "create");

            await this._populateCurrentRequester();

            if (this._sPredecessorId) {
                await this._prefillFromPredecessor(this._sPredecessorId);
                await this._populateCurrentRequester();
            }
        },

        async onCreate() {
            const oPayload = this.getView().getModel("create").getData();

            if (!oPayload.title || !oPayload.processType_code) {
                MessageBox.warning(this.getText("createRequiredMessage"));
                return;
            }

            if (oPayload.hasSubProcessTypes && !oPayload.subProcessType_code) {
                MessageBox.warning(this.getText("subProcessTypeRequiredMessage"));
                return;
            }

            if (oPayload.loaApprovalApplicable && (
                oPayload.amount === ""
                || oPayload.amount === null
                || oPayload.amount === undefined
                || !Number.isFinite(Number(oPayload.amount))
            )) {
                MessageBox.warning(this.getText("amountRequiredMessage"));
                return;
            }

            if (oPayload.isFtkPoValidation && (
                !String(oPayload.paymentCategory_code || "").trim()
                || !String(oPayload.businessEntity_code || "").trim()
                || !String(oPayload.vendor_ID || "").trim()
                || !String(oPayload.vendorCode || "").trim()
                || !String(oPayload.vendorName || "").trim()
                || !this._aAttachmentFiles.length
            )) {
                MessageBox.warning(this.getText("ftkPoValidationRequiredMessage"));
                return;
            }

            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/creating", true);

            try {
                const oCreated = await this.createEntry("/ProcessRequests", {
                    processType_code: oPayload.processType_code,
                    subProcessType_code: oPayload.subProcessType_code || undefined,
                    title: oPayload.title,
                    description: oPayload.description,
                    requesterUser_ID: oPayload.requesterUser_ID || undefined,
                    requester: oPayload.requester,
                    processorTeam_ID: oPayload.processorTeam_ID || undefined,
                    processorTeamName: oPayload.processorTeamName,
                    predecessor_ID: oPayload.predecessor_ID || undefined,
                    department: oPayload.department,
                    amount: oPayload.loaApprovalApplicable ? Number(oPayload.amount) : undefined,
                    role: oPayload.loaApprovalApplicable ? oPayload.role : undefined,
                    priorityConfig_code: oPayload.priorityConfig_code || "MEDIUM",
                    ...(oPayload.isFtkFactoring ? {
                        paymentCategory_code: oPayload.paymentCategory_code || undefined,
                        businessEntity_code: oPayload.businessEntity_code || undefined,
                        vendor_ID: oPayload.vendor_ID || undefined,
                        remarks: oPayload.remarks
                    } : {}),
                    status_code: "DRAFT"
                });

                if (this._aAttachmentFiles.length) {
                    this._startAttachmentUploadInBackground(oCreated.ID, [...this._aAttachmentFiles]);
                    MessageToast.show(this.getText("requestCreatedAttachmentUploadStartedMessage"));
                } else {
                    MessageToast.show(this.getText("requestCreatedMessage"));
                }

                this.navTo("RouteMyRequests", this._getRequestListRouteParameters({
                    requestId: oCreated.ID
                }));
            } catch (oError) {
                MessageBox.error(this.getErrorMessage(oError, this.getText("requestCreateFailedMessage")));
            } finally {
                oCreateModel.setProperty("/creating", false);
            }
        },

        onCancel() {
            this.navTo("RouteMyRequests", this._getRequestListRouteParameters(), true);
        },

        onAttachmentsSelected(oEvent) {
            const aFiles = Array.from(oEvent.getParameter("files") || []);

            if (!this._validateAttachmentFiles(aFiles)) {
                oEvent.getSource().clear();
                return;
            }

            this._aAttachmentFiles.push(...aFiles);
            this._syncAttachmentModel();
            oEvent.getSource().clear();
        },

        onAttachmentFileSizeExceed(oEvent) {
            MessageBox.warning(this.getText("attachmentSizeExceededMessage", [
                oEvent.getParameter("fileName"),
                MAX_ATTACHMENT_SIZE_MB
            ]));
            oEvent.getSource().clear();
        },

        onRemoveAttachment(oEvent) {
            const sPath = oEvent.getSource().getBindingContext("create").getPath();
            const iIndex = Number(sPath.split("/").pop());

            this._aAttachmentFiles.splice(iIndex, 1);
            this._syncAttachmentModel();
        },

        onProcessTypeValueHelpRequest() {
            this.byId("processTypeValueHelpDialog").open();
        },

        onProcessTypeSuggest(oEvent) {
            this._filterSuggestionItems(oEvent, ["code", "name", "descr"]);
        },

        async onProcessTypeSuggestionSelected(oEvent) {
            const oContext = this._getSuggestionContext(oEvent);

            if (!oContext) {
                return;
            }

            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/processType_code", oContext.getProperty("code"));
            oCreateModel.setProperty("/processTypeName", oContext.getProperty("name"));
            await this._onProcessSelectionChanged();
        },

        onProcessTypeLiveChange() {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/processType_code", "");
            oCreateModel.setProperty("/subProcessType_code", "");
            oCreateModel.setProperty("/subProcessTypeName", "");
            oCreateModel.setProperty("/hasSubProcessTypes", false);
            this._setFtkFactoringMode(false);
        },

        onProcessTypeValueHelpSearch(oEvent) {
            const sQuery = oEvent.getParameter("value") || "";
            const oBinding = oEvent.getSource().getBinding("items");

            if (!sQuery) {
                oBinding.filter([]);
                return;
            }

            oBinding.filter([
                new Filter({
                    filters: [
                        new Filter("code", FilterOperator.Contains, sQuery),
                        new Filter("name", FilterOperator.Contains, sQuery),
                        new Filter("descr", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                })
            ]);
        },

        async onProcessTypeValueHelpConfirm(oEvent) {
            const oSelectedItem = oEvent.getParameter("selectedItem");
            const oContext = oSelectedItem && oSelectedItem.getBindingContext();

            if (!oContext) {
                return;
            }

            this.getView().getModel("create").setProperty("/processType_code", oContext.getProperty("code"));
            this.getView().getModel("create").setProperty("/processTypeName", oContext.getProperty("name"));
            await this._onProcessSelectionChanged();
            this.onProcessTypeValueHelpClose(oEvent);
        },

        onProcessTypeValueHelpClose(oEvent) {
            const oBinding = oEvent.getSource().getBinding("items");

            if (oBinding) {
                oBinding.filter([]);
            }
        },

        onPredecessorRequestValueHelpRequest() {
            this.byId("predecessorRequestValueHelpDialog").open();
        },

        onPredecessorRequestSuggest(oEvent) {
            this._filterSuggestionItems(oEvent, [
                "referenceNumber",
                "title",
                "processType_code",
                "subProcessType_code",
                "requester",
                "processor"
            ]);
        },

        onPredecessorRequestSuggestionSelected(oEvent) {
            const oContext = this._getSuggestionContext(oEvent);

            if (!oContext) {
                return;
            }

            this._setPredecessor(oContext);
        },

        onPredecessorRequestLiveChange() {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/predecessor_ID", "");
            oCreateModel.setProperty("/predecessorReferenceNumber", "");
            oCreateModel.setProperty("/predecessorTitle", "");
        },

        onPredecessorRequestValueHelpSearch(oEvent) {
            const sQuery = oEvent.getParameter("value") || "";
            const oBinding = oEvent.getSource().getBinding("items");

            if (!sQuery) {
                oBinding.filter([]);
                return;
            }

            oBinding.filter([
                new Filter({
                    filters: [
                        new Filter("referenceNumber", FilterOperator.Contains, sQuery),
                        new Filter("title", FilterOperator.Contains, sQuery),
                        new Filter("processType_code", FilterOperator.Contains, sQuery),
                        new Filter("subProcessType_code", FilterOperator.Contains, sQuery),
                        new Filter("status_code", FilterOperator.Contains, sQuery),
                        new Filter("requester", FilterOperator.Contains, sQuery),
                        new Filter("processor", FilterOperator.Contains, sQuery),
                        new Filter("reservedBy", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                })
            ]);
        },

        onPredecessorRequestValueHelpConfirm(oEvent) {
            const oContext = oEvent.getParameter("selectedItem")?.getBindingContext();

            if (!oContext) {
                return;
            }

            this._setPredecessor(oContext);
            this.onPredecessorRequestValueHelpClose(oEvent);
        },

        onPredecessorRequestValueHelpClose(oEvent) {
            oEvent.getSource().getBinding("items")?.filter([]);
        },

        onClearPredecessorRequest() {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/predecessor_ID", "");
            oCreateModel.setProperty("/predecessorReferenceNumber", "");
            oCreateModel.setProperty("/predecessorTitle", "");
            oCreateModel.setProperty("/predecessorDisplay", "");
        },

        onSubProcessTypeValueHelpRequest() {
            const sProcessTypeCode = this.getView().getModel("create").getProperty("/processType_code");

            if (!sProcessTypeCode) {
                MessageToast.show(this.getText("selectProcessTypeFirstMessage"));
                return;
            }

            const oDialog = this.byId("subProcessTypeValueHelpDialog");
            this._filterSubProcessTypeDialog(oDialog, "");
            oDialog.open();
        },

        onSubProcessTypeSuggest(oEvent) {
            const sProcessTypeCode = this.getView().getModel("create").getProperty("/processType_code");
            const aFixedFilters = sProcessTypeCode
                ? [new Filter("processType_code", FilterOperator.EQ, sProcessTypeCode)]
                : [];

            this._filterSuggestionItems(oEvent, ["code", "name", "descr", "processOwner"], aFixedFilters);
        },

        onSubProcessTypeSuggestionSelected(oEvent) {
            const oContext = this._getSuggestionContext(oEvent);

            if (!oContext) {
                return;
            }

            this._setSubProcessType(oContext);
        },

        onSubProcessTypeLiveChange() {
            const oCreateModel = this.getView().getModel("create");

            oCreateModel.setProperty("/subProcessType_code", "");
            oCreateModel.setProperty("/loaApprovalApplicable", false);
            oCreateModel.setProperty("/isPaymentRequest", false);
            oCreateModel.setProperty("/amount", null);
            oCreateModel.setProperty("/role", "");
            this._setFtkFactoringMode(false);
        },

        onSubProcessTypeValueHelpSearch(oEvent) {
            this._filterSubProcessTypeDialog(oEvent.getSource(), oEvent.getParameter("value") || "");
        },

        async onSubProcessTypeValueHelpConfirm(oEvent) {
            const oContext = oEvent.getParameter("selectedItem")?.getBindingContext();

            if (!oContext) {
                return;
            }

            this._setSubProcessType(oContext);
            this.onSubProcessTypeValueHelpClose(oEvent);
        },

        onSubProcessTypeValueHelpClose(oEvent) {
            oEvent.getSource().getBinding("items")?.filter([]);
        },

        onCreateTeamValueHelpRequest() {
            this.byId("requestCreateTeamValueHelpDialog").open();
        },

        onCreateTeamSuggestionSelected(oEvent) {
            const oContext = this._getSuggestionContext(oEvent);

            if (!oContext) {
                return;
            }

            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/processorTeam_ID", oContext.getProperty("ID"));
            oCreateModel.setProperty("/processorTeamName", oContext.getProperty("name"));
        },

        onCreateTeamLiveChange() {
            this.getView().getModel("create").setProperty("/processorTeam_ID", "");
        },

        onCreateTeamValueHelpSearch(oEvent) {
            const sQuery = oEvent.getParameter("value") || "";
            const oBinding = oEvent.getSource().getBinding("items");

            if (!sQuery) {
                oBinding.filter([]);
                return;
            }

            oBinding.filter([
                new Filter({
                    filters: [
                        new Filter("teamCode", FilterOperator.Contains, sQuery),
                        new Filter("name", FilterOperator.Contains, sQuery),
                        new Filter("description", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                })
            ]);
        },

        onCreateTeamValueHelpConfirm(oEvent) {
            const oContext = oEvent.getParameter("selectedItem")?.getBindingContext();

            if (!oContext) {
                return;
            }

            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/processorTeam_ID", oContext.getProperty("ID"));
            oCreateModel.setProperty("/processorTeamName", oContext.getProperty("name"));
            this.onCreateTeamValueHelpClose(oEvent);
        },

        onCreateTeamValueHelpClose(oEvent) {
            oEvent.getSource().getBinding("items")?.filter([]);
        },

        onVendorValueHelpRequest() {
            this.byId("requestCreateVendorValueHelpDialog").open();
        },

        onVendorSuggest(oEvent) {
            this._filterSuggestionItems(oEvent, ["vendorCode", "vendorName", "vendorEmail"]);
        },

        onVendorSuggestionSelected(oEvent) {
            const oContext = this._getSuggestionContext(oEvent);

            if (oContext) {
                this._setVendor(oContext);
            }
        },

        onVendorLiveChange() {
            const oCreateModel = this.getView().getModel("create");

            oCreateModel.setProperty("/vendor_ID", "");
            oCreateModel.setProperty("/vendorName", "");
        },

        onVendorValueHelpSearch(oEvent) {
            const sQuery = (oEvent.getParameter("value") || "").trim();
            const oBinding = oEvent.getSource().getBinding("items");

            if (!sQuery) {
                oBinding.filter([]);
                return;
            }

            oBinding.filter([
                new Filter({
                    filters: ["vendorCode", "vendorName", "vendorEmail"].map((sProperty) => new Filter({
                        path: sProperty,
                        operator: FilterOperator.Contains,
                        value1: sQuery,
                        caseSensitive: false
                    })),
                    and: false
                })
            ]);
        },

        onVendorValueHelpConfirm(oEvent) {
            const oContext = oEvent.getParameter("selectedItem")?.getBindingContext();

            if (oContext) {
                this._setVendor(oContext);
            }

            this.onVendorValueHelpClose(oEvent);
        },

        onVendorValueHelpClose(oEvent) {
            oEvent.getSource().getBinding("items")?.filter([]);
        },

        _filterSubProcessTypeDialog(oDialog, sQuery) {
            const sProcessTypeCode = this.getView().getModel("create").getProperty("/processType_code");
            const oBinding = oDialog.getBinding("items");
            const aFilters = [
                new Filter("processType_code", FilterOperator.EQ, sProcessTypeCode)
            ];

            if (sQuery) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("code", FilterOperator.Contains, sQuery),
                        new Filter("name", FilterOperator.Contains, sQuery),
                        new Filter("descr", FilterOperator.Contains, sQuery),
                        new Filter("processOwner", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                }));
            }

            oBinding.filter(aFilters);
        },

        _setPredecessor(oContext) {
            const oCreateModel = this.getView().getModel("create");
            const sReferenceNumber = oContext.getProperty("referenceNumber") || "";
            const sTitle = oContext.getProperty("title") || "";

            oCreateModel.setProperty("/predecessor_ID", oContext.getProperty("ID"));
            oCreateModel.setProperty("/predecessorReferenceNumber", sReferenceNumber);
            oCreateModel.setProperty("/predecessorTitle", sTitle);
            oCreateModel.setProperty("/predecessorDisplay", [sReferenceNumber, sTitle].filter(Boolean).join(" - "));
        },

        _setSubProcessType(oContext) {
            const oCreateModel = this.getView().getModel("create");
            const sCode = oContext.getProperty("code");

            oCreateModel.setProperty("/subProcessType_code", sCode);
            oCreateModel.setProperty("/subProcessTypeName", oContext.getProperty("name"));
            const bLoaApplicable = Boolean(oContext.getProperty("loaApprovalApplicable"));
            oCreateModel.setProperty("/loaApprovalApplicable", bLoaApplicable);
            oCreateModel.setProperty("/isPaymentRequest", bLoaApplicable);

            if (!bLoaApplicable) {
                oCreateModel.setProperty("/amount", null);
                oCreateModel.setProperty("/role", "");
            }
            this._setFtkFactoringMode(this._isFtkFactoringSubtype(sCode));
            oCreateModel.setProperty("/isFtkPoValidation", sCode === "FTK_FACTORING_PO_VALIDATION");
        },

        _isFtkFactoringSubtype(sCode) {
            return [
                "FTK_FACTORING_PO_VALIDATION",
                "FTK_FACTORING_BASED_ON_UAC",
                "FTK_FACTORING_PENDING_UAC"
            ].includes(sCode);
        },

        _setFtkFactoringMode(bEnabled) {
            const oCreateModel = this.getView().getModel("create");

            oCreateModel.setProperty("/isFtkFactoring", bEnabled);

            if (!bEnabled) {
                oCreateModel.setProperty("/isFtkPoValidation", false);
                [
                    "paymentCategory_code",
                    "businessEntity_code",
                    "vendor_ID",
                    "vendorCode",
                    "vendorName",
                    "remarks"
                ].forEach((sProperty) => oCreateModel.setProperty(`/${sProperty}`, ""));
            }
        },

        async onAmountChange(oEvent) {
            const oCreateModel = this.getView().getModel("create");

            if (!oCreateModel.getProperty("/loaApprovalApplicable")) {
                oCreateModel.setProperty("/role", "");
                return;
            }

            const sValue = oEvent.getParameter("value");
            const fAmount = Number(sValue);

            if (sValue === "" || !Number.isFinite(fAmount)) {
                oCreateModel.setProperty("/role", "");
                return;
            }

            try {
                oCreateModel.setProperty("/role", await this._resolveLoaRole(fAmount));
            } catch (oError) {
                oCreateModel.setProperty("/role", "");
            }
        },

        async _resolveLoaRole(fAmount) {
            const aRules = await this._readList("/LoaApproval", { sorters: [] });
            let oWinner = null;

            aRules.forEach((oRule) => {
                const fThreshold = Number(oRule.amount);

                if (!Number.isFinite(fThreshold) || !this._evaluateOperator(fAmount, oRule.operator_code, fThreshold)) {
                    return;
                }

                if (!oWinner) {
                    oWinner = oRule;
                    return;
                }

                const bPrefersHigher = this._prefersHigherThreshold(oRule.operator_code);
                const fWinnerThreshold = Number(oWinner.amount);

                if ((bPrefersHigher && fThreshold > fWinnerThreshold) || (!bPrefersHigher && fThreshold < fWinnerThreshold)) {
                    oWinner = oRule;
                }
            });

            return oWinner?.roleCode || "";
        },

        _prefersHigherThreshold(sOperator) {
            return sOperator === ">" || sOperator === ">=";
        },

        _evaluateOperator(fAmount, sOperator, fThreshold) {
            return {
                "=": fAmount === fThreshold,
                "!=": fAmount !== fThreshold,
                "<": fAmount < fThreshold,
                "<=": fAmount <= fThreshold,
                ">": fAmount > fThreshold,
                ">=": fAmount >= fThreshold
            }[sOperator] || false;
        },

        _setVendor(oContext) {
            const oCreateModel = this.getView().getModel("create");

            oCreateModel.setProperty("/vendor_ID", oContext.getProperty("ID"));
            oCreateModel.setProperty("/vendorCode", oContext.getProperty("vendorCode"));
            oCreateModel.setProperty("/vendorName", oContext.getProperty("vendorName"));
        },

        async _onProcessSelectionChanged() {
            const oCreateModel = this.getView().getModel("create");

            oCreateModel.setProperty("/subProcessType_code", "");
            oCreateModel.setProperty("/subProcessTypeName", "");
            this._setFtkFactoringMode(false);
            oCreateModel.setProperty("/loaApprovalApplicable", false);
            oCreateModel.setProperty("/isPaymentRequest", false);
            oCreateModel.setProperty("/amount", null);
            oCreateModel.setProperty("/role", "");

            const aSubTypes = await this._readList("/ProcessSubTypes", {
                filters: [new Filter("processType_code", FilterOperator.EQ, oCreateModel.getProperty("/processType_code"))],
                sorters: []
            });

            oCreateModel.setProperty("/hasSubProcessTypes", aSubTypes.length > 0);
        },

        async _prefillFromPredecessor(sPredecessorId) {
            const oCreateModel = this.getView().getModel("create");

            oCreateModel.setProperty("/creating", true);

            try {
                const oPredecessor = await this._readEntry(`/ProcessRequests(guid'${sPredecessorId}')`, {
                    urlParameters: {
                        "$expand": "processType,subProcessType,paymentCategory,businessEntity,priorityConfig,requesterUser,processorUser"
                    }
                });

                oCreateModel.setProperty("/predecessor_ID", oPredecessor.ID);
                oCreateModel.setProperty("/predecessorReferenceNumber", oPredecessor.referenceNumber || "");
                oCreateModel.setProperty("/predecessorTitle", oPredecessor.title || "");
                oCreateModel.setProperty("/predecessorDisplay", [
                    oPredecessor.referenceNumber,
                    oPredecessor.title
                ].filter(Boolean).join(" - "));
                oCreateModel.setProperty("/processType_code", oPredecessor.processType_code || "");
                const bLoaApplicable = Boolean(oPredecessor.subProcessType?.loaApprovalApplicable);
                oCreateModel.setProperty("/loaApprovalApplicable", bLoaApplicable);
                oCreateModel.setProperty("/isPaymentRequest", bLoaApplicable);
                oCreateModel.setProperty("/amount", oPredecessor.amount ?? null);
                oCreateModel.setProperty("/role", oPredecessor.role || "");
                oCreateModel.setProperty("/processTypeName", oPredecessor.processType?.name || oPredecessor.processType_code || "");
                oCreateModel.setProperty("/subProcessType_code", oPredecessor.subProcessType_code || "");
                oCreateModel.setProperty("/subProcessTypeName", oPredecessor.subProcessType?.name || oPredecessor.subProcessType_code || "");
                this._setFtkFactoringMode(this._isFtkFactoringSubtype(oPredecessor.subProcessType_code));
                oCreateModel.setProperty(
                    "/isFtkPoValidation",
                    oPredecessor.subProcessType_code === "FTK_FACTORING_PO_VALIDATION"
                );
                oCreateModel.setProperty("/paymentCategory_code", oPredecessor.paymentCategory_code || "");
                oCreateModel.setProperty("/businessEntity_code", oPredecessor.businessEntity_code || "");
                oCreateModel.setProperty("/vendor_ID", oPredecessor.vendor_ID || "");
                oCreateModel.setProperty("/vendorCode", oPredecessor.vendorCode || "");
                oCreateModel.setProperty("/vendorName", oPredecessor.vendorName || "");
                oCreateModel.setProperty("/remarks", oPredecessor.remarks || "");
                oCreateModel.setProperty("/title", this.getText("successorRequestTitlePrefix", [
                    oPredecessor.referenceNumber || oPredecessor.title || ""
                ]));
                oCreateModel.setProperty("/description", oPredecessor.description || "");
                oCreateModel.setProperty("/department", oPredecessor.department || "");
                oCreateModel.setProperty(
                    "/priorityConfig_code",
                    oPredecessor.priorityConfig_code || String(oPredecessor.priority || "MEDIUM").toUpperCase()
                );

                if (oPredecessor.processType_code) {
                    const aSubTypes = await this._readList("/ProcessSubTypes", {
                        filters: [new Filter("processType_code", FilterOperator.EQ, oPredecessor.processType_code)],
                        sorters: []
                    });

                    oCreateModel.setProperty("/hasSubProcessTypes", aSubTypes.length > 0);
                }
            } catch (oError) {
                MessageBox.error(this.getErrorMessage(oError, this.getText("predecessorLoadFailedMessage")));
            } finally {
                oCreateModel.setProperty("/creating", false);
            }
        },

        async _populateCurrentRequester() {
            const oCreateModel = this.getView().getModel("create");

            if (!oCreateModel) {
                return;
            }

            try {
                const oResponse = await this.callAction("getCurrentUserDetails");
                const oUser = oResponse.value || oResponse;
                const sRequesterName = oUser.displayName || oUser.email || oUser.userPrincipalName || "";

                oCreateModel.setProperty("/requesterUser_ID", oUser.ID || "");
                oCreateModel.setProperty("/requesterName", sRequesterName);
                oCreateModel.setProperty("/requester", sRequesterName);

                if (oUser.department) {
                    oCreateModel.setProperty("/department", oUser.department);
                }
            } catch (oError) {
                oCreateModel.setProperty("/requesterUser_ID", "");
                oCreateModel.setProperty("/requesterName", "");
                oCreateModel.setProperty("/requester", "");
            }
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

        _getRequestListRouteParameters(oExtraQuery = {}) {
            const oQuery = { ...oExtraQuery };

            if (this._bReturnToUnreservedOnly) {
                oQuery.unreserved = "true";
            }

            if (this._bReturnToReservedOnly) {
                oQuery.reserved = "true";
            }

            return Object.keys(oQuery).length
                ? { "?query": oQuery }
                : {};
        },

        _syncAttachmentModel() {
            const oModel = this.getView().getModel("create");
            const aCurrentAttachments = oModel.getProperty("/attachments") || [];

            oModel.setProperty("/attachments", this._aAttachmentFiles.map((oFile, iIndex) => ({
                name: oFile.name,
                sizeText: this._formatFileSize(oFile.size),
                progress: aCurrentAttachments[iIndex]?.progress || 0,
                progressText: aCurrentAttachments[iIndex]?.progressText || "0%",
                statusText: aCurrentAttachments[iIndex]?.statusText || this.getText("attachmentSelectedStatus"),
                statusState: aCurrentAttachments[iIndex]?.statusState || "None",
                showProgress: aCurrentAttachments[iIndex]?.showProgress || false
            })));
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

        _formatFileSize(iBytes) {
            if (!iBytes) {
                return this.getText("fileSizeZero");
            }

            const aUnits = ["B", "KB", "MB", "GB"];
            let iSize = iBytes;
            let iUnitIndex = 0;

            while (iSize >= 1024 && iUnitIndex < aUnits.length - 1) {
                iSize /= 1024;
                iUnitIndex += 1;
            }

            return `${iSize.toFixed(iUnitIndex ? 1 : 0)} ${aUnits[iUnitIndex]}`;
        },

        _startAttachmentUploadInBackground(sRequestId, aFiles) {
            const oCreateModel = this.getView().getModel("create");

            oCreateModel.setProperty("/uploading", true);
            this._uploadAttachments(sRequestId, aFiles)
                .then(() => {
                    MessageToast.show(this.getText("attachmentsUploadedMessage"));
                })
                .catch((oError) => {
                    MessageBox.error(this.getErrorMessage(oError, this.getText("attachmentBackgroundUploadErrorMessage")));
                })
                .finally(() => {
                    oCreateModel.setProperty("/uploading", false);
                });
        },

        async _uploadAttachments(sRequestId, aFiles = this._aAttachmentFiles) {
            if (!aFiles.length) {
                return;
            }

            const sToken = await this._fetchCsrfToken();

            for (let iIndex = 0; iIndex < aFiles.length; iIndex += 1) {
                const oFile = aFiles[iIndex];

                this._setAttachmentUploadStatus(iIndex, {
                    statusText: this.getText("attachmentUploadingStatus"),
                    statusState: "Information",
                    showProgress: true
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

        _setAttachmentUploadStatus(iIndex, oValues) {
            const oModel = this.getView().getModel("create");

            Object.entries(oValues).forEach(([sProperty, vValue]) => {
                oModel.setProperty(`/attachments/${iIndex}/${sProperty}`, vValue);
            });
        },

        async _createAttachmentMetadata(sRequestId, oFile, sToken) {
            const oResponse = await fetch(this.getServiceV4Url("ProcessAttachments"), {
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

                oRequest.open("PUT", this.getServiceV4Url(`ProcessAttachments(ID=${sAttachmentId})/content`));
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
        }
    });
});
