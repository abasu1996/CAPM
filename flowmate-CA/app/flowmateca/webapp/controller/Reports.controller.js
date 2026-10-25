sap.ui.define([
  "flowmateca/controller/BaseController",
  "flowmateca/model/ListModel",
  "sap/m/MessageToast"
], function (BaseController, ListModel, MessageToast) {
  "use strict";

  const formatDate = (date) => {
    const value = date instanceof Date ? date : new Date(date);
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  };

  return BaseController.extend("flowmateca.controller.Reports", {
    onInit: function () {
      this.getView().setModel(new ListModel({
        loading: false,
        scope: "ALL",
        poType: "ALL",
        visible: { all: true, poSpend: true, poLifecycle: true, sesLifecycle: true, scm: true, sourceToPay: true },
        period: { start: "", end: "" },
        summary: { totalRequests: 0, completed: 0, rejected: 0, inProgress: 0, slaBreached: 0 },
        poSpend: { totalSpend: 0, previousYearSpend: 0, yoyVariance: 0, yoyVariancePercent: 0, activeSuppliers: 0, topSuppliers: [], supplierYoY: [], categorySplit: [], monthlySpend: [] },
        poLifecycle: { totalReceived: 0, completed: 0, rejected: 0, inProgress: 0, withinSla: 0, slaBreached: 0, statusBreakdown: [], typeBreakdown: [], monthlySummary: [] },
        sesLifecycle: { totalReceived: 0, completed: 0, rejected: 0, inProgress: 0, withinSla: 0, slaBreached: 0, statusBreakdown: [], typeBreakdown: [], monthlySummary: [] },
        procurementView: [],
        scmFlows: [],
        recentTransactions: [],
        sourceToPay: [],
        sourceToPayLimitations: []
      }), "reports");
      this.getRouter().getRoute("reports").attachPatternMatched(this.onRefresh, this);
    },

    onRefresh: function () {
      const range = this.byId("reportPeriod");
      const start = range?.getDateValue() || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const end = range?.getSecondDateValue() || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
      if (range && !range.getDateValue()) {
        range.setDateValue(start);
        range.setSecondDateValue(end);
      }
      this.loadReport(start, end, this.getView().getModel("reports").getProperty("/poType") || "ALL");
    },

    loadReport: async function (start, end, poType) {
      const model = this.getView().getModel("reports");
      model.setProperty("/loading", true);
      try {
        const response = await this.request("getReportingDashboard", {
          method: "POST",
          body: { periodStart: formatDate(start), periodEnd: formatDate(end), poType: poType || "ALL" }
        });
        const raw = response?.value ?? response;
        const data = typeof raw === "string" ? JSON.parse(raw) : raw;
        model.setData(Object.assign({}, data, {
          loading: false,
          scope: model.getProperty("/scope") || "ALL",
          poType: poType || "ALL",
          visible: model.getProperty("/visible") || { all: true, poSpend: true, poLifecycle: true, sesLifecycle: true, scm: true, sourceToPay: true }
        }));
      } catch (error) {
        model.setProperty("/loading", false);
        this.showError(error);
      }
    },

    onPeriodChange: function (event) {
      if (!event.getParameter("valid")) {
        MessageToast.show("Select a valid reporting period");
        return;
      }
      const range = event.getSource();
      this.loadReport(range.getDateValue(), range.getSecondDateValue() || range.getDateValue(), this.getView().getModel("reports").getProperty("/poType") || "ALL");
    },

    onPoTypeChange: function (event) {
      const range = this.byId("reportPeriod");
      if (range?.getDateValue()) {
        this.getView().getModel("reports").setProperty("/poType", event.getSource().getSelectedKey());
        this.loadReport(range.getDateValue(), range.getSecondDateValue() || range.getDateValue(), event.getSource().getSelectedKey());
      }
    },

    onScopeChange: function (event) {
      const scope = event.getSource().getSelectedKey();
      const visible = {
        all: scope === "ALL",
        poSpend: scope === "ALL" || scope === "PO_SPEND",
        poLifecycle: scope === "ALL" || scope === "PO_LIFECYCLE",
        sesLifecycle: scope === "ALL" || scope === "SES_LIFECYCLE",
        scm: scope === "ALL" || scope === "SCM",
        sourceToPay: scope === "ALL" || scope === "SOURCE_TO_PAY"
      };
      const model = this.getView().getModel("reports");
      model.setProperty("/scope", scope);
      model.setProperty("/visible", visible);
    },

    onDashboard: function () { this.navTo("dashboard"); },
    onRequests: function () { this.navTo("allRequests"); },
    onTasks: function () { this.navTo("tasks", { "?query": { mode: "mine" } }); },
    onAdmin: function () { this.navTo("admin"); },

    formatNumber: function (value) {
      return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(Number(value) || 0);
    },

    formatPercent: function (value) {
      return `${Number(value || 0).toFixed(1)}%`;
    },

    formatVariance: function (value) {
      const amount = Number(value) || 0;
      return `${amount >= 0 ? "+" : ""}${this.formatNumber(amount)}`;
    },

    formatMonth: function (value) {
      if (!value) return "—";
      const [year, month] = String(value).split("-");
      return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(new Date(Number(year), Number(month) - 1, 1));
    },

    statusState: function (label) {
      if (/reject/i.test(label)) return "Error";
      if (/complete/i.test(label)) return "Success";
      if (/progress|submitted/i.test(label)) return "Warning";
      return "Information";
    },

    slaState: function (value) {
      return Number(value) > 0 ? "Error" : "Success";
    }
  });
});
