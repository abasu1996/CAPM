const fs = require("node:fs");
const path = require("node:path");
const cds = require("@sap/cds");
const { createOpenApiDocument } = require("../openapi");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUTPUT_FILE = path.join(PROJECT_ROOT, "docs", "flowmate-openapi.json");

async function generateOpenApi() {
  const oModel = await cds.load(path.join(PROJECT_ROOT, "srv", "flowmate.cds"));
  const oDocument = createOpenApiDocument(cds.clone(oModel));

  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(oDocument, null, 2)}\n`, "utf8");
  console.log(`Generated ${path.relative(PROJECT_ROOT, OUTPUT_FILE)}`);
}

generateOpenApi().catch((oError) => {
  console.error("Failed to generate the Flowmate OpenAPI document", oError);
  process.exitCode = 1;
});
