const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeDecimal, normalizeInteger, normalizeValue } = require("../lib/normalize");

test("normalizes decimals without converting through floating point", () => {
  assert.equal(normalizeDecimal("0010.5000"), "10.5");
  assert.equal(normalizeDecimal("9007199254740993.00"), "9007199254740993");
});

test("normalizes arbitrary-size integers", () => {
  assert.equal(normalizeInteger("00042"), "42");
  assert.equal(normalizeInteger("9007199254740993"), "9007199254740993");
});

test("can equate empty CSV values with database null", () => {
  assert.equal(normalizeValue("", { type: "cds.String" }, { emptyStringEqualsNull: true }), null);
});
