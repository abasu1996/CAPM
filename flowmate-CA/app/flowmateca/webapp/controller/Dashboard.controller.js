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
      this.onAllRequests();
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

    onReports: function () {
      this.navTo("reports");
    },

    // Sent Back, Terminated, Completed, My Tasks and Pending Approval show the logged-in user's own
    // requests and tasks only (own=true), as their counts do (srv _getDashboardCounts).
    onSentBack: function () {
      this._ownRequests("SENT_BACK");
    },

    onRejected: function () {
      this._ownRequests("REJECTED");
    },

    onCompleted: function () {
      this._ownRequests("COMPLETED");
    },

    _ownRequests: function (status) {
      this.navTo("requests", {
        "?query": {
          mode: "mine",
          status,
          own: "true"
        }
      });
    },

    onTasks: function () {
      this.navTo("tasks", {
        "?query": {
          mode: "mine"
        }
      });
    },

    onMyTasks: function () {
      this.navTo("tasks", {
        "?query": {
          mode: "mine",
          status: "OPEN",
          own: "true"
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
          status: "OPEN",
          approval: "true",
          own: "true"
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
