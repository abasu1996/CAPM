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

    return BaseController.extend("flowmate.controller.RequestCreate", {
        onInit() {
            this.getRouter().getRoute("RouteRequestCreate").attachPatternMatched(this.onRouteMatched, this);
        },

        onRouteMatched() {
            this.setTwoColumnLayout();
            this._aAttachmentFiles = [];
            this.getView().setModel(new JSONModel({
                processType_code: "",
                processTypeName: "",
                title: "",
                description: "",
                requester: "",
                department: "",
                priority: "Medium",
                autoSubmit: true,
                attachments: []
            }), "create");
        },

        async onCreate() {
            const oPayload = this.getView().getModel("create").getData();

            if (!oPayload.title || !oPayload.processType_code) {
                MessageBox.warning(this.getText("createRequiredMessage"));
                return;
            }

            this.getView().setBusy(true);

            try {
                const oCreated = await this.createEntry("/ProcessRequests", {
                    processType_code: oPayload.processType_code,
                    title: oPayload.title,
                    description: oPayload.description,
                    requester: oPayload.requester,
                    department: oPayload.department,
                    priority: oPayload.priority,
                    status_code: "DRAFT"
                });

                await this._uploadAttachments(oCreated.ID);

                if (oPayload.autoSubmit) {
                    await this.callAction("submitRequest", {
                        requestId: oCreated.ID
                    });
                }

                MessageToast.show(this.getText("requestCreatedMessage"));
                this.navTo("RouteRequestDetail", {
                    requestId: encodeURIComponent(oCreated.ID)
                });
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("requestCreateFailedMessage"));
            } finally {
                this.getView().setBusy(false);
            }
        },

        onCancel() {
            this.navTo("RouteMyRequests");
        },

        onAttachmentsSelected(oEvent) {
            const aFiles = Array.from(oEvent.getParameter("files") || []);

            this._aAttachmentFiles.push(...aFiles);
            this._syncAttachmentModel();
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

        onProcessTypeValueHelpConfirm(oEvent) {
            const oSelectedItem = oEvent.getParameter("selectedItem");
            const oContext = oSelectedItem && oSelectedItem.getBindingContext();

            if (!oContext) {
                return;
            }

            this.getView().getModel("create").setProperty("/processType_code", oContext.getProperty("code"));
            this.getView().getModel("create").setProperty("/processTypeName", oContext.getProperty("name"));
            this.onProcessTypeValueHelpClose(oEvent);
        },

        onProcessTypeValueHelpClose(oEvent) {
            const oBinding = oEvent.getSource().getBinding("items");

            if (oBinding) {
                oBinding.filter([]);
            }
        },

        _syncAttachmentModel() {
            this.getView().getModel("create").setProperty("/attachments", this._aAttachmentFiles.map((oFile) => ({
                name: oFile.name,
                sizeText: this._formatFileSize(oFile.size)
            })));
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

        async _uploadAttachments(sRequestId) {
            if (!this._aAttachmentFiles.length) {
                return;
            }

            const sToken = await this._fetchCsrfToken();

            for (const oFile of this._aAttachmentFiles) {
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
        }
    });
});
