sap.ui.define([
  "flowmateca/controller/BaseController",
  "sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
  "use strict";

  return BaseController.extend("flowmateca.controller.Tasks", {
    onInit: function () {
      this.getView().setModel(new JSONModel({ items: [] }), "tasks");
      this.getView().setModel(new JSONModel({
        mode: "mine",
        isTeamMode: false,
        title: "My Tasks"
      }), "taskView");
      this.getRouter().getRoute("tasks").attachPatternMatched(this._onRouteMatched, this);
    },

    _onRouteMatched: function (event) {
      const query = event.getParameter("arguments")["?query"] || {};
      const mode = query.mode === "team" ? "team" : "mine";
      const model = this.getView().getModel("taskView");
      model.setProperty("/mode", mode);
      model.setProperty("/isTeamMode", mode === "team");
      model.setProperty("/title", mode === "team" ? "Team Task Queue" : "My Tasks");
      this._approvalOnly = query.approval === "true";
      this.onRefresh();
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
        const entity = mode === "team" ? "MyTeamTasks" : "MyTasks";
        const filters = [];
        const search = this.byId("taskSearch").getValue().trim().toLowerCase();
        const status = this.byId("taskStatusFilter").getSelectedKey();

        if (search) {
          const safeSearch = search.replace(/'/g, "''");
          filters.push(`(contains(tolower(taskName),'${safeSearch}') or contains(tolower(referenceNumber),'${safeSearch}') or contains(tolower(request/referenceNumber),'${safeSearch}') or contains(tolower(request/title),'${safeSearch}'))`);
        }
        if (status) {
          filters.push(`status_code eq '${status}'`);
        }
        if (this._approvalOnly) {
          filters.push("isApproval eq true");
        }

        const filterQuery = filters.length ? `&$filter=${encodeURIComponent(filters.join(" and "))}` : "";
        const result = await this.request(
          `${entity}?$expand=request,status&$orderby=createdAt desc${filterQuery}`
        );
        this.getView().getModel("tasks").setProperty("/items", result.value || []);
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

    onClearFilters: function () {
      this.byId("taskSearch").setValue("");
      this.byId("taskStatusFilter").setSelectedKey("");
      this._approvalOnly = false;
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
