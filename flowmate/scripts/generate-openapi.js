const fs = require("node:fs");
const path = require("node:path");
const cds = require("@sap/cds");
const {
  createServiceOpenApiDocument,
  createConsolidatedOpenApiDocument
} = require("../openapi");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUTPUT_FILE = path.join(PROJECT_ROOT, "docs", "flowmate-openapi.json");

const SERVICES = [
  {
    project: "flowmate",
    model: path.join(PROJECT_ROOT, "srv", "flowmate.cds"),
    name: "FlowmateService",
    path: "/odata/v4/flowmate",
    title: "Flowmate Core API",
    description: "Core workflow, request, task, attachment, administration, and process master-data API.",
    tagPrefix: "Flowmate"
  },
  {
    project: "flowmate-CA",
    model: path.resolve(PROJECT_ROOT, "..", "flowmate-CA", "srv", "flowmate-ca.cds"),
    name: "FlowmateCAService",
    path: "/odata/v4/flowmate-ca",
    title: "Flowmate CA API",
    description: "Customer-specific request workflows, tasks, request details, dashboards, and integrations.",
    tagPrefix: "Flowmate CA"
  },
  {
    project: "flowmate-CA",
    model: path.resolve(PROJECT_ROOT, "..", "flowmate-CA", "srv", "flowmate-ca.cds"),
    name: "CAMasterDataService",
    path: "/odata/v4/flowmate-ca-master",
    title: "Flowmate CA Master Data API",
    description: "Customer-specific administration facade for shared and CA workflow master data.",
    tagPrefix: "Flowmate CA Master"
  },
  {
    project: "flowmate-common",
    model: path.resolve(PROJECT_ROOT, "..", "flowmate-common", "srv", "master-data.cds"),
    name: "CommonMasterDataService",
    path: "/odata/v4/flowmate-common",
    title: "Flowmate Common API",
    description: "Shared users, teams, memberships, vendors, and delegations master-data API.",
    tagPrefix: "Flowmate Common"
  }
];

async function generateOpenApi() {
  const mModels = new Map();
  const aDocuments = [];

  for (const oService of SERVICES) {
    if (!mModels.has(oService.model)) {
      mModels.set(oService.model, await cds.load(oService.model));
    }

    const oDocument = createServiceOpenApiDocument(
      cds.clone(mModels.get(oService.model)),
      oService
    );
    aDocuments.push({ descriptor: oService, document: oDocument });
  }

  const oDocument = createConsolidatedOpenApiDocument(aDocuments);
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(oDocument, null, 2)}\n`, "utf8");

  console.log(`Generated ${path.relative(PROJECT_ROOT, OUTPUT_FILE)}`);
  console.log(`Included ${SERVICES.length} CAP services and ${Object.keys(oDocument.paths).length} API paths`);
}

generateOpenApi().catch((oError) => {
  console.error("Failed to generate the consolidated Flowmate OpenAPI document", oError);
  process.exitCode = 1;
});
