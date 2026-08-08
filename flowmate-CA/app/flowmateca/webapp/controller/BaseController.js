sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/UIComponent",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "flowmateca/model/serviceUrl"
], function (Controller, UIComponent, MessageBox, MessageToast, serviceUrl) {
  "use strict";

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

    priorityState: function (priority) {
      return {
        CRITICAL: "Error",
        HIGH: "Warning",
        MEDIUM: "Information",
        LOW: "Success"
      }[priority] || "None";
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
    }
  });
});
