sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/UIComponent",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "sap/m/Column",
  "sap/m/ColumnListItem",
  "sap/m/Text",
  "flowmateca/model/FormDefinitions",
  "sap/m/Input",
  "sap/m/TextArea",
  "sap/m/DatePicker",
  "sap/m/CheckBox",
  "sap/m/ComboBox",
  "sap/ui/core/Item",
  "sap/ui/core/ListItem",
  "sap/ui/unified/FileUploader",
  "sap/base/Log",
  "flowmateca/model/serviceUrl",
  "sap/m/Table",
  "sap/m/Panel",
  "sap/m/ScrollContainer",
  "sap/m/VBox",
  "sap/m/HBox",
  "sap/m/Button",
  "sap/m/FlexItemData",
  "sap/ui/model/Sorter",
  "sap/m/GroupHeaderListItem",
  "sap/m/Toolbar",
  "sap/m/ToolbarSpacer",
  "sap/m/SelectDialog",
  "sap/m/StandardListItem",
  "sap/ui/model/json/JSONModel"
], function (Controller, UIComponent, MessageBox, MessageToast, Column, ColumnListItem, Text, FormDefinitions, Input, TextArea, DatePicker, CheckBox, ComboBox, Item, ListItem, FileUploader, Log, serviceUrl, Table, Panel, ScrollContainer, VBox, HBox, Button, FlexItemData, Sorter, GroupHeaderListItem, Toolbar, ToolbarSpacer, SelectDialog, StandardListItem, JSONModel) {
  "use strict";

  // A VBox that a SimpleForm accepts as a field (forms only take IFormContent controls); it holds
  // the rows of an e-mail list field.
  const FormVBox = VBox.extend("flowmateca.control.FormVBox", {
    metadata: { interfaces: ["sap.ui.core.IFormContent"] },
    renderer: "sap.m.VBoxRenderer"
  });

  // A request carries exactly one detail child, named per request type. Shared so the
  // request page and the task page resolve it the same way.
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

  // Values approvers record on the request's details row, per request type: shown after the form
  // fields on the request and on later tasks, and in the version tables.
  const APPROVER_FIELDS = {
    SERVICE_CODE: [["glAccount", "GL Account"], ["valuationClass_code", "Valuation Class"], ["serviceCode", "Service Code"]],
    MATERIAL_CODE: [["glAccount", "GL Account"], ["valuationClass_code", "Valuation Class"], ["materialCode", "Material Code"]],
    EQUIPMENT_CODE: [["equipmentCode", "Equipment Code"]],
    PROJECT_CODE: [["projectCode", "Project Code"], ["functionLocation", "Function Location"], ["activityNumber", "Activity"]],
    PURCHASE_ORDER: [["purchaseOrderNumber", "PO Number"]],
    SERVICE_ENTRY_SHEET: [["sesNumber", "SES Number"]]
  };

  const MAIN_SERVICE_URL = "odata/v4/flowmate-ca/";
  const MASTER_SERVICE_URL = "odata/v4/flowmate-ca-master/";

  // Pick lists maintained by admins in flowmate-common; served by CAMasterDataService,
  // not FlowmateCAService, and they carry no sortOrder column.
  const MASTER_PICK_LISTS = new Set([
    "Plant", "Sites", "StorageLocation", "SalesOrg", "ValuationClass", "ServiceGroups",
    "DocumentTypes", "Divisions", "PurchasingGroups", "Wbs", "Materials", "MatGroup",
    "ProfitCenter", "MRPType", "AvailabilityCheck", "SerialNumberProfile", "DistributionChannel",
    "ArReferences", "Currencies", "UnitsOfMeasure", "ServiceCategories", "ProcurementCategories",
    "PaymentTerms", "Projects", "ItemCategories", "AccountAssignments",
    "ContractType", "PurchasingOrganizations", "CompanyCodes", "Incoterms", "CostCenter", "ApplicableTaxes",
    "BudgetCode", "ProductHierarchy", "MaterialType", "Entity", "ExtensionMaterialGroup",
    "ArPcc", "VendorsPcc", "DivisionsPcc", "ScopePcc", "ProjectTypePcc"
  ]);
  const STATUS_MESSAGES = {
    400: "Some of the information provided is invalid. Please review it and try again.",
    401: "Your session has expired or you are not signed in. Please sign in again.",
    403: "You do not have permission to perform this action.",
    404: "The requested record could not be found. It may have been removed.",
    409: "This change conflicts with a more recent update. Refresh the page and try again.",
    412: "This record has changed since it was opened. Refresh the page and try again.",
    429: "Too many requests were sent. Please wait a moment and try again.",
    500: "The server could not complete the request. Please try again or contact support.",
    502: "The service is temporarily unavailable. Please try again shortly.",
    503: "The service is temporarily unavailable. Please try again shortly.",
    504: "The request timed out. Please try again."
  };

  function errorMessage(error, fallback, status) {
    let payload = error;
    if (typeof payload === "string") {
      try { payload = JSON.parse(payload); } catch (parseError) { payload = { message: payload }; }
    }
    const detail = payload?.error?.details?.[0]?.message ||
      payload?.error?.innererror?.errordetails?.[0]?.message;
    const candidate = detail?.value || detail || payload?.error?.message?.value ||
      payload?.error?.message || payload?.message;
    const cleaned = typeof candidate === "string" ? candidate.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
    const generic = /^(?:http request failed|request failed|failed to fetch)$/i.test(cleaned);
    const technical = /(?:sql(?:state| error| syntax)?|stack trace|internal server error|\bquery:\s|\bselect\s.+\bfrom\s)/i.test(cleaned);
    const code = Number(status || error?.status || error?.statusCode || error?.response?.status || 0);
    return (!generic && !technical && cleaned) || STATUS_MESSAGES[code] || fallback ||
      "The request could not be completed. Please try again.";
  }

  // Master data whose fields show only the code once picked (the drop-down lists code and name).
  const CODE_ONLY_ENTITIES = new Set(["Sites", "Materials"]);

  return Controller.extend("flowmateca.controller.BaseController", {
    getRouter: function () {
      return UIComponent.getRouterFor(this);
    },

    getAppModel: function () {
      return this.getOwnerComponent().getModel("app");
    },

    setBusy: function (busy) {
      this.getAppModel().setProperty("/busy", busy);
    },

    openReassignment: function (kind, id) {
      const controller = this;
      let searchVersion = 0;
      let closed = false;
      const dialog = new SelectDialog({
        title: kind === "request" ? "Assign request to user" : "Assign task to user",
        noDataText: "No active users found. Search by name or email.",
        items: {
          path: "assignees>/users",
          template: new StandardListItem({ title: "{assignees>displayName}", description: "{assignees>email}" })
        },
        search: function (event) { loadUsers(event.getParameter("value")); },
        confirm: function (event) {
          const item = event.getParameter("selectedItem");
          const selected = item && item.getBindingContext("assignees").getObject();
          if (!selected) return;
          MessageBox.confirm(`Assign this ${kind} to ${selected.displayName || selected.email}?`, {
            onClose: async function (choice) {
              if (choice !== MessageBox.Action.OK) return;
              controller.setBusy(true);
              try {
                const body = kind === "request" ? { requestId: id, userId: selected.ID } : { taskId: id, userId: selected.ID };
                await controller.request(kind === "request" ? "reassignRequest" : "reassignTask", { method: "POST", body });
                MessageToast.show(`${kind === "request" ? "Request" : "Task"} assigned to ${selected.displayName || selected.email}`);
                await controller.onRefresh();
              } catch (error) { controller.showError(error); }
              finally { controller.setBusy(false); }
            }
          });
        },
        afterClose: function () { closed = true; dialog.destroy(); }
      });
      const users = new JSONModel({ users: [] });
      dialog.setModel(users, "assignees");
      this.getView().addDependent(dialog);
      async function loadUsers(search) {
        const version = ++searchVersion;
        const value = String(search || "").trim().replace(/'/g, "''");
        const filter = "isActive eq true" + (value ? ` and (contains(displayName,'${value}') or contains(email,'${value}'))` : "");
        dialog.setBusy(true);
        try {
          const result = await controller.request(`Users?$select=ID,displayName,email&$orderby=displayName&$top=100&$filter=${encodeURIComponent(filter)}`);
          if (!closed && version === searchVersion) users.setProperty("/users", result.value || []);
        } catch (error) { if (!closed) controller.showError(error); }
        finally { if (!closed && version === searchVersion) dialog.setBusy(false); }
      }
      dialog.open();
      loadUsers("");
    },

    navTo: function (route, parameters, replace) {
      this.getRouter().navTo(route, parameters || {}, Boolean(replace));
    },

    onNavHome: function () {
      this.navTo("dashboard");
    },

    resolveAppUri: function (uri) {
      return serviceUrl.resolve(uri);
    },

    loadCurrentUser: async function () {
      try {
        const user = await this.request("getCurrentUser()");
        this.getAppModel().setProperty("/currentUser", user);
        return user;
      } catch (error) {
        MessageBox.error(this.getErrorMessage(error));
        return null;
      }
    },

    request: async function (path, options) {
      const settings = Object.assign({
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      }, options || {});
      settings.headers = Object.assign({
        Accept: "application/json"
      }, settings.headers || {});

      if (settings.body && typeof settings.body !== "string") {
        settings.headers["Content-Type"] = "application/json";
        settings.body = JSON.stringify(settings.body);
      }

      if (!["GET", "HEAD"].includes(settings.method.toUpperCase())) {
        settings.headers["X-CSRF-Token"] = await this._csrfToken();
      }

      const response = await fetch(this.resolveAppUri(`${MAIN_SERVICE_URL}${path}`), settings);
      if (!response.ok) {
        const payload = await response.text();
        throw new Error(errorMessage(payload, null, response.status));
      }
      if (response.status === 204) {
        return null;
      }
      return response.json();
    },

    requestMaster: async function (path, options) {
      const settings = Object.assign({
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      }, options || {});
      settings.headers = Object.assign({
        Accept: "application/json"
      }, settings.headers || {});
      if (settings.body && typeof settings.body !== "string") {
        settings.headers["Content-Type"] = "application/json";
        settings.body = JSON.stringify(settings.body);
      }
      if (!["GET", "HEAD"].includes(settings.method.toUpperCase())) {
        settings.headers["X-CSRF-Token"] = await this._csrfToken(MASTER_SERVICE_URL);
      }

      const response = await fetch(this.resolveAppUri(`${MASTER_SERVICE_URL}${path}`), settings);
      if (!response.ok) {
        const payload = await response.text();
        throw new Error(errorMessage(payload, null, response.status));
      }
      if (response.status === 204) {
        return null;
      }
      return response.json();
    },

    _csrfToken: async function (serviceRoot) {
      const root = serviceRoot || MAIN_SERVICE_URL;
      const cacheKey = root === MAIN_SERVICE_URL ? "_csrfMain" : "_csrfMaster";
      if (this[cacheKey]) {
        return this[cacheKey];
      }
      const response = await fetch(this.resolveAppUri(root), {
        headers: {
          "X-CSRF-Token": "Fetch"
        }
      });
      if (!response.ok) {
        const payload = await response.text();
        throw new Error(errorMessage(payload, null, response.status));
      }
      this[cacheKey] = response.headers.get("X-CSRF-Token") || "";
      return this[cacheKey];
    },

    showError: function (error) {
      MessageBox.error(this.getErrorMessage(error));
    },

    getErrorMessage: function (error, fallback) {
      return errorMessage(error, fallback);
    },

    showSuccess: function (message) {
      MessageToast.show(message);
    },

    statusState: function (status) {
      return {
        COMPLETED: "Success",
        APPROVED: "Success",
        IN_PROGRESS: "Information",
        SUBMITTED: "Information",
        SENT_BACK: "Warning",
        REJECTED: "Error",
        OPEN: "Information",
        DRAFT: "None"
      }[status] || "None";
    },

    canActForAssignedUser: function (assignedUserId, currentUser) {
      const user = currentUser || this.getAppModel().getProperty("/currentUser") || {};
      return Boolean(assignedUserId && (
        assignedUserId === user.ID ||
        (user.activeDelegatorUserIds || []).includes(assignedUserId)
      ));
    },

    formatDate: function (value) {
      if (!value) {
        return "";
      }
      return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit"
      }).format(new Date(value));
    },

    formatDateTime: function (value) {
      if (!value) {
        return "";
      }
      return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(value));
    },

    // A task is breached once it is past its deadline while open, or when it was closed late
    // (slaBreached is stored then), so an approved task keeps the badge.
    isSlaBreached: function (slaDueAt, statusCode, slaBreached) {
      if (slaBreached) {
        return true;
      }
      return statusCode === "OPEN" && !!slaDueAt && new Date(slaDueAt) < new Date();
    },

    isWithinSla: function (slaDueAt, statusCode, slaBreached) {
      return !!slaDueAt && statusCode !== "REJECTED" && !this.isSlaBreached(slaDueAt, statusCode, slaBreached);
    },

    formatSlaHighlight: function (slaDueAt, statusCode, slaBreached) {
      if (this.isSlaBreached(slaDueAt, statusCode, slaBreached)) {
        return "Error";
      }
      return this.isWithinSla(slaDueAt, statusCode, slaBreached) ? "Success" : "None";
    },

    // "Due in 2 days" / "3 days overdue" for an open task; nothing once it is closed.
    formatSlaRemaining: function (slaDueAt, statusCode) {
      if (!slaDueAt || statusCode !== "OPEN") {
        return "";
      }
      const diff = new Date(slaDueAt).getTime() - Date.now();
      const hours = Math.abs(diff) / 3600000;
      const wholeHours = Math.max(1, Math.ceil(hours));
      const inDays = wholeHours >= 24;
      const amount = inDays ? Math.max(1, Math.floor(hours / 24)) : wholeHours;
      const unit = inDays ? (amount === 1 ? "day" : "days") : (amount === 1 ? "hour" : "hours");
      return diff >= 0 ? `Due in ${amount} ${unit}` : `${amount} ${unit} overdue`;
    },

    // Downloads rows as an .xlsx. columns: [{ label, value: row => text }]; the values are written
    // as text, exactly as the list shows them.
    exportToExcel: function (fileName, columns, rows) {
      return new Promise(function (resolve, reject) {
        sap.ui.require(["sap/ui/export/Spreadsheet"], function (Spreadsheet) {
          const data = rows.map(function (row) {
            const flat = {};
            columns.forEach(function (col, index) {
              const value = col.value(row);
              flat["c" + index] = value === undefined || value === null ? "" : String(value);
            });
            return flat;
          });
          const sheet = new Spreadsheet({
            workbook: {
              columns: columns.map(function (col, index) {
                return { label: col.label, property: "c" + index, type: "string", width: col.width || 18 };
              })
            },
            dataSource: data,
            fileName: `${fileName}.xlsx`,
            worker: false,
            // The sheet is destroyed once built; its delayed progress dialog would then stay open.
            showProgress: false
          });
          sheet.build().then(resolve, reject).finally(function () {
            sheet.destroy();
          });
        }, reject);
      });
    },

    formatSlaText: function (slaDueAt, statusCode, slaBreached) {
      // S/4 Data Validation waiting on its Budget Check: its SLA restarts when the check is done.
      if (statusCode === "IN_PROGRESS") {
        return "SLA paused · Budget Check";
      }
      if (this.isSlaBreached(slaDueAt, statusCode, slaBreached)) {
        return "SLA Breached";
      }
      return this.isWithinSla(slaDueAt, statusCode, slaBreached) ? "Within SLA" : "";
    },

    // One-line SLA cell: "SLA Breached · 1 day overdue", "Within SLA · Due in 2 days" or just the
    // badge text once the task is closed.
    formatSlaCell: function (slaDueAt, statusCode, slaBreached) {
      const badge = this.formatSlaText(slaDueAt, statusCode, slaBreached);
      const remaining = this.formatSlaRemaining(slaDueAt, statusCode);
      return [badge, remaining].filter(Boolean).join(" · ");
    },

    // Request and task statuses keep the code REJECTED; the UI calls it Terminated.
    statusName: function (name, code) {
      return code === "REJECTED" ? "Terminated" : name;
    },

    // "Approved · Finance Processor" for a decided task; empty while open. The time has its own column.
    formatTaskOutcome: function (statusCode, completedByName, assignedName) {
      const outcome = { APPROVED: "Approved", REJECTED: "Terminated", SENT_BACK: "Sent back" }[statusCode];
      if (!outcome) {
        return "";
      }
      return [outcome, completedByName || assignedName].filter(Boolean).join(" · ");
    },

    // Lists keep dates short ("Oct 20, 01:34 AM"); detail pages show the year too.
    formatDateTimeShort: function (value) {
      if (!value) {
        return "";
      }
      return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(value));
    },

    // The due date in a list cell ("Oct 20, 01:34 AM"); the time left is its tooltip.
    formatSlaDue: function (slaDueAt, dueDate) {
      return slaDueAt ? this.formatDateTimeShort(slaDueAt) : this.formatDate(dueDate);
    },

    formatSlaLength: function (slaDays) {
      return `SLA ${slaDays} ${Number(slaDays) === 1 ? "day" : "days"}`;
    },

    // "Uploaded by Name · 16 Oct 2026, 15:40", with "Remarks screenshot" marked as such.
    formatUploadInfo: function (uploadedByName, createdBy, createdAt, category) {
      const who = uploadedByName || createdBy || "";
      const parts = [who && `Uploaded by ${who}`, this.formatDateTime(createdAt)].filter(Boolean);
      const text = parts.join(" · ");
      return category === "REMARKS_SCREENSHOT" ? `Remarks screenshot · ${text}` : text;
    },

    // A request is past its SLA while still running after its (projected) due date.
    isRequestOverdue: function (slaDueAt, statusCode) {
      return !!slaDueAt && statusCode !== "COMPLETED" && statusCode !== "REJECTED"
        && new Date(slaDueAt) < new Date();
    },

    formatRequestSlaHighlight: function (slaDueAt, statusCode) {
      return this.isRequestOverdue(slaDueAt, statusCode) ? "Error" : "None";
    },

    formatSlaBreachMessage: function (slaDueAt, statusCode) {
      if (!slaDueAt) {
        return "";
      }
      const due = this.formatDateTime(slaDueAt);
      if (statusCode === "OPEN") {
        return `SLA breached: this task was due ${due} and is ${this.formatSlaRemaining(slaDueAt, statusCode)}.`;
      }
      return `Completed after the SLA: this task was due ${due}.`;
    },

    formatInitials: function (value) {
      const parts = String(value || "").split("@")[0].split(/[._-]/).filter(Boolean);
      if (!parts.length) {
        return "";
      }
      const first = parts[0].charAt(0);
      const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
      return (first + last).toUpperCase();
    },

    formatAvatarColor: function (value) {
      const key = String(value || "");
      let hash = 0;
      for (let index = 0; index < key.length; index++) {
        hash = (hash * 31 + key.charCodeAt(index)) % 10;
      }
      return `Accent${hash + 1}`;
    },

    detailNavigationFor: function (requestTypeCode) {
      return DETAIL_NAVIGATION[requestTypeCode];
    },

    detailExpandClause: function () {
      return Object.values(DETAIL_NAVIGATION)
        .map(function (navigation) {
          // Outline contracts also carry header rows and Contract Modification change rows.
          if (navigation === DETAIL_NAVIGATION.OUTLINE_CONTRACT) {
            return `${navigation}($expand=items,headers,changeItems)`;
          }
          // Service entry sheets capture header rows when Multiple Line is chosen, and their
          // presence is what distinguishes the two line modes once the request is stored.
          if (navigation === DETAIL_NAVIGATION.SERVICE_ENTRY_SHEET) {
            return `${navigation}($expand=items,headers)`;
          }
          return `${navigation}($expand=items)`;
        })
        .join(",");
    },

    // Read-only row table: a leading "#" (itemNo) column plus one Text column per definition.
    renderReadOnlyRows: function (tableId, path, allColumns, variantCode) {
      const table = this.byId(tableId);
      if (!table) {
        return;
      }
      const modelName = path.slice(0, path.indexOf(">"));
      const columns = allColumns.filter(function (col) {
        return col.name !== "itemNo";
      });
      table.destroyColumns();
      table.unbindItems();

      if (!columns.length) {
        return;
      }

      table.addColumn(new Column({
        header: new Text({ text: "#" }),
        width: "4rem"
      }));
      columns.forEach(function (col) {
        table.addColumn(new Column({
          header: new Text({ text: col.label }),
          width: col.type === "date" ? "11rem" : "12rem"
        }));
      });

      table.bindItems(Object.assign({
        path: path,
        template: new ColumnListItem({
          cells: [new Text({ text: `{${modelName}>itemNo}` })].concat(columns.map(function (col) {
            return new Text({ text: `{${modelName}>${col.name}}` });
          }))
        })
      }, this._headerGrouping(variantCode, modelName)));
    },

    // New Contract line items, grouped under the Header Creation row they name (headerRowNo):
    // "Header 1 · Vendor 100021 · Ariba Event 123". Other variants are not grouped.
    _headerGrouping: function (variantCode, modelName) {
      if (variantCode !== "CONTRACT_NEW") {
        return {};
      }
      const model = this.getView().getModel(modelName);
      return {
        sorter: [
          new Sorter("headerRowNo", false, function (context) {
            const headerNo = context.getProperty("headerRowNo");
            return { key: String(headerNo ?? ""), headerNo: headerNo };
          }),
          new Sorter("itemNo", false)
        ],
        groupHeaderFactory: function (group) {
          const header = ((model && model.getProperty("/detailHeaders")) || []).find(function (row) {
            return Number(row.itemNo) === Number(group.headerNo);
          });
          const parts = [`Header ${group.headerNo ?? "-"}`];
          if (header && header.vendorCode) {
            parts.push(`Vendor ${header.vendorCode}`);
          }
          if (header && header.coupaSourcingEventNo) {
            parts.push(`Ariba Event ${header.coupaSourcingEventNo}`);
          }
          if (header && header.contractNumber) {
            parts.push(`Contract ${header.contractNumber}`);
          }
          return new GroupHeaderListItem({ title: parts.join(" · ") });
        }
      };
    },

    // Contract Modification change rows: one read-only table per changeType that has rows,
    // built inside the VBox hostId. Rows are published on the model as /changeRows_<key>.
    // exportVisible: when the Export button shows (a binding or boolean; shown by default).
    renderChangeTables: function (hostId, modelName, variantCode, changeItems, exportVisible) {
      const host = this.byId(hostId);
      if (!host) {
        return;
      }
      host.destroyItems();
      const model = this.getView().getModel(modelName);
      FormDefinitions.getConditionalGrids(variantCode).forEach(function (grid) {
        const rows = (changeItems || [])
          .filter(function (row) { return row.changeType === grid.changeType; })
          .sort(function (left, right) { return left.itemNo - right.itemNo; });
        if (!rows.length) {
          return;
        }
        model.setProperty(`/changeRows_${grid.key}`, rows);
        const tableId = `${hostId}-${grid.key}`;
        const table = new Table(this.createId(tableId)).addStyleClass("caWorklistTable");
        const reference = model.getProperty("/request/referenceNumber") || model.getProperty("/referenceNumber");
        host.addItem(new Panel({
          headerText: grid.title,
          content: [
            new Toolbar({ content: [new ToolbarSpacer(), new Button({
              text: "Export to Excel",
              icon: "sap-icon://excel-attachment",
              type: "Transparent",
              visible: exportVisible === undefined ? true : exportVisible,
              press: function () {
                this.exportTableRows([reference, grid.title].filter(Boolean).join(" - "), grid.columns, rows);
              }.bind(this)
            })] }),
            new ScrollContainer({ horizontal: true, vertical: false, width: "100%", content: [table] })
          ]
        }).addStyleClass("caFormSection caItemsSection"));
        this.renderReadOnlyRows(tableId, `${modelName}>/changeRows_${grid.key}`, grid.columns);
      }.bind(this));
    },

    // Uploads files to a request: uploads = [{ file, category }] (category defaults to
    // SUPPORTING_DOCUMENT; a form field's file uses the field name in capitals). Used by the create
    // page and by the requester's form after a send-back. Returns { failedCount }.
    uploadAttachments: async function (requestId, uploads) {
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
        this.showSuccess("Attachments uploaded");
      }
      return { failedCount: failed.length };
    },

    // Exports a read-only row table as shown: "#" (itemNo) plus one column per definition, with
    // select values as their text and flags as Yes/No.
    exportTableRows: function (fileName, columns, rows) {
      const shown = columns.filter(function (col) { return col.name !== "itemNo"; });
      return this.exportToExcel(fileName, [{ label: "#", value: function (row) { return row.itemNo; }, width: 6 }]
        .concat(shown.map(function (col) {
          return { label: col.label, value: function (row) { return this.formatDetailValue(col, {}, row); }.bind(this) };
        }.bind(this))), (rows || []).slice().sort(function (left, right) { return left.itemNo - right.itemNo; }))
        .catch(this.showError.bind(this));
    },

    // Header rows of an outline contract (New Contract), sorted for display.
    sortedDetailHeaders: function (details) {
      return ((details && details.headers) || []).slice().sort(function (left, right) {
        return left.itemNo - right.itemNo;
      });
    },

    // Header-level fields only. The item-level ones belong to the line items table,
    // and on a bulk request they are empty here, which rendered as "Not provided".
    // A request created in Single Line Item mode keeps its line values on the detail
    // header row instead of in item rows, which is how the create page submitted them.
    // The catalogue classifies those fields as item columns, so they have to be read
    // back as header fields or they are invisible everywhere the request is shown.
    isSingleLineDetail: function (request, details) {
      const variantCode = request.requestVariant?.code;
      if (request.requestType?.code === "MATERIAL_RESERVATION") {
        return false;
      }
      // A variant whose header table only appears in Multiple Line mode records that choice
      // in the data: header rows exist only when Multiple Line was used.
      if (FormDefinitions.headerTableIsLineModeDependent(variantCode)) {
        return !(details.headers || []).length;
      }
      if (FormDefinitions.hasHeaderTable(variantCode)) {
        return false;
      }
      if ((details.items || []).length) {
        return false;
      }
      return FormDefinitions.getItemColumns(request.requestType?.code, variantCode, details.materialCategory)
        .some(function (column) {
          const value = details[column.name];
          return value !== null && value !== undefined && value !== "";
        });
    },

    approverFieldsFor: function (typeCode) {
      return APPROVER_FIELDS[typeCode] || [];
    },

    // Adds the approver-recorded values (GL Account, Valuation Class, codes, PO / SES Number) that
    // are not already form fields, so the next approver and the request overview see them.
    appendApproverFields: function (request, details, fields) {
      const formNames = new Set(this.detailFieldDefinitions(request, details).map(function (definition) {
        return definition.name;
      }));
      this.approverFieldsFor(request.requestType?.code).forEach(function (entry) {
        const value = details[entry[0]];
        if (!formNames.has(entry[0]) && value !== undefined && value !== null && value !== "") {
          fields.push({ label: entry[1], value: String(value) });
        }
      });
      return fields;
    },

    detailFieldDefinitions: function (request, details) {
      const variantCode = request.requestVariant?.code;
      return this.isSingleLineDetail(request, details)
        ? FormDefinitions.getFields(variantCode, details.materialCategory, "SINGLE_LINE")
        : FormDefinitions.getHeaderFields(request.requestType?.code, variantCode, details.materialCategory);
    },

    // Read-only views leave out fields whose visibleWhen does not match this request (e.g. Project
    // Code on a Function Location request). The editable requester form keeps them all, so
    // changing the driver can still bring them back.
    _shownDetailDefinitions: function (request, details) {
      return this.detailFieldDefinitions(request, details).filter(function (definition) {
        const rule = definition.visibleWhen;
        if (!rule) {
          return true;
        }
        const source = definition.source === "request" ? request : details;
        return source[rule.field] === rule.equals;
      });
    },

    // A field's display text ("" when empty): Yes/No for flags, the option text for selects.
    // Request-level fields (source "request") are read from the request instead of details.
    formatDetailValue: function (definition, request, details) {
      let value = definition.source === "request"
        ? (definition.name === "requestDateTime" ? request.createdAt : request[definition.name])
        : details[definition.name];
      if (typeof value === "boolean") {
        value = value ? "Yes" : "No";
      }
      if (definition.type === "select" && value) {
        const option = (definition.options || []).find(function (entry) {
          return entry.key === value;
        });
        value = option ? option.text : value;
      }
      return value === null || value === undefined ? "" : String(value);
    },

    buildDetailFields: function (request, details) {
      // The Single/Multiple choice is not stored, so it is inferred from the stored data:
      // a single-line request keeps its line values on the detail row and has no item rows.
      // That covers Contract Modification, whose Single Line form carries SCM Assign User,
      // as well as every other variant offering the choice.
      const definitions = this._shownDetailDefinitions(request, details);
      return definitions.map(function (definition) {
        const value = this.formatDetailValue(definition, request, details);
        return {
          label: definition.label,
          value: value === "" ? "Not provided" : value
        };
      }.bind(this)).concat(request.requestType?.code === "PURCHASE_ORDER" && details.purchaseOrderNumber
        // Recorded at S/4 Data Validation; appended last so resolveIdLabels' indexes still match.
        ? [{ label: "PO Number", value: String(details.purchaseOrderNumber) }]
        : []).concat(request.requestType?.code === "SERVICE_ENTRY_SHEET" && details.sesNumber
        ? [{ label: "SES Number", value: String(details.sesNumber) }]
        : []);
    },

    // Combos keyed by a UUID (users, vendor, purchasing organization) store the ID; swap it for
    // the display text of that row. Walks the same definitions as buildDetailFields, so the
    // index is the rendered row. A failed lookup leaves the stored value in place.
    resolveIdLabels: async function (request, details, modelName, fieldsPath) {
      const model = this.getView().getModel(modelName);
      const definitions = this._shownDetailDefinitions(request, details);
      await Promise.all(definitions.map(async function (definition, index) {
        const value = details[definition.name];
        if (definition.key !== "ID" || !definition.entity || !value) {
          return;
        }
        // Users and Vendors are served by the main service; other pick lists (for example
        // PurchasingOrganizations) only by the master-data service.
        const path = `${definition.entity}(${value})`;
        try {
          const row = await this.request(path).catch(function () {
            return this.requestMaster(path);
          }.bind(this));
          const label = row && row[definition.text || "name"];
          if (label) {
            model.setProperty(`${fieldsPath}/${index}/value`, String(label));
          }
        } catch (error) {
          // Leave the stored value visible.
        }
      }.bind(this)));
    },

    renderDetailItemsTable: function (table, request, details, modelName, itemsPath) {
      if (!table) {
        return;
      }
      const columns = FormDefinitions.getItemDisplayColumns(
        request.requestType?.code,
        request.requestVariant?.code,
        details.materialCategory
      ).filter(function (col) {
        // A conditional column only shows when the request's own details match its rule.
        return !col.visibleWhen || details[col.visibleWhen.field] === col.visibleWhen.equals;
      });
      table.destroyColumns();
      table.unbindItems();
      if (!columns.length) {
        return;
      }

      table.addColumn(new Column({
        header: new Text({ text: "#" }),
        width: "4rem"
      }));
      columns.forEach(function (col) {
        table.addColumn(new Column({
          header: new Text({ text: col.label }),
          width: col.type === "date" ? "11rem" : "12rem"
        }));
      });

      table.bindItems(Object.assign({
        path: itemsPath,
        template: new ColumnListItem({
          cells: [new Text({ text: `{${modelName}>itemNo}` })].concat(columns.map(function (col) {
            return new Text({ text: `{${modelName}>${col.name}}` });
          }))
        })
      }, this._headerGrouping(request.requestVariant?.code, modelName)));
    },

    // --- dynamic form + editable grid builders -------------------------------
    // Shared by the create page and the requester's step-1 task, which edits the
    // same fields and line items. One implementation so required-cell validation,
    // per-row auto-fill and conditional visibility cannot drift apart.

    _loadFieldCatalogs: async function (fields) {
      const entities = new Map();
      fields.forEach(function (definition) {
        if (definition.entity && !entities.has(definition.entity)) {
          entities.set(definition.entity, definition.key || "code");
        }
      });
      const catalog = this.getView().getModel("catalog");
      // A failed pick list must degrade only its own field, not abort the render.
      await Promise.all(Array.from(entities).map(async function (entry) {
        const entity = entry[0];
        const keyField = entry[1];
        if (catalog.getProperty(`/${entity}`)) {
          return;
        }
        const fromMaster = MASTER_PICK_LISTS.has(entity);
        let orderBy = `&$orderby=${keyField}`;
        if (entity === "Users" || entity === "Vendors") {
          orderBy = "";
        } else if (!fromMaster) {
          orderBy = "&$orderby=sortOrder";
        }
        const path = `${entity}?$filter=isActive eq true${orderBy}`;
        try {
          const result = fromMaster ? await this.requestMaster(path) : await this.request(path);
          catalog.setProperty(`/${entity}`, result.value || []);
        } catch (error) {
          Log.error(`Could not load the ${entity} list`, error);
          catalog.setProperty(`/${entity}`, []);
        }
      }.bind(this)));
    },
    _applyAutoFill: function (definition, selectedKey, basePath, selectedRow) {
      if (!definition.autoFills || !definition.entity) {
        return;
      }
      let match = selectedRow;
      if (!match && selectedKey) {
        const rows = this.getView().getModel("catalog")
          .getProperty(`/${definition.entity}`) || [];
        const keyProperty = definition.key || "code";
        match = rows.find(function (row) {
          return String(row[keyProperty]) === String(selectedKey);
        });
      }
      const formModel = this.getView().getModel("form");
      [].concat(definition.autoFills).forEach(function (rule) {
        const target = basePath ? `${basePath}/${rule.field}` : `/details/${rule.field}`;
        formModel.setProperty(target, match ? (match[rule.from] || "") : "");
      });
    },
    // Subclasses that own show/hide grids override this; the default has none.
    _conditionalGrids: function () {
      return {};
    },

    // Spec-driven conditional fields: a definition may carry
    // visibleWhen: { field: "<driver>", equals: "<value>" }.
    _isFieldVisible: function (definition) {
      const rule = definition.visibleWhen;
      if (!rule) {
        return true;
      }
      const form = this.getView().getModel("form").getData();
      const source = definition.source === "request" ? form : (form.details || {});
      return source[rule.field] === rule.equals;
    },

    // A field is mandatory outright (required) or only while another field has a given value
    // (requiredWhen), which is how Plant is mandatory for an extension but not for a change.
    // notEquals reverses the rule: mandatory unless the field has that value.
    // requiredWhen: { field, equals | notEquals | in: [...] }. A rule marked row: true (a bulk
    // table column that depends on another column) is read from that row, so it has no single
    // answer for the column header.
    _isFieldRequired: function (definition, row) {
      if (definition.required) {
        return true;
      }
      const rule = definition.requiredWhen;
      if (!rule) {
        return false;
      }
      let source;
      if (rule.row) {
        if (!row) {
          return false;
        }
        source = row;
      } else {
        const form = this.getView().getModel("form").getData();
        source = definition.source === "request" ? form : (form.details || {});
      }
      const value = source[rule.field];
      if (Array.isArray(rule.in)) {
        return rule.in.indexOf(value) >= 0;
      }
      return rule.notEquals !== undefined ? value !== rule.notEquals : value === rule.equals;
    },

    _applyConditionalVisibility: function () {
      const formModel = this.getView().getModel("form");
      (this._fieldControls || []).forEach(function (entry) {
        // the asterisk follows the field it depends on
        if (entry.definition.requiredWhen && entry.label) {
          entry.label.setRequired(this._isFieldRequired(entry.definition));
        }
        if (!entry.definition.visibleWhen) {
          return;
        }
        const visible = this._isFieldVisible(entry.definition);
        entry.control.setVisible(visible);
        if (entry.label) {
          entry.label.setVisible(visible);
        }
        // A hidden field must not carry a stale value into the payload.
        if (!visible) {
          const path = entry.definition.source === "request"
            ? `/${entry.definition.name}`
            : `/details/${entry.definition.name}`;
          if (formModel.getProperty(path) !== undefined && formModel.getProperty(path) !== "") {
            formModel.setProperty(path, "");
          }
        }
      }.bind(this));

      const details = formModel.getProperty("/details") || {};
      const grids = this._conditionalGrids();
      Object.keys(grids).forEach(function (gridKey) {
        const grid = grids[gridKey];
        if (grid.panel && grid.driver) {
          grid.panel.setVisible(details[grid.driver] === "YES");
        }
      }.bind(this));

      // the create page's due date follows the steps a change switches on or off (e.g. DMS)
      if (typeof this._refreshSlaPreview === "function") {
        this._refreshSlaPreview();
      }
      // row tables that carry a requiredWhen column keep their header asterisks in step
      if (typeof this._refreshGridRequiredMarkers === "function") {
        this._refreshGridRequiredMarkers();
      }
    },

    _createFieldControl: function (definition, explicitPath, fileStore) {
      const dataPath = definition.source === "request"
        ? `/${definition.name}`
        : `/details/${definition.name}`;
      const path = explicitPath || `form>${dataPath}`;
      let control;
      if (definition.type === "readonly") {
        control = new Input({
          editable: false,
          placeholder: definition.placeholder || ""
        }).bindValue(path);
      } else if (definition.type === "textarea") {
        control = new TextArea({
          rows: 3,
          width: "100%",
          placeholder: definition.placeholder || ""
        }).bindValue(path);
      } else if (definition.type === "date") {
        control = new DatePicker({
          valueFormat: "yyyy-MM-dd",
          displayFormat: "medium"
        }).bindValue(path);
      } else if (definition.type === "checkbox") {
        control = new CheckBox({
          select: function (event) {
            this._applyConditionalVisibility();
            if (definition.onSelect && typeof this[definition.onSelect] === "function") {
              this[definition.onSelect](event);
            }
          }.bind(this)
        }).bindProperty("selected", path);
      } else if (definition.type === "select") {
        control = new ComboBox({
          width: "100%",
          editable: !definition.readOnly,
          placeholder: definition.placeholder || ""
          ,selectionChange: this._applyConditionalVisibility.bind(this)
        }).bindProperty("selectedKey", path);
        (definition.options || []).forEach(function (option) {
          control.addItem(new Item({
            key: option.key,
            text: option.text
          }));
        });
      } else if (definition.type === "file") {
        // With an explicit path (e.g. the SES successor pop-up) the file name goes there and the
        // File into the given store; otherwise into /details and the main upload map.
        const formModel = this.getView().getModel("form");
        const namePath = explicitPath ? explicitPath.slice(explicitPath.indexOf(">") + 1) : dataPath;
        control = new FileUploader({
          width: "100%",
          buttonText: definition.placeholder || `Select ${definition.label}`,
          change: function (event) {
            const store = fileStore || this._dynamicFileUploads;
            const files = event.getParameter("files");
            const file = files && files.length ? files[0] : null;
            formModel.setProperty(namePath, file ? file.name : "");
            if (file) {
              store[definition.name] = file;
            } else {
              delete store[definition.name];
            }
          }.bind(this)
        });
      } else if (definition.type === "combo") {
        const key = definition.key || "code";
        const text = definition.text || "name";
        const secondaryText = definition.secondaryText || "code";
        control = new ComboBox({
          width: "100%",
          showSecondaryValues: true,
          filterSecondaryValues: true,
          placeholder: definition.placeholder || `Search ${definition.label}`,
          selectionChange: function (event) {
            const item = event.getParameter("selectedItem");
            const context = event.getSource().getBindingContext("form");
            const rowContext = item ? item.getBindingContext("catalog") : null;
            this._applyAutoFill(definition, item ? item.getKey() : "", context ? context.getPath() : null,
              rowContext ? rowContext.getObject() : null);
            this._applyConditionalVisibility();
          }.bind(this)
        }).bindProperty("selectedKey", path);
        control.bindItems({
          path: `catalog>/${definition.entity}`,
          templateShareable: true,
          template: this._comboListItem(definition, key, text, secondaryText)
        });
      } else if (definition.type === "emailList") {
        control = this._createEmailListControl(definition, dataPath);
      } else {
        control = new Input({
          type: definition.type === "number" ? "Number" : "Text",
          maxLength: definition.maxLength || 0,
          placeholder: definition.placeholder || ""
        }).bindValue(path);
      }
      // readOnly: the value is decided for the user (e.g. by the process variant) and only shown.
      if (definition.readOnly && typeof control.setEditable === "function") {
        control.setEditable(false);
      }
      return control;
    },

    // "CODE - Name" for master-data dropdowns, or whichever of the two is present.
    codeAndText: function (code, text) {
      const codeValue = code === undefined || code === null ? "" : String(code).trim();
      const textValue = text === undefined || text === null ? "" : String(text).trim();
      if (!codeValue || !textValue || codeValue === textValue) {
        return codeValue || textValue;
      }
      return `${codeValue} - ${textValue}`;
    },

    // The code and name properties a master-data combo shows: codeField when the definition names
    // one, else its key (unless that is a technical ID), else its secondary text. Users have no
    // code and return null, keeping name + e-mail.
    _comboFields: function (definition) {
      if (definition.entity === "Users") {
        return null;
      }
      const code = definition.codeField
        || (definition.key && definition.key !== "ID" ? definition.key : definition.secondaryText)
        || "code";
      const text = definition.text || "name";
      const name = text !== code ? text : (definition.secondaryText !== code ? definition.secondaryText : null);
      return { code: code, text: name };
    },

    _comboListItem: function (definition, key, text, secondaryText) {
      const fields = this._comboFields(definition);
      // Site ID / Material Code: the list shows the name next to the code, the field only the code.
      if (fields && fields.text && CODE_ONLY_ENTITIES.has(definition.entity)) {
        return new ListItem({
          key: `{catalog>${key}}`,
          text: `{catalog>${fields.code}}`,
          additionalText: `{catalog>${fields.text}}`
        });
      }
      if (!fields) {
        return new ListItem({
          key: `{catalog>${key}}`,
          text: `{catalog>${text}}`,
          additionalText: `{catalog>${secondaryText}}`
        });
      }
      // The secondary column only stays for a third property (e.g. an AR's High Level PC).
      const extra = definition.secondaryText && definition.secondaryText !== fields.code
        && definition.secondaryText !== fields.text ? definition.secondaryText : null;
      return new ListItem({
        key: `{catalog>${key}}`,
        text: {
          parts: [`catalog>${fields.code}`].concat(fields.text ? [`catalog>${fields.text}`] : []),
          formatter: this.codeAndText
        },
        additionalText: extra ? `{catalog>${extra}}` : ""
      });
    },

    // One e-mail input per row: the first row carries the + button, every added row a - button.
    // /emailLists/<field> holds the row ids (it only changes on + and -, so typing never rebuilds
    // the inputs) and /emailValues/<field>/<id> the addresses. The field itself gets the non-blank
    // ones joined with "; ", so the required check, the payload and the display pages see one string.
    _createEmailListControl: function (definition, dataPath) {
      const formModel = this.getView().getModel("form");
      const listPath = `/emailLists/${definition.name}`;
      const valuesPath = `/emailValues/${definition.name}`;
      const i18n = this.getView().getModel("i18n").getResourceBundle();
      const existing = String(formModel.getProperty(dataPath) || "")
        .split(";")
        .map(function (email) { return email.trim(); })
        .filter(Boolean);
      let nextId = 0;
      const rows = [];
      const values = {};
      (existing.length ? existing : [""]).forEach(function (email) {
        const id = `e${nextId++}`;
        rows.push({ id: id });
        values[id] = email;
      });
      ["/emailLists", "/emailValues"].forEach(function (root) {
        if (!formModel.getProperty(root)) {
          formModel.setProperty(root, {});
        }
      });
      formModel.setProperty(valuesPath, values);
      formModel.setProperty(listPath, rows);

      const sync = function () {
        const current = formModel.getProperty(valuesPath) || {};
        const emails = (formModel.getProperty(listPath) || [])
          .map(function (row) { return String(current[row.id] || "").trim(); })
          .filter(Boolean);
        formModel.setProperty(dataPath, emails.join("; "));
      };

      return new FormVBox({
        width: "100%",
        items: {
          path: `form>${listPath}`,
          factory: function (id, context) {
            const rowId = context.getProperty("id");
            const first = Number(context.getPath().split("/").pop()) === 0;
            // maxEmails: the + button stops adding once the list is full.
            const button = first
              ? new Button({
                icon: "sap-icon://add",
                tooltip: definition.maxEmails
                  ? `${i18n.getText("addEmail")} (up to ${definition.maxEmails})`
                  : i18n.getText("addEmail"),
                enabled: {
                  path: `form>${listPath}`,
                  formatter: function (list) {
                    return !definition.maxEmails || (list || []).length < definition.maxEmails;
                  }
                },
                press: function () {
                  if (definition.maxEmails && (formModel.getProperty(listPath) || []).length >= definition.maxEmails) {
                    return;
                  }
                  const newId = `e${nextId++}`;
                  formModel.setProperty(`${valuesPath}/${newId}`, "");
                  formModel.setProperty(listPath, (formModel.getProperty(listPath) || []).concat([{ id: newId }]));
                }
              })
              : new Button({
                icon: "sap-icon://less",
                type: "Transparent",
                tooltip: i18n.getText("removeEmail"),
                press: function () {
                  formModel.setProperty(listPath, (formModel.getProperty(listPath) || []).filter(function (row) {
                    return row.id !== rowId;
                  }));
                  sync();
                }
              });
            return new HBox({
              width: "100%",
              alignItems: "Center",
              items: [
                new Input({
                  type: "Email",
                  width: "100%",
                  placeholder: definition.placeholder || "name@example.com",
                  valueLiveUpdate: true,
                  liveChange: sync,
                  change: sync,
                  layoutData: new FlexItemData({ growFactor: 1 })
                }).bindValue(`form>${valuesPath}/${rowId}`),
                button.addStyleClass("sapUiTinyMarginBegin")
              ]
            }).addStyleClass("sapUiTinyMarginBottom");
          }
        }
      });
    },

    // The first malformed address of an e-mail list field, or null.
    _firstInvalidEmail: function (value) {
      return String(value || "")
        .split(";")
        .map(function (email) { return email.trim(); })
        .filter(Boolean)
        .find(function (email) { return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }) || null;
    },

    // "Label: up to N e-mail addresses." when an e-mail list holds more than its maxEmails, else null.
    _emailLimitProblem: function (definition, value) {
      const count = String(value || "").split(";").filter(function (email) { return email.trim(); }).length;
      return definition.maxEmails && count > definition.maxEmails
        ? `${definition.label}: up to ${definition.maxEmails} e-mail addresses (${count} entered).`
        : null;
    },

    // The first visible e-mail list field holding a malformed address: { entry, email } or null.
    _firstInvalidEmailField: function (entries, details) {
      for (let index = 0; index < (entries || []).length; index++) {
        const entry = entries[index];
        if (entry.definition.type !== "emailList" || !this._isFieldVisible(entry.definition)) {
          continue;
        }
        const email = this._firstInvalidEmail((details || {})[entry.definition.name]);
        if (email) {
          return { entry: entry, email: email };
        }
      }
      return null;
    },

    // An e-mail list is a VBox of rows; focus its first input instead.
    _focusFieldControl: function (control) {
      const input = control && typeof control.findAggregatedObjects === "function"
        ? control.findAggregatedObjects(true, function (child) { return child.isA("sap.m.Input"); })[0]
        : null;
      (input || control).focus();
    },
    _renumberItems: function (items) {
      items.forEach(function (row, index) {
        row.itemNo = index + 1;
      });
      return items;
    },
    // Line-item columns may carry visibleWhen (a header field driving them), e.g. the Project Code
    // site columns that only apply to Function Location requests.
    _isColumnShown: function (col) {
      return !col.visibleWhen || this._isFieldVisible(col);
    },

    _columnVisibleBinding: function (col) {
      const rule = col.visibleWhen;
      return rule
        ? { path: `form>/details/${rule.field}`, formatter: function (value) { return value === rule.equals; } }
        : true;
    },

    _firstMissingItemCell: function (items, columns) {
      for (let index = 0; index < items.length; index++) {
        const missing = (columns || this._itemColumns || []).find(function (col) {
          if (!this._isFieldRequired(col, items[index]) || !this._isColumnShown(col)) {
            return false;
          }
          const value = items[index][col.name];
          return value === undefined || value === null || String(value).trim() === "";
        }.bind(this));
        if (missing) {
          return `Row ${index + 1}: ${missing.label} is required.`;
        }
      }
      return null;
    },
  });
});
