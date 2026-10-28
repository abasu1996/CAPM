sap.ui.define([
  "flowmateca/controller/BaseController",
  "flowmateca/model/ListModel",
  "flowmateca/model/sortRows"
], function (BaseController, ListModel, sortRows) {
  "use strict";

  return BaseController.extend("flowmateca.controller.Tasks", {
    onInit: function () {
      this.getView().setModel(new ListModel({ items: [] }), "tasks");
      this.getView().setModel(new ListModel({ requestTypes: [] }), "catalog");
      // Sort by SLA Due: "asc" = earliest first (most urgent on top), tasks without a date last.
      this.getView().setModel(new ListModel({ key: "asc" }), "sortView");
      this.getView().setModel(new ListModel({
        mode: "mine",
        isTeamMode: false,
        isAllMode: false,
        showScopeFilters: false,
        title: "My Tasks"
      }), "taskView");
      this.getRouter().getRoute("tasks").attachPatternMatched(this._onRouteMatched, this);
    },

    _onRouteMatched: function (event) {
      const query = event.getParameter("arguments")["?query"] || {};
      const mode = ["all", "team"].includes(query.mode) ? query.mode : "mine";
      const model = this.getView().getModel("taskView");
      model.setProperty("/mode", mode);
      model.setProperty("/isTeamMode", mode === "team");
      model.setProperty("/isAllMode", mode === "all");
      model.setProperty("/showScopeFilters", mode !== "mine");
      model.setProperty("/title", mode === "all" ? "All Tasks" : (mode === "team" ? "Team Task Queue" : "My Tasks"));
      this._approvalOnly = query.approval === "true";
      this._requestStatus = query.requestStatus || "";
      this._presetStatus = query.status || "";
      this.byId("taskStatusFilter").setSelectedKey(this._presetStatus);
      this.getView().getModel("sortView").setProperty("/key", "asc");
      // Request type / requester filters belong to shared task catalogues; never let them apply hidden.
      if (mode === "mine") {
        this.byId("taskTypeFilter").setSelectedKey("");
        this.byId("taskRequesterFilter").setValue("");
      } else {
        this._loadRequestTypes();
      }
      this.onRefresh();
    },

    _loadRequestTypes: async function () {
      if (this._requestTypesLoaded) {
        return;
      }
      try {
        const types = await this.request("RequestTypes?$filter=isActive eq true&$orderby=sortOrder");
        this.getView().getModel("catalog").setProperty("/requestTypes", types.value || []);
        this._requestTypesLoaded = true;
      } catch (error) {
        this.showError(error);
      }
    },

    onModeChange: function (event) {
      const mode = event.getParameter("item").getKey();
      this.navTo("tasks", {
        "?query": {
          mode
        }
      }, true);
    },

    onRefresh: async function () {
      this.setBusy(true);
      try {
        const mode = this.getView().getModel("taskView").getProperty("/mode");
        const entity = mode === "all" ? "Tasks" : (mode === "team" ? "MyTeamTasks" : "MyTasks");
        const filters = [];
        const search = this.byId("taskSearch").getValue().trim().toLowerCase();
        const status = this.byId("taskStatusFilter").getSelectedKey();
        const type = mode !== "mine" ? this.byId("taskTypeFilter").getSelectedKey() : "";
        const requester = mode !== "mine" ? this.byId("taskRequesterFilter").getValue().trim().toLowerCase() : "";

        if (search) {
          const safeSearch = search.replace(/'/g, "''");
          filters.push(`(contains(tolower(taskName),'${safeSearch}') or contains(tolower(referenceNumber),'${safeSearch}') or contains(tolower(request/referenceNumber),'${safeSearch}') or contains(tolower(request/title),'${safeSearch}'))`);
        }
        if (status) {
          filters.push(`status_code eq '${status}'`);
        }
        if (type) {
          filters.push(`request/requestType_code eq '${type}'`);
        }
        if (requester) {
          filters.push(`contains(tolower(request/requesterName),'${requester.replace(/'/g, "''")}')`);
        }
        if (this._approvalOnly) {
          filters.push("isApproval eq true");
        }
        if (this._requestStatus) {
          filters.push(`request/status_code eq '${String(this._requestStatus).replace(/'/g, "''")}'`);
        }

        const filterQuery = filters.length ? `&$filter=${encodeURIComponent(filters.join(" and "))}` : "";
        const result = await this.request(
          `${entity}?$expand=request($expand=requestType),status&$orderby=createdAt desc${filterQuery}`
        );
        this.getView().getModel("tasks").setProperty("/items", this._sorted(result.value || []));
      } catch (error) {
        this.showError(error);
      } finally {
        this.setBusy(false);
      }
    },

    _sorted: function (rows) {
      const descending = this.getView().getModel("sortView").getProperty("/key") === "desc";
      return sortRows.sortRows(rows, sortRows.slaDueKey, descending);
    },

    // Re-sorts the tasks already loaded; no new request.
    onSortChange: function () {
      const model = this.getView().getModel("tasks");
      model.setProperty("/items", this._sorted(model.getProperty("/items") || []));
    },

    // Approved On: the approval date and time of an approved task, blank otherwise.
    formatApprovedOn: function (completedAt, statusCode) {
      return statusCode === "APPROVED" && completedAt ? this.formatDateTimeShort(completedAt) : "";
    },

    formatApprovedOnFull: function (completedAt, statusCode) {
      return statusCode === "APPROVED" && completedAt ? this.formatDateTime(completedAt) : "";
    },

    onFilterChange: function () {
      clearTimeout(this._filterTimer);
      this._filterTimer = setTimeout(this.onRefresh.bind(this), 250);
    },

    // Exports the tasks the list shows (its filters included).
    onExportExcel: function () {
      const view = this.getView().getModel("taskView").getData();
      return this.exportToExcel(this._approvalOnly ? "Pending Approval" : (view.title || "Tasks"), [
        { label: "Task ID", value: (t) => t.referenceNumber },
        { label: "Request ID", value: (t) => t.request && t.request.referenceNumber },
        { label: "Request Type", value: (t) => t.request && t.request.requestType && t.request.requestType.name },
        { label: "Requester", value: (t) => t.request && t.request.requesterName },
        { label: "Task", value: (t) => t.taskName },
        { label: "Title", value: (t) => t.request && t.request.title },
        { label: "Step", value: (t) => t.stepNo },
        { label: "Status", value: (t) => t.status && this.statusName(t.status.name, t.status.code) },
        { label: "SLA", value: (t) => this.formatSlaText(t.slaDueAt, t.status && t.status.code, t.slaBreached) },
        { label: "SLA Due", value: (t) => this.formatDateTime(t.slaDueAt) || this.formatDate(t.dueDate) },
        { label: "Assigned To", value: (t) => t.assignedName || t.assignedTeamName },
        { label: view.isTeamMode ? "Received On" : "Assigned On", value: (t) => this.formatDateTime(t.createdAt) }
      ], this.getView().getModel("tasks").getProperty("/items") || []).catch(this.showError.bind(this));
    },

    onClearFilters: function () {
      this.byId("taskSearch").setValue("");
      this.byId("taskStatusFilter").setSelectedKey("");
      this.byId("taskTypeFilter").setSelectedKey("");
      this.byId("taskRequesterFilter").setValue("");
      this.getView().getModel("sortView").setProperty("/key", "asc");
      this._approvalOnly = false;
      this._requestStatus = "";
      this._presetStatus = "";
      this.onRefresh();
    },

    onItemPress: function (event) {
      const task = event.getParameter("listItem").getBindingContext("tasks").getObject();
      this.navTo("taskDetail", {
        taskId: task.ID
      });
    },

    onRequestLinkPress: function (event) {
      event.cancelBubble();
      const task = event.getSource().getBindingContext("tasks").getObject();
      this.navTo("requestDetail", {
        requestId: task.request.ID
      });
    },

    onClaimTask: async function (event) {
      event.cancelBubble();
      const task = event.getSource().getBindingContext("tasks").getObject();
      this.setBusy(true);
      try {
        await this.request("claimTeamTask", {
          method: "POST",
          body: {
            taskId: task.ID
          }
        });
        this.showSuccess("Task assigned to you");
        await this.onRefresh();
      } catch (error) {
        this.showError(error);
      } finally {
        this.setBusy(false);
      }
    }
  });
});
