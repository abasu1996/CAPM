const { compile } = require("@cap-js/openapi");

const SECURITY_SCHEMES = {
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

const DEFAULT_SECURITY = [
  { bearerAuth: [] },
  { basicAuth: [] }
];

function createServiceOpenApiDocument(oModel, oService) {
  const oDocument = compile(oModel, { service: oService.name });

  oDocument.info = {
    title: oService.title,
    description: oService.description,
    version: "1.0.0"
  };
  oDocument.servers = [{
    url: oService.path,
    description: `${oService.title} OData V4 service`
  }];
  oDocument.components ||= {};
  oDocument.components.securitySchemes = SECURITY_SCHEMES;
  oDocument.security = DEFAULT_SECURITY;

  if (oService.name === "FlowmateService") {
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
  }

  return oDocument;
}

function createConsolidatedOpenApiDocument(aServices) {
  const oResult = {
    openapi: "3.0.2",
    info: {
      title: "Flowmate Platform API",
      description: [
        "Single API reference for the Flowmate platform.",
        "",
        "It includes the core Flowmate workflow service, the customer-specific Flowmate CA services, and the shared Flowmate Common master-data service."
      ].join("\n"),
      version: "2.0.0"
    },
    servers: [{
      url: "/",
      description: "Current application host; paths include each CAP service base path"
    }],
    security: DEFAULT_SECURITY,
    tags: [],
    paths: {},
    components: {
      schemas: {},
      parameters: {},
      responses: {},
      securitySchemes: SECURITY_SCHEMES
    }
  };

  for (const { descriptor, document } of aServices) {
    const sTagPrefix = descriptor.tagPrefix;

    for (const oTag of document.tags || []) {
      oResult.tags.push({
        ...oTag,
        name: `${sTagPrefix} — ${oTag.name}`
      });
    }

    for (const [sPath, oPathItem] of Object.entries(document.paths || {})) {
      const sFullPath = `${descriptor.path}${sPath}`;
      const oPrefixedPathItem = structuredClone(oPathItem);

      for (const oOperation of Object.values(oPrefixedPathItem)) {
        if (!oOperation || typeof oOperation !== "object" || !Array.isArray(oOperation.tags)) {
          continue;
        }
        oOperation.tags = oOperation.tags.map((sTag) => `${sTagPrefix} — ${sTag}`);
        oOperation["x-flowmate-project"] = descriptor.project;
        oOperation["x-cap-service"] = descriptor.name;
      }

      oResult.paths[sFullPath] = oPrefixedPathItem;
    }

    for (const [sComponentType, oComponents] of Object.entries(document.components || {})) {
      if (sComponentType === "securitySchemes") {
        continue;
      }
      oResult.components[sComponentType] ||= {};
      for (const [sName, oDefinition] of Object.entries(oComponents || {})) {
        if (!(sName in oResult.components[sComponentType])) {
          oResult.components[sComponentType][sName] = oDefinition;
        }
      }
    }
  }

  return oResult;
}

module.exports = {
  createServiceOpenApiDocument,
  createConsolidatedOpenApiDocument
};
