sap.ui.define([
    "flowmate/controller/BaseController",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/json/JSONModel"
], (BaseController, MessageBox, MessageToast, Filter, FilterOperator, JSONModel) => {
    "use strict";

    const SERVICE_V4_URL = "/odata/v4/flowmate/";
    const MAX_ATTACHMENT_SIZE_MB = 400;
    const MAX_ATTACHMENT_SIZE_BYTES = MAX_ATTACHMENT_SIZE_MB * 1024 * 1024;

    return BaseController.extend("flowmate.controller.RequestCreate", {
        onInit() {
            this.getRouter().getRoute("RouteRequestCreate").attachPatternMatched(this.onRouteMatched, this);
        },

        onRouteMatched(oEvent) {
            const oQuery = oEvent.getParameter("arguments")["?query"] || {};

            this._bReturnToUnreservedOnly = oQuery.unreserved === "true";
            this._bReturnToReservedOnly = oQuery.reserved === "true";
            this.setTwoColumnLayout();
            this._aAttachmentFiles = [];
            this.getView().setModel(new JSONModel({
                processType_code: "",
                processTypeName: "",
                subProcessType_code: "",
                subProcessTypeName: "",
                hasSubProcessTypes: false,
                title: "",
                description: "",
                requesterUser_ID: "",
                requesterName: "",
                requester: "",
                processorUser_ID: "",
                processorName: "",
                processor: "",
                department: "",
                priority: "Medium",
                autoSubmit: true,
                creating: false,
                uploading: false,
                attachments: []
            }), "create");
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
                    processorUser_ID: oPayload.processorUser_ID || undefined,
                    processor: oPayload.processor,
                    department: oPayload.department,
                    priority: oPayload.priority,
                    status_code: "DRAFT"
                });

                if (oPayload.autoSubmit) {
                    await this.callAction("submitRequest", {
                        requestId: oCreated.ID
                    });
                }

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
                MessageBox.error(oError.message || this.getText("requestCreateFailedMessage"));
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

        onRequesterValueHelpRequest() {
            this.byId("requesterValueHelpDialog").open();
        },

        onRequesterValueHelpSearch(oEvent) {
            this._filterUsers(oEvent.getSource(), oEvent.getParameter("value") || "");
        },

        onRequesterValueHelpConfirm(oEvent) {
            const oContext = oEvent.getParameter("selectedItem")?.getBindingContext();

            if (!oContext) {
                return;
            }

            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/requesterUser_ID", oContext.getProperty("ID"));
            oCreateModel.setProperty("/requesterName", oContext.getProperty("displayName"));
            oCreateModel.setProperty("/requester", oContext.getProperty("displayName"));

            if (!oCreateModel.getProperty("/department")) {
                oCreateModel.setProperty("/department", oContext.getProperty("department"));
            }

            this.onRequesterValueHelpClose(oEvent);
        },

        onRequesterValueHelpClose(oEvent) {
            oEvent.getSource().getBinding("items")?.filter([]);
        },

        onProcessorValueHelpRequest() {
            this.byId("requestCreateProcessorValueHelpDialog").open();
        },

        onProcessorValueHelpSearch(oEvent) {
            this._filterUsers(oEvent.getSource(), oEvent.getParameter("value") || "");
        },

        onProcessorValueHelpConfirm(oEvent) {
            const oContext = oEvent.getParameter("selectedItem")?.getBindingContext();

            if (!oContext) {
                return;
            }

            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/processorUser_ID", oContext.getProperty("ID"));
            oCreateModel.setProperty("/processorName", oContext.getProperty("displayName"));
            oCreateModel.setProperty("/processor", oContext.getProperty("displayName"));
            this.onProcessorValueHelpClose(oEvent);
        },

        onProcessorValueHelpClose(oEvent) {
            oEvent.getSource().getBinding("items")?.filter([]);
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

        onSubProcessTypeValueHelpSearch(oEvent) {
            this._filterSubProcessTypeDialog(oEvent.getSource(), oEvent.getParameter("value") || "");
        },

        async onSubProcessTypeValueHelpConfirm(oEvent) {
            const oContext = oEvent.getParameter("selectedItem")?.getBindingContext();

            if (!oContext) {
                return;
            }

            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/subProcessType_code", oContext.getProperty("code"));
            oCreateModel.setProperty("/subProcessTypeName", oContext.getProperty("name"));
            this.onSubProcessTypeValueHelpClose(oEvent);
        },

        onSubProcessTypeValueHelpClose(oEvent) {
            oEvent.getSource().getBinding("items")?.filter([]);
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

        async _onProcessSelectionChanged() {
            const oCreateModel = this.getView().getModel("create");

            oCreateModel.setProperty("/subProcessType_code", "");
            oCreateModel.setProperty("/subProcessTypeName", "");

            const aSubTypes = await this._readList("/ProcessSubTypes", {
                filters: [new Filter("processType_code", FilterOperator.EQ, oCreateModel.getProperty("/processType_code"))],
                sorters: []
            });

            oCreateModel.setProperty("/hasSubProcessTypes", aSubTypes.length > 0);
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
                    MessageBox.error(oError.message || this.getText("attachmentBackgroundUploadErrorMessage"));
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
        }
    });
});
