sap.ui.define([
  "flowmateca/controller/BaseController",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/FilterType",
  "flowmateca/model/requestFilters"
], function (BaseController, JSONModel, FilterType, requestFilters) {
  "use strict";

  return BaseController.extend("flowmateca.controller.AllRequests", {
    onInit: function () {
      this.getView().setModel(new JSONModel({ total: 0 }), "view");
      this.getRouter().getRoute("allRequests").attachPatternMatched(this.onRefresh, this);
    },

    onExit: function () {
      clearTimeout(this._filterTimer);
      this.getRouter().getRoute("allRequests").detachPatternMatched(this.onRefresh, this);
    },

    onRefresh: function () {
      const binding = this.byId("allRequestsTable").getBinding("items");
      if (binding) binding.refresh();
    },

    onFilterChange: function () {
      clearTimeout(this._filterTimer);
      this._filterTimer = setTimeout(this._applyFilters.bind(this), 250);
    },

    onDateChange: function (event) {
      const picker = event.getSource();
      const valid = event.getParameter("valid");
      picker.data("invalidDate", !valid);
      picker.setValueState(valid ? "None" : "Error");
      picker.setValueStateText(this.getView().getModel("i18n").getResourceBundle().getText("invalidCreationDate"));
      this.onFilterChange();
    },

    _applyFilters: function () {
      const startPicker = this.byId("allRequestsCreatedFrom");
      const endPicker = this.byId("allRequestsCreatedTo");
      if (startPicker.data("invalidDate") || endPicker.data("invalidDate")) return;

      let filters;
      try {
        filters = requestFilters.build({
          status: this.byId("allRequestsStatus").getSelectedKey(),
          requestType: this.byId("allRequestsType").getSelectedKey(),
          startDate: startPicker.getDateValue(),
          endDate: endPicker.getDateValue(),
          search: this.byId("allRequestsSearch").getValue()
        });
      } catch (error) {
        endPicker.setValueState("Error");
        endPicker.setValueStateText(this.getView().getModel("i18n").getResourceBundle().getText(error.message));
        return;
      }
      endPicker.setValueState("None");
      this.byId("allRequestsTable").getBinding("items").filter(filters, FilterType.Application);
    },

    onClearFilters: function () {
      clearTimeout(this._filterTimer);
      this.byId("allRequestsSearch").setValue("");
      this.byId("allRequestsStatus").setSelectedKey("").setValue("");
      this.byId("allRequestsType").setSelectedKey("").setValue("");
      ["allRequestsCreatedFrom", "allRequestsCreatedTo"].forEach((id) => {
        this.byId(id).setValue("").setDateValue(null).setValueState("None").data("invalidDate", false);
      });
      this._applyFilters();
    },

    onUpdateFinished: function (event) {
      this.getView().getModel("view").setProperty("/total", event.getParameter("total"));
    },

    onDataReceived: function (event) {
      const error = event.getParameter("error");
      if (error) this.showError(error);
    },

    onItemPress: function (event) {
      this.navTo("requestDetail", {
        requestId: event.getParameter("listItem").getBindingContext().getProperty("ID")
      });
    }
  });
});
