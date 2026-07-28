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

  return oDocument;
}

module.exports = {
  createOpenApiDocument,
  SERVICE_PATH
};
