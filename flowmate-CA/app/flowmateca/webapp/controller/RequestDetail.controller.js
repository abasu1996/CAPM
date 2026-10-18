sap.ui.define([
  "flowmateca/controller/BaseController",
  "flowmateca/model/FormDefinitions",
  "flowmateca/model/versionTable",
  "flowmateca/model/ListModel",
  "sap/m/MessageBox",
  "sap/m/Column",
  "sap/m/ColumnListItem",
  "sap/m/Text",
  "sap/m/VBox",
  "sap/ui/core/CustomData",
  "sap/base/Log"
], function (BaseController, FormDefinitions, versionTable, ListModel, MessageBox, Column, ColumnListItem, Text, VBox, CustomData, Log) {
  "use strict";

  // Fields approvers fill in on the request's details row, per request type (Versions rows).
  const APPROVER_FIELDS = {
    SERVICE_CODE: [["glAccount", "GL Account"], ["valuationClass_code", "Valuation Class"], ["serviceCode", "Service Code"]],
    MATERIAL_CODE: [["glAccount", "GL Account"], ["materialCode", "Material Code"]],
    EQUIPMENT_CODE: [["equipmentCode", "Equipment Code"]],
    PROJECT_CODE: [["projectCode", "Project Code"], ["functionLocation", "Function Location"], ["activityNumber", "Activity"]],
    PURCHASE_ORDER: [["purchaseOrderNumber", "PO Number"]],
    SERVICE_ENTRY_SHEET: [["sesNumber", "SES Number"]]
  };

  return BaseController.extend("flowmateca.controller.RequestDetail", {
    onInit: function () {
      this.getView().setModel(new ListModel({}), "detail");
      this.getView().setModel(new ListModel({}), "step");
      this.getView().setModel(new ListModel({}), "taskForm");
      this.getView().setModel(new ListModel({}), "catalog");
      this.getView().setModel(new ListModel({ rows: [] }), "versions");
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
          "versions($select=ID,versionNo,snapshot,createdAt,createdByName,stepName)",
          "materialCode($expand=items)",
          "serviceCode($expand=items)",
          "equipmentCode($expand=items)",
          "projectCode($expand=items)",
          "materialReservation($expand=items)",
          "outlineContract($expand=items,headers,changeItems)",
          "purchaseOrder($expand=items)",
          "serviceEntrySheet($expand=items,headers)"
        ].join(",");
        const [request, contribute] = await Promise.all([
          this.request(`Requests(${this._requestId})?$expand=${expand}`),
          this.request(`canContribute(requestId=${this._requestId})`)
        ]);
        // Comments and uploads are for the person the request is waiting on (checked on the server too).
        request.canContribute = contribute.value === true;
        this._prepareDetail(request);
        this.getView().getModel("detail").setData(request);
        this._renderDetailItems(request.requestType?.code);
        await Promise.all([this._resolveIdLabels(request), this._renderVersions(request)]);
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
      // By step, then oldest first, so a task opened by a send-back sits under the one it replaces.
      request.tasks = (request.tasks || []).sort(function (left, right) {
        return left.stepNo - right.stepNo || new Date(left.createdAt) - new Date(right.createdAt);
      });
      // A step shows "SLA Breached" when any of its tasks breached (open past due, or closed late).
      request.stepInstances.forEach(function (step) {
        step.slaBreached = request.tasks.some(function (task) {
          return task.stepNo === step.stepNo
            && this.isSlaBreached(task.slaDueAt, task.status?.code || task.status_code, task.slaBreached);
        }.bind(this));
      }.bind(this));
      request.history = (request.history || []).sort(function (left, right) {
        return new Date(right.createdAt) - new Date(left.createdAt);
      });
      // Versions are shown once the request has been sent back.
      request.hasSendBack = request.history.some(function (entry) { return entry.action === "TASK_SENT_BACK"; });
      request.attachments = request.attachments || [];
      request.comments = request.comments || [];
      request.successors = request.successors || [];
      request.tasks.count = request.tasks.length;
      request.attachments.count = request.attachments.length;
      request.comments.count = request.comments.length;
      request.history.count = request.history.length;

      const currentTasks = request.tasks.filter(function (task) {
        return task.stepNo === request.currentStep && !task.isSuperseded;
      });
      const blockingTask = currentTasks.some(function (task) {
        return task.isMandatory && task.status?.code !== "APPROVED";
      });
      const currentUser = this.getAppModel().getProperty("/currentUser") || {};
      const isOwner = this.canActForAssignedUser(request.owner_ID, currentUser)
        || this.canActForAssignedUser(request.requester_ID, currentUser);
      request.canCompleteCurrentStep = !["COMPLETED", "REJECTED"].includes(request.status?.code)
        && !blockingTask
        && (isOwner || currentUser.isAdmin);
      request.processStatusText = request.status?.code === "COMPLETED"
        ? "Workflow completed"
        : `Step ${request.currentStep} of ${request.stepInstances.length}`;
      // The editable form lives on the task, not here, so a request waiting on the person
      // looking at it needs a way through - otherwise a send-back looks like a dead end.
      const myTask = currentTasks.find(function (task) {
        return task.status?.code === "OPEN"
          && (this.canActForAssignedUser(task.assignedUser_ID, currentUser) || (!task.assignedUser_ID && isOwner));
      }.bind(this));
      request.myOpenTaskId = myTask ? myTask.ID : null;
      request.myOpenTaskName = myTask ? (myTask.taskName || "Open My Task") : "";
      request.detailFields = this._detailFields(request);
      request.detailItems = (request[this.detailNavigationFor(request.requestType?.code)] || {}).items || [];
      request.hasDetailItems = request.detailItems.length > 0;
      request.detailHeaders = this.sortedDetailHeaders(request[this.detailNavigationFor(request.requestType?.code)]);
      request.hasDetailHeaders = request.detailHeaders.length > 0;
      // "Contract Creation Details" is an Outline Contract title; other types with a header
      // table still call their second table line items.
      request.detailItemsTitle = request.hasDetailHeaders && request.requestType?.code === "OUTLINE_CONTRACT"
        ? "Contract Creation Details"
        : "Line Items";
    },

    _detailFields: function (request) {
      const details = request[this.detailNavigationFor(request.requestType?.code)] || {};
      const fields = this.buildDetailFields(request, details);
      if (request.requestType?.code === "SERVICE_CODE"
        && details.glAccount) {
        fields.push({ label: "GL Account", value: String(details.glAccount) });
      }
      if (request.requestType?.code === "SERVICE_CODE") {
        [
          ["valuationClass_code", "Valuation Class"],
          ["serviceCode", "Service Code"]
        ].forEach(function (entry) {
          if (details[entry[0]]) {
            fields.push({ label: entry[1], value: String(details[entry[0]]) });
          }
        });
      }
      // Material Code: the approvers' G/L Account and Material Code (Valuation Class is already a
      // form field, so it shows the approver's value there).
      if (request.requestType?.code === "MATERIAL_CODE") {
        [
          ["glAccount", "GL Account"],
          ["materialCode", "Material Code"]
        ].forEach(function (entry) {
          if (details[entry[0]]) {
            fields.push({ label: entry[1], value: String(details[entry[0]]) });
          }
        });
      }
      if (request.requestType?.code === "EQUIPMENT_CODE" && details.equipmentCode) {
        fields.push({ label: "Equipment Code", value: String(details.equipmentCode) });
      }
      if (request.requestType?.code === "PROJECT_CODE") {
        [
          ["projectCode", "Project Code"],
          ["functionLocation", "Function Location"],
          ["activityNumber", "Activity"]
        ].forEach(function (entry) {
          if (details[entry[0]]) {
            fields.push({ label: entry[1], value: String(details[entry[0]]) });
          }
        });
      }
      return fields;
    },

    // Combos keyed by a UUID (approver, LOA approver, vendor) store the ID; swap it for the
    // display text of that row. A failed lookup leaves the stored value in place.
    _resolveIdLabels: function (request) {
      const details = request[this.detailNavigationFor(request.requestType?.code)] || {};
      return this.resolveIdLabels(request, details, "detail", "/detailFields");
    },

    // History tab: "TASK_SENT_BACK" -> "Task Sent Back"; a rejection reads as Terminated.
    formatHistoryAction: function (action) {
      return String(action || "").replace("REJECTED", "TERMINATED").toLowerCase().split("_").map(function (word) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }).join(" ");
    },

    // History tab, Versions: one page per pair of versions - page 1 is Version 1 and Version 2,
    // page 2 Version 2 and Version 3, and so on - opening on the latest pair. Each page lists the
    // form fields and the line item / header row fields that changed (versionTable.pair). A
    // request with a single version, or created before versions were kept, shows it in full.
    _renderVersions: async function (request) {
      const details = request[this.detailNavigationFor(request.requestType?.code)] || {};
      const stored = (request.versions || []).slice().sort(function (left, right) {
        return left.versionNo - right.versionNo;
      }).map(function (version) {
        let snapshot = {};
        try {
          snapshot = JSON.parse(version.snapshot || "{}");
        } catch (error) {
          Log.warning("Unreadable request version", String(version.versionNo));
        }
        return {
          title: `Version ${version.versionNo}`,
          // An approver's version names the step it was made at.
          subtitle: [version.stepName, version.createdByName, this.formatDateTime(version.createdAt)].filter(Boolean).join(" · "),
          snapshot: snapshot
        };
      }.bind(this));
      const versions = stored.length ? stored : [{
        title: "Current data", subtitle: "Created before versions were kept", snapshot: details
      }];
      const labelCache = new Map();
      const described = await Promise.all(versions.map(function (version) {
        return this._describeVersion(request, version.snapshot, labelCache);
      }.bind(this)));
      this._versionPages = versions.map(function (version, index) {
        return Object.assign({ rows: described[index] }, version);
      });
      this._renderVersionsTable();
      this._showVersionPage(Math.max(1, versions.length - 1));
    },

    // Page n (1-based) shows version n and version n + 1; a single version is page 1 on its own.
    _showVersionPage: function (page) {
      const versions = this._versionPages || [];
      const pageCount = Math.max(1, versions.length - 1);
      const current = Math.min(Math.max(1, page), pageCount);
      const shown = versions.slice(current - 1, current + 1);
      const table = shown.length === 2
        ? versionTable.pair(shown[0].rows, shown[1].rows)
        : versionTable.build(shown.map(function (version) { return { rows: version.rows }; }));
      this.getView().getModel("versions").setData({
        rows: table.rows,
        count: versions.length,
        page: current,
        pageCount: pageCount,
        pageText: shown.length === 2
          ? `${shown[0].title} → ${shown[1].title} (page ${current} of ${pageCount})`
          : (shown[0] ? shown[0].title : ""),
        columns: shown.map(function (version, index) {
          return { title: version.title, subtitle: version.subtitle, changedCount: index ? table.changedCount : 0, first: index === 0 };
        })
      });
    },

    onVersionsPrevious: function () {
      this._showVersionPage(this.getView().getModel("versions").getProperty("/page") - 1);
    },

    onVersionsNext: function () {
      this._showVersionPage(this.getView().getModel("versions").getProperty("/page") + 1);
    },

    // { key, label, value } rows for one version's details, formatted like the Overview.
    _describeVersion: async function (request, snapshot, labelCache) {
      const typeCode = request.requestType?.code;
      const variantCode = request.requestVariant?.code;
      const rows = [];
      const add = async function (key, label, definition, source) {
        let value = this.formatDetailValue(definition, request, source);
        if (definition.name === "requestDateTime") {
          value = this.formatDateTime(request.createdAt);
        } else if (definition.key === "ID" && definition.entity && value) {
          value = await this._versionIdLabel(definition, value, labelCache);
        }
        rows.push({ key: key, label: label, value: value });
      }.bind(this);
      const definitions = this.detailFieldDefinitions(request, snapshot);
      for (const definition of definitions) {
        await add(`field:${definition.name}`, definition.label, definition, snapshot);
      }
      // Values approvers record on the request itself (codes, PO / SES Number).
      for (const [name, label] of APPROVER_FIELDS[typeCode] || []) {
        if (!definitions.some(function (definition) { return definition.name === name; })) {
          await add(`field:${name}`, label, { name: name }, snapshot);
        }
      }
      const lineRows = async function (prefix, label, entries, columns) {
        for (const [index, row] of entries.entries()) {
          for (const col of columns) {
            if (col.name !== "itemNo") {
              await add(`${prefix}:${index + 1}:${col.name}`, `${label} ${index + 1} · ${col.label}`, col, row);
            }
          }
        }
      };
      await lineRows("header", "Header", this.sortedDetailHeaders(snapshot), FormDefinitions.getHeaderDisplayColumns(variantCode));
      const items = (snapshot.items || []).slice().sort(function (left, right) { return left.itemNo - right.itemNo; });
      await lineRows("line", "Line", items, FormDefinitions.getItemDisplayColumns(typeCode, variantCode, snapshot.materialCategory));
      return rows;
    },

    // User / vendor / purchasing organization IDs shown by name; one lookup per ID.
    _versionIdLabel: function (definition, value, labelCache) {
      const path = `${definition.entity}(${value})`;
      if (!labelCache.has(path)) {
        labelCache.set(path, this.request(path).catch(function () {
          return this.requestMaster(path);
        }.bind(this)).then(function (row) {
          return (row && row[definition.text || "name"]) || value;
        }, function () {
          return value;
        }));
      }
      return labelCache.get(path).then(String);
    },

    // Field, the earlier version of the page and the later one (hidden when there is only one).
    _renderVersionsTable: function () {
      const table = this.byId("versionsTable");
      table.destroyColumns();
      table.unbindItems();
      table.setWidth("100%");
      table.addColumn(new Column({ width: "30%", header: new Text({ text: "Field" }) }));
      const cells = [new Text({ text: "{versions>label}" }).addStyleClass("caVersionField")];
      for (let index = 0; index < 2; index++) {
        const column = `versions>/columns/${index}`;
        table.addColumn(new Column({
          width: "35%",
          visible: `{= !!\${${column}} }`,
          header: new VBox({ items: [
            new Text({ text: `{${column}/title}` }).addStyleClass("caVersionTitle"),
            new Text({ text: `{${column}/subtitle}` }).addStyleClass("caMuted"),
            new Text({
              text: `{= \${${column}/changedCount} + ' field(s) edited' }`,
              visible: `{= !\${${column}/first} }`
            }).addStyleClass("caMuted")
          ] })
        }));
        cells.push(new Text({
          text: `{versions>cells/${index}/text}`,
          customData: [new CustomData({ key: "changed", value: `{= String(\${versions>cells/${index}/changed}) }`, writeToDom: true })]
        }).addStyleClass("caVersionCell"));
      }
      table.bindItems({ path: "versions>/rows", template: new ColumnListItem({ cells: cells }) });
    },

    _renderDetailItems: function (typeCode) {
      const detail = this.getView().getModel("detail").getData() || {};
      const details = detail[this.detailNavigationFor(typeCode)] || {};
      const variantCode = detail.requestVariant && detail.requestVariant.code;
      this.renderReadOnlyRows("detailItemsTable", "detail>/detailItems",
        FormDefinitions.getItemDisplayColumns(typeCode, variantCode, details.materialCategory), variantCode);
      this.renderReadOnlyRows("detailHeadersTable", "detail>/detailHeaders",
        FormDefinitions.getHeaderDisplayColumns(variantCode));
      this.renderChangeTables("detailChangeTablesHost", "detail", variantCode, details.changeItems);
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
      console.log('assignedTeamId at submit:', form.assignedTeamId)
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

    onOpenMyTask: function () {
      const taskId = this.getView().getModel("detail").getProperty("/myOpenTaskId");
      if (taskId) {
        this.navTo("taskDetail", { taskId });
      }
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
              category: "SUPPORTING_DOCUMENT"
            }
          });
          const response = await fetch(this.resolveAppUri(`odata/v4/flowmate-ca/Attachments(${attachment.ID})/content`), {
            method: "PUT",
            headers: {
              "X-CSRF-Token": await this._csrfToken(),
              "Content-Type": file.type || "application/octet-stream"
            },
            body: file
          });
          if (!response.ok) {
            let reason = "";
            try {
              const body = await response.json();
              reason = (body && body.error && body.error.message) || "";
            } catch (parseError) {
              reason = "";
            }
            try {
              await this.request(`Attachments(${attachment.ID})`, { method: "DELETE" });
            } catch (cleanupError) {
              Log.warning("Could not remove the incomplete attachment " + attachment.ID, cleanupError);
            }
            throw new Error(reason || `Upload failed for ${file.name}`);
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
      window.open(this.resolveAppUri(`odata/v4/flowmate-ca/Attachments(${attachment.ID})/content`), "_blank", "noopener");
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

    stepIcon: function (status) {
      return {
        COMPLETED: "sap-icon://accept",
        OPEN: "sap-icon://process",
        PENDING: "sap-icon://circle-task",
        REJECTED: "sap-icon://decline",
        SENT_BACK: "sap-icon://undo"
      }[status] || "sap-icon://circle-task";
    },

    stepButtonType: function (status) {
      return {
        OPEN: "Emphasized",
        COMPLETED: "Accept",
        REJECTED: "Reject",
        SENT_BACK: "Attention"
      }[status] || "Default";
    },

    stepState: function (status) {
      return {
        COMPLETED: "Success",
        OPEN: "Information",
        REJECTED: "Error",
        SENT_BACK: "Warning"
      }[status] || "None";
    },

    stepStatusText: function (status) {
      return status === "REJECTED" ? "TERMINATED" : String(status || "").replace(/_/g, " ");
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
