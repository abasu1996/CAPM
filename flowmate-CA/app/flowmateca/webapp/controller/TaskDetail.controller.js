sap.ui.define([
  "flowmateca/controller/BaseController",
  "flowmateca/model/FormDefinitions",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox",
  "sap/ui/layout/form/SimpleForm",
  "sap/m/Label",
  "sap/m/Column",
  "sap/m/ColumnListItem",
  "sap/m/Button"
], function (BaseController, FormDefinitions, JSONModel, MessageBox, SimpleForm, Label, Column, ColumnListItem, Button) {
  "use strict";

  return BaseController.extend("flowmateca.controller.TaskDetail", {
    onInit: function () {
      this.getView().setModel(new JSONModel({}), "task");
      this.getView().setModel(new JSONModel({}), "decision");
      this.getView().setModel(new JSONModel({}), "sendBack");
      this.getView().setModel(new JSONModel({ details: {} }), "form");
      // Pick lists for the editable step-1 form, same shape the create page uses.
      this.getView().setModel(new JSONModel({}), "catalog");
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
          "stepInstances($select=stepNo)",
          this.detailExpandClause()
        ].join(",");
        const task = await this.request(
          `Tasks(${this._taskId})?$expand=status,request($expand=${requestExpand})`
        );
        const user = this.getAppModel().getProperty("/currentUser") || await this.loadCurrentUser();
        // A task is only actionable while it is OPEN. SENT_BACK marks the task of the
        // person who sent the request back: their step has been rolled back, so the task
        // lies dormant until that step is reached again, and is reopened then.
        const processableStatus = task.status?.code === "OPEN";
        task.canClaim = processableStatus && Boolean(task.assignedTeam_ID) && !task.assignedUser_ID;
        task.canProcess = processableStatus && task.assignedUser_ID === user?.ID;
        task.canSendBack = task.canProcess && task.stepNo > 1;

        const request = task.request || {};
        const details = request[this.detailNavigationFor(request.requestType?.code)] || {};
        task.detailFields = this.buildDetailFields(request, details);
        task.detailItems = details.items || [];
        task.hasDetailItems = task.detailItems.length > 0;
        task.hasDetailFields = task.detailFields.length > 0;
        task.detailHeaders = this.sortedDetailHeaders(details);
        task.hasDetailHeaders = task.detailHeaders.length > 0;
        // "Contract Creation Details" is an Outline Contract title; other types with a header
        // table still call their second table line items.
        task.detailItemsTitle = task.hasDetailHeaders && request.requestType?.code === "OUTLINE_CONTRACT"
          ? "Contract Creation Details"
          : "Line Items";
        // The last step of a PO with "Create SES Successor" must capture the Purchase Order number,
        // which the SES successor carries (the server enforces the same rule).
        const lastStepNo = Math.max.apply(null, (request.stepInstances || []).map(function (step) {
          return step.stepNo;
        }));
        task.needsPoNumber = request.requestType?.code === "PURCHASE_ORDER"
          && details.sesRequired === true
          && task.stepNo === lastStepNo;

        // Step 1 is the requester's own: they correct the details here and send the
        // request on, rather than approving it.
        task.isRequesterStep = task.stepNo === 1 && task.canProcess;
        this.getView().getModel("task").setData(task);
        // User/vendor fields are stored as IDs; show their names.
        this.resolveIdLabels(request, details, "task", "/detailFields");

        if (task.isRequesterStep) {
          await this._renderEditableStep(request, details);
        } else {
          this.renderDetailItemsTable(
            this.byId("taskItemsTable"),
            request,
            details,
            "task",
            "task>/detailItems"
          );
          const variantCode = request.requestVariant?.code;
          this.renderReadOnlyRows("taskHeadersTable", "task>/detailHeaders",
            FormDefinitions.getHeaderTableColumns(variantCode));
          this.renderChangeTables("taskChangeTablesHost", "task", variantCode, details.changeItems);
        }
      } catch (error) {
        this.showError(error);
      } finally {
        this.setBusy(false);
      }
    },

    // Seeds the editable form from the stored detail row and renders the same field
    // controls and grid the create page uses, so validation and auto-fill behave
    // identically on both screens.
    _renderEditableStep: async function (request, details) {
      const typeCode = request.requestType && request.requestType.code;
      const variantCode = request.requestVariant && request.requestVariant.code;
      const categoryCode = details.materialCategory;
      const formModel = this.getView().getModel("form");

      const editableRows = function (rows) {
        return (rows || [])
          .slice()
          .sort(function (a, b) { return (a.itemNo || 0) - (b.itemNo || 0); })
          .map(function (item) {
            const row = Object.assign({}, item);
            delete row.ID;
            delete row.details_ID;
            return row;
          });
      };
      const seed = Object.assign({}, details);
      delete seed.ID;
      delete seed.request_ID;
      seed.items = editableRows(details.items);
      seed.headers = editableRows(details.headers);
      formModel.setData({ details: seed });

      // A single-line request carries its values on the detail row, so they are edited in the
      // form. Its items table still shows for variants that capture rows in both modes, which
      // is the same rule the create page applies.
      const singleLine = this.isSingleLineDetail(request, details);
      this._headerFields = this.detailFieldDefinitions(request, details)
        .filter(function (field) { return field.type !== "file" && field.source !== "request"; });
      this._itemColumns = (!singleLine || FormDefinitions.hasHeaderTable(variantCode))
        ? FormDefinitions.getItemColumns(typeCode, variantCode, categoryCode)
          .filter(function (col) { return col.name !== "itemNo"; })
        : [];
      this._headerColumns = FormDefinitions.showsHeaderTable(variantCode, singleLine ? "SINGLE_LINE" : "MULTIPLE_LINE")
        ? FormDefinitions.getHeaderTableColumns(variantCode)
          .filter(function (col) { return col.name !== "itemNo"; })
        : [];

      const taskModel = this.getView().getModel("task");
      taskModel.setProperty("/hasEditableFields", this._headerFields.length > 0);
      taskModel.setProperty("/hasEditableItems", this._itemColumns.length > 0);
      taskModel.setProperty("/hasEditableHeaders", this._headerColumns.length > 0);

      await this._loadFieldCatalogs(this._headerFields.concat(this._itemColumns, this._headerColumns));
      this._renderEditableFields();
      this._renderEditableGrid("items");
      this._renderEditableGrid("headers");
      this._applyConditionalVisibility();
    },

    _renderEditableFields: function () {
      const host = this.byId("taskDetailFormHost");
      if (!host) {
        return;
      }
      host.destroyItems();
      this._fieldControls = [];
      const form = new SimpleForm({
        editable: true,
        layout: "ColumnLayout",
        columnsXL: 3,
        columnsL: 3,
        columnsM: 2
      });
      this._headerFields.forEach(function (definition) {
        const label = new Label({ text: definition.label, required: !!definition.required });
        const control = this._createFieldControl(definition);
        form.addContent(label);
        form.addContent(control);
        this._fieldControls.push({ definition: definition, control: control, label: label });
      }.bind(this));
      host.addItem(form);
    },

    // The two editable row tables, keyed the same way the create page keys its grids. A
    // toolbar button names its grid through app:grid custom data; "items" is the default.
    _editableGrid: function (gridKey) {
      return gridKey === "headers"
        ? { tableId: "taskHeadersEditTable", path: "/details/headers", columns: this._headerColumns || [] }
        : { tableId: "taskItemsTable", path: "/details/items", columns: this._itemColumns || [] };
    },

    _gridOf: function (control) {
      return (control && control.data("grid")) || "items";
    },

    _renderEditableGrid: function (gridKey) {
      const grid = this._editableGrid(gridKey);
      const host = this.byId(grid.tableId);
      if (!host || !grid.columns.length) {
        return;
      }
      host.destroyColumns();
      host.unbindItems();
      grid.columns.forEach(function (col) {
        host.addColumn(new Column({
          header: new Label({ text: col.label, required: !!col.required, wrapping: true }),
          width: col.type === "date" ? "11rem" : "13rem"
        }));
      });
      host.addColumn(new Column({ hAlign: "End", width: "3rem" }));
      host.bindItems({
        path: "form>" + grid.path,
        template: new ColumnListItem({
          cells: grid.columns.map(function (col) {
            return this._createFieldControl(col, "form>" + col.name);
          }.bind(this)).concat([
            new Button({
              icon: "sap-icon://delete",
              type: "Transparent",
              press: this.onRemoveTaskItemRow.bind(this, gridKey)
            })
          ])
        })
      });
    },

    onAddTaskItemRow: function (event) {
      const grid = this._editableGrid(this._gridOf(event && event.getSource()));
      const formModel = this.getView().getModel("form");
      const rows = formModel.getProperty(grid.path) || [];
      const blank = {};
      grid.columns.forEach(function (col) {
        blank[col.name] = col.type === "checkbox" ? false : "";
      });
      formModel.setProperty(grid.path, this._renumberItems(rows.concat([blank])));
    },

    onRemoveTaskItemRow: function (gridKey, event) {
      const grid = this._editableGrid(gridKey);
      const formModel = this.getView().getModel("form");
      const index = event.getSource().getBindingContext("form").getPath().split("/").pop();
      const rows = (formModel.getProperty(grid.path) || []).filter(function (_row, n) {
        return String(n) !== String(index);
      });
      formModel.setProperty(grid.path, this._renumberItems(rows));
    },

    // Approving the requester's own step stores the corrections they made in the form
    // first. Returns false when a required value is still missing.
    _saveRequesterDetails: async function () {
      const details = this.getView().getModel("form").getProperty("/details") || {};

      const missingField = (this._headerFields || []).find(function (definition) {
        if (!definition.required || !this._isFieldVisible(definition)) {
          return false;
        }
        const value = details[definition.name];
        return value === undefined || value === null || String(value).trim() === "";
      }.bind(this));
      if (missingField) {
        MessageBox.warning(missingField.label + " is required.");
        return false;
      }
      const missingHeader = this._firstMissingItemCell(details.headers || [], this._headerColumns || []);
      if (missingHeader) {
        MessageBox.warning("Header Creation - " + missingHeader);
        return false;
      }
      const missingCell = this._firstMissingItemCell(details.items || [], this._itemColumns || []);
      if (missingCell) {
        MessageBox.warning(missingCell);
        return false;
      }

      await this.request("saveRequesterDetails", {
        method: "POST",
        body: {
          requestId: this.getView().getModel("task").getProperty("/request_ID"),
          details: JSON.stringify(details)
        }
      });
      return true;
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
        remarks: "",
        needsPoNumber: !!this.getView().getModel("task").getProperty("/needsPoNumber"),
        purchaseOrderNo: ""
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
      const purchaseOrderNo = String(decision.purchaseOrderNo || "").trim();
      if (!rejecting && decision.needsPoNumber && !purchaseOrderNo) {
        MessageBox.warning("Enter the Purchase Order number to approve this task.");
        return;
      }
      const body = { taskId: this._taskId, remarks: decision.remarks };
      if (!rejecting && decision.needsPoNumber) {
        body.purchaseOrderNo = purchaseOrderNo;
      }
      this.setBusy(true);
      try {
        if (!rejecting && this.getView().getModel("task").getProperty("/isRequesterStep")
          && !(await this._saveRequesterDetails())) {
          return;
        }
        await this.request(rejecting ? "rejectTask" : "approveTask", {
          method: "POST",
          body: body
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
          `RequestSteps?$filter=request_ID eq ${task.request.ID} and stepNo lt ${task.stepNo}&$orderby=stepNo`
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
