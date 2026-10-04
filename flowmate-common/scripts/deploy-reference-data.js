#!/usr/bin/env node
const cds = require("@sap/cds");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const namespace = "flowmate.common.db";
const dataDirectory = path.resolve(__dirname, "../db/reference-data");
const excludedEntities = new Set([
  "Users",
  "Teams",
  "TeamMembers",
  "Vendors",
  "Customers",
  "Roles",
  "Roles_texts",
  "Delegations"
]);

function parseCsv(text) {
  const records = [];
  let record = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      record.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      record.push(field);
      if (record.some((value) => value !== "")) records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field || record.length) {
    record.push(field);
    records.push(record);
  }
  if (!records.length) return [];

  const headers = records[0];
  return records.slice(1).map((values) => Object.fromEntries(
    headers.map((header, index) => [header, values[index] ?? ""])
  ));
}

function convertedValue(value, element) {
  if (value === "") return null;
  if (element.type === "cds.Boolean") return /^(true|1)$/i.test(value);
  if (["cds.Integer", "cds.Integer64", "cds.UInt8"].includes(element.type)) return Number(value);
  if (["cds.Decimal", "cds.DecimalFloat", "cds.Double"].includes(element.type)) return Number(value);
  return value;
}

function stableUuid(value) {
  const hex = crypto.createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const normalized = hex.join("");
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20)}`;
}

async function main() {
  const model = await cds.load(["db", "srv"]);
  cds.model = cds.compile.for.nodejs(model);
  const db = await cds.connect.to("db");
  const files = fs.readdirSync(dataDirectory)
    .filter((file) => file.startsWith(`${namespace}-`) && file.endsWith(".csv"))
    .sort();
  const results = [];

  for (const file of files) {
    const entityName = file.slice(`${namespace}-`.length, -4);
    if (excludedEntities.has(entityName)) {
      results.push({ entity: entityName, status: "excluded", rows: 0 });
      continue;
    }

    const definitionName = `${namespace}.${entityName}`;
    const definition = cds.model.definitions[definitionName];
    if (!definition) {
      results.push({ entity: entityName, status: "not-in-model", rows: 0 });
      continue;
    }

    const parsedRows = parseCsv(fs.readFileSync(path.join(dataDirectory, file), "utf8"));
    const rows = parsedRows.map((row) => Object.fromEntries(
      Object.entries(row).map(([column, value]) => {
        const element = definition.elements[column];
        if (!element) throw new Error(`${entityName}: CSV column ${column} does not exist in the CDS entity`);
        return [column, convertedValue(value, element)];
      })
    ));
    if (definition.elements.ID?.key) {
      const businessKey = Object.keys(definition.elements).find((column) =>
        column !== "ID"
        && !["createdAt", "createdBy", "modifiedAt", "modifiedBy", "isActive"].includes(column)
        && !definition.elements[column].isAssociation
      );
      for (const row of rows) {
        if (!row.ID) {
          if (!businessKey || !row[businessKey]) {
            throw new Error(`${entityName}: cannot derive ID without a business-key value`);
          }
          row.ID = stableUuid(`${definitionName}:${businessKey}:${row[businessKey]}`);
        }
      }
    }

    if (rows.length) await db.run(cds.ql.UPSERT.into(definitionName).entries(rows));
    results.push({ entity: entityName, status: "upserted", rows: rows.length });
  }

  for (const result of results) {
    console.log(`${result.entity}: ${result.status}${result.rows ? ` (${result.rows} rows)` : ""}`);
  }
  console.log(`Reference deployment completed: ${results.filter((result) => result.status === "upserted").length} entities`);
}

main()
  .then(() => cds.shutdown())
  .catch(async (error) => {
    console.error(error);
    await cds.shutdown();
    process.exitCode = 1;
  });
