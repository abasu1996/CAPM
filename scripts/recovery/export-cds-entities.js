/**
 * Exports persisted CDS entities from the HANA database bound to the current
 * CAP project. This is intended for recovery snapshots when the local CDS
 * model matches the deployed database schema.
 *
 * Required environment variables:
 *   RECOVERY_EXPORT_DIR  Destination directory for JSON files and manifest.
 *   RECOVERY_NAMESPACE   Database namespace, for example flowmate.db.
 *
 * The script performs SELECT operations only. Binary columns are excluded.
 */
const cds = require("@sap/cds");
const fs = require("fs");
const path = require("path");

const outputDirectory = process.env.RECOVERY_EXPORT_DIR;
const namespace = process.env.RECOVERY_NAMESPACE;

const stringify = (value) => JSON.stringify(value, (_key, item) => {
  if (typeof item === "bigint") {
    return item.toString();
  }
  if (Buffer.isBuffer(item)) {
    return undefined;
  }
  return item;
}, 2);

async function exportDatabase() {
  if (!outputDirectory || !namespace) {
    throw new Error("RECOVERY_EXPORT_DIR and RECOVERY_NAMESPACE are required");
  }

  fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  const model = await cds.load("*");
  cds.model = model;
  const db = await cds.connect.to("db");
  const prefix = `${namespace}.`;
  const entities = Object.entries(model.definitions)
    .filter(([qualifiedName, definition]) =>
      qualifiedName.startsWith(prefix) &&
      definition.kind === "entity" &&
      !definition.query &&
      definition["@cds.persistence.skip"] !== true
    )
    .sort(([left], [right]) => left.localeCompare(right));
  const manifest = {
    exportedAt: new Date().toISOString(),
    namespace,
    profile: "hybrid",
    source: "CDS model",
    binaryColumnsExcluded: true,
    entities: []
  };

  for (const [qualifiedName, entity] of entities) {
    const name = qualifiedName.slice(prefix.length);
    const columns = Object.entries(entity.elements || {})
      .filter(([_elementName, element]) =>
        !element.target &&
        !element.virtual &&
        element.type !== "cds.LargeBinary" &&
        element.type !== "cds.Binary"
      )
      .map(([elementName]) => elementName);

    try {
      const rows = await db.run(SELECT.from(qualifiedName).columns(...columns));
      const filename = `${name.replace(/[^A-Za-z0-9_.-]/g, "_")}.json`;
      fs.writeFileSync(
        path.join(outputDirectory, filename),
        `${stringify(rows)}\n`,
        { mode: 0o600 }
      );
      manifest.entities.push({
        name,
        file: filename,
        rowCount: rows.length,
        columnCount: columns.length
      });
    } catch (error) {
      manifest.entities.push({
        name,
        error: String(error.message || error)
      });
    }
  }

  fs.writeFileSync(
    path.join(outputDirectory, "manifest.json"),
    `${stringify(manifest)}\n`,
    { mode: 0o600 }
  );

  const failures = manifest.entities.filter((entry) => entry.error);
  console.log(`Exported ${manifest.entities.length - failures.length} entities; failures: ${failures.length}`);
  if (typeof db.disconnect === "function") {
    await db.disconnect();
  }
  if (failures.length) {
    process.exitCode = 1;
  }
}

exportDatabase().catch((error) => {
  console.error(`Export failed: ${error.message || error}`);
  process.exitCode = 1;
});
