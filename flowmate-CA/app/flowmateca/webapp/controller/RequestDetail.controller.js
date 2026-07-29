sap.ui.define([
  "flowmateca/controller/BaseController",
  "flowmateca/model/FormDefinitions",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox"
], function (BaseController, FormDefinitions, JSONModel, MessageBox) {
  "use strict";

  const DETAIL_NAVIGATION = {
    MATERIAL_CODE: "materialCode",
    SERVICE_CODE: "serviceCode",
    EQUIPMENT_CODE: "equipmentCode",
    PROJECT_CODE: "projectCode",
    MATERIAL_RESERVATION: "materialReservation",
    OUTLINE_CONTRACT: "outlineContract",
    PURCHASE_ORDER: "purchaseOrder",
    SERVICE_ENTRY_SHEET: "serviceEntrySheet"
  };

  return BaseController.extend("flowmateca.controller.RequestDetail", {
    onInit: function () {
      this.getView().setModel(new JSONModel({}), "detail");
      this.getView().setModel(new JSONModel({}), "step");
      this.getView().setModel(new JSONModel({}), "taskForm");
      this.getView().setModel(new JSONModel({}), "successor");
      this.getView().setModel(new JSONModel({}), "catalog");
      this.getRouter().getRoute("requestDetail").attachPatternMatched(this._onRouteMatched, this);
    },

    _onRouteMatched: function (event) {
      this._requestId = event.getParameter("arguments").requestId;
      this.onRefresh();
    },

    onRefresh: async function () {
      this.setBusy(true);
      try {
        const expand = [
          "requestType",
          "requestVariant",
          "status",
          "priority",
          "predecessor($select=ID,referenceNumber,title)",
          "successors($select=ID,referenceNumber,title)",
          "stepInstances",
          "tasks($expand=status)",
          "attachments",
          "comments",
          "involvedParties",
          "history",
          "materialCode",
          "serviceCode",
          "equipmentCode",
          "projectCode",
          "materialReservation",
          "outlineContract",
          "purchaseOrder",
          "serviceEntrySheet"
        ].join(",");
        const request = await this.request(`Requests(${this._requestId})?$expand=${expand}`);
        this._prepareDetail(request);
        this.getView().getModel("detail").setData(request);
      } catch (error) {
        this.showError(error);
      } finally {
        this.setBusy(false);
      }
    },

    _prepareDetail: function (request) {
      request.stepInstances = (request.stepInstances || []).sort(function (left, right) {
        return left.stepNo - right.stepNo;
      });
      request.tasks = (request.tasks || []).sort(function (left, right) {
        return left.stepNo - right.stepNo;
      });
      request.history = (request.history || []).sort(function (left, right) {
        return new Date(right.createdAt) - new Date(left.createdAt);
      });
      request.attachments = request.attachments || [];
      request.comments = request.comments || [];
      request.successors = request.successors || [];
      request.tasks.count = request.tasks.length;
      request.attachments.count = request.attachments.length;
      request.comments.count = request.comments.length;
      request.history.count = request.history.length;

      const currentTasks = request.tasks.filter(function (task) {
        return task.stepNo === request.currentStep;
      });
      const blockingTask = currentTasks.some(function (task) {
        return task.isMandatory && task.status?.code !== "APPROVED";
      });
      const currentUser = this.getAppModel().getProperty("/currentUser") || {};
      const isOwner = request.owner_ID === currentUser.ID || request.requester_ID === currentUser.ID;
      request.canCompleteCurrentStep = !["COMPLETED", "REJECTED"].includes(request.status?.code)
        && !blockingTask
        && (isOwner || currentUser.isAdmin);
      request.processStatusText = request.status?.code === "COMPLETED"
        ? "Workflow completed"
        : `Step ${request.currentStep} of ${request.stepInstances.length}`;
      request.detailFields = this._detailFields(request);
    },

    _detailFields: function (request) {
      const navigation = DETAIL_NAVIGATION[request.requestType?.code];
      const details = request[navigation] || {};
      const definitions = FormDefinitions.getFields(request.requestVariant?.code);
      return definitions.map(function (definition) {
        let value = details[definition.name];
        if (typeof value === "boolean") {
          value = value ? "Yes" : "No";
        }
        return {
          label: definition.label,
          value: value === null || value === undefined || value === "" ? "Not provided" : String(value)
        };
      });
    },

    onStepPress: function (event) {
      const step = event.getSource().getBindingContext("detail").getObject();
      this.getView().getModel("step").setData(step);
      this.byId("stepDialog").open();
    },

    onCloseStepDialog: function () {
      this.byId("stepDialog").close();
    },

    onCompleteCurrentStep: async function () {
      const request = this.getView().getModel("detail").getData();
      const confirmed = await new Promise(function (resolve) {
        MessageBox.confirm(`Complete step ${request.currentStep}?`, {
          onClose: function (action) {
            resolve(action === MessageBox.Action.OK);
          }
        });
      });
      if (!confirmed) {
        return;
      }
      this.setBusy(true);
      try {
        await this.request("completeStep", {
          method: "POST",
          body: {
            requestId: request.ID,
            stepNo: request.currentStep,
            remarks: "Completed from the guided process"
          }
        });
        this.showSuccess("Step completed");
        await this.onRefresh();
      } catch (error) {
        this.showError(error);
      } finally {
        this.setBusy(false);
      }
    },

    onOpenAddTaskDialog: async function () {
      const request = this.getView().getModel("detail").getData();
      this.getView().getModel("taskForm").setData({
        stepNo: request.currentStep,
        taskName: "",
        description: "",
        assignedUserId: "",
        assignedTeamId: "",
        isMandatory: false,
        isApproval: false,
        dueDate: ""
      });
      await this._loadTaskCatalog();
      this.byId("addTaskDialog").open();
    },

    _loadTaskCatalog: async function () {
      const catalog = this.getView().getModel("catalog");
      if (catalog.getProperty("/Users")) {
        return;
      }
      const [users, teams, requestTypes] = await Promise.all([
        this.request("Users?$filter=isActive eq true&$orderby=displayName"),
        this.request("Teams?$filter=isActive eq true&$orderby=name"),
        this.request("RequestTypes?$filter=isActive eq true&$orderby=sortOrder")
      ]);
      catalog.setProperty("/Users", users.value || []);
      catalog.setProperty("/Teams", teams.value || []);
      catalog.setProperty("/RequestTypes", requestTypes.value || []);
    },

    onAddTask: async function () {
      const form = this.getView().getModel("taskForm").getData();
      if (!form.stepNo || !form.taskName.trim()) {
        MessageBox.warning("Workflow step and task name are required.");
        return;
      }
      if (!form.assignedUserId && !form.assignedTeamId) {
        MessageBox.warning("Assign the task to a user or a team.");
        return;
      }
      this.setBusy(true);
      try {
        await this.request("addTask", {
          method: "POST",
          body: {
            requestId: this._requestId,
            stepNo: Number(form.stepNo),
            taskName: form.taskName,
            description: form.description,
            assignedUserId: form.assignedUserId || null,
            assignedTeamId: form.assignedTeamId || null,
            isMandatory: form.isMandatory,
            isApproval: form.isApproval,
            dueDate: form.dueDate || null
          }
        });
        this.byId("addTaskDialog").close();
        this.showSuccess("Task added");
        await this.onRefresh();
      } catch (error) {
        this.showError(error);
      } finally {
        this.setBusy(false);
      }
    },

    onCloseAddTaskDialog: function () {
      this.byId("addTaskDialog").close();
    },

    onTaskPress: function (event) {
      const task = event.getParameter("listItem").getBindingContext("detail").getObject();
      this.navTo("taskDetail", {
        taskId: task.ID
      });
    },

    onDetailFilesSelected: function (event) {
      const files = Array.from(event.getParameter("files") || []);
      if (!files.length) {
        return;
      }
      this._uploadFiles(files);
    },

    _uploadFiles: async function (files) {
      this.setBusy(true);
      try {
        for (const file of files) {
          const attachment = await this.request("Attachments", {
            method: "POST",
            body: {
              request_ID: this._requestId,
              filename: file.name,
              mediaType: file.type || "application/octet-stream",
              size: file.size,
              category: "SUPPORTING_DOCUMENT"
            }
          });
          const response = await fetch(`odata/v4/flowmate-ca/Attachments(${attachment.ID})/content`, {
            method: "PUT",
            headers: {
              "X-CSRF-Token": await this._csrfToken(),
              "Content-Type": file.type || "application/octet-stream"
            },
            body: file
          });
          if (!response.ok) {
            throw new Error(`Upload failed for ${file.name}`);
          }
        }
        this.showSuccess("Attachment upload complete");
        await this.onRefresh();
      } catch (error) {
        this.showError(error);
      } finally {
        this.setBusy(false);
      }
    },

    onAttachmentPress: function (event) {
      const attachment = event.getSource().getBindingContext("detail").getObject();
      window.open(`odata/v4/flowmate-ca/Attachments(${attachment.ID})/content`, "_blank", "noopener");
    },

    onAddComment: async function () {
      const textArea = this.byId("newComment");
      const comment = textArea.getValue().trim();
      if (!comment) {
        return;
      }
      try {
        await this.request("addComment", {
          method: "POST",
          body: {
            requestId: this._requestId,
            comment
          }
        });
        textArea.setValue("");
        await this.onRefresh();
      } catch (error) {
        this.showError(error);
      }
    },

    onRelatedRequestPress: function () {
      const predecessor = this.getView().getModel("detail").getProperty("/predecessor");
      this.navTo("requestDetail", {
        requestId: predecessor.ID
      });
    },

    onSuccessorPress: function (event) {
      const successor = event.getSource().getBindingContext("detail").getObject();
      this.navTo("requestDetail", {
        requestId: successor.ID
      });
    },

    onOpenSuccessorDialog: async function () {
      await this._loadTaskCatalog();
      const request = this.getView().getModel("detail").getData();
      this.getView().getModel("successor").setData({
        requestTypeCode: request.requestType.code === "PURCHASE_ORDER" ? "SERVICE_ENTRY_SHEET" : "",
        title: `Follow-up for ${request.referenceNumber}`
      });
      this.byId("successorDialog").open();
    },

    onCreateSuccessor: async function () {
      const form = this.getView().getModel("successor").getData();
      if (!form.requestTypeCode || !form.title.trim()) {
        MessageBox.warning("Request type and title are required.");
        return;
      }
      try {
        const successor = await this.request("createSuccessorRequest", {
          method: "POST",
          body: {
            requestId: this._requestId,
            requestTypeCode: form.requestTypeCode,
            title: form.title
          }
        });
        this.byId("successorDialog").close();
        this.navTo("requestDetail", {
          requestId: successor.ID
        });
      } catch (error) {
        this.showError(error);
      }
    },

    onCloseSuccessorDialog: function () {
      this.byId("successorDialog").close();
    },

    stepIcon: function (status) {
      return {
        COMPLETED: "sap-icon://accept",
        OPEN: "sap-icon://process",
        PENDING: "sap-icon://circle-task"
      }[status] || "sap-icon://circle-task";
    },

    stepButtonType: function (status) {
      return status === "OPEN" ? "Emphasized" : status === "COMPLETED" ? "Accept" : "Default";
    },

    stepState: function (status) {
      return status === "COMPLETED" ? "Success" : status === "OPEN" ? "Information" : "None";
    },

    onClose: function () {
      window.history.length > 1 ? window.history.back() : this.navTo("requests", {
        "?query": {
          mode: "mine"
        }
      }, true);
    }
  });
});
