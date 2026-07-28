const { compile } = require("@cap-js/openapi");

const SERVICE_PATH = "/odata/v4/flowmate";

function createOpenApiDocument(oModel) {
  const oDocument = compile(oModel, { service: "FlowmateService" });

  oDocument.info = {
    title: "Flowmate API",
    description: "API reference for Flowmate master data, requests, tasks, attachments, administration, and actions.",
    version: "1.0.0"
  };
  oDocument.servers = [{
    url: SERVICE_PATH,
    description: "Flowmate OData V4 service"
  }];
  oDocument.components ||= {};
  oDocument.components.securitySchemes = {
    bearerAuth: {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
      description: "BTP XSUAA access token"
    },
    basicAuth: {
      type: "http",
      scheme: "basic",
      description: "Local development user credentials"
    }
  };
  oDocument.security = [
    { bearerAuth: [] },
    { basicAuth: [] }
  ];

  [
    oDocument.paths?.["/Vendors"]?.post,
    oDocument.paths?.["/Vendors({ID})"]?.patch,
    oDocument.paths?.["/Vendors({ID})"]?.delete
  ].filter(Boolean).forEach((oOperation) => {
    oOperation.description = [
      oOperation.description,
      "Requires the Admin role or VendorProvisioning authority."
    ].filter(Boolean).join("\n\n");
    oOperation["x-required-authorities"] = ["Admin", "VendorProvisioning"];
  });

  return oDocument;
}

module.exports = {
  createOpenApiDocument,
  SERVICE_PATH
};
