/**
 * Converts an authoritative HANA catalog JSON export into non-deployable CSV
 * recovery snapshots inside the corresponding CAP projects.
 *
 * Usage:
 *   node scripts/recovery/catalog-json-to-csv.js \
 *     /absolute/path/to/recovery-export \
 *     /absolute/path/to/repository
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const sourceRoot = path.resolve(process.argv[2] || "");
const repositoryRoot = path.resolve(process.argv[3] || "");
const snapshotName = path.basename(sourceRoot);
const projects = ["flowmate", "flowmate-CA", "flowmate-common"];

const csvCell = (value) => {
  if (value === null || value === undefined) {
    return "";
  }
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const writeCsv = (filename, headers, rows) => {
  const lines = [];
  if (headers.length) {
    lines.push(headers.map(csvCell).join(","));
    rows.forEach((row) => {
      lines.push(headers.map((header) => csvCell(row[header])).join(","));
    });
  }
  fs.writeFileSync(filename, `${lines.join("\r\n")}${lines.length ? "\r\n" : ""}`, {
    mode: 0o600
  });
};

const sha256 = (filename) => crypto
  .createHash("sha256")
  .update(fs.readFileSync(filename))
  .digest("hex");

if (!fs.existsSync(sourceRoot)) {
  throw new Error(`Recovery export does not exist: ${sourceRoot}`);
}
if (!fs.existsSync(repositoryRoot)) {
  throw new Error(`Repository does not exist: ${repositoryRoot}`);
}

for (const project of projects) {
  const sourceProject = path.join(sourceRoot, project);
  const sourceManifestFile = path.join(sourceProject, "manifest.json");
  const destination = path.join(repositoryRoot, project, "recovery-data", snapshotName);
  const sourceManifest = JSON.parse(fs.readFileSync(sourceManifestFile, "utf8"));
  const recoveryManifest = [];

  fs.mkdirSync(destination, { recursive: true, mode: 0o700 });

  for (const table of sourceManifest.tables) {
    if (table.error) {
      throw new Error(`${project}/${table.tableName} was not exported: ${table.error}`);
    }
    const sourceFile = path.join(sourceProject, table.file);
    const rows = JSON.parse(fs.readFileSync(sourceFile, "utf8"));
    if (!Array.isArray(rows)) {
      throw new Error(`${sourceFile} does not contain a JSON array`);
    }
    if (rows.length !== table.rowCount) {
      throw new Error(
        `${project}/${table.tableName} row mismatch: manifest=${table.rowCount}, JSON=${rows.length}`
      );
    }

    const headers = [];
    const seenHeaders = new Set();
    rows.forEach((row) => {
      Object.keys(row).forEach((header) => {
        if (!seenHeaders.has(header)) {
          seenHeaders.add(header);
          headers.push(header);
        }
      });
    });

    const csvFilename = `${table.tableName}.csv`;
    const csvFile = path.join(destination, csvFilename);
    writeCsv(csvFile, headers, rows);
    recoveryManifest.push({
      tableName: table.tableName,
      csvFile: csvFilename,
      rowCount: rows.length,
      columnCount: headers.length,
      emptyTable: rows.length === 0,
      binaryColumnsExcluded: (table.excludedColumns || []).map((column) => column.name).join("|"),
      sha256: sha256(csvFile)
    });
  }

  const manifestHeaders = [
    "tableName",
    "csvFile",
    "rowCount",
    "columnCount",
    "emptyTable",
    "binaryColumnsExcluded",
    "sha256"
  ];
  writeCsv(path.join(destination, "manifest.csv"), manifestHeaders, recoveryManifest);
  fs.copyFileSync(sourceManifestFile, path.join(destination, "source-manifest.json"));
  fs.chmodSync(path.join(destination, "source-manifest.json"), 0o600);

  const checksumLines = recoveryManifest
    .map((entry) => `${entry.sha256}  ${entry.csvFile}`)
    .concat([
      `${sha256(path.join(destination, "manifest.csv"))}  manifest.csv`,
      `${sha256(path.join(destination, "source-manifest.json"))}  source-manifest.json`
    ]);
  fs.writeFileSync(path.join(destination, "SHA256SUMS"), `${checksumLines.join("\n")}\n`, {
    mode: 0o600
  });

  console.log(
    `${project}: ${recoveryManifest.length} CSV files, ` +
    `${recoveryManifest.reduce((total, entry) => total + entry.rowCount, 0)} rows`
  );
}
