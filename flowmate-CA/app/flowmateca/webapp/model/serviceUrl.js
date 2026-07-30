sap.ui.define([], function () {
  "use strict";

  const LOCAL_CAP_APP_PATH = /\/flowmateca\/webapp\/?$/;

  function resolve(uri) {
    const relativeUri = String(uri || "").replace(/^\/+/, "");
    const componentBaseUrl = new URL(
      sap.ui.require.toUrl("flowmateca/"),
      window.location.href
    );

    // CAP serves the local UI below /flowmateca/webapp but exposes OData at /odata.
    if (LOCAL_CAP_APP_PATH.test(componentBaseUrl.pathname)) {
      return new URL(`/${relativeUri}`, componentBaseUrl.origin).toString();
    }

    // Managed approuter URLs need the HTML5 application prefix retained.
    return new URL(relativeUri, componentBaseUrl).toString();
  }

  return { resolve };
});
