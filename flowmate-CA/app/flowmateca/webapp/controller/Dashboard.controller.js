sap.ui.define([
  "flowmateca/controller/BaseController",
  "flowmateca/model/ListModel"
], function (BaseController, ListModel) {
  "use strict";

  return BaseController.extend("flowmateca.controller.Dashboard", {
    onInit: function () {
      this.getView().setModel(new ListModel({
        allRequests: 0,
        allTasks: 0,
        myRequests: 0,
        myDrafts: 0,
        myOpenTasks: 0,
        myTeamTasks: 0,
        sentBackRequests: 0,
        rejectedRequests: 0,
        pendingApproval: 0,
        completedRequests: 0,
        reportingRequests: 0
      }), "dashboard");
      this.getRouter().getRoute("dashboard").attachPatternMatched(this.onRefresh, this);
    },

    onRefresh: async function () {
      this.setBusy(true);
      try {
        const counts = await this.request("getDashboardCounts()");
        counts.reportingRequests = counts.allRequests || 0;
        this.getView().getModel("dashboard").setData(counts);
        this.getView().getModel().refresh();
      } catch (error) {
        this.showError(error);
      } finally {
        this.setBusy(false);
      }
    },

    onCreateRequest: function () {
      this.navTo("requestCreate");
    },

    onProcessPress: function (event) {
      const context = event.getSource().getBindingContext();
      this.navTo("requestCreate", {
        "?query": {
          requestType: context.getProperty("code")
        }
      });
    },

    onRequests: function () {
      this.onMyRequests();
    },

    onMyRequests: function () {
      this.navTo("requests", {
        "?query": {
          mode: "mine"
        }
      });
    },

    onDrafts: function () {
      this.navTo("drafts");
    },

    onAllRequests: function () {
      this.navTo("allRequests");
    },

    onAllTasks: function () {
      this.navTo("tasks", {
        "?query": {
          mode: "all"
        }
      });
    },

    onReports: function () {
      this.navTo("reports");
    },

    onSentBack: function () {
      this.navTo("tasks", {
        "?query": {
          mode: "all",
          requestStatus: "SENT_BACK",
          status: "OPEN"
        }
      });
    },

    onRejected: function () {
      this.navTo("requests", {
        "?query": {
          mode: "mine",
          status: "REJECTED"
        }
      });
    },

    onCompleted: function () {
      this.navTo("requests", {
        "?query": {
          mode: "mine",
          status: "COMPLETED"
        }
      });
    },

    onTasks: function () {
      this.onMyTasks();
    },

    onMyTasks: function () {
      this.navTo("tasks", {
        "?query": {
          mode: "mine"
        }
      });
    },

    onTeamTasks: function () {
      this.navTo("tasks", {
        "?query": {
          mode: "team"
        }
      });
    },

    onPendingApproval: function () {
      this.navTo("tasks", {
        "?query": {
          mode: "mine",
          approval: "true"
        }
      });
    },

    onAdmin: function () {
      this.navTo("admin");
    },

    onDelegations: function () {
      this.navTo("delegations");
    }
  });
});
