sap.ui.define([
  "flowmateca/controller/BaseController",
  "flowmateca/model/FormDefinitions",
  "flowmateca/model/FlowmateRequestFormDefinitions",
  "sap/ui/model/json/JSONModel",
  "sap/ui/layout/form/SimpleForm",
  "sap/m/Label",
  "sap/m/Input",
  "sap/m/TextArea",
  "sap/m/DatePicker",
  "sap/m/CheckBox",
  "sap/m/ComboBox",
  "sap/ui/core/Item",
  "sap/ui/core/ListItem",
  "sap/m/MessageBox",
  "sap/ui/unified/FileUploader",
  "sap/m/Table",
  "sap/m/Column",
  "sap/m/ColumnListItem",
  "sap/m/Text",
  "sap/m/Button",
  "sap/base/Log",
  "sap/m/Panel",
  "sap/m/Toolbar",
  "sap/m/ToolbarSpacer",
  "sap/m/Title",
  "sap/m/ScrollContainer",
  "sap/ui/core/Title",
  "sap/m/HBox",
  "sap/m/VBox",
  "sap/m/Dialog"
], function (
  BaseController,
  FormDefinitions,
  FlowmateRequestFormDefinitions,
  JSONModel,
  SimpleForm,
  Label,
  Input,
  TextArea,
  DatePicker,
  CheckBox,
  ComboBox,
  Item,
  ListItem,
  MessageBox,
  FileUploader,
  Table,
  Column,
  ColumnListItem,
  Text,
  Button,
  Log,
  Panel,
  Toolbar,
  ToolbarSpacer,
  MTitle,
  ScrollContainer,
  FormTitle,
  HBox,
  VBox,
  Dialog
) {
  "use strict";

  // Pick lists maintained by admins in flowmate-common; served by CAMasterDataService,
  // not FlowmateCAService, and they carry no sortOrder column.
  const MASTER_PICK_LISTS = new Set([
    "Plant", "Sites", "StorageLocation", "SalesOrg", "ValuationClass", "ServiceGroups",
    "DocumentTypes", "Divisions", "PurchasingGroups", "Wbs", "Materials", "MatGroup",
    "ProfitCenter", "MRPType", "AvailabilityCheck", "SerialNumberProfile", "DistributionChannel",
    "ArReferences", "Currencies", "UnitsOfMeasure", "ServiceCategories", "ProcurementCategories",
    "PaymentTerms", "Projects", "ItemCategories", "AccountAssignments",
    "ContractType", "PurchasingOrganizations", "CompanyCodes", "Incoterms", "CostCenter", "ApplicableTaxes",
    "BudgetCode"
  ]);

  // Editable row tables on the create page. "items" is the line-item table every multi-line
  // variant uses; "headers" is the extra header-row table of variants such as CONTRACT_NEW.
  // Conditional grids (FormDefinitions.getConditionalGrids) are registered here at runtime
  // with their own columns, driver field and panel.
  const GRIDS = {
    items: { tableId: "itemsTableHost", path: "/details/items" },
    headers: { tableId: "headersTableHost", path: "/details/headers" }
  };

  // These are the repeating sections from Flowmate's request creation form.
  // They are rendered as the same editable table + Add/Edit dialog pattern in
  // the Payment Run dialog, rather than exposing raw JSON to the user.
  const PAYMENT_RUN_GRIDS = {
    invoices: {
      title: "Invoice Details",
      addText: "Add Invoice",
      noDataText: "No invoice details added",
      fields: [
        { name: "invoiceNumber", label: "Invoice Number", type: "input", required: true },
        { name: "invoiceDate", label: "Invoice Date", type: "date", required: true },
        { name: "amount", label: "Amount", type: "number", required: true },
        { name: "vatAmount", label: "VAT Amount", type: "number" },
        { name: "sesReference", label: "SES Reference", type: "input" },
        { name: "remarks", label: "Remarks", type: "textarea" }
      ],
      displayFields: ["invoiceNumber", "invoiceDate", "amount", "vatAmount", "sesReference", "remarks"]
    },
    directForeignTravelEntries: {
      title: "Direct Foreign Travel Entries",
      addText: "Add Travel Entry",
      noDataText: "No travel entries added",
      fields: [
        { name: "travelerName", label: "Traveler Name", type: "input", required: true },
        { name: "category", label: "Category", type: "input" },
        { name: "vendorCode", label: "Vendor Code", type: "input", required: true },
        { name: "ctmProposalNo", label: "CTM Proposal No", type: "input", required: true },
        { name: "purposeOfTravel", label: "Purpose of Travel", type: "textarea", required: true },
        { name: "venue", label: "Venue", type: "input" },
        { name: "departureDateTime", label: "Departure", type: "datetime" },
        { name: "arrivalDateTime", label: "Arrival", type: "datetime" },
        { name: "budgetCode", label: "Budget Code", type: "input" },
        { name: "currency_code", label: "Currency", type: "combo", catalog: "flowmateCurrencies", key: "code", text: "name", secondaryText: "code" },
        { name: "airfare", label: "Airfare", type: "number" },
        { name: "visaFee", label: "Visa Fee", type: "number" },
        { name: "perDayAllowanceUSD", label: "Per Day Allowance (USD)", type: "number", required: true },
        { name: "noOfDays", label: "No. of Days", type: "number", required: true },
        { name: "exchangeRate", label: "Exchange Rate", type: "number" },
        { name: "totalInUSD", label: "Total (USD)", type: "number", readOnly: true },
        { name: "totalInLKR", label: "Total (LKR)", type: "number", readOnly: true },
        { name: "totalCostForeignCurrency", label: "Total Cost (Foreign Currency)", type: "number", readOnly: true },
        { name: "totalCostLKR", label: "Total Cost (LKR)", type: "number", readOnly: true },
        { name: "confirmedTravelItinerary", label: "Confirmed Travel Itinerary", type: "textarea" },
        { name: "selectedScheme", label: "Selected Scheme", type: "input" },
        { name: "personalTravelInvolved", label: "Personal Travel Involved", type: "checkbox" },
        { name: "periodOfPersonalTravel", label: "Period of Personal Travel", type: "input" }
      ],
      displayFields: ["travelerName", "vendorCode", "ctmProposalNo", "purposeOfTravel", "departureDateTime", "arrivalDateTime", "totalCostLKR"]
    },
    travelExpenses: {
      title: "Travel Expenses",
      addText: "Add Travel Expense",
      noDataText: "No travel expenses added",
      fields: [
        { name: "date", label: "Date", type: "date", required: true },
        { name: "particulars", label: "Particulars", type: "input", required: true },
        { name: "transport", label: "Transport", type: "number" },
        { name: "hotel", label: "Hotel / Accommodation", type: "number" },
        { name: "meals", label: "Meals", type: "number" },
        { name: "entertainment", label: "Entertainment", type: "number" },
        { name: "laundry", label: "Laundry", type: "number" },
        { name: "phone", label: "Phone", type: "number" },
        { name: "sundry", label: "Sundry", type: "number" },
        { name: "miscellaneous", label: "Miscellaneous", type: "number" },
        { name: "total", label: "Total", type: "number", readOnly: true }
      ],
      displayFields: ["date", "particulars", "transport", "hotel", "meals", "entertainment", "laundry", "phone", "sundry", "miscellaneous", "total"]
    },
    glBreakups: {
      title: "GL Breakups",
      addText: "Add GL Breakup",
      noDataText: "No GL breakups added",
      fields: [
        { name: "glAccount", label: "GL Account", type: "input", required: true },
        { name: "relevantDescription", label: "Relevant Description", type: "input", required: true },
        { name: "relevantAmount", label: "Relevant Amount", type: "number", required: true },
        { name: "costCentre", label: "Cost Centre", type: "input", required: true },
        { name: "profitCentre", label: "Profit Centre", type: "input" }
      ],
      displayFields: ["glAccount", "relevantDescription", "relevantAmount", "costCentre", "profitCentre"]
    },
    settlementEntries: {
      title: "Settlement Entries",
      addText: "Add Settlement Entry",
      noDataText: "No settlement entries added",
      fields: [
        { name: "paymentRequestRef_ID", label: "Payment Request", type: "input" },
        { name: "paymentRequest", label: "Payment Request Reference", type: "input" },
        { name: "poNumber", label: "PO Number", type: "input" },
        { name: "sesReference", label: "SES Reference", type: "input" },
        { name: "invoiceNumber", label: "Invoice Number", type: "input" },
        { name: "invoiceDate", label: "Invoice Date", type: "date" },
        { name: "description", label: "Description", type: "textarea" },
        { name: "transactionAmountDocumentCurrency", label: "Amount (Document Currency)", type: "number" },
        { name: "transactionAmountLocalCurrency", label: "Amount (Local Currency)", type: "number" },
        { name: "availabilityOfInvoice", label: "Availability of Invoice", type: "checkbox" }
      ],
      displayFields: ["paymentRequest", "poNumber", "sesReference", "invoiceNumber", "invoiceDate", "transactionAmountDocumentCurrency", "transactionAmountLocalCurrency", "availabilityOfInvoice"]
    },
    merchantEntityValues: {
      title: "Merchant Entity Values",
      addText: "Add Merchant Entity",
      noDataText: "No merchant entity values added",
      fields: [
        { name: "businessEntity_code", label: "Entity", type: "combo", catalog: "flowmateFtkEntities", key: "code", text: "name", secondaryText: "code", required: true },
        { name: "totalPayableValue", label: "Total Payable Value", type: "number", required: true }
      ],
      displayFields: ["businessEntity_code", "totalPayableValue"]
    }
  };

  return BaseController.extend("flowmateca.controller.RequestCreate", {
    _conditionalGrids: function () {
      return GRIDS;
    },

    onInit: function () {
      const formModel = new JSONModel(this._emptyForm());
      // PO Value (With Taxes) follows the PO value and the chosen tax; propertyChange fires for
      // every value the user edits through a two-way binding.
      formModel.attachPropertyChange(function (event) {
        // Table cells bind relatively, so resolve against their row context for the full path.
        const context = event.getParameter("context");
        const relative = event.getParameter("path") || "";
        const path = context && relative.charAt(0) !== "/" ? `${context.getPath()}/${relative}` : relative;
        const recalc = path.match(/^(\/details(?:\/bulkRows\/\d+)?)\/(totalValue|applicableTax|taxApplicable)$/);
        if (recalc) {
          this._recalculatePoValueWithTaxes(recalc[1]);
        }
        // "Create SES Successor": ticking opens the SES pop-up, unticking drops the captured SES.
        if (path === "/details/sesRequired") {
          if (event.getParameter("value")) {
            this._openSesDialog();
          } else {
            this._discardSesDraft();
          }
        }
      }, this);
      this.getView().setModel(formModel, "form");
      this.getView().setModel(new JSONModel({
        requestTypes: [],
        variants: [],
        materialCategories: [],
        filteredVariants: [],
        priorities: [],
        myRequests: [],
        teams:[]
      }), "catalog");
      this.getView().setModel(new JSONModel({ items: [] }), "files");
      this.getView().setModel(new JSONModel({ items: [] }), "paymentRunFiles");
      this.getView().setModel(new JSONModel(this._emptyPaymentRunForm()), "paymentRun");
      this.getView().setModel(new JSONModel({}), "paymentRunGridEdit");
      this._paymentRunGridDialogs = {};
      this._flowmateIntegrationMode = "paymentRun";
      this.getRouter().getRoute("requestCreate").attachPatternMatched(this._onRouteMatched, this);
    },

    _emptyPaymentRunForm: function () {
      return {
        processType_code: "",
        processTypeName: "",
        subProcessType_code: "",
        subProcessTypeName: "",
        hasSubProcessTypes: false,
        loaApprovalApplicable: false,
        title: "",
        predecessorDisplay: "",
        priorityConfig_code: "MEDIUM",
        department: "",
        amount: null,
        role: "Payment Run",
        description: "",
        requesterName: "",
        processorTeamName: "",
        processorTeam_ID: "",
        dialogTitle: "Payment Run - Flowmate Request Details",
        dialogInfo: "Complete the Payment Run request details using the same fields as the Flowmate Create Request form. Values are prefilled from this purchase order.",
        attachmentSectionTitle: "Payment Run Attachments",
        selectAttachmentText: "Select Payment Run Files",
        noAttachmentsText: "No Payment Run attachments selected",
        attachmentInfo: "These files are copied to the Flowmate request after the CA request is successfully completed. The maximum size per file is 400 MB.",
        saveText: "Save Payment Run",
        details: {}
      };
    },

    _emptyForm: function () {
      return {
        requestTypeCode: "",
        materialCategoryCode: "",
        requestVariantCode: "",
        title: "",
        description: "",
        dueDate: "",
        predecessorId: "",
        requesterId: "",
        requesterName: "",
        requesterEmail: "",
        requestDateTime: new Date().toLocaleString(),

        bulkUpload: "SINGLE_LINE",
        hasHeaderTable: false,
        offersLineModeChoice: true,
        showsItemsTable: false,
        processorTeamCode: "",
        processorTeamName: "",
        detailSectionTitle: "Process Details",
        details: {},
        sesDraft: this._emptySesDraft()
      };
    },

    // SES captured from a PO's "Create SES Successor" pop-up; kept apart from /details because
    // several SES field names (division, remarks, totalValue, ...) also exist on the PO.
    _emptySesDraft: function () {
      return { details: {}, items: [], files: [], saved: false };
    },

    _onRouteMatched: async function (event) {
      this.getView().getModel("form").setData(this._emptyForm());
      this.getView().getModel("files").setData({ items: [] });
      this.getView().getModel("paymentRun").setData(this._emptyPaymentRunForm());
      this._flowmateIntegrationMode = "paymentRun";
      this._paymentRunSaved = false;
      this._selectedFiles = [];
      this._paymentRunFiles = [];
      this._dynamicFileUploads = {};
      this._sesFiles = [];
      this._sesFileUploads = {};
      await Promise.all([
        this._loadCatalog(),
        this._loadCurrentUser()
      ]);
      
      const query = event.getParameter("arguments")["?query"] || {};
      if (query.requestType) {
        this.getView().getModel("form").setProperty("/requestTypeCode", query.requestType);
        this._filterVariants(query.requestType);
      }
      this._renderDynamicForm();
      this._renderItemsTable();
    },
    onProcessorTeamChange: function (event) {

    const selectedItem =
        event.getParameter("selectedItem");

    if (!selectedItem) {
        return;
    }

    const team = 
    selectedItem
            .getBindingContext("catalog")
            .getObject();

    const formModel =
        this.getView().getModel("form");

    formModel.setProperty(
        "/processorTeamCode",
        team.teamCode
    );

    formModel.setProperty(
        "/processorTeamName",
        team.name
    );
},

    _loadCatalog: async function () {
      this.setBusy(true);
      try {
        const [types, variants, materialCategories, priorities, requests, teams, stepConfigs] = await Promise.all([
          this.request("RequestTypes?$filter=isActive eq true&$orderby=sortOrder"),
          this.request("RequestVariants?$filter=isActive eq true&$orderby=sortOrder"),
          this.request("MaterialCategories?$filter=isActive eq true&$orderby=sortOrder"),
          this.request("Priorities?$filter=isActive eq true&$orderby=sortOrder"),
          this.request("MyRequests?$select=ID,referenceNumber,title&$orderby=createdAt desc&$top=100"),
          this.request("Teams?$filter=isActive eq true&$orderby=name"),
          this.request("WorkflowStepConfigs?$select=processorTeam_ID&$filter=isActive eq true")
        ]);
        const catalog = this.getView().getModel("catalog");
        catalog.setProperty("/requestTypes", types.value || []);
        catalog.setProperty("/variants", variants.value || []);
        catalog.setProperty("/materialCategories", materialCategories.value || []);
        catalog.setProperty("/priorities", priorities.value || []);
        catalog.setProperty("/myRequests", requests.value || []);
        // Only teams that a workflow step actually routes to are selectable as the processor
        // team. flowmate-common carries the full Dialog org (110+ teams); offering all of them
        // here is noise, since the rest never receive a task.
        const workflowTeamIds = new Set((stepConfigs.value || [])
          .map(function (config) { return config.processorTeam_ID; })
          .filter(Boolean));
        const allTeams = teams.value || [];
        const processorTeams = allTeams.filter(function (team) { return workflowTeamIds.has(team.ID); });
        catalog.setProperty("/teams", processorTeams.length ? processorTeams : allTeams);
      } catch (error) {
        this.showError(error);
      } finally {
        this.setBusy(false);
      }
    },

    _loadCurrentUser: async function () {

    try {

        const user = await this.request(
            "getCurrentUser"
        );

        const formModel =
            this.getView().getModel("form");

        formModel.setProperty(
            "/requesterId",
            user.ID
        );

        formModel.setProperty(
            "/requesterName",
            user.displayName
        );

        formModel.setProperty(
            "/requesterEmail",
            user.email
        );

    } catch (error) {

        this.showError(error);
    }
},

    onRequestTypeChange: function () {
      const typeCode = this.getView().getModel("form").getProperty("/requestTypeCode");
      this.getView().getModel("form").setProperty("/materialCategoryCode", "");
      this.getView().getModel("form").setProperty("/requestVariantCode", "");
      this.getView().getModel("form").setProperty("/details", {});
      this._discardSesDraft();
      this._filterVariants(typeCode);
      this._renderDynamicForm();
      this._renderItemsTable();
    },

    onBulkUploadChange: async function () {
      await this._renderDynamicForm();
      this._renderItemsTable();
    },

    _groupItemsBySite: function (items) {
      const groups = new Map();
      items.forEach(function (row) {
        const siteId = String(row.siteId || "").trim();
        if (!groups.has(siteId)) {
          groups.set(siteId, { siteId: siteId, siteName: row.siteName || siteId, items: [] });
        }
        groups.get(siteId).items.push(row);
      });
      return Array.from(groups.values());
    },


    _submitBulk: async function (form) {
      const items = (form.details && form.details.items) || [];
      if (!items.length) {
        MessageBox.warning("Add at least one line item before submitting.");
        return;
      }
      const unsited = items.findIndex(function (row) {
        return !String(row.siteId || "").trim();
      });
      if (unsited >= 0) {
        MessageBox.warning(`Row ${unsited + 1}: Site ID is required to group the requests.`);
        return;
      }
      const missing = this._firstMissingItemCell(items);
      if (missing) {
        MessageBox.warning(missing);
        return;
      }

      const details = form.details || {};
      const headerFields = {};
      Object.keys(details).forEach(function (key) {
        if (key !== "items") {
          headerFields[key] = details[key];
        }
      });

      const rows = this._groupItemsBySite(items).map(function (group) {
        return Object.assign({}, headerFields, {
          title: `Material Reservation - ${group.siteName}`,
          dueDate: form.dueDate || null,
          items: group.items.map(function (row, index) {
            return Object.assign({}, row, { itemNo: index + 1 });
          })
        });
      });

      this.setBusy(true);
      try {
        const result = await this.request("createBulkRequests", {
          method: "POST",
          body: {
            input: {
              requestTypeCode: form.requestTypeCode,
              requestVariantCode: form.requestVariantCode,
              processorTeamCode: form.processorTeamCode,
              rows: JSON.stringify(rows)
            }
          }
        });
        this.showSuccess(`${result.created} request(s) created from ${items.length} line item(s)`);
        this.navTo("requests");
      } catch (error) {
        this.showError(error);
      } finally {
        this.setBusy(false);
      }
    },

    _filterVariants: function (typeCode) {
      const catalog = this.getView().getModel("catalog");
      const variants = catalog.getProperty("/variants") || [];
      catalog.setProperty("/filteredVariants", variants.filter(function (variant) {
        return variant.requestType_code === typeCode;
      }));
    },

    onRequestVariantChange: async function () {
      this.getView().getModel("form").setProperty("/details", {});
      this._discardSesDraft();
      await this._renderDynamicForm();
      this._renderItemsTable();
    },

    onMaterialCategoryChange: async function () {
      this.getView().getModel("form").setProperty("/requestVariantCode", "");
      this.getView().getModel("form").setProperty("/details", {});
      await this._renderDynamicForm();
    },

    _renderDynamicForm: async function () {
      const host = this.byId("dynamicFormHost");
      host.destroyItems();
      this._fieldControls = [];
      this._dynamicFileUploads = {};
      const formModel = this.getView().getModel("form");
      const typeCode = formModel.getProperty("/requestTypeCode");
      const variantCode = formModel.getProperty("/requestVariantCode");
      const categoryCode = formModel.getProperty("/materialCategoryCode");
      // Header-table variants have no Single/Multiple choice: their form keeps every field.
      const multipleItems = !FormDefinitions.hasHeaderTable(variantCode)
        && (formModel.getProperty("/bulkUpload") === "MULTIPLE_LINE" || typeCode === "MATERIAL_RESERVATION");
      let fields = [];
      if (variantCode && this._isPoBulk()) {
        // Bulk Request = Multiple: the PO details go into the table; only the shared section stays.
        fields = FormDefinitions.getBulkSharedFields(typeCode);
      } else if (variantCode) {
        fields = multipleItems
          ? FormDefinitions.getHeaderFields(typeCode, variantCode, categoryCode)
          : FormDefinitions.getFields(variantCode, categoryCode, formModel.getProperty("/bulkUpload"));
      }
      const type = (this.getView().getModel("catalog").getProperty("/requestTypes") || [])
        .find(function (entry) {
          return entry.code === typeCode;
        });
      formModel.setProperty("/detailSectionTitle", type ? `${type.name} Details` : "Process Details");

      if (!fields.length) {
        return;
      }

      fields.forEach(function (definition) {
        if (!definition.defaultValue) {
          return;
        }
        const path = `/details/${definition.name}`;
        if (!formModel.getProperty(path)) {
          formModel.setProperty(path, definition.defaultValue);
        }
      });

      await this._loadFieldCatalogs(fields);
      // One form per section, stacked top to bottom. A single ColumnLayout form would place
      // each titled section in its own column, side by side. Fields without a section share
      // one untitled form.
      const formsBySection = new Map();
      fields.forEach(function (definition) {
        const section = definition.section || "";
        if (!formsBySection.has(section)) {
          const simpleForm = new SimpleForm({
            editable: true,
            layout: "ColumnLayout",
            columnsXL: 3,
            columnsL: 3,
            columnsM: 2,
            labelSpanXL: 12,
            labelSpanL: 12,
            labelSpanM: 12
          });
          if (section) {
            simpleForm.setTitle(new FormTitle({ text: section }));
          }
          formsBySection.set(section, simpleForm);
          host.addItem(simpleForm);
        }
        const label = new Label({
          text: definition.label,
          required: definition.required
        });
        const control = this._createFieldControl(definition);
        formsBySection.get(section).addContent(label);
        formsBySection.get(section).addContent(control);
        this._fieldControls.push({
          definition,
          label,
          control
        });
      }.bind(this));
      this._applyConditionalVisibility();
    },






    // PO Value (With Taxes) = PO Value (Without Taxes) x (1 + rate / 100), the rate taken from
    // the selected Admin tax. Without an applicable tax it equals the PO value.
    // basePath is "/details" for the single form, or "/details/bulkRows/<n>" for a row of the
    // Bulk Request table. In the table Applicable Tax is a plain optional column, so a chosen tax
    // applies without the Tax Applicable tick.
    _recalculatePoValueWithTaxes: function (basePath) {
      const formModel = this.getView().getModel("form");
      if (formModel.getProperty("/requestTypeCode") !== "PURCHASE_ORDER") {
        return;
      }
      const base = basePath || "/details";
      const details = formModel.getProperty(base) || {};
      const value = parseFloat(details.totalValue);
      if (isNaN(value)) {
        formModel.setProperty(`${base}/poValueWithTaxes`, "");
        return;
      }
      const taxOn = base === "/details" ? details.taxApplicable : true;
      let rate = 0;
      if (taxOn && details.applicableTax) {
        const tax = (this.getView().getModel("catalog").getProperty("/ApplicableTaxes") || [])
          .find(function (row) { return row.taxCode === details.applicableTax; });
        rate = Number(tax && tax.taxRate) || 0;
      }
      formModel.setProperty(`${base}/poValueWithTaxes`, (Math.round(value * (1 + rate / 100) * 100) / 100).toFixed(2));
    },

    // ---- "Create SES Successor" pop-up (Purchase Order) ----------------------------------------
    // The SES is captured here and stored with the PO; the server creates the SES request when
    // the PO workflow completes. The fields are the Single SES New request form; the Purchase
    // Order Number is left out because it is filled from the PO's last approval.
    _sesDialogFields: function () {
      return FormDefinitions.getFields("SES_NEW", undefined, "SINGLE_LINE").filter(function (definition) {
        return definition.source !== "request" && definition.name !== "purchaseOrderNo";
      });
    },

    _openSesDialog: async function () {
      const dialog = this.byId("sesSuccessorDialog");
      const formModel = this.getView().getModel("form");
      if (!dialog || formModel.getProperty("/requestTypeCode") !== "PURCHASE_ORDER") {
        return;
      }
      const fields = this._sesDialogFields();
      const columns = FormDefinitions.getItemColumns("SERVICE_ENTRY_SHEET", "SES_NEW");
      await this._loadFieldCatalogs(fields.concat(columns));

      const formHost = this.byId("sesFormHost");
      formHost.destroyItems();
      this._sesControls = [];
      const simpleForm = new SimpleForm({
        editable: true,
        layout: "ColumnLayout",
        columnsXL: 3,
        columnsL: 3,
        columnsM: 2,
        labelSpanXL: 12,
        labelSpanL: 12,
        labelSpanM: 12
      });
      fields.forEach(function (definition) {
        const control = this._createFieldControl(definition, `form>/sesDraft/details/${definition.name}`, this._sesFileUploads);
        const chosenFile = definition.type === "file" && formModel.getProperty(`/sesDraft/details/${definition.name}`);
        if (chosenFile) {
          control.setValue(chosenFile);
        }
        simpleForm.addContent(new Label({ text: definition.label, required: definition.required }));
        simpleForm.addContent(control);
        this._sesControls.push({ definition, control });
      }.bind(this));
      formHost.addItem(simpleForm);

      const itemsHost = this.byId("sesItemsHost");
      itemsHost.destroyItems();
      GRIDS.sesItems = { tableId: "sesItemsTable", path: "/sesDraft/items", columns, title: "SES Line Items" };
      GRIDS.sesItems.panel = this._buildGridPanel("sesItems");
      GRIDS.sesItems.panel.setVisible(true);
      itemsHost.addItem(GRIDS.sesItems.panel);
      this._renderGrid("sesItems");
      dialog.open();
    },

    onEditSesDraft: function () {
      this._openSesDialog();
    },

    onSesFilesSelected: function (event) {
      this._sesFiles = Array.from(event.getParameter("files") || []);
      this.getView().getModel("form").setProperty("/sesDraft/files", this._sesFiles.map(function (file) {
        return { name: file.name, sizeText: `${(file.size / 1024 / 1024).toFixed(2)} MB` };
      }));
    },

    onSaveSesDraft: function () {
      const formModel = this.getView().getModel("form");
      const draft = formModel.getProperty("/sesDraft");
      const missing = (this._sesControls || []).find(function (entry) {
        const value = draft.details[entry.definition.name];
        return entry.definition.required && (value === undefined || value === null || value === "");
      });
      if (missing) {
        MessageBox.warning(`${missing.definition.label} is required.`);
        missing.control.focus();
        return;
      }
      if (!(draft.items || []).length) {
        MessageBox.warning("Add at least one SES line item.");
        return;
      }
      const missingCell = this._firstMissingItemCell(draft.items, GRIDS.sesItems.columns);
      if (missingCell) {
        MessageBox.warning(`SES Line Items - ${missingCell}`);
        return;
      }
      formModel.setProperty("/sesDraft/saved", true);
      this.byId("sesSuccessorDialog").close();
    },

    onCancelSesDraft: function () {
      this.byId("sesSuccessorDialog").close();
    },

    // Closing without ever saving (Cancel or Escape) means no SES successor: untick the box.
    onSesDialogAfterClose: function () {
      const formModel = this.getView().getModel("form");
      if (!formModel.getProperty("/sesDraft/saved")) {
        formModel.setProperty("/details/sesRequired", false);
        this._discardSesDraft();
      }
    },

    _discardSesDraft: function () {
      this.getView().getModel("form").setProperty("/sesDraft", this._emptySesDraft());
      this._sesFiles = [];
      this._sesFileUploads = {};
    },

    // The captured SES as stored on the PO (blank values sent as null).
    _sesDraftPayload: function (draft) {
      const blankToNull = function (row) {
        const clean = {};
        Object.keys(row || {}).forEach(function (key) {
          clean[key] = row[key] === "" ? null : row[key];
        });
        return clean;
      };
      return JSON.stringify(Object.assign(blankToNull(draft.details), {
        items: (draft.items || []).map(blankToNull)
      }));
    },

    _loadFlowmateRequestFormCatalog: async function () {
      if (this._flowmateRequestFormCatalog) {
        return this._flowmateRequestFormCatalog;
      }
      const result = await this.request("getFlowmateRequestFormCatalog()");
      const raw = typeof result === "string" ? result : (result && result.value) || result;
      const catalog = typeof raw === "string" ? JSON.parse(raw) : (raw || {});
      const model = this.getView().getModel("catalog");
      Object.keys(catalog || {}).forEach(function (key) {
        model.setProperty(`/flowmate${key.charAt(0).toUpperCase()}${key.slice(1)}`, catalog[key] || []);
      });
      this._flowmateRequestFormCatalog = catalog || {};
      return this._flowmateRequestFormCatalog;
    },

    _flowmateIntegrationConfig: function () {
      if (this._flowmateIntegrationMode === "serviceEntrySheet") {
        return {
          flag: "flowmateSesRequest",
          detailsField: "flowmateSesRequestDetails",
          role: "Service Entry Sheet",
          dialogTitle: "Service Entry Sheet - Flowmate Request Details",
          dialogInfo: "Complete the Service Entry Sheet request details using the same fields as the Flowmate Create Request form. Values are prefilled from this service entry sheet.",
          attachmentSectionTitle: "Service Entry Sheet Attachments",
          selectAttachmentText: "Select Service Entry Sheet Files",
          noAttachmentsText: "No Service Entry Sheet attachments selected",
          attachmentInfo: "These files are copied to the Flowmate request after the CA request is successfully completed. The maximum size per file is 400 MB.",
          saveText: "Save Service Entry Sheet",
          attachmentCategory: "FLOWMATE_SES",
          action: "createFlowmateServiceEntrySheet",
          warning: "Select at least one attachment for the Flowmate Service Entry Sheet request."
        };
      }
      return {
        flag: "paymentRun",
        detailsField: "paymentRunDetails",
        role: "Payment Run",
        dialogTitle: "Payment Run - Flowmate Request Details",
        dialogInfo: "Complete the Payment Run request details using the same fields as the Flowmate Create Request form. Values are prefilled from this purchase order.",
        attachmentSectionTitle: "Payment Run Attachments",
        selectAttachmentText: "Select Payment Run Files",
        noAttachmentsText: "No Payment Run attachments selected",
        attachmentInfo: "These files are copied to the Flowmate request after the CA request is successfully completed. The maximum size per file is 400 MB.",
        saveText: "Save Payment Run",
        attachmentCategory: "PAYMENT_RUN",
        action: "createFlowmatePaymentRun",
        warning: "Select at least one attachment for the Flowmate Payment Run request."
      };
    },

    _paymentRunContext: function () {
      const form = this.getView().getModel("form").getData();
      const details = form.details || {};
      const config = this._flowmateIntegrationConfig();
      let saved = {};
      if (details[config.detailsField]) {
        try {
          saved = typeof details[config.detailsField] === "string"
            ? JSON.parse(details[config.detailsField])
            : details[config.detailsField];
        } catch (_error) {
          saved = {};
        }
      }
      return Object.assign(this._emptyPaymentRunForm(), {
        title: form.title || "",
        priorityConfig_code: form.priorityCode || "MEDIUM",
        department: details.division || details.companyCode || "",
        amount: details.totalValue === undefined || details.totalValue === null
          ? (details.poValueWithTaxes === undefined || details.poValueWithTaxes === null
            ? null
            : details.poValueWithTaxes)
          : details.totalValue,
        role: config.role,
        description: form.description || details.procurementDescription || "",
        requesterName: form.requesterName || "",
        processorTeamName: form.processorTeamName || "",
        processorTeam_ID: form.processorTeamCode || "",
        dialogTitle: config.dialogTitle,
        dialogInfo: config.dialogInfo,
        attachmentSectionTitle: config.attachmentSectionTitle,
        selectAttachmentText: config.selectAttachmentText,
        noAttachmentsText: config.noAttachmentsText,
        attachmentInfo: config.attachmentInfo,
        saveText: config.saveText
      }, saved);
    },

    _paymentRunFormValue: function (path, properties) {
      return new Input(Object.assign({ width: "100%" }, properties || {}))
        .bindValue(`paymentRun>/${path}`);
    },

    _paymentRunGridField: function (definition, path, modelName) {
      const modelPath = `${modelName}>/${path}`;
      if (definition.type === "date") {
        return new DatePicker({
          width: "100%",
          valueFormat: "yyyy-MM-dd",
          displayFormat: "medium"
        }).bindValue(modelPath);
      }
      if (definition.type === "datetime") {
        return new Input({ width: "100%", placeholder: "YYYY-MM-DDTHH:mm:ss" }).bindValue(modelPath);
      }
      if (definition.type === "textarea") {
        return new TextArea({ rows: 3, width: "100%" }).bindValue(modelPath);
      }
      if (definition.type === "checkbox") {
        return new CheckBox().bindProperty("selected", modelPath);
      }
      if (definition.type === "combo") {
        return new ComboBox({
          width: "100%",
          showSecondaryValues: true,
          filterSecondaryValues: true,
          items: {
            path: `catalog>/${definition.catalog}`,
            templateShareable: true,
            template: new ListItem({
              key: `{catalog>${definition.key || "code"}}`,
              text: `{catalog>${definition.text || "name"}}`,
              additionalText: `{catalog>${definition.secondaryText || "code"}}`
            })
          }
        }).bindProperty("selectedKey", modelPath);
      }
      return new Input({
        width: "100%",
        editable: definition.readOnly !== true,
        type: definition.type === "number" ? "Number" : "Text"
      }).bindValue(modelPath);
    },

    _paymentRunGridDefault: function (definition) {
      const data = { dialogTitle: "" };
      definition.fields.forEach(function (field) {
        data[field.name] = field.type === "checkbox" ? false : (field.type === "number" || field.type === "date" ? null : "");
      });
      return data;
    },

    _isPaymentRunInvoiceVatSesVisible: function (subtype) {
      return subtype === "PO_BEFORE_INVOICE_NON_ADV" || subtype === "PO_BEFORE_INVOICE_NON_ADV_LIAB" ||
        subtype === "PO_AFTER_INVOICE_NON_ADV" || subtype === "PO_AFTER_INVOICE_NON_ADV_LIAB" ||
        subtype === "PO_BEFORE_INVOICE_ADV_STLMT" || subtype === "PO_BEFORE_INVOICE_ADV_STLMT_100%" ||
        subtype === "PO_AFTER_INVOICE_ADV_STLMT" || subtype === "PO_AFTER_INVOICE_ADV_STLMT_100%";
    },

    _openPaymentRunGridDialog: function (gridName, index) {
      const definition = PAYMENT_RUN_GRIDS[gridName];
      if (!definition) {
        return;
      }
      const model = this.getView().getModel("paymentRunGridEdit");
      const rows = this.getView().getModel("paymentRun").getProperty(`/details/${gridName}`) || [];
      const data = Object.assign(this._paymentRunGridDefault(definition), index >= 0 ? (rows[index] || {}) : {});
      data.dialogTitle = `${index >= 0 ? "Edit" : "Add"} ${definition.title}`;
      data._editIndex = index >= 0 ? index : null;
      model.setData(data);

      if (!this._paymentRunGridDialogs[gridName]) {
        const form = new SimpleForm({
          editable: true,
          layout: "ResponsiveGridLayout",
          labelSpanXL: 4,
          labelSpanL: 4,
          labelSpanM: 4,
          columnsXL: 2,
          columnsL: 2,
          columnsM: 1,
          adjustLabelSpan: false
        });
        definition.fields.forEach(function (field) {
          const isInvoiceVatSes = gridName === "invoices" && (field.name === "vatAmount" || field.name === "sesReference");
          const label = new Label({ text: field.label, required: !!field.required });
          const control = this._paymentRunGridField(field, field.name, "paymentRunGridEdit");
          if (isInvoiceVatSes) {
            const visibility = {
              path: "paymentRun>/subProcessType_code",
              formatter: this._isPaymentRunInvoiceVatSesVisible.bind(this)
            };
            label.bindProperty("visible", visibility);
            control.bindProperty("visible", visibility);
            label.bindProperty("required", visibility);
          }
          form.addContent(label);
          form.addContent(control);
        }.bind(this));
        const dialog = new Dialog({
          title: "{paymentRunGridEdit>/dialogTitle}",
          contentWidth: "48rem",
          stretchOnPhone: true,
          content: [form],
          beginButton: new Button({
            text: "Save",
            type: "Emphasized",
            press: function () {
              this._savePaymentRunGridRow(gridName, dialog);
            }.bind(this)
          }),
          endButton: new Button({ text: "Cancel", press: function () { dialog.close(); } })
        });
        this.getView().addDependent(dialog);
        this._paymentRunGridDialogs[gridName] = dialog;
      }
      this._paymentRunGridDialogs[gridName].open();
    },

    _paymentRunGridValueMissing: function (value, definition) {
      if (definition.type === "checkbox") {
        return false;
      }
      return value === undefined || value === null || String(value).trim() === "";
    },

    _savePaymentRunGridRow: function (gridName, dialog) {
      const definition = PAYMENT_RUN_GRIDS[gridName];
      const model = this.getView().getModel("paymentRunGridEdit");
      const data = model.getData();
      const missing = definition.fields.find(function (field) {
        return field.required && this._paymentRunGridValueMissing(data[field.name], field);
      }.bind(this));
      const subtype = this.getView().getModel("paymentRun").getProperty("/subProcessType_code");
      const requiresVatSes = gridName === "invoices" && (
        subtype === "PO_BEFORE_INVOICE_NON_ADV" || subtype === "PO_BEFORE_INVOICE_NON_ADV_LIAB" ||
        subtype === "PO_AFTER_INVOICE_NON_ADV" || subtype === "PO_AFTER_INVOICE_NON_ADV_LIAB" ||
        subtype === "PO_BEFORE_INVOICE_ADV_STLMT" || subtype === "PO_BEFORE_INVOICE_ADV_STLMT_100%" ||
        subtype === "PO_AFTER_INVOICE_ADV_STLMT" || subtype === "PO_AFTER_INVOICE_ADV_STLMT_100%"
      );
      if (missing || (requiresVatSes && (
        this._paymentRunGridValueMissing(data.vatAmount, { type: "number" }) ||
        this._paymentRunGridValueMissing(data.sesReference, { type: "input" })
      ))) {
        MessageBox.warning(requiresVatSes && gridName === "invoices"
          ? "Invoice date, number, amount, VAT amount and SES reference are required."
          : `${(missing || {}).label || "Please complete the required fields."} ` + (missing ? "is required." : ""));
        return;
      }

      const row = {};
      definition.fields.forEach(function (field) {
        let value = data[field.name];
        if (field.type === "number") {
          value = value === "" || value === null || value === undefined ? null : Number(value);
        } else if (field.type === "checkbox") {
          value = Boolean(value);
        } else if (typeof value === "string") {
          value = value.trim();
        }
        row[field.name] = value;
      });
      if (gridName === "invoices") {
        row.subProcessType_code = subtype;
        if (!this._isPaymentRunInvoiceVatSesVisible(subtype)) {
          row.vatAmount = null;
          row.sesReference = "";
        }
      }
      if (gridName === "travelExpenses") {
        row.total = ["transport", "hotel", "meals", "entertainment", "laundry", "phone", "sundry", "miscellaneous"]
          .reduce(function (sum, name) { return sum + (Number(row[name]) || 0); }, 0);
      }
      if (gridName === "directForeignTravelEntries") {
        const days = Number(row.noOfDays) || 0;
        const perDay = Number(row.perDayAllowanceUSD) || 0;
        const exchange = Number(row.exchangeRate) || 0;
        const totalUsd = perDay * days;
        const foreign = (Number(row.airfare) || 0) + (Number(row.visaFee) || 0) + totalUsd;
        row.totalInUSD = totalUsd;
        row.totalInLKR = totalUsd * exchange;
        row.totalCostForeignCurrency = foreign;
        row.totalCostLKR = foreign * exchange;
      }
      const paymentRun = this.getView().getModel("paymentRun");
      // Do not mutate the bound array before publishing the saved row.
      const rows = (paymentRun.getProperty(`/details/${gridName}`) || []).slice();
      if (data._editIndex !== undefined && data._editIndex !== null && data._editIndex >= 0) {
        rows[data._editIndex] = row;
      } else {
        rows.push(row);
      }
      // Refresh table bindings on the next turn so nested-dialog closure is not
      // interrupted by synchronous table rendering or focus handling.
      paymentRun.setProperty(`/details/${gridName}`, rows, null, true);
      if (gridName === "invoices") {
        const amounts = rows.map(function (entry) { return Number(entry.amount); }).filter(Number.isFinite);
        paymentRun.setProperty("/details/highestInvoiceValue", amounts.length ? Math.max.apply(null, amounts) : null, null, true);
      }
      (dialog || this._paymentRunGridDialogs[gridName]).close();
    },

    _onPaymentRunGridEdit: function (gridName, event) {
      const context = event.getSource().getBindingContext("paymentRun");
      const path = context && context.getPath();
      this._openPaymentRunGridDialog(gridName, path ? Number(path.split("/").pop()) : -1);
    },

    _onPaymentRunGridDelete: function (gridName, event) {
      const context = event.getSource().getBindingContext("paymentRun");
      const path = context && context.getPath();
      const index = path ? Number(path.split("/").pop()) : -1;
      if (index < 0) {
        return;
      }
      MessageBox.confirm("Delete this entry?", {
        onClose: function (action) {
          if (action === MessageBox.Action.OK) {
            const model = this.getView().getModel("paymentRun");
            const rows = model.getProperty(`/details/${gridName}`) || [];
            rows.splice(index, 1);
            model.setProperty(`/details/${gridName}`, rows);
            if (gridName === "invoices") {
              const amounts = rows.map(function (entry) { return Number(entry.amount); }).filter(Number.isFinite);
              model.setProperty("/details/highestInvoiceValue", amounts.length ? Math.max.apply(null, amounts) : null);
            }
          }
        }.bind(this)
      });
    },

    _paymentRunGridPanel: function (gridName, definition) {
      const table = new Table({
        width: "100%",
        fixedLayout: false,
        noDataText: definition.noDataText,
        items: {
          path: `paymentRun>/details/${gridName}`,
          templateShareable: false,
          template: new ColumnListItem({
            cells: definition.displayFields.map(function (fieldName) {
              const cell = new Text({ wrapping: true }).bindText(`paymentRun>${fieldName}`);
              if (gridName === "invoices" && (fieldName === "vatAmount" || fieldName === "sesReference")) {
                cell.bindProperty("visible", {
                  path: "paymentRun>/subProcessType_code",
                  formatter: function (subtype) {
                    return this._isPaymentRunInvoiceVatSesVisible(subtype);
                  }.bind(this)
                });
              }
              return cell;
            }).concat([
              new HBox({
                justifyContent: "Center",
                items: [
                  new Button({ icon: "sap-icon://edit", type: "Transparent", tooltip: "Edit", press: this._onPaymentRunGridEdit.bind(this, gridName) }),
                  new Button({ icon: "sap-icon://delete", type: "Transparent", tooltip: "Delete", press: this._onPaymentRunGridDelete.bind(this, gridName) })
                ]
              })
            ])
          })
        }
      });
      definition.displayFields.forEach(function (fieldName) {
        const field = definition.fields.find(function (entry) { return entry.name === fieldName; });
        const column = new Column({ width: fieldName === "remarks" || fieldName === "description" ? "14rem" : "9rem", header: new Text({ text: field ? field.label : fieldName, wrapping: true }) });
        if (gridName === "invoices" && (fieldName === "vatAmount" || fieldName === "sesReference")) {
          column.bindProperty("visible", {
            path: "paymentRun>/subProcessType_code",
            formatter: function (subtype) {
              return this._isPaymentRunInvoiceVatSesVisible(subtype);
            }.bind(this)
          });
        }
        table.addColumn(column);
      });
      table.addColumn(new Column({ width: "6rem", hAlign: "Center", header: new Text({ text: "Actions" }) }));
      return new Panel({
        expandable: false,
        class: "sapUiSmallMarginTop",
        headerToolbar: new Toolbar({
          content: [
            new MTitle({ text: definition.title, level: "H4" }),
            new ToolbarSpacer(),
            new Button({ text: definition.addText, icon: "sap-icon://add", type: "Emphasized", press: this._openPaymentRunGridDialog.bind(this, gridName, -1) })
          ]
        }),
        content: [new ScrollContainer({ horizontal: true, vertical: false, width: "100%", content: [table] })]
      });
    },

    _addPaymentRunField: function (form, definition) {
      const catalog = this.getView().getModel("catalog");
      const path = `paymentRun>/details/${definition.name}`;
      let control;
      if (definition.type === "readonly") {
        control = new Input({ editable: false, width: "100%" }).bindValue(path);
      } else if (definition.type === "textarea" || definition.type === "json") {
        control = new TextArea({
          rows: 4,
          width: "100%",
          placeholder: ""
        }).bindValue(path);
      } else if (definition.type === "date") {
        control = new DatePicker({ valueFormat: "yyyy-MM-dd", displayFormat: "medium" }).bindValue(path);
      } else if (definition.type === "checkbox") {
        control = new CheckBox().bindProperty("selected", path);
      } else if (definition.type === "combo") {
        control = new ComboBox({
          width: "100%",
          showSecondaryValues: true,
          filterSecondaryValues: true,
          items: {
            path: `catalog>/${definition.catalog}`,
            templateShareable: true,
            template: new ListItem({
              key: `{catalog>${definition.key || "code"}}`,
              text: `{catalog>${definition.text || "name"}}`,
              additionalText: `{catalog>${definition.secondaryText || "code"}}`
            })
          },
          selectionChange: function (event) {
            const item = event.getParameter("selectedItem");
            const row = item && item.getBindingContext("catalog")
              ? item.getBindingContext("catalog").getObject()
              : null;
            if (row && definition.autoFills) {
              Object.keys(definition.autoFills).forEach(function (target) {
                this.getView().getModel("paymentRun").setProperty(
                  `/details/${target}`,
                  row[definition.autoFills[target]] || ""
                );
              }.bind(this));
            }
          }.bind(this)
        }).bindProperty("selectedKey", path);
      } else {
        control = new Input({
          width: "100%",
          type: definition.type === "number" ? "Number" : "Text"
        }).bindValue(path);
      }
      form.addContent(new Label({ text: definition.label, required: !!definition.required }));
      form.addContent(control);
      this._paymentRunFieldControls.push({ definition, control });
    },

    _renderPaymentRunDetails: function () {
      const host = this.byId("paymentRunDetailsHost");
      if (!host) {
        return;
      }
      host.destroyItems();
      this._paymentRunFieldControls = [];
      this._paymentRunRequiredGrids = [];
      const code = this.getView().getModel("paymentRun").getProperty("/subProcessType_code");
      if (!code) {
        return;
      }
      const form = new SimpleForm({
        editable: true,
        layout: "ResponsiveGridLayout",
        labelSpanXL: 4,
        labelSpanL: 4,
        labelSpanM: 4,
        columnsXL: 2,
        columnsL: 2,
        columnsM: 1,
        adjustLabelSpan: false
      });
      form.setTitle(new FormTitle({ text: "Flowmate Process Details" }));
      const grids = [];
      FlowmateRequestFormDefinitions.getFields(code).forEach(function (definition) {
        if (definition.type === "grid" && PAYMENT_RUN_GRIDS[definition.name]) {
          const detailsPath = `/details/${definition.name}`;
          if (!Array.isArray(this.getView().getModel("paymentRun").getProperty(detailsPath))) {
            this.getView().getModel("paymentRun").setProperty(detailsPath, []);
          }
          if (definition.required) {
            this._paymentRunRequiredGrids.push(definition);
          }
          grids.push(definition.name);
          return;
        }
        this._addPaymentRunField(form, definition);
      }.bind(this));
      host.addItem(form);
      grids.forEach(function (gridName) {
        host.addItem(this._paymentRunGridPanel(gridName, PAYMENT_RUN_GRIDS[gridName]));
      }.bind(this));
    },

    _renderPaymentRunDialogForm: function () {
      const host = this.byId("paymentRunFormHost");
      if (!host) {
        return;
      }
      host.destroyItems();
      const form = new SimpleForm({
        editable: true,
        layout: "ResponsiveGridLayout",
        labelSpanXL: 4,
        labelSpanL: 4,
        labelSpanM: 4,
        columnsXL: 2,
        columnsL: 2,
        columnsM: 1,
        adjustLabelSpan: false
      });
      form.setTitle(new FormTitle({ text: "Request Overview" }));
      const add = function (label, control, required) {
        form.addContent(new Label({ text: label, required: !!required }));
        form.addContent(control);
      };
      const processTypes = new ComboBox({
        width: "100%",
        showSecondaryValues: true,
        items: {
          path: "catalog>/flowmateProcessTypes",
          templateShareable: true,
          template: new ListItem({
            key: "{catalog>code}",
            text: "{catalog>name}",
            additionalText: "{catalog>code}"
          })
        },
        selectionChange: this.onPaymentRunProcessTypeChange.bind(this)
      }).bindProperty("selectedKey", "paymentRun>/processType_code");
      const subProcessTypes = new ComboBox({
        width: "100%",
        showSecondaryValues: true,
        items: {
          path: "catalog>/flowmateProcessSubTypesFiltered",
          templateShareable: true,
          template: new ListItem({
            key: "{catalog>code}",
            text: "{catalog>name}",
            additionalText: "{catalog>code}"
          })
        },
        selectionChange: this.onPaymentRunSubProcessTypeChange.bind(this)
      }).bindProperty("selectedKey", "paymentRun>/subProcessType_code");
      add("Process Type", processTypes, true);
      add("Sub Process Type", subProcessTypes, true);
      add("Request Title", this._paymentRunFormValue("title"), true);
      add("Linked Request", this._paymentRunFormValue("predecessorDisplay", { editable: false }));
      const priority = new ComboBox({
        width: "100%",
        items: {
          path: "catalog>/flowmatePriorities",
          templateShareable: true,
          template: new ListItem({
            key: "{catalog>code}",
            text: "{catalog>name}",
            additionalText: "{catalog>code}"
          })
        }
      });
      priority.bindProperty("selectedKey", "paymentRun>/priorityConfig_code");
      add("Priority", priority);
      add("Department", this._paymentRunFormValue("department"));
      add("Amount", new Input({ type: "Number", width: "100%" }).bindValue("paymentRun>/amount"));
      add("Approver Role", this._paymentRunFormValue("role", { editable: false }));
      add("Description", new TextArea({ rows: 4, width: "100%" }).bindValue("paymentRun>/description"));
      add("Requester", this._paymentRunFormValue("requesterName", { editable: false }));
      const processorTeams = new ComboBox({
        width: "100%",
        showSecondaryValues: true,
        items: {
          path: "catalog>/flowmateTeams",
          templateShareable: true,
          template: new ListItem({
            key: "{catalog>ID}",
            text: "{catalog>name}",
            additionalText: "{catalog>teamCode}"
          })
        },
        selectionChange: function (event) {
          const item = event.getParameter("selectedItem");
          const row = item && item.getBindingContext("catalog")
            ? item.getBindingContext("catalog").getObject()
            : null;
          if (row) {
            const paymentRun = this.getView().getModel("paymentRun");
            paymentRun.setProperty("/processorTeam_ID", row.ID);
            paymentRun.setProperty("/processorTeamName", row.name);
          }
        }.bind(this)
      });
      processorTeams.bindProperty("selectedKey", "paymentRun>/processorTeam_ID");
      add("Processor Team", processorTeams, true);
      host.addItem(form);
      this._renderPaymentRunDetails();
    },

    onPaymentRunProcessTypeChange: function (event) {
      const selected = event.getParameter("selectedItem");
      const model = this.getView().getModel("paymentRun");
      const catalog = this.getView().getModel("catalog");
      const code = selected ? selected.getKey() : "";
      const all = catalog.getProperty("/flowmateProcessSubTypes") || [];
      const filtered = all.filter(function (entry) {
        return entry.processType_code === code;
      });
      catalog.setProperty("/flowmateProcessSubTypesFiltered", filtered);
      model.setProperty("/processType_code", code);
      model.setProperty("/processTypeName", selected ? selected.getText() : "");
      model.setProperty("/subProcessType_code", "");
      model.setProperty("/subProcessTypeName", "");
      model.setProperty("/details", {});
      this._renderPaymentRunDetails();
    },

    onPaymentRunSubProcessTypeChange: function (event) {
      const selected = event.getParameter("selectedItem");
      const model = this.getView().getModel("paymentRun");
      const code = selected ? selected.getKey() : "";
      model.setProperty("/subProcessType_code", code);
      model.setProperty("/subProcessTypeName", selected ? selected.getText() : "");
      // A subtype change must not carry composition rows from the previous
      // subtype into the next Flowmate request.
      model.setProperty("/details", {});
      const row = selected && selected.getBindingContext("catalog")
        ? selected.getBindingContext("catalog").getObject()
        : null;
      model.setProperty("/loaApprovalApplicable", Boolean(row && row.loaApprovalApplicable));
      this._renderPaymentRunDetails();
    },

    _openFlowmateIntegrationDialog: async function (mode, selected) {
      this._flowmateIntegrationMode = mode;
      const config = this._flowmateIntegrationConfig();
      const formModel = this.getView().getModel("form");
      formModel.setProperty(`/details/${config.flag}`, selected);
      if (!selected) {
        formModel.setProperty(`/details/${config.detailsField}`, "");
        this._paymentRunSaved = false;
        this._paymentRunFiles = [];
        this.getView().getModel("paymentRunFiles").setData({ items: [] });
        return;
      }
      try {
        await this._loadFlowmateRequestFormCatalog();
        this.getView().getModel("paymentRun").setData(this._paymentRunContext());
        const paymentRun = this.getView().getModel("paymentRun");
        const catalog = this.getView().getModel("catalog");
        const subtypes = catalog.getProperty("/flowmateProcessSubTypes") || [];
        catalog.setProperty("/flowmateProcessSubTypesFiltered", subtypes.filter(function (entry) {
          return entry.processType_code === paymentRun.getProperty("/processType_code");
        }));
        this._renderPaymentRunDialogForm();
        this._paymentRunSaved = false;
        this.byId("paymentRunDialog").open();
      } catch (error) {
        formModel.setProperty(`/details/${config.flag}`, false);
        this.showError(error);
      }
    },

    onPaymentRunSelect: async function (event) {
      return this._openFlowmateIntegrationDialog("paymentRun", event.getParameter("selected"));
    },

    onFlowmateServiceEntrySheetSelect: async function (event) {
      return this._openFlowmateIntegrationDialog("serviceEntrySheet", event.getParameter("selected"));
    },

    onPaymentRunDialogSave: function () {
      const config = this._flowmateIntegrationConfig();
      const data = this.getView().getModel("paymentRun").getData();
      const required = ["processType_code", "subProcessType_code", "title", "processorTeam_ID"];
      const missingOverview = required.find(function (name) {
        return !String(data[name] === undefined || data[name] === null ? "" : data[name]).trim();
      });
      if (missingOverview) {
        const labels = {
          processType_code: "Process Type",
          subProcessType_code: "Sub Process Type",
          title: "Request Title",
          processorTeam_ID: "Processor Team"
        };
        MessageBox.warning(`${labels[missingOverview]} is required.`);
        return;
      }
      if (!this._paymentRunFiles.length) {
        MessageBox.warning(config.warning);
        return;
      }
      const missingDetail = (this._paymentRunFieldControls || []).find(function (entry) {
        if (!entry.definition.required) {
          return false;
        }
        const value = data.details && data.details[entry.definition.name];
        return value === undefined || value === null || value === "";
      });
      const missingGrid = (this._paymentRunRequiredGrids || []).find(function (definition) {
        const rows = data.details && data.details[definition.name];
        return !Array.isArray(rows) || rows.length === 0;
      });
      if (missingGrid) {
        MessageBox.warning(`${missingGrid.label} requires at least one entry.`);
        return;
      }
      if (missingDetail) {
        MessageBox.warning(`${missingDetail.definition.label} is required.`);
        missingDetail.control.focus();
        return;
      }
      const formModel = this.getView().getModel("form");
      formModel.setProperty(`/details/${config.flag}`, true);
      formModel.setProperty(`/details/${config.detailsField}`, JSON.stringify(data));
      this._paymentRunSaved = true;
      this.byId("paymentRunDialog").close();
    },

    onPaymentRunDialogCancel: function () {
      const config = this._flowmateIntegrationConfig();
      if (!this._paymentRunSaved) {
        this.getView().getModel("form").setProperty(`/details/${config.flag}`, false);
        this.getView().getModel("form").setProperty(`/details/${config.detailsField}`, "");
        this._paymentRunFiles = [];
        this.getView().getModel("paymentRunFiles").setData({ items: [] });
      }
      this.byId("paymentRunDialog").close();
    },

    onPaymentRunAttachmentsSelected: function (event) {
      const files = Array.from(event.getParameter("files") || []);
      const maxBytes = 400 * 1024 * 1024;
      const oversized = files.find(function (file) { return file.size > maxBytes; });
      if (oversized) {
        MessageBox.warning(`The attachment ${oversized.name} exceeds the 400 MB limit.`);
        event.getSource().clear();
        return;
      }
      this._paymentRunFiles.push(...files);
      this.getView().getModel("paymentRunFiles").setData({
        items: this._paymentRunFiles.map(function (file) {
          return {
            name: file.name,
            sizeText: `${(file.size / 1024 / 1024).toFixed(2)} MB`
          };
        })
      });
      event.getSource().clear();
    },

    onRemovePaymentRunAttachment: function (event) {
      const context = event.getParameter("listItem")?.getBindingContext("paymentRunFiles");
      const path = context && context.getPath();
      const index = path ? Number(path.split("/").pop()) : -1;
      if (index < 0) {
        return;
      }
      this._paymentRunFiles.splice(index, 1);
      this.getView().getModel("paymentRunFiles").setProperty("/items", this._paymentRunFiles.map(function (file) {
        return {
          name: file.name,
          sizeText: `${(file.size / 1024 / 1024).toFixed(2)} MB`
        };
      }));
    },

    // Renders both row tables for the current selection. The header table only gets
    // columns for variants that define one (FormDefinitions.getHeaderTableColumns).
    _renderItemsTable: function () {
      const formModel = this.getView().getModel("form");
      const typeCode = formModel.getProperty("/requestTypeCode");
      const variantCode = formModel.getProperty("/requestVariantCode");
      const categoryCode = formModel.getProperty("/materialCategoryCode");
      const lineMode = formModel.getProperty("/bulkUpload");
      // Bulk Request = Multiple for a PO: line items carry the Row # of their PO.
      const poBulk = !!variantCode && this._isPoBulk();
      this._itemColumns = poBulk
        ? FormDefinitions.getBulkItemColumns(typeCode, variantCode)
        : FormDefinitions.getItemColumns(typeCode, variantCode, categoryCode);
      this._headerColumns = FormDefinitions.getHeaderTableColumns(variantCode);
      // SES shows its header table only in Multiple Line mode but keeps the Single/Multiple
      // choice, so panel visibility and the choice itself are two separate flags.
      formModel.setProperty("/hasHeaderTable", FormDefinitions.showsHeaderTable(variantCode, lineMode));
      formModel.setProperty("/offersLineModeChoice", typeCode !== "MATERIAL_RESERVATION"
        && FormDefinitions.offersLineModeChoice(variantCode));
      formModel.setProperty("/showsItemsTable", this._itemColumns.length > 0
        && (FormDefinitions.hasHeaderTable(variantCode)
          || lineMode === "MULTIPLE_LINE"
          || typeCode === "MATERIAL_RESERVATION"
          || FormDefinitions.alwaysHasItems(typeCode)));
      // "Contract Creation Details" is an Outline Contract title; every other type calls the
      // second table its line items, header table or not.
      formModel.setProperty("/itemsTableTitle", this.getView().getModel("i18n").getResourceBundle()
        .getText(typeCode === "OUTLINE_CONTRACT" ? "contractItemsTableTitle" : "itemsTableTitle"));
      this._renderGrid("items");
      this._renderGrid("headers");
      this._renderConditionalGrids(typeCode, variantCode);
      this._renderBulkRowsGrid(poBulk ? typeCode : null);
    },

    // Bulk Request = Multiple for a Purchase Order: each row of the details table becomes its own PO.
    _isPoBulk: function () {
      const formModel = this.getView().getModel("form");
      return formModel.getProperty("/requestTypeCode") === "PURCHASE_ORDER"
        && formModel.getProperty("/bulkUpload") === "MULTIPLE_LINE";
    },

    _renderBulkRowsGrid: function (typeCode) {
      const host = this.byId("bulkRowsHost");
      if (!host) {
        return;
      }
      host.destroyItems();
      delete GRIDS.bulkRows;
      if (!typeCode) {
        return;
      }
      GRIDS.bulkRows = {
        tableId: "bulkRowsTable",
        path: "/details/bulkRows",
        columns: FormDefinitions.getBulkTableColumns(typeCode),
        title: "Purchase Order Details"
      };
      GRIDS.bulkRows.panel = this._buildGridPanel("bulkRows");
      GRIDS.bulkRows.panel.setVisible(true);
      host.addItem(GRIDS.bulkRows.panel);
      this._renderGrid("bulkRows");
    },

    // Builds one panel per conditional grid of the variant (Single Line Items only) inside
    // conditionalGridsHost; _applyConditionalVisibility shows a panel while its driver is "YES".
    _renderConditionalGrids: function (typeCode, variantCode) {
      Object.keys(GRIDS).forEach(function (gridKey) {
        if (GRIDS[gridKey].conditional) {
          delete GRIDS[gridKey];
        }
      });
      const host = this.byId("conditionalGridsHost");
      if (!host) {
        return;
      }
      host.destroyItems();
      const singleLine = this.getView().getModel("form").getProperty("/bulkUpload") === "SINGLE_LINE"
        && typeCode !== "MATERIAL_RESERVATION";
      if (!singleLine) {
        return;
      }
      FormDefinitions.getConditionalGrids(variantCode).forEach(function (definition) {
        GRIDS[definition.key] = {
          tableId: `conditionalGrid-${definition.key}`,
          path: `/details/${definition.key}`,
          columns: definition.columns,
          driver: definition.driver,
          title: definition.title,
          conditional: true
        };
        GRIDS[definition.key].panel = this._buildGridPanel(definition.key);
        host.addItem(GRIDS[definition.key].panel);
        this._renderGrid(definition.key);
      }.bind(this));
      this._applyConditionalVisibility();
    },

    // Same toolbar and table as the XML line-item panels, built for a runtime grid.
    _buildGridPanel: function (gridKey) {
      const grid = GRIDS[gridKey];
      const withGrid = function (control) {
        control.data("grid", gridKey);
        return control;
      };
      const toolbar = new Toolbar({
        content: [
          new MTitle({
            level: "H4",
            text: {
              path: `form>${grid.path}`,
              formatter: function (rows) {
                return `${grid.title} (${rows ? rows.length : 0})`;
              }
            }
          }),
          new ToolbarSpacer(),
          withGrid(new FileUploader({
            buttonOnly: true,
            buttonText: "{i18n>importCsv}",
            icon: "sap-icon://upload",
            change: this.onImportItemsCsv.bind(this)
          })),
          withGrid(new Button({
            text: "{i18n>exportCsvTemplate}",
            icon: "sap-icon://download",
            press: this.onExportItemsCsv.bind(this)
          })),
          withGrid(new Button({
            text: "{i18n>addRow}",
            icon: "sap-icon://add",
            type: "Emphasized",
            press: this.onAddItemRow.bind(this)
          }))
        ]
      });
      const table = new Table(this.createId(grid.tableId), {
        noDataText: "{i18n>noItemsYet}",
        sticky: ["ColumnHeaders"]
      }).addStyleClass("sapUiSizeCompact caItemsTable");
      return new Panel({
        headerText: grid.title,
        visible: false,
        content: [
          toolbar,
          new ScrollContainer({ height: "14rem", horizontal: true, vertical: true, width: "100%", content: [table] })
        ]
      }).addStyleClass("caFormSection");
    },

    // Empty table cells are sent as null so number and date columns are not given "".
    _blankCellsToNull: function (details) {
      const result = {};
      Object.keys(GRIDS).forEach(function (gridKey) {
        const rows = details && details[gridKey];
        if (!Array.isArray(rows)) {
          return;
        }
        result[gridKey] = rows.map(function (row) {
          const clean = {};
          Object.keys(row).forEach(function (key) {
            clean[key] = row[key] === "" ? null : row[key];
          });
          return clean;
        });
      });
      return result;
    },

    _gridColumns: function (gridKey) {
      if (GRIDS[gridKey] && GRIDS[gridKey].columns) {
        return GRIDS[gridKey].columns;
      }
      return (gridKey === "headers" ? this._headerColumns : this._itemColumns) || [];
    },

    // The grid a toolbar control acts on, from its data:grid custom data (default "items").
    _gridOf: function (control) {
      return (control && control.data("grid")) || "items";
    },

    _renderGrid: function (gridKey) {
      const grid = GRIDS[gridKey];
      const host = this.byId(grid.tableId);
      if (!host) {
        return;
      }
      const formModel = this.getView().getModel("form");
      const columns = this._gridColumns(gridKey);

      host.destroyColumns();
      host.unbindItems();

      if (!formModel.getProperty(grid.path)) {
        formModel.setProperty(grid.path, []);
      }

      if (!columns.length) {
        return;
      }

      this._loadFieldCatalogs(columns);
      columns.forEach(function (col) {
        host.addColumn(new Column({
          header: new Label({ text: col.label, required: !!col.required, wrapping: true }),
          width: col.type === "date" ? "11rem" : "13rem"
        }));
      });
      host.addColumn(new Column({ hAlign: "End", width: "3rem" }));

      host.bindItems({
        path: `form>${grid.path}`,
        template: new ColumnListItem({
          cells: columns.map(function (col) {
            return this._createFieldControl(col, `form>${col.name}`);
          }.bind(this)).concat([
            new Button({
              icon: "sap-icon://delete",
              type: "Transparent",
              press: this._onRemoveItemRow.bind(this, gridKey)
            })
          ])
        })
      });
    },


    onAddItemRow: function (event) {
      const gridKey = this._gridOf(event && event.getSource());
      const path = GRIDS[gridKey].path;
      const formModel = this.getView().getModel("form");
      const items = formModel.getProperty(path) || [];
      const blank = {};
      this._gridColumns(gridKey).forEach(function (col) {
        blank[col.name] = col.type === "checkbox" ? false : "";
      });
      formModel.setProperty(path, this._renumberItems(items.concat([blank])));
    },

    _onRemoveItemRow: function (gridKey, event) {
      const gridPath = GRIDS[gridKey].path;
      const context = event.getSource().getBindingContext("form");
      const path = context.getPath();
      const index = Number(path.slice(path.lastIndexOf("/") + 1));
      const formModel = this.getView().getModel("form");
      const items = formModel.getProperty(gridPath) || [];
      formModel.setProperty(gridPath, this._renumberItems(items.filter(function (_row, rowIndex) {
        return rowIndex !== index;
      })));
    },

    onExportItemsCsv: function (event) {
      const gridKey = this._gridOf(event && event.getSource());
      const columns = this._gridColumns(gridKey);
      if (!columns.length) {
        return;
      }
      const formModel = this.getView().getModel("form");
      const typeCode = formModel.getProperty("/requestTypeCode");
      const items = formModel.getProperty(GRIDS[gridKey].path) || [];
      const rows = [columns.map(function (col) { return col.label; })];
      items.forEach(function (item) {
        rows.push(columns.map(function (col) { return item[col.name] || ""; }));
      });
      const csv = rows.map(function (row) {
        return row.map(this._csvEscape).join(",");
      }.bind(this)).join("\r\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${typeCode || "items"}${gridKey === "items" ? "" : "_" + gridKey}_template.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    },

    _csvEscape: function (value) {
      const text = value === undefined || value === null ? "" : String(value);
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    },

    onImportItemsCsv: function (event) {
      const files = event.getParameter("files");
      if (!files || !files.length) {
        return;
      }
      const gridKey = this._gridOf(event.getSource());
      const columns = this._gridColumns(gridKey);
      const reader = new FileReader();
      reader.onload = function () {
        const rows = this._parseCsv(String(reader.result));
        if (!rows.length) {
          return;
        }
        const header = rows[0].map(function (cell) {
          return String(cell).trim().toLowerCase();
        });
        const columnByHeader = {};
        columns.forEach(function (col) {
          columnByHeader[col.label.trim().toLowerCase()] = col.name;
        });
        const items = rows.slice(1)
          .filter(function (row) {
            return row.some(function (cell) { return cell !== ""; });
          })
          .map(function (row) {
            const item = {};
            columns.forEach(function (col) {
              item[col.name] = col.type === "checkbox" ? false : "";
            });
            header.forEach(function (headerText, index) {
              const key = columnByHeader[headerText];
              if (!key) {
                return;
              }
              const raw = row[index] !== undefined ? row[index] : "";
              const col = columns.find(function (entry) { return entry.name === key; });
              item[key] = col && col.type === "checkbox" ? this._asBoolean(raw) : raw;
            }.bind(this));
            return item;
          }.bind(this));
        this.getView().getModel("form").setProperty(GRIDS[gridKey].path, this._renumberItems(items));
        this.showSuccess(`${items.length} row(s) imported`);
      }.bind(this);
      reader.readAsText(files[0]);
      event.getSource().clear();
    },

    _asBoolean: function (value) {
      return value === true || ["true", "yes", "x", "1"].indexOf(String(value).trim().toLowerCase()) >= 0;
    },

    _parseCsv: function (text) {
      const rows = [];
      let row = [];
      let field = "";
      let inQuotes = false;
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (inQuotes) {
          if (char === '"') {
            if (text[i + 1] === '"') {
              field += '"';
              i++;
            } else {
              inQuotes = false;
            }
          } else {
            field += char;
          }
        } else if (char === '"') {
          inQuotes = true;
        } else if (char === ",") {
          row.push(field);
          field = "";
        } else if (char === "\n" || char === "\r") {
          if (char === "\r" && text[i + 1] === "\n") {
            i++;
          }
          row.push(field);
          field = "";
          if (row.length > 1 || row[0] !== "") {
            rows.push(row);
          }
          row = [];
        } else {
          field += char;
        }
      }
      if (field !== "" || row.length) {
        row.push(field);
        rows.push(row);
      }
      return rows;
    },

    onFilesSelected: function (event) {
      const files = Array.from(event.getParameter("files") || []);
      this._selectedFiles = files;
      this.getView().getModel("files").setProperty("/items", files.map(function (file) {
        return {
          name: file.name,
          sizeText: `${(file.size / 1024 / 1024).toFixed(2)} MB`
        };
      }));
    },

    onSubmit: async function () {
      const form = this.getView().getModel("form").getData();
      if (form.requestTypeCode === "MATERIAL_RESERVATION") {
        if (!form.requestVariantCode || !form.processorTeamCode) {
          MessageBox.warning("Process variant and processor team are required.");
          return;
        }
        return this._submitBulk(form);
      }
      if (this._isPoBulk()) {
        return this._submitPoBulk(form);
      }
      if (!form.requestTypeCode || !form.requestVariantCode || !form.title.trim() || !form.processorTeamCode)  {
        MessageBox.warning("Request type, process variant and title are required.");
        return;
      }
      const paymentRunSelected = Boolean(form.details && form.details.paymentRun);
      const serviceEntrySheetSelected = Boolean(form.details && form.details.flowmateSesRequest);
      if (paymentRunSelected && !form.details.paymentRunDetails) {
        MessageBox.warning("Save the Payment Run details before submitting the purchase order.");
        return;
      }
      if (serviceEntrySheetSelected && !form.details.flowmateSesRequestDetails) {
        MessageBox.warning("Save the Flowmate Service Entry Sheet details before submitting the service entry sheet.");
        return;
      }
      const missing = (this._fieldControls || []).find(function (entry) {
        if (!this._isFieldVisible(entry.definition)) {
          return false;
        }
        if (!entry.definition.required) {
          return false;
        }
        const value = entry.definition.source === "request"
          ? form[entry.definition.name]
          : form.details[entry.definition.name];
        return value === undefined || value === null || value === "";
      }.bind(this));
      if (missing) {
        MessageBox.warning(`${missing.definition.label} is required.`);
        missing.control.focus();
        return;
      }

      // Each visible row table needs at least one complete row. Which tables are shown is
      // already decided in _renderItemsTable, so the same flags drive the validation.
      const itemRows = (form.details && form.details.items) || [];
      const headerRows = (form.details && form.details.headers) || [];
      const bundle = this.getView().getModel("i18n").getResourceBundle();
      const headersTitle = bundle.getText("headersTableTitle");
      const itemsTitle = form.itemsTableTitle || bundle.getText("itemsTableTitle");

      if (form.hasHeaderTable) {
        if (!headerRows.length) {
          MessageBox.warning(`Add at least one row to the ${headersTitle} table.`);
          return;
        }
        const missingHeader = this._firstMissingItemCell(headerRows, this._headerColumns);
        if (missingHeader) {
          MessageBox.warning(`${headersTitle} - ${missingHeader}`);
          return;
        }
      }
      if (form.showsItemsTable) {
        if (!itemRows.length) {
          MessageBox.warning(`Add at least one row to the ${itemsTitle} table.`);
          return;
        }
        const missingItem = this._firstMissingItemCell(itemRows);
        if (missingItem) {
          MessageBox.warning(`${itemsTitle} - ${missingItem}`);
          return;
        }
      }

      // Conditional grids: an open grid (driver "YES") needs rows; a closed one sends nothing.
      const submittedDetails = Object.assign({}, form.details || {});
      const conditionalKeys = Object.keys(GRIDS).filter(function (gridKey) {
        return GRIDS[gridKey].conditional;
      });
      for (let index = 0; index < conditionalKeys.length; index++) {
        const grid = GRIDS[conditionalKeys[index]];
        if (submittedDetails[grid.driver] !== "YES") {
          delete submittedDetails[conditionalKeys[index]];
          continue;
        }
        const rows = submittedDetails[conditionalKeys[index]] || [];
        if (!rows.length) {
          MessageBox.warning(`Add at least one row to the ${grid.title} table.`);
          return;
        }
        const missingRow = this._firstMissingItemCell(rows, grid.columns);
        if (missingRow) {
          MessageBox.warning(`${grid.title} - ${missingRow}`);
          return;
        }
      }

      // "Create SES Successor": the captured SES travels with the PO as JSON.
      const withSesSuccessor = form.requestTypeCode === "PURCHASE_ORDER" && submittedDetails.sesRequired === true;
      if (withSesSuccessor) {
        if (!form.sesDraft || !form.sesDraft.saved) {
          MessageBox.warning("Fill in the SES successor details, or untick Create SES Successor.");
          return;
        }
        submittedDetails.sesDraft = this._sesDraftPayload(form.sesDraft);
      }

      this.setBusy(true);
      try {
        const request = await this.request("createRequest", {
          method: "POST",
          body: {
            input: {
              requestTypeCode: form.requestTypeCode,
              requestVariantCode: form.requestVariantCode,
              title: form.title.trim(),
              description: form.description,
              dueDate: form.dueDate || null,
              predecessorId: form.predecessorId || null,
              processorTeamCode: form.processorTeamCode,
              details: JSON.stringify(Object.assign(
                {},
                submittedDetails,
                this._blankCellsToNull(submittedDetails),
                form.materialCategoryCode
                  ? { materialCategory: form.materialCategoryCode, transactionType: form.requestVariantCode }
                  : {}
              ))
            }
          }
        });
        this.showSuccess(`Request ${request.referenceNumber} created`);
        const uploads = (this._selectedFiles || []).map(function (file) {
          return { file: file, category: "SUPPORTING_DOCUMENT" };
        });
        if (paymentRunSelected) {
          (this._paymentRunFiles || []).forEach(function (file) {
            uploads.push({ file: file, category: "PAYMENT_RUN" });
          });
        }
        if (serviceEntrySheetSelected) {
          (this._paymentRunFiles || []).forEach(function (file) {
            uploads.push({ file: file, category: "FLOWMATE_SES" });
          });
        }
        Object.keys(this._dynamicFileUploads || {}).forEach(function (name) {
          uploads.push({
            file: this._dynamicFileUploads[name],
            category: name.replace(/([A-Z])/g, "_$1").toUpperCase()
          });
        }.bind(this));
        // SES successor files are parked on the PO with an SES_ prefix; the server moves them to
        // the SES request when it is created.
        if (withSesSuccessor) {
          (this._sesFiles || []).forEach(function (file) {
            uploads.push({ file: file, category: "SES_SUPPORTING_DOCUMENT" });
          });
          Object.keys(this._sesFileUploads || {}).forEach(function (name) {
            uploads.push({
              file: this._sesFileUploads[name],
              category: "SES_" + name.replace(/([A-Z])/g, "_$1").toUpperCase()
            });
          }.bind(this));
        }
        let uploadResult = { failedCount: 0 };
        if (uploads.length) {
          uploadResult = await this._uploadFiles(request.ID, uploads);
        }
        if ((paymentRunSelected || serviceEntrySheetSelected) && uploadResult.failedCount) {
          throw new Error(`The CA request could not be completed because one or more ${paymentRunSelected ? "Payment Run" : "Service Entry Sheet"} attachments could not be uploaded.`);
        }
        this.navTo("requestDetail", {
          requestId: request.ID
        }, true);
      } catch (error) {
        this.showError(error);
      } finally {
        this.setBusy(false);
      }
    },

    // Bulk Request = Multiple for a Purchase Order: one PO request per row of the details table.
    // Line items join their row through Row #; the shared attachments and Remarks go to every PO.
    _submitPoBulk: async function (form) {
      if (!form.requestVariantCode || !String(form.title || "").trim() || !form.processorTeamCode) {
        MessageBox.warning("Request type, process variant, title and processor team are required.");
        return;
      }
      const missingShared = (this._fieldControls || []).find(function (entry) {
        const value = form.details[entry.definition.name];
        return entry.definition.required && (value === undefined || value === null || value === "");
      });
      if (missingShared) {
        MessageBox.warning(`${missingShared.definition.label} is required.`);
        missingShared.control.focus();
        return;
      }
      const rows = form.details.bulkRows || [];
      const items = form.details.items || [];
      if (!rows.length) {
        MessageBox.warning("Add at least one row to the Purchase Order Details table.");
        return;
      }
      const missingRow = this._firstMissingItemCell(rows, GRIDS.bulkRows.columns);
      if (missingRow) {
        MessageBox.warning(`Purchase Order Details - ${missingRow}`);
        return;
      }
      if (!items.length) {
        MessageBox.warning("Add at least one line item.");
        return;
      }
      const missingItem = this._firstMissingItemCell(items);
      if (missingItem) {
        MessageBox.warning(`Line Items - ${missingItem}`);
        return;
      }
      const strayItem = items.findIndex(function (item) {
        const rowNo = Number(item.poRow);
        return !Number.isInteger(rowNo) || rowNo < 1 || rowNo > rows.length;
      });
      if (strayItem >= 0) {
        MessageBox.warning(`Line Items - Row ${strayItem + 1}: Row # must be between 1 and ${rows.length}.`);
        return;
      }
      const rowWithoutItems = rows.findIndex(function (_row, index) {
        return !items.some(function (item) { return Number(item.poRow) === index + 1; });
      });
      if (rowWithoutItems >= 0) {
        MessageBox.warning(`Purchase Order Details - Row ${rowWithoutItems + 1} has no line items.`);
        return;
      }

      const blankToNull = function (source, skip) {
        const clean = {};
        Object.keys(source || {}).forEach(function (key) {
          if (skip.indexOf(key) < 0) {
            clean[key] = source[key] === "" ? null : source[key];
          }
        });
        return clean;
      };
      const shared = {};
      (this._fieldControls || []).forEach(function (entry) {
        const value = form.details[entry.definition.name];
        shared[entry.definition.name] = value === "" || value === undefined ? null : value;
      });
      const title = form.title.trim();
      const payloadRows = rows.map(function (row, index) {
        return Object.assign(blankToNull(row, ["itemNo"]), shared, {
          title: `${title} - Row ${index + 1}`,
          dueDate: form.dueDate || null,
          items: items
            .filter(function (item) { return Number(item.poRow) === index + 1; })
            .map(function (item, itemIndex) {
              return Object.assign(blankToNull(item, ["poRow"]), { itemNo: itemIndex + 1 });
            })
        });
      });

      this.setBusy(true);
      try {
        const result = await this.request("createBulkRequests", {
          method: "POST",
          body: {
            input: {
              requestTypeCode: form.requestTypeCode,
              requestVariantCode: form.requestVariantCode,
              processorTeamCode: form.processorTeamCode,
              rows: JSON.stringify(payloadRows)
            }
          }
        });
        const uploads = (this._selectedFiles || []).map(function (file) {
          return { file: file, category: "SUPPORTING_DOCUMENT" };
        });
        Object.keys(this._dynamicFileUploads || {}).forEach(function (name) {
          uploads.push({
            file: this._dynamicFileUploads[name],
            category: name.replace(/([A-Z])/g, "_$1").toUpperCase()
          });
        }.bind(this));
        if (uploads.length) {
          for (const requestId of JSON.parse(result.requestIds || "[]")) {
            await this._uploadFiles(requestId, uploads);
          }
        }
        this.showSuccess(`${result.created} Purchase Order request(s) created: ${JSON.parse(result.referenceNumbers || "[]").join(", ")}`);
        this.navTo("requests");
      } catch (error) {
        this.showError(error);
      } finally {
        this.setBusy(false);
      }
    },

    _uploadFiles: async function (requestId, uploads) {
      const results = await Promise.allSettled(uploads.map(async function (upload) {
        const file = upload.file;
        // Only elements that exist on FlowmateCAService.Attachments may be sent - CAP
        // rejects unknown properties with 400. mimeType is derived server-side from the
        // filename extension by @cap-js/attachments, so it must not be sent here.
        const attachment = await this.request("Attachments", {
          method: "POST",
          body: {
            request_ID: requestId,
            filename: file.name,
            category: upload.category || "SUPPORTING_DOCUMENT"
          }
        });
        const token = await this._csrfToken();
        const response = await fetch(this.resolveAppUri(`odata/v4/flowmate-ca/Attachments(${attachment.ID})/content`), {
          method: "PUT",
          headers: {
            "X-CSRF-Token": token,
            "Content-Type": file.type || "application/octet-stream"
          },
          body: file
        });
        if (!response.ok) {
          // The row was created before the content was accepted; drop it so the
          // request does not keep an attachment that has no file behind it.
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
      }.bind(this)));
      const failed = results.filter(function (result) {
        return result.status === "rejected";
      });
      if (failed.length) {
        const reasons = failed.map(function (result) {
          return result.reason && result.reason.message;
        }).filter(Boolean);
        MessageBox.warning(`${failed.length} attachment(s) could not be uploaded.

${reasons.join("\n")}`);
      } else {
        this.showSuccess("Supporting documents uploaded");
      }
      return { failedCount: failed.length };
    },

    onCancel: function () {
      window.history.length > 1 ? window.history.back() : this.navTo("dashboard", {}, true);
    }
  });
});
