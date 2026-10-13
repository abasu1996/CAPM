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
          "stepInstances($select=stepNo,stepName)",
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
        const currentStep = (request.stepInstances || []).find(function (step) {
          return step.stepNo === task.stepNo;
        });
        // Service Code and Material Code share the G/L Account and Valuation Class steps; the
        // S/4 Data Validation step asks for the created Service Code / Material Code.
        const typeCode = request.requestType?.code;
        // Existing variants change a code that already exists in S/4, so no step asks for a
        // G/L Account, Valuation Class or created code. Mirrors _approveTask in srv/flowmate-ca.js.
        const existingVariant = /_EXISTING$/.test(request.requestVariant?.code || "");
        const enriched = (typeCode === "SERVICE_CODE" || typeCode === "MATERIAL_CODE") && !existingVariant;
        const singleLine = enriched && this.isSingleLineDetail(request, details);
        const s4Step = /s\s*\/?\s*4\s+data\s+validation/i.test(currentStep?.stepName || "");
        task.needsGlAccount = singleLine
          && /g\s*\/?\s*l\s+account\s+enrichment/i.test(currentStep?.stepName || "");
        task.needsValuationClass = singleLine
          && /valuation\s+class/i.test(currentStep?.stepName || "");
        task.needsServiceCode = singleLine && typeCode === "SERVICE_CODE" && s4Step;
        task.needsMaterialCode = singleLine && typeCode === "MATERIAL_CODE" && s4Step;
        // The pop-up starts from what is already recorded (e.g. the requester's Valuation Class).
        task.prefill = {
          glAccount: details.glAccount || "",
          valuationClass: details.valuationClass_code || "",
          serviceCode: details.serviceCode || "",
          materialCode: details.materialCode || ""
        };
        task.needsEquipmentCode = request.requestType?.code === "EQUIPMENT_CODE"
          && !existingVariant
          && !(details.items || []).length
          && /s\s*\/?\s*4\s+data\s+validation/i.test(currentStep?.stepName || "");
        // Multiple line items: the same steps ask for the value per line, in a table that shows
        // each line's service / material description.
        task.lineEntry = null;
        task.lineEntryRows = [];
        if (enriched && (details.items || []).length) {
          const isMaterial = typeCode === "MATERIAL_CODE";
          const stepName = currentStep?.stepName || "";
          const target = /g\s*\/?\s*l\s+account\s+enrichment/i.test(stepName)
            ? { field: "glAccount", label: "G/L Account", maxLength: 80 }
            : (/valuation\s+class/i.test(stepName)
              ? { field: "valuationClass_code", label: "Valuation Class", maxLength: 40 }
              : (s4Step
                ? (isMaterial
                  ? { field: "materialCode", label: "Material Code", maxLength: 40 }
                  : { field: "serviceCode", label: "Service Code", maxLength: 80 })
                : null));
          if (target) {
            target.info1Label = isMaterial ? "Material Description" : "Service Description";
            task.lineEntry = target;
            task.lineEntryRows = details.items.slice()
              .sort(function (left, right) { return left.itemNo - right.itemNo; })
              .map(function (item) {
                return {
                  itemId: item.ID,
                  itemNo: item.itemNo,
                  info1: (isMaterial ? item.description : item.serviceDescription) || "",
                  value: item[target.field] || ""
                };
              });
          }
        }
        // Equipment Code with multiple line items: S/4 Data Validation records the Equipment
        // Code per line, next to that line's Site ID and Site Name.
        if (request.requestType?.code === "EQUIPMENT_CODE" && !existingVariant && (details.items || []).length
          && /s\s*\/?\s*4\s+data\s+validation/i.test(currentStep?.stepName || "")) {
          task.lineEntry = {
            field: "equipmentCode", label: "Equipment Code", maxLength: 80,
            info1Label: "Site ID", info2Label: "Site Name"
          };
          task.lineEntryRows = details.items.slice()
            .sort(function (left, right) { return left.itemNo - right.itemNo; })
            .map(function (item) {
              return {
                itemId: item.ID,
                itemNo: item.itemNo,
                info1: item.siteId || "",
                info2: item.siteName || "",
                value: item.equipmentCode || ""
              };
            });
        }
        // Project Code at S/4 Data Validation: the created Project Code (New / Modification), or the
        // Function Location / Activity per the Object Type. One field, or one value per line.
        task.needsProjectValue = false;
        const projectTarget = request.requestType?.code === "PROJECT_CODE"
          && /s\s*\/?\s*4\s+data\s+validation/i.test(currentStep?.stepName || "")
          ? this._projectValueTarget(request.requestVariant?.code, details.transactionType)
          : null;
        if (projectTarget && !(details.items || []).length) {
          task.needsProjectValue = true;
          task.projectValueLabel = projectTarget.label;
        } else if (projectTarget) {
          // Each row shows what identifies the line: Project Name / Description (New / Modification),
          // Site ID / Name (Function Location) or Project Code / Remarks (Activity).
          const info = request.requestVariant?.code === "PROJECT_NEW_MOD"
            ? { info1Label: "Project Name", info2Label: "Project Description", info1: "projectName", info2: "projectDescription" }
            : (details.transactionType === "FUNCTION_LOCATION"
              ? { info1Label: "Site ID", info2Label: "Site Name", info1: "siteId", info2: "siteName" }
              : { info1Label: "Project Code", info2Label: "Remarks", info1: "projectId", info2: "remarks" });
          task.lineEntry = Object.assign(projectTarget, { info1Label: info.info1Label, info2Label: info.info2Label });
          task.lineEntryRows = details.items.slice()
            .sort(function (left, right) { return left.itemNo - right.itemNo; })
            .map(function (item) {
              return {
                itemId: item.ID,
                itemNo: item.itemNo,
                info1: item[info.info1] || "",
                info2: item[info.info2] || "",
                value: item[projectTarget.field] || ""
              };
            });
        }

        // Step 1 is the requester's own: they correct the details here and send the
        // request on, rather than approving it.
        task.isRequesterStep = task.stepNo === 1 && task.canProcess;
        this.getView().getModel("task").setData(task);
        // User/vendor fields are stored as IDs; show their names.
        this.resolveIdLabels(request, details, "task", "/detailFields");

        if (task.isRequesterStep) {
          await this._renderEditableStep(request, details);
        } else {
          this.byId("taskDetailFormHost")?.destroyItems();
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
        const label = new Label({ text: definition.label, required: !!this._isFieldRequired(definition) });
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
          header: new Label({ text: col.label, required: !!this._isFieldRequired(col), wrapping: true }),
          width: col.type === "date" ? "11rem" : "13rem",
          visible: this._columnVisibleBinding(col)
        }));
      }.bind(this));
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
        if (!this._isFieldRequired(definition) || !this._isFieldVisible(definition)) {
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

    // Mirrors _projectValueTarget in srv/flowmate-ca.js.
    _projectValueTarget: function (variantCode, transactionType) {
      if (variantCode === "PROJECT_NEW_MOD") {
        return { field: "projectCode", label: "Project Code", maxLength: 80 };
      }
      if (variantCode === "PROJECT_FL_ACTIVITY" && transactionType === "FUNCTION_LOCATION") {
        return { field: "functionLocation", label: "Function Location", maxLength: 80 };
      }
      if (variantCode === "PROJECT_FL_ACTIVITY" && transactionType === "ACTIVITY") {
        return { field: "activityNumber", label: "Activity", maxLength: 80 };
      }
      return null;
    },

    onApprove: function () {
      const prefill = this.getView().getModel("task").getProperty("/prefill") || {};
      this.getView().getModel("decision").setData({
        title: "Approve Task",
        action: "approve",
        remarks: "",
        needsPoNumber: !!this.getView().getModel("task").getProperty("/needsPoNumber"),
        purchaseOrderNo: "",
        needsGlAccount: !!this.getView().getModel("task").getProperty("/needsGlAccount"),
        glAccount: prefill.glAccount || "",
        needsValuationClass: !!this.getView().getModel("task").getProperty("/needsValuationClass"),
        valuationClass: prefill.valuationClass || "",
        needsServiceCode: !!this.getView().getModel("task").getProperty("/needsServiceCode"),
        serviceCode: prefill.serviceCode || "",
        needsMaterialCode: !!this.getView().getModel("task").getProperty("/needsMaterialCode"),
        materialCode: prefill.materialCode || "",
        needsEquipmentCode: !!this.getView().getModel("task").getProperty("/needsEquipmentCode"),
        equipmentCode: "",
        needsProjectValue: !!this.getView().getModel("task").getProperty("/needsProjectValue"),
        projectValueLabel: this.getView().getModel("task").getProperty("/projectValueLabel") || "",
        projectValue: "",
        lineEntry: this.getView().getModel("task").getProperty("/lineEntry"),
        lineEntryRows: (this.getView().getModel("task").getProperty("/lineEntryRows") || []).map(function (row) {
          return Object.assign({}, row);
        })
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
      const glAccount = String(decision.glAccount || "").trim();
      if (!rejecting && decision.needsGlAccount && !glAccount) {
        MessageBox.warning("Enter the GL Account to approve this task.");
        return;
      }
      const valuationClass = String(decision.valuationClass || "").trim();
      if (!rejecting && decision.needsValuationClass && !valuationClass) {
        MessageBox.warning("Enter the Valuation Class to approve this task.");
        return;
      }
      const serviceCode = String(decision.serviceCode || "").trim();
      if (!rejecting && decision.needsServiceCode && !serviceCode) {
        MessageBox.warning("Enter the Service Code to approve this task.");
        return;
      }
      const materialCode = String(decision.materialCode || "").trim();
      if (!rejecting && decision.needsMaterialCode && !materialCode) {
        MessageBox.warning("Enter the Material Code to approve this task.");
        return;
      }
      const equipmentCode = String(decision.equipmentCode || "").trim();
      if (!rejecting && decision.needsEquipmentCode && !equipmentCode) {
        MessageBox.warning("Enter the Equipment Code to approve this task.");
        return;
      }
      const projectValue = String(decision.projectValue || "").trim();
      if (!rejecting && decision.needsProjectValue && !projectValue) {
        MessageBox.warning(`Enter the ${decision.projectValueLabel} to approve this task.`);
        return;
      }
      const body = { taskId: this._taskId, remarks: decision.remarks };
      if (!rejecting && decision.needsPoNumber) {
        body.purchaseOrderNo = purchaseOrderNo;
      }
      if (!rejecting && decision.needsGlAccount) {
        body.glAccount = glAccount;
      }
      if (!rejecting && decision.needsValuationClass) {
        body.valuationClass = valuationClass;
      }
      if (!rejecting && decision.needsServiceCode) {
        body.serviceCode = serviceCode;
      }
      if (!rejecting && decision.needsMaterialCode) {
        body.materialCode = materialCode;
      }
      if (!rejecting && decision.needsEquipmentCode) {
        body.equipmentCode = equipmentCode;
      }
      if (!rejecting && decision.needsProjectValue) {
        body.projectValue = projectValue;
      }
      if (!rejecting && decision.lineEntry) {
        const rows = decision.lineEntryRows || [];
        const missing = rows.find(function (row) { return !String(row.value || "").trim(); });
        if (missing) {
          MessageBox.warning(`Row ${missing.itemNo}: enter the ${decision.lineEntry.label}.`);
          return;
        }
        body.lineValues = JSON.stringify(rows.map(function (row) {
          return { itemId: row.itemId, value: String(row.value).trim() };
        }));
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
