#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const cds = require("@sap/cds");

const ROLE_PATH = path.resolve(__dirname, "../config/loa-roles.csv");
const ENTITY = "flowmate.common.db.Roles";

async function main() {
  const [headers, ...records] = cds.parse.csv(fs.readFileSync(ROLE_PATH, "utf8"));
  const rows = records.map((record) => Object.fromEntries(
    headers.map((header, index) => [
      header,
      header === "isActive" ? (String(record[index]).toLowerCase() === "true" ? 1 : 0) : record[index]
    ])
  ));
  const db = await cds.connect.to("db");
  const existing = await db.run(
    SELECT.from(ENTITY).columns("code").where({ code: { in: rows.map((row) => row.code) } })
  );
  const existingCodes = new Set(existing.map((row) => row.code));

  await db.tx(async (tx) => {
    for (const row of rows) {
      if (existingCodes.has(row.code)) {
        const { code, ...changes } = row;
        await tx.run(UPDATE(ENTITY).set(changes).where({ code }));
      } else {
        await tx.run(INSERT.into(ENTITY).entries(row));
      }
    }
  });

  console.log(`Applied ${rows.length} LoA roles (${existing.length} updated, ${rows.length - existing.length} inserted).`);
  console.log("No unrelated roles were deleted.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => cds.disconnect());
