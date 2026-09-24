#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const cds = require("@sap/cds");

const MATRIX_PATH = path.resolve(__dirname, "../config/loa-approval-matrix.csv");
const ENTITY = "flowmate.db.LoaApproval";
const NUMBERS = new Set(["minimumAmount", "maximumAmount", "priority", "amount"]);
const BOOLEANS = new Set(["minimumInclusive", "maximumInclusive", "isActive"]);

function normalize(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (value === "") return [key, null];
    if (NUMBERS.has(key)) return [key, Number(value)];
    if (BOOLEANS.has(key)) return [key, String(value).toLowerCase() === "true" ? 1 : 0];
    return [key, value];
  }));
}

async function main() {
  const [headers, ...records] = cds.parse.csv(fs.readFileSync(MATRIX_PATH, "utf8"));
  const rows = records.map((record) => normalize(
    Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ""]))
  ));
  const db = await cds.connect.to("db");
  const existing = await db.run(
    SELECT.from(ENTITY).columns("ID", "ruleCode").where({ ruleCode: { in: rows.map((row) => row.ruleCode) } })
  );
  const idsByRuleCode = new Map(existing.map((row) => [row.ruleCode, row.ID]));

  await db.tx(async (tx) => {
    for (const row of rows) {
      const existingId = idsByRuleCode.get(row.ruleCode);
      if (existingId) {
        const { ID: _matrixId, ...changes } = row;
        await tx.run(UPDATE(ENTITY).set(changes).where({ ID: existingId }));
      } else {
        await tx.run(INSERT.into(ENTITY).entries(row));
      }
    }
  });

  console.log(`Applied ${rows.length} LoA matrix rules (${existing.length} updated, ${rows.length - existing.length} inserted).`);
  console.log("No unrelated LoA rules were deleted.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => cds.disconnect());
