sap.ui.define([
    "flowmate/controller/BaseController"
], (BaseController) => {
    "use strict";

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
        }
    });
});
