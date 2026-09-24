#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const cds = require("@sap/cds");

const CONFIG_PATH = path.resolve(__dirname, "../config/loa-workflow-statuses.csv");

async function main() {
  const [headers, ...records] = cds.parse.csv(fs.readFileSync(CONFIG_PATH, "utf8"));
  const rows = records.map((record) => Object.fromEntries(
    headers.map((header, index) => [header, record[index] ?? ""])
  ));
  const db = await cds.connect.to("db");

  await db.tx(async (tx) => {
    for (const { entity, code, name, descr, isActive } of rows) {
      await tx.run(UPSERT.into(entity).entries({
        code,
        name,
        descr,
        isActive: String(isActive).toLowerCase() === "true"
      }));
    }
  });

  console.log(`Applied ${rows.length} LoA workflow statuses without modifying unrelated status values.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => cds.disconnect());
