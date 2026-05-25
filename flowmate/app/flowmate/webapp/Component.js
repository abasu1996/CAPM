sap.ui.define([
    "sap/ui/core/UIComponent",
    "flowmate/model/models",
    "sap/ui/model/json/JSONModel"
], (UIComponent, models, JSONModel) => {
    "use strict";

    return UIComponent.extend("flowmate.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init() {
            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // set the device model
            this.setModel(models.createDeviceModel(), "device");
            this.setModel(new JSONModel({
                isAdmin: false,
                canMaintainUsers: false,
                canDelegateOnBehalf: false,
                loaded: false
            }), "permissions");
            this._loadPermissions();

            // enable routing
            this.getRouter().initialize();
        },

        async _loadPermissions() {
            try {
                const oResponse = await fetch("/odata/v4/flowmate/getApplicationCapabilities()", {
                    credentials: "same-origin"
                });

                if (oResponse.ok) {
                    const oCapabilities = await oResponse.json();
                    this.getModel("permissions").setData({
                        ...oCapabilities,
                        loaded: true
                    });
                    return;
                }
            } catch (oError) {
                // Keep restrictive defaults when capabilities cannot be resolved.
            }

            this.getModel("permissions").setProperty("/loaded", true);
        }
    });
});
