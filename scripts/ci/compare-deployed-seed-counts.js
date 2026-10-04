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
  const generatedDirectory = path.join(repositoryRoot, project, "gen", "db", "src", "gen");
  const generatedTables = new Set(
    fs.existsSync(generatedDirectory)
      ? fs.readdirSync(generatedDirectory)
        .filter((name) => name.endsWith(".hdbtable"))
        .map((name) => name.slice(0, -".hdbtable".length))
      : []
  );
  let verified = 0;
  let migrated = 0;
  let newlyCreated = 0;

  for (const filename of fs.readdirSync(dataDirectory).filter((name) => name.endsWith(".csv"))) {
    if (!filename.startsWith(naming.namespace)) continue;
    const entity = filename
      .slice(naming.namespace.length, -4)
      .replace(/\.texts$/, "_TEXTS")
      .toUpperCase();
    const tableName = `${naming.prefix}${entity}`;

    // A reference file can remain for recovery/history after its entity has
    // moved to another HDI container. Only validate tables that the current
    // project build still owns; otherwise the old physical table is expected
    // to be absent from this project's exports.
    const generatedArtifact = `${naming.namespace.slice(0, -1)}.${filename
      .slice(naming.namespace.length, -4)
      .replace(/\.texts$/, "_texts")}`;
    if (!generatedTables.has(generatedArtifact)) {
      migrated += 1;
      continue;
    }

    if (!before.has(tableName) && after.has(tableName)) {
      if (after.get(tableName) !== 0) {
        throw new Error(`${project}: newly created ${tableName} contains ${after.get(tableName)} rows; reference CSV data was unexpectedly seeded`);
      }
      newlyCreated += 1;
      continue;
    }
    if (!before.has(tableName) || !after.has(tableName)) {
      throw new Error(`${project}: pre/post-deployment table not found for ${filename}: ${tableName}`);
    }
    if (after.get(tableName) !== before.get(tableName)) {
      throw new Error(`${project}: ${tableName} row count changed during deployment (${before.get(tableName)} -> ${after.get(tableName)})`);
    }
    verified += 1;
  }
  console.log(
    `${project}: verified ${verified} reference tables were not reseeded during deployment`
      + `; ${newlyCreated} new tables remained empty; ${migrated} migrated/non-owned reference files skipped`
  );
}
