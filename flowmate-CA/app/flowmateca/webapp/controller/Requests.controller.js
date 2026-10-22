sap.ui.define([
  "flowmateca/controller/BaseController",
  "flowmateca/model/ListModel",
  "flowmateca/model/sortRows"
], function (BaseController, ListModel, sortRows) {
  "use strict";

  return BaseController.extend("flowmateca.controller.Requests", {
    onInit: function () {
      this.getView().setModel(new ListModel({ items: [] }), "list");
      // Sort by Due Date: "asc" = earliest first (most urgent on top), rows without a due date last.
      this.getView().setModel(new ListModel({ key: "asc" }), "sortView");
      this.getView().setModel(new ListModel({
        requestTypes: [],
        variants: [],
        filteredVariants: []
      }), "catalog");
      this.getRouter().getRoute("requests").attachPatternMatched(this._onRouteMatched, this);
    },

    _onRouteMatched: async function (event) {
      this._query = event.getParameter("arguments")["?query"] || {};
      this.byId("requestStatusFilter").setSelectedKey(this._query.status || "");
      this.getView().getModel("sortView").setProperty("/key", "asc");
      await this._loadCatalog();
      await this.onRefresh();
    },

    _loadCatalog: async function () {
      const [types, variants] = await Promise.all([
        this.request("RequestTypes?$filter=isActive eq true&$orderby=sortOrder"),
        this.request("RequestVariants?$filter=isActive eq true&$orderby=sortOrder")
      ]);
      const model = this.getView().getModel("catalog");
      model.setProperty("/requestTypes", types.value || []);
      model.setProperty("/variants", variants.value || []);
      model.setProperty("/filteredVariants", variants.value || []);
    },

    onRefresh: async function () {
      this.setBusy(true);
      try {
        const filters = [];
        const search = this.byId("requestSearch").getValue().trim().toLowerCase();
        const type = this.byId("requestTypeFilter").getSelectedKey();
        const variant = this.byId("requestVariantFilter").getSelectedKey();
        const status = this.byId("requestStatusFilter").getSelectedKey();

        if (search) {
          const safeSearch = search.replace(/'/g, "''");
          filters.push(`(contains(tolower(referenceNumber),'${safeSearch}') or contains(tolower(title),'${safeSearch}') or contains(tolower(requesterName),'${safeSearch}'))`);
        }
        if (type) {
          filters.push(`requestType_code eq '${type}'`);
        }
        if (variant) {
          filters.push(`requestVariant_code eq '${variant}'`);
        }
        if (status) {
          filters.push(`status_code eq '${status}'`);
        }

        const filterQuery = filters.length ? `&$filter=${encodeURIComponent(filters.join(" and "))}` : "";
        const result = await this.request(
          `MyRequests?$expand=requestType,requestVariant,status&$orderby=createdAt desc${filterQuery}`
        );
        this.getView().getModel("list").setProperty("/items", this._sorted(result.value || []));
      } catch (error) {
        this.showError(error);
      } finally {
        this.setBusy(false);
      }
    },

    _sorted: function (rows) {
      const descending = this.getView().getModel("sortView").getProperty("/key") === "desc";
      return sortRows.sortRows(rows, function (row) { return row.dueDate; }, descending);
    },

    // Re-sorts the rows already loaded; no new request.
    onSortChange: function () {
      const model = this.getView().getModel("list");
      model.setProperty("/items", this._sorted(model.getProperty("/items") || []));
    },

    onFilterChange: function () {
      clearTimeout(this._filterTimer);
      this._filterTimer = setTimeout(this.onRefresh.bind(this), 250);
    },

    onRequestTypeChange: function () {
      const selectedType = this.byId("requestTypeFilter").getSelectedKey();
      const catalog = this.getView().getModel("catalog");
      const variants = catalog.getProperty("/variants") || [];
      catalog.setProperty("/filteredVariants", selectedType
        ? variants.filter((variant) => variant.requestType_code === selectedType)
        : variants);
      this.byId("requestVariantFilter").setSelectedKey("");
      this.onFilterChange();
    },

    // Exports the requests the list shows (its filters included).
    onExportExcel: function () {
      // Named after the tile it was opened from (Sent Back, Terminated, Completed) or the page.
      const statusItem = this.byId("requestStatusFilter").getSelectedItem();
      const name = this._query && this._query.status && statusItem
        ? `${statusItem.getText()} Requests`
        : this.getView().getContent()[0].getTitle();
      return this.exportToExcel(name || "Requests", [
        { label: "Request ID", value: (r) => r.referenceNumber },
        { label: "Request Type", value: (r) => r.requestType && r.requestType.name },
        { label: "Requester", value: (r) => r.requesterName },
        { label: "Process Variant", value: (r) => r.requestVariant && r.requestVariant.name },
        { label: "Title", value: (r) => r.title },
        { label: "Status", value: (r) => r.status && this.statusName(r.status.name, r.status.code) },
        { label: "SLA", value: (r) => this.formatRequestSla(r.slaDueAt, r.status && r.status.code, r.completedAt) },
        { label: "Requester Team", value: (r) => r.ownerTeamName },
        { label: "Due Date", value: (r) => this.formatDate(r.dueDate) },
        { label: "Created", value: (r) => this.formatDateTime(r.createdAt) }
      ], this.getView().getModel("list").getProperty("/items") || []).catch(this.showError.bind(this));
    },

    onClearFilters: function () {
      this.byId("requestSearch").setValue("");
      this.byId("requestTypeFilter").setSelectedKey("");
      this.byId("requestVariantFilter").setSelectedKey("");
      this.byId("requestStatusFilter").setSelectedKey("");
      this.getView().getModel("sortView").setProperty("/key", "asc");
      this.getView().getModel("catalog").setProperty(
        "/filteredVariants",
        this.getView().getModel("catalog").getProperty("/variants")
      );
      this.onRefresh();
    },

    onItemPress: function (event) {
      const request = event.getParameter("listItem").getBindingContext("list").getObject();
      this.navTo("requestDetail", {
        requestId: request.ID
      });
    },

    onCreate: function () {
      this.navTo("requestCreate");
    }
  });
});
