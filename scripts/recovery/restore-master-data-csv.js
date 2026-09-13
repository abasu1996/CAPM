/**
 * Restore master/configuration db/data CSVs from an authoritative HANA catalog
 * export. Operational request/task/history/attachment/outbox tables are excluded.
 *
 * Usage:
 *   node scripts/recovery/restore-master-data-csv.js \
 *     /absolute/path/to/recovery-export /absolute/path/to/repository
 */
const fs = require("fs");
const path = require("path");

const exportRoot = path.resolve(process.argv[2] || "");
const repositoryRoot = path.resolve(process.argv[3] || "");

const definitions = {
  flowmate: {
    namespace: "flowmate.db",
    tablePrefix: "FLOWMATE_DB_",
    entities: {
      Categories: ["code", "name", "descr"],
      Currencies: ["code", "name", "descr"],
      DNSProcess: ["ID", "createdAt", "createdBy", "modifiedAt", "modifiedBy"],
      FtkEntities: ["code", "name", "descr"],
      GuaranteeTypes: ["code", "name", "descr"],
      LoaApproval: ["ID", "createdAt", "createdBy", "modifiedAt", "modifiedBy", "amount", "operator_code", "roleCode"],
      Operator: ["code", "name", "descr"],
      PaymentCategories: ["code", "name", "descr"],
      PaymentMethod: ["code", "name", "descr"],
      PaymentSubCategories: ["code", "name", "descr"],
      Priorities: ["code", "name", "descr"],
      ProcessStatus: ["code", "name", "descr"],
      ProcessStepConfig: ["ID", "createdAt", "createdBy", "modifiedAt", "modifiedBy", "referenceNumber", "subProcessType_code", "processType_code", "processorTeam_ID", "processorTeamName", "stepNo", "stepName", "activityDescription", "role", "slaDays"],
      ProcessSubTypes: ["code", "name", "descr", "processType_code", "workingCalendar_ID", "loaApprovalApplicable", "processOwner", "activityDescription", "sapTCode"],
      ProcessTypes: ["code", "name", "descr"],
      RequestDivision: ["code", "name", "descr"],
      RequestDropDown: ["code", "description", "name", "descr"],
      "RequestDropDown.texts": ["code", "locale", "name", "descr"],
      RequestType: ["ID", "createdAt", "createdBy", "modifiedAt", "modifiedBy"],
      TaskStatus: ["code", "name", "descr"],
      TypeOfPayment: ["code", "name", "descr"],
      Users: ["ID", "createdAt", "createdBy", "modifiedAt", "modifiedBy", "referenceNumber", "azureObjectId", "userPrincipalName", "displayName", "email", "department", "manager_ID", "isActive"],
      WorkingCalendarDays: ["ID", "createdAt", "createdBy", "modifiedAt", "modifiedBy", "calendar_ID", "dayOfWeek", "isWorkingDay", "startTime", "endTime"],
      WorkingCalendarHolidays: ["ID", "createdAt", "createdBy", "modifiedAt", "modifiedBy", "calendar_ID", "holidayDate", "name", "isWorkingDay", "startTime", "endTime", "isActive", "notes"],
      WorkingCalendars: ["ID", "createdAt", "createdBy", "modifiedAt", "modifiedBy", "code", "name", "timeZone", "isDefault", "isActive"],
      centralizedPO: ["ID", "createdAt", "createdBy", "modifiedAt", "modifiedBy"],
      civilRR: ["ID", "createdAt", "createdBy", "modifiedAt", "modifiedBy"],
      equipmentCode: ["ID", "createdAt", "createdBy", "modifiedAt", "modifiedBy"],
      inhousePOProcess: ["ID", "createdAt", "createdBy", "modifiedAt", "modifiedBy"],
      materialCode: ["ID", "createdAt", "createdBy", "modifiedAt", "modifiedBy"],
      materialReservation: ["ID", "createdAt", "createdBy", "modifiedAt", "modifiedBy"],
      outlineContract: ["ID", "createdAt", "createdBy", "modifiedAt", "modifiedBy"],
      powerRR: ["ID", "createdAt", "createdBy", "modifiedAt", "modifiedBy"],
      projectCode: ["ID", "createdAt", "createdBy", "modifiedAt", "modifiedBy"],
      serviceCode: ["ID", "createdAt", "createdBy", "modifiedAt", "modifiedBy"],
      serviceEntrySheet: ["ID", "createdAt", "createdBy", "modifiedAt", "modifiedBy"]
    }
  },
  "flowmate-CA": {
    namespace: "flowmate.ca.db",
    tablePrefix: "FLOWMATE_CA_DB_",
    entities: {
      ContractCategories: ["code", "name", "description", "isActive", "sortOrder"],
      CoupaCommodityCodes: ["code", "name", "description", "isActive", "sortOrder"],
      Currencies: ["code", "name", "description", "isActive", "sortOrder"],
      ExternalMaterialGroups: ["code", "name", "description", "isActive", "sortOrder"],
      MaterialGroups: ["code", "name", "description", "isActive", "sortOrder"],
      PaymentTerms: ["code", "name", "description", "isActive", "sortOrder"],
      Plants: ["code", "name", "description", "isActive", "sortOrder"],
      Priorities: ["code", "name", "description", "isActive", "sortOrder"],
      ProcurementCategories: ["code", "name", "description", "isActive", "sortOrder"],
      ProfitCenters: ["code", "name", "description", "isActive", "sortOrder"],
      ProjectTypes: ["code", "name", "description", "isActive", "sortOrder"],
      PurchaseOrderTypes: ["code", "name", "description", "isActive", "sortOrder"],
      PurchasingOrganizations: ["code", "name", "description", "isActive", "sortOrder"],
      RequestStatuses: ["code", "name", "description", "isActive", "sortOrder"],
      RequestTypes: ["code", "name", "description", "isActive", "sortOrder", "icon"],
      RequestVariants: ["code", "name", "description", "isActive", "sortOrder", "requestType_code"],
      ServiceGroups: ["code", "name", "description", "isActive", "sortOrder"],
      TaskStatuses: ["code", "name", "description", "isActive", "sortOrder"],
      UnitsOfMeasure: ["code", "name", "description", "isActive", "sortOrder"],
      ValuationClasses: ["code", "name", "description", "isActive", "sortOrder"],
      Warehouses: ["code", "name", "description", "isActive", "sortOrder"],
      WorkflowStepConfigs: ["ID", "createdAt", "createdBy", "modifiedAt", "modifiedBy", "requestType_code", "requestVariant_code", "stepNo", "stepName", "activityDescription", "processorTeam_ID", "roleCode", "taskName", "isApproval", "isMandatory", "slaDays", "isActive"]
    }
  },
  "flowmate-common": {
    namespace: "flowmate.common.db",
    tablePrefix: "FLOWMATE_COMMON_DB_",
    entities: {
      Users: ["ID", "createdAt", "createdBy", "modifiedAt", "modifiedBy", "referenceNumber", "userPrincipalName", "displayName", "email", "azureObjectId", "department", "role_code", "manager_ID", "isActive"],
      Teams: ["ID", "createdAt", "createdBy", "modifiedAt", "modifiedBy", "referenceNumber", "teamCode", "name", "description", "isActive"],
      TeamMembers: ["ID", "createdAt", "createdBy", "modifiedAt", "modifiedBy", "referenceNumber", "team_ID", "user_ID", "displayName", "email", "isActive"],
      Vendors: ["ID", "createdAt", "createdBy", "modifiedAt", "modifiedBy", "vendorCode", "vendorName", "vendorEmail", "isActive"],
      Customers: ["ID", "createdAt", "createdBy", "modifiedAt", "modifiedBy", "customerCode", "customerName", "customerEmail", "isActive"]
    }
  }
};

const csvCell = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const physicalColumn = (column) => column.replace(/\./g, "_").toUpperCase();
const physicalTable = (prefix, entity) => `${prefix}${entity.replace(/\./g, "_").toUpperCase()}`;

if (!fs.existsSync(exportRoot)) throw new Error(`Export not found: ${exportRoot}`);
if (!fs.existsSync(repositoryRoot)) throw new Error(`Repository not found: ${repositoryRoot}`);

for (const [project, definition] of Object.entries(definitions)) {
  const dataDir = path.join(repositoryRoot, project, "db", "data");
  let totalRows = 0;
  let restoredFiles = 0;
  const skipped = [];
  for (const [entity, columns] of Object.entries(definition.entities)) {
    const table = physicalTable(definition.tablePrefix, entity);
    const source = path.join(exportRoot, project, `${table}.json`);
    if (!fs.existsSync(source)) {
      skipped.push(entity);
      continue;
    }
    const rows = JSON.parse(fs.readFileSync(source, "utf8"));
    const available = new Set(rows.flatMap((row) => Object.keys(row)));
    for (const column of columns) {
      const physical = physicalColumn(column);
      if (rows.length && !available.has(physical)) {
        throw new Error(`${table}: recovered column ${physical} is missing`);
      }
    }
    const output = path.join(dataDir, `${definition.namespace}-${entity}.csv`);
    const lines = [columns.map(csvCell).join(",")];
    for (const row of rows) {
      lines.push(columns.map((column) => csvCell(row[physicalColumn(column)])).join(","));
    }
    fs.writeFileSync(output, `${lines.join("\n")}\n`);
    totalRows += rows.length;
    restoredFiles += 1;
  }
  console.log(`${project}: ${restoredFiles} CSVs, ${totalRows} rows restored`);
  if (skipped.length) console.log(`${project}: no recovered table; preserved ${skipped.join(", ")}`);
}
