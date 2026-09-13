/**
 * Exports every physical table in the HANA HDI schema bound to the current
 * CAP project. Use this recovery exporter when the local CDS model may be
 * newer or older than the deployed database schema.
 *
 * Required environment variable:
 *   RECOVERY_EXPORT_DIR  Destination directory for JSON files and manifest.
 *
 * The script performs SELECT operations only. Binary columns are excluded.
 */
const cds = require("@sap/cds");
const fs = require("fs");
const path = require("path");

const outputDirectory = process.env.RECOVERY_EXPORT_DIR;

const stringify = (value) => JSON.stringify(value, (_key, item) => {
  if (typeof item === "bigint") {
    return item.toString();
  }
  if (Buffer.isBuffer(item)) {
    return undefined;
  }
  return item;
}, 2);

const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;
const quoteLiteral = (value) => `'${String(value).replace(/'/g, "''")}'`;
const excludedTypes = new Set([
  "BINARY",
  "BLOB",
  "ST_GEOMETRY",
  "ST_POINT",
  "VARBINARY"
]);

async function exportCatalog() {
  if (!outputDirectory) {
    throw new Error("RECOVERY_EXPORT_DIR is required");
  }

  fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  const db = await cds.connect.to("db");
  const schemaResult = await db.run("SELECT CURRENT_SCHEMA AS SCHEMA_NAME FROM DUMMY");
  const schema = schemaResult[0]?.SCHEMA_NAME;
  if (!schema) {
    throw new Error("Could not determine the current HDI schema");
  }

  const tables = await db.run(
    `SELECT TABLE_NAME FROM SYS.TABLES WHERE SCHEMA_NAME = ${quoteLiteral(schema)} ORDER BY TABLE_NAME`
  );
  const manifest = {
    exportedAt: new Date().toISOString(),
    schema,
    profile: "hybrid",
    source: "SYS.TABLES",
    binaryColumnsExcluded: true,
    tables: []
  };

  for (const tableEntry of tables) {
    const tableName = tableEntry.TABLE_NAME;
    const columnMetadata = await db.run(
      `SELECT COLUMN_NAME, DATA_TYPE_NAME FROM SYS.TABLE_COLUMNS ` +
      `WHERE SCHEMA_NAME = ${quoteLiteral(schema)} ` +
      `AND TABLE_NAME = ${quoteLiteral(tableName)} ORDER BY POSITION`
    );
    const includedColumns = columnMetadata
      .filter((column) => !excludedTypes.has(String(column.DATA_TYPE_NAME || "").toUpperCase()));
    const excludedColumns = columnMetadata
      .filter((column) => excludedTypes.has(String(column.DATA_TYPE_NAME || "").toUpperCase()))
      .map((column) => ({ name: column.COLUMN_NAME, type: column.DATA_TYPE_NAME }));

    try {
      let rows;
      let rowCount;
      if (includedColumns.length) {
        const selectList = includedColumns
          .map((column) => quoteIdentifier(column.COLUMN_NAME))
          .join(", ");
        rows = await db.run(
          `SELECT ${selectList} FROM ${quoteIdentifier(schema)}.${quoteIdentifier(tableName)}`
        );
        rowCount = rows.length;
      } else {
        const countResult = await db.run(
          `SELECT COUNT(*) AS ROW_COUNT FROM ${quoteIdentifier(schema)}.${quoteIdentifier(tableName)}`
        );
        rows = [];
        rowCount = Number(countResult[0]?.ROW_COUNT || 0);
      }
      const filename = `${tableName.replace(/[^A-Za-z0-9_.-]/g, "_")}.json`;
      fs.writeFileSync(
        path.join(outputDirectory, filename),
        `${stringify(rows)}\n`,
        { mode: 0o600 }
      );
      manifest.tables.push({
        tableName,
        file: filename,
        rowCount,
        includedColumnCount: includedColumns.length,
        excludedColumns
      });
    } catch (error) {
      manifest.tables.push({
        tableName,
        error: String(error.message || error),
        excludedColumns
      });
    }
  }

  fs.writeFileSync(
    path.join(outputDirectory, "manifest.json"),
    `${stringify(manifest)}\n`,
    { mode: 0o600 }
  );

  const failures = manifest.tables.filter((entry) => entry.error);
  console.log(`Exported ${manifest.tables.length - failures.length} physical tables; failures: ${failures.length}`);
  if (typeof db.disconnect === "function") {
    await db.disconnect();
  }
  if (failures.length) {
    process.exitCode = 1;
  }
}

exportCatalog().catch((error) => {
  console.error(`Catalog export failed: ${error.message || error}`);
  process.exitCode = 1;
});
