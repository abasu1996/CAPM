const cds = require("@sap/cds");
const { compile } = require("@cap-js/openapi");
const swaggerUi = require("swagger-ui-express");

const DOCS_PATH = "/api-docs";
const SERVICE_PATH = "/odata/v4/flowmate";

cds.on("served", () => {
  const oOpenApiDocument = compile(cds.clone(cds.model), { service: "FlowmateService" });

  oOpenApiDocument.info = {
    title: "Flowmate API",
    description: "API reference for Flowmate master data, requests, tasks, attachments, administration, and actions.",
    version: "1.0.0"
  };
  oOpenApiDocument.servers = [{
    url: SERVICE_PATH,
    description: "Flowmate OData V4 service"
  }];
  oOpenApiDocument.components ||= {};
  oOpenApiDocument.components.securitySchemes = {
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
  oOpenApiDocument.security = [
    { bearerAuth: [] },
    { basicAuth: [] }
  ];

  const fnContext = cds.middlewares.context();
  const fnAuthenticate = cds.middlewares.auth();
  const fnAuthorize = (req, res, next) => {
    const oUser = cds.context?.user || req.user;

    if (oUser?.is?.("Admin") || oUser?.is?.("UserProvisioning")) {
      return next();
    }

    return res.status(403).json({
      error: {
        code: "403",
        message: "Administrator or user provisioning authority is required to access API documentation"
      }
    });
  };

  cds.app.get(`${DOCS_PATH}/openapi.json`, fnContext, fnAuthenticate, fnAuthorize, (_req, res) => {
    res.json(oOpenApiDocument);
  });
  cds.app.use(
    DOCS_PATH,
    fnContext,
    fnAuthenticate,
    fnAuthorize,
    swaggerUi.serve,
    swaggerUi.setup(oOpenApiDocument, {
      customSiteTitle: "Flowmate API",
      swaggerOptions: {
        displayRequestDuration: true,
        filter: true,
        persistAuthorization: true

      }
    })
  );
});

module.exports = cds.server;
