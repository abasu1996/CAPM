sap.ui.define([
  "flowmateca/controller/BaseController",
  "sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
  "use strict";

  return BaseController.extend("flowmateca.controller.Requests", {
    onInit: function () {
      this.getView().setModel(new JSONModel({ items: [] }), "list");
      this.getView().setModel(new JSONModel({
        requestTypes: [],
        variants: [],
        filteredVariants: []
      }), "catalog");
      this.getRouter().getRoute("requests").attachPatternMatched(this._onRouteMatched, this);
    },

    _onRouteMatched: async function (event) {
      this._query = event.getParameter("arguments")["?query"] || {};
      this.byId("requestStatusFilter").setSelectedKey(this._query.status || "");
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
          `MyRequests?$expand=requestType,requestVariant,status,priority&$orderby=createdAt desc${filterQuery}`
        );
        this.getView().getModel("list").setProperty("/items", result.value || []);
      } catch (error) {
        this.showError(error);
      } finally {
        this.setBusy(false);
      }
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

    onClearFilters: function () {
      this.byId("requestSearch").setValue("");
      this.byId("requestTypeFilter").setSelectedKey("");
      this.byId("requestVariantFilter").setSelectedKey("");
      this.byId("requestStatusFilter").setSelectedKey("");
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
