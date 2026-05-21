sap.ui.define([
    "sap/f/library",
    "sap/ui/core/mvc/Controller"
], (fLibrary, Controller) => {
    "use strict";

    const SERVICE_V4_URL = "/odata/v4/flowmate/";

    return Controller.extend("flowmate.controller.BaseController", {
        getRouter() {
            return this.getOwnerComponent().getRouter();
        },

        getModel(sName) {
            return this.getOwnerComponent().getModel(sName);
        },

        getText(sKey, aArgs) {
            return this.getModel("i18n").getResourceBundle().getText(sKey, aArgs);
        },

        setOneColumnLayout() {
            this._setLayout(fLibrary.LayoutType.OneColumn);
        },

        setTwoColumnLayout() {
            this._setLayout(fLibrary.LayoutType.TwoColumnsMidExpanded);
        },

        navTo(sRoute, oParameters) {
            this.getRouter().navTo(sRoute, oParameters || {});
        },

        createEntry(sPath, oPayload) {
            return new Promise((resolve, reject) => {
                this.getModel().create(sPath, oPayload, {
                    success: resolve,
                    error: reject
                });
            });
        },

        async callAction(sAction, oPayload) {
            const sToken = await this._fetchCsrfToken();
            const oResponse = await fetch(`${SERVICE_V4_URL}${sAction}`, {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "X-CSRF-Token": sToken
                },
                body: JSON.stringify(oPayload || {})
            });

            if (!oResponse.ok) {
                let sMessage = this.getText("actionFailedMessage");

                try {
                    const oBody = await oResponse.json();
                    sMessage = oBody?.error?.message || sMessage;
                } catch (oError) {
                    // Keep fallback message.
                }

                throw new Error(sMessage);
            }

            return oResponse.json();
        },

        _setLayout(sLayout) {
            const oRootView = this.getOwnerComponent().getRootControl();
            const oFcl = oRootView && oRootView.byId("flexibleColumnlayout");

            if (oFcl) {
                oFcl.setLayout(sLayout);
            }
        },

        async _fetchCsrfToken() {
            const oResponse = await fetch(SERVICE_V4_URL, {
                method: "GET",
                credentials: "same-origin",
                headers: {
                    "X-CSRF-Token": "Fetch"
                }
            });

            return oResponse.headers.get("X-CSRF-Token") || "";
        }
    });
});
