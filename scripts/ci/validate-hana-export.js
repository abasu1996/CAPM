const fs = require("fs");
const path = require("path");

const root = path.resolve(process.argv[2] || "");
const requirements = {
  "flowmate-common": {
    minimumTables: 6,
    requiredRows: {
      FLOWMATE_COMMON_DB_USERS: 1,
      FLOWMATE_COMMON_DB_TEAMS: 1,
      FLOWMATE_COMMON_DB_TEAMMEMBERS: 1
    }
  },
  flowmate: {
    minimumTables: 20,
    requiredRows: {
      FLOWMATE_DB_PROCESSSTEPCONFIG: 1,
      FLOWMATE_DB_PROCESSSUBTYPES: 1,
      FLOWMATE_DB_PROCESSTYPES: 1
    }
  },
  "flowmate-CA": {
    minimumTables: 20,
    requiredRows: {
      FLOWMATE_CA_DB_REQUESTTYPES: 1,
      FLOWMATE_CA_DB_REQUESTVARIANTS: 1,
      FLOWMATE_CA_DB_WORKFLOWSTEPCONFIGS: 1
    }
  }
};

for (const [project, rule] of Object.entries(requirements)) {
  const manifestPath = path.join(root, project, "manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error(`Missing ${manifestPath}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest.tables) || manifest.tables.length < rule.minimumTables) {
    throw new Error(`${project}: only ${manifest.tables?.length || 0} tables were exported`);
  }
  const failures = manifest.tables.filter((table) => table.error);
  if (failures.length) {
    throw new Error(`${project}: export failures: ${failures.map((table) => table.tableName).join(", ")}`);
  }
  const byName = new Map(manifest.tables.map((table) => [table.tableName, table]));
  for (const [tableName, minimumRows] of Object.entries(rule.requiredRows)) {
    const table = byName.get(tableName);
    if (!table || table.rowCount < minimumRows) {
      throw new Error(`${project}: ${tableName} has ${table?.rowCount ?? "no"} rows; expected at least ${minimumRows}`);
    }
  }
  const totalRows = manifest.tables.reduce((sum, table) => sum + Number(table.rowCount || 0), 0);
  console.log(`${project}: verified ${manifest.tables.length} tables and ${totalRows} rows`);
}

