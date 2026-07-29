sap.ui.define([
  "flowmateca/controller/BaseController",
  "sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
  "use strict";

  return BaseController.extend("flowmateca.controller.Dashboard", {
    onInit: function () {
      this.getView().setModel(new JSONModel({
        myRequests: 0,
        myOpenTasks: 0,
        myTeamTasks: 0,
        sentBackRequests: 0,
        pendingApproval: 0,
        completedRequests: 0
      }), "dashboard");
      this.getRouter().getRoute("dashboard").attachPatternMatched(this.onRefresh, this);
    },

    onRefresh: async function () {
      this.setBusy(true);
      try {
        const counts = await this.request("getDashboardCounts()");
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

    onSentBack: function () {
      this.navTo("requests", {
        "?query": {
          mode: "mine",
          status: "SENT_BACK"
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
    }
  });
});
