const { resolveElement } = require("./elements");

function normalizeBoolean(value) {
  if ([true, 1, "1", "true", "TRUE"].includes(value)) return true;
  if ([false, 0, "0", "false", "FALSE"].includes(value)) return false;
  return value;
}

function normalizeInteger(value) {
  if (!/^-?\d+$/.test(String(value))) return value;
  return String(BigInt(String(value)));
}

function normalizeDecimal(value) {
  const text = String(value);
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return value;
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  let [integer, fraction = ""] = unsigned.split(".");
  integer = integer.replace(/^0+(?=\d)/, "");
  fraction = fraction.replace(/0+$/, "");
  const normalized = fraction ? `${integer}.${fraction}` : integer;
  return negative && normalized !== "0" ? `-${normalized}` : normalized;
}

function normalizeValue(value, element, configuration) {
  if (configuration.emptyStringEqualsNull && value === "") return null;
  if (value === undefined || value === null) return null;
  switch (element?.type) {
    case "cds.Boolean": return normalizeBoolean(value);
    case "cds.Integer":
    case "cds.Integer16":
    case "cds.Integer32":
    case "cds.Integer64":
    case "cds.UInt8": return normalizeInteger(value);
    case "cds.Decimal":
    case "cds.DecimalFloat":
    case "cds.Double": return normalizeDecimal(value);
    case "cds.Date": return String(value).slice(0, 10);
    case "cds.DateTime":
    case "cds.Timestamp": {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
    }
    case "cds.UUID": return String(value).toLowerCase();
    default: return configuration.trimStrings ? String(value).trim() : String(value);
  }
}

function normalizeRecord(record, definition, columns, configuration, model) {
  return Object.fromEntries(columns.map(column => [
    column,
    normalizeValue(record[column], resolveElement(definition, column, model), configuration)
  ]));
}

module.exports = { normalizeBoolean, normalizeInteger, normalizeDecimal, normalizeValue, normalizeRecord };
