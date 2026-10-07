sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/UIComponent",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "sap/m/Column",
  "sap/m/ColumnListItem",
  "sap/m/Text",
  "flowmateca/model/FormDefinitions",
  "flowmateca/model/serviceUrl",
  "sap/m/Table",
  "sap/m/Panel",
  "sap/m/ScrollContainer"
], function (Controller, UIComponent, MessageBox, MessageToast, Column, ColumnListItem, Text, FormDefinitions, serviceUrl,
  Table, Panel, ScrollContainer) {
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
          return navigation === DETAIL_NAVIGATION.OUTLINE_CONTRACT
            ? `${navigation}($expand=items,headers,changeItems)`
            : `${navigation}($expand=items)`;
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
    buildDetailFields: function (request, details) {
      // The Single/Multiple choice is not stored; SCM Assign User is mandatory only on the
      // Single Line form (Contract Modification), so its presence selects that field set.
      const definitions = FormDefinitions.getHeaderFields(
        request.requestType?.code,
        request.requestVariant?.code,
        details.materialCategory,
        details.scmAssignUser ? "SINGLE_LINE" : undefined
      );
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
    }
  });
});
