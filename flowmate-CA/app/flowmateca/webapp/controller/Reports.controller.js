sap.ui.define([
  "flowmateca/controller/BaseController",
  "flowmateca/model/ListModel",
  "sap/ui/core/Lib"
], function (BaseController, ListModel, Lib) {
  "use strict";

  const STATUS_STATE = { GOOD: "Success", WATCH: "Warning", POOR: "Error", NONE: "None" };
  const STATUS_TEXT = { GOOD: "On track", WATCH: "Watch", POOR: "Off track", NONE: "No data" };
  const REQUEST_STATUS = {
    SUBMITTED: ["Submitted", "Information"], IN_PROGRESS: ["In progress", "Warning"], SENT_BACK: ["Sent back", "Warning"],
    COMPLETED: ["Approved", "Success"], REJECTED: ["Rejected", "Error"]
  };
  const TASK_STATUS = { OPEN: "Open", IN_PROGRESS: "In progress", APPROVED: "Approved", SENT_BACK: "Sent back", REJECTED: "Rejected" };
  // Which of the period's requests each KPI tile stands for (tile order of _kpiTiles).
  const KPI_FILTERS = [
    function () { return true; },
    function (row) { return row.rejected; },
    function (row) { return row.created; },
    function (row) { return row.approved; },
    function (row) { return row.pending; },
    function () { return true; }
  ];
  const FAIL = {
    CRITICAL: { state: "Error", text: "Critical" },
    WARNING: { state: "Warning", text: "Warning" },
    MONITOR: { state: "Information", text: "Monitor" }
  };
  const VIEW_GROUP_LABEL = {
    PG_VOLUME: "Purchasing group", COMPANY_CODE: "Company code", CONTRACT: "Contract",
    PG_ALL: "Purchasing group", PG_SLA: "Purchasing group", ALL_SLA: ""
  };
  // Dashboards of docs/ARIBA Reports.xlsx built so far, for the dashboard selector.
  // "All reports" shows every dashboard, one after the other.
  const DASHBOARDS = [{ key: "ALL", title: "All reports" }, { key: "PO_LIFECYCLE", title: "PO Lifecycle" },
    { key: "SPEND_ANALYSIS", title: "Spend Analysis" }];
  // LKR amounts are shown in millions, as in the Spend Analysis sheet.
  const MILLION = 1000000;
  const millions = (value) => (Number(value) / MILLION).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const emptySpend = () => ({
    loaded: false, kpis: {}, topSuppliers: [], yoy: [], byExpenditure: [], byDivision: [], recent: [],
    otherCurrencyCount: 0, topChart: [], yoyChart: []
  });

  // The default reporting period: the current month, first to last day.
  const currentMonthPeriod = () => {
    const now = new Date();
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0) };
  };
  const isoDay = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  // "01 Oct 2026 - 31 Oct 2026" for a { start, end } period of "YYYY-MM-DD" days.
  const periodLabel = (period) => {
    if (!period || !period.start) return "";
    const day = (key) => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
      .format(new Date(`${key}T00:00:00Z`));
    return `${day(period.start)} - ${day(period.end)}`;
  };
  // "long": October 2026, "short": Oct 2026, "axis": Oct 26.
  const monthName = (key, style) => {
    if (!key) return "";
    const [year, month] = key.split("-").map(Number);
    const axis = style === "axis";
    return new Intl.DateTimeFormat("en-GB", { month: axis ? "short" : style || "long", year: axis ? "2-digit" : "numeric" })
      .format(new Date(year, month - 1, 1));
  };
  const emptyReport = () => ({
    selectedDashboard: DASHBOARDS[0].key,
    dashboards: DASHBOARDS,
    filters: Object.assign(currentMonthPeriod(), { poType: "ALL" }),
    loading: false,
    loaded: false,
    period: { start: "", end: "" },
    poType: "ALL",
    poTypes: [{ code: "ALL", name: "All PO types" }],
    kpis: {},
    kpiTiles: [],
    monthlySla: [],
    views: [],
    selectedView: { label: "", rows: [], layout: "NONE", groupLabel: "" },
    slaFailures: [],
    divisionBreakdown: [],
    trend: []
  });

  return BaseController.extend("flowmateca.controller.Reports", {
    onInit: function () {
      this.getView().setModel(new ListModel(emptyReport()), "reports");
      this.getView().setModel(new ListModel({ title: "", tab: "requests", requests: [], tasks: [] }), "drill");
      this.getView().setModel(new ListModel(emptySpend()), "spend");
      this.getView().setModel(new ListModel({ title: "", tab: "overview", inactive: false, suppliers: [], purchaseOrders: [] }), "spendDrill");
      // Charts come from sap.viz, loaded only for this page.
      this._chartsReady = Lib.load({ name: "sap.viz" });
      this.getRouter().getRoute("reports").attachPatternMatched(this._onRouteMatched, this);
    },

    _onRouteMatched: function () {
      this.onApplyFilters();
    },

    onPeriodChange: function (event) {
      if (event.getParameter("valid") && event.getParameter("from") && event.getParameter("to")) {
        this.onApplyFilters();
      }
    },

    onResetFilters: function () {
      this.getView().getModel("reports").setProperty("/filters", Object.assign(currentMonthPeriod(), { poType: "ALL" }));
      this.onApplyFilters();
    },

    onApplyFilters: async function () {
      const model = this.getView().getModel("reports");
      const filters = model.getProperty("/filters");
      model.setProperty("/loading", true);
      try {
        const period = filters.from && filters.to ? filters : currentMonthPeriod();
        const selected = model.getProperty("/selectedDashboard");
        if (selected === "SPEND_ANALYSIS") {
          await this._loadSpendAnalysis(period, filters.poType || "ALL");
          return;
        }
        const response = await this.request("getPoLifecycleDashboard", {
          method: "POST",
          body: { periodStart: isoDay(period.from), periodEnd: isoDay(period.to), poType: filters.poType || "ALL" }
        });
        const raw = response && response.value !== undefined ? response.value : response;
        const data = typeof raw === "string" ? JSON.parse(raw) : raw;
        const selectedKey = model.getProperty("/selectedView/key") || "PG_VOLUME";
        const keep = { selectedDashboard: model.getProperty("/selectedDashboard"), filters: { from: period.from, to: period.to, poType: data.poType } };
        model.setData(Object.assign(emptyReport(), data, keep, { loading: false, loaded: true, kpiTiles: this._kpiTiles(data) }));
        this._selectView(selectedKey);
        this._renderCharts();
        // All reports: Spend Analysis for the same filters, below PO Lifecycle.
        if (selected === "ALL") {
          model.setProperty("/loading", true);
          await this._loadSpendAnalysis(period, data.poType || filters.poType || "ALL");
        }
      } catch (error) {
        model.setProperty("/loading", false);
        this.showError(error);
      }
    },

    // --- Spend Analysis ------------------------------------------------------------------------

    // The Spend Analysis dashboard (getSpendAnalysisDashboard) for the same period and PO type;
    // the period and PO type lists stay on the "reports" model the filter bar is bound to.
    _loadSpendAnalysis: async function (period, poType) {
      const model = this.getView().getModel("reports");
      const response = await this.request("getSpendAnalysisDashboard", {
        method: "POST",
        body: { periodStart: isoDay(period.from), periodEnd: isoDay(period.to), poType }
      });
      const raw = response && response.value !== undefined ? response.value : response;
      const data = typeof raw === "string" ? JSON.parse(raw) : raw;
      const inMillions = (value) => Math.round((Number(value) || 0) / MILLION * 100) / 100;
      this.getView().getModel("spend").setData(Object.assign(emptySpend(), data, {
        loaded: true,
        topChart: (data.topSuppliers || []).map(function (row) { return { supplier: row.supplier, spend: inMillions(row.amount) }; }),
        yoyChart: (data.yoy || []).map(function (row) {
          return { supplier: row.supplier, previous: inMillions(row.previous), current: inMillions(row.current) };
        })
      }));
      model.setProperty("/poTypes", data.poTypes || model.getProperty("/poTypes"));
      model.setProperty("/period", data.period);
      model.setProperty("/poType", data.poType);
      model.setProperty("/filters", { from: period.from, to: period.to, poType: data.poType });
      model.setProperty("/loading", false);
      this._renderSpendCharts();
    },

    _renderSpendCharts: async function () {
      const classes = await this._vizClasses();
      const spend = this.getView().getModel("spend");
      const years = spend.getProperty("/kpis") || {};
      if (!this._spendTopChart) {
        this._spendTopChart = this._chart(classes, "bar", {
          legend: { visible: false },
          plotArea: { dataLabel: { visible: true }, dataPointSize: { min: 6, max: 26 }, colorPalette: ["#2c4fa3"] }
        }, [["valueAxis", "Measure", ["Spend (LKR Mn)"]], ["categoryAxis", "Dimension", ["Supplier"]]],
        { dimensions: [{ name: "Supplier", value: "{supplier}" }], measures: [{ name: "Spend (LKR Mn)", value: "{spend}" }], data: { path: "/topChart" } },
        "spend");
        this.byId("spendTopChartHost").addItem(this._spendTopChart);
      }
      // The measure names carry the years, so the chart is built again when they change.
      const yoyKey = `${years.previousYear}|${years.currentYear}`;
      if (this._spendYoyChart && this._spendYoyKey !== yoyKey) {
        this._spendYoyChart.destroy();
        this._spendYoyChart = null;
      }
      if (!this._spendYoyChart) {
        const previous = String(years.previousYear || "Last year");
        const current = String(years.currentYear || "This year");
        this._spendYoyKey = yoyKey;
        this._spendYoyChart = this._chart(classes, "column", {
          plotArea: { dataPointSize: { min: 6, max: 30 }, colorPalette: ["#9db4e6", "#2c4fa3"] }
        }, [["valueAxis", "Measure", [previous, current]], ["categoryAxis", "Dimension", ["Supplier"]]],
        { dimensions: [{ name: "Supplier", value: "{supplier}" }],
          measures: [{ name: previous, value: "{previous}" }, { name: current, value: "{current}" }], data: { path: "/yoyChart" } },
        "spend");
        this.byId("spendYoyChartHost").addItem(this._spendYoyChart);
      }
    },

    onSpendRowPress: function (event) {
      this.navTo("requestDetail", { requestId: event.getSource().getBindingContext("spend").getProperty("requestId") });
    },

    // A Spend Analysis KPI tile opens the suppliers and purchase orders behind its figure.
    onSpendKpiPress: function (event) {
      const kpi = event.getSource().data("spendKpi");
      const spend = this.getView().getModel("spend").getData();
      const bundle = this.getView().getModel("i18n").getResourceBundle();
      const all = spend.suppliers || [];
      const pos = spend.purchaseOrders || [];
      const ofSuppliers = function (rows) {
        const keys = new Set(rows.map(function (row) { return row.supplierKey; }));
        return pos.filter(function (row) { return keys.has(row.supplierKey); });
      };
      const variance = function (row) { return row.variancePercent === null ? Infinity : row.variancePercent; };
      let suppliers;
      let purchaseOrders;
      let inactive = false;
      if (kpi === "INACTIVE") {
        inactive = true;
        suppliers = spend.inactiveSupplierList || [];
        const ids = new Set(suppliers.map(function (row) { return row.vendorId; }));
        purchaseOrders = pos.filter(function (row) { return row.vendorId && ids.has(row.vendorId); });
      } else if (kpi === "ACTIVE") {
        suppliers = all.filter(function (row) { return row.current > 0; });
        purchaseOrders = ofSuppliers(suppliers);
      } else if (kpi === "TOP10") {
        suppliers = all.filter(function (row) { return row.isTop10; });
        purchaseOrders = ofSuppliers(suppliers);
      } else if (kpi === "YOY") {
        suppliers = all.slice().sort(function (left, right) { return variance(right) - variance(left); });
        purchaseOrders = pos;
      } else {
        suppliers = all;
        purchaseOrders = pos;
      }
      const label = bundle.getText({ TOTAL: "spendTotal", ACTIVE: "spendActiveSuppliers", TOP10: "spendTopShare",
        YOY: "spendYoy", INACTIVE: "spendInactiveSuppliers" }[kpi] || "spendTotal");
      const lkr = purchaseOrders.reduce(function (sum, row) { return sum + (Number(row.amountLkr) || 0); }, 0);
      const previous = suppliers.reduce(function (sum, row) { return sum + (Number(row.previous) || 0); }, 0);
      const k = spend.kpis || {};
      this.getView().getModel("spendDrill").setData({
        title: `${label} - ${periodLabel(spend.period)} (${inactive ? suppliers.length : purchaseOrders.length})`,
        tab: "overview",
        inactive,
        suppliers,
        purchaseOrders,
        facts: {
          purchaseOrders: String(purchaseOrders.length),
          suppliers: String(suppliers.length),
          spend: millions(lkr),
          previous: inactive ? "—" : millions(previous),
          years: k.currentYear && k.previousYear ? `${k.previousYear} → ${k.currentYear}` : ""
        },
        // The overview chart: LKR spend of the selection's ten largest suppliers.
        chart: (inactive
          ? suppliers.map(function (row) {
            const amount = pos.filter(function (po) { return po.vendorId === row.vendorId; })
              .reduce(function (sum, po) { return sum + (Number(po.amountLkr) || 0); }, 0);
            return { supplier: row.supplier, spend: Math.round(amount / MILLION * 100) / 100 };
          })
          : suppliers.map(function (row) { return { supplier: row.supplier, spend: Math.round((row.current || 0) / MILLION * 100) / 100 }; }))
          .filter(function (row) { return row.spend > 0; })
          .sort(function (left, right) { return right.spend - left.spend; })
          .slice(0, 10)
      });
      this.byId("spendDrillDialog").open();
      this._renderSpendDrillChart();
    },

    _renderSpendDrillChart: async function () {
      if (this._spendDrillChart) return;
      const classes = await this._vizClasses();
      this._spendDrillChart = this._chart(classes, "bar", {
        legend: { visible: false },
        plotArea: { dataLabel: { visible: true }, dataPointSize: { min: 6, max: 26 }, colorPalette: ["#2c4fa3"] }
      }, [["valueAxis", "Measure", ["Spend (LKR Mn)"]], ["categoryAxis", "Dimension", ["Supplier"]]],
      { dimensions: [{ name: "Supplier", value: "{supplier}" }], measures: [{ name: "Spend (LKR Mn)", value: "{spend}" }], data: { path: "/chart" } },
      "spendDrill");
      this._spendDrillChart.setHeight("19rem");
      this.byId("spendDrillChartHost").addItem(this._spendDrillChart);
    },

    onSpendDrillClose: function () {
      this.byId("spendDrillDialog").close();
    },

    onSpendDrillPoPress: function (event) {
      this.byId("spendDrillDialog").close();
      this.navTo("requestDetail", { requestId: event.getSource().getBindingContext("spendDrill").getProperty("requestId") });
    },

    // The six KPI tiles of the sheet; the footer compares with the period of the same length before.
    _kpiTiles: function (data) {
      const k = data.kpis;
      const p = data.previousPeriod;
      const previous = "previous period";
      const tile = function (label, caption, icon, current, before, valueColor, isPercent) {
        const change = current === null || before === null || before === undefined ? null : Math.round((current - before) * 10) / 10;
        return {
          label,
          caption,
          icon,
          value: current === null || current === undefined ? "—" : isPercent ? Number(current).toFixed(1) : String(current),
          scale: isPercent && current !== null ? "%" : "",
          valueColor,
          footer: change === null ? `No data for the ${previous}`
            : change ? `${change > 0 ? "+" : ""}${change}${isPercent ? " pts" : ""} vs ${previous}` : `Same as ${previous}`
        };
      };
      const sla = k.slaCompliancePercent;
      return [
        tile("Total PO requests", "In the reporting period", "sap-icon://documents", k.totalRequests, p.totalRequests, "Neutral"),
        tile("PO rejected", "Terminated in the workflow", "sap-icon://decline", k.rejected, p.rejected, "Error"),
        tile("PO created", "PO number recorded at S/4", "sap-icon://create", k.created, p.created, "Neutral"),
        tile("PO approved", "All approval steps done", "sap-icon://accept", k.approved, p.approved, "Good"),
        tile("Pending approval", "Awaiting action", "sap-icon://pending", k.pendingApproval, p.pendingApproval, "Critical"),
        tile("SLA compliance", "All included SLA", "sap-icon://quality-issue", sla, p.slaCompliancePercent,
          sla === null ? "Neutral" : sla >= 90 ? "Good" : sla >= 80 ? "Critical" : "Error", true)
      ];
    },

    // A KPI tile opens the requests behind its figure and their workflow tasks. SLA compliance
    // lists every request, breached ones first.
    onKpiPress: function (event) {
      const index = Number(event.getSource().data("kpiIndex"));
      const data = this.getView().getModel("reports").getData();
      const requests = (data.requests || []).filter(KPI_FILTERS[index]);
      if (index === 5) {
        requests.sort(function (left, right) { return Number(right.breached) - Number(left.breached) || right.elapsedDays - left.elapsedDays; });
      }
      const ids = new Set(requests.map(function (row) { return row.requestId; }));
      const tasks = (data.tasks || []).filter(function (task) { return ids.has(task.request_ID); });
      const tile = data.kpiTiles[index];
      this.getView().getModel("drill").setData(Object.assign({
        title: `${tile.label} - ${periodLabel(data.period)} (${requests.length})`,
        tab: "overview",
        requests,
        tasks
      }, this._drillOverview(requests, tasks)));
      this.byId("drillDialog").open();
      this._renderDrillCharts();
    },

    // The overview tab of the drill-down: a few facts and the data of its three charts.
    _drillOverview: function (requests, tasks) {
      const average = function (values) {
        return values.length ? (values.reduce(function (sum, value) { return sum + value; }, 0) / values.length).toFixed(1) : "—";
      };
      const statuses = new Map();
      requests.forEach(function (row) { statuses.set(row.status, (statuses.get(row.status) || 0) + 1); });
      const breached = requests.filter(function (row) { return row.breached; }).length;
      // One bar per workflow step; variants number the same step differently.
      const steps = new Map();
      tasks.forEach(function (task) {
        const name = task.stepName || task.taskName;
        const step = steps.get(name) || { step: name, order: task.stepNo, approved: 0, open: 0, rejected: 0 };
        step.order = Math.min(step.order, task.stepNo);
        if (task.status_code === "APPROVED") step.approved += 1;
        else if (task.status_code === "REJECTED") step.rejected += 1;
        else step.open += 1;
        steps.set(name, step);
      });
      return {
        facts: {
          requests: String(requests.length),
          tasks: String(tasks.length),
          openTasks: String(tasks.filter(function (task) { return task.status_code === "OPEN" || task.status_code === "IN_PROGRESS"; }).length),
          averageDays: `${average(requests.map(function (row) { return row.elapsedDays; }))} / ${average(requests.map(function (row) { return row.targetDays; }))}`,
          breached: `${breached} of ${requests.length}`
        },
        statusChart: Array.from(statuses.entries())
          .map(function (entry) { return { status: (REQUEST_STATUS[entry[0]] || [entry[0]])[0], count: entry[1] }; }),
        slaChart: [{ label: "Within SLA", count: requests.length - breached }, { label: "Breached", count: breached }]
          .filter(function (row) { return row.count > 0; }),
        stepChart: Array.from(steps.values()).sort(function (left, right) { return left.order - right.order; })
      };
    },

    onDrillClose: function () {
      this.byId("drillDialog").close();
    },

    onDrillRequestPress: function (event) {
      this.byId("drillDialog").close();
      this.navTo("requestDetail", { requestId: event.getSource().getBindingContext("drill").getProperty("requestId") });
    },

    onDrillTaskPress: function (event) {
      this.byId("drillDialog").close();
      this.navTo("taskDetail", { taskId: event.getSource().getBindingContext("drill").getProperty("ID") });
    },

    onViewSelect: function (event) {
      this._selectView(event.getParameter("listItem").getBindingContext("reports").getProperty("key"));
    },

    _selectView: function (key) {
      const model = this.getView().getModel("reports");
      const views = model.getProperty("/views") || [];
      const index = Math.max(0, views.findIndex(function (view) { return view.key === key; }));
      const view = views[index];
      if (!view) {
        return;
      }
      model.setProperty("/selectedView", Object.assign({}, view, { groupLabel: VIEW_GROUP_LABEL[view.key] }));
      const item = this.byId("viewSummaryTable").getItems()[index];
      if (item) {
        this.byId("viewSummaryTable").setSelectedItem(item);
      }
    },

    onFailurePress: function (event) {
      this.navTo("requestDetail", { requestId: event.getSource().getBindingContext("reports").getProperty("requestId") });
    },

    // --- charts --------------------------------------------------------------------------------

    _vizClasses: async function () {
      await this._chartsReady;
      return new Promise(function (resolve) {
        sap.ui.require(["sap/viz/ui5/controls/VizFrame", "sap/viz/ui5/data/FlattenedDataset", "sap/viz/ui5/controls/common/feeds/FeedItem"],
          function (VizFrame, FlattenedDataset, FeedItem) { resolve({ VizFrame, FlattenedDataset, FeedItem }); });
      });
    },

    // The drill-down's three charts, created once; they follow the drill model.
    _renderDrillCharts: async function () {
      const drill = this.getView().getModel("drill");
      // Colours follow meaning, not data order; only the values present get a rule (and a legend entry).
      const donut = function (dimension, colors, rows, key) {
        const present = new Set(rows.map(function (row) { return row[key]; }));
        return { legendGroup: { layout: { position: "bottom" } }, plotArea: { dataLabel: { visible: true }, dataPointStyle: {
          rules: Object.keys(colors).filter(function (value) { return present.has(value); }).map(function (value) {
            const context = {};
            context[dimension] = value;
            return { dataContext: context, properties: { color: colors[value] }, displayName: value };
          })
        } } };
      };
      const statusColors = { Approved: "#188918", "In progress": "#e9730c", "Sent back": "#c87b00", Submitted: "#0a6ed1", Rejected: "#d32030" };
      const slaColors = { "Within SLA": "#188918", Breached: "#d32030" };
      if (this._drillCharts) {
        this._drillCharts[0].setVizProperties(donut("Status", statusColors, drill.getProperty("/statusChart"), "status"));
        this._drillCharts[1].setVizProperties(donut("SLA", slaColors, drill.getProperty("/slaChart"), "label"));
        return;
      }
      const classes = await this._vizClasses();
      const legend = { legendGroup: { layout: { position: "bottom" } } };
      this._drillCharts = [
        ["drillStatusChartHost", this._chart(classes, "donut", donut("Status", statusColors, drill.getProperty("/statusChart"), "status"),
          [["size", "Measure", ["Requests"]], ["color", "Dimension", ["Status"]]],
          { dimensions: [{ name: "Status", value: "{status}" }], measures: [{ name: "Requests", value: "{count}" }], data: { path: "/statusChart" } }, "drill")],
        ["drillSlaChartHost", this._chart(classes, "donut", donut("SLA", slaColors, drill.getProperty("/slaChart"), "label"),
          [["size", "Measure", ["Requests"]], ["color", "Dimension", ["SLA"]]],
          { dimensions: [{ name: "SLA", value: "{label}" }], measures: [{ name: "Requests", value: "{count}" }], data: { path: "/slaChart" } }, "drill")],
        ["drillStepChartHost", this._chart(classes, "stacked_bar", Object.assign({
          plotArea: { dataLabel: { visible: false }, colorPalette: ["#188918", "#e9730c", "#d32030"], dataPointSize: { min: 6, max: 26 } }
        }, legend), [["valueAxis", "Measure", ["Approved", "Open", "Rejected"]], ["categoryAxis", "Dimension", ["Step"]]],
        { dimensions: [{ name: "Step", value: "{step}" }],
          measures: [{ name: "Approved", value: "{approved}" }, { name: "Open", value: "{open}" }, { name: "Rejected", value: "{rejected}" }],
          data: { path: "/stepChart" } }, "drill")]
      ].map(function (entry) {
        entry[1].setHeight("17rem");
        this.byId(entry[0]).addItem(entry[1]);
        return entry[1];
      }.bind(this));
    },

    _renderCharts: async function () {
      const classes = await this._vizClasses();
      const model = this.getView().getModel("reports");
      model.setProperty("/trendChart", (model.getProperty("/trend") || []).map(function (row) {
        return Object.assign({}, row, { monthLabel: monthName(row.month, "axis"), slaValue: row.slaPercent === null ? null : row.slaPercent / 100 });
      }));
      model.setProperty("/groupChart", (model.getProperty("/divisionBreakdown") || []).map(function (row) {
        return { group: row.label, value: (row.slaPercent || 0) / 100 };
      }));
      if (!this._trendChart) {
        this._trendChart = this._chart(classes, "dual_stacked_combination", {
          plotArea: {
            dataShape: { primaryAxis: ["bar", "bar", "bar"], secondaryAxis: ["line"] },
            dataPointSize: { min: 8, max: 48 },
            primaryValuesColorPalette: ["#188918", "#d32030", "#e9730c"],
            secondaryValuesColorPalette: ["#0a6ed1"]
          },
          valueAxis2: { title: { visible: false }, label: { formatString: "0%" } }
        }, [["valueAxis", "Measure", ["Approved", "Rejected", "Pending"]], ["valueAxis2", "Measure", ["SLA compliance"]], ["categoryAxis", "Dimension", ["Month"]]],
        { dimensions: [{ name: "Month", value: "{monthLabel}" }],
          measures: [{ name: "Approved", value: "{approved}" }, { name: "Rejected", value: "{rejected}" }, { name: "Pending", value: "{pending}" },
            { name: "SLA compliance", value: "{slaValue}" }],
          data: { path: "/trendChart" } });
        this.byId("trendChartHost").addItem(this._trendChart);
      }
      if (!this._groupChart) {
        this._groupChart = this._chart(classes, "bar", {
          legend: { visible: false },
          plotArea: { dataLabel: { visible: true, formatString: "0.0%" }, dataPointSize: { min: 6, max: 26 }, colorPalette: ["#0a6ed1"] },
          valueAxis: { title: { visible: false }, label: { formatString: "0%" } }
        }, [["valueAxis", "Measure", ["SLA %"]], ["categoryAxis", "Dimension", ["Group"]]],
        { dimensions: [{ name: "Group", value: "{group}" }], measures: [{ name: "SLA %", value: "{value}" }], data: { path: "/groupChart" } });
        this.byId("groupChartHost").addItem(this._groupChart);
      }
    },

    _chart: function (classes, vizType, properties, feeds, dataset, modelName) {
      const chart = new classes.VizFrame({ width: "100%", height: "21rem", vizType, uiConfig: { applicationSet: "fiori" } });
      chart.setVizProperties(Object.assign({
        title: { visible: false },
        legendGroup: { layout: { position: "bottom" } },
        interaction: { selectability: { mode: "NONE" } },
        valueAxis: { title: { visible: false } },
        categoryAxis: { title: { visible: false } }
      }, properties));
      feeds.forEach(function (feed) {
        chart.addFeed(new classes.FeedItem({ uid: feed[0], type: feed[1], values: feed[2] }));
      });
      chart.setModel(this.getView().getModel(modelName || "reports"));
      chart.setDataset(new classes.FlattenedDataset(dataset));
      return chart;
    },

    // --- export --------------------------------------------------------------------------------

    // The PDF of the dashboard on screen; All reports offers both (onExportLifecycle, onExportSpend).
    onExport: function () {
      return this.getView().getModel("reports").getProperty("/selectedDashboard") === "SPEND_ANALYSIS"
        ? this.onExportSpend() : this.onExportLifecycle();
    },

    // PO Lifecycle as a PDF, built on the server (exportPoLifecycleDashboardPdf) with the two
    // charts as the browser rendered them.
    onExportLifecycle: function () {
      return this._exportPdf("exportPoLifecycleDashboardPdf",
        [this._snapshot(this._trendChart, "trend", "Monthly trend"), this._snapshot(this._groupChart, "groups", "SLA % by group")]);
    },

    // Spend Analysis as a PDF (exportSpendAnalysisDashboardPdf), with its two charts.
    onExportSpend: function () {
      return this._exportPdf("exportSpendAnalysisDashboardPdf",
        [this._snapshot(this._spendTopChart, "spendTop", "Top 10 suppliers"), this._snapshot(this._spendYoyChart, "spendYoy", "YoY analysis")]);
    },

    _snapshot: function (chart, chartKey, title) {
      const dom = chart && chart.getDomRef();
      if (!dom) return null;
      const size = dom.getBoundingClientRect();
      return { chartKey, title, svg: chart.exportToSVGString({ width: Math.max(700, Math.round(size.width)), height: Math.max(360, Math.round(size.height)) }) };
    },

    _exportPdf: async function (action, charts) {
      const model = this.getView().getModel("reports");
      model.setProperty("/loading", true);
      try {
        const result = await this.request(action, {
          method: "POST",
          body: {
            periodStart: model.getProperty("/period/start"),
            periodEnd: model.getProperty("/period/end"),
            poType: model.getProperty("/poType"),
            charts: charts.filter(Boolean)
          }
        });
        this._downloadPdf(result);
      } catch (error) {
        this.showError(error);
      } finally {
        model.setProperty("/loading", false);
      }
    },

    _downloadPdf: function (file) {
      const binary = window.atob(String(file.content || ""));
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
      }
      const url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType || "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = file.fileName || "po-lifecycle.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    },

    // --- navigation ----------------------------------------------------------------------------

    onDashboard: function () { this.navTo("dashboard"); },
    // Header icons, as on the dashboard.
    onAllRequests: function () { this.navTo("allRequests"); },
    onTasks: function () { this.navTo("tasks", { "?query": { mode: "mine" } }); },
    onAdmin: function () { this.navTo("admin"); },

    // --- formatters ----------------------------------------------------------------------------

    titleWithPeriod: function (title, period) { return `${title} - ${periodLabel(period)}`; },
    daysText: function (value) { return value === null || value === undefined ? "—" : `${Number(value).toFixed(1)} days`; },
    percent: function (value) {
      return value === null || value === undefined ? "—" : `${Number(value).toFixed(1)}%`;
    },
    days: function (value) {
      return value === null || value === undefined ? "—" : Number(value).toFixed(1);
    },
    statusState: function (status) { return STATUS_STATE[status] || "None"; },
    requestStatusText: function (status) { return (REQUEST_STATUS[status] || [status])[0]; },
    requestStatusState: function (status) { return (REQUEST_STATUS[status] || [null, "None"])[1]; },
    taskStatusText: function (status) { return TASK_STATUS[status] || status; },
    taskStatusState: function (status, breached) {
      if (status === "APPROVED") return "Success";
      if (status === "REJECTED") return "Error";
      return breached ? "Error" : "Warning";
    },
    daysOfTarget: function (elapsed, target) {
      return elapsed === null || elapsed === undefined ? "—" : `${Number(elapsed).toFixed(1)} / ${target} days`;
    },
    dateTime: function (value) {
      return value ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
        .format(new Date(value)) : "—";
    },
    statusText: function (status) { return STATUS_TEXT[status] || ""; },
    // Spend Analysis: "1,650.00" (LKR Mn), "LKR 1,650.00 Mn", "15.5%", "+8.0%", trend icon/state.
    lkrMillions: function (value) { return value === null || value === undefined ? "" : millions(value); },
    // KPI tile values are short ("6,900", "+92.6"); the tile's scale shows "Mn" or "%".
    tileMillions: function (value) { return Math.round((Number(value) || 0) / MILLION).toLocaleString("en-US"); },
    tileVariance: function (value) {
      return value === null || value === undefined ? "—" : `${value > 0 ? "+" : ""}${Number(value).toFixed(1)}`;
    },
    amountText: function (value) {
      return value === null || value === undefined ? "" : Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    shareText: function (value) { return value === null || value === undefined ? "—" : `${Number(value).toFixed(1)}%`; },
    shareValue: function (value) { return Math.max(0, Math.min(100, Number(value) || 0)); },
    varianceText: function (value) {
      return value === null || value === undefined ? "—" : `${value > 0 ? "+" : ""}${Number(value).toFixed(1)}%`;
    },
    varianceState: function (value) {
      return value === null || value === undefined ? "None" : (value >= 0 ? "Success" : "Error");
    },
    trendIcon: function (trend) { return trend === "DOWN" ? "sap-icon://trend-down" : "sap-icon://trend-up"; },
    trendColor: function (trend) { return trend === "DOWN" ? "Negative" : "Positive"; },
    periodText: function (period) { return periodLabel(period); },
    dayText: function (key) { return key ? periodLabel({ start: key, end: key }).split(" - ")[0] : ""; },
    yearsText: function (current, previous) { return current && previous ? `${current} vs ${previous}` : ""; },
    otherCurrencyText: function (template, count) { return String(template || "").replace("{0}", count || 0); },
    failState: function (status) { return (FAIL[status] || {}).state || "None"; },
    failText: function (status) { return (FAIL[status] || {}).text || ""; }
  });
});
