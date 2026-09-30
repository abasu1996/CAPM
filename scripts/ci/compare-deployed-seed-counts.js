const fs = require("fs");
const path = require("path");

const preExportRoot = path.resolve(process.argv[2] || "");
const postExportRoot = path.resolve(process.argv[3] || "");
const repositoryRoot = path.resolve(__dirname, "../..");
const projects = {
  flowmate: { namespace: "flowmate.db-", prefix: "FLOWMATE_DB_" },
  "flowmate-CA": { namespace: "flowmate.ca.db-", prefix: "FLOWMATE_CA_DB_" },
  "flowmate-common": { namespace: "flowmate.common.db-", prefix: "FLOWMATE_COMMON_DB_" }
};

for (const [project, naming] of Object.entries(projects)) {
  const beforeManifest = JSON.parse(fs.readFileSync(path.join(preExportRoot, project, "manifest.json"), "utf8"));
  const afterManifest = JSON.parse(fs.readFileSync(path.join(postExportRoot, project, "manifest.json"), "utf8"));
  const before = new Map(beforeManifest.tables.map((table) => [table.tableName, Number(table.rowCount)]));
  const after = new Map(afterManifest.tables.map((table) => [table.tableName, Number(table.rowCount)]));
  const dataDirectory = path.join(repositoryRoot, project, "db", "reference-data");
  let verified = 0;

  for (const filename of fs.readdirSync(dataDirectory).filter((name) => name.endsWith(".csv"))) {
    if (!filename.startsWith(naming.namespace)) continue;
    const entity = filename
      .slice(naming.namespace.length, -4)
      .replace(/\.texts$/, "_TEXTS")
      .toUpperCase();
    const tableName = `${naming.prefix}${entity}`;
    if (!before.has(tableName) || !after.has(tableName)) {
      throw new Error(`${project}: pre/post-deployment table not found for ${filename}: ${tableName}`);
    }
    if (after.get(tableName) !== before.get(tableName)) {
      throw new Error(`${project}: ${tableName} row count changed during deployment (${before.get(tableName)} -> ${after.get(tableName)})`);
    }
    verified += 1;
  }
  console.log(`${project}: verified ${verified} reference tables were not reseeded during deployment`);
}
