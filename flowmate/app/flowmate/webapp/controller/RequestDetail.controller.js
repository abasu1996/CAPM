sap.ui.define([
    "flowmate/controller/BaseController",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], (BaseController, MessageBox, MessageToast) => {
    "use strict";

    const SERVICE_V4_URL = "/odata/v4/flowmate/";

    return BaseController.extend("flowmate.controller.RequestDetail", {
        onInit() {
            this.getRouter().getRoute("RouteRequestDetail").attachPatternMatched(this.onRouteMatched, this);
        },

        onRouteMatched(oEvent) {
            const sRequestId = decodeURIComponent(oEvent.getParameter("arguments").requestId);

            this.setTwoColumnLayout();
            this.getView().bindElement({
                path: `/ProcessRequests(guid'${sRequestId}')`,
                parameters: {
                    expand: "tasks,comments,attachments,history"
                }
            });
        },

        onClose() {
            this.navTo("RouteMyRequests");
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

            this.getView().setBusy(true);

            try {
                await this.removeEntry(`/ProcessTasks(guid'${sTaskId}')`);
                MessageToast.show(this.getText("taskDeletedMessage"));
                this._refreshRequest();
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
                this._refreshRequest();
            } catch (oError) {
                MessageBox.error(oError.message || this.getText("attachmentDeleteErrorMessage"));
            } finally {
                this.getView().setBusy(false);
            }
        },

        _refreshRequest() {
            const oBinding = this.getView().getElementBinding();

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
