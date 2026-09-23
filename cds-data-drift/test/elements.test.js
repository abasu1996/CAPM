const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveElement } = require("../lib/elements");

test("resolves generated association foreign-key columns", () => {
  const model = {
    definitions: {
      "demo.Types": {
        elements: { code: { key: true, type: "cds.String" } }
      }
    }
  };
  const definition = {
    elements: {
      processType: {
        type: "cds.Association",
        target: "demo.Types",
        keys: [{ ref: ["code"] }]
      }
    }
  };
  assert.deepEqual(resolveElement(definition, "processType_code", model), {
    key: true,
    type: "cds.String"
  });
});
