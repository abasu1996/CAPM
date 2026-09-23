const test = require("node:test");
const assert = require("node:assert/strict");
const { csvStemToEntityName } = require("../lib/discover-csv");

test("maps standard CAP CSV filenames to entities", () => {
  assert.equal(
    csvStemToEntityName("flowmate.db-ProcessSubTypes.csv"),
    "flowmate.db.ProcessSubTypes"
  );
  assert.equal(
    csvStemToEntityName("flowmate.db-RequestDropDown.texts.csv"),
    "flowmate.db.RequestDropDown.texts"
  );
});
