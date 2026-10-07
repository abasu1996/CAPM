sap.ui.define([
  "flowmateca/controller/BaseController",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox"
], function (BaseController, JSONModel, MessageBox) {
  "use strict";

  return BaseController.extend("flowmateca.controller.TaskDetail", {
    onInit: function () {
      this.getView().setModel(new JSONModel({}), "task");
      this.getView().setModel(new JSONModel({}), "decision");
      this.getView().setModel(new JSONModel({}), "sendBack");
      this.getRouter().getRoute("taskDetail").attachPatternMatched(this._onRouteMatched, this);
    },

    _onRouteMatched: function (event) {
      this._taskId = event.getParameter("arguments").taskId;
      this.onRefresh();
    },

    onRefresh: async function () {
      this.setBusy(true);
      try {
        const requestExpand = [
          "status",
          "requestType",
          "requestVariant",
          this.detailExpandClause()
        ].join(",");
        const task = await this.request(
          `Tasks(${this._taskId})?$expand=status,request($expand=${requestExpand})`
        );
        const user = this.getAppModel().getProperty("/currentUser") || await this.loadCurrentUser();
        const processableStatus = ["OPEN", "SENT_BACK"].includes(task.status?.code);
        task.canClaim = processableStatus && Boolean(task.assignedTeam_ID) && !task.assignedUser_ID;
        task.canProcess = processableStatus && task.assignedUser_ID === user?.ID;
        task.canSendBack = task.canProcess && task.stepNo > 1;

        const request = task.request || {};
        const details = request[this.detailNavigationFor(request.requestType?.code)] || {};
        task.detailFields = this.buildDetailFields(request, details);
        task.detailItems = details.items || [];
        task.hasDetailItems = task.detailItems.length > 0;
        task.hasDetailFields = task.detailFields.length > 0;

        this.getView().getModel("task").setData(task);
        this.renderDetailItemsTable(
          this.byId("taskItemsTable"),
          request,
          details,
          "task",
          "task>/detailItems"
        );
      } catch (error) {
        this.showError(error);
      } finally {
        this.setBusy(false);
      }
    },

    onClaim: async function () {
      this.setBusy(true);
      try {
        await this.request("claimTeamTask", {
          method: "POST",
          body: {
            taskId: this._taskId
          }
        });
        this.showSuccess("Task assigned to you");
        await this.onRefresh();
      } catch (error) {
        this.showError(error);
      } finally {
        this.setBusy(false);
      }
    },

    onApprove: function () {
      this.getView().getModel("decision").setData({
        title: "Approve Task",
        action: "approve",
        remarks: ""
      });
      this.byId("decisionDialog").open();
    },

    onReject: function () {
      this.getView().getModel("decision").setData({
        title: "Reject Request",
        action: "reject",
        remarks: ""
      });
      this.byId("decisionDialog").open();
    },

    onConfirmDecision: async function () {
      const decision = this.getView().getModel("decision").getData();
      const rejecting = decision.action === "reject";
      if (rejecting && !String(decision.remarks || "").trim()) {
        MessageBox.warning("A reason is required to reject a request.");
        return;
      }
      this.setBusy(true);
      try {
        await this.request(rejecting ? "rejectTask" : "approveTask", {
          method: "POST",
          body: {
            taskId: this._taskId,
            remarks: decision.remarks
          }
        });
        this.byId("decisionDialog").close();
        this.showSuccess(rejecting ? "Request rejected" : "Task approved");
        await this.onRefresh();
      } catch (error) {
        this.showError(error);
      } finally {
        this.setBusy(false);
      }
    },

    onCloseDecision: function () {
      this.byId("decisionDialog").close();
    },

    onOpenSendBack: async function () {
      const task = this.getView().getModel("task").getData();
      try {
        const result = await this.request(
          `RequestSteps?$filter=request_ID eq ${task.request.ID} and stepNo lt ${task.stepNo} and stepNo gt 1&$orderby=stepNo`
        );
        this.getView().getModel("sendBack").setData({
          targetStepNo: "",
          remarks: "",
          steps: result.value || []
        });
        this.byId("sendBackDialog").open();
      } catch (error) {
        this.showError(error);
      }
    },

    onConfirmSendBack: async function () {
      const data = this.getView().getModel("sendBack").getData();
      if (!data.targetStepNo || !data.remarks.trim()) {
        MessageBox.warning("Target step and reason are required.");
        return;
      }
      this.setBusy(true);
      try {
        await this.request("sendBackTask", {
          method: "POST",
          body: {
            taskId: this._taskId,
            targetStepNo: Number(data.targetStepNo),
            remarks: data.remarks
          }
        });
        this.byId("sendBackDialog").close();
        this.showSuccess("Task sent back");
        await this.onRefresh();
      } catch (error) {
        this.showError(error);
      } finally {
        this.setBusy(false);
      }
    },

    onCloseSendBack: function () {
      this.byId("sendBackDialog").close();
    },

    onRequestPress: function () {
      const task = this.getView().getModel("task").getData();
      this.navTo("requestDetail", {
        requestId: task.request.ID
      });
    },

    onClose: function () {
      window.history.length > 1 ? window.history.back() : this.navTo("tasks", {
        "?query": {
          mode: "mine"
        }
      }, true);
    }
  });
});
