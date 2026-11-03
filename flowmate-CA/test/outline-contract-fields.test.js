const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

let formDefinitions;
vm.runInNewContext(fs.readFileSync(path.join(__dirname,
  "../app/flowmateca/webapp/model/FormDefinitions.js"), "utf8"), {
  sap: { ui: { define(_dependencies, factory) { formDefinitions = factory(); } } }
});

test("Outline Contract keeps WBS but hides Project Code from line-item screens", () => {
  for (const variant of ["CONTRACT_NEW", "CONTRACT_MOD_SINGLE"]) {
    for (const columns of [
      formDefinitions.getItemColumns("OUTLINE_CONTRACT", variant),
      formDefinitions.getItemDisplayColumns("OUTLINE_CONTRACT", variant)
    ]) {
      assert.ok(columns.some((column) => column.name === "wbsElement"));
      assert.ok(!columns.some((column) => column.name === "projectCode"));
    }
  }
  assert.ok(formDefinitions.getItemColumns("PURCHASE_ORDER", "PO_OPEX")
    .some((column) => column.name === "projectCode"));
});
