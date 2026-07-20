sap.ui.define([], () => {
    "use strict";

    const LOCAL_CAP_APP_PATH = /\/flowmate\/webapp\/?$/;

    function resolve(sUri) {
        const sRelativeUri = String(sUri || "").replace(/^\/+/, "");
        const oComponentBaseUrl = new URL(
            sap.ui.require.toUrl("flowmate/"),
            window.location.href
        );

        // CAP serves the UI below /flowmate/webapp but exposes OData at /odata.
        if (LOCAL_CAP_APP_PATH.test(oComponentBaseUrl.pathname)) {
            return new URL(`/${sRelativeUri}`, oComponentBaseUrl.origin).toString();
        }

        // Managed approuter URLs need the HTML5 application prefix retained.
        return new URL(sRelativeUri, oComponentBaseUrl).toString();
    }

    return { resolve };
});
