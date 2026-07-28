const cds = require("@sap/cds");
const swaggerUi = require("swagger-ui-express");
const { createOpenApiDocument } = require("./openapi");

const DOCS_PATH = "/api-docs";

cds.on("served", () => {
  const oOpenApiDocument = createOpenApiDocument(cds.clone(cds.model));

  const fnContext = cds.middlewares.context();
  const fnAuthenticate = cds.middlewares.auth();
  const fnAuthorize = (req, res, next) => {
    const oUser = cds.context?.user || req.user;

    if (
      oUser?.is?.("Admin")
      || oUser?.is?.("UserProvisioning")
      || oUser?.is?.("VendorProvisioning")
    ) {
      return next();
    }

    return res.status(403).json({
      error: {
        code: "403",
        message: "Administrator or provisioning authority is required to access API documentation"
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
