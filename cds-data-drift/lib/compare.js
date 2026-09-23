const { normalizeRecord } = require("./normalize");

const MANAGED_COLUMNS = new Set(["createdAt", "createdBy", "modifiedAt", "modifiedBy"]);

function determineKeys(entityName, definition, configuration) {
  const configured = configuration.entities?.[entityName]?.keys;
  if (configured?.length) return configured;
  return Object.entries(definition.elements || {}).filter(([, element]) => element.key).map(([name]) => name);
}

function determineComparedColumns(headers, keys, configuration, entityName) {
  const ignored = new Set([
    ...configuration.ignoreColumns,
    ...(configuration.entities?.[entityName]?.ignoreColumns || [])
  ]);
  if (configuration.ignoreManagedColumns) MANAGED_COLUMNS.forEach(column => ignored.add(column));
  return headers.filter(column => keys.includes(column) || !ignored.has(column));
}

function validateKeys(entityName, keys, headers) {
  if (!keys.length) throw new Error(`${entityName}: no CDS or configured comparison key was found`);
  for (const key of keys) {
    if (!headers.includes(key)) throw new Error(`${entityName}: key column '${key}' is missing from the CSV`);
  }
}

const keyOf = (record, keys) => JSON.stringify(keys.map(key => record[key]));
const businessKey = (record, keys) => Object.fromEntries(keys.map(key => [key, record[key]]));

function indexRecords(records, keys, source, entityName) {
  const indexed = new Map();
  const duplicates = [];
  records.forEach((record, index) => {
    const key = keyOf(record, keys);
    if (indexed.has(key)) {
      duplicates.push({ type: "DUPLICATE_KEY", entity: entityName, source, key: businessKey(record, keys), row: index + 2 });
    } else {
      indexed.set(key, record);
    }
  });
  return { indexed, duplicates };
}

function compareEntity({ entityName, definition, headers, csvRows, databaseRows, configuration, model }) {
  const keys = determineKeys(entityName, definition, configuration);
  validateKeys(entityName, keys, headers);
  const columns = determineComparedColumns(headers, keys, configuration, entityName);
  const normalizedCsv = csvRows.map(row => normalizeRecord(row, definition, columns, configuration, model));
  const normalizedDatabase = databaseRows.map(row => normalizeRecord(row, definition, columns, configuration, model));
  const localIndex = indexRecords(normalizedCsv, keys, "CSV", entityName);
  const databaseIndex = indexRecords(normalizedDatabase, keys, "DATABASE", entityName);
  const localOnly = [];
  const databaseOnly = [];
  const changed = [];

  for (const [key, localRecord] of localIndex.indexed) {
    const databaseRecord = databaseIndex.indexed.get(key);
    if (!databaseRecord) {
      localOnly.push({ key: businessKey(localRecord, keys), record: localRecord });
      continue;
    }
    const changes = columns
      .filter(column => !keys.includes(column) && localRecord[column] !== databaseRecord[column])
      .map(column => ({ column, csv: localRecord[column], database: databaseRecord[column] }));
    if (changes.length) changed.push({ key: businessKey(localRecord, keys), changes });
  }
  for (const [key, databaseRecord] of databaseIndex.indexed) {
    if (!localIndex.indexed.has(key)) {
      databaseOnly.push({ key: businessKey(databaseRecord, keys), record: databaseRecord });
    }
  }

  const duplicates = [...localIndex.duplicates, ...databaseIndex.duplicates];
  return {
    entity: entityName,
    keys,
    columns,
    counts: {
      csv: csvRows.length,
      database: databaseRows.length,
      localOnly: localOnly.length,
      databaseOnly: databaseOnly.length,
      changed: changed.length,
      duplicates: duplicates.length
    },
    localOnly,
    databaseOnly,
    changed,
    duplicates,
    synchronized: !localOnly.length && !databaseOnly.length && !changed.length && !duplicates.length
  };
}

module.exports = { determineKeys, determineComparedColumns, validateKeys, compareEntity };
