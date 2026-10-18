sap.ui.define([
  "sap/ui/model/json/JSONModel"
], function (JSONModel) {
  "use strict";

  // A JSONModel binds only its first 100 list entries by default, which silently cut off line
  // items, drop-down entries and worklist rows. Every view model of the app uses this one instead.
  const LIST_SIZE_LIMIT = 100000;

  const ListModel = JSONModel.extend("flowmateca.model.ListModel", {
    constructor: function () {
      JSONModel.apply(this, arguments);
      this.setSizeLimit(LIST_SIZE_LIMIT);
    }
  });
  ListModel.LIST_SIZE_LIMIT = LIST_SIZE_LIMIT;
  return ListModel;
});
