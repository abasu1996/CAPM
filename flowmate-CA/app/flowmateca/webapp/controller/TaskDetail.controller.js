sap.ui.define([
  "flowmateca/controller/BaseController",
  "flowmateca/model/FormDefinitions",
  "flowmateca/model/tableFile",
  "flowmateca/model/ListModel",
  "sap/m/MessageBox",
  "sap/ui/layout/form/SimpleForm",
  "sap/m/Label",
  "sap/m/Column",
  "sap/m/ColumnListItem",
  "sap/m/Button"
], function (BaseController, FormDefinitions, tableFile, ListModel, MessageBox, SimpleForm, Label, Column, ColumnListItem, Button) {
  "use strict";

  return BaseController.extend("flowmateca.controller.TaskDetail", {
    onInit: function () {
      this.getView().setModel(new ListModel({}), "task");
      this.getView().setModel(new ListModel({}), "decision");
      this.getView().setModel(new ListModel({}), "sendBack");
      this.getView().setModel(new ListModel({ details: {} }), "form");
      // Pick lists for the editable step-1 form, same shape the create page uses.
      this.getView().setModel(new ListModel({}), "catalog");
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
        let user = this.getAppModel().getProperty("/currentUser");
        if (!user?.ID) user = await this.loadCurrentUser();
        // A task is only actionable while it is OPEN. SENT_BACK marks the task of the
        // person who sent the request back: their step has been rolled back, so the task
        // lies dormant until that step is reached again, and is reopened then.
        const processableStatus = task.status?.code === "OPEN";
        const belongsToAssignedTeam = Boolean(user?.isAdmin)
          || (user?.teamIds || []).includes(task.assignedTeam_ID);
        task.canClaim = processableStatus && Boolean(user?.canValidate)
          && Boolean(task.assignedTeam_ID) && !task.assignedUser_ID && belongsToAssignedTeam;
        task.canReassign = Boolean(user?.canReassign) && ["OPEN", "IN_PROGRESS"].includes(task.status?.code) && !task.isSuperseded
          && !["COMPLETED", "REJECTED"].includes(task.request?.status?.code || task.request?.status_code);
        task.canProcess = processableStatus && Boolean(user?.canValidate)
          && (Boolean(user?.isAdmin) || this.canActForAssignedUser(task.assignedUser_ID, user));
        task.canTerminate = processableStatus && Boolean(user?.canTerminate) && !task.isRequesterStep;
        // Line-item exports are for the approver the task is assigned to (once claimed), also after deciding it.
        task.isAssignedToMe = this.canActForAssignedUser(task.assignedUser_ID, user);
        task.canSendBack = task.canProcess && task.stepNo > 1;

        const request = task.request || {};
        const details = request[this.detailNavigationFor(request.requestType?.code)] || {};
        // Values earlier approvers recorded (GL Account, Valuation Class, ...) follow the form fields.
        task.detailFields = this.appendApproverFields(request, details, this.buildDetailFields(request, details));
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
          && !details.purchaseOrderNumber
          && task.stepNo === lastStepNo;
        const currentStep = (request.stepInstances || []).find(function (step) {
          return step.stepNo === task.stepNo;
        });
        // Workhub transmission is available only on an assigned PO S/4 Data Validation task.
        // The server repeats this check; this flag only controls the dialog button visibility.
        task.canSendToWorkhub = task.canProcess
          && request.requestType?.code === "PURCHASE_ORDER"
          && /s\s*\/?\s*4\s+data\s+validation/i.test(currentStep?.stepName || "");
        // Budget Check (Purchase Order only; srv _requestBudgetCheck): optional; the S/4 Data
        // Validation task may run it, and cannot be approved while it is running. Step names as in
        // srv/flowmate-ca.js (Budget Check).
        const budgetStatus = request.requestType?.code === "PURCHASE_ORDER"
          ? (details.budgetCheckStatus || null) : null;
        const onS4Step = /s\s*\/?\s*4\s+data\s+validation/i.test(currentStep?.stepName || "");
        const onBudgetStep = /budget\s+(check|confirmation)/i.test(currentStep?.stepName || "");
        task.canRequestBudgetCheck = task.canProcess && onS4Step && budgetStatus === "NOT_REQUESTED";
        task.budgetCheckBlocksApproval = onS4Step && budgetStatus === "REQUESTED";
        task.budgetCheckMessage = "";
        if (budgetStatus && onS4Step) {
          task.budgetCheckMessage = {
            NOT_REQUESTED: "Optional: use Budget Check if Finance should confirm the budget before you approve.",
            REQUESTED: "Budget Check in progress. This task reopens for approval once the Budget Check task is completed.",
            COMPLETED: "Budget Check completed. This task can be approved."
          }[budgetStatus] || "";
        } else if (budgetStatus === "REQUESTED" && onBudgetStep && task.status?.code === "OPEN") {
          task.budgetCheckMessage = "Requested from S/4 Data Validation. Approving this task returns the request to S/4 Data Validation for approval.";
        }
        task.budgetCheckMessageType = budgetStatus === "COMPLETED" ? "Success" : "Information";
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
        // The Valuation Class is picked from the type's master: MCC (Material) or SCC (Service).
        task.valuationLookup = FormDefinitions.valuationClassLookup[typeCode] || null;
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
              ? { field: "valuationClass_code", label: "Valuation Class", maxLength: 40, lookup: task.valuationLookup }
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
        // Material Reservation: the S/4 step records the Material Reservation Number per line, next to
        // that line's Site ID, Site Name and Material Code.
        if (request.requestType?.code === "MATERIAL_RESERVATION" && (details.items || []).length
          && /s\s*\/?\s*4\s+(data\s+validation|material\s+reservation)/i.test(currentStep?.stepName || "")) {
          task.lineEntry = {
            field: "reservationNumber", label: "Material Reservation Number", maxLength: 40,
            info1Label: "Site ID", info2Label: "Site Name", info3Label: "Material Code"
          };
          task.lineEntryRows = details.items.slice()
            .sort(function (left, right) { return left.itemNo - right.itemNo; })
            .map(function (item) {
              return {
                itemId: item.ID,
                itemNo: item.itemNo,
                info1: item.siteId || "",
                info2: item.siteName || "",
                info3: item.materialCode || "",
                value: item.reservationNumber || ""
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
          // Each row shows what identifies the line: Site ID / Project Description (New Project Code),
          // Site ID / Name (Function Location), Project Code / Remarks (Activity) or Project Code /
          // Project Description (Description Change).
          const info = request.requestVariant?.code === "PROJECT_NEW_MOD"
            ? { info1Label: "Site ID", info2Label: "Project Description", info1: "siteId", info2: "projectDescription" }
            : (details.transactionType === "FUNCTION_LOCATION"
              ? { info1Label: "Site ID", info2Label: "Site Name", info1: "siteId", info2: "siteName" }
              : details.transactionType === "DESCRIPTION_CHANGE"
                ? { info1Label: "Project Code", info2Label: "Project Description", info1: "projectId", info2: "projectDescription" }
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

        // Purchase Order, PO Approval Completion: the PO Released Date (mandatory). Mirrors _approveTask.
        task.needsPoReleasedDate = request.requestType?.code === "PURCHASE_ORDER"
          && /po\s+approval\s+completion/i.test(currentStep?.stepName || "");
        task.poReleasedDatePrefill = details.poReleasedDate || "";

        // New SES at S/4 Data Validation: an SES Number per line item (Single and Multiple Line), next to
        // the line's PO Number, PO Line Item Number and Amount; Export / Import come with the dialog
        // table. A request without line items (older ones) keeps one field. Mirrors _approveTask.
        task.needsSesNumber = false;
        if (request.requestType?.code === "SERVICE_ENTRY_SHEET" && request.requestVariant?.code === "SES_NEW"
          && /s\s*\/?\s*4\s+data\s+validation/i.test(currentStep?.stepName || "")) {
          if ((details.items || []).length) {
            task.lineEntry = {
              field: "sesNumber", label: "SES Number", title: "SES Number per line item", maxLength: 80,
              info1Label: "PO Number", info2Label: "PO Line Item Number", info3Label: "Amount"
            };
            task.lineEntryRows = details.items.slice()
              .sort(function (left, right) { return left.itemNo - right.itemNo; })
              .map(function (item) {
                return {
                  itemId: item.ID,
                  itemNo: item.itemNo,
                  info1: item.poNumber || "",
                  info2: item.poLineItemNo || "",
                  info3: item.value === null || item.value === undefined ? "" : String(item.value),
                  value: item.sesNumber || ""
                };
              });
          } else {
            task.needsSesNumber = true;
            task.sesNumberPrefill = details.sesNumber || "";
          }
        }

        // New Contract at S/4 Data Validation: a Contract Number per Header Creation row, next to
        // the row's Vendor Code (auto-filled from the request).
        if (request.requestType?.code === "OUTLINE_CONTRACT" && request.requestVariant?.code === "CONTRACT_NEW"
          && (details.headers || []).length
          && /s\s*\/?\s*4\s+data\s+validation/i.test(currentStep?.stepName || "")) {
          task.lineEntry = {
            field: "contractNumber", label: "Contract Number", maxLength: 80,
            info1Label: "Vendor Code", info2Label: "Ariba Sourcing Event No"
          };
          task.lineEntryRows = this.sortedDetailHeaders(details).map(function (header) {
            return {
              itemId: header.ID,
              itemNo: header.itemNo,
              info1: header.vendorCode || "",
              info2: header.coupaSourcingEventNo || "",
              value: header.contractNumber || ""
            };
          });
        }

        // Purchase Order at S/4 Data Validation: one or more PO Numbers; the first is mandatory.
        // With Create SES Successor only one (the SES uses it), so + is disabled. Mirrors _approveTask.
        task.needsPoNumberList = request.requestType?.code === "PURCHASE_ORDER"
          && /s\s*\/?\s*4\s+data\s+validation/i.test(currentStep?.stepName || "");
        task.poNumberListLocked = details.sesRequired === true;
        task.poNumberListPrefill = String(details.purchaseOrderNumber || "").split(";")
          .map(function (number) { return number.trim(); }).filter(Boolean);

        // Step 1 is the requester's own: they correct the details here and send the
        // request on, rather than approving it.
        task.isRequesterStep = task.stepNo === 1 && task.canProcess;
        task.canTerminate = processableStatus && Boolean(user?.canTerminate) && !task.isRequesterStep;
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
          this._exportSource = { request: request, details: details };
          this.renderReadOnlyRows("taskHeadersTable", "task>/detailHeaders",
            FormDefinitions.getHeaderDisplayColumns(variantCode));
          this.renderChangeTables("taskChangeTablesHost", "task", variantCode, details.changeItems, "{task>/isAssignedToMe}");
        }
      } catch (error) {
        this.showError(error);
      } finally {
        this.setBusy(false);
      }
    },

    onReassignTask: function () {
      this.openReassignment("task", this._taskId);
    },

    // Seeds the editable form from the stored detail row and renders the same field
    // controls and grid the create page uses, so validation and auto-fill behave
    // identically on both screens.
    _renderEditableStep: async function (request, details) {
      const typeCode = request.requestType && request.requestType.code;
      const variantCode = request.requestVariant && request.requestVariant.code;
      this._editVariantCode = variantCode;
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
      // File fields stay: choosing a new file replaces the one attached before (see _saveRequesterDetails).
      this._headerFields = this.detailFieldDefinitions(request, details)
        .filter(function (field) { return field.source !== "request"; });
      this._dynamicFileUploads = {};
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
        // A file field shows the file attached now; choosing another one replaces it.
        const currentFile = definition.type === "file"
          && this.getView().getModel("form").getProperty(`/details/${definition.name}`);
        if (currentFile) {
          control.setValue(currentFile);
        }
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

    // Requester step: export an editable table with its stored values, edit it in Excel and import
    // it back. The file decides the rows (add or remove them there); see tableFile.toRows.
    onExportTaskRows: function (event) {
      const gridKey = this._gridOf(event.getSource());
      const grid = this._editableGrid(gridKey);
      const rows = this.getView().getModel("form").getProperty(grid.path) || [];
      const reference = this.getView().getModel("task").getProperty("/request/referenceNumber");
      const title = gridKey === "headers" ? "Header Creation"
        : (this.getView().getModel("task").getProperty("/detailItemsTitle") || "Line Items");
      this.exportToExcel([reference, title].filter(Boolean).join(" - "),
        [{ label: "#", value: function (row) { return row.itemNo; }, width: 6 }].concat(grid.columns.map(function (col) {
          return { label: col.label, value: function (row) { return row[col.name]; } };
        })), rows).catch(this.showError.bind(this));
    },

    onImportTaskRows: async function (event) {
      const uploader = event.getSource();
      const file = (event.getParameter("files") || [])[0];
      if (!file) {
        return;
      }
      const grid = this._editableGrid(this._gridOf(uploader));
      const formModel = this.getView().getModel("form");
      try {
        const result = tableFile.toRows(await tableFile.readTableFile(file), grid.columns, formModel.getProperty(grid.path));
        if (!result.matched) {
          MessageBox.error("None of the file's column headings match this table. Use Export to get a file in the right layout, edit it and import it.");
          return;
        }
        formModel.setProperty(grid.path, result.rows);
        this.showSuccess(`${result.rows.length} row(s) imported`);
      } catch (error) {
        MessageBox.error(`The file could not be read: ${error.message}`);
      } finally {
        uploader.clear();
      }
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
      const lateField = (this._headerFields || []).find(function (definition) {
        return this._isFieldVisible(definition) && this._pastDateProblem(definition, details[definition.name]);
      }.bind(this));
      if (lateField) {
        MessageBox.warning(this._pastDateProblem(lateField, details[lateField.name]));
        return false;
      }
      // Service Entry Sheet, tax based: the two dates may be at most 30 days apart.
      const sesDateProblem = FormDefinitions.sesDateProblem(details);
      if (sesDateProblem) {
        MessageBox.warning(sesDateProblem);
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
      // New Contract: each line item names its Header Creation row; every header row needs one.
      if (this._editVariantCode === "CONTRACT_NEW") {
        const headerProblem = FormDefinitions.contractItemHeaderProblem(details.items || [], (details.headers || []).length);
        if (headerProblem) {
          MessageBox.warning(headerProblem);
          return false;
        }
      }

      const requestId = this.getView().getModel("task").getProperty("/request_ID");
      await this.request("saveRequesterDetails", {
        method: "POST",
        body: {
          requestId: requestId,
          details: JSON.stringify(details)
        }
      });
      // Files chosen again replace the field's attachment; the earlier one stays, marked replaced.
      const uploads = Object.keys(this._dynamicFileUploads || {}).map(function (name) {
        return { file: this._dynamicFileUploads[name], category: name.replace(/([A-Z])/g, "_$1").toUpperCase() };
      }.bind(this));
      if (uploads.length) {
        const result = await this.uploadAttachments(requestId, uploads);
        if (result.failedCount) {
          return false;
        }
        this._dynamicFileUploads = {};
      }
      return true;
    },

    onRequestBudgetCheck: function () {
      MessageBox.confirm("Send this purchase order for a Budget Check? This task stays In Progress until the Budget Check task is completed.", {
        title: this.getView().getModel("i18n").getResourceBundle().getText("budgetCheck"),
        onClose: async function (action) {
          if (action !== MessageBox.Action.OK) {
            return;
          }
          this.setBusy(true);
          try {
            await this.request("requestBudgetCheck", {
              method: "POST",
              body: { taskId: this._taskId }
            });
            this.showSuccess("Budget Check requested");
            await this.onRefresh();
          } catch (error) {
            this.showError(error);
          } finally {
            this.setBusy(false);
          }
        }.bind(this)
      });
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
      if (variantCode === "PROJECT_FL_ACTIVITY" && transactionType === "DESCRIPTION_CHANGE") {
        return { field: "projectCode", label: "Confirmed Project Code", maxLength: 80 };
      }
      return null;
    },

    // Export to Excel of the Line Items / Header Creation table shown on the task.
    onExportTaskTable: function (event) {
      const source = this._exportSource;
      if (!source) {
        return;
      }
      const task = this.getView().getModel("task").getData();
      const headers = event.getSource().data("table") === "headers";
      const columns = headers
        ? FormDefinitions.getHeaderDisplayColumns(source.request.requestVariant?.code)
        : FormDefinitions.getItemDisplayColumns(source.request.requestType?.code, source.request.requestVariant?.code,
          source.details.materialCategory).filter(function (col) {
          return !col.visibleWhen || FormDefinitions.whenMatches(col.visibleWhen, source.details[col.visibleWhen.field]);
        });
      const title = headers ? "Header Creation" : (task.detailItemsTitle || "Line Items");
      this.exportTableRows([task.request?.referenceNumber, title].filter(Boolean).join(" - "), columns,
        headers ? task.detailHeaders : task.detailItems);
    },

    // Approve dialog, per-line entry table: export it, fill the value column in Excel, import it back.
    onExportLineEntry: function () {
      const decision = this.getView().getModel("decision").getData();
      const entry = decision.lineEntry || {};
      const columns = [{ label: "#", value: function (row) { return row.itemNo; }, width: 6 }]
        .concat(["info1", "info2", "info3"].filter(function (key) { return entry[`${key}Label`]; }).map(function (key) {
          return { label: entry[`${key}Label`], value: function (row) { return row[key]; }, width: 24 };
        }))
        .concat([{ label: entry.label, value: function (row) { return row.value; }, width: 24 }]);
      const reference = this.getView().getModel("task").getProperty("/request/referenceNumber");
      this.exportToExcel([reference, entry.title || `${entry.label} per line item`].filter(Boolean).join(" - "),
        columns, decision.lineEntryRows || []).catch(this.showError.bind(this));
    },

    onImportLineEntry: async function (event) {
      const uploader = event.getSource();
      const file = (event.getParameter("files") || [])[0];
      if (!file) {
        return;
      }
      const model = this.getView().getModel("decision");
      const entry = model.getProperty("/lineEntry") || {};
      try {
        const rows = await tableFile.readTableFile(file);
        const result = tableFile.applyImport(rows, model.getProperty("/lineEntryRows"), {
          valueLabel: entry.label, maxLength: entry.maxLength
        });
        if (result.missingColumn) {
          MessageBox.error(`The file needs the columns "#" and "${entry.label}". Use Export to get a file in the right layout, fill in the ${entry.label} column and import it.`);
          return;
        }
        model.setProperty("/lineEntryRows", result.rows);
        const skipped = result.unmatched.length ? `; no line for # ${result.unmatched.join(", ")}` : "";
        this.showSuccess(`${result.updated} row(s) filled in from the file${skipped}`);
      } catch (error) {
        MessageBox.error(`The file could not be read: ${error.message}`);
      } finally {
        uploader.clear();
      }
    },

    onApprove: function () {
      const prefill = this.getView().getModel("task").getProperty("/prefill") || {};
      this.getView().getModel("decision").setData({
        title: "Approve Task",
        action: "approve",
        remarks: "",
        needsPoNumber: !!this.getView().getModel("task").getProperty("/needsPoNumber"),
        needsPoNumberList: !!this.getView().getModel("task").getProperty("/needsPoNumberList"),
        poNumberListLocked: !!this.getView().getModel("task").getProperty("/poNumberListLocked"),
        poNumberList: (function (prefill) {
          const numbers = prefill && prefill.length ? prefill : [""];
          return numbers.map(function (value, index) { return { value: value, first: index === 0 }; });
        })(this.getView().getModel("task").getProperty("/poNumberListPrefill")),
        purchaseOrderNo: "",
        needsGlAccount: !!this.getView().getModel("task").getProperty("/needsGlAccount"),
        glAccount: prefill.glAccount || "",
        needsValuationClass: !!this.getView().getModel("task").getProperty("/needsValuationClass"),
        valuationClass: prefill.valuationClass || "",
        valuationLookup: this.getView().getModel("task").getProperty("/valuationLookup"),
        needsServiceCode: !!this.getView().getModel("task").getProperty("/needsServiceCode"),
        serviceCode: prefill.serviceCode || "",
        needsMaterialCode: !!this.getView().getModel("task").getProperty("/needsMaterialCode"),
        materialCode: prefill.materialCode || "",
        needsEquipmentCode: !!this.getView().getModel("task").getProperty("/needsEquipmentCode"),
        equipmentCode: "",
        needsProjectValue: !!this.getView().getModel("task").getProperty("/needsProjectValue"),
        projectValueLabel: this.getView().getModel("task").getProperty("/projectValueLabel") || "",
        projectValue: "",
        needsPoReleasedDate: !!this.getView().getModel("task").getProperty("/needsPoReleasedDate"),
        poReleasedDate: this.getView().getModel("task").getProperty("/poReleasedDatePrefill") || "",
        needsSesNumber: !!this.getView().getModel("task").getProperty("/needsSesNumber"),
        sesNumber: this.getView().getModel("task").getProperty("/sesNumberPrefill") || "",
        canSendToWorkhub: !!this.getView().getModel("task").getProperty("/canSendToWorkhub"),
        workhubSent: false,
        lineEntry: this.getView().getModel("task").getProperty("/lineEntry"),
        lineEntryRows: (this.getView().getModel("task").getProperty("/lineEntryRows") || []).map(function (row) {
          return Object.assign({}, row);
        })
      });
      this.byId("decisionDialog").open();
    },

    // Valuation Class in the approve pop-up (single value or per line): value help on the
    // request type's Valuation Class master.
    onValuationClassHelp: async function (event) {
      const input = event.getSource();
      const lookup = this.getView().getModel("decision").getProperty("/valuationLookup");
      if (!lookup) {
        return;
      }
      const definition = Object.assign({ label: "Valuation Class" }, lookup);
      await this._loadFieldCatalogs([definition]);
      this._openValueHelp(definition, input);
    },

    onSendPoNumbersToWorkhub: async function () {
      const decision = this.getView().getModel("decision").getData();
      const rows = decision.lineEntryRows || [];
      const values = rows.map(function (row) { return String(row.value || "").trim(); });
      if (!values.length || values.some(function (value) { return !value; })) {
        const missing = values.findIndex(function (value) { return !value; });
        MessageBox.warning(missing >= 0
          ? `Row ${missing + 1}: enter the Purchase Order number before sending to Workhub.`
          : "Enter at least one Purchase Order number before sending to Workhub.");
        return;
      }

      this.setBusy(true);
      try {
        await this.request("sendPoNumbersToWorkhub", {
          method: "POST",
          body: {
            taskId: this._taskId,
            pONumber1: values.join(", "),
            approvalComment: decision.remarks || ""
          }
        });
        this.getView().getModel("decision").setProperty("/workhubSent", true);
        this.showSuccess("PO numbers sent to Workhub");
      } catch (error) {
        this.showError(error);
      } finally {
        this.setBusy(false);
      }
    },

    onReject: function () {
      this.getView().getModel("decision").setData({
        title: "Terminate Request",
        action: "reject",
        remarks: ""
      });
      this.byId("decisionDialog").open();
    },

    onConfirmDecision: async function () {
      const decision = this.getView().getModel("decision").getData();
      const rejecting = decision.action === "reject";
      if (rejecting && !String(decision.remarks || "").trim()) {
        MessageBox.warning("A reason is required to terminate a request.");
        return;
      }
      const purchaseOrderNo = String(decision.purchaseOrderNo || "").trim();
      if (!rejecting && decision.needsPoNumber && !purchaseOrderNo) {
        MessageBox.warning("Enter the Purchase Order number to approve this task.");
        return;
      }
      // Purchase Order, S/4 Data Validation: the first PO Number is mandatory, the others optional.
      const poNumbers = (decision.poNumberList || []).map(function (row) { return String(row.value || "").trim(); });
      if (!rejecting && decision.needsPoNumberList && !poNumbers[0]) {
        MessageBox.warning("Enter the Purchase Order Number to approve this task.");
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
      const sesNumber = String(decision.sesNumber || "").trim();
      if (!rejecting && decision.needsSesNumber && !sesNumber) {
        MessageBox.warning("Enter the SES Number to approve this task.");
        return;
      }
      const poReleasedDate = String(decision.poReleasedDate || "").trim();
      if (!rejecting && decision.needsPoReleasedDate && !poReleasedDate) {
        MessageBox.warning("Enter the PO Released Date to approve this task.");
        return;
      }
      const body = { taskId: this._taskId, remarks: decision.remarks };
      if (!rejecting && decision.needsPoReleasedDate) {
        body.poReleasedDate = poReleasedDate;
      }
      if (!rejecting && decision.needsSesNumber) {
        body.sesNumber = sesNumber;
      }
      if (!rejecting && decision.needsPoNumber) {
        body.purchaseOrderNo = purchaseOrderNo;
      }
      if (!rejecting && decision.needsPoNumberList) {
        body.purchaseOrderNo = poNumbers.filter(Boolean).join("; ");
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
        if (decision.lineEntry.sendAs) {
          // A single value entered in the table (e.g. a PO's PO Number), sent as its own field.
          body[decision.lineEntry.sendAs] = String(rows[0].value).trim();
        } else {
          body.lineValues = JSON.stringify(rows.map(function (row) {
            return { itemId: row.itemId, value: String(row.value).trim() };
          }));
        }
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
        this.showSuccess(rejecting ? "Request terminated" : "Task approved");
        await this.onRefresh();
      } catch (error) {
        this.showError(error);
      } finally {
        this.setBusy(false);
      }
    },

    // Purchase Order Numbers at S/4 Data Validation: + adds a row, the cross removes an added one.
    onAddPoNumber: function () {
      const model = this.getView().getModel("decision");
      if (model.getProperty("/poNumberListLocked")) {
        return;
      }
      model.setProperty("/poNumberList", (model.getProperty("/poNumberList") || []).concat([{ value: "", first: false }]));
    },

    onRemovePoNumber: function (event) {
      const model = this.getView().getModel("decision");
      const index = Number(event.getSource().getBindingContext("decision").getPath().split("/").pop());
      model.setProperty("/poNumberList", (model.getProperty("/poNumberList") || []).filter(function (_row, n) {
        return n !== index;
      }));
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
