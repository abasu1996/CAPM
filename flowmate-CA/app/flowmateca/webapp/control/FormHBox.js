sap.ui.define([
  "sap/m/HBox"
], function (HBox) {
  "use strict";

  // A form only takes controls that declare themselves form content, which a plain HBox does not.
  return HBox.extend("flowmateca.control.FormHBox", {
    metadata: {
      interfaces: ["sap.ui.core.IFormContent"]
    },
    renderer: HBox.getMetadata().getRenderer()
  });
});
