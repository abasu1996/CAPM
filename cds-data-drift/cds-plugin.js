const cds = require("@sap/cds");

cds.env.dataDrift ??= {};
Object.assign(cds.env.dataDrift, {
  folders: cds.env.dataDrift.folders || ["db/data"],
  dbService: cds.env.dataDrift.dbService || "db",
  ignoreManagedColumns: cds.env.dataDrift.ignoreManagedColumns !== false,
  ignoreColumns: cds.env.dataDrift.ignoreColumns || [],
  excludeEntities: cds.env.dataDrift.excludeEntities || [],
  maxRowsPerEntity: cds.env.dataDrift.maxRowsPerEntity || 100000,
  maxReportedRows: cds.env.dataDrift.maxReportedRows || 100,
  emptyStringEqualsNull: cds.env.dataDrift.emptyStringEqualsNull !== false
});

module.exports = { name: "cds-data-drift" };
