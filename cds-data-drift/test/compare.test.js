const test = require("node:test");
const assert = require("node:assert/strict");
const { compareEntity } = require("../lib/compare");

const definition = {
  elements: {
    code: { key: true, type: "cds.String" },
    name: { type: "cds.String" },
    isActive: { type: "cds.Boolean" },
    amount: { type: "cds.Decimal" },
    modifiedAt: { type: "cds.Timestamp" }
  }
};

const configuration = {
  entities: {},
  ignoreColumns: [],
  ignoreManagedColumns: true,
  emptyStringEqualsNull: true,
  trimStrings: false
};

test("treats equivalent typed values as synchronized", () => {
  const result = compareEntity({
    entityName: "demo.Types",
    definition,
    headers: ["code", "name", "isActive", "amount", "modifiedAt"],
    csvRows: [{ code: "A", name: "Alpha", isActive: "true", amount: "10.00", modifiedAt: "old" }],
    databaseRows: [{ code: "A", name: "Alpha", isActive: true, amount: "10", modifiedAt: "new" }],
    configuration
  });
  assert.equal(result.synchronized, true);
});

test("reports local-only, database-only and field changes", () => {
  const result = compareEntity({
    entityName: "demo.Types",
    definition,
    headers: ["code", "name", "isActive"],
    csvRows: [
      { code: "A", name: "New name", isActive: "true" },
      { code: "B", name: "Local", isActive: "true" }
    ],
    databaseRows: [
      { code: "A", name: "Old name", isActive: true },
      { code: "C", name: "Database", isActive: false }
    ],
    configuration
  });
  assert.equal(result.changed.length, 1);
  assert.deepEqual(result.changed[0].changes[0], {
    column: "name",
    csv: "New name",
    database: "Old name"
  });
  assert.deepEqual(result.localOnly[0].key, { code: "B" });
  assert.deepEqual(result.databaseOnly[0].key, { code: "C" });
});

test("detects duplicate business keys", () => {
  const result = compareEntity({
    entityName: "demo.Types",
    definition,
    headers: ["code", "name"],
    csvRows: [{ code: "A", name: "One" }, { code: "A", name: "Two" }],
    databaseRows: [{ code: "A", name: "One" }],
    configuration
  });
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.duplicates[0].source, "CSV");
});

test("supports configured composite business keys", () => {
  const result = compareEntity({
    entityName: "demo.Steps",
    definition: {
      elements: {
        ID: { key: true, type: "cds.UUID" },
        process: { type: "cds.String" },
        stepNo: { type: "cds.Integer" },
        name: { type: "cds.String" }
      }
    },
    headers: ["ID", "process", "stepNo", "name"],
    csvRows: [{ ID: "11111111-1111-1111-1111-111111111111", process: "P", stepNo: "1", name: "Review" }],
    databaseRows: [{ ID: "22222222-2222-2222-2222-222222222222", process: "P", stepNo: 1, name: "Review" }],
    configuration: {
      ...configuration,
      entities: { "demo.Steps": { keys: ["process", "stepNo"], ignoreColumns: ["ID"] } }
    }
  });
  assert.equal(result.synchronized, true);
});
