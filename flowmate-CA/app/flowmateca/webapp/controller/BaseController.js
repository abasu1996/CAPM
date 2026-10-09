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
  "sap/m/ScrollContainer"
], function (Controller, UIComponent, MessageBox, MessageToast, Column, ColumnListItem, Text, FormDefinitions, Input, TextArea, DatePicker, CheckBox, ComboBox, Item, ListItem, FileUploader, Log, serviceUrl, Table, Panel, ScrollContainer) {
  "use strict";

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
    "BudgetCode"
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
    renderReadOnlyRows: function (tableId, path, allColumns) {
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

      table.bindItems({
        path: path,
        template: new ColumnListItem({
          cells: [new Text({ text: `{${modelName}>itemNo}` })].concat(columns.map(function (col) {
            return new Text({ text: `{${modelName}>${col.name}}` });
          }))
        })
      });
    },

    // Contract Modification change rows: one read-only table per changeType that has rows,
    // built inside the VBox hostId. Rows are published on the model as /changeRows_<key>.
    renderChangeTables: function (hostId, modelName, variantCode, changeItems) {
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
        host.addItem(new Panel({
          headerText: grid.title,
          content: [new ScrollContainer({ horizontal: true, vertical: false, width: "100%", content: [table] })]
        }).addStyleClass("caFormSection caItemsSection"));
        this.renderReadOnlyRows(tableId, `${modelName}>/changeRows_${grid.key}`, grid.columns);
      }.bind(this));
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

    detailFieldDefinitions: function (request, details) {
      const variantCode = request.requestVariant?.code;
      return this.isSingleLineDetail(request, details)
        ? FormDefinitions.getFields(variantCode, details.materialCategory, "SINGLE_LINE")
        : FormDefinitions.getHeaderFields(request.requestType?.code, variantCode, details.materialCategory);
    },

    buildDetailFields: function (request, details) {
      // The Single/Multiple choice is not stored, so it is inferred from the stored data:
      // a single-line request keeps its line values on the detail row and has no item rows.
      // That covers Contract Modification, whose Single Line form carries SCM Assign User,
      // as well as every other variant offering the choice.
      const definitions = this.detailFieldDefinitions(request, details);
      return definitions.map(function (definition) {
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
        return {
          label: definition.label,
          value: value === null || value === undefined || value === "" ? "Not provided" : String(value)
        };
      });
    },

    // Combos keyed by a UUID (users, vendor, purchasing organization) store the ID; swap it for
    // the display text of that row. Walks the same definitions as buildDetailFields, so the
    // index is the rendered row. A failed lookup leaves the stored value in place.
    resolveIdLabels: async function (request, details, modelName, fieldsPath) {
      const model = this.getView().getModel(modelName);
      const definitions = this.detailFieldDefinitions(request, details);
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
      const columns = FormDefinitions.getItemColumns(
        request.requestType?.code,
        request.requestVariant?.code,
        details.materialCategory
      );
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

      table.bindItems({
        path: itemsPath,
        template: new ColumnListItem({
          cells: [new Text({ text: `{${modelName}>itemNo}` })].concat(columns.map(function (col) {
            return new Text({ text: `{${modelName}>${col.name}}` });
          }))
        })
      });
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

    _applyConditionalVisibility: function () {
      const formModel = this.getView().getModel("form");
      (this._fieldControls || []).forEach(function (entry) {
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
          template: new ListItem({
            key: `{catalog>${key}}`,
            text: `{catalog>${text}}`,
            additionalText: `{catalog>${secondaryText}}`
          })
        });
      } else {
        control = new Input({
          type: definition.type === "number" ? "Number" : "Text",
          maxLength: definition.maxLength || 0,
          placeholder: definition.placeholder || ""
        }).bindValue(path);
      }
      return control;
    },
    _renumberItems: function (items) {
      items.forEach(function (row, index) {
        row.itemNo = index + 1;
      });
      return items;
    },
    _firstMissingItemCell: function (items, columns) {
      for (let index = 0; index < items.length; index++) {
        const missing = (columns || this._itemColumns || []).find(function (col) {
          if (!col.required) {
            return false;
          }
          const value = items[index][col.name];
          return value === undefined || value === null || String(value).trim() === "";
        });
        if (missing) {
          return `Row ${index + 1}: ${missing.label} is required.`;
        }
      }
      return null;
    },
  });
});
