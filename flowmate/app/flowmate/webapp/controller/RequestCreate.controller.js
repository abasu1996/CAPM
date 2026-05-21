sap.ui.define([
    "flowmate/controller/BaseController",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/model/json/JSONModel"
], (BaseController, MessageBox, MessageToast, JSONModel) => {
    "use strict";

    return BaseController.extend("flowmate.controller.RequestCreate", {
        onInit() {
            this.getRouter().getRoute("RouteRequestCreate").attachPatternMatched(this.onRouteMatched, this);
        },

        onRouteMatched() {
            this.setTwoColumnLayout();
            this.getView().setModel(new JSONModel({
                processType_code: "PURCHASE_REQUEST",
                title: "",
                description: "",
                requester: "",
                department: "",
                priority: "Medium",
                autoSubmit: true
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
        }
    });
});
