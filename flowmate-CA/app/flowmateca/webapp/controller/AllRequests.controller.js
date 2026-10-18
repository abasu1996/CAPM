sap.ui.define([
  "flowmateca/controller/BaseController",
  "flowmateca/model/ListModel",
  "sap/ui/model/FilterType",
  "sap/ui/model/Sorter",
  "flowmateca/model/requestFilters"
], function (BaseController, ListModel, FilterType, Sorter, requestFilters) {
  "use strict";

  return BaseController.extend("flowmateca.controller.AllRequests", {
    onInit: function () {
      this.getView().setModel(new ListModel({ total: 0, sort: "desc" }), "view");
      this.getRouter().getRoute("allRequests").attachPatternMatched(this.onRefresh, this);
    },

    onExit: function () {
      clearTimeout(this._filterTimer);
      this.getRouter().getRoute("allRequests").detachPatternMatched(this.onRefresh, this);
    },

    // Exports every request matching the filters, not only the rows loaded so far.
    onExportExcel: async function () {
      const binding = this.byId("allRequestsTable").getBinding("items");
      this.setBusy(true);
      try {
        const contexts = await binding.requestContexts(0, binding.getCount() || binding.getLength());
        await this.exportToExcel("All Requests", [
          { label: "Request ID", value: (r) => r.referenceNumber },
          { label: "Title", value: (r) => r.title },
          { label: "Request Type", value: (r) => r.requestType && r.requestType.name },
          { label: "Requester", value: (r) => r.requesterName },
          { label: "Status", value: (r) => r.status && this.statusName(r.status.name, r.status_code) },
          { label: "Processor Team", value: (r) => r.ownerTeamName },
          { label: "Created", value: (r) => this.formatDateTime(r.createdAt) }
        ], contexts.map((context) => context.getObject()));
      } catch (error) {
        this.showError(error);
      } finally {
        this.setBusy(false);
      }
    },

    onRefresh: function () {
      const binding = this.byId("allRequestsTable").getBinding("items");
      if (binding) binding.refresh();
    },

    onFilterChange: function () {
      clearTimeout(this._filterTimer);
      this._filterTimer = setTimeout(this._applyFilters.bind(this), 250);
    },

    // Created date, newest ("desc", the default) or oldest first; the ID breaks ties the same way.
    onSortChange: function () {
      const descending = this.getView().getModel("view").getProperty("/sort") !== "asc";
      this.byId("allRequestsTable").getBinding("items").sort([
        new Sorter("createdAt", descending),
        new Sorter("ID", descending)
      ]);
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
      this.getView().getModel("view").setProperty("/sort", "desc");
      this.onSortChange();
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
