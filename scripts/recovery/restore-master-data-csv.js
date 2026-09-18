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
      Categories: ["code", "name", "descr", "isActive"],
      Currencies: ["code", "name", "descr", "isActive"],
      DNSProcess: ["ID", "createdAt", "createdBy", "modifiedAt", "modifiedBy"],
      FtkEntities: ["code", "name", "descr", "isActive"],
      GuaranteeTypes: ["code", "name", "descr", "isActive"],
      Operator: ["code", "name", "descr", "isActive"],
      PaymentCategories: ["code", "name", "descr", "isActive"],
      PaymentMethod: ["code", "name", "descr", "isActive"],
      PaymentSubCategories: ["code", "name", "descr", "isActive"],
      Priorities: ["code", "name", "descr", "isActive"],
      ProcessStatus: ["code", "name", "descr", "isActive"],
      ProcessStepConfig: ["ID", "createdAt", "createdBy", "modifiedAt", "modifiedBy", "referenceNumber", "subProcessType_code", "processType_code", "processorTeam_ID", "processorTeamName", "stepNo", "stepName", "activityDescription", "role", "slaDays"],
      ProcessSubTypes: ["code", "name", "descr", "processType_code", "workingCalendar_ID", "loaApprovalApplicable", "processOwner", "activityDescription", "sapTCode", "isActive"],
      ProcessTypes: ["code", "name", "descr", "isActive"],
      RequestDivision: ["code", "name", "descr", "isActive"],
      RequestDropDown: ["code", "description", "name", "descr", "isActive"],
      "RequestDropDown.texts": ["code", "locale", "name", "descr"],
      RequestType: ["ID", "createdAt", "createdBy", "modifiedAt", "modifiedBy"],
      TaskStatus: ["code", "name", "descr", "isActive"],
      TypeOfPayment: ["code", "name", "descr", "isActive"],
      Users: ["ID", "createdAt", "createdBy", "modifiedAt", "modifiedBy", "referenceNumber", "azureObjectId", "userPrincipalName", "displayName", "email", "department", "manager_ID", "isActive"],
      WorkingCalendarDays: ["ID", "createdAt", "createdBy", "modifiedAt", "modifiedBy", "calendar_ID", "dayOfWeek", "isWorkingDay", "startTime", "endTime"],
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
      AccountAssignments: ["code", "name", "description", "isActive", "sortOrder"],
      ArReferences: ["code", "name", "description", "isActive", "sortOrder"],
      AvailabilityChecks: ["code", "name", "description", "isActive", "sortOrder"],
      BusinessEntities: ["code", "name", "description", "isActive", "sortOrder"],
      CompanyCodes: ["code", "name", "description", "isActive", "sortOrder"],
      ContractCategories: ["code", "name", "description", "isActive", "sortOrder"],
      ContractTypes: ["code", "name", "description", "isActive", "sortOrder"],
      CostCenters: ["code", "name", "description", "isActive", "sortOrder"],
      CoupaCommodityCodes: ["code", "name", "description", "isActive", "sortOrder"],
      Currencies: ["code", "name", "description", "isActive", "sortOrder"],
      DistributionChannels: ["code", "name", "description", "isActive", "sortOrder"],
      Divisions: ["code", "name", "description", "isActive", "sortOrder"],
      DocumentTypes: ["code", "name", "description", "isActive", "sortOrder"],
      ExternalMaterialGroups: ["code", "name", "description", "isActive", "sortOrder"],
      Incoterms: ["code", "name", "description", "isActive", "sortOrder"],
      ItemCategories: ["code", "name", "description", "isActive", "sortOrder"],
      MaterialCodes: ["code", "name", "description", "isActive", "sortOrder"],
      MaterialGroups: ["code", "name", "description", "isActive", "sortOrder"],
      MaterialTypes: ["code", "name", "description", "isActive", "sortOrder"],
      MrpTypes: ["code", "name", "description", "isActive", "sortOrder"],
      PaymentTerms: ["code", "name", "description", "isActive", "sortOrder"],
      Plants: ["code", "name", "description", "isActive", "sortOrder"],
      Priorities: ["code", "name", "description", "isActive", "sortOrder"],
      ProcurementCategories: ["code", "name", "description", "isActive", "sortOrder"],
      ProfitCenters: ["code", "name", "description", "isActive", "sortOrder"],
      ProjectCategories: ["code", "name", "description", "isActive", "sortOrder"],
      ProjectScopes: ["code", "name", "description", "isActive", "sortOrder"],
      ProjectTypes: ["code", "name", "description", "isActive", "sortOrder"],
      PurchaseOrderTypes: ["code", "name", "description", "isActive", "sortOrder"],
      PurchasingOrganizations: ["code", "name", "description", "isActive", "sortOrder"],
      RequestStatuses: ["code", "name", "description", "isActive", "sortOrder"],
      RequestTypes: ["code", "name", "description", "isActive", "sortOrder", "icon"],
      RequestVariants: ["code", "name", "description", "isActive", "sortOrder", "requestType_code"],
      ReservationBatches: ["code", "name", "description", "isActive", "sortOrder"],
      ReservationProjects: ["code", "name", "description", "isActive", "sortOrder"],
      SalesOrganizations: ["code", "name", "description", "isActive", "sortOrder"],
      SerialNumberProfiles: ["code", "name", "description", "isActive", "sortOrder"],
      ServiceCategories: ["code", "name", "description", "isActive", "sortOrder"],
      ServiceGroups: ["code", "name", "description", "isActive", "sortOrder"],
      Sites: ["code", "name", "description", "isActive", "sortOrder"],
      StorageLocations: ["code", "name", "description", "isActive", "sortOrder"],
      TaskStatuses: ["code", "name", "description", "isActive", "sortOrder"],
      TaxCodes: ["code", "name", "description", "isActive", "sortOrder"],
      UnitsOfMeasure: ["code", "name", "description", "isActive", "sortOrder"],
      ValuationClasses: ["code", "name", "description", "isActive", "sortOrder"],
      Warehouses: ["code", "name", "description", "isActive", "sortOrder"],
      WbsElements: ["code", "name", "description", "isActive", "sortOrder"],
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

// These lookup tables are maintained both through source control and in HANA.
// Preserve HANA-only rows, but allow intentional repository additions/changes
// to become the desired deployed value for the same business key.
const mergeRepositoryRowsBy = {
  "flowmate:Categories": ["code"],
  "flowmate:Currencies": ["code"],
  "flowmate:FtkEntities": ["code"],
  "flowmate:GuaranteeTypes": ["code"],
  "flowmate:Operator": ["code"],
  "flowmate:PaymentCategories": ["code"],
  "flowmate:PaymentMethod": ["code"],
  "flowmate:PaymentSubCategories": ["code"],
  "flowmate:Priorities": ["code"],
  "flowmate:ProcessStatus": ["code"],
  "flowmate:ProcessSubTypes": ["code"],
  "flowmate:ProcessTypes": ["code"],
  "flowmate:RequestDivision": ["code"],
  "flowmate:RequestDropDown": ["code"],
  "flowmate:TaskStatus": ["code"],
  "flowmate:TypeOfPayment": ["code"]
};

for (const entity of Object.keys(definitions["flowmate-CA"].entities)) {
  if (entity !== "WorkflowStepConfigs") {
    mergeRepositoryRowsBy[`flowmate-CA:${entity}`] = ["code"];
  }
}

const parseCsv = (text) => {
  const records = [];
  let record = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      record.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      record.push(field);
      if (record.some((value) => value !== "")) records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field || record.length) {
    record.push(field);
    records.push(record);
  }
  if (!records.length) return [];

  const headers = records[0];
  return records.slice(1).map((values) => Object.fromEntries(
    headers.map((header, index) => [header, values[index] ?? ""])
  ));
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
      if (rows.length && !available.has(physical) && column !== "isActive") {
        throw new Error(`${table}: recovered column ${physical} is missing`);
      }
    }
    const output = path.join(dataDir, `${definition.namespace}-${entity}.csv`);
    let outputRows = rows.map((row) => Object.fromEntries(
      columns.map((column) => [
        column,
        column === "isActive" && row[physicalColumn(column)] === undefined
          ? true
          : row[physicalColumn(column)]
      ])
    ));
    const mergeKeys = mergeRepositoryRowsBy[`${project}:${entity}`];
    if (mergeKeys && fs.existsSync(output)) {
      const repositoryRows = parseCsv(fs.readFileSync(output, "utf8"));
      const keyOf = (row) => mergeKeys.map((column) => String(row[column] ?? "")).join("\u001f");
      const merged = new Map(outputRows.map((row) => [keyOf(row), row]));
      for (const repositoryRow of repositoryRows) {
        const key = keyOf(repositoryRow);
        if (!key || mergeKeys.some((column) => !repositoryRow[column])) {
          throw new Error(`${project}/${entity}: repository row has an empty merge key`);
        }
        const recoveredRow = merged.get(key) || {};
        merged.set(key, Object.fromEntries(
          columns.map((column) => [
            column,
            Object.prototype.hasOwnProperty.call(repositoryRow, column)
              ? repositoryRow[column]
              : recoveredRow[column]
          ])
        ));
      }
      outputRows = [...merged.values()];
      console.log(`${project}/${entity}: merged ${rows.length} HANA rows with ${repositoryRows.length} repository rows`);
    }
    const lines = [columns.map(csvCell).join(",")];
    for (const row of outputRows) {
      lines.push(columns.map((column) => csvCell(row[column])).join(","));
    }
    fs.writeFileSync(output, `${lines.join("\n")}\n`);
    totalRows += outputRows.length;
    restoredFiles += 1;
  }
  console.log(`${project}: ${restoredFiles} CSVs, ${totalRows} rows restored`);
  if (skipped.length) console.log(`${project}: no recovered table; preserved ${skipped.join(", ")}`);
}
