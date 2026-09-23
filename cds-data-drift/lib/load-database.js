async function loadDatabaseRows({ cds, db, entityName, columns, maximumRows }) {
  const query = cds.ql.SELECT.from(entityName).columns(columns).limit(maximumRows + 1);
  const rows = await db.run(query);
  if (rows.length > maximumRows) {
    throw new Error(`${entityName}: database contains more than the configured ${maximumRows} rows`);
  }
  return rows;
}

module.exports = { loadDatabaseRows };
