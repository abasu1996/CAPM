const fs = require("fs");
const path = require("path");

const postExportRoot = path.resolve(process.argv[2] || "");
const repositoryRoot = path.resolve(__dirname, "../..");
const projects = {
  flowmate: { namespace: "flowmate.db-", prefix: "FLOWMATE_DB_" },
  "flowmate-CA": { namespace: "flowmate.ca.db-", prefix: "FLOWMATE_CA_DB_" },
  "flowmate-common": { namespace: "flowmate.common.db-", prefix: "FLOWMATE_COMMON_DB_" }
};

const countCsvRows = (filename) => {
  const text = fs.readFileSync(filename, "utf8");
  let rows = 0;
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '"') {
      if (quoted && text[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (text[index] === "\n" && !quoted) rows += 1;
  }
  return Math.max(0, rows - 1);
};

for (const [project, naming] of Object.entries(projects)) {
  const manifestPath = path.join(postExportRoot, project, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const deployed = new Map(manifest.tables.map((table) => [table.tableName, table.rowCount]));
  const dataDirectory = path.join(repositoryRoot, project, "db", "data");
  let verified = 0;

  for (const filename of fs.readdirSync(dataDirectory).filter((name) => name.endsWith(".csv"))) {
    if (!filename.startsWith(naming.namespace)) continue;
    const entity = filename
      .slice(naming.namespace.length, -4)
      .replace(/\.texts$/, "_TEXTS")
      .toUpperCase();
    const tableName = `${naming.prefix}${entity}`;
    if (!deployed.has(tableName)) {
      throw new Error(`${project}: deployed table not found for ${filename}: ${tableName}`);
    }
    const expected = countCsvRows(path.join(dataDirectory, filename));
    const actual = Number(deployed.get(tableName));
    if (actual !== expected) {
      throw new Error(`${project}: ${tableName} has ${actual} rows after deployment; CSV has ${expected}`);
    }
    verified += 1;
  }
  console.log(`${project}: verified ${verified} deployed seed table row counts`);
}

