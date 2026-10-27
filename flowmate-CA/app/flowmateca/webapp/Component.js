sap.ui.define([
  "sap/ui/core/UIComponent",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/odata/v4/ODataModel",
  "flowmateca/model/serviceUrl"
], function (UIComponent, JSONModel, ODataModel, serviceUrl) {
  "use strict";

  const MAIN_SERVICE_URL = "odata/v4/flowmate-ca/";
  const MASTER_SERVICE_URL = "odata/v4/flowmate-ca-master/";

  return UIComponent.extend("flowmateca.Component", {
    metadata: {
      manifest: "json"
    },

    init: function () {
      UIComponent.prototype.init.apply(this, arguments);
      this.setModel(new ODataModel({
        serviceUrl: serviceUrl.resolve(MAIN_SERVICE_URL),
        synchronizationMode: "None",
        operationMode: "Server",
        autoExpandSelect: true,
        earlyRequests: true
      }));
      this.setModel(new ODataModel({
        serviceUrl: serviceUrl.resolve(MASTER_SERVICE_URL),
        synchronizationMode: "None",
        operationMode: "Server",
        autoExpandSelect: true
      }), "master");
      this.setModel(new JSONModel({
        busy: false,
        currentUser: {
          displayName: "",
          email: "",
          isAdmin: false,
          isSupervisor: false,
          isValidator: false,
          isCreator: false,
          canCreate: false,
          canValidate: false,
          canAssign: false,
          canManageDelegation: false,
          canViewAllRequests: false,
          canViewReports: false,
          canTerminate: false,
          canAdminister: false,
          canDelegateOnBehalf: false,
          canReassign: false,
          activeDelegatorUserIds: [],
          teamIds: []
        }
      }), "app");
      this.getRouter().initialize();
    }
  });
});
