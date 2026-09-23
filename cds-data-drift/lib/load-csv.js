const fs = require("fs");
const { parse } = require("csv-parse/sync");
const { resolveElement } = require("./elements");

function loadCsv(csvDefinition) {
  const content = fs.readFileSync(csvDefinition.absolutePath, "utf8");
  const matrix = parse(content, { bom: true, skip_empty_lines: true, relax_column_count: false });
  if (!matrix.length) throw new Error(`${csvDefinition.filename}: CSV is empty`);
  const headers = matrix[0];
  const duplicateHeaders = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (duplicateHeaders.length) {
    throw new Error(`${csvDefinition.filename}: duplicate columns: ${[...new Set(duplicateHeaders)].join(", ")}`);
  }
  const records = matrix.slice(1).map(values => Object.fromEntries(
    headers.map((header, index) => [header, values[index] ?? ""])
  ));
  return { headers, records };
}

function validateCsvColumns(entityName, definition, headers, model) {
  return headers
    .filter(header => !resolveElement(definition, header, model))
    .map(column => ({
      type: "UNKNOWN_COLUMN",
      entity: entityName,
      column,
      message: `CSV column '${column}' does not exist in the CDS entity`
    }));
}

module.exports = { loadCsv, validateCsvColumns };
