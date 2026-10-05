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

  if (oService.name === "FlowmateCAService") {
    const createRequest = oDocument.paths?.["/createRequest"]?.post;
    if (createRequest) {
      createRequest.description = [
        createRequest.description,
        "Technical PO creation: use a client-credentials token from flowmate-api-auth with the CA PORequestCreate scope. Supply input.requesterUser_ID with an active shared Users.ID, following the Flowmate requester model. No client-to-user environment mapping is required. CAAdmin alone does not authorize this action. Human users continue to use their active signed-in identity and cannot supply a different requester. The authenticated client ID is recorded separately in creation history.",
        "The input.details property is a JSON-encoded string matching PurchaseOrderDetails, including optional WorkHUBID and WorkHubAppID (String, maximum 100 characters each). The configured workflow initializes during creation; the response status depends on the applicable steps. Use reference codes that exist in the target environment."
      ].filter(Boolean).join("\n\n");
      const content = createRequest.requestBody?.content?.["application/json"];
      if (content) {
        content.examples = {
          purchaseOrder: {
            summary: "PO creation with WorkHUB references",
            value: {
              input: {
                requestTypeCode: "PURCHASE_ORDER",
                requestVariantCode: "PO_OPEX",
                requesterUser_ID: "01234567-89ab-cdef-0123-456789abcdef",
                title: "WorkHUB PO integration example",
                description: "Sample purchase order sent by an external system",
                priorityCode: "MEDIUM",
                processorTeamCode: "REPLACE_WITH_ACTIVE_TEAM_CODE",
                details: JSON.stringify({
                  WorkHUBID: "WH-000123",
                  WorkHubAppID: "WH-APP-001",
                  purchaseOrderType_code: "GENERAL",
                  procurementCategory_code: "OPEX",
                  currency_code: "LKR",
                  totalValue: 1000,
                  items: [{ description: "Sample material", quantity: 2, unitPrice: 500, unitOfMeasure_code: "EA" }]
                })
              }
            }
          }
        };
      }
    }
    const requests = oDocument.paths?.["/Requests"]?.get;
    if (requests) {
      requests.description = [
        requests.description,
        "Used by the All Requests tile. Returns CA requests across all users and teams; MyRequests remains the personal list. Supports server-side filtering, sorting and paging with $filter, $orderby, $top, $skip and $count=true.",
        "Example $filter: status_code eq 'SUBMITTED' and requestType_code eq 'PURCHASE_ORDER' and createdAt ge 2026-10-01T00:00:00Z and createdAt lt 2026-11-01T00:00:00Z. Convert selected local dates to UTC and use an exclusive next-day upper bound to include the entire end date."
      ].filter(Boolean).join("\n\n");
    }
    const counts = oDocument.paths?.["/getDashboardCounts()"]?.get || oDocument.paths?.["/getDashboardCounts"]?.get;
    if (counts) {
      counts.description = [counts.description,
        "allRequests counts every CA request across users, teams and statuses. Personal request/task counts retain their existing user filters."
      ].filter(Boolean).join("\n\n");
    }
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
