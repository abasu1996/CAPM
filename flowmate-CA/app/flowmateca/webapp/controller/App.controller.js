sap.ui.define([
  "flowmateca/controller/BaseController"
], function (BaseController) {
  "use strict";

  return BaseController.extend("flowmateca.controller.App", {
    onInit: function () {
      this.loadCurrentUser();
    }
  });
});
