const cds = require("@sap/cds");
const fs = require("node:fs/promises");
const { executeHttpRequest } = require("@sap-cloud-sdk/http-client");
const {
  resolveTechnicalCreator,
  guardTechnicalOperation,
  assertTechnicalDetails,
  authenticatedTechnicalClient,
  normalizeAttachmentManifest
} = require("./lib/po-integration");
const { sendPoNumbersToWorkhub } = require("./lib/workhub");
const PDFDocument = require("pdfkit");
const SVGtoPDF = require("svg-to-pdfkit");
const { SELECT, INSERT, UPDATE, DELETE } = cds.ql;
// Only the server's completion path can mark a request as an automatic handoff.
const INTERNAL_FLOWMATE_HANDOFF = Symbol("internalFlowmateHandoff");

// ---- Budget Check (Purchase Order, New Service Entry Sheet) ----
// "Budget Check" (Purchase Order, and New Service Entry Sheet): the step auto-completes when the
// flow reaches it. It is optional: the S/4 Data Validation approver may request it with the
// Budget Check button, or approve without it. Which variants have it is set by their workflow
// config (a step named Budget Check before S/4 Data Validation).
// PurchaseOrderDetails.budgetCheckStatus: null = no budget gating (requests created before the
// Budget Check existed), otherwise one of BUDGET_CHECK.
const BUDGET_CHECK = {
  NOT_REQUESTED: "NOT_REQUESTED",
  REQUESTED: "REQUESTED",
  COMPLETED: "COMPLETED"
};

// The details entity that holds budgetCheckStatus, per request type.
// Purchase Orders only: the Service Entry Sheet flow has no Budget Check.
const BUDGET_CHECK_DETAILS = {
  PURCHASE_ORDER: "PurchaseOrderDetails"
};
const budgetDetailsEntity = (requestTypeCode) => BUDGET_CHECK_DETAILS[requestTypeCode] || null;

// "4500000001; 4500000002" -> ["4500000001", "4500000002"]: trimmed, blanks and repeats dropped.
const poNumberList = (value) => [...new Set(String(value || "").split(";").map((n) => n.trim()).filter(Boolean))];

// Purchase Order step 4: the approver records the PO Released Date; no SLA of its own.
const isPoApprovalCompletionStep = (stepName) => /po\s+approval\s+completion/i.test(stepName || "");

// Existing Capex-FM / Opex configs still call the step "Budget Confirmation".
const isBudgetCheckStep = (stepName) => /budget\s+(check|confirmation)/i.test(stepName || "");
const isS4ValidationStep = (stepName) => /s\s*\/?\s*4\s+data\s+validation/i.test(stepName || "");

// The S/4 Data Validation task may not be approved while a requested Budget Check is running.
const approvalBlockedByBudgetCheck = (status) => status === BUDGET_CHECK.REQUESTED;

// ---- Service Entry Sheet dates (Single Line Items) ----
// Service Entry Sheet, Single Line Items: a tax based transaction needs an Invoice Date and a
// Service Obtained Date at most 30 days apart (either order). Mirrors FormDefinitions.sesDateProblem.
const MAX_DAYS_APART = 30;

const calendarDay = (value) => Date.parse(`${String(value).slice(0, 10)}T00:00:00Z`);

const TAX_FIELDS = ["taxTransactionType", "invoiceDate", "serviceObtainedDate"];

// Multiple Line Items is the mode with Header Creation rows.
const isMultipleLine = (details) => Array.isArray(details?.headers) && details.headers.length > 0;

// The reason a Service Entry Sheet's details cannot be accepted, or null. Single Line only.
function sesDateProblem(details) {
  const source = details || {};
  if (isMultipleLine(source) || source.taxTransactionType !== "TAX_BASED") {
    return null;
  }
  if (!source.invoiceDate || !source.serviceObtainedDate) {
    return "Enter the Invoice Date and the Service Obtained Date for a tax based transaction";
  }
  const invoice = calendarDay(source.invoiceDate);
  const service = calendarDay(source.serviceObtainedDate);
  if (Number.isNaN(invoice) || Number.isNaN(service)) {
    return "Enter valid Invoice and Service Obtained Dates";
  }
  return Math.abs(invoice - service) / 86400000 > MAX_DAYS_APART
    ? "The difference between the Invoice Date and the Service Obtained Date is more than 30 days, so you cannot proceed with the creation of this request."
    : null;
}

// Multiple Line Items has no Type of Transaction: values typed before switching from Single Line
// are cleared rather than stored.
function withoutMultipleLineTaxFields(details) {
  if (!isMultipleLine(details)) {
    return details;
  }
  const cleared = { ...details };
  TAX_FIELDS.forEach((name) => { cleared[name] = null; });
  return cleared;
}

// ---- Purchase Order: the Procurement Category is the Process Variant ----
// PO_OPEX -> OPEX, PO_CAPEX_FM -> CAPEX_FM, PO_CAPEX_IM -> CAPEX_IM (mirrors
// FormDefinitions.procurementCategoryForVariant), so a PO's variant and category never disagree.
const procurementCategoryForVariant = (variantCode) => (/^PO_/.test(variantCode || "") ? variantCode.slice(3) : null);

function withVariantProcurementCategory(details, variantCode) {
  const category = procurementCategoryForVariant(variantCode);
  return category ? { ...details, procurementCategory_code: category } : details;
}

// ---- Recipients of the Completed e-mail ----
// Who gets the "Completed" e-mail of a request: the requester, plus the addresses named on the
// request (Outline Contract: User to be notified; Purchase Order: Approved PO Recipient Email;
// Service Entry Sheet: SES Recipient Email, on the form or on each Header Creation row).
// Lists may be separated by commas, semicolons or spaces; each address is e-mailed once.

const addressesIn = (value) => String(value || "")
  .split(/[\s,;]+/)
  .map((address) => address.trim())
  .filter((address) => address.includes("@"));

function completionRecipients(requesterEmail, namedAddresses) {
  const seen = new Set();
  const recipients = [];
  [requesterEmail, ...(namedAddresses || [])].flatMap(addressesIn).forEach((address) => {
    const key = address.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      recipients.push(address);
    }
  });
  return recipients;
}

// ---- Request versions: which filled values an update changed ----
// Which values an update changed among those that already had one. An approver filling in blank
// approval data (codes, PO / SES Numbers) changes none; editing what was there does.

const isBlankValue = (value) => value === undefined || value === null || value === "";

// { "vendorName": "ACME", "items.1.quantity": 2, "headers.2.sesNumber": "100" } from a snapshot.
function flattenSnapshot(snapshot) {
  const values = {};
  const source = snapshot || {};
  Object.keys(source).forEach((key) => {
    if (key === "items" || key === "headers") {
      (source[key] || []).forEach((row, index) => {
        Object.keys(row || {}).forEach((field) => {
          values[`${key}.${row.itemNo ?? index + 1}.${field}`] = row[field];
        });
      });
    } else {
      values[key] = source[key];
    }
  });
  return values;
}

// The keys whose earlier non-blank value is now different (or gone).
function changedFilledValues(previous, next) {
  const before = flattenSnapshot(previous);
  const after = flattenSnapshot(next);
  return Object.keys(before).filter((key) => !isBlankValue(before[key]) && String(after[key] ?? "") !== String(before[key]));
}

// ---- Texts for the BPA e-mail processes ----
// Texts for the BPA e-mail processes (Request Status Notification, Task Assignment Notification),
// which print the values they are given as they are.

// "18 Oct 2026, 09:15 PM" in the given time zone (Sri Lanka by default), or "" without a date.
function formatAssignedDate(value, timeZone = "Asia/Colombo") {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute} ${String(parts.dayPeriod || "").toUpperCase()}`;
}

// "Validate purchase order (Step 3 - S/4 Data Validation)": the task and the step it sits at.
function taskAtStep(taskName, stepNo, stepName) {
  const step = [stepNo ? `Step ${stepNo}` : "", stepName || ""].filter(Boolean).join(" - ");
  return step ? `${taskName || stepName || "Task"} (${step})` : (taskName || "");
}

// The Status line of a task reopened by a send-back:
// "Sent back by Ravi Kumar at Step 3 - S/4 Data Validation: Attach the quotation".
function sentBackStatus({ sentBackBy, fromStepNo, fromStepName, remarks } = {}) {
  const step = [fromStepNo ? `Step ${fromStepNo}` : "", fromStepName || ""].filter(Boolean).join(" - ");
  const text = `Sent back${sentBackBy ? ` by ${sentBackBy}` : ""}${step ? ` at ${step}` : ""}`;
  return remarks ? `${text}: ${remarks}` : text;
}

// The approval data of a completed request for the e-mail's "Approval Data:" line: [[label, value],
// ...] -> "<br>Service Code: SC-100<br>GL Account: 400100", one value per line under the label.
// Blank values are left out; "" when there are none.
function approvalDataText(entries) {
  const lines = (entries || [])
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
    .map(([label, value]) => `${label}: ${String(value).trim()}`);
  return lines.length ? `<br>${lines.join("<br>")}` : "";
}

const REQUEST_STATUS = {
  DRAFT: "DRAFT",
  UPLOAD_PENDING: "UPLOAD_PENDING",
  SUBMITTED: "SUBMITTED",
  IN_PROGRESS: "IN_PROGRESS",
  SENT_BACK: "SENT_BACK",
  COMPLETED: "COMPLETED",
  REJECTED: "REJECTED"
};

const TASK_STATUS = {
  OPEN: "OPEN",
  // A Purchase Order's S/4 Data Validation task while the Budget Check it requested is open.
  IN_PROGRESS: "IN_PROGRESS",
  APPROVED: "APPROVED",
  SENT_BACK: "SENT_BACK",
  REJECTED: "REJECTED"
};

const REPORTING_REQUEST_TYPES = [
  "MATERIAL_CODE",
  "SERVICE_CODE",
  "EQUIPMENT_CODE",
  "PROJECT_CODE",
  "MATERIAL_RESERVATION",
  "OUTLINE_CONTRACT"
];

const REPORTING_TYPE_NAMES = {
  MATERIAL_CODE: "Material Code",
  SERVICE_CODE: "Service Code",
  EQUIPMENT_CODE: "Equipment Code",
  PROJECT_CODE: "Project Code",
  MATERIAL_RESERVATION: "Material Reservation",
  OUTLINE_CONTRACT: "Outline Contract"
};

const reportNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const reportDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const reportDateKey = (value) => {
  const date = reportDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
};

const reportMonthKey = (value) => {
  const date = reportDate(value);
  return date ? date.toISOString().slice(0, 7) : null;
};

const reportInRange = (value, start, end) => {
  const date = reportDate(value);
  return Boolean(date && date >= start && date <= end);
};

const reportPercent = (part, whole) => whole ? Math.round((part / whole) * 1000) / 10 : 0;

const reportSlaDays = (requestType, poType) => {
  if (requestType === "PURCHASE_ORDER") {
    if (poType === "GENERAL" || poType === "CENTRALIZED") return 2;
    return 5;
  }
  if (requestType === "SERVICE_ENTRY_SHEET") return 5;
  return 5;
};

const reportSlaState = (request, detail, requestType) => {
  const completed = request.status_code === REQUEST_STATUS.COMPLETED;
  const rejected = request.status_code === REQUEST_STATUS.REJECTED;
  const finishedAt = reportDate(request.completedAt) || (rejected ? reportDate(request.modifiedAt) : null);
  const startedAt = reportDate(request.submittedAt) || reportDate(request.createdAt);
  const poType = detail?.purchaseOrderType_code || "";
  const targetDays = reportSlaDays(requestType, poType);
  const configuredDue = reportDate(request.slaDueAt);
  const calculatedDue = startedAt ? new Date(startedAt.getTime() + targetDays * DAY_MS) : null;
  const due = configuredDue || calculatedDue;
  const comparison = finishedAt || new Date();
  const breached = Boolean(due && comparison > due);
  return {
    targetDays,
    dueAt: due?.toISOString() || null,
    breached,
    within: !breached,
    durationDays: startedAt ? Math.max(0, Math.round(((finishedAt || new Date()) - startedAt) / DAY_MS * 10) / 10) : 0,
    state: completed ? "COMPLETED" : rejected ? "REJECTED" : "IN_PROGRESS"
  };
};

const reportCount = (rows, predicate) => rows.reduce((count, row) => count + (predicate(row) ? 1 : 0), 0);

const reportSortedRows = (map, valueKey = "value") => Array.from(map.entries())
  .map(([key, value]) => ({ key, [valueKey]: Math.round(value * 100) / 100 }))
  .sort((a, b) => b[valueKey] - a[valueKey]);

// SLA days are calendar days; due dates are shown and compared in Sri Lankan time.
const SLA_TIME_ZONE = process.env.SLA_TIME_ZONE || "Asia/Colombo";
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const DETAIL_ENTITY_BY_REQUEST_TYPE = {
  MATERIAL_CODE: "MaterialCodeDetails",
  SERVICE_CODE: "ServiceCodeDetails",
  EQUIPMENT_CODE: "EquipmentCodeDetails",
  PROJECT_CODE: "ProjectCodeDetails",
  MATERIAL_RESERVATION: "MaterialReservationDetails",
  OUTLINE_CONTRACT: "OutlineContractDetails",
  PURCHASE_ORDER: "PurchaseOrderDetails",
  SERVICE_ENTRY_SHEET: "ServiceEntrySheetDetails"
};

// Status values the BPA "Request Status Notification Process" script builds an e-mail for; any
// other value produces an e-mail with an empty subject and body.
const REQUEST_OUTCOME = { COMPLETED: "Completed", REJECTED: "Rejected", SENT_BACK: "Sendback" };

const ITEMS_ENTITY_BY_REQUEST_TYPE = {
  MATERIAL_CODE: "MaterialCodeItems",
  SERVICE_CODE: "ServiceCodeItems",
  EQUIPMENT_CODE: "EquipmentCodeItems",
  PROJECT_CODE: "ProjectCodeItems",
  MATERIAL_RESERVATION: "MaterialReservationItems",
  OUTLINE_CONTRACT: "OutlineContractItems",
  PURCHASE_ORDER: "PurchaseOrderItems",
  SERVICE_ENTRY_SHEET: "ServiceEntrySheetItems"
};

// Values approvers record on the details row, listed in the Completed e-mail (label per field).
const APPROVAL_DATA_FIELDS = {
  SERVICE_CODE: [["glAccount", "GL Account"], ["valuationClass_code", "Valuation Class"], ["serviceCode", "Service Code"]],
  MATERIAL_CODE: [["glAccount", "GL Account"], ["valuationClass_code", "Valuation Class"], ["materialCode", "Material Code"]],
  EQUIPMENT_CODE: [["equipmentCode", "Equipment Code"]],
  PROJECT_CODE: [["projectCode", "Project Code"], ["functionLocation", "Function Location"], ["activityNumber", "Activity"]],
  PURCHASE_ORDER: [["purchaseOrderNumber", "PO Number"], ["poReleasedDate", "PO Released Date"]],
  SERVICE_ENTRY_SHEET: [["sesNumber", "SES Number"]]
};

// "CA-POC-26-000001-T03": a request's 3rd task.
function formatTaskReference(requestReference, taskNumber) {
  return `${requestReference || "TASK"}-T${String(taskNumber).padStart(2, "0")}`;
}

// Columns left out of version snapshots: keys and bookkeeping, not request data (the Budget
// Check status is workflow state).
const VERSION_TECHNICAL_FIELDS = new Set(["ID", "request_ID", "details_ID", "createdAt", "createdBy", "modifiedAt", "modifiedBy", "budgetCheckStatus"]);

// Second row table carried in details.headers (Outline Contract - New Contract).
const HEADERS_ENTITY_BY_REQUEST_TYPE = {
  OUTLINE_CONTRACT: "OutlineContractHeaders",
  SERVICE_ENTRY_SHEET: "ServiceEntrySheetHeaders"
};

// Contract Modification change tables: details.<key> rows are stored in
// OutlineContractChangeItems with the matching changeType.
const CHANGE_ITEM_TYPES = {
  priceChanges: "PRICE_CHANGE",
  serviceAdditions: "SERVICE_ADDITION",
  materialAdditions: "MATERIAL_ADDITION"
};

// CAP can expose LargeBinary values as a Node.js Readable stream (especially
// with SQLite/HANA attachment storage).  Normalise every supported shape to a
// Buffer before sending the attachment to Flowmate as base64.
const readAttachmentContent = async (content) => {
  if (content === null || content === undefined) {
    return Buffer.alloc(0);
  }
  if (Buffer.isBuffer(content)) {
    return content;
  }
  if (content instanceof Uint8Array) {
    return Buffer.from(content);
  }
  if (content instanceof ArrayBuffer) {
    return Buffer.from(content);
  }
  if (typeof content === "string") {
    return Buffer.from(content);
  }
  if (typeof content[Symbol.asyncIterator] === "function") {
    const chunks = [];
    for await (const chunk of content) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  if (typeof content.getReader === "function") {
    const reader = content.getReader();
    const chunks = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock?.();
    }
    return Buffer.concat(chunks);
  }
  return Buffer.from(content);
};

// Purchase Order Lifecycle dashboard ("PURCHASE ORDER LIFECYCLE DB" in docs/ARIBA Reports.xlsx).
// Pure: the service reads the rows and this module turns them into the dashboard document, so
// every figure can be checked without a database.
//
// Stages follow the workflow: a request is Received when submitted, Created once the S/4 Data
// Validation step recorded its PO number, Approved when every step is done (COMPLETED), Rejected
// when terminated, and Pending while still open. A stage is within SLA when the calendar days
// from submission to that stage are no more than the configured step SLA days up to it.

const OPEN_STATUSES = new Set(["SUBMITTED", "IN_PROGRESS", "SENT_BACK"]);
const DEFAULT_SLA_DAYS = 5;
const NOT_SPECIFIED = "Not specified";

const lifecycleDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const round1 = (value) => Math.round(value * 10) / 10;
const lifecyclePercent = (part, whole) => (whole ? round1((part / whole) * 100) : null);
const averageOf = (values) => (values.length ? round1(values.reduce((sum, value) => sum + value, 0) / values.length) : null);
const daysBetween = (from, to) => Math.max(0, (to - from) / DAY_MS);

// "YYYY-MM" of a moment as seen in the reporting time zone.
const monthKey = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(date);
  return `${parts.find((part) => part.type === "year").value}-${parts.find((part) => part.type === "month").value}`;
};

// "YYYY-MM-DD" of a moment as seen in the reporting time zone.
const dayKey = (date, timeZone) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

// "YYYY-MM-DD" moved by a number of calendar days.
const shiftDay = (key, delta) => new Date(Date.parse(`${key}T00:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10);

// The reporting period: the given start and end days, or the whole of a "YYYY-MM" month.
const periodOf = (periodStart, periodEnd, month) => {
  const valid = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "") && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
  if (valid(periodStart) && valid(periodEnd) && periodStart <= periodEnd) {
    return { start: periodStart, end: periodEnd };
  }
  return { start: `${month}-01`, end: shiftDay(`${shiftMonth(month, 1)}-01`, -1) };
};

const shiftMonth = (key, delta) => {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

// Late days -> the sheet's fail status: Critical from 10 days, Warning from 5, else Monitor.
const failStatus = (days) => (days >= 10 ? "CRITICAL" : days >= 5 ? "WARNING" : "MONITOR");
// SLA % -> the sheet's group status: green from 90 %, amber from 80 %, else red.
const slaStatus = (pct) => (pct === null ? "NONE" : pct >= 90 ? "GOOD" : pct >= 80 ? "WATCH" : "POOR");

// One request's lifecycle: stage moments, SLA targets and how late it is.
function evaluatePoLifecycle(request, detail, steps, configuredSla, now) {
  const submittedAt = lifecycleDate(request.submittedAt) || lifecycleDate(request.createdAt);
  const ordered = steps.slice().sort((left, right) => left.stepNo - right.stepNo);
  const slaOf = (step) => {
    const days = Number(step.slaDays);
    if (Number.isFinite(days) && days > 0) return days;
    const configured = Number(configuredSla.get(`${request.requestVariant_code}|${step.stepNo}`));
    return Number.isFinite(configured) && configured > 0 ? configured : 0;
  };
  let totalTarget = ordered.reduce((sum, step) => sum + slaOf(step), 0);
  if (!totalTarget) {
    const due = lifecycleDate(request.slaDueAt);
    totalTarget = due && submittedAt ? Math.max(1, Math.round((due - submittedAt) / DAY_MS)) : DEFAULT_SLA_DAYS;
  }
  const s4Index = ordered.findIndex((step) => isS4ValidationStep(step.stepName));
  const createdTarget = s4Index >= 0
    ? ordered.slice(0, s4Index + 1).reduce((sum, step) => sum + slaOf(step), 0) || totalTarget
    : totalTarget;

  const status = request.status_code;
  const closedAt = lifecycleDate(request.completedAt) || lifecycleDate(request.modifiedAt);
  const rejectedAt = status === "REJECTED" ? closedAt : null;
  const approvedAt = status === "COMPLETED" ? lifecycleDate(request.completedAt) || closedAt : null;
  const hasPoNumber = Boolean(String(detail.purchaseOrderNumber || "").trim());
  const s4CompletedAt = s4Index >= 0 ? lifecycleDate(ordered[s4Index].completedAt) : null;
  const poCreatedAt = hasPoNumber ? s4CompletedAt || approvedAt : null;
  const endAt = approvedAt || rejectedAt || now;
  const elapsed = submittedAt ? daysBetween(submittedAt, endAt) : 0;

  return {
    request,
    detail,
    steps: ordered,
    slaOf,
    submittedAt,
    totalTarget,
    createdTarget,
    elapsed,
    breached: elapsed > totalTarget,
    rejected: status === "REJECTED",
    approved: status === "COMPLETED",
    pending: OPEN_STATUSES.has(status),
    created: Boolean(poCreatedAt),
    createdDays: poCreatedAt && submittedAt ? daysBetween(submittedAt, poCreatedAt) : null,
    rejectedDays: rejectedAt && submittedAt ? daysBetween(submittedAt, rejectedAt) : null,
    approvedDays: approvedAt && submittedAt ? daysBetween(submittedAt, approvedAt) : null
  };
}

// The step that made a breached request late: the first one finished (or still open) after
// its own due time. Each step's due time is its start plus its SLA days.
function failReason(entry, now) {
  for (const step of entry.steps) {
    const startedAt = lifecycleDate(step.startedAt);
    const completedAt = lifecycleDate(step.completedAt);
    if (!startedAt && !completedAt) continue;
    const due = lifecycleDate(step.slaDueAt) || (startedAt ? new Date(startedAt.getTime() + entry.slaOf(step) * DAY_MS) : null);
    if (!due) continue;
    if (completedAt && completedAt > due) return `Delayed at ${step.stepName}`;
    if (!completedAt && entry.pending && now > due) return `Open at ${step.stepName} past SLA`;
  }
  if (entry.rejected) return "Terminated after the SLA";
  return entry.pending ? "Open past the overall SLA" : "Completed after the overall SLA";
}

// SLA figures for a set of stage measurements: { days, target } pairs.
function slaFigures(measurements) {
  return {
    count: measurements.length,
    targetDays: averageOf(measurements.map((entry) => entry.target)),
    achievedDays: averageOf(measurements.map((entry) => entry.days)),
    slaPercent: lifecyclePercent(measurements.filter((entry) => entry.days <= entry.target).length, measurements.length)
  };
}

const stageMeasurements = (entries) => ({
  received: entries.map((entry) => ({ days: entry.elapsed, target: entry.totalTarget })),
  rejected: entries.filter((entry) => entry.rejected && entry.rejectedDays !== null)
    .map((entry) => ({ days: entry.rejectedDays, target: entry.totalTarget })),
  created: entries.filter((entry) => entry.created && entry.createdDays !== null)
    .map((entry) => ({ days: entry.createdDays, target: entry.createdTarget })),
  approved: entries.filter((entry) => entry.approved && entry.approvedDays !== null)
    .map((entry) => ({ days: entry.approvedDays, target: entry.totalTarget })),
  pending: entries.filter((entry) => entry.pending)
    .map((entry) => ({ days: entry.elapsed, target: entry.totalTarget }))
});

function kpisOf(entries) {
  const received = entries.length;
  return {
    totalRequests: received,
    rejected: entries.filter((entry) => entry.rejected).length,
    created: entries.filter((entry) => entry.created).length,
    approved: entries.filter((entry) => entry.approved).length,
    pendingApproval: entries.filter((entry) => entry.pending).length,
    slaCompliancePercent: lifecyclePercent(entries.filter((entry) => !entry.breached).length, received)
  };
}

// One row per value of a dimension (purchasing group, company code, ...), largest first.
function poLifecycleBreakdown(entries, labelOf) {
  const groups = new Map();
  entries.forEach((entry) => {
    const label = labelOf(entry) || NOT_SPECIFIED;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(entry);
  });
  return Array.from(groups.entries()).map(([label, rows]) => {
    const figures = slaFigures(rows.map((entry) => ({ days: entry.elapsed, target: entry.totalTarget })));
    return {
      label,
      volume: rows.length,
      sharePercent: lifecyclePercent(rows.length, entries.length),
      created: rows.filter((entry) => entry.created).length,
      approved: rows.filter((entry) => entry.approved).length,
      rejected: rows.filter((entry) => entry.rejected).length,
      pending: rows.filter((entry) => entry.pending).length,
      targetDays: figures.targetDays,
      achievedDays: figures.achievedDays,
      slaPercent: figures.slaPercent,
      status: slaStatus(figures.slaPercent)
    };
  }).sort((left, right) => right.volume - left.volume || left.label.localeCompare(right.label));
}

const poLifecycleText = (value) => String(value ?? "").trim();
const purchasingGroupOf = (entry) => poLifecycleText(entry.detail.purchasingGroup);
const companyCodeOf = (entry) => poLifecycleText(entry.detail.companyCode);
const contractOf = (entry) => (entry.detail.contractBased ? "Contracted" : "Non-contracted");
const divisionOf = (entry) => poLifecycleText(entry.detail.division);

const missingRemark = (entries, valueOf, field) => {
  const missing = entries.filter((entry) => !valueOf(entry)).length;
  return missing ? `${missing} of ${entries.length} POs have no ${field}` : "";
};

/**
 * @param {object} input
 * @param {object[]} input.requests  PO requests (CARequests rows)
 * @param {object[]} input.details   PurchaseOrderDetails rows (request_ID, ...)
 * @param {object[]} input.steps     RequestStepInstances rows (request_ID, stepNo, ...)
 * @param {object[]} [input.stepConfigs] WorkflowStepConfigs rows (fallback SLA days)
 * @param {string} [input.periodStart] first day of the reporting period, "YYYY-MM-DD"
 * @param {string} [input.periodEnd]   last day of the reporting period, "YYYY-MM-DD"
 * @param {string} [input.month]       "YYYY-MM": the whole month, when no period is given
 * @param {string} [input.poType]    PO type code, or "ALL"
 * @param {Date}   [input.now]
 * @param {string} [input.timeZone]
 */
function buildPoLifecycle({ requests, details, steps, stepConfigs = [], periodStart, periodEnd, month, poType = "ALL", now = new Date(), timeZone = "Asia/Colombo" }) {
  const period = periodOf(periodStart, periodEnd, month || monthKey(now, timeZone));
  // The period before has the same number of days and ends the day before this one starts.
  const length = Math.round((Date.parse(`${period.end}T00:00:00Z`) - Date.parse(`${period.start}T00:00:00Z`)) / DAY_MS) + 1;
  const previousPeriod = { start: shiftDay(period.start, -length), end: shiftDay(period.start, -1) };
  // The trend runs over the twelve months up to the one the period ends in.
  const trendMonth = period.end.slice(0, 7);
  const detailByRequest = new Map(details.map((row) => [row.request_ID, row]));
  const stepsByRequest = new Map();
  steps.forEach((row) => {
    if (!stepsByRequest.has(row.request_ID)) stepsByRequest.set(row.request_ID, []);
    stepsByRequest.get(row.request_ID).push(row);
  });
  const configuredSla = new Map(stepConfigs.map((row) => [`${row.requestVariant_code}|${row.stepNo}`, row.slaDays]));
  const typeFilter = String(poType || "ALL").toUpperCase();

  const entries = requests
    .filter((request) => request.requestType_code === "PURCHASE_ORDER" && (OPEN_STATUSES.has(request.status_code)
      || request.status_code === "COMPLETED" || request.status_code === "REJECTED"))
    .map((request) => evaluatePoLifecycle(request, detailByRequest.get(request.ID) || {}, stepsByRequest.get(request.ID) || [], configuredSla, now))
    .filter((entry) => entry.submittedAt
      && (typeFilter === "ALL" || entry.detail.purchaseOrderType_code === typeFilter));
  const byMonth = new Map();
  const current = [];
  const previous = [];
  entries.forEach((entry) => {
    const key = monthKey(entry.submittedAt, timeZone);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(entry);
    const day = dayKey(entry.submittedAt, timeZone);
    if (day >= period.start && day <= period.end) current.push(entry);
    else if (day >= previousPeriod.start && day <= previousPeriod.end) previous.push(entry);
  });

  const stages = stageMeasurements(current);
  const allMeasurements = [].concat(stages.rejected, stages.created, stages.approved, stages.pending);
  const metric = (key, label, measurements) => Object.assign({ key, label }, slaFigures(measurements));

  const pgRows = poLifecycleBreakdown(current, purchasingGroupOf);
  const total = slaFigures(stages.received);
  const views = [
    { key: "PG_VOLUME", label: "Purchasing Group wise PO volume", volume: current.length, slaPercent: total.slaPercent,
      remarks: missingRemark(current, purchasingGroupOf, "purchasing group"), rows: pgRows, layout: "VOLUME" },
    { key: "COMPANY_CODE", label: "Company code wise", volume: current.length, slaPercent: total.slaPercent,
      remarks: missingRemark(current, companyCodeOf, "company code"), rows: poLifecycleBreakdown(current, companyCodeOf), layout: "VOLUME" },
    { key: "CONTRACT", label: "Contracted / non contracted", volume: current.length, slaPercent: total.slaPercent,
      remarks: "", rows: poLifecycleBreakdown(current, contractOf), layout: "VOLUME" },
    { key: "PG_ALL", label: "All PG group wise", volume: current.length, slaPercent: total.slaPercent,
      remarks: `${pgRows.length} purchasing group${pgRows.length === 1 ? "" : "s"}`, rows: pgRows, layout: "STAGES" },
    { key: "PG_SLA", label: "SLA PG group wise", volume: current.length, slaPercent: total.slaPercent,
      remarks: `${pgRows.filter((row) => row.status === "POOR").length} below 80 % SLA`, rows: pgRows, layout: "SLA" },
    { key: "ALL_SLA", label: "All include SLA", volume: current.length, slaPercent: total.slaPercent,
      remarks: "Included in the period's SLA", rows: [], layout: "NONE" }
  ].map((view) => Object.assign(view, { status: slaStatus(view.slaPercent) }));

  const slaFailures = current.filter((entry) => entry.breached).map((entry) => {
    const failDays = round1(entry.elapsed - entry.totalTarget);
    return {
      requestId: entry.request.ID,
      reference: entry.request.referenceNumber || "",
      poNumber: poLifecycleText(entry.detail.purchaseOrderNumber) || entry.request.referenceNumber || "",
      hasPoNumber: Boolean(poLifecycleText(entry.detail.purchaseOrderNumber)),
      vendorId: entry.detail.vendor_ID || null,
      supplier: poLifecycleText(entry.detail.vendorCode),
      reason: failReason(entry, now),
      failDays,
      failStatus: failStatus(failDays),
      targetDays: entry.totalTarget,
      elapsedDays: round1(entry.elapsed)
    };
  }).sort((left, right) => right.failDays - left.failDays);

  const trend = [];
  for (let offset = -11; offset <= 0; offset++) {
    const key = shiftMonth(trendMonth, offset);
    const rows = byMonth.get(key) || [];
    const kpis = kpisOf(rows);
    trend.push({ month: key, received: kpis.totalRequests, created: kpis.created, approved: kpis.approved,
      rejected: kpis.rejected, pending: kpis.pendingApproval, slaPercent: kpis.slaCompliancePercent });
  }

  // The period's requests behind the KPI tiles, with the stage each belongs to.
  const periodRequests = current.map((entry) => {
    const openStep = entry.pending ? entry.steps.find((step) => !step.completedAt) : null;
    return {
      requestId: entry.request.ID,
      reference: entry.request.referenceNumber || "",
      title: entry.request.title || "",
      status: entry.request.status_code,
      poNumber: poLifecycleText(entry.detail.purchaseOrderNumber),
      vendorId: entry.detail.vendor_ID || null,
      supplier: poLifecycleText(entry.detail.vendorCode),
      submittedAt: entry.submittedAt.toISOString(),
      currentStep: openStep ? openStep.stepName : "",
      elapsedDays: round1(entry.elapsed),
      targetDays: entry.totalTarget,
      breached: entry.breached,
      rejected: entry.rejected,
      created: entry.created,
      approved: entry.approved,
      pending: entry.pending
    };
  }).sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));

  return {
    period,
    poType: typeFilter,
    generatedAt: now.toISOString(),
    kpis: kpisOf(current),
    previousPeriod: Object.assign({}, previousPeriod, kpisOf(previous)),
    monthlySla: [
      metric("RECEIVED", "Total PO requests received", stages.received),
      metric("REJECTED", "Total PO requests rejected", stages.rejected),
      metric("CREATED", "Total PO created", stages.created),
      metric("APPROVED", "Total PO approved", stages.approved),
      metric("PENDING", "Total PO pending approval", stages.pending),
      metric("ALL", "All include SLA", allMeasurements)
    ].map((row) => Object.assign(row, { status: slaStatus(row.slaPercent) })),
    views,
    slaFailures,
    divisionBreakdown: poLifecycleBreakdown(current, divisionOf),
    trend,
    requests: periodRequests
  };
}

// "YYYY-MM-DD" one year earlier (29 Feb -> 28 Feb).
const shiftYear = (key) => {
  const [year, month, day] = key.split("-").map(Number);
  const last = new Date(Date.UTC(year - 1, month, 0)).getUTCDate();
  return `${year - 1}-${String(month).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
};
const SPEND_TOP = 10;
const SPEND_RECENT = 20;

/**
 * Spend Analysis dashboard: the approved Purchase Orders of a period, compared with the same
 * period one year earlier. Only LKR POs count in the spend figures (no currency conversion);
 * the recent transactions list every currency.
 * @param {object} input
 * @param {object[]} input.requests  approved PO requests (CARequests rows with completedAt)
 * @param {object[]} input.details   PurchaseOrderDetails rows (request_ID, vendor_ID, currency_code, ...)
 * @param {Map<string,string>} [input.vendorNames] vendor ID -> name
 * @param {number} [input.inactiveSuppliers] inactive vendors in the master
 * @param {string} [input.periodStart] "YYYY-MM-DD"
 * @param {string} [input.periodEnd]   "YYYY-MM-DD"
 * @param {string} [input.poType]      PO type code, or "ALL"
 */
function buildSpendAnalysis({ requests, details, vendorNames = new Map(), inactiveSuppliers = 0, inactiveVendors = [], periodStart, periodEnd, poType = "ALL", now = new Date(), timeZone = "Asia/Colombo" }) {
  const period = periodOf(periodStart, periodEnd, monthKey(now, timeZone));
  const previousPeriod = { start: shiftYear(period.start), end: shiftYear(period.end) };
  const typeFilter = String(poType || "ALL").toUpperCase();
  const detailByRequest = new Map(details.map((row) => [row.request_ID, row]));
  const entries = requests
    .filter((request) => request.requestType_code === "PURCHASE_ORDER" && request.status_code === "COMPLETED" && request.completedAt)
    .map((request) => {
      const detail = detailByRequest.get(request.ID) || {};
      const vendorKey = detail.vendor_ID || poLifecycleText(detail.vendorCode);
      const amount = Number(detail.poValueWithTaxes ?? detail.totalValue ?? 0) || 0;
      return {
        request,
        detail,
        day: dayKey(new Date(request.completedAt), timeZone),
        vendorKey,
        supplier: vendorNames.get(detail.vendor_ID) || poLifecycleText(detail.vendorCode) || "Not set",
        amount,
        currency: poLifecycleText(detail.currency_code),
        lkr: poLifecycleText(detail.currency_code).toUpperCase() === "LKR",
        expenditure: String(detail.procurementCategory_code || "").toUpperCase().startsWith("CAPEX") ? "Capex" : "Opex",
        division: poLifecycleText(detail.division) || "Not set"
      };
    })
    .filter((entry) => typeFilter === "ALL" || entry.detail.purchaseOrderType_code === typeFilter);
  const current = entries.filter((entry) => entry.day >= period.start && entry.day <= period.end);
  const previous = entries.filter((entry) => entry.day >= previousPeriod.start && entry.day <= previousPeriod.end);
  const round = (value) => Math.round(value * 100) / 100;
  const share = (part, whole) => (whole ? round((part / whole) * 100) : 0);
  // LKR spend per key, largest first.
  const spendBy = (rows, keyOf) => {
    const totals = new Map();
    rows.filter((entry) => entry.lkr).forEach((entry) => {
      const key = keyOf(entry);
      const total = totals.get(key) || { key, label: key, amount: 0 };
      total.amount += entry.amount;
      totals.set(key, total);
    });
    return Array.from(totals.values()).sort((left, right) => right.amount - left.amount || left.label.localeCompare(right.label));
  };
  const totalOf = (rows) => rows.filter((entry) => entry.lkr).reduce((sum, entry) => sum + entry.amount, 0);
  const total = totalOf(current);
  const previousTotal = totalOf(previous);
  const supplierLabel = new Map(current.concat(previous).map((entry) => [entry.vendorKey || entry.supplier, entry.supplier]));
  const suppliers = spendBy(current, (entry) => entry.vendorKey || entry.supplier)
    .map((row) => Object.assign(row, { label: supplierLabel.get(row.key) || row.key }));
  const previousBySupplier = new Map(spendBy(previous, (entry) => entry.vendorKey || entry.supplier).map((row) => [row.key, row.amount]));
  const top = suppliers.slice(0, SPEND_TOP);
  const topTotal = top.reduce((sum, row) => sum + row.amount, 0);
  const variance = (now, before) => (before ? round(((now - before) / before) * 100) : null);
  const breakdown = (rows) => rows.map((row) => ({ label: row.label, amount: round(row.amount), sharePercent: share(row.amount, total) }));
  // Every PO of the period (all currencies), newest first: the drill-downs behind the KPI tiles.
  const purchaseOrders = current.slice()
    .sort((left, right) => String(right.request.completedAt).localeCompare(String(left.request.completedAt)))
    .map((entry) => ({
      requestId: entry.request.ID,
      reference: entry.request.referenceNumber || "",
      poNumber: poNumberList(entry.detail.purchaseOrderNumber)[0] || entry.request.referenceNumber || "",
      supplierKey: entry.vendorKey || entry.supplier,
      vendorId: entry.detail.vendor_ID || null,
      supplier: entry.supplier,
      date: entry.day,
      amount: round(entry.amount),
      currency: entry.currency,
      amountLkr: entry.lkr ? round(entry.amount) : null,
      division: entry.division,
      expenditure: entry.expenditure
    }));
  // One row per supplier with LKR spend this period or in the same period last year.
  const topKeys = new Set(top.map((row) => row.key));
  const poCounts = new Map();
  current.forEach((entry) => {
    const key = entry.vendorKey || entry.supplier;
    poCounts.set(key, (poCounts.get(key) || 0) + 1);
  });
  const currentBySupplier = new Map(suppliers.map((row, index) => [row.key, { amount: row.amount, rank: index + 1 }]));
  const supplierRows = [...new Set(suppliers.map((row) => row.key).concat([...previousBySupplier.keys()]))].map((key) => {
    const now = currentBySupplier.get(key);
    const amount = now ? now.amount : 0;
    const before = previousBySupplier.get(key) || 0;
    return {
      supplierKey: key, supplier: supplierLabel.get(key) || key, rank: now ? now.rank : null,
      current: round(amount), previous: round(before), poCount: poCounts.get(key) || 0, sharePercent: share(amount, total),
      variancePercent: variance(amount, before), trend: amount >= before ? "UP" : "DOWN", isTop10: topKeys.has(key)
    };
  }).sort((left, right) => (left.rank || Infinity) - (right.rank || Infinity) || right.previous - left.previous);

  return {
    period,
    previousPeriod,
    poType: typeFilter,
    kpis: {
      totalSpend: round(total),
      previousSpend: round(previousTotal),
      activeSuppliers: new Set(current.map((entry) => entry.vendorKey || entry.supplier)).size,
      topSupplierSharePercent: share(topTotal, total),
      yoyVariancePercent: variance(total, previousTotal),
      inactiveSuppliers: Number(inactiveSuppliers) || 0,
      poCount: current.length,
      currentYear: period.end.slice(0, 4),
      previousYear: previousPeriod.end.slice(0, 4)
    },
    topSuppliers: top.map((row, index) => ({
      rank: index + 1, supplier: row.label, amount: round(row.amount), sharePercent: share(row.amount, total)
    })),
    yoy: top.map((row) => {
      const before = previousBySupplier.get(row.key) || 0;
      return {
        supplier: row.label, previous: round(before), current: round(row.amount),
        variancePercent: variance(row.amount, before), trend: row.amount >= before ? "UP" : "DOWN"
      };
    }),
    byExpenditure: breakdown(spendBy(current, (entry) => entry.expenditure)),
    byDivision: breakdown(spendBy(current, (entry) => entry.division)),
    recent: purchaseOrders.slice(0, SPEND_RECENT),
    purchaseOrders,
    suppliers: supplierRows,
    // The master's inactive vendors, each with its POs of the period (if any).
    inactiveSupplierList: inactiveVendors.map((vendor) => ({
      vendorId: vendor.ID,
      vendorCode: vendor.vendorCode || "",
      supplier: vendor.vendorName || vendor.vendorCode || "",
      poCount: purchaseOrders.filter((row) => row.vendorId === vendor.ID).length
    })),
    otherCurrencyCount: current.filter((entry) => !entry.lkr).length
  };
}

// PDF of the Purchase Order Lifecycle dashboard, drawn with pdfkit the way the Flowmate project
// exports its dashboards: a header band, the KPI tiles, the charts the browser sent as SVG, and
// the dashboard tables. A4 landscape; every page carries a footer.

const PDF_PAGE = { width: 842, height: 595, margin: 36 };
const PDF_CONTENT_WIDTH = PDF_PAGE.width - 2 * PDF_PAGE.margin;
const PDF_BOTTOM = PDF_PAGE.height - 48;
const PDF_COLOR = {
  text: "#1d2d3e", muted: "#526579", border: "#d9e2ec", header: "#064f9e", headerBand: "#0a6ed1",
  rowAlt: "#f6f8fb", good: "#18864b", watch: "#c35500", poor: "#bb0000", bar: "#0a6ed1"
};
const PDF_KPI_ACCENT = ["#0a6ed1", "#bb0000", "#087f8c", "#18864b", "#c94b13", "#6d4bd1"];
const PDF_STATUS_COLOR = { GOOD: PDF_COLOR.good, WATCH: PDF_COLOR.watch, POOR: PDF_COLOR.poor };
const PDF_FAIL_TEXT = { CRITICAL: "Critical", WARNING: "Warning", MONITOR: "Monitor" };
const PDF_FAIL_COLOR = { CRITICAL: PDF_COLOR.poor, WARNING: PDF_COLOR.watch, MONITOR: PDF_COLOR.headerBand };
const PDF_STATUS_TEXT = { GOOD: "On track", WATCH: "Watch", POOR: "Off track", NONE: "No data" };

const pdfMonthName = (key, style = "long") => {
  const [year, month] = String(key || "").split("-").map(Number);
  if (!year || !month) return "";
  return new Intl.DateTimeFormat("en-GB", { month: style, year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
};
// "01 Oct 2026 - 31 Oct 2026" for a { start, end } period of "YYYY-MM-DD" pdfDays.
const pdfDayLabel = (key) => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
  .format(new Date(`${key}T00:00:00Z`));
const pdfPeriodLabel = (period) => `${pdfDayLabel(period.start)} - ${pdfDayLabel(period.end)}`;
const pdfPercent = (value) => (value === null || value === undefined ? "-" : `${Number(value).toFixed(1)}%`);
const pdfDays = (value) => (value === null || value === undefined ? "-" : Number(value).toFixed(1));

// The six KPI tiles of the dashboard, with the change against the period before.
function pdfKpiTiles(report) {
  const k = report.kpis;
  const p = report.previousPeriod || {};
  const previous = "previous period";
  const change = (current, before, isPercent) => {
    if (current === null || current === undefined || before === null || before === undefined) return `No data for the ${previous}`;
    const delta = Math.round((current - before) * 10) / 10;
    return delta ? `${delta > 0 ? "+" : ""}${delta}${isPercent ? " pts" : ""} vs ${previous}` : `Same as ${previous}`;
  };
  return [
    ["Total PO requests", k.totalRequests, "In the reporting period", change(k.totalRequests, p.totalRequests)],
    ["PO rejected", k.rejected, "Terminated in the workflow", change(k.rejected, p.rejected)],
    ["PO created", k.created, "PO number recorded at S/4", change(k.created, p.created)],
    ["PO approved", k.approved, "All approval steps done", change(k.approved, p.approved)],
    ["Pending approval", k.pendingApproval, "Awaiting action", change(k.pendingApproval, p.pendingApproval)],
    ["SLA compliance", k.slaCompliancePercent === null ? "-" : pdfPercent(k.slaCompliancePercent), "All included SLA",
      change(k.slaCompliancePercent, p.slaCompliancePercent, true)]
  ];
}

function pdfEnsureSpace(doc, height) {
  if (doc.y + height > PDF_BOTTOM) {
    doc.addPage();
    doc.y = PDF_PAGE.margin;
  }
}

function pdfSectionTitle(doc, title) {
  pdfEnsureSpace(doc, 60);
  doc.fillColor(PDF_COLOR.headerBand).rect(PDF_PAGE.margin, doc.y + 2, 3, 13).fill();
  doc.fillColor(PDF_COLOR.text).font("Helvetica-Bold").fontSize(12).text(title, PDF_PAGE.margin + 9, doc.y, { width: PDF_CONTENT_WIDTH - 9 });
  doc.moveDown(0.4);
}

function drawPdfHeader(doc, report, options) {
  doc.fillColor(PDF_COLOR.headerBand).rect(0, 0, PDF_PAGE.width, 70).fill();
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(19).text(options.title || "Purchase Order (PO) Lifecycle Dashboard", PDF_PAGE.margin, 18);
  doc.font("Helvetica").fontSize(10)
    .text(`Reporting period: ${pdfPeriodLabel(report.period)} · ${options.poTypeName || "All PO types"}`, PDF_PAGE.margin, 44);
  doc.text(`Generated ${options.generatedAt}`, PDF_PAGE.margin, 44, { width: PDF_CONTENT_WIDTH, align: "right" });
  doc.y = 86;
}

// tiles: [label, value, caption, footer] per tile (pdfKpiTiles, pdfSpendKpiTiles).
function drawPdfKpis(doc, tiles) {
  const gap = 10;
  const width = (PDF_CONTENT_WIDTH - gap * (tiles.length - 1)) / tiles.length;
  const top = doc.y;
  tiles.forEach(([label, value, caption, change], index) => {
    const left = PDF_PAGE.margin + index * (width + gap);
    doc.roundedRect(left, top, width, 74, 5).fillAndStroke("#ffffff", PDF_COLOR.border);
    doc.fillColor(PDF_KPI_ACCENT[index]).rect(left, top, width, 3).fill();
    doc.fillColor(PDF_COLOR.text).font("Helvetica-Bold").fontSize(8.5).text(label, left + 9, top + 10, { width: width - 18 });
    doc.fillColor(PDF_COLOR.muted).font("Helvetica").fontSize(7).text(caption, left + 9, top + 22, { width: width - 18, height: 9, ellipsis: true });
    doc.fillColor(PDF_KPI_ACCENT[index]).font("Helvetica-Bold").fontSize(20).text(String(value ?? "-"), left + 9, top + 35, { width: width - 18 });
    doc.fillColor(PDF_COLOR.muted).font("Helvetica").fontSize(7).text(change, left + 9, top + 60, { width: width - 18, height: 9, ellipsis: true });
  });
  doc.y = top + 88;
}

// A chart the browser rendered, or simple bars when no snapshot was sent.
function drawPdfChart(doc, title, chart, fallbackRows, left, width) {
  const top = doc.y;
  const height = 200;
  doc.roundedRect(left, top, width, height + 26, 5).fillAndStroke("#ffffff", PDF_COLOR.border);
  doc.fillColor(PDF_COLOR.text).font("Helvetica-Bold").fontSize(10).text(title, left + 10, top + 9, { width: width - 20 });
  if (chart) {
    SVGtoPDF(doc, chart.svg, left + 8, top + 24, { width: width - 16, height: height - 4, preserveAspectRatio: "xMidYMid meet", assumePt: true });
  } else {
    const rows = fallbackRows.slice(0, 12);
    const maximum = Math.max(1, ...rows.map((row) => row.value));
    rows.forEach((row, index) => {
      const y = top + 30 + index * 14;
      doc.fillColor(PDF_COLOR.muted).font("Helvetica").fontSize(7).text(row.label, left + 10, y + 2, { width: 70, ellipsis: true });
      doc.fillColor("#edf1f5").rect(left + 84, y, width - 150, 9).fill();
      doc.fillColor(PDF_COLOR.bar).rect(left + 84, y, Math.max(1, (row.value / maximum) * (width - 150)), 9).fill();
      doc.fillColor(PDF_COLOR.text).font("Helvetica-Bold").fontSize(7).text(row.text, left + width - 60, y + 1, { width: 50, align: "right" });
    });
    if (!rows.length) doc.fillColor(PDF_COLOR.muted).font("Helvetica").fontSize(9).text("No data for this period.", left + 10, top + 34);
  }
  return top + height + 26;
}

function drawPdfCharts(doc, report, charts) {
  pdfEnsureSpace(doc, 240);
  const top = doc.y;
  const gap = 14;
  const width = (PDF_CONTENT_WIDTH - gap) / 2;
  const byKey = new Map(charts.map((chart) => [chart.chartKey, chart]));
  const trendBottom = drawPdfChart(doc, "Monthly trend: approved, rejected and pending POs with SLA %", byKey.get("trend"),
    report.trend.map((row) => ({ label: pdfMonthName(row.month, "short"), value: row.received, text: String(row.received) })), PDF_PAGE.margin, width);
  doc.y = top;
  const groupBottom = drawPdfChart(doc, "SLA % by group (division)", byKey.get("groups"),
    report.divisionBreakdown.map((row) => ({ label: row.label, value: row.slaPercent || 0, text: pdfPercent(row.slaPercent) })),
    PDF_PAGE.margin + width + gap, width);
  doc.y = Math.max(trendBottom, groupBottom) + 16;
}

// A table: columns are [header, width share, value(row), options]; the header repeats on a new page.
function drawPdfTable(doc, title, rows, columns, emptyText) {
  // A short table moves to the next page whole rather than leaving its last rows behind.
  pdfEnsureSpace(doc, 46 + Math.min(rows.length, 8) * 17);
  pdfSectionTitle(doc, title);
  const total = columns.reduce((sum, column) => sum + column[1], 0);
  const widths = columns.map((column) => (column[1] / total) * PDF_CONTENT_WIDTH);
  const header = () => {
    const top = doc.y;
    doc.fillColor("#eef2f6").rect(PDF_PAGE.margin, top, PDF_CONTENT_WIDTH, 18).fill();
    let x = PDF_PAGE.margin;
    columns.forEach((column, index) => {
      const align = (column[3] || {}).align || "left";
      doc.fillColor(PDF_COLOR.muted).font("Helvetica-Bold").fontSize(7.5)
        .text(column[0].toUpperCase(), x + 5, top + 5.5, { width: widths[index] - 10, align, lineBreak: false, ellipsis: true });
      x += widths[index];
    });
    doc.y = top + 18;
  };
  if (!rows.length) {
    doc.fillColor(PDF_COLOR.muted).font("Helvetica").fontSize(9).text(emptyText || "No data for this period.", PDF_PAGE.margin, doc.y + 4);
    doc.moveDown(1.2);
    return;
  }
  header();
  rows.forEach((row, rowIndex) => {
    doc.font("Helvetica").fontSize(8);
    const heights = columns.map((column, index) => doc.heightOfString(String(column[2](row) ?? ""), { width: widths[index] - 10 }));
    const height = Math.max(16, Math.max(...heights) + 7);
    if (doc.y + height > PDF_BOTTOM) {
      doc.addPage();
      doc.y = PDF_PAGE.margin;
      header();
    }
    const top = doc.y;
    if (rowIndex % 2) doc.fillColor(PDF_COLOR.rowAlt).rect(PDF_PAGE.margin, top, PDF_CONTENT_WIDTH, height).fill();
    let x = PDF_PAGE.margin;
    columns.forEach((column, index) => {
      const options = column[3] || {};
      doc.fillColor(options.color ? options.color(row) || PDF_COLOR.text : PDF_COLOR.text)
        .font(options.bold ? "Helvetica-Bold" : "Helvetica").fontSize(8)
        .text(String(column[2](row) ?? ""), x + 5, top + 4, { width: widths[index] - 10, align: options.align || "left" });
      x += widths[index];
    });
    doc.strokeColor(PDF_COLOR.border).lineWidth(0.5).moveTo(PDF_PAGE.margin, top + height).lineTo(PDF_PAGE.margin + PDF_CONTENT_WIDTH, top + height).stroke();
    doc.y = top + height;
  });
  doc.y += 14;
}

const PDF_RIGHT = { align: "right" };
const pdfStatusColor = (row) => PDF_STATUS_COLOR[row.status];

/**
 * @param {object} report  the document of buildPoLifecycle
 * @param {Array<{chartKey: string, svg: string}>} charts  validated chart snapshots ("trend", "groups")
 * @param {{poTypeName?: string, generatedAt?: string}} options
 * @returns {Promise<{fileName: string, content: Buffer}>}
 */
function renderPoLifecyclePdf(report, charts = [], options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString().slice(0, 16).replace("T", " ");
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: PDF_PAGE.margin, bufferPages: true,
      info: { Title: `PO Lifecycle Dashboard ${pdfPeriodLabel(report.period)}`, Author: "Flowmate CA" } });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve({
      fileName: `po-lifecycle-${report.period.start}-to-${report.period.end}-${String(report.poType || "ALL").toLowerCase()}.pdf`,
      content: Buffer.concat(chunks)
    }));

    drawPdfHeader(doc, report, Object.assign({}, options, { generatedAt }));
    drawPdfKpis(doc, pdfKpiTiles(report));
    drawPdfCharts(doc, report, charts);

    drawPdfTable(doc, `SLA - ${pdfPeriodLabel(report.period)}`, report.monthlySla, [
      ["Metric", 4, (row) => row.label, { bold: true }],
      ["Requests", 1.4, (row) => row.count, PDF_RIGHT],
      ["SLA target (pdfDays)", 1.8, (row) => pdfDays(row.targetDays), PDF_RIGHT],
      ["Achieved (pdfDays)", 1.8, (row) => pdfDays(row.achievedDays), PDF_RIGHT],
      ["SLA %", 1.4, (row) => pdfPercent(row.slaPercent), Object.assign({ color: pdfStatusColor }, PDF_RIGHT)]
    ]);
    drawPdfTable(doc, "Purchasing group / company code / contract view", report.views, [
      ["View", 3.4, (row) => row.label, { bold: true }],
      ["PO volume", 1.4, (row) => row.volume, PDF_RIGHT],
      ["SLA %", 1.4, (row) => pdfPercent(row.slaPercent), Object.assign({ color: pdfStatusColor }, PDF_RIGHT)],
      ["Remarks", 3.8, (row) => row.remarks || ""]
    ]);
    report.views.filter((view) => view.rows.length && view.layout !== "STAGES").forEach((view) => {
      const sla = view.layout === "SLA";
      drawPdfTable(doc, view.label, view.rows, [
        [view.key === "CONTRACT" ? "Contract" : view.key === "COMPANY_CODE" ? "Company code" : "Purchasing group", 3, (row) => row.label, { bold: true }],
        ["PO volume", 1.4, (row) => row.volume, PDF_RIGHT],
        sla ? ["SLA target (pdfDays)", 1.8, (row) => pdfDays(row.targetDays), PDF_RIGHT] : ["Share", 1.4, (row) => pdfPercent(row.sharePercent), PDF_RIGHT],
        sla ? ["Achieved (pdfDays)", 1.8, (row) => pdfDays(row.achievedDays), PDF_RIGHT]
          : ["Created / approved / rejected / pending", 3.2, (row) => `${row.created} / ${row.approved} / ${row.rejected} / ${row.pending}`, PDF_RIGHT],
        ["SLA %", 1.4, (row) => pdfPercent(row.slaPercent), Object.assign({ color: pdfStatusColor }, PDF_RIGHT)]
      ]);
    });
    drawPdfTable(doc, `SLA fail reasons (${report.slaFailures.length})`, report.slaFailures, [
      ["PO number", 2.2, (row) => (row.hasPoNumber ? `${row.poNumber}\n${row.reference}` : row.poNumber), { bold: true }],
      ["Supplier", 2.4, (row) => row.supplier || "-"],
      ["SLA fail reason", 3.6, (row) => row.reason],
      ["Fail status", 1.4, (row) => PDF_FAIL_TEXT[row.failStatus], { color: (row) => PDF_FAIL_COLOR[row.failStatus] }],
      ["Days of fail", 1.4, (row) => `${pdfDays(row.failDays)} pdfDays`, Object.assign({ color: (row) => PDF_FAIL_COLOR[row.failStatus] }, PDF_RIGHT)]
    ], "No PO missed its SLA in this period.");
    drawPdfTable(doc, "SLA breakdown by group", report.divisionBreakdown, [
      ["Group", 3, (row) => row.label, { bold: true }],
      ["PO volume", 1.4, (row) => row.volume, PDF_RIGHT],
      ["SLA %", 1.4, (row) => pdfPercent(row.slaPercent), Object.assign({ color: pdfStatusColor }, PDF_RIGHT)],
      ["Status", 1.6, (row) => PDF_STATUS_TEXT[row.status] || "", { color: pdfStatusColor }]
    ]);

    drawPdfFooters(doc);
    doc.end();
  });
}

function drawPdfFooters(doc) {
  const pages = doc.bufferedPageRange().count;
  for (let page = 0; page < pages; page++) {
    doc.switchToPage(page);
    // The footer sits in the bottom margin; without lifting it pdfkit would start a new page.
    doc.page.margins.bottom = 0;
    doc.fillColor(PDF_COLOR.muted).font("Helvetica").fontSize(7.5)
      .text(`Generated by Flowmate CA | Page ${page + 1} of ${pages}`, PDF_PAGE.margin, PDF_PAGE.height - 30,
        { width: PDF_CONTENT_WIDTH, align: "right", lineBreak: false });
  }
}

// --- Spend Analysis PDF -------------------------------------------------------------------------

const pdfMillions = (value) => (value === null || value === undefined ? "-"
  : (Number(value) / 1000000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pdfAmount = (value) => Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pdfSigned = (value) => (value === null || value === undefined ? "-" : `${value > 0 ? "+" : ""}${Number(value).toFixed(1)}%`);
const pdfVarianceColor = (row) => (row.variancePercent === null || row.variancePercent === undefined ? PDF_COLOR.muted
  : row.variancePercent < 0 ? PDF_COLOR.poor : PDF_COLOR.good);

// The five KPI tiles of the Spend Analysis dashboard, as on the screen.
function pdfSpendKpiTiles(report) {
  const k = report.kpis;
  return [
    ["Total Supplier Spend", `${pdfMillions(k.totalSpend)} Mn`, "Approved LKR POs (LKR Mn)", `${k.poCount} PO(s) in the period`],
    ["Active Suppliers", k.activeSuppliers, "With active transactions", `Previous year: LKR ${pdfMillions(k.previousSpend)} Mn`],
    ["Top 10 Supplier Spend %", pdfPercent(k.topSupplierSharePercent), "Share of total spend", ""],
    ["YoY Spend Variance", pdfSigned(k.yoyVariancePercent), `${k.currentYear} vs ${k.previousYear}`,
      k.yoyVariancePercent === null ? "No spend in the previous year" : ""],
    ["Inactive Suppliers", k.inactiveSuppliers, "Requires attention", ""]
  ];
}

/**
 * @param {object} report  the document of buildSpendAnalysis
 * @param {Array<{chartKey: string, svg: string}>} charts  validated chart snapshots ("spendTop", "spendYoy")
 * @param {{poTypeName?: string, generatedAt?: string}} options
 * @returns {Promise<{fileName: string, content: Buffer}>}
 */
function renderSpendAnalysisPdf(report, charts = [], options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString().slice(0, 16).replace("T", " ");
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: PDF_PAGE.margin, bufferPages: true,
      info: { Title: `Spend Analysis Dashboard ${pdfPeriodLabel(report.period)}`, Author: "Flowmate CA" } });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve({
      fileName: `spend-analysis-${report.period.start}-to-${report.period.end}-${String(report.poType || "ALL").toLowerCase()}.pdf`,
      content: Buffer.concat(chunks)
    }));

    drawPdfHeader(doc, report, Object.assign({}, options, { generatedAt, title: "Spend Analysis Dashboard" }));
    drawPdfKpis(doc, pdfSpendKpiTiles(report));
    if (report.otherCurrencyCount) {
      doc.fillColor(PDF_COLOR.watch).font("Helvetica").fontSize(8.5)
        .text(`${report.otherCurrencyCount} approved PO(s) in other currencies are listed under Recent transactions but not counted in the LKR spend figures.`,
          PDF_PAGE.margin, doc.y - 6, { width: PDF_CONTENT_WIDTH });
      doc.moveDown(0.8);
    }

    pdfEnsureSpace(doc, 240);
    const top = doc.y;
    const gap = 14;
    const width = (PDF_CONTENT_WIDTH - gap) / 2;
    const byKey = new Map(charts.map((chart) => [chart.chartKey, chart]));
    const topBottom = drawPdfChart(doc, "Top 10 suppliers by spend (LKR Mn)", byKey.get("spendTop"),
      report.topSuppliers.map((row) => ({ label: row.supplier, value: row.amount, text: pdfMillions(row.amount) })), PDF_PAGE.margin, width);
    doc.y = top;
    const yoyBottom = drawPdfChart(doc, `YoY analysis: ${report.kpis.previousYear} vs ${report.kpis.currentYear} (LKR Mn)`, byKey.get("spendYoy"),
      report.yoy.map((row) => ({ label: row.supplier, value: row.current, text: pdfMillions(row.current) })), PDF_PAGE.margin + width + gap, width);
    doc.y = Math.max(topBottom, yoyBottom) + 16;

    drawPdfTable(doc, "Top 10 suppliers by spend", report.topSuppliers, [
      ["Rank", 0.8, (row) => row.rank, PDF_RIGHT],
      ["Supplier name", 5, (row) => row.supplier, { bold: true }],
      ["Spend (LKR Mn)", 2, (row) => pdfMillions(row.amount), PDF_RIGHT],
      ["% of total", 1.6, (row) => pdfPercent(row.sharePercent), PDF_RIGHT]
    ]);
    drawPdfTable(doc, "Year-over-year spend comparison", report.yoy, [
      ["Supplier name", 4.4, (row) => row.supplier, { bold: true }],
      [`${report.kpis.previousYear} (LKR Mn)`, 2, (row) => pdfMillions(row.previous), PDF_RIGHT],
      [`${report.kpis.currentYear} (LKR Mn)`, 2, (row) => pdfMillions(row.current), PDF_RIGHT],
      ["Variance", 1.6, (row) => pdfSigned(row.variancePercent), Object.assign({ color: pdfVarianceColor }, PDF_RIGHT)]
    ]);
    const breakdownColumns = (label) => [
      [label, 4, (row) => row.label, { bold: true }],
      ["Spend (LKR Mn)", 2, (row) => pdfMillions(row.amount), PDF_RIGHT],
      ["% of total", 1.6, (row) => pdfPercent(row.sharePercent), PDF_RIGHT]
    ];
    drawPdfTable(doc, "Spend distribution by cost expenditure", report.byExpenditure, breakdownColumns("Category"));
    drawPdfTable(doc, "Spend distribution by business unit", report.byDivision, breakdownColumns("Business unit"));
    drawPdfTable(doc, `Recent transactions (${report.recent.length} of ${(report.purchaseOrders || report.recent).length})`, report.recent, [
      ["PO No", 2, (row) => row.poNumber, { bold: true }],
      ["Supplier", 3, (row) => row.supplier],
      ["Date", 1.4, (row) => (row.date ? pdfDayLabel(row.date) : "-")],
      ["Amount", 1.8, (row) => `${pdfAmount(row.amount)} ${row.currency || ""}`, PDF_RIGHT],
      ["Amount in LKR", 1.8, (row) => (row.amountLkr === null ? "-" : pdfAmount(row.amountLkr)), PDF_RIGHT],
      ["Business unit", 1.8, (row) => row.division],
      ["Capex / Opex", 1.2, (row) => row.expenditure]
    ], "No approved purchase orders in this period.");

    drawPdfFooters(doc);
    doc.end();
  });
}

// Chart snapshots from the browser: known keys only, real SVG of a sane size, without scripts,
// embedded HTML, event handlers or external links (as the Flowmate PDF export does).
const PDF_CHART_KEYS = new Set(["trend", "groups"]);
const SPEND_PDF_CHART_KEYS = new Set(["spendTop", "spendYoy"]);
function validatedChartSnapshots(charts, allowedKeys = PDF_CHART_KEYS) {
  const list = Array.isArray(charts) ? charts : [];
  if (list.length > 4) {
    throw Object.assign(new Error("A maximum of four dashboard charts can be exported at once"), { status: 400 });
  }
  return list.map((chart) => {
    const chartKey = String(chart?.chartKey || "");
    const svg = String(chart?.svg || "");
    if (!allowedKeys.has(chartKey)) {
      throw Object.assign(new Error(`Chart ${chartKey || "without a key"} is not valid for this dashboard`), { status: 400 });
    }
    if (!svg.trim().startsWith("<svg") || svg.length > 1500000) {
      throw Object.assign(new Error(`Chart ${chartKey} contains invalid or excessive SVG content`), { status: 400 });
    }
    return {
      chartKey,
      title: String(chart?.title || "").trim().slice(0, 150),
      svg: svg
        .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
        .replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject\s*>/gi, "")
        .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, "")
        .replace(/\s+(?:href|xlink:href)\s*=\s*("|')(?!(?:#|data:image\/))[^"']*\1/gi, "")
    };
  });
}

module.exports = class FlowmateCAService extends cds.ApplicationService {
  _workhubClient = sendPoNumbersToWorkhub;

  async init() {
    this.db = cds.entities("flowmate.ca.db");
    this.master = await cds.connect.to("CommonMasterDataService");
    this.masterEntities = this.master.entities;
    this.flowmate = await cds.connect.to("FlowmateService");

    this.before("*", guardTechnicalOperation);

    this.before("createRequest", this._requireCreateAccess);
    this.before(["saveDraft", "deleteDraft", "createBulkRequests", "submitRequest", "createSuccessorRequest"], this._requireCreator);
    // Claiming an unassigned team task remains a processor capability. Once a task is
    // assigned to a person, its handlers enforce ownership (or active delegation) instead
    // of requiring the assignee to hold CAProcessor as well. This lets a requester work a
    // task sent back to them without exposing the team queue.
    this.before("claimTeamTask", this._requireValidator);
    this.before(["reassignRequest", "reassignTask"], this._requireSupervisor);
    this.before("getReportingDashboard", this._requireSupervisor);
    this.before(["getPoLifecycleDashboard", "exportPoLifecycleDashboardPdf", "getSpendAnalysisDashboard", "exportSpendAnalysisDashboardPdf"],
      (req) => this._requireCapability(req, "canViewReports", "Only a supervisor or administrator can view reports"));
    this.before("addTask", this._requireAddTask);
    this.before(["rejectTask", "completeStep", "sendToS4"], this._requireAdmin);

    this.on("READ", ["Users", "Teams", "TeamMembers", "RequesterTeams", "Vendors"], (req) => {
      return this.master.run(req.query);
    });

    this.before("CREATE", "Delegations", this._prepareDelegationCreate);
    this.before("READ", "Delegations", this._filterDelegations);
    this.before("UPDATE", "Delegations", (req) => {
      return req.reject(405, "Delete and recreate a delegation to change its details");
    });
    this.before("DELETE", "Delegations", this._authorizeDelegationDelete);
    this.on(["READ", "CREATE", "UPDATE", "DELETE"], "Delegations", (req) => {
      return this.master.run(req.query);
    });

    this.before("READ", "Requests", this._filterRequestsByRole);
    this.before("READ", "RequestQueue", this._filterRequestsByRole);
    this.before("READ", "Tasks", this._filterTasksByRole);
    this.before("READ", "MyRequests", this._filterMyRequests);
    this.after("READ", ["Requests", "MyRequests", "RequestQueue"], this._addPendingInfo);
    this.before("READ", "Drafts", this._filterDrafts);
    this.before("READ", "Attachments", this._filterRequestAttachments);
    this.before("READ", ["RequestSteps", "Comments", "InvolvedParties", "History", "RequestVersions"], this._filterRequestChildrenByRole);
    this.before("READ", "DraftAttachments", this._filterDraftAttachments);
    this.before("READ", "MyTasks", this._filterMyTasks);
    this.before("READ", "MyTeamTasks", this._filterMyTeamTasks);
    this.before("UPDATE", ["Requests", "MyRequests", "RequestQueue"], this._protectRequestAssignment);
    this.before("UPDATE", ["Tasks", "MyTasks", "MyTeamTasks"], this._protectTaskAssignment);

    this.on("getCurrentUser", this._getCurrentUser);
    this.on("getFlowmateRequestFormCatalog", this._getFlowmateRequestFormCatalog);
    this.on("getDashboardCounts", this._getDashboardCounts);
    this.on("getReportingDashboard", this._getReportingDashboard);
    this.on("getPoLifecycleDashboard", this._getPoLifecycleDashboard);
    this.on("getSpendAnalysisDashboard", this._getSpendAnalysisDashboard);
    this.on("exportPoLifecycleDashboardPdf", this._exportPoLifecycleDashboardPdf);
    this.on("exportSpendAnalysisDashboardPdf", this._exportSpendAnalysisDashboardPdf);
    this.on("getFlowmateConnectionStatus", this._getFlowmateConnectionStatus);
    this.on("createRequest", this._createRequest);
    this.on("saveDraft", this._saveDraft);
    this.on("deleteDraft", this._deleteDraft);
    this.on("previewProjectCode", this._previewProjectCode);
    this.on("previewRequestTitle", this._previewRequestTitle);
    this.on("slaPreview", this._slaPreview);
    this.on("canContribute", this._canContributeToRequest);
    this.before("CREATE", "Attachments", this._beforeCreateAttachment);
    this.before(["UPDATE", "DELETE"], "Attachments", this._protectRequestAttachment);
    this.before("CREATE", "DraftAttachments", this._beforeCreateDraftAttachment);
    this.before(["UPDATE", "DELETE"], "DraftAttachments", this._protectDraftAttachment);
    this.on("runSlaBreachScan", this._runSlaBreachScan);
    this.on("createFlowmatePaymentRun", this._createFlowmatePaymentRun);
    this.on("createFlowmateServiceEntrySheet", this._createFlowmateServiceEntrySheet);
    this.on("createBulkRequests", this._createBulkRequests);
    this.on("submitRequest", this._submitRequest);
    this.on("addTask", this._addTask);
    this.on("claimTeamTask", this._claimTeamTask);
    this.on("reassignRequest", this._reassignRequest);
    this.on("reassignTask", this._reassignTask);
    this.on("requestBudgetCheck", this._requestBudgetCheck);
    this.on("approveTask", this._approveTask);
    this.on("sendPoNumbersToWorkhub", this._sendPoNumbersToWorkhub);
    this.on("rejectTask", this._rejectTask);
    this.on("sendBackTask", this._sendBackTask);
    this.on("completeStep", this._completeStep);
    this.on("saveRequesterDetails", this._saveRequesterDetails);
    this.on("addComment", this._addComment);
    this.on("createSuccessorRequest", this._createSuccessorRequest);
    this.on("sendToS4", this._sendToS4);

    return super.init();
  }

  _getFlowmateConnectionStatus = async () => {
    const checkedAt = new Date().toISOString();
    try {
      const rows = await this.flowmate.run(
        SELECT.from(this.flowmate.entities.ProcessRequests).columns("ID").limit(1)
      );
      return {
        reachable: true,
        application: "Flowmate",
        endpoint: "flowmate-api",
        sampleRecords: Array.isArray(rows) ? rows.length : (rows ? 1 : 0),
        checkedAt,
        message: "Authenticated connection to Flowmate is ready"
      };
    } catch (error) {
      cds.log("peer-integration").warn("Flowmate connection check failed", error.message);
      return {
        reachable: false,
        application: "Flowmate",
        endpoint: "flowmate-api",
        sampleRecords: 0,
        checkedAt,
        message: `Connection failed: ${error.message}`.slice(0, 500)
      };
    }
  };

  _getFlowmateRequestFormCatalog = async (req) => {
    const catalogEntities = [
      ["processTypes", "ProcessTypes"],
      ["processSubTypes", "ProcessSubTypes"],
      ["paymentCategories", "PaymentCategories"],
      ["ftkEntities", "FtkEntities"],
      ["currencies", "Currencies"],
      ["categories", "Categories"],
      ["paymentSubCategories", "PaymentSubCategories"],
      ["paymentMethods", "PaymentMethod"],
      ["typeOfPayments", "TypeOfPayment"],
      ["requestDivisions", "RequestDivision"],
      ["guaranteeTypes", "GuaranteeTypes"],
      ["priorities", "Priorities"],
      ["customers", "Customers"],
      ["vendors", "Vendors"],
      ["teams", "Teams"]
    ];
    try {
      const result = {};
      await Promise.all(catalogEntities.map(async ([key, entityName]) => {
        const entity = this.flowmate.entities[entityName];
        if (!entity) {
          result[key] = [];
          return;
        }
        const query = SELECT.from(entity);
        if (entityName !== "Customers") {
          query.where({ isActive: true });
        } else {
          query.where({ isActive: true });
        }
        result[key] = await this.flowmate.run(query);
      }));
      return JSON.stringify(result);
    } catch (error) {
      cds.log("peer-integration").warn("Flowmate request-form catalog could not be loaded", error.message);
      return req.reject(502, "Flowmate request-form values are temporarily unavailable");
    }
  };

  _createFlowmatePaymentRun = async (req) => {
    const tx = cds.tx(req);
    const user = await this._ensureCurrentUser(req);
    const requestId = req.data.requestId;
    const request = await tx.run(
      SELECT.one.from(this.db.CARequests).where({ ID: requestId })
    );
    if (!request) {
      return req.reject(404, "Commerce Automation request was not found");
    }
    if (request.requestType_code !== "PURCHASE_ORDER") {
      return req.reject(400, "Flowmate Payment Run integration is only available for purchase orders");
    }
    if (!req[INTERNAL_FLOWMATE_HANDOFF] && request.requester_ID !== user.ID
        && !(await this._canActForUser(req, user.ID, request.owner_ID)) && !req.user.is("CAAdmin")) {
      return req.reject(403, "Only the request creator, owner, active owner delegate, or an administrator can create the Flowmate Payment Run request");
    }
    if (request.status_code !== REQUEST_STATUS.COMPLETED) {
      return req.reject(409, "The Flowmate Payment Run request can only be created after the purchase order flow is successfully completed");
    }
    if (String(request.externalStatus || "").startsWith("FLOWMATE_PAYMENT_RUN_CREATED") && request.externalObjectId) {
      const [, existingReference] = String(request.externalStatus).split("|");
      return {
        created: true,
        requestId: request.externalObjectId,
        referenceNumber: existingReference || "already created",
        attachmentCount: 0
      };
    }

    const purchaseOrder = await tx.run(
      SELECT.one.from(this.db.PurchaseOrderDetails).where({ request_ID: request.ID })
    );
    if (!purchaseOrder?.paymentRun) {
      return req.reject(400, "Payment Run was not selected for this purchase order");
    }

    let paymentRunDetails;
    try {
      paymentRunDetails = typeof purchaseOrder.paymentRunDetails === "string"
        ? JSON.parse(purchaseOrder.paymentRunDetails)
        : purchaseOrder.paymentRunDetails;
    } catch (_error) {
      return req.reject(400, "Payment Run details contain invalid JSON");
    }
    if (!paymentRunDetails || typeof paymentRunDetails !== "object") {
      return req.reject(400, "Payment Run details are missing");
    }

    const caAttachments = await tx.run(
      SELECT.from(this.db.CAAttachments)
        .columns("ID", "filename", "mimeType", "content")
        .where({ request_ID: request.ID, category: "PAYMENT_RUN" })
    );
    if (!caAttachments.length) {
      return req.reject(400, "Select at least one Payment Run attachment before creating the Flowmate request");
    }

    const dynamicDetails = paymentRunDetails.details && typeof paymentRunDetails.details === "object"
      ? paymentRunDetails.details
      : {};
    const normalizedDetails = { ...dynamicDetails };
    for (const field of [
      "invoices",
      "travelExpenses",
      "directForeignTravelEntries",
      "glBreakups",
      "merchantEntityValues",
      "settlementEntries"
    ]) {
      if (typeof normalizedDetails[field] !== "string") {
        continue;
      }
      try {
        normalizedDetails[field] = JSON.parse(normalizedDetails[field]);
      } catch (_error) {
        return req.reject(400, `Payment Run field ${field} contains invalid JSON`);
      }
      if (!Array.isArray(normalizedDetails[field])) {
        return req.reject(400, `Payment Run field ${field} must contain a JSON array`);
      }
    }
    // As for the SES successor, the PO Numbers recorded at S/4 Data Validation go with the request.
    const poNumbers = poNumberList(purchaseOrder.purchaseOrderNumber);
    if (poNumbers.length) {
      normalizedDetails.poNumber = poNumbers.join("; ");
    }
    const flowmateInput = {
      processType_code: paymentRunDetails.processType_code,
      subProcessType_code: paymentRunDetails.subProcessType_code,
      // The PO's own title: the pop-up only showed a preview of its number.
      title: String(request.title || paymentRunDetails.title || "").trim(),
      description: paymentRunDetails.description || request.description || null,
      requesterUser_ID: request.requester_ID,
      processorTeam_ID: paymentRunDetails.processorTeam_ID || request.ownerTeam_ID || null,
      processorTeamName: paymentRunDetails.processorTeamName || request.ownerTeamName || null,
      department: paymentRunDetails.department || null,
      amount: paymentRunDetails.amount === "" || paymentRunDetails.amount === null || paymentRunDetails.amount === undefined
        ? null
        : Number(paymentRunDetails.amount),
      role: paymentRunDetails.role || null,
      priorityConfig_code: paymentRunDetails.priorityConfig_code || "MEDIUM",
      ...normalizedDetails
    };
    const encodedAttachments = await Promise.all(caAttachments.map(async (attachment) => ({
      filename: attachment.filename,
      mimeType: attachment.mimeType || "application/octet-stream",
      contentBase64: (await readAttachmentContent(attachment.content)).toString("base64")
    })));

    if (!flowmateInput.processType_code || !flowmateInput.subProcessType_code || !flowmateInput.title) {
      return req.reject(400, "Payment Run process type, subprocess type, and title are required");
    }
    if (!flowmateInput.processorTeam_ID) {
      return req.reject(400, "Select a Flowmate processor team for the Payment Run request");
    }
    if (encodedAttachments.some((attachment) => !attachment.contentBase64)) {
      return req.reject(400, "One or more Payment Run attachments have no content");
    }

    try {
      const result = await this.flowmate.send({
        event: "createRequestWithAttachments",
        data: {
          input: JSON.stringify(flowmateInput),
          attachments: JSON.stringify(encodedAttachments)
        }
      });
      await tx.run(UPDATE(this.db.CARequests).set({
        externalObjectId: result?.ID || null,
        externalStatus: `FLOWMATE_PAYMENT_RUN_CREATED|${result?.referenceNumber || ""}`
      }).where({ ID: request.ID }));
      await this._writeHistory(
        tx,
        request.ID,
        request.currentStep || 0,
        "FLOWMATE_PAYMENT_RUN_CREATED",
        user,
        request.status_code,
        request.status_code,
        result?.referenceNumber || "Flowmate Payment Run request created"
      );
      return {
        created: true,
        requestId: result?.ID,
        referenceNumber: result?.referenceNumber,
        attachmentCount: encodedAttachments.length
      };
    } catch (error) {
      cds.log("peer-integration").error("Flowmate Payment Run creation failed", error);
      return req.reject(502, `Flowmate request could not be created: ${error.message}`);
    }
  };

  _createFlowmateServiceEntrySheet = async (req) => {
    const tx = cds.tx(req);
    const user = await this._ensureCurrentUser(req);
    const requestId = req.data.requestId;
    const request = await tx.run(
      SELECT.one.from(this.db.CARequests).where({ ID: requestId })
    );
    if (!request) {
      return req.reject(404, "Commerce Automation request was not found");
    }
    if (request.requestType_code !== "SERVICE_ENTRY_SHEET") {
      return req.reject(400, "Flowmate Service Entry Sheet integration is only available for service entry sheet requests");
    }
    if (!req[INTERNAL_FLOWMATE_HANDOFF] && request.requester_ID !== user.ID
        && !(await this._canActForUser(req, user.ID, request.owner_ID)) && !req.user.is("CAAdmin")) {
      return req.reject(403, "Only the request creator, owner, active owner delegate, or an administrator can create the Flowmate Service Entry Sheet request");
    }
    if (request.status_code !== REQUEST_STATUS.COMPLETED) {
      return req.reject(409, "The Flowmate Service Entry Sheet request can only be created after the service entry sheet flow is successfully completed");
    }
    if (String(request.externalStatus || "").startsWith("FLOWMATE_SES_CREATED") && request.externalObjectId) {
      const [, existingReference] = String(request.externalStatus).split("|");
      return {
        created: true,
        requestId: request.externalObjectId,
        referenceNumber: existingReference || "already created",
        attachmentCount: 0
      };
    }

    const serviceEntrySheet = await tx.run(
      SELECT.one.from(this.db.ServiceEntrySheetDetails).where({ request_ID: request.ID })
    );
    if (!serviceEntrySheet?.flowmateSesRequest) {
      return req.reject(400, "Create Flowmate Service Entry Sheet Request was not selected");
    }

    let flowmateSesDetails;
    try {
      flowmateSesDetails = typeof serviceEntrySheet.flowmateSesRequestDetails === "string"
        ? JSON.parse(serviceEntrySheet.flowmateSesRequestDetails)
        : serviceEntrySheet.flowmateSesRequestDetails;
    } catch (_error) {
      return req.reject(400, "Flowmate Service Entry Sheet details contain invalid JSON");
    }
    if (!flowmateSesDetails || typeof flowmateSesDetails !== "object") {
      return req.reject(400, "Flowmate Service Entry Sheet details are missing");
    }

    const caAttachments = await tx.run(
      SELECT.from(this.db.CAAttachments)
        .columns("ID", "filename", "mimeType", "content")
        .where({ request_ID: request.ID, category: "FLOWMATE_SES" })
    );
    if (!caAttachments.length) {
      return req.reject(400, "Select at least one Service Entry Sheet attachment before creating the Flowmate request");
    }

    const dynamicDetails = flowmateSesDetails.details && typeof flowmateSesDetails.details === "object"
      ? flowmateSesDetails.details
      : {};
    const normalizedDetails = { ...dynamicDetails };
    for (const field of [
      "invoices",
      "travelExpenses",
      "directForeignTravelEntries",
      "glBreakups",
      "merchantEntityValues",
      "settlementEntries"
    ]) {
      if (typeof normalizedDetails[field] !== "string") {
        continue;
      }
      try {
        normalizedDetails[field] = JSON.parse(normalizedDetails[field]);
      } catch (_error) {
        return req.reject(400, `Service Entry Sheet field ${field} contains invalid JSON`);
      }
      if (!Array.isArray(normalizedDetails[field])) {
        return req.reject(400, `Service Entry Sheet field ${field} must contain a JSON array`);
      }
    }

    const flowmateInput = {
      processType_code: flowmateSesDetails.processType_code,
      subProcessType_code: flowmateSesDetails.subProcessType_code,
      title: String(flowmateSesDetails.title || request.title || "").trim(),
      description: flowmateSesDetails.description || request.description || null,
      requesterUser_ID: request.requester_ID,
      processorTeam_ID: flowmateSesDetails.processorTeam_ID || request.ownerTeam_ID || null,
      processorTeamName: flowmateSesDetails.processorTeamName || request.ownerTeamName || null,
      department: flowmateSesDetails.department || null,
      amount: flowmateSesDetails.amount === "" || flowmateSesDetails.amount === null || flowmateSesDetails.amount === undefined
        ? null
        : Number(flowmateSesDetails.amount),
      role: flowmateSesDetails.role || "Service Entry Sheet",
      priorityConfig_code: flowmateSesDetails.priorityConfig_code || "MEDIUM",
      ...normalizedDetails
    };
    const encodedAttachments = await Promise.all(caAttachments.map(async (attachment) => ({
      filename: attachment.filename,
      mimeType: attachment.mimeType || "application/octet-stream",
      contentBase64: (await readAttachmentContent(attachment.content)).toString("base64")
    })));

    if (!flowmateInput.processType_code || !flowmateInput.subProcessType_code || !flowmateInput.title) {
      return req.reject(400, "Service Entry Sheet process type, subprocess type, and title are required");
    }
    if (!flowmateInput.processorTeam_ID) {
      return req.reject(400, "Select a Flowmate processor team for the Service Entry Sheet request");
    }
    if (encodedAttachments.some((attachment) => !attachment.contentBase64)) {
      return req.reject(400, "One or more Service Entry Sheet attachments have no content");
    }

    try {
      const result = await this.flowmate.send({
        event: "createRequestWithAttachments",
        data: {
          input: JSON.stringify(flowmateInput),
          attachments: JSON.stringify(encodedAttachments)
        }
      });
      await tx.run(UPDATE(this.db.CARequests).set({
        externalObjectId: result?.ID || null,
        externalStatus: `FLOWMATE_SES_CREATED|${result?.referenceNumber || ""}`
      }).where({ ID: request.ID }));
      await this._writeHistory(
        tx,
        request.ID,
        request.currentStep || 0,
        "FLOWMATE_SES_CREATED",
        user,
        request.status_code,
        request.status_code,
        result?.referenceNumber || "Flowmate Service Entry Sheet request created"
      );
      return {
        created: true,
        requestId: result?.ID,
        referenceNumber: result?.referenceNumber,
        attachmentCount: encodedAttachments.length
      };
    } catch (error) {
      cds.log("peer-integration").error("Flowmate Service Entry Sheet creation failed", error);
      return req.reject(502, `Flowmate request could not be created: ${error.message}`);
    }
  };

  /**
   * CA keeps the Flowmate integration payload and attachments on the request
   * while the CA workflow is running. The linked Flowmate request is created
   * only after the CA request reaches COMPLETED. Keeping this trigger on the
   * server prevents a rejected or partially processed CA request from creating
   * a Flowmate task queue entry.
   */
  _triggerFlowmateIntegrationIfRequired = async (req, requestId) => {
    const request = await cds.tx(req).run(
      SELECT.one.from(this.db.CARequests).where({ ID: requestId })
    );
    if (!request || request.status_code !== REQUEST_STATUS.COMPLETED || request.externalObjectId) {
      return null;
    }

    let handler;
    let event;
    if (request.requestType_code === "PURCHASE_ORDER") {
      const purchaseOrder = await cds.tx(req).run(
        SELECT.one.from(this.db.PurchaseOrderDetails).columns("paymentRun").where({ request_ID: request.ID })
      );
      // Payment Run not selected: nothing to hand over, the PO simply completes.
      if (!purchaseOrder?.paymentRun) return null;
      handler = this._createFlowmatePaymentRun;
      event = "createFlowmatePaymentRun";
    } else if (request.requestType_code === "SERVICE_ENTRY_SHEET") {
      const serviceEntrySheet = await cds.tx(req).run(
        SELECT.one.from(this.db.ServiceEntrySheetDetails).columns("flowmateSesRequest").where({ request_ID: request.ID })
      );
      if (!serviceEntrySheet?.flowmateSesRequest) return null;
      handler = this._createFlowmateServiceEntrySheet;
      event = "createFlowmateServiceEntrySheet";
    } else {
      return null;
    }

    // Use the same authenticated user and transaction context, but pass only
    // the action payload expected by the integration handler.
    const integrationReq = Object.create(req);
    integrationReq[INTERNAL_FLOWMATE_HANDOFF] = true;
    integrationReq.event = event;
    integrationReq.data = { requestId };
    integrationReq.reject = (status, message) => req.reject(status, message);
    return handler.call(this, integrationReq);
  };

  _prepareDelegationCreate = async (req) => {
    if (!this._canMaintainDelegations(req)) {
      return req.reject(403, "Only an administrator or supervisor can create delegations");
    }
    const delegation = req.data;
    const currentUser = await this._ensureCurrentUser(req);
    const requestedDelegatorId = delegation.delegator_ID || delegation.delegator?.ID;
    const delegateId = delegation.delegate_ID || delegation.delegate?.ID;
    const delegatorId = requestedDelegatorId || currentUser.ID;

    if (!delegateId) {
      return req.reject(400, "Select a delegate from the user list");
    }

    const users = await this.master.run(
      SELECT.from(this.masterEntities.Users)
        .columns("ID", "isActive")
        .where({ ID: { in: [...new Set([delegatorId, delegateId])] } })
    );
    const activeUserIds = new Set(users.filter((user) => user.isActive !== false).map((user) => user.ID));
    if (!activeUserIds.has(delegatorId)) {
      return req.reject(400, "Selected user on leave was not found or is inactive");
    }
    if (!activeUserIds.has(delegateId)) {
      return req.reject(400, "Selected delegate was not found or is inactive");
    }
    if (!delegation.startDate || !delegation.endDate) {
      return req.reject(400, "User, delegate, start date, and end date are required");
    }
    if (delegatorId === delegateId) {
      return req.reject(400, "A user cannot be assigned as their own delegate");
    }
    if (delegation.startDate > delegation.endDate) {
      return req.reject(400, "End date must be on or after start date");
    }

    delegation.delegator_ID = delegatorId;
    delegation.delegate_ID = delegateId;
    delegation.forwardNotifications ??= true;
    delegation.enabled ??= true;
    delegation.createdOnBehalf = delegatorId !== currentUser.ID;
    delete delegation.delegator;
    delete delegation.delegate;
  };

  _filterDelegations = async (req) => {
    if (!this._canMaintainDelegations(req)) {
      return req.reject(403, "Only an administrator or supervisor can view delegations");
    }
  };

  _authorizeDelegationDelete = async (req) => {
    if (!this._canMaintainDelegations(req)) {
      return req.reject(403, "Only an administrator or supervisor can delete delegations");
    }
  };

  _canMaintainDelegations(req) {
    return Boolean(req.user.is("CAAdmin") || req.user.is("CASupervisor"));
  }

  _roleCapabilities(req) {
    const isAdmin = Boolean(req.user.is("CAAdmin"));
    const isSupervisor = isAdmin || Boolean(req.user.is("CASupervisor"));
    const isValidator = isSupervisor || Boolean(req.user.is("CAProcessor"));
    const isCreator = isAdmin || Boolean(req.user.is("CARequester"));
    const isBusinessUser = isCreator || isValidator;
    return {
      isAdmin,
      isSupervisor,
      isValidator,
      isCreator,
      canCreate: isCreator,
      canViewDrafts: isCreator,
      canValidate: isValidator,
      canProcessAssignedTasks: isBusinessUser,
      canViewAllTasks: isBusinessUser,
      canAddTask: isValidator,
      canViewSentBack: isBusinessUser,
      canViewTerminated: isCreator,
      canAssign: isSupervisor,
      canManageDelegation: isSupervisor,
      canViewAllRequests: isBusinessUser,
      canViewReports: isSupervisor,
      canTerminate: isAdmin,
      canAdminister: isAdmin
    };
  }

  _requireCapability(req, capability, message) {
    if (!this._roleCapabilities(req)[capability]) {
      return req.reject(403, message);
    }
  }

  _requireCreateAccess = (req) => {
    if (req.user.is("system-user") && req.user.is("PORequestCreate")) return;
    return this._requireCapability(req, "canCreate", "Only a creator or administrator can create requests");
  };

  _requireCreator = (req) => this._requireCapability(req, "canCreate", "Only a creator or administrator can perform this action");
  _requireValidator = (req) => this._requireCapability(req, "canValidate", "Only a validator, supervisor, or administrator can process requests and tasks");
  _requireAddTask = (req) => this._requireCapability(req, "canAddTask", "Only a processor, supervisor, or administrator can add tasks");
  _requireSupervisor = (req) => this._requireCapability(req, "canAssign", "Only a supervisor or administrator can assign requests and tasks");
  _requireAdmin = (req) => this._requireCapability(req, "isAdmin", "Only an administrator can perform this action");

  async _activeDelegatorIds(req, delegateUserId) {
    if (!delegateUserId) {
      return [];
    }
    const today = new Date().toISOString().slice(0, 10);
    const delegations = await this.master.run(
      SELECT.from(this.masterEntities.Delegations)
        .columns("delegator_ID")
        .where({
          delegate_ID: delegateUserId,
          enabled: true,
          startDate: { "<=": today },
          endDate: { ">=": today }
        })
    );
    return [...new Set(delegations.map((delegation) => delegation.delegator_ID).filter(Boolean))];
  }

  async _effectiveTaskUserIds(req, userId) {
    return [...new Set([userId, ...(await this._activeDelegatorIds(req, userId))].filter(Boolean))];
  }

  async _canActForUser(req, actingUserId, assignedUserId) {
    if (!actingUserId || !assignedUserId) {
      return false;
    }
    return (await this._effectiveTaskUserIds(req, actingUserId)).includes(assignedUserId);
  }

  _filterMyRequests = async (req) => {
    if (!this._roleCapabilities(req).canCreate) {
      req.query.where({ ID: null });
      return;
    }
    const user = await this._ensureCurrentUser(req);
    const effectiveUserIds = await this._effectiveTaskUserIds(req, user.ID);
    req.query.where(this._myRequestWhere(effectiveUserIds));
  };

  // Where a request is: "pendingWith" is whoever holds its open tasks, by name once someone has
  // claimed or been given one, otherwise the team the task waits in; "pendingStep" is the name of
  // the step it is at (a task with no step shows its own name). A finished request has neither.
  _addPendingInfo = async (result, req) => {
    const rows = (Array.isArray(result) ? result : [result]).filter(Boolean);
    const asked = ["pendingWith", "pendingStep"];
    const columns = req.query?.SELECT?.columns;
    if (!rows.length || (columns && !columns.some((column) => column === "*" || asked.includes(column.ref?.[0])))) {
      return;
    }
    const open = rows.filter((row) => ![REQUEST_STATUS.COMPLETED, REQUEST_STATUS.REJECTED].includes(row.status_code));
    if (!open.length) {
      return;
    }
    const tasks = await SELECT.from(this.db.CATasks)
      .columns("request_ID", "taskName", "assignedName", "assignedTeamName", "stepNo", "stepInstance.stepName as stepName")
      .where({ request_ID: { in: open.map((row) => row.ID) }, status_code: { in: [TASK_STATUS.OPEN, TASK_STATUS.IN_PROGRESS] } })
      .and("(isSuperseded = false or isSuperseded is null)")
      .orderBy("stepNo");
    const holders = new Map();
    const steps = new Map();
    const add = (map, requestId, value) => {
      const list = map.get(requestId) || [];
      if (value && !list.includes(value)) {
        list.push(value);
      }
      map.set(requestId, list);
    };
    for (const task of tasks) {
      add(holders, task.request_ID, task.assignedName || task.assignedTeamName);
      add(steps, task.request_ID, task.stepName || task.taskName);
    }
    for (const row of open) {
      row.pendingWith = (holders.get(row.ID) || []).join(", ") || null;
      row.pendingStep = (steps.get(row.ID) || []).join(", ") || null;
    }
  };

  _filterDrafts = async (req) => {
    if (!this._roleCapabilities(req).canViewDrafts) {
      return req.reject(403, "Only a creator or administrator can view drafts");
    }
    const user = await this._ensureCurrentUser(req);
    // Drafts are personal working copies. Administrative access must not expose
    // another user's incomplete request data.
    req.query.where({ creator_ID: user.ID });
  };

  _filterRequestAttachments = async (req) => {
    // Draft binaries are exposed only through DraftAttachments, where creator
    // ownership is enforced. They must never leak through the normal request endpoint.
    req.query.where({ draft_ID: null });
    await this._filterRequestChildrenByRole(req);
  };

  _filterRequestChildrenByRole = (req) => {
    // Submitted request details are readable across business roles. Mutations are
    // checked separately, and draft attachments remain creator-only.
    if (!this._roleCapabilities(req).canViewAllRequests) {
      req.query.where({ request_ID: null });
    }
  };

  _filterTasksByRole = (req) => {
    // Opening a task is not the same as claiming, assigning, or deciding it.
    if (!this._roleCapabilities(req).canViewAllTasks) {
      req.query.where({ ID: null });
    }
  };

  _taskReadWhere(capabilities, effectiveUserIds, teamIds = []) {
    if (capabilities.canAssign) return null;
    const userList = { list: effectiveUserIds.map((val) => ({ val })) };
    const predicates = [];
    const add = (predicate) => {
      if (predicates.length) predicates.push("or");
      predicates.push(...predicate);
    };

    // A requestor monitors every task belonging to a request they created or currently own.
    if (capabilities.canCreate) {
      add([{ ref: ["request", "requester_ID"] }, "in", userList]);
      add([{ ref: ["request", "owner_ID"] }, "in", userList]);
    }
    // Direct assignment (including an active delegation) always grants task visibility.
    if (capabilities.canProcessAssignedTasks) {
      add([{ ref: ["assignedUser_ID"] }, "in", userList]);
    }
    // Processors monitor work assigned anywhere inside their active teams, including claimed work.
    if (capabilities.canValidate && teamIds.length) {
      add([{ ref: ["assignedTeam_ID"] }, "in", { list: teamIds.map((val) => ({ val })) }]);
    }
    return predicates.length ? [{ xpr: predicates }] : [{ ref: ["ID"] }, "=", { val: null }];
  }

  _withTaskFilters(scope, ...filters) {
    const result = scope ? [...scope] : [];
    filters.filter(Boolean).forEach((filter) => {
      if (result.length) result.push("and");
      result.push(...filter);
    });
    return result;
  }

  _filterRequestsByRole = (req) => {
    if (!this._roleCapabilities(req).canViewAllRequests) {
      req.query.where({ ID: null });
    }
  };

  _filterDraftAttachments = async (req) => {
    if (!this._roleCapabilities(req).canViewDrafts) {
      return req.reject(403, "Only a creator or administrator can view draft attachments");
    }
    const user = await this._ensureCurrentUser(req);
    req.query.where([
      { ref: ["draft", "creator_ID"] }, "=", { val: user.ID }
    ]);
    req.query.where({ request_ID: null });
  };

  async _accessibleDraft(req, tx, draftId, user) {
    if (!draftId) return req.reject(400, "Select a draft");
    const draft = await tx.run(SELECT.one.from(this.db.CARequestDrafts).where({ ID: draftId }));
    if (!draft || draft.creator_ID !== user.ID) {
      return req.reject(404, "Draft not found");
    }
    return draft;
  }

  _saveDraft = async (req) => {
    const tx = cds.tx(req);
    const user = await this._ensureCurrentUser(req);
    const raw = req.data.formData;
    if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > 2_000_000) {
      return req.reject(400, "The draft form must be JSON and no larger than 2 MB");
    }
    let form;
    try { form = JSON.parse(raw); } catch (_error) {
      return req.reject(400, "The draft form contains invalid JSON");
    }
    if (!form || typeof form !== "object" || Array.isArray(form)) {
      return req.reject(400, "The draft form must be a JSON object");
    }
    const values = {
      requestTypeCode: String(form.requestTypeCode || "").slice(0, 40),
      requestVariantCode: String(form.requestVariantCode || "").slice(0, 40),
      title: String(form.title || form.requestVariantCode || form.requestTypeCode || "Untitled draft").slice(0, 255),
      formData: raw
    };
    if (req.data.draftId) {
      const draft = await this._accessibleDraft(req, tx, req.data.draftId, user);
      await tx.run(UPDATE(this.db.CARequestDrafts).set(values).where({ ID: draft.ID }));
      return { ID: draft.ID };
    }
    const ID = cds.utils.uuid();
    await tx.run(INSERT.into(this.db.CARequestDrafts).entries({
      ID, creator_ID: user.ID, creatorName: user.displayName, ...values
    }));
    return { ID };
  };

  _deleteDraft = async (req) => {
    const tx = cds.tx(req);
    const user = await this._ensureCurrentUser(req);
    const draft = await this._accessibleDraft(req, tx, req.data.draftId, user);
    await tx.run(DELETE.from(this.db.CAAttachments).where({ draft_ID: draft.ID }));
    await tx.run(DELETE.from(this.db.CARequestDrafts).where({ ID: draft.ID }));
    return true;
  };

  async _consumeDraft(req, tx, draftId, user) {
    if (!draftId) return;
    const draft = await this._accessibleDraft(req, tx, draftId, user);
    await tx.run(DELETE.from(this.db.CARequestDrafts).where({ ID: draft.ID }));
  }

  async _moveDraftAttachments(req, tx, draftId, requestId, user) {
    if (!draftId) return 0;
    await this._accessibleDraft(req, tx, draftId, user);
    const attachments = await tx.run(
      SELECT.from(this.db.CAAttachments).columns("ID").where({ draft_ID: draftId })
    );
    // Do not pull every BLOB through the Node.js process merely to verify it exists.
    const incomplete = await tx.run(
      SELECT.one.from(this.db.CAAttachments).columns("ID").where({ draft_ID: draftId, content: null })
    );
    if (incomplete) {
      return req.reject(409, "A saved draft attachment has no file content. Remove it and upload the file again");
    }
    if (attachments.length) {
      await tx.run(UPDATE(this.db.CAAttachments)
        .set({ request_ID: requestId, draft_ID: null })
        .where({ draft_ID: draftId }));
    }
    return attachments.length;
  }

  async _assertNoBulkDraftAttachments(req, tx, draftId) {
    if (!draftId) return;
    const attachment = await tx.run(
      SELECT.one.from(this.db.CAAttachments).columns("ID").where({ draft_ID: draftId })
    );
    if (attachment) {
      return req.reject(400, "Saved draft attachments are currently supported only for single-request submission");
    }
  }

  _myRequestWhere(ids, status) {
    const list = { list: ids.map((val) => ({ val })) };
    const where = [{ xpr: [{ ref: ["requester_ID"] }, "in", list, "or", { ref: ["owner_ID"] }, "in", list] }];
    if (status) where.push("and", { ref: ["status_code"] }, "=", { val: status });
    return where;
  }

  _filterMyTasks = async (req) => {
    if (!this._roleCapabilities(req).canProcessAssignedTasks) {
      req.query.where({ ID: null });
      return;
    }
    const user = await this._ensureCurrentUser(req);
    const effectiveUserIds = req.user.is("CAAdmin")
      ? [user.ID]
      : await this._effectiveTaskUserIds(req, user.ID);
    req.query.where({ assignedUser_ID: { in: effectiveUserIds } });
  };

  _filterMyTeamTasks = async (req) => {
    if (!this._roleCapabilities(req).canValidate) {
      req.query.where({ ID: null });
      return;
    }
    if (req.user.is("CAAdmin")) {
      req.query.where({ assignedUser_ID: null });
      return;
    }
    const user = await this._ensureCurrentUser(req);
    const teamIds = await this._teamIdsOf(user);

    if (!teamIds.length) {
      req.query.where({ ID: null });
      return;
    }

    req.query.where({
      assignedTeam_ID: { in: teamIds },
      assignedUser_ID: null
    });
  };

  _getCurrentUser = async (req) => {
    const user = await this._ensureCurrentUser(req);
    const activeDelegatorUserIds = await this._activeDelegatorIds(req, user.ID);
    const capabilities = this._roleCapabilities(req);
    const teamIds = capabilities.canValidate && !capabilities.isAdmin
      ? await this._teamIdsOf(user)
      : [];
    return {
      ID: user.ID,
      displayName: user.displayName,
      email: user.email,
      // The login the server records as createdBy (e.g. on attachments).
      loginId: String(req.user.id || ""),
      ...capabilities,
      canDelegateOnBehalf: capabilities.canManageDelegation,
      canReassign: capabilities.canAssign,
      activeDelegatorUserIds,
      teamIds
    };
  };

  _getDashboardCounts = async (req) => {
    const user = await this._ensureCurrentUser(req);
    const capabilities = this._roleCapabilities(req);
    const { isAdmin, canCreate, canViewDrafts, canValidate, canProcessAssignedTasks } = capabilities;
    const effectiveUserIds = isAdmin ? [user.ID] : await this._effectiveTaskUserIds(req, user.ID);
    const requestedBy = this._myRequestWhere(effectiveUserIds);
    // Only OPEN tasks are waiting on someone. A SENT_BACK task belongs to a step that
    // has been rolled back and is reopened when that step comes around again.
    const openStatus = { status_code: TASK_STATUS.OPEN };
    const teamIds = isAdmin ? [] : await this._teamIdsOf(user);
    // Sent Back, Terminated, Completed, My Tasks and Pending Approval are the user's own work only:
    // no delegators' and, for an administrator, nobody else's. Dashboard.controller.js opens the
    // lists with the same filter (own=true).
    const ownRequests = (status) => this._myRequestWhere([user.ID], status);
    const ownOpenTasks = { assignedUser_ID: user.ID, ...openStatus };

    const [
      allRequests,
      allTasks,
      myRequests,
      myDrafts,
      myOpenTasks,
      sentBackRequests,
      rejectedRequests,
      pendingApproval,
      completedRequests
    ] = await Promise.all([
      capabilities.canViewAllRequests ? this._count(this.db.CARequests, {}) : 0,
      capabilities.canViewAllTasks ? this._count(this.db.CATasks, {}) : 0,
      canCreate ? this._count(this.db.CARequests, requestedBy) : 0,
      canViewDrafts ? this._count(this.db.CARequestDrafts, { creator_ID: user.ID }) : 0,
      canProcessAssignedTasks ? this._count(this.db.CATasks, ownOpenTasks) : 0,
      capabilities.canViewSentBack ? this._count(this.db.CARequests, ownRequests(REQUEST_STATUS.SENT_BACK)) : 0,
      capabilities.canViewTerminated ? this._count(this.db.CARequests, ownRequests(REQUEST_STATUS.REJECTED)) : 0,
      canProcessAssignedTasks ? this._count(this.db.CATasks, { ...ownOpenTasks, isApproval: true }) : 0,
      canCreate ? this._count(this.db.CARequests, ownRequests(REQUEST_STATUS.COMPLETED)) : 0
    ]);

    let myTeamTasks = 0;
    if (!canValidate) {
      myTeamTasks = 0;
    } else if (isAdmin) {
      myTeamTasks = await this._count(this.db.CATasks, { assignedUser_ID: null, ...openStatus });
    } else if (teamIds.length) {
      myTeamTasks = await this._count(this.db.CATasks, {
        assignedTeam_ID: { in: teamIds },
        assignedUser_ID: null,
        ...openStatus
      });
    }

    return {
      allRequests,
      allTasks,
      myRequests,
      myDrafts,
      myOpenTasks,
      myTeamTasks,
      sentBackRequests,
      rejectedRequests,
      pendingApproval,
      completedRequests
    };
  };

  // Purchase Order Lifecycle dashboard (buildPoLifecycle) for a reporting period.
  _getPoLifecycleDashboard = async (req) => JSON.stringify(await this._poLifecycleReport(req.data));

  // The dashboard as a PDF (renderPoLifecyclePdf), with the charts the browser rendered.
  _exportPoLifecycleDashboardPdf = async (req) => {
    let charts;
    try {
      charts = validatedChartSnapshots(req.data.charts);
    } catch (error) {
      return req.reject(error.status || 400, error.message);
    }
    const report = await this._poLifecycleReport(req.data);
    const poTypeName = (report.poTypes.find((type) => type.code === report.poType) || {}).name || report.poType;
    const generatedAt = new Intl.DateTimeFormat("en-GB", {
      timeZone: SLA_TIME_ZONE, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    }).format(new Date());
    const pdf = await renderPoLifecyclePdf(report, charts, { poTypeName, generatedAt });
    return { fileName: pdf.fileName, mimeType: "application/pdf", content: pdf.content.toString("base64") };
  };

  // Reads the period, the period of the same length before it (for the comparison) and the twelve
  // months up to the period's end (for the trend); only the columns the dashboard uses.
  _poLifecycleReport = async ({ periodStart, periodEnd, poType }) => {
    const now = new Date();
    const day = (value) => (value instanceof Date ? value.toISOString() : String(value || "")).slice(0, 10);
    const thisMonth = monthKey(now, SLA_TIME_ZONE);
    let start = day(periodStart);
    let end = day(periodEnd);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
      start = `${thisMonth}-01`;
      end = new Date(Date.parse(`${shiftMonth(thisMonth, 1)}-01T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
    }
    const length = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`) + DAY_MS;
    const trendStart = Date.parse(`${shiftMonth(end.slice(0, 7), -11)}-01T00:00:00Z`);
    // One day early: the day boundaries are applied in the reporting time zone by the builder.
    const windowStart = new Date(Math.min(Date.parse(`${start}T00:00:00Z`) - length, trendStart) - DAY_MS).toISOString();
    const statuses = [REQUEST_STATUS.SUBMITTED, REQUEST_STATUS.IN_PROGRESS, REQUEST_STATUS.SENT_BACK,
      REQUEST_STATUS.COMPLETED, REQUEST_STATUS.REJECTED];
    const requests = await SELECT.from(this.db.CARequests)
      .columns("ID", "referenceNumber", "title", "requestType_code", "requestVariant_code", "status_code",
        "createdAt", "modifiedAt", "submittedAt", "completedAt", "slaDueAt")
      .where({ requestType_code: "PURCHASE_ORDER", status_code: { in: statuses } })
      .and`(submittedAt >= ${windowStart} or (submittedAt is null and createdAt >= ${windowStart}))`;
    const ids = requests.map((row) => row.ID);
    const inChunks = async (query) => {
      const rows = [];
      for (let index = 0; index < ids.length; index += 500) {
        rows.push(...await query(ids.slice(index, index + 500)));
      }
      return rows;
    };
    const [details, steps, stepConfigs, poTypes] = await Promise.all([
      inChunks((chunk) => SELECT.from(this.db.PurchaseOrderDetails)
        .columns("request_ID", "purchaseOrderType_code", "purchaseOrderNumber", "purchasingGroup", "companyCode",
          "contractBased", "division", "vendor_ID", "vendorCode")
        .where({ request_ID: { in: chunk } })),
      inChunks((chunk) => SELECT.from(this.db.RequestStepInstances)
        .columns("ID", "request_ID", "stepNo", "stepName", "slaDays", "slaDueAt", "startedAt", "completedAt")
        .where({ request_ID: { in: chunk } })),
      SELECT.from(this.db.WorkflowStepConfigs).columns("requestVariant_code", "stepNo", "slaDays")
        .where({ requestType_code: "PURCHASE_ORDER" }),
      SELECT.from(this.db.PurchaseOrderTypes).columns("code", "name").where({ isActive: true }).orderBy("sortOrder")
    ]);
    const report = buildPoLifecycle({
      requests, details, steps, stepConfigs, periodStart: start, periodEnd: end, poType: poType || "ALL", now, timeZone: SLA_TIME_ZONE
    });
    // Supplier names for the period's POs; the code stays when the vendor master has no name.
    const vendorIds = [...new Set(report.requests.map((row) => row.vendorId).filter(Boolean))];
    if (vendorIds.length) {
      try {
        const names = new Map();
        for (let index = 0; index < vendorIds.length; index += 500) {
          const vendors = await this.master.run(SELECT.from(this.masterEntities.Vendors)
            .columns("ID", "vendorName").where({ ID: { in: vendorIds.slice(index, index + 500) } }));
          vendors.forEach((row) => names.set(row.ID, row.vendorName));
        }
        report.requests.concat(report.slaFailures).forEach((row) => {
          row.supplier = names.get(row.vendorId) || row.supplier;
        });
      } catch (error) {
        cds.log("reports").warn("Supplier names for the PO Lifecycle dashboard could not be read", error.message);
      }
    }
    // The tasks of the month's requests, for the drill-down behind the KPI tiles.
    const monthIds = report.requests.map((row) => row.requestId);
    const references = new Map(report.requests.map((row) => [row.requestId, row.reference]));
    const tasks = [];
    for (let index = 0; index < monthIds.length; index += 500) {
      tasks.push(...await SELECT.from(this.db.CATasks)
        .columns("ID", "referenceNumber", "request_ID", "stepInstance_ID", "stepNo", "taskName", "assignedName", "assignedTeamName",
          "status_code", "slaDueAt", "slaBreached", "completedAt", "completedByName")
        .where({ request_ID: { in: monthIds.slice(index, index + 500) }, isSuperseded: { "!=": true } }));
    }
    // The workflow step each task belongs to: its own name can differ from the step's.
    const stepNames = new Map(steps.map((step) => [step.ID, step.stepName]));
    report.tasks = tasks.map((task) => Object.assign(task, {
      requestReference: references.get(task.request_ID) || "",
      stepName: stepNames.get(task.stepInstance_ID) || task.taskName
    }))
      .sort((left, right) => left.requestReference.localeCompare(right.requestReference) || left.stepNo - right.stepNo);
    report.poTypes = [{ code: "ALL", name: "All PO types" }].concat(poTypes);
    report.timeZone = SLA_TIME_ZONE;
    return report;
  };

  _getSpendAnalysisDashboard = async (req) => JSON.stringify(await this._spendAnalysisReport(req.data));

  // The Spend Analysis dashboard as a PDF (renderSpendAnalysisPdf), with the charts the browser rendered.
  _exportSpendAnalysisDashboardPdf = async (req) => {
    let charts;
    try {
      charts = validatedChartSnapshots(req.data.charts, SPEND_PDF_CHART_KEYS);
    } catch (error) {
      return req.reject(error.status || 400, error.message);
    }
    const report = await this._spendAnalysisReport(req.data);
    const poTypeName = (report.poTypes.find((type) => type.code === report.poType) || {}).name || report.poType;
    const generatedAt = new Intl.DateTimeFormat("en-GB", {
      timeZone: SLA_TIME_ZONE, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    }).format(new Date());
    const pdf = await renderSpendAnalysisPdf(report, charts, { poTypeName, generatedAt });
    return { fileName: pdf.fileName, mimeType: "application/pdf", content: pdf.content.toString("base64") };
  };

  // Spend Analysis dashboard (buildSpendAnalysis): the period's approved POs and the same period a
  // year earlier, with supplier names and the inactive suppliers of the master.
  _spendAnalysisReport = async ({ periodStart, periodEnd, poType }) => {
    const now = new Date();
    const day = (value) => (value instanceof Date ? value.toISOString() : String(value || "")).slice(0, 10);
    const thisMonth = monthKey(now, SLA_TIME_ZONE);
    let start = day(periodStart);
    let end = day(periodEnd);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
      start = `${thisMonth}-01`;
      end = shiftDay(`${shiftMonth(thisMonth, 1)}-01`, -1);
    }
    // One day either side: the day boundaries are applied in the reporting time zone by the builder.
    const lastYearFrom = new Date(Date.parse(`${shiftYear(start)}T00:00:00Z`) - DAY_MS).toISOString();
    const lastYearTo = new Date(Date.parse(`${shiftYear(end)}T00:00:00Z`) + 2 * DAY_MS).toISOString();
    const from = new Date(Date.parse(`${start}T00:00:00Z`) - DAY_MS).toISOString();
    const to = new Date(Date.parse(`${end}T00:00:00Z`) + 2 * DAY_MS).toISOString();
    const requests = await SELECT.from(this.db.CARequests)
      .columns("ID", "referenceNumber", "requestType_code", "status_code", "completedAt")
      .where({ requestType_code: "PURCHASE_ORDER", status_code: REQUEST_STATUS.COMPLETED })
      .and`((completedAt >= ${from} and completedAt < ${to}) or (completedAt >= ${lastYearFrom} and completedAt < ${lastYearTo}))`;
    const ids = requests.map((row) => row.ID);
    const details = [];
    for (let index = 0; index < ids.length; index += 500) {
      details.push(...await SELECT.from(this.db.PurchaseOrderDetails)
        .columns("request_ID", "purchaseOrderType_code", "purchaseOrderNumber", "vendor_ID", "vendorCode", "currency_code",
          "poValueWithTaxes", "totalValue", "procurementCategory_code", "division")
        .where({ request_ID: { in: ids.slice(index, index + 500) } }));
    }
    const vendorNames = new Map();
    let inactiveSuppliers = 0;
    let inactiveVendors = [];
    try {
      const vendorIds = [...new Set(details.map((row) => row.vendor_ID).filter(Boolean))];
      for (let index = 0; index < vendorIds.length; index += 500) {
        const vendors = await this.master.run(SELECT.from(this.masterEntities.Vendors)
          .columns("ID", "vendorName").where({ ID: { in: vendorIds.slice(index, index + 500) } }));
        vendors.forEach((row) => vendorNames.set(row.ID, row.vendorName));
      }
      // The tile counts every inactive vendor; its drill-down lists the first 500 by name.
      const inactiveQuery = SELECT.from(this.masterEntities.Vendors).columns("ID", "vendorCode", "vendorName")
        .where({ isActive: false }).orderBy("vendorName").limit(500);
      inactiveQuery.SELECT.count = true;
      const inactive = await this.master.run(inactiveQuery);
      inactiveVendors = Array.from(inactive || []);
      inactiveSuppliers = Number(inactive && inactive.$count) || inactiveVendors.length;
    } catch (error) {
      cds.log("reports").warn("Suppliers for the Spend Analysis dashboard could not be read", error.message);
    }
    const poTypes = await SELECT.from(this.db.PurchaseOrderTypes).columns("code", "name").where({ isActive: true }).orderBy("sortOrder");
    const report = buildSpendAnalysis({
      requests, details, vendorNames, inactiveSuppliers, inactiveVendors, periodStart: start, periodEnd: end, poType: poType || "ALL", now, timeZone: SLA_TIME_ZONE
    });
    report.poTypes = [{ code: "ALL", name: "All PO types" }].concat(poTypes);
    return report;
  };

  _getReportingDashboard = async (req) => {
    const now = new Date();
    const requestedStart = reportDate(req.data.periodStart);
    const requestedEnd = reportDate(req.data.periodEnd);
    const start = requestedStart || new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    start.setUTCHours(0, 0, 0, 0);
    const end = requestedEnd || new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    end.setUTCHours(23, 59, 59, 999);
    const poTypeFilter = String(req.data.poType || "ALL").toUpperCase();

    // Keep the read set deliberately narrow. Detail JSON and attachments are not part of a
    // report and should never be transferred while a dashboard is loading.
    const [requests, purchaseOrders, serviceSheets, requestTypes, variants] = await Promise.all([
      SELECT.from(this.db.CARequests).columns(
        "ID", "referenceNumber", "title", "requestType_code", "requestVariant_code",
        "status_code", "createdAt", "modifiedAt", "submittedAt", "completedAt", "slaDueAt",
        "currentStep"
      ),
      SELECT.from(this.db.PurchaseOrderDetails).columns(
        "ID", "request_ID", "purchaseOrderType_code", "procurementCategory_code", "division",
        "vendorCode", "companyCode", "purchasingGroup", "purchasingOrganization_ID",
        "currency_code", "totalValue", "procurementValue", "poValueWithTaxes", "purchaseOrderNumber"
      ),
      SELECT.from(this.db.ServiceEntrySheetDetails).columns(
        "ID", "request_ID", "transactionType", "sourceMode", "currency_code", "totalValue",
        "division", "sesNumber", "purchaseOrderNo"
      ),
      SELECT.from(this.db.RequestTypes).columns("code", "name"),
      SELECT.from(this.db.RequestVariants).columns("code", "name")
    ]);

    const requestTypeNames = new Map((requestTypes || []).map((row) => [row.code, row.name]));
    const variantNames = new Map((variants || []).map((row) => [row.code, row.name]));
    const poByRequest = new Map((purchaseOrders || []).map((row) => [row.request_ID, row]));
    const sesByRequest = new Map((serviceSheets || []).map((row) => [row.request_ID, row]));
    const allRows = (requests || []).filter((row) => reportInRange(row.submittedAt || row.createdAt, start, end));
    const previousStart = new Date(start);
    previousStart.setUTCFullYear(previousStart.getUTCFullYear() - 1);
    const previousEnd = new Date(end);
    previousEnd.setUTCFullYear(previousEnd.getUTCFullYear() - 1);
    const previousRows = (requests || []).filter((row) => reportInRange(row.submittedAt || row.createdAt, previousStart, previousEnd));

    const statusLabel = (status) => ({
      DRAFT: "Draft",
      SUBMITTED: "Submitted",
      IN_PROGRESS: "In Progress",
      SENT_BACK: "Sent Back",
      COMPLETED: "Completed",
      REJECTED: "Rejected"
    }[status] || status || "Unknown");

    const lifecycleFor = (rows, detailMap, typeCode) => {
      const enriched = rows.filter((row) => row.requestType_code === typeCode).map((row) => ({
        row,
        detail: detailMap.get(row.ID) || {},
        sla: reportSlaState(row, detailMap.get(row.ID) || {}, typeCode)
      }));
      const statusMap = new Map();
      const typeMap = new Map();
      const monthMap = new Map();
      const divisionMap = new Map();
      const failures = [];
      enriched.forEach(({ row, detail, sla }) => {
        const label = statusLabel(row.status_code);
        statusMap.set(label, (statusMap.get(label) || 0) + 1);
        const type = detail.purchaseOrderType_code || detail.transactionType || "Unclassified";
        const typeSummary = typeMap.get(type) || {
          label: type, received: 0, completed: 0, rejected: 0, inProgress: 0, withinSla: 0, breached: 0
        };
        typeSummary.received += 1;
        if (row.status_code === REQUEST_STATUS.COMPLETED) typeSummary.completed += 1;
        else if (row.status_code === REQUEST_STATUS.REJECTED) typeSummary.rejected += 1;
        else typeSummary.inProgress += 1;
        if (sla.breached) typeSummary.breached += 1;
        else typeSummary.withinSla += 1;
        typeMap.set(type, typeSummary);
        const division = detail.division || "Unassigned";
        const divisionSummary = divisionMap.get(division) || { label: division, received: 0, withinSla: 0, breached: 0 };
        divisionSummary.received += 1;
        if (sla.breached) divisionSummary.breached += 1;
        else divisionSummary.withinSla += 1;
        divisionMap.set(division, divisionSummary);
        if (sla.breached) failures.push({
          requestId: row.referenceNumber || row.ID,
          supplier: detail.vendorCode || "—",
          status: statusLabel(row.status_code),
          durationDays: sla.durationDays,
          breachDays: Math.max(0, Math.round((sla.durationDays - sla.targetDays) * 10) / 10),
          reason: row.status_code === REQUEST_STATUS.REJECTED
            ? "Rejected after the configured SLA"
            : row.status_code === REQUEST_STATUS.COMPLETED
              ? "Completed after the configured SLA"
              : "Open past the configured SLA"
        });
        const month = reportMonthKey(row.submittedAt || row.createdAt);
        if (month) {
          const current = monthMap.get(month) || { month, received: 0, completed: 0, rejected: 0, withinSla: 0, breached: 0 };
          current.received += 1;
          if (row.status_code === REQUEST_STATUS.COMPLETED) current.completed += 1;
          if (row.status_code === REQUEST_STATUS.REJECTED) current.rejected += 1;
          if (sla.breached) current.breached += 1;
          else current.withinSla += 1;
          monthMap.set(month, current);
        }
      });
      const completed = reportCount(enriched, ({ row }) => row.status_code === REQUEST_STATUS.COMPLETED);
      const rejected = reportCount(enriched, ({ row }) => row.status_code === REQUEST_STATUS.REJECTED);
      const inProgress = enriched.length - completed - rejected;
      const breached = reportCount(enriched, ({ sla }) => sla.breached);
      return {
        totalReceived: enriched.length,
        completed,
        rejected,
        inProgress,
        withinSla: enriched.length - breached,
        slaBreached: breached,
        slaCompliancePercent: reportPercent(enriched.length - breached, enriched.length),
        statusBreakdown: Array.from(statusMap.entries()).map(([label, count]) => ({ label, count })),
        typeBreakdown: Array.from(typeMap.values()),
        divisionBreakdown: Array.from(divisionMap.values()),
        slaFailures: failures.sort((a, b) => b.breachDays - a.breachDays).slice(0, 100),
        monthlySummary: Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month)),
        configuredSlaDays: typeCode === "PURCHASE_ORDER"
          ? { GENERAL: 2, DNS: 5, FTK: 5 }
          : { GENERAL: 5, DNS: 5 }
      };
    };

    const poRows = allRows.filter((row) => row.requestType_code === "PURCHASE_ORDER"
      && (poTypeFilter === "ALL" || poByRequest.get(row.ID)?.purchaseOrderType_code === poTypeFilter));
    const previousPoRows = previousRows.filter((row) => row.requestType_code === "PURCHASE_ORDER"
      && (poTypeFilter === "ALL" || poByRequest.get(row.ID)?.purchaseOrderType_code === poTypeFilter));
    const spendFor = (row) => {
      const detail = poByRequest.get(row.ID) || {};
      return reportNumber(detail.procurementValue ?? detail.totalValue);
    };
    const currentSpend = poRows.reduce((sum, row) => sum + spendFor(row), 0);
    const previousSpend = previousPoRows.reduce((sum, row) => sum + spendFor(row), 0);
    const supplierSpend = new Map();
    const previousSupplierSpend = new Map();
    const categorySpend = new Map();
    const monthlySpend = new Map();
    const supplierCurrencies = new Map();
    poRows.forEach((row) => {
      const detail = poByRequest.get(row.ID) || {};
      const supplier = detail.vendorCode || "Unassigned supplier";
      const amount = spendFor(row);
      supplierSpend.set(supplier, (supplierSpend.get(supplier) || 0) + amount);
      supplierCurrencies.set(supplier, detail.currency_code || "");
      const category = String(detail.procurementCategory_code || "").toUpperCase().startsWith("CAPEX") ? "Capex" : "Opex";
      categorySpend.set(category, (categorySpend.get(category) || 0) + amount);
      const month = reportMonthKey(row.submittedAt || row.createdAt);
      if (month) monthlySpend.set(month, (monthlySpend.get(month) || 0) + amount);
    });
    previousPoRows.forEach((row) => {
      const detail = poByRequest.get(row.ID) || {};
      const supplier = detail.vendorCode || "Unassigned supplier";
      previousSupplierSpend.set(supplier, (previousSupplierSpend.get(supplier) || 0) + spendFor(row));
    });
    const rankedSuppliers = reportSortedRows(supplierSpend).map((entry) => ({
      supplier: entry.key,
      spend: entry.value,
      currency: supplierCurrencies.get(entry.key) || "",
      sharePercent: reportPercent(entry.value, currentSpend)
    }));
    const supplierYoY = rankedSuppliers.slice(0, 10).map((entry) => {
      const previous = previousSupplierSpend.get(entry.supplier) || 0;
      return {
        supplier: entry.supplier,
        currentSpend: entry.spend,
        previousSpend: Math.round(previous * 100) / 100,
        variance: Math.round((entry.spend - previous) * 100) / 100,
        variancePercent: reportPercent(entry.spend - previous, previous)
      };
    });
    const poLifecycle = lifecycleFor(poRows, poByRequest, "PURCHASE_ORDER");
    const sesLifecycle = lifecycleFor(allRows, sesByRequest, "SERVICE_ENTRY_SHEET");
    const procurementViewMap = new Map();
    poRows.forEach((row) => {
      const detail = poByRequest.get(row.ID) || {};
      const key = [detail.purchasingGroup || "Unassigned", detail.companyCode || "Unassigned", detail.contractBased ? "Contracted" : "Non-contracted"];
      const mapKey = key.join("|");
      const current = procurementViewMap.get(mapKey) || {
        purchasingGroup: key[0], companyCode: key[1], contractStatus: key[2], poType: detail.purchaseOrderType_code || "Unclassified",
        requests: 0, spend: 0
      };
      current.requests += 1;
      current.spend += spendFor(row);
      procurementViewMap.set(mapKey, current);
    });

    const scmFlows = REPORTING_REQUEST_TYPES.map((typeCode) => {
      const flowRows = allRows.filter((row) => row.requestType_code === typeCode);
      const breached = reportCount(flowRows, (row) => reportSlaState(row, {}, typeCode).breached);
      return {
        code: typeCode,
        label: REPORTING_TYPE_NAMES[typeCode] || requestTypeNames.get(typeCode) || typeCode,
        totalReceived: flowRows.length,
        completed: reportCount(flowRows, (row) => row.status_code === REQUEST_STATUS.COMPLETED),
        rejected: reportCount(flowRows, (row) => row.status_code === REQUEST_STATUS.REJECTED),
        inProgress: reportCount(flowRows, (row) => ![REQUEST_STATUS.COMPLETED, REQUEST_STATUS.REJECTED].includes(row.status_code)),
        withinSla: flowRows.length - breached,
        slaBreached: breached
      };
    });

    const recentTransactions = poRows
      .slice()
      .sort((a, b) => String(b.submittedAt || b.createdAt).localeCompare(String(a.submittedAt || a.createdAt)))
      .slice(0, 100)
      .map((row) => {
        const detail = poByRequest.get(row.ID) || {};
        return {
          requestId: row.referenceNumber || row.ID,
          requestDate: reportDateKey(row.submittedAt || row.createdAt),
          supplier: detail.vendorCode || "Unassigned supplier",
          poNumber: detail.purchaseOrderNumber || "—",
          amount: spendFor(row),
          currency: detail.currency_code || "—",
          purchasingGroup: detail.purchasingGroup || "—",
          division: detail.division || "—",
          category: String(detail.procurementCategory_code || "").toUpperCase().startsWith("CAPEX") ? "Capex" : "Opex",
          status: statusLabel(row.status_code),
          variant: variantNames.get(row.requestVariant_code) || row.requestVariant_code || "—"
        };
      });

    const sourceToPay = poRows.slice(0, 100).map((row) => {
      const po = poByRequest.get(row.ID) || {};
      const ses = sesByRequest.get(row.ID) || {};
      return {
        vendor: po.vendorCode || "—",
        sourcingEventDate: null,
        sourcingEventNumber: null,
        awardValue: null,
        currency: po.currency_code || "—",
        poNumber: po.purchaseOrderNumber || "—",
        poRaisedValue: spendFor(row),
        sesNumber: ses.sesNumber || "—",
        sesValue: reportNumber(ses.totalValue) || null,
        invoiceNumber: null,
        invoicedValue: null,
        paidValue: null
      };
    });

    return JSON.stringify({
      period: { start: reportDateKey(start), end: reportDateKey(end), poType: poTypeFilter },
      summary: {
        totalRequests: allRows.length,
        completed: reportCount(allRows, (row) => row.status_code === REQUEST_STATUS.COMPLETED),
        rejected: reportCount(allRows, (row) => row.status_code === REQUEST_STATUS.REJECTED),
        inProgress: reportCount(allRows, (row) => ![REQUEST_STATUS.COMPLETED, REQUEST_STATUS.REJECTED].includes(row.status_code)),
        slaBreached: reportCount(allRows, (row) => reportSlaState(row, poByRequest.get(row.ID) || sesByRequest.get(row.ID) || {}, row.requestType_code).breached)
      },
      poSpend: {
        totalSpend: Math.round(currentSpend * 100) / 100,
        previousYearSpend: Math.round(previousSpend * 100) / 100,
        yoyVariance: Math.round((currentSpend - previousSpend) * 100) / 100,
        yoyVariancePercent: reportPercent(currentSpend - previousSpend, previousSpend),
        activeSuppliers: new Set(poRows.map((row) => poByRequest.get(row.ID)?.vendorCode).filter(Boolean)).size,
        reportingCurrency: "Source currencies",
        conversionNote: "Spend is shown in the source currency. A reporting-currency rate table is required for a cross-currency total.",
        topSuppliers: rankedSuppliers.slice(0, 10),
        supplierYoY,
        mappingNote: "Business Unit and CXO require a maintained Purchasing Group mapping table; CA currently stores the purchasing group but not that mapping.",
        categorySplit: Array.from(categorySpend.entries()).map(([label, value]) => ({ label, value: Math.round(value * 100) / 100, sharePercent: reportPercent(value, currentSpend) })),
        monthlySpend: Array.from(monthlySpend.entries()).map(([month, value]) => ({ month, value: Math.round(value * 100) / 100 })).sort((a, b) => a.month.localeCompare(b.month))
      },
      poLifecycle,
      procurementView: Array.from(procurementViewMap.values()).sort((a, b) => b.requests - a.requests),
      sesLifecycle,
      scmFlows,
      recentTransactions,
      sourceToPay,
      sourceToPayLimitations: [
        "Sourcing event, award, invoice and payment fields are not stored in Flowmate CA.",
        "These columns remain blank until an S/4HANA, Ariba or I2P integration supplies them."
      ]
    });
  };

  _createRequest = async (req) => {
    const input = req.data.input || {};
    const tx = cds.tx(req);
    const integration = resolveTechnicalCreator(req);
    const user = integration
      ? await this._getPORequester(req, integration.userId)
      : await this._ensureCurrentUser(req, tx);
    if (integration && input.draftId) {
      return req.reject(403, "Technical clients cannot submit browser drafts");
    }
    if (input.draftId) {
      await this._accessibleDraft(req, tx, input.draftId, user);
    }
    if (!integration && input.requesterUser_ID
      && String(input.requesterUser_ID).toLowerCase() !== String(user.ID).toLowerCase()) {
      return req.reject(403, "Browser requests must use the signed-in user as requester");
    }
    const requestType = await SELECT.one.from(this.db.RequestTypes)
      .where({ code: input.requestTypeCode, isActive: true });

    if (!requestType) {
      return req.reject(400, "Select a valid request type");
    }

    let requestVariant = null;
    if (input.requestVariantCode) {
      requestVariant = await SELECT.one.from(this.db.RequestVariants).where({
        code: input.requestVariantCode,
        requestType_code: requestType.code,
        isActive: true
      });
      if (!requestVariant) {
        return req.reject(400, "The selected request variant does not belong to this request type");
      }
    }

    let processorTeam = null;
    if (input.processorTeamCode) {
      // The form's "Requester Team": a team from the Requester Team master.
      processorTeam = await this.master.run(SELECT.one.from(this.masterEntities.RequesterTeams).where({
        teamCode: input.processorTeamCode,
        isActive: true
      }));
      if (!processorTeam) {
        return req.reject(400, "Select a valid requester team");
      }
    }


    const requestId = await this._insertOneRequest(req, tx, user, {
      requestType,
      requestVariant,
      processorTeam,
      input,
      integration
    });

    await this._consumeDraft(req, tx, input.draftId, user);

    return tx.run(SELECT.one.from(this.db.CARequests).where({ ID: requestId }));
  };

  async _insertOneRequest(req, tx, user, {
    requestType, requestVariant, processorTeam, input, integration,
    requesterAdminApprovalAllowed: inheritedAdminApproval
  }) {
    const requestId = cds.utils.uuid();
    // The technical API client also has CAAdmin authority; only a human admin gets this exception.
    // An automatically created SES successor inherits the trusted decision from its PO request.
    const requesterAdminApprovalAllowed = inheritedAdminApproval === true
      || (!integration && this._isHumanAdmin(req));
    const attachmentManifest = normalizeAttachmentManifest(req, input.attachmentManifest, integration);
    const waitsForAttachments = attachmentManifest.length > 0;
    let details = this._parseDetails(req, input.details);
    if (details.paymentRun && requestType.code !== "PURCHASE_ORDER") {
      return req.reject(400, "Payment Run is only supported for purchase order requests");
    }
    if (details.paymentRun) {
      if (!details.paymentRunDetails) {
        return req.reject(400, "Payment Run details are required when Payment Run is selected");
      }
      let paymentRunDetails;
      try {
        paymentRunDetails = typeof details.paymentRunDetails === "string"
          ? JSON.parse(details.paymentRunDetails)
          : details.paymentRunDetails;
      } catch (_error) {
        return req.reject(400, "Payment Run details contain invalid JSON");
      }
      if (!paymentRunDetails || typeof paymentRunDetails !== "object") {
        return req.reject(400, "Payment Run details must be a valid object");
      }
      for (const field of ["processTypeName", "subProcessTypeName", "title"]) {
        if (!String(paymentRunDetails[field] || "").trim()) {
          return req.reject(400, `Payment Run ${field} is required`);
        }
      }
    }
    if (details.flowmateSesRequest && requestType.code !== "SERVICE_ENTRY_SHEET") {
      return req.reject(400, "Flowmate Service Entry Sheet integration is only supported for service entry sheet requests");
    }
    if (details.flowmateSesRequest) {
      if (!details.flowmateSesRequestDetails) {
        return req.reject(400, "Flowmate Service Entry Sheet details are required when the integration is selected");
      }
      let flowmateSesDetails;
      try {
        flowmateSesDetails = typeof details.flowmateSesRequestDetails === "string"
          ? JSON.parse(details.flowmateSesRequestDetails)
          : details.flowmateSesRequestDetails;
      } catch (_error) {
        return req.reject(400, "Flowmate Service Entry Sheet details contain invalid JSON");
      }
      if (!flowmateSesDetails || typeof flowmateSesDetails !== "object") {
        return req.reject(400, "Flowmate Service Entry Sheet details must be a valid object");
      }
      for (const field of ["processTypeName", "subProcessTypeName", "title"]) {
        if (!String(flowmateSesDetails[field] || "").trim()) {
          return req.reject(400, `Flowmate Service Entry Sheet ${field} is required`);
        }
      }
    }
    if (integration) assertTechnicalDetails(req, details);
    if (requestType.code === "PURCHASE_ORDER") {
      details = withVariantProcurementCategory(details, requestVariant?.code);
    }
    if (requestType.code === "SERVICE_ENTRY_SHEET") {
      details = withoutMultipleLineTaxFields(details);
    }
    if (requestType.code === "SERVICE_ENTRY_SHEET" && sesDateProblem(details)) {
      return req.reject(400, sesDateProblem(details));
    }
    this._assertRequesterNotApprover(req, user.ID, details, requesterAdminApprovalAllowed);
    // A PO's SES successor is created when the PO completes; its dates are checked now.
    if (requestType.code === "PURCHASE_ORDER" && details.sesRequired && details.sesDraft) {
      const draftProblem = sesDateProblem(typeof details.sesDraft === "string" ? this._parseDetails(req, details.sesDraft) : details.sesDraft);
      if (draftProblem) {
        return req.reject(400, `SES Successor: ${draftProblem}`);
      }
      this._assertRequesterNotApprover(req, user.ID,
        typeof details.sesDraft === "string" ? this._parseDetails(req, details.sesDraft) : details.sesDraft,
        requesterAdminApprovalAllowed);
    }
    await this._assertNoDuplicateMaterialDescription(req, requestType.code, details);
    this._assertEmailLimits(req, requestType.code, details);
    await this._applyProjectCode(req, requestType.code, requestVariant?.code, details);
    this._applyReservationMaterialType(requestType.code, requestVariant?.code, details);

    // One serial per request type and year names both: title POC-26-0001, Request ID CA-POC-26-000001.
    const serial = await this._nextRequestSerial(tx, requestType);
    let title = this._formatRequestTitle(requestType, serial.year, serial.number);
    // A Purchase Order's title: "POC-26-0001 - <PO Header Text> - <Requester Name>".
    if (requestType.code === "PURCHASE_ORDER") {
      title = [title, String(details.poHeaderText || "").replace(/\s+/g, " ").trim(), user.displayName]
        .filter(Boolean).join(" - ").slice(0, 255);
    }
    const referenceNumber = this._formatRequestReference(requestType, serial.year, serial.number);
    await tx.run(INSERT.into(this.db.CARequests).entries({
      ID: requestId,
      referenceNumber,
      requestType_code: requestType.code,
      requestVariant_code: requestVariant?.code || null,
      title,
      description: input.description,
      requester_ID: user.ID,
      requesterName: user.displayName,
      requesterEmail: user.email,
      requesterAdminApprovalAllowed,
      owner_ID: user.ID,
      ownerTeam_ID: processorTeam?.ID || null,
      ownerTeamName: processorTeam?.name || null,
      status_code: waitsForAttachments ? REQUEST_STATUS.UPLOAD_PENDING : REQUEST_STATUS.DRAFT,
      priority_code: input.priorityCode || "MEDIUM",
      predecessor_ID: input.predecessorId || null,
      currentStep: 0,
      attachmentManifest: waitsForAttachments ? JSON.stringify(attachmentManifest) : null,
      attachmentUploadStatus: waitsForAttachments ? "PENDING" : null,
      integrationClientId: waitsForAttachments ? integration.clientId : null
    }));

    await this._insertDetails(tx, requestType.code, requestId, details);
    await this._recordVersion(tx, requestId, requestType.code, user);
    // Browser draft attachments already contain their binaries. Reparent them before
    // workflow creation so the submitted request is complete from its first task onward.
    await this._moveDraftAttachments(req, tx, input.draftId, requestId, user);
    const creationRemarks = integration ? JSON.stringify({
      source: "TECHNICAL_API",
      clientId: integration.clientId,
      requesterUserId: user.ID,
      ...(waitsForAttachments ? { expectedAttachmentCount: attachmentManifest.length } : {})
    }) : undefined;
    if (waitsForAttachments) {
      await this._writeHistory(tx, requestId, 0, "REQUEST_CREATED", user, null, REQUEST_STATUS.UPLOAD_PENDING, creationRemarks);
      return requestId;
    }
    await this._initializeWorkflow(tx, requestId, requestType.code, requestVariant?.code, details, user, req);
    await this._writeHistory(tx, requestId, 0, "REQUEST_CREATED", user, null, REQUEST_STATUS.SUBMITTED, creationRemarks);
    return requestId;
  }

  async uploadTechnicalPOAttachments({ requestId, files, user }) {
    const clientId = authenticatedTechnicalClient(user);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId || "")) {
      throw Object.assign(new Error("requestId must be a valid UUID"), { status: 400 });
    }
    return cds.db.run(async (tx) => {
      const request = await tx.run(SELECT.one.from(this.db.CARequests).where({ ID: requestId }));
      if (!request) throw Object.assign(new Error("Request not found"), { status: 404 });
      if (request.requestType_code !== "PURCHASE_ORDER" || !request.attachmentManifest) {
        throw Object.assign(new Error("This request is not awaiting a technical PO attachment upload"), { status: 409 });
      }
      if (request.integrationClientId !== clientId) {
        throw Object.assign(new Error("Only the API client that created this request may upload its declared attachments"), { status: 403 });
      }
      let manifest;
      try {
        manifest = JSON.parse(request.attachmentManifest);
      } catch (_error) {
        throw Object.assign(new Error("The stored attachment manifest is invalid; contact support"), { status: 500 });
      }
      this._assertManifestUpload(manifest, files);

      if (request.attachmentUploadStatus === "COMPLETE") {
        const existing = await tx.run(SELECT.from(this.db.CAAttachments).where({ request_ID: requestId }));
        this._assertCompletedUploadMatches(manifest, files, existing);
        return this._attachmentUploadResult(request, manifest.length, true);
      }
      if (request.status_code !== REQUEST_STATUS.UPLOAD_PENDING || request.attachmentUploadStatus !== "PENDING") {
        throw Object.assign(new Error("The attachment upload is already in progress or the request is no longer upload-pending"), { status: 409 });
      }
      const claimed = await tx.run(UPDATE(this.db.CARequests).set({ attachmentUploadStatus: "UPLOADING" }).where({
        ID: requestId,
        status_code: REQUEST_STATUS.UPLOAD_PENDING,
        attachmentUploadStatus: "PENDING"
      }));
      if (!claimed) throw Object.assign(new Error("Another attachment upload is already processing this request"), { status: 409 });

      for (const file of files) {
        const declaration = manifest.find((entry) => entry.clientFileId === file.clientFileId);
        await tx.run(INSERT.into(this.db.CAAttachments).entries({
          ID: cds.utils.uuid(),
          request_ID: requestId,
          filename: declaration.filename,
          mimeType: declaration.mimeType,
          content: await fs.readFile(file.path),
          category: declaration.category,
          uploadedByName: request.requesterName,
          clientFileId: declaration.clientFileId,
          contentChecksum: file.checksum,
          source: "TECHNICAL_API"
        }));
      }

      const completedAt = new Date().toISOString();
      await tx.run(UPDATE(this.db.CARequests).set({
        attachmentUploadStatus: "COMPLETE",
        attachmentUploadCompletedAt: completedAt
      }).where({ ID: requestId }));
      const details = await this._loadDetails(tx, request.requestType_code, requestId);
      const actor = { ID: request.requester_ID, displayName: request.requesterName, email: request.requesterEmail };
      const workflowReq = { data: {}, user, reject(status, message) { throw Object.assign(new Error(message), { status }); } };
      await this._initializeWorkflow(tx, requestId, request.requestType_code, request.requestVariant_code, details, actor, workflowReq);
      const finalRequest = await tx.run(SELECT.one.from(this.db.CARequests).where({ ID: requestId }));
      await this._writeHistory(tx, requestId, finalRequest.currentStep || 0, "ATTACHMENTS_UPLOADED", actor,
        REQUEST_STATUS.UPLOAD_PENDING, finalRequest.status_code,
        JSON.stringify({ source: "TECHNICAL_API", clientId, attachmentCount: manifest.length }));
      return this._attachmentUploadResult(finalRequest, manifest.length, false);
    });
  }

  _assertManifestUpload(manifest, files) {
    if (!Array.isArray(files)) throw Object.assign(new Error("No multipart files were received"), { status: 400 });
    const received = new Map();
    for (const file of files) {
      if (received.has(file.clientFileId)) throw Object.assign(new Error(`Duplicate multipart field '${file.clientFileId}'`), { status: 400 });
      received.set(file.clientFileId, file);
    }
    const declared = new Set(manifest.map((entry) => entry.clientFileId));
    const extra = [...received.keys()].filter((id) => !declared.has(id));
    const missing = [...declared].filter((id) => !received.has(id));
    if (extra.length) throw Object.assign(new Error(`Undeclared attachment field(s): ${extra.join(", ")}`), { status: 400 });
    if (missing.length) throw Object.assign(new Error(`Missing attachment field(s): ${missing.join(", ")}`), { status: 400 });
    for (const entry of manifest) {
      const file = received.get(entry.clientFileId);
      if (file.filename !== entry.filename) throw Object.assign(new Error(`Filename does not match the manifest for '${entry.clientFileId}'`), { status: 400 });
      if (String(file.mimeType).toLowerCase() !== entry.mimeType) throw Object.assign(new Error(`MIME type does not match the manifest for '${entry.clientFileId}'`), { status: 400 });
      if (file.truncated) throw Object.assign(new Error(`Attachment '${entry.filename}' exceeds the 50 MB limit`), { status: 413 });
    }
  }

  _assertCompletedUploadMatches(manifest, files, existing) {
    this._assertManifestUpload(manifest, files);
    const stored = new Map(existing.filter((entry) => entry.clientFileId).map((entry) => [entry.clientFileId, entry]));
    for (const file of files) {
      const entry = stored.get(file.clientFileId);
      if (!entry || entry.contentChecksum !== file.checksum) {
        throw Object.assign(new Error("The request was already submitted with different attachment content"), { status: 409 });
      }
    }
  }

  _attachmentUploadResult(request, attachmentCount, alreadyCompleted) {
    return {
      requestId: request.ID,
      referenceNumber: request.referenceNumber,
      statusCode: request.status_code,
      attachmentCount,
      workflowStarted: true,
      alreadyCompleted
    };
  }

  _createBulkRequests = async (req) => {
    const input = req.data.input || {};
    const tx = cds.tx(req);
    const user = await this._ensureCurrentUser(req, tx);
    if (input.draftId) {
      await this._accessibleDraft(req, tx, input.draftId, user);
      await this._assertNoBulkDraftAttachments(req, tx, input.draftId);
    }

    let rows;
    try {
      rows = JSON.parse(input.rows || "[]");
    } catch (_error) {
      return req.reject(400, "The bulk rows contain invalid JSON");
    }
    if (!Array.isArray(rows) || !rows.length) {
      return req.reject(400, "Upload at least one row before submitting");
    }

    const requestType = await SELECT.one.from(this.db.RequestTypes)
      .where({ code: input.requestTypeCode, isActive: true });
    if (!requestType) {
      return req.reject(400, "Select a valid request type");
    }

    const variantCache = new Map();
    const resolveVariant = async (code) => {
      if (!code) {
        return null;
      }
      if (!variantCache.has(code)) {
        variantCache.set(code, await SELECT.one.from(this.db.RequestVariants).where({
          code,
          requestType_code: requestType.code,
          isActive: true
        }));
      }
      return variantCache.get(code);
    };

    let processorTeam = null;
    if (input.processorTeamCode) {
      // The form's "Requester Team": a team from the Requester Team master.
      processorTeam = await this.master.run(SELECT.one.from(this.masterEntities.RequesterTeams).where({
        teamCode: input.processorTeamCode,
        isActive: true
      }));
      if (!processorTeam) {
        return req.reject(400, "Select a valid requester team");
      }
    }

    const referenceNumbers = [];
    const requestIds = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index] || {};
      const { title, priorityCode, dueDate, requestVariantCode, ...details } = row;
      const variantCode = requestVariantCode || input.requestVariantCode;
      const requestVariant = await resolveVariant(variantCode);
      if (variantCode && !requestVariant) {
        return req.reject(400, `Row ${index + 1}: "${variantCode}" is not a valid process variant for this request type`);
      }
      try {
        const requestId = await this._insertOneRequest(req, tx, user, {
          requestType,
          requestVariant,
          processorTeam,
          input: {
            title: String(title).trim(),
            description: null,
            priorityCode: priorityCode || "MEDIUM",
            dueDate: dueDate || null,
            details: JSON.stringify(details)
          }
        });
        const created = await tx.run(
          SELECT.one.from(this.db.CARequests).columns("referenceNumber").where({ ID: requestId })
        );
        referenceNumbers.push(created.referenceNumber);
        requestIds.push(requestId);
      } catch (error) {
        return req.reject(400, `Row ${index + 1}: ${error.message}`);
      }
    }

    await this._consumeDraft(req, tx, input.draftId, user);

    return {
      created: referenceNumbers.length,
      referenceNumbers: JSON.stringify(referenceNumbers),
      requestIds: JSON.stringify(requestIds)
    };
  };

  _submitRequest = async (req) => {
    const tx = cds.tx(req);
    const user = await this._ensureCurrentUser(req, tx);
    const request = await SELECT.one.from(this.db.CARequests).where({ ID: req.data.requestId });

    if (!request) {
      return req.reject(404, "Request not found");
    }
    if (!req.user.is("CAAdmin") && request.requester_ID !== user.ID && request.owner_ID !== user.ID) {
      return req.reject(403, "Only the draft request creator or an administrator can submit this request");
    }
    if (request.status_code !== REQUEST_STATUS.DRAFT) {
      return req.reject(409, "Only draft requests can be submitted");
    }

    await this._initializeWorkflow(
      tx,
      request.ID,
      request.requestType_code,
      request.requestVariant_code,
      undefined,
      user,
      req
    );
    await this._writeHistory(tx, request.ID, 0, "REQUEST_SUBMITTED", user, REQUEST_STATUS.DRAFT, REQUEST_STATUS.SUBMITTED);
    return true;
  };

  _addTask = async (req) => {
    const tx = cds.tx(req);
    const user = await this._ensureCurrentUser(req, tx);
    const request = await SELECT.one.from(this.db.CARequests).where({ ID: req.data.requestId });

    if (!request) {
      return req.reject(404, "Request not found");
    }
    this._assertMutableRequest(req, request);
    const capabilities = this._roleCapabilities(req);
    if ((capabilities.isAdmin || !capabilities.canAssign) && !await this._canContribute(req, request, user)) {
      return req.reject(403, "A processor can add a task only while working on an open task of this request");
    }

    const step = await SELECT.one.from(this.db.RequestStepInstances).where({
      request_ID: request.ID,
      stepNo: req.data.stepNo
    });
    if (!step) {
      return req.reject(400, "The selected step does not belong to this request");
    }

    const [assignedUser, assignedTeam] = await Promise.all([
      req.data.assignedUserId
        ? this.master.run(SELECT.one.from(this.masterEntities.Users).where({ ID: req.data.assignedUserId }))
        : null,
      req.data.assignedTeamId
        ? this.master.run(SELECT.one.from(this.masterEntities.Teams).where({ ID: req.data.assignedTeamId }))
        : null
    ]);
    if (req.data.isApproval === true) {
      this._assertRequesterNotApprover(req, request.requester_ID, { approver_ID: assignedUser?.ID },
        request.requesterAdminApprovalAllowed);
    }
    const taskId = cds.utils.uuid();
    const task = {
      ID: taskId,
      referenceNumber: await this._taskReferenceNumber(tx, request.ID),
      request_ID: request.ID,
      stepInstance_ID: step.ID,
      stepNo: step.stepNo,
      taskName: req.data.taskName,
      description: req.data.description,
      assignedUser_ID: assignedUser?.ID || null,
      assignedTeam_ID: req.data.assignedTeamId || null,
      assignedName: assignedUser?.displayName || null,
      assignedEmail: assignedUser?.email || null,
      assignedTeamName: assignedTeam?.name || null,
      status_code: TASK_STATUS.OPEN,
      isMandatory: req.data.isMandatory === true,
      isApproval: req.data.isApproval === true,
      dueDate: req.data.dueDate || null,
      isAdditional: true
    };

    await tx.run(INSERT.into(this.db.CATasks).entries(task));
    await this._pauseStepSla(tx, request.ID, step.stepNo, user);
    await this._notifyTaskAssignment(tx, task);
    await tx.run(UPDATE(this.db.RequestStepInstances).set({
      status: "OPEN",
      completedAt: null,
      startedAt: step.startedAt || new Date().toISOString()
    }).where({ ID: step.ID }));
    await tx.run(UPDATE(this.db.CARequests).set({
      currentStep: Math.min(request.currentStep || step.stepNo, step.stepNo),
      status_code: REQUEST_STATUS.IN_PROGRESS,
      completedAt: null
    }).where({ ID: request.ID }));
    await this._writeHistory(tx, request.ID, step.stepNo, "TASK_ADDED", user, null, TASK_STATUS.OPEN, req.data.taskName);

    return tx.run(SELECT.one.from(this.db.CATasks).where({ ID: taskId }));
  };

  _claimTeamTask = async (req) => {
    const tx = cds.tx(req);
    const user = await this._ensureCurrentUser(req, tx);
    const task = await tx.run(SELECT.one.from(this.db.CATasks).where({ ID: req.data.taskId }));

    if (!task) {
      return req.reject(404, "Task not found");
    }
    if (!task.assignedTeam_ID || task.assignedUser_ID) {
      return req.reject(409, "This task is no longer available in the team queue");
    }
    if (task.isApproval) {
      const request = await tx.run(SELECT.one.from(this.db.CARequests)
        .columns("requester_ID", "requesterAdminApprovalAllowed").where({ ID: task.request_ID }));
      this._assertRequesterNotApprover(req, request?.requester_ID, { approver_ID: user.ID },
        request?.requesterAdminApprovalAllowed);
    }

    const membership = await this.master.run(SELECT.one.from(this.masterEntities.TeamMembers).where({
      team_ID: task.assignedTeam_ID,
      user_ID: user.ID,
      isActive: true
    }));
    if (!membership && !req.user.is("CAAdmin")) {
      return req.reject(403, "You are not a member of the assigned team");
    }

    const iClaimed = await tx.run(UPDATE(this.db.CATasks).set({
      assignedUser_ID: user.ID,
      assignedName: user.displayName,
      assignedEmail: user.email
    }).where({
      ID: task.ID,
      assignedUser_ID: null,
      status_code: TASK_STATUS.OPEN
    }));
    if (!iClaimed) {
      return req.reject(409, "This task was just assigned to another team member");
    }
    await this._writeHistory(tx, task.request_ID, task.stepNo, "TASK_CLAIMED", user, null, TASK_STATUS.OPEN, task.taskName);
    return true;
  };

  _protectRequestAssignment = (req) => {
    if (["owner_ID", "owner", "requester_ID", "requester", "requesterName", "requesterEmail", "tasks"]
      .some((key) => Object.prototype.hasOwnProperty.call(req.data, key))) {
      return req.reject(403, "Use the reassignment action to change request ownership; the original requester cannot be changed");
    }
  };

  _protectTaskAssignment = (req) => {
    if (["assignedUser_ID", "assignedUser", "assignedName", "assignedEmail", "assignedTeam_ID", "assignedTeam", "assignedTeamName"]
      .some((key) => Object.prototype.hasOwnProperty.call(req.data, key))) {
      return req.reject(403, "Use the task assignment actions to change the task assignee");
    }
  };

  async _reassignmentUsers(req) {
    if (!this._canMaintainDelegations(req)) {
      return req.reject(403, "Only an administrator or supervisor can reassign requests or tasks");
    }
    const actor = await this._ensureCurrentUser(req);
    if (!req.data.userId) return req.reject(400, "Select a user to assign the work to");
    const target = await this.master.run(SELECT.one.from(this.masterEntities.Users).where({ ID: req.data.userId, isActive: true }));
    if (!target) return req.reject(400, "The selected user was not found or is inactive");
    return { actor, target };
  }

  _reassignRequest = async (req) => {
    const { actor, target } = await this._reassignmentUsers(req);
    const tx = cds.tx(req);
    const request = await tx.run(SELECT.one.from(this.db.CARequests).where({ ID: req.data.requestId }));
    if (!request) return req.reject(404, "Request not found");
    this._assertMutableRequest(req, request);
    if (request.owner_ID === target.ID) return req.reject(409, "This user already owns the request");
    const oldOwner = request.owner_ID || request.requester_ID;
    const updated = await tx.run(UPDATE(this.db.CARequests).set({ owner_ID: target.ID }).where({
      ID: request.ID, owner_ID: request.owner_ID || null, status_code: request.status_code
    }));
    if (!updated) return req.reject(409, "The request changed while it was being assigned. Refresh and try again");

    // Only open first-step work assigned to the former owner follows the request. Other people's
    // work, approval decisions and all historic tasks retain their existing assignees.
    const tasks = oldOwner ? await tx.run(SELECT.from(this.db.CATasks).where({
      request_ID: request.ID, stepNo: 1, assignedUser_ID: oldOwner, status_code: TASK_STATUS.OPEN
    })) : [];
    for (const task of tasks.filter((item) => !item.isSuperseded && !item.isApproval)) {
      const changed = await tx.run(UPDATE(this.db.CATasks).set({
        assignedUser_ID: target.ID, assignedName: target.displayName, assignedEmail: target.email
      }).where({ ID: task.ID, assignedUser_ID: oldOwner, status_code: TASK_STATUS.OPEN }));
      if (!changed) return req.reject(409, "A requester task changed while assigning the request. Refresh and try again");
      await this._notifyTaskAssignment(tx, { ...task, assignedUser_ID: target.ID, assignedName: target.displayName, assignedEmail: target.email });
    }
    await this._writeHistory(tx, request.ID, request.currentStep, "REQUEST_REASSIGNED", actor, null, null,
      `Request owner changed from ${oldOwner || "unassigned"} to ${target.displayName || target.ID} (${target.ID}). from=${oldOwner || "none"}; to=${target.ID}`);
    return true;
  };

  _reassignTask = async (req) => {
    const { actor, target } = await this._reassignmentUsers(req);
    const tx = cds.tx(req);
    const task = await tx.run(SELECT.one.from(this.db.CATasks).where({ ID: req.data.taskId }));
    if (!task) return req.reject(404, "Task not found");
    const request = await tx.run(SELECT.one.from(this.db.CARequests).where({ ID: task.request_ID }));
    if (!request) return req.reject(404, "Request not found");
    this._assertMutableRequest(req, request);
    if (![TASK_STATUS.OPEN, TASK_STATUS.IN_PROGRESS].includes(task.status_code) || task.isSuperseded) {
      return req.reject(409, "Only an open or in-progress current task can be reassigned");
    }
    if (task.isApproval) {
      this._assertRequesterNotApprover(req, request.requester_ID, { approver_ID: target.ID },
        request.requesterAdminApprovalAllowed);
    }
    if (task.assignedUser_ID === target.ID) return req.reject(409, "This task is already assigned to the selected user");
    const changed = await tx.run(UPDATE(this.db.CATasks).set({
      assignedUser_ID: target.ID, assignedName: target.displayName, assignedEmail: target.email
    }).where({ ID: task.ID, assignedUser_ID: task.assignedUser_ID || null, status_code: task.status_code }));
    if (!changed) return req.reject(409, "The task changed while it was being assigned. Refresh and try again");
    await this._writeHistory(tx, task.request_ID, task.stepNo, "TASK_REASSIGNED", actor, null, null,
      `${task.referenceNumber || task.taskName}: ${task.assignedName || "team queue"} (${task.assignedUser_ID || "unassigned"}) to ${target.displayName || target.ID} (${target.ID})`);
    await this._notifyTaskAssignment(tx, { ...task, assignedUser_ID: target.ID, assignedName: target.displayName, assignedEmail: target.email });
    return true;
  };

  // Purchase Order: the S/4 Data Validation approver runs the Budget Check. The Budget Check step
  // (auto-completed on submit) opens with a task for its team, and this task waits In Progress;
  // approving the Budget Check task reopens it (_approveTask, _advanceFromStep).
  _requestBudgetCheck = async (req) => {
    const tx = cds.tx(req);
    const user = await this._ensureCurrentUser(req, tx);
    const task = await SELECT.one.from(this.db.CATasks).where({ ID: req.data.taskId });

    if (!task) {
      return req.reject(404, "Task not found");
    }
    await this._assertTaskAccess(req, task, user);
    if (task.status_code !== TASK_STATUS.OPEN) {
      return req.reject(409, "Only an open task can request a Budget Check");
    }
    const request = await SELECT.one.from(this.db.CARequests).where({ ID: task.request_ID });
    const budgetEntity = budgetDetailsEntity(request?.requestType_code);
    if (!budgetEntity) {
      return req.reject(400, "The Budget Check applies to purchase orders and service entry sheets only");
    }
    const steps = await SELECT.from(this.db.RequestStepInstances)
      .where({ request_ID: request.ID })
      .orderBy("stepNo");
    const step = steps.find((entry) => entry.stepNo === task.stepNo);
    const budgetStep = steps.find((entry) => entry.stepNo < task.stepNo && isBudgetCheckStep(entry.stepName));
    if (!isS4ValidationStep(step?.stepName) || !budgetStep) {
      return req.reject(409, "The Budget Check is requested from the S/4 Data Validation task of a request with a Budget Check step");
    }
    const budgetDetails = await SELECT.one.from(this.db[budgetEntity])
      .columns("ID", "budgetCheckStatus").where({ request_ID: request.ID });
    if (budgetDetails?.budgetCheckStatus !== BUDGET_CHECK.NOT_REQUESTED) {
      return req.reject(409, budgetDetails?.budgetCheckStatus === BUDGET_CHECK.REQUESTED
        ? "A Budget Check is already in progress"
        : "The Budget Check is already completed");
    }
    // Conditional on the current state, so a double click cannot open the Budget Check twice.
    const requested = await tx.run(UPDATE(this.db[budgetEntity])
      .set({ budgetCheckStatus: BUDGET_CHECK.REQUESTED })
      .where({ ID: budgetDetails.ID, budgetCheckStatus: BUDGET_CHECK.NOT_REQUESTED }));
    if (!requested) {
      return req.reject(409, "A Budget Check is already in progress");
    }

    const now = new Date().toISOString();
    // The task comes back to whoever requested the Budget Check. Its SLA stops meanwhile (the
    // Budget Check task runs on its own SLA) and restarts in full when the check is done.
    await tx.run(UPDATE(this.db.CATasks).set({
      status_code: TASK_STATUS.IN_PROGRESS,
      slaDueAt: null,
      dueDate: null,
      slaStartedAt: null,
      ...this._handlerStamp(task, user)
    }).where({ ID: task.ID }));
    await tx.run(UPDATE(this.db.RequestStepInstances).set({ slaDueAt: null, dueDate: null }).where({ ID: step.ID }));
    await tx.run(UPDATE(this.db.RequestStepInstances).set({
      status: "OPEN",
      startedAt: now,
      completedAt: null
    }).where({ ID: budgetStep.ID }));
    await tx.run(UPDATE(this.db.CARequests).set({
      currentStep: budgetStep.stepNo,
      status_code: REQUEST_STATUS.IN_PROGRESS
    }).where({ ID: request.ID }));
    await this._createConfiguredTaskIfMissing(tx, request.ID, budgetStep);
    await this._refreshRequestSla(tx, request.ID);
    await this._writeHistory(tx, request.ID, task.stepNo, "BUDGET_CHECK_REQUESTED", user, TASK_STATUS.OPEN, TASK_STATUS.IN_PROGRESS,
      `${task.taskName}: its SLA is paused until the Budget Check is completed`);
    return true;
  };

  _approveTask = async (req) => {
    const tx = cds.tx(req);
    const user = await this._ensureCurrentUser(req, tx);
    const task = await SELECT.one.from(this.db.CATasks).where({ ID: req.data.taskId });

    if (!task) {
      return req.reject(404, "Task not found");
    }
    await this._assertTaskAccess(req, task, user);
    if (task.status_code !== TASK_STATUS.OPEN) {
      return req.reject(409, "Only open tasks can be approved");
    }

    const step = await SELECT.one.from(this.db.RequestStepInstances).where({
      request_ID: task.request_ID,
      stepNo: task.stepNo
    });
    const request = await SELECT.one.from(this.db.CARequests).where({ ID: task.request_ID });
    this._assertCurrentAdminForSelfApproval(req, request, task, user);
    // A task added with Add Task is a decision with remarks: the values its step records (codes,
    // numbers, Budget Check) are given by the step's own task. Mirrored in TaskDetail.controller.js.
    const stepName = task.isAdditional ? "" : (step?.stepName || "");
    const glEnrichmentStep = /g\s*\/?\s*l\s+account\s+enrichment/i.test(stepName);
    const valuationClassStep = /valuation\s+class/i.test(stepName);
    const serviceCodeStep = /s\s*\/?\s*4\s+data\s+validation/i.test(stepName);
    // Purchase Order / Service Entry Sheet: S/4 Data Validation cannot be approved while a
    // requested Budget Check is running (the Budget Check itself is optional); approving the
    // Budget Check task marks it done.
    const budgetEntity = budgetDetailsEntity(request?.requestType_code);
    if (budgetEntity) {
      const budget = await SELECT.one.from(this.db[budgetEntity])
        .columns("ID", "budgetCheckStatus").where({ request_ID: task.request_ID });
      if (budget && isS4ValidationStep(stepName) && approvalBlockedByBudgetCheck(budget.budgetCheckStatus)) {
        return req.reject(409, "Complete the Budget Check before approving this task");
      }
      // Purchase Order: the S/4 Data Validation approver records one or more PO Numbers ("a; b").
      // The first is mandatory; with Create SES Successor only one is allowed, and the SES uses it.
      if (budget && request.requestType_code === "PURCHASE_ORDER" && isS4ValidationStep(stepName)) {
        const poNumbers = poNumberList(req.data.purchaseOrderNo);
        if (!poNumbers.length) {
          return req.reject(400, "Enter the PO Number to approve this task");
        }
        if (poNumbers.some((number) => number.length > 80)) {
          return req.reject(400, "Each PO Number must be 80 characters or fewer");
        }
        const po = await SELECT.one.from(this.db.PurchaseOrderDetails).columns("sesRequired").where({ ID: budget.ID });
        if (po?.sesRequired && poNumbers.length > 1) {
          return req.reject(400, "With Create SES Successor only one PO Number can be entered");
        }
        await tx.run(UPDATE(this.db.PurchaseOrderDetails)
          .set({ purchaseOrderNumber: poNumbers.join("; ") }).where({ ID: budget.ID }));
      }
      if (budget?.budgetCheckStatus && isBudgetCheckStep(stepName)) {
        await tx.run(UPDATE(this.db[budgetEntity])
          .set({ budgetCheckStatus: BUDGET_CHECK.COMPLETED }).where({ ID: budget.ID }));
        // The S/4 task that waited resumes (OPEN again, full SLA from now) before the step advances.
        if (budget.budgetCheckStatus === BUDGET_CHECK.REQUESTED) {
          await this._resumeAfterBudgetCheck(tx, task.request_ID, task.stepNo);
        }
      }
    }
    // Existing variants change a code that already exists in S/4, so none of these steps
    // records a value for them. Mirrored in TaskDetail.controller.js.
    const existingVariant = /_EXISTING$/.test(request?.requestVariant_code || "");
    // Service Code and Material Code: the G/L Account Enrichment, Valuation Class and S/4 Data
    // Validation approvers record their value, once (single line) or per line item. The Valuation
    // Class comes from the type's own master: SCC for Service Code, MCC for Material Code.
    const enrichment = {
      SERVICE_CODE: {
        details: "ServiceCodeDetails", items: "ServiceCodeItems", valuationEntity: "ValuationClassScc",
        s4: { column: "serviceCode", param: "serviceCode", label: "Service Code", maxLength: 80 }
      },
      MATERIAL_CODE: {
        details: "MaterialCodeDetails", items: "MaterialCodeItems", valuationEntity: "ValuationClass",
        s4: { column: "materialCode", param: "materialCode", label: "Material Code", maxLength: 40 }
      }
    }[request?.requestType_code];
    const valuationClasses = valuationClassStep && enrichment && !existingVariant
      ? new Set((await this.master.run(SELECT.from(this.masterEntities[enrichment.valuationEntity])
        .columns("valuationclassCode").where({ isActive: true }))).map((row) => row.valuationclassCode))
      : null;
    if ((glEnrichmentStep || valuationClassStep || serviceCodeStep) && enrichment && !existingVariant) {
      const serviceDetails = await SELECT.one.from(this.db[enrichment.details])
        .where({ request_ID: task.request_ID });
      const hasItemRows = serviceDetails && await SELECT.one.from(this.db[enrichment.items])
        .where({ details_ID: serviceDetails.ID });
      if (serviceDetails && !hasItemRows) {
        const updates = {};
        if (glEnrichmentStep) {
          const glAccount = String(req.data.glAccount || "").trim();
          if (!glAccount) {
            return req.reject(400, "Enter the GL Account to approve this task");
          }
          if (glAccount.length > 80) {
            return req.reject(400, "GL Account must be 80 characters or fewer");
          }
          updates.glAccount = glAccount;
        }
        if (valuationClassStep) {
          const valuationClass = String(req.data.valuationClass || "").trim();
          if (!valuationClass) {
            return req.reject(400, "Enter the Valuation Class to approve this task");
          }
          if (valuationClass.length > 40) {
            return req.reject(400, "Valuation Class must be 40 characters or fewer");
          }
          if (!valuationClasses.has(valuationClass)) {
            return req.reject(400, `Valuation Class ${valuationClass} is not in the active Valuation Class list`);
          }
          updates.valuationClass_code = valuationClass;
        }
        if (serviceCodeStep) {
          const { s4 } = enrichment;
          const code = String(req.data[s4.param] || "").trim();
          if (!code) {
            return req.reject(400, `Enter the ${s4.label} to approve this task`);
          }
          if (code.length > s4.maxLength) {
            return req.reject(400, `${s4.label} must be ${s4.maxLength} characters or fewer`);
          }
          updates[s4.column] = code;
        }
        await tx.run(UPDATE(this.db[enrichment.details]).set(updates).where({ ID: serviceDetails.ID }));
      } else if (serviceDetails && hasItemRows) {
        // Multiple line items: the approver enters the value per line (lineValues JSON).
        const target = glEnrichmentStep
          ? { column: "glAccount", label: "G/L Account", maxLength: 80 }
          : (valuationClassStep
            ? { column: "valuationClass_code", label: "Valuation Class", maxLength: 40, allowed: valuationClasses }
            : enrichment.s4);
        const failure = await this._applyLineValues(tx, req, this.db[enrichment.items], serviceDetails.ID, target);
        if (failure) return failure;
      }
    }

    // Equipment Code: the S/4 Data Validation approver records the created Equipment Code,
    // once for a single line item or per line item.
    if (serviceCodeStep && request?.requestType_code === "EQUIPMENT_CODE" && !existingVariant) {
      const equipmentDetails = await SELECT.one.from(this.db.EquipmentCodeDetails)
        .where({ request_ID: task.request_ID });
      const hasItemRows = equipmentDetails && await SELECT.one.from(this.db.EquipmentCodeItems)
        .where({ details_ID: equipmentDetails.ID });
      if (equipmentDetails && !hasItemRows) {
        const equipmentCode = String(req.data.equipmentCode || "").trim();
        if (!equipmentCode) {
          return req.reject(400, "Enter the Equipment Code to approve this task");
        }
        if (equipmentCode.length > 80) {
          return req.reject(400, "Equipment Code must be 80 characters or fewer");
        }
        await tx.run(UPDATE(this.db.EquipmentCodeDetails).set({ equipmentCode }).where({ ID: equipmentDetails.ID }));
      } else if (equipmentDetails && hasItemRows) {
        const failure = await this._applyLineValues(tx, req, this.db.EquipmentCodeItems, equipmentDetails.ID,
          { column: "equipmentCode", label: "Equipment Code", maxLength: 80 });
        if (failure) return failure;
      }
    }

    // Project Code: the S/4 Data Validation approver records the created Project Code (New /
    // Modification), or the Function Location / Activity per the Object Type.
    if (serviceCodeStep && request?.requestType_code === "PROJECT_CODE") {
      const projectDetails = await SELECT.one.from(this.db.ProjectCodeDetails)
        .where({ request_ID: task.request_ID });
      const target = projectDetails && this._projectValueTarget(request.requestVariant_code, projectDetails.transactionType);
      const hasItemRows = target && await SELECT.one.from(this.db.ProjectCodeItems)
        .where({ details_ID: projectDetails.ID });
      if (target && !hasItemRows) {
        const value = String(req.data.projectValue || "").trim();
        if (!value) {
          return req.reject(400, `Enter the ${target.label} to approve this task`);
        }
        if (value.length > target.maxLength) {
          return req.reject(400, `${target.label} must be ${target.maxLength} characters or fewer`);
        }
        await tx.run(UPDATE(this.db.ProjectCodeDetails).set({ [target.column]: value }).where({ ID: projectDetails.ID }));
      } else if (target && hasItemRows) {
        const failure = await this._applyLineValues(tx, req, this.db.ProjectCodeItems, projectDetails.ID, target);
        if (failure) return failure;
      }
    }

    // New SES: the S/4 Data Validation approver records an SES Number per line item (Single and
    // Multiple Line alike). The distinct numbers are also kept on the SES, so the overview, versions
    // and the Completed e-mail show them once. A request without line items (older ones) keeps a
    // single SES Number.
    if (serviceCodeStep && request?.requestType_code === "SERVICE_ENTRY_SHEET" && request.requestVariant_code === "SES_NEW") {
      const sesDetails = await SELECT.one.from(this.db.ServiceEntrySheetDetails)
        .where({ request_ID: task.request_ID });
      const hasItems = sesDetails && await SELECT.one.from(this.db.ServiceEntrySheetItems)
        .where({ details_ID: sesDetails.ID });
      if (sesDetails && hasItems) {
        const failure = await this._applyLineValues(tx, req, this.db.ServiceEntrySheetItems, sesDetails.ID,
          { column: "sesNumber", label: "SES Number", maxLength: 80 });
        if (failure) return failure;
        const numbers = (await tx.run(SELECT.from(this.db.ServiceEntrySheetItems).columns("sesNumber")
          .where({ details_ID: sesDetails.ID }).orderBy("itemNo"))).map((item) => item.sesNumber);
        await tx.run(UPDATE(this.db.ServiceEntrySheetDetails)
          .set({ sesNumber: [...new Set(numbers.filter(Boolean))].join(", ").slice(0, 80) })
          .where({ ID: sesDetails.ID }));
      } else if (sesDetails) {
        const sesNumber = String(req.data.sesNumber || "").trim();
        if (!sesNumber) {
          return req.reject(400, "Enter the SES Number to approve this task");
        }
        if (sesNumber.length > 80) {
          return req.reject(400, "SES Number must be 80 characters or fewer");
        }
        await tx.run(UPDATE(this.db.ServiceEntrySheetDetails).set({ sesNumber }).where({ ID: sesDetails.ID }));
      }
    }

    // New Contract: the S/4 Data Validation approver records the created Contract Number per
    // Header Creation row (each row shows its Vendor Code in the approve dialog).
    if (serviceCodeStep && request?.requestType_code === "OUTLINE_CONTRACT"
      && request.requestVariant_code === "CONTRACT_NEW") {
      const contractDetails = await SELECT.one.from(this.db.OutlineContractDetails)
        .where({ request_ID: task.request_ID });
      const hasHeaderRows = contractDetails && await SELECT.one.from(this.db.OutlineContractHeaders)
        .where({ details_ID: contractDetails.ID });
      if (hasHeaderRows) {
        const failure = await this._applyLineValues(tx, req, this.db.OutlineContractHeaders, contractDetails.ID,
          { column: "contractNumber", label: "Contract Number", maxLength: 80 });
        if (failure) return failure;
      }
    }

    // Material Reservation: the approver of the S/4 step records the Material Reservation Number
    // created in S/4 for each line item (both variants).
    if (request?.requestType_code === "MATERIAL_RESERVATION" && this._isReservationS4Step(stepName)) {
      const reservationDetails = await SELECT.one.from(this.db.MaterialReservationDetails)
        .where({ request_ID: task.request_ID });
      if (reservationDetails) {
        const failure = await this._applyLineValues(tx, req, this.db.MaterialReservationItems, reservationDetails.ID,
          { column: "reservationNumber", label: "Material Reservation Number", maxLength: 40 });
        if (failure) return failure;
      }
    }

    // PO Approval Completion records the date the PO was released (mandatory).
    if (request?.requestType_code === "PURCHASE_ORDER" && isPoApprovalCompletionStep(stepName)) {
      const poReleasedDate = String(req.data.poReleasedDate || "").trim();
      if (!poReleasedDate) {
        return req.reject(400, "Enter the PO Released Date to approve this task");
      }
      await tx.run(UPDATE(this.db.PurchaseOrderDetails)
        .set({ poReleasedDate }).where({ request_ID: task.request_ID }));
    }

    // The last step of a PO with "Create SES Successor" captures the PO number for the SES.
    const poDetails = task.isAdditional ? null : await this._poDetailsNeedingNumber(tx, task);
    if (poDetails) {
      const purchaseOrderNo = String(req.data.purchaseOrderNo || "").trim();
      if (!purchaseOrderNo) {
        return req.reject(400, "Enter the Purchase Order number to approve this task");
      }
      await tx.run(UPDATE(this.db.PurchaseOrderDetails)
        .set({ purchaseOrderNumber: purchaseOrderNo })
        .where({ ID: poDetails.ID }));
    }

    const approvedAt = new Date().toISOString();
    const lateness = this._lateDecision(task, approvedAt);
    await tx.run(UPDATE(this.db.CATasks).set({
      status_code: TASK_STATUS.APPROVED,
      decision: "APPROVED",
      remarks: req.data.remarks,
      completedAt: approvedAt,
      completedByName: user.displayName,
      ...lateness,
      ...this._handlerStamp(task, user)
    }).where({ ID: task.ID }));
    await this._writeHistory(tx, task.request_ID, task.stepNo, "TASK_APPROVED", user, task.status_code, TASK_STATUS.APPROVED, req.data.remarks);
    if (task.slaBreached || lateness.slaBreached) {
      await this._writeHistory(tx, task.request_ID, task.stepNo, "APPROVED_AFTER_SLA", user, null, null,
        `Approved ${this._overdueText(task.slaDueAt, approvedAt)} after the SLA due date`);
    }
    // Values the approver entered (codes, numbers per line) become a version of their own.
    if (task.isAdditional) {
      await this._resumeStepSla(tx, task, user);
    } else {
      await this._recordVersion(tx, task.request_ID, request?.requestType_code, user,
        { approverStep: { stepNo: task.stepNo, stepName: step?.stepName || task.taskName } });
    }
    await this._autoCompleteStepIfDone(req, tx, task, user);
    return true;
  };

  // Sends the PO numbers entered in the S/4 Data Validation approval dialog to Workhub. This is
  // deliberately separate from approveTask: the user can transmit the PO numbers first and then
  // confirm the Flowmate CA approval. Workhub credentials are resolved only on the server.
  _sendPoNumbersToWorkhub = async (req) => {
    const tx = cds.tx(req);
    const user = await this._ensureCurrentUser(req, tx);
    const task = await SELECT.one.from(this.db.CATasks).where({ ID: req.data.taskId });
    if (!task) {
      return req.reject(404, "Task not found");
    }
    await this._assertTaskAccess(req, task, user);
    if (task.status_code !== TASK_STATUS.OPEN || task.isSuperseded) {
      return req.reject(409, "Only the current open task can send PO numbers to Workhub");
    }

    const request = await SELECT.one.from(this.db.CARequests).where({ ID: task.request_ID });
    if (!request || request.requestType_code !== "PURCHASE_ORDER") {
      return req.reject(400, "Workhub PO transmission is available only for purchase order requests");
    }
    const step = await SELECT.one.from(this.db.RequestStepInstances).where({
      request_ID: task.request_ID,
      stepNo: task.stepNo
    });
    if (!isS4ValidationStep(step?.stepName)) {
      return req.reject(400, "PO numbers can be sent to Workhub only from the S/4 Data Validation step");
    }

    const rawPoNumbers = String(req.data.pONumber1 || "").trim();
    if (!rawPoNumbers) {
      return req.reject(400, "Enter at least one Purchase Order number before sending to Workhub");
    }
    const poNumbers = rawPoNumbers.split(",").map((value) => value.trim());
    if (poNumbers.some((value) => !value)) {
      return req.reject(400, "Enter valid Purchase Order numbers separated by commas");
    }
    const pONumber1 = poNumbers.join(", ");
    if (pONumber1.length > 5000) {
      return req.reject(400, "The combined Purchase Order numbers must be 5000 characters or fewer");
    }

    const details = await SELECT.one.from(this.db.PurchaseOrderDetails)
      .columns("WorkHUBID", "WorkHubAppID")
      .where({ request_ID: task.request_ID });
    if (!details) {
      return req.reject(404, "Purchase order details were not found");
    }
    if (!String(details.WorkHUBID || "").trim()) {
      return req.reject(400, "WorkHUBID is not maintained for this purchase order request");
    }
    if (!String(details.WorkHubAppID || "").trim()) {
      return req.reject(400, "WorkHubAppID is not maintained for this purchase order request");
    }

    let result;
    try {
      result = await this._workhubClient({
        applicationId: details.WorkHubAppID,
        cardId: details.WorkHUBID,
        poNumber1: pONumber1,
        approvalComment: req.data.approvalComment || ""
      });
    } catch (error) {
      cds.log("workhub-integration").error(`PO transmission failed for task ${task.ID}: ${error.message}`);
      return req.reject(error.workhubStatus ? 502 : 503, error.message);
    }

    await this._writeHistory(
      tx,
      task.request_ID,
      task.stepNo,
      "PO_SENT_TO_WORKHUB",
      user,
      task.status_code,
      task.status_code,
      `PO numbers sent to Workhub: ${pONumber1}`
    );
    return { sent: true, ...result };
  };

  // A step completes on its own once nothing is left to do in it: no task of the step is still
  // open and every mandatory one is approved (the same rule completeStep applies). Only the
  // request's current open step advances, and the last step also needs every other step done.
  // It then takes the exact completeStep path, so next-step tasks, routing and the SES successor
  // behave as before. completeStep stays available as a manual fallback.
  _previewProjectCode = async (req) => {
    let details;
    try {
      details = JSON.parse(req.data.details || "{}");
    } catch (_error) {
      return req.reject(400, "The details contain invalid JSON");
    }
    return JSON.stringify(await this._generateProjectCode(details || {}));
  };

  // Project Code (New / Modification), Single line. From the PCC masters:
  //   Project ID          <Division letter><YY of the AR year><NNN><Vendor letter>, where NNN counts
  //                       per Division letter + Vendor letter across all years. Division and Vendor
  //                       are optional for Non-Engineering; an empty one is left out (e.g. 26001V);
  //   Project Category    <High Level PC>/<Scope>/<Project Type>, the master values kept as they are
  //                       (TR/253986 + NU + FDD -> TR/253986/NU/FDD; no Scope -> TR/253986/FDD);
  //   Project Description <Site ID>_<Site Name>_<Project ID>.
  // Parts whose inputs are not chosen yet stay empty. keepProjectId keeps an already assigned
  // number while the Division and Vendor letters are unchanged (requester edits on step 1).
  // Older IDs were stored as N/26/001/V; they still count, and a kept one loses its slashes.
  async _generateProjectCode(details, keepProjectId) {
    const lookup = (entity, column, value) => (value
      ? this.master.run(SELECT.one.from(this.masterEntities[entity]).where({ [column]: value }))
      : null);
    const [division, vendor, ar] = await Promise.all([
      lookup("DivisionsPcc", "division", details.division),
      lookup("VendorsPcc", "vendor", details.vendorPcc),
      lookup("ArPcc", "ar", details.arReference)
    ]);
    const projectCategory = ar?.highLevelPc && details.projectTypePcc
      ? [ar.highLevelPc, details.scope, details.projectTypePcc].filter(Boolean)
        .map((part) => String(part).trim()).join("/")
      : "";

    let projectId = "";
    if (ar?.year) {
      const divisionLetter = details.division ? String(division?.divisionLetter || "") : "";
      const vendorLetter = details.vendorPcc ? String(vendor?.vendorLetter || "") : "";
      const yy = String(ar.year).slice(-2);
      const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const owned = [
        new RegExp(`^${escape(divisionLetter)}\\d{2}(\\d{3,})${escape(vendorLetter)}$`),
        new RegExp(`^${escape(divisionLetter)}/\\d{2}/(\\d+)/${escape(vendorLetter)}$`)
      ];
      const numberOf = (id) => {
        for (const pattern of owned) {
          const match = pattern.exec(String(id || ""));
          if (match) return Number.parseInt(match[1], 10);
        }
        return null;
      };
      let number = numberOf(keepProjectId);
      if (number === null) {
        const pattern = `${divisionLetter}%${vendorLetter}`;
        const [headerIds, itemIds] = await Promise.all([
          SELECT.from(this.db.ProjectCodeDetails).columns("projectId").where({ projectId: { like: pattern } }),
          SELECT.from(this.db.ProjectCodeItems).columns("projectId").where({ projectId: { like: pattern } })
        ]);
        number = headerIds.concat(itemIds).reduce((max, row) => {
          const value = numberOf(row.projectId);
          return Number.isFinite(value) && value > max ? value : max;
        }, 0) + 1;
      }
      projectId = `${divisionLetter}${yy}${String(number).padStart(3, "0")}${vendorLetter}`;
    }

    const projectDescription = details.siteId && details.siteName && projectId
      ? `${details.siteId}_${details.siteName}_${projectId}`
      : "";
    return { projectId, projectCategory, projectDescription };
  }

  // Applies the generated values to Project Code (New / Modification) details; the server value
  // always wins over the form's preview. Multiple Line Items share the request's Project ID and
  // Category, and each line gets its own description from its own site.
  async _applyProjectCode(req, requestTypeCode, variantCode, details, keepProjectId) {
    if (requestTypeCode !== "PROJECT_CODE" || variantCode !== "PROJECT_NEW_MOD") {
      return;
    }
    const generated = await this._generateProjectCode(details, keepProjectId);
    if (!generated.projectId) {
      return req.reject(400, "Select an AR from the PCC list to generate the Project ID");
    }
    if (!generated.projectCategory) {
      return req.reject(400, "Select an AR and Project Type from the PCC lists to generate the Project Category");
    }
    if (Array.isArray(details.items) && details.items.length) {
      const { projectId, projectCategory } = generated;
      Object.assign(details, { projectId, projectCategory, projectDescription: "" });
      details.items.forEach((item) => {
        Object.assign(item, {
          projectId,
          projectCategory,
          projectDescription: item.siteId && item.siteName ? `${item.siteId}_${item.siteName}_${projectId}` : ""
        });
      });
      return;
    }
    Object.assign(details, generated);
  }

  // What the Project Code S/4 Data Validation approver enters. Mirrored in TaskDetail.controller.js.
  // The step that creates the reservation in S/4 (named "S/4 Material Reservation" in the workflow).
  // Mirrored in TaskDetail.controller.js.
  // Material Reservation: the Material Type is decided by the process variant, whatever was sent.
  _applyReservationMaterialType(requestTypeCode, variantCode, details) {
    const materialType = requestTypeCode === "MATERIAL_RESERVATION"
      && { RES_DIRECT: "DIRECT", RES_WAREHOUSE: "WAREHOUSE" }[variantCode];
    if (materialType && details) {
      details.materialType = materialType;
    }
  }

  // Warehouse Material: the Vendor Allocation step goes to the Vendor Allocation Owner picked on
  // the request. Matched by name, like the S/4 step.
  // A step's SLA days. PO Approval Completion has no SLA whatever days its config holds (the Admin
  // Console only accepts 1-30): its task gets no deadline and the request is due at the end of the
  // steps before it.
  _slaDaysForConfig(config) {
    return this._isPoApprovalCompletionStep(config) ? 0 : config?.slaDays;
  }

  // Purchase Order: PO Approval Completion goes to whoever handled S/4 Data Validation.
  _isPoApprovalCompletionStep(config) {
    return config?.requestType_code === "PURCHASE_ORDER" && isPoApprovalCompletionStep(config?.stepName);
  }

  // The user of the request's latest approved S/4 Data Validation task, or {} (the step's team).
  async _s4ApproverAssignment(tx, requestId) {
    const steps = await tx.run(SELECT.from(this.db.RequestStepInstances)
      .columns("stepNo", "stepName").where({ request_ID: requestId }));
    const s4 = steps.find((step) => isS4ValidationStep(step.stepName));
    if (!s4) {
      return {};
    }
    const handled = (await tx.run(SELECT.from(this.db.CATasks)
      .columns("assignedUser_ID", "assignedName", "assignedEmail", "completedAt", "isSuperseded")
      .where({ request_ID: requestId, stepNo: s4.stepNo, status_code: TASK_STATUS.APPROVED })))
      .filter((task) => !task.isSuperseded && task.assignedUser_ID)
      .sort((left, right) => String(right.completedAt || "").localeCompare(String(left.completedAt || "")))[0];
    return handled
      ? { assignedUser_ID: handled.assignedUser_ID, assignedName: handled.assignedName, assignedEmail: handled.assignedEmail }
      : {};
  }

  _isVendorAllocationStep(config) {
    return config?.requestType_code === "MATERIAL_RESERVATION"
      && config?.requestVariant_code === "RES_WAREHOUSE"
      && /vendor\s+allocation/i.test(config?.stepName || "");
  }

  _isReservationS4Step(stepName) {
    return /s\s*\/?\s*4\s+(data\s+validation|material\s+reservation)/i.test(stepName || "");
  }

  _projectValueTarget(variantCode, transactionType) {
    if (variantCode === "PROJECT_NEW_MOD") {
      return { column: "projectCode", label: "Project Code", maxLength: 80 };
    }
    if (variantCode === "PROJECT_FL_ACTIVITY") {
      if (transactionType === "FUNCTION_LOCATION") {
        return { column: "functionLocation", label: "Function Location", maxLength: 80 };
      }
      if (transactionType === "ACTIVITY") {
        return { column: "activityNumber", label: "Activity", maxLength: 80 };
      }
      // Description Change: the approver confirms the Project Code.
      if (transactionType === "DESCRIPTION_CHANGE") {
        return { column: "projectCode", label: "Confirmed Project Code", maxLength: 80 };
      }
    }
    return null;
  }

  // Writes one approver-entered value per line item (lineValues JSON [{ itemId, value }]).
  // Returns the rejection when a line is missing or too long, otherwise nothing.
  async _applyLineValues(tx, req, itemsEntity, detailsId, target) {
    let lineValues;
    try {
      lineValues = JSON.parse(req.data.lineValues || "[]");
    } catch (_error) {
      return req.reject(400, "The line values contain invalid JSON");
    }
    const valueByItem = new Map((Array.isArray(lineValues) ? lineValues : [])
      .map((entry) => [entry?.itemId, String(entry?.value ?? "").trim()]));
    const items = await SELECT.from(itemsEntity)
      .columns("ID", "itemNo")
      .where({ details_ID: detailsId })
      .orderBy("itemNo");
    for (const item of items) {
      const value = valueByItem.get(item.ID) || "";
      if (!value) {
        return req.reject(400, `Row ${item.itemNo}: enter the ${target.label} to approve this task`);
      }
      if (value.length > target.maxLength) {
        return req.reject(400, `Row ${item.itemNo}: ${target.label} must be ${target.maxLength} characters or fewer`);
      }
      // target.allowed: the active master codes the value must be one of.
      if (target.allowed && !target.allowed.has(value)) {
        return req.reject(400, `Row ${item.itemNo}: ${target.label} ${value} is not in the active ${target.label} list`);
      }
    }
    for (const item of items) {
      await tx.run(UPDATE(itemsEntity)
        .set({ [target.column]: valueByItem.get(item.ID) })
        .where({ ID: item.ID, details_ID: detailsId }));
    }
  }

  async _autoCompleteStepIfDone(req, tx, task, user) {
    const request = await tx.run(SELECT.one.from(this.db.CARequests).where({ ID: task.request_ID }));
    if (!request || [REQUEST_STATUS.COMPLETED, REQUEST_STATUS.REJECTED].includes(request.status_code)) {
      return;
    }
    const steps = await tx.run(SELECT.from(this.db.RequestStepInstances)
      .where({ request_ID: request.ID })
      .orderBy("stepNo"));
    const step = steps.find((entry) => entry.stepNo === task.stepNo);
    if (!step || step.status !== "OPEN") {
      return;
    }
    const stepTasks = (await tx.run(SELECT.from(this.db.CATasks).where({
      request_ID: request.ID,
      stepNo: step.stepNo
    }))).filter((entry) => !entry.isSuperseded);
    const stillOpen = stepTasks.some((entry) => entry.status_code === TASK_STATUS.OPEN);
    const mandatoryPending = stepTasks.some((entry) => entry.isMandatory && entry.status_code !== TASK_STATUS.APPROVED);
    if (stillOpen || mandatoryPending) {
      return;
    }
    const lastStepNo = Math.max(...steps.map((entry) => entry.stepNo));
    if (step.stepNo === lastStepNo) {
      const incompleteStep = steps.find((entry) => entry.stepNo !== step.stepNo && entry.status !== "COMPLETED");
      const openTask = (await tx.run(SELECT.from(this.db.CATasks).where({
        request_ID: request.ID,
        status_code: { in: [TASK_STATUS.OPEN, TASK_STATUS.SENT_BACK] }
      }))).find((entry) => !entry.isSuperseded);
      if (incompleteStep || openTask) {
        return;
      }
    }
    await this._advanceFromStep(tx, request, step, steps, user, req.data.remarks, req);
  }

  _rejectTask = async (req) => {
    const tx = cds.tx(req);
    const user = await this._ensureCurrentUser(req, tx);
    const task = await SELECT.one.from(this.db.CATasks).where({ ID: req.data.taskId });

    if (!task) {
      return req.reject(404, "Task not found");
    }
    await this._assertTaskAccess(req, task, user);
    if (task.status_code !== TASK_STATUS.OPEN) {
      return req.reject(409, "Only open tasks can be rejected");
    }
    if (!String(req.data.remarks || "").trim()) {
      return req.reject(400, "A reason is required to reject a request");
    }

    const rejectedAt = new Date().toISOString();
    await tx.run(UPDATE(this.db.CATasks).set({
      status_code: TASK_STATUS.REJECTED,
      decision: "REJECTED",
      remarks: req.data.remarks,
      completedAt: rejectedAt,
      completedByName: user.displayName,
      ...this._lateDecision(task, rejectedAt)
    }).where({ ID: task.ID }));
    // Only tasks still waiting are closed; approved and sent-back tasks keep their outcome.
    const liveTaskIds = (await tx.run(SELECT.from(this.db.CATasks).columns("ID", "isSuperseded").where({
      request_ID: task.request_ID,
      // IN_PROGRESS: a PO's S/4 Data Validation task waiting on the Budget Check it requested.
      status_code: { in: [TASK_STATUS.OPEN, TASK_STATUS.IN_PROGRESS] }
    }))).filter((entry) => !entry.isSuperseded).map((entry) => entry.ID);
    if (liveTaskIds.length) {
      await tx.run(UPDATE(this.db.CATasks).set({
        status_code: TASK_STATUS.REJECTED,
        decision: "REJECTED",
        completedAt: rejectedAt
      }).where({ ID: { in: liveTaskIds } }));
    }
    await tx.run(UPDATE(this.db.RequestStepInstances).set({
      status: "REJECTED",
      completedAt: rejectedAt
    }).where({ request_ID: task.request_ID, stepNo: task.stepNo }));
    await tx.run(UPDATE(this.db.CARequests).set({
      status_code: REQUEST_STATUS.REJECTED,
      completedAt: rejectedAt
    }).where({ ID: task.request_ID }));
    await this._writeHistory(tx, task.request_ID, task.stepNo, "TASK_REJECTED", user, task.status_code, TASK_STATUS.REJECTED, req.data.remarks);
    await this._notifyRequestOutcome(tx, task.request_ID, REQUEST_OUTCOME.REJECTED, req.data.remarks,
      await this._decisionContext(tx, task, user));
    return true;
  };

  _sendBackTask = async (req) => {
    const tx = cds.tx(req);
    const user = await this._ensureCurrentUser(req, tx);
    const task = await SELECT.one.from(this.db.CATasks).where({ ID: req.data.taskId });

    if (!task) {
      return req.reject(404, "Task not found");
    }
    await this._assertTaskAccess(req, task, user);
    if (task.status_code !== TASK_STATUS.OPEN) {
      return req.reject(409, "Only open tasks can be sent back");
    }
    if (!req.data.targetStepNo || req.data.targetStepNo >= task.stepNo) {
      return req.reject(400, "Select an earlier workflow step");
    }

    const targetStep = await SELECT.one.from(this.db.RequestStepInstances).where({
      request_ID: task.request_ID,
      stepNo: req.data.targetStepNo
    });
    if (!targetStep) {
      return req.reject(400, "The selected target step does not exist");
    }

    const sentBackAt = new Date().toISOString();
    await tx.run(UPDATE(this.db.CATasks).set({
      status_code: TASK_STATUS.SENT_BACK,
      decision: "SENT_BACK",
      remarks: req.data.remarks,
      completedAt: sentBackAt,
      completedByName: user.displayName,
      ...this._lateDecision(task, sentBackAt),
      ...this._handlerStamp(task, user)
    }).where({ ID: task.ID }));
    await tx.run(UPDATE(this.db.RequestStepInstances).set({
      status: "OPEN",
      completedAt: null,
      startedAt: new Date().toISOString()
    }).where({ ID: targetStep.ID }));
    // A send-back replays the workflow from the target step, so every step after it
    // returns to PENDING; otherwise the next completion skips straight past them.
    await tx.run(UPDATE(this.db.RequestStepInstances).set({
      status: "PENDING",
      startedAt: null,
      completedAt: null
    }).where({ request_ID: task.request_ID, stepNo: { ">": targetStep.stepNo } }));
    // The step that sent the request back is flagged so the guided process shows where it
    // came from; it reopens as OPEN when the flow reaches it again.
    await tx.run(UPDATE(this.db.RequestStepInstances).set({
      status: "SENT_BACK"
    }).where({ request_ID: task.request_ID, stepNo: task.stepNo }));
    await tx.run(UPDATE(this.db.CARequests).set({
      currentStep: targetStep.stepNo,
      status_code: REQUEST_STATUS.SENT_BACK,
      completedAt: null
    }).where({ ID: task.request_ID }));
    // The reopened step's e-mail says it was sent back and carries the sender's remarks.
    // A PO's S/4 task waiting on its Budget Check is rolled back with the request: it lies dormant
    // (SENT_BACK) until its step is reached again, like the task of any later step.
    await tx.run(UPDATE(this.db.CATasks).set({ status_code: TASK_STATUS.SENT_BACK }).where({
      request_ID: task.request_ID,
      status_code: TASK_STATUS.IN_PROGRESS,
      stepNo: { ">": targetStep.stepNo }
    }));
    const decision = await this._decisionContext(tx, task, user);
    await this._createConfiguredTaskIfMissing(tx, task.request_ID, targetStep, {
      notificationType: "SENT_BACK",
      remarks: req.data.remarks,
      sentBackBy: user.displayName,
      fromStepNo: decision.stepNo,
      fromStepName: decision.stepName
    });
    await this._writeHistory(tx, task.request_ID, targetStep.stepNo, "TASK_SENT_BACK", user, task.status_code, TASK_STATUS.SENT_BACK, req.data.remarks);
    // The requester is told too, with the remarks, besides the task e-mail to the step's owner.
    await this._notifyRequestOutcome(tx, task.request_ID, REQUEST_OUTCOME.SENT_BACK, req.data.remarks, decision);
    return true;
  };

  // Step 1 is the requester's own. They edit the business content here - on creation
  // and again after a send-back - then push the request to the next step.
  // Saves the requester's corrections on their own step. The step itself is closed by
  // approving its task and completing the step, exactly as every other step is.
  _saveRequesterDetails = async (req) => {
    const tx = cds.tx(req);
    const user = await this._ensureCurrentUser(req, tx);
    const request = await tx.run(SELECT.one.from(this.db.CARequests).where({ ID: req.data.requestId }));

    if (!request) {
      return req.reject(404, "Request not found");
    }
    this._assertMutableRequest(req, request);
    const effectiveIds = req.user.is("CAAdmin")
      ? [user.ID]
      : await this._effectiveTaskUserIds(req, user.ID);
    const requesterTasks = await tx.run(SELECT.from(this.db.CATasks).where({
      request_ID: request.ID, stepNo: 1, status_code: TASK_STATUS.OPEN
    }));
    if (!requesterTasks.some((task) => !task.isSuperseded && !task.isApproval && effectiveIds.includes(task.assignedUser_ID))) {
      return req.reject(403, req.user.is("CAAdmin")
        ? "Assign the open requester task to yourself before editing its details"
        : "Only the person assigned to the open requester task or an active delegate can edit these details");
    }

    const step = await tx.run(SELECT.one.from(this.db.RequestStepInstances)
      .where({ request_ID: request.ID, stepNo: 1 }));
    if (!step) {
      return req.reject(404, "Workflow step not found");
    }
    if (step.status !== "OPEN") {
      return req.reject(409, "The request is no longer waiting on the requester");
    }

    let details = this._parseDetails(req, req.data.details);
    if (request.requestType_code === "SERVICE_ENTRY_SHEET") {
      details = withoutMultipleLineTaxFields(details);
    }
    if (request.requestType_code === "PURCHASE_ORDER") {
      details = withVariantProcurementCategory(details, request.requestVariant_code);
    }
    if (request.requestType_code === "SERVICE_ENTRY_SHEET" && sesDateProblem(details)) {
      return req.reject(400, sesDateProblem(details));
    }
    this._assertRequesterNotApprover(req, request.requester_ID, details,
      request.requesterAdminApprovalAllowed);
    await this._assertNoDuplicateMaterialDescription(req, request.requestType_code, details, request.ID);
    this._assertEmailLimits(req, request.requestType_code, details);
    if (request.requestType_code === "PROJECT_CODE") {
      const stored = await SELECT.one.from(this.db.ProjectCodeDetails).columns("projectId").where({ request_ID: request.ID });
      await this._applyProjectCode(req, request.requestType_code, request.requestVariant_code, details, stored?.projectId);
    }
    // A request created before versions were kept gets its stored data as version 1 first.
    await this._recordVersion(tx, request.ID, request.requestType_code, user, { baselineOf: request });
    await this._updateDetails(tx, request.requestType_code, request.ID, details);
    await this._recordVersion(tx, request.ID, request.requestType_code, user);
    return true;
  };

  _completeStep = async (req) => {
    const tx = cds.tx(req);
    const user = await this._ensureCurrentUser(req, tx);
    const request = await SELECT.one.from(this.db.CARequests).where({ ID: req.data.requestId });

    if (!request) {
      return req.reject(404, "Request not found");
    }
    this._assertMutableRequest(req, request);
    const steps = await SELECT.from(this.db.RequestStepInstances)
      .where({ request_ID: request.ID })
      .orderBy("stepNo");
    const step = steps.find((entry) => entry.stepNo === req.data.stepNo);
    if (!step) {
      return req.reject(404, "Workflow step not found");
    }

    const tasks = (await SELECT.from(this.db.CATasks).where({
      request_ID: request.ID,
      stepNo: step.stepNo
    })).filter((task) => !task.isSuperseded);
    if (!tasks.some((task) => task.assignedUser_ID === user.ID)) {
      return req.reject(403, "Assign a task in this step to yourself before completing it");
    }
    const blockingTask = tasks.find((task) => task.isMandatory && task.status_code !== TASK_STATUS.APPROVED);
    if (blockingTask) {
      return req.reject(409, `Approve mandatory task "${blockingTask.taskName}" before completing this step`);
    }

    const lastStepNo = Math.max(...steps.map((entry) => entry.stepNo));
    if (step.stepNo === lastStepNo) {
      const incompleteStep = steps.find((entry) => entry.stepNo !== step.stepNo && entry.status !== "COMPLETED");
      const openTask = (await SELECT.from(this.db.CATasks).where({
        request_ID: request.ID,
        status_code: { in: [TASK_STATUS.OPEN, TASK_STATUS.SENT_BACK] }
      })).find((task) => !task.isSuperseded);
      if (incompleteStep || openTask) {
        return req.reject(409, "Complete every preceding step and approve every open task before closing the final step");
      }
    }

    return this._advanceFromStep(tx, request, step, steps, user, req.data.remarks, req);
  };

  // Shared by completeStep and the requester-step submit: close the given step and
  // open the next one that is not already complete. Kept in one place so the
  // send-back replay order cannot drift between the two callers.
  async _advanceFromStep(tx, request, step, steps, user, remarks, req) {
    const lastStepNo = Math.max(...steps.map((entry) => entry.stepNo));
    const now = new Date().toISOString();

    await tx.run(UPDATE(this.db.RequestStepInstances).set({
      status: "COMPLETED",
      completedAt: now
    }).where({ ID: step.ID }));

    if (step.stepNo === lastStepNo) {
      await tx.run(UPDATE(this.db.CARequests).set({
        currentStep: step.stepNo,
        status_code: REQUEST_STATUS.COMPLETED,
        completedAt: now
      }).where({ ID: request.ID }));
      await this._writeHistory(tx, request.ID, step.stepNo, "REQUEST_COMPLETED", user, request.status_code, REQUEST_STATUS.COMPLETED, remarks);
      // The Completed e-mail carries the remarks of the final approval.
      await this._notifyRequestOutcome(tx, request.ID, REQUEST_OUTCOME.COMPLETED, remarks);
      await this._createSesSuccessor(tx, request, user);
      await this._triggerFlowmateIntegrationIfRequired(req, request.ID);
      return true;
    }

    // Submitting (or resubmitting) step 1 means the Budget Check has to be run (again).
    const budgetEntity = budgetDetailsEntity(request.requestType_code);
    if (step.stepNo === 1 && budgetEntity) {
      await tx.run(UPDATE(this.db[budgetEntity])
        .set({ budgetCheckStatus: null }).where({ request_ID: request.ID }));
    }

    let nextStep = steps.find((entry) => entry.stepNo > step.stepNo && entry.status !== "COMPLETED");
    // The PO Budget Check step completes on its own; S/4 Data Validation opens it on demand.
    while (nextStep && await this._autoCompletesBudgetCheck(tx, request, nextStep)) {
      await this._autoCompleteBudgetCheckStep(tx, request, nextStep, user, now);
      nextStep.status = "COMPLETED";
      const skipped = nextStep;
      nextStep = steps.find((entry) => entry.stepNo > skipped.stepNo && entry.status !== "COMPLETED");
    }
    if (nextStep) {
      await tx.run(UPDATE(this.db.RequestStepInstances).set({
        status: "OPEN",
        startedAt: now
      }).where({ ID: nextStep.ID }));
      await tx.run(UPDATE(this.db.CARequests).set({
        currentStep: nextStep.stepNo,
        status_code: REQUEST_STATUS.IN_PROGRESS
      }).where({ ID: request.ID }));
      await this._createConfiguredTaskIfMissing(tx, request.ID, nextStep);
    }

    await this._writeHistory(tx, request.ID, step.stepNo, "STEP_COMPLETED", user, step.status, "COMPLETED", remarks);
    return true;
  }

  // A Budget Check step (Purchase Order, New SES) is passed over automatically unless the S/4
  // Data Validation approver has requested it (budgetCheckStatus REQUESTED).
  async _autoCompletesBudgetCheck(tx, request, step) {
    const budgetEntity = budgetDetailsEntity(request.requestType_code);
    if (!budgetEntity || !isBudgetCheckStep(step.stepName)) {
      return false;
    }
    const details = await tx.run(SELECT.one.from(this.db[budgetEntity])
      .columns("budgetCheckStatus").where({ request_ID: request.ID }));
    return Boolean(details) && details.budgetCheckStatus !== BUDGET_CHECK.REQUESTED;
  }

  // The S/4 Data Validation task that requested the Budget Check carries on: OPEN again with a full
  // SLA from now, back with whoever requested it (e-mailed). Being OPEN, it is kept as it is when
  // the flow reaches its step (_createConfiguredTaskIfMissing makes no rework copy of it).
  async _resumeAfterBudgetCheck(tx, requestId, budgetStepNo) {
    const waiting = (await tx.run(SELECT.from(this.db.CATasks).where({
      request_ID: requestId,
      status_code: TASK_STATUS.IN_PROGRESS
    // slaPausedAt: waiting on an added task, not on the Budget Check.
    }))).filter((entry) => !entry.isSuperseded && !entry.slaPausedAt && entry.stepNo > budgetStepNo);
    const startedAt = new Date().toISOString();
    for (const waitingTask of waiting) {
      const step = await tx.run(SELECT.one.from(this.db.RequestStepInstances)
        .columns("ID", "slaDays").where({ request_ID: requestId, stepNo: waitingTask.stepNo }));
      const deadline = this._slaDeadline(startedAt, step?.slaDays ?? 2);
      const resumed = { status_code: TASK_STATUS.OPEN, ...deadline, slaStartedAt: startedAt, slaBreached: false, slaBreachedAt: null };
      await tx.run(UPDATE(this.db.CATasks).set(resumed).where({ ID: waitingTask.ID }));
      if (step) {
        await tx.run(UPDATE(this.db.RequestStepInstances).set(deadline).where({ ID: step.ID }));
      }
      await this._notifyTaskAssignment(tx, { ...waitingTask, ...resumed });
      await this._writeHistory(tx, requestId, waitingTask.stepNo, "SLA_RESTARTED", { displayName: "SLA Monitor", email: null },
        TASK_STATUS.IN_PROGRESS, TASK_STATUS.OPEN, `${waitingTask.taskName}: Budget Check completed, a full SLA starts now`);
      const addedTaskOpen = await tx.run(SELECT.one.from(this.db.CATasks).columns("ID").where({
        request_ID: requestId, stepNo: waitingTask.stepNo, isAdditional: true, isSuperseded: false, status_code: TASK_STATUS.OPEN
      }));
      if (addedTaskOpen) {
        await this._pauseStepSla(tx, requestId, waitingTask.stepNo);
      }
    }
    if (waiting.length) {
      await this._refreshRequestSla(tx, requestId);
    }
  }

  async _autoCompleteBudgetCheckStep(tx, request, step, user, now) {
    const remarks = "Auto-completed: run from S/4 Data Validation with the Budget Check button";
    await tx.run(UPDATE(this.db.RequestStepInstances).set({
      status: "COMPLETED",
      startedAt: now,
      completedAt: now
    }).where({ ID: step.ID }));
    // Budget Check tasks of an earlier round (e.g. sent back) keep their outcome as history and are
    // superseded, as for any step reached again, so they cannot hold up the final step.
    await tx.run(UPDATE(this.db.CATasks).set({ isSuperseded: true }).where({
      request_ID: request.ID,
      stepNo: step.stepNo,
      isSuperseded: false
    }));
    await tx.run(UPDATE(this.db[budgetDetailsEntity(request.requestType_code)])
      .set({ budgetCheckStatus: BUDGET_CHECK.NOT_REQUESTED }).where({ request_ID: request.ID }));
    await this._writeHistory(tx, request.ID, step.stepNo, "STEP_AUTO_COMPLETED", user, step.status, "COMPLETED", remarks);
  }

  _addComment = async (req) => {
    const tx = cds.tx(req);
    const user = await this._ensureCurrentUser(req, tx);
    const request = await SELECT.one.from(this.db.CARequests).where({ ID: req.data.requestId });
    if (!request) {
      return req.reject(404, "Request not found");
    }
    if (!await this._canContribute(req, request, user)) {
      return req.reject(403, "Only the person working on the open task can add comments");
    }
    const id = cds.utils.uuid();
    await tx.run(INSERT.into(this.db.CAComments).entries({
      ID: id,
      request_ID: req.data.requestId,
      comment: req.data.comment,
      authorName: user.displayName,
      authorEmail: user.email
    }));
    return tx.run(SELECT.one.from(this.db.CAComments).where({ ID: id }));
  };

  _createSuccessorRequest = async (req) => {
    const source = await SELECT.one.from(this.db.CARequests).where({ ID: req.data.requestId });
    if (!source) {
      return req.reject(404, "Source request not found");
    }
    const user = await this._ensureCurrentUser(req);
    if (!req.user.is("CAAdmin") && source.requester_ID !== user.ID && source.owner_ID !== user.ID) {
      return req.reject(403, "Only the request creator, current owner, or an administrator can create a successor request");
    }

    req.data.input = {
      requestTypeCode: req.data.requestTypeCode,
      title: req.data.title,
      description: `Created from ${source.referenceNumber}`,
      priorityCode: source.priority_code,
      predecessorId: source.ID,
      details: "{}"
    };
    return this._createRequest(req);
  };

  _sendToS4 = async (req) => {
    const request = await SELECT.one.from(this.db.CARequests).where({ ID: req.data.requestId });
    if (!request) {
      return req.reject(404, "Request not found");
    }

    return {
      accepted: false,
      integrationState: "DESTINATION_NOT_CONFIGURED",
      message: "The S/4HANA integration boundary is ready. Configure the customer destination and API mapping before enabling transmission."
    };
  };

  async _initializeWorkflow(tx, requestId, requestTypeCode, requestVariantCode, details, user, req) {
    const configs = await SELECT.from(this.db.WorkflowStepConfigs)
      .where({ requestType_code: requestTypeCode, isActive: true })
      .orderBy("stepNo");
    const conditionSource = details || await this._loadDetails(tx, requestTypeCode, requestId);
    const requestIdentity = await tx.run(SELECT.one.from(this.db.CARequests)
      .columns("requester_ID", "requesterAdminApprovalAllowed").where({ ID: requestId }));
    this._assertRequesterNotApprover(req, requestIdentity?.requester_ID, conditionSource,
      requestIdentity?.requesterAdminApprovalAllowed);
    const selectedConfigs = this._selectWorkflowConfigs(configs, requestVariantCode)
      .filter((config) => this._isStepApplicable(config, conditionSource));

    if (!selectedConfigs.length) {
      throw new Error(`No active workflow is configured for ${requestTypeCode}`);
    }

    const teams = await this.master.run(SELECT.from(this.masterEntities.Teams));
    const teamsById = new Map(teams.map((team) => [team.ID, team]));
    const submittedAt = new Date().toISOString();
    const stepEntries = selectedConfigs.map((config, index) => ({
      ID: cds.utils.uuid(),
      request_ID: requestId,
      config_ID: config.ID,
      stepNo: index + 1,
      stepName: config.stepName,
      activityDescription: config.activityDescription,
      processorTeam_ID: config.processorTeam_ID,
      processorTeamName: teamsById.get(config.processorTeam_ID)?.name || null,
      status: index === 0 ? "OPEN" : "PENDING",
      slaDays: this._slaDaysForConfig(config),
      startedAt: index === 0 ? submittedAt : null,
      completedAt: null
    }));
    await tx.run(INSERT.into(this.db.RequestStepInstances).entries(stepEntries));

    // Step 1 belongs to the requester. Submitting the request is their sign-off, so its task
    // is approved and the step completed straight away. The task stays on the requester, so a
    // send-back to step 1 reopens it to them and they can edit the details as before.
    const requesterStep = stepEntries[0];
    await this._createConfiguredTaskIfMissing(tx, requestId, requesterStep);

    await tx.run(UPDATE(this.db.CARequests).set({
      currentStep: requesterStep.stepNo,
      status_code: REQUEST_STATUS.SUBMITTED,
      submittedAt
    }).where({ ID: requestId }));

    const remarks = "Auto-completed on submission";
    const request = await tx.run(SELECT.one.from(this.db.CARequests).where({ ID: requestId }));
    const requesterTasks = await tx.run(SELECT.from(this.db.CATasks).where({
      request_ID: requestId,
      stepNo: requesterStep.stepNo
    }));
    for (const task of requesterTasks) {
      await tx.run(UPDATE(this.db.CATasks).set({
        status_code: TASK_STATUS.APPROVED,
        decision: "APPROVED",
        remarks,
        completedAt: submittedAt,
        completedByName: request.requesterName,
        assignedUser_ID: request.requester_ID,
        assignedName: request.requesterName,
        assignedEmail: request.requesterEmail
      }).where({ ID: task.ID }));
      await this._writeHistory(tx, requestId, requesterStep.stepNo, "TASK_APPROVED", user, task.status_code, TASK_STATUS.APPROVED, remarks);
    }
    await this._advanceFromStep(tx, request, requesterStep, stepEntries, user, remarks, req);
  }

  // An APPROVER step goes straight to the user the requester picked on the form
  // (approver_ID, or loaApprover_ID for SES), so it lands in that user's Pending Approval.
  // Without a selection the task stays in the processor team's queue.
  // SCM steps of an outline contract go to the SCM user named on the form: SCM Assign User
  // (Contract Modification) or the SCM SPOC (New Contract; older requests kept it on row 1).
  // All store an email.
  async _approverAssignment(config, details) {
    let where = null;
    if (config?.roleCode === "APPROVER") {
      const approverId = details?.approver_ID || details?.loaApprover_ID;
      where = approverId ? { ID: approverId } : null;
    } else if (this._isVendorAllocationStep(config)) {
      where = details?.allocationOwner_ID ? { ID: details.allocationOwner_ID } : null;
    } else if (config?.roleCode === "SCM") {
      const email = details?.scmAssignUser || details?.scmSpocUserId || details?.items?.[0]?.scmSpocUserId;
      where = email ? { email } : null;
    }
    if (!where) {
      return {};
    }
    const approver = await this.master.run(SELECT.one.from(this.masterEntities.Users)
      .where({ ...where, isActive: true }));
    if (!approver) {
      return {};
    }
    return {
      assignedUser_ID: approver.ID,
      assignedName: approver.displayName,
      assignedEmail: approver.email
    };
  }

  // The PO details row when this task is the last step of a PO that has "Create SES Successor";
  // otherwise null.
  async _poDetailsNeedingNumber(tx, task) {
    const request = await tx.run(SELECT.one.from(this.db.CARequests)
      .columns("ID", "requestType_code")
      .where({ ID: task.request_ID }));
    if (request?.requestType_code !== "PURCHASE_ORDER") {
      return null;
    }
    const details = await tx.run(SELECT.one.from(this.db.PurchaseOrderDetails)
      .columns("ID", "sesRequired", "purchaseOrderNumber")
      .where({ request_ID: request.ID }));
    // Already captured at S/4 Data Validation: the last step does not ask again.
    if (!details?.sesRequired || details.purchaseOrderNumber) {
      return null;
    }
    const steps = await tx.run(SELECT.from(this.db.RequestStepInstances)
      .columns("stepNo")
      .where({ request_ID: request.ID }));
    const lastStepNo = Math.max(...steps.map((step) => step.stepNo));
    return task.stepNo === lastStepNo ? details : null;
  }

  // Runs when a request completes. For a PO with "Create SES Successor", turns the SES captured at
  // PO creation into a real SES_NEW request: linked as successor, carrying the PO number entered
  // on the last approval, owned by the PO requester, with the SES_* attachments moved across.
  // It runs inside step completion (_advanceFromStep), which has no HTTP request, so request-level
  // checks reached through _parseDetails / _insertOneRequest throw instead of calling req.reject.
  async _createSesSuccessor(tx, poRequest, user) {
    if (poRequest.requestType_code !== "PURCHASE_ORDER") {
      return;
    }
    const req = {
      reject: (code, message) => {
        throw Object.assign(new Error(`SES successor: ${message}`), { code });
      }
    };
    const poDetails = await tx.run(SELECT.one.from(this.db.PurchaseOrderDetails)
      .where({ request_ID: poRequest.ID }));
    if (!poDetails?.sesRequired || !poDetails.sesDraft) {
      return;
    }
    const existing = await tx.run(SELECT.one.from(this.db.CARequests)
      .columns("ID")
      .where({ predecessor_ID: poRequest.ID, requestType_code: "SERVICE_ENTRY_SHEET" }));
    if (existing) {
      return;
    }

    const draft = this._parseDetails(req, poDetails.sesDraft);
    // The SES belongs to the first PO Number recorded at S/4 Data Validation.
    const poNumber = poNumberList(poDetails.purchaseOrderNumber)[0] || null;
    const details = {
      ...draft,
      sourceMode: "PO_SUCCESSOR",
      purchaseOrderNo: poNumber,
      items: (draft.items || []).map((item) => ({ ...item, poNumber: item.poNumber || poNumber }))
    };

    const [requestType, requestVariant, requester, processorTeam] = await Promise.all([
      tx.run(SELECT.one.from(this.db.RequestTypes).where({ code: "SERVICE_ENTRY_SHEET" })),
      tx.run(SELECT.one.from(this.db.RequestVariants).where({ code: "SES_NEW" })),
      this.master.run(SELECT.one.from(this.masterEntities.Users).where({ ID: poRequest.requester_ID })),
      poRequest.ownerTeam_ID
        ? this.master.run(SELECT.one.from(this.masterEntities.RequesterTeams).where({ ID: poRequest.ownerTeam_ID }))
        : null
    ]);
    const sesId = await this._insertOneRequest(req, tx, requester || user, {
      requestType,
      requestVariant,
      processorTeam,
      input: {
        title: `SES for ${poRequest.referenceNumber}`,
        description: `Created automatically from ${poRequest.referenceNumber}`,
        priorityCode: poRequest.priority_code,
        predecessorId: poRequest.ID,
        details
      },
      requesterAdminApprovalAllowed: poRequest.requesterAdminApprovalAllowed === true
    });

    const sesAttachments = (await tx.run(SELECT.from(this.db.CAAttachments)
      .columns("ID", "category")
      .where({ request_ID: poRequest.ID })))
      .filter((attachment) => String(attachment.category || "").startsWith("SES_"));
    for (const attachment of sesAttachments) {
      await tx.run(UPDATE(this.db.CAAttachments)
        .set({ request_ID: sesId, category: attachment.category.slice(4) })
        .where({ ID: attachment.ID }));
    }

    const ses = await tx.run(SELECT.one.from(this.db.CARequests).columns("referenceNumber").where({ ID: sesId }));
    await this._writeHistory(tx, poRequest.ID, poRequest.currentStep, "SES_SUCCESSOR_CREATED", user,
      null, null, `SES successor ${ses?.referenceNumber || sesId} created`);
  }

  _isStepApplicable(config, details) {
    if (!config.conditionField) {
      return true;
    }
    const value = details ? details[config.conditionField] : undefined;
    return this._normalizeFlag(value) === this._normalizeFlag(config.conditionValue);
  }

  _normalizeFlag(value) {
    const text = String(value === undefined || value === null ? "" : value).trim().toLowerCase();
    if (text === "1" || text === "true" || text === "yes") {
      return "true";
    }
    if (text === "" || text === "0" || text === "false" || text === "no") {
      return "false";
    }
    return text;
  }

  async _loadDetails(tx, requestTypeCode, requestId) {
    const entityName = DETAIL_ENTITY_BY_REQUEST_TYPE[requestTypeCode];
    if (!entityName) {
      return null;
    }
    return tx.run(SELECT.one.from(this.db[entityName]).where({ request_ID: requestId }));
  }

  _selectWorkflowConfigs(configs, requestVariantCode) {
    const exact = configs.filter((config) => config.requestVariant_code === requestVariantCode);
    if (exact.length) {
      return exact;
    }
    return configs.filter((config) => !config.requestVariant_code);
  }

  // notice: extra e-mail content for the (re)opened task, e.g. a send-back's remarks.
  async _createConfiguredTaskIfMissing(tx, requestId, step, notice = {}) {
    const stepTasks = (await tx.run(SELECT.from(this.db.CATasks).where({
      request_ID: requestId,
      stepNo: step.stepNo
    }))).filter((task) => !task.isSuperseded);
    // Only the step's own tasks are (re)opened; tasks added with Add Task are not. A closed one
    // stays as history (superseded below); an open one carries on and keeps the new task's SLA paused.
    const existing = stepTasks.filter((task) => !task.isAdditional);
    const closedAdditional = stepTasks.filter((task) => task.isAdditional && task.status_code !== TASK_STATUS.OPEN);
    const additionalOpen = stepTasks.some((task) => task.isAdditional && task.status_code === TASK_STATUS.OPEN);
    // IN_PROGRESS: waiting on an added task (or a PO's Budget Check); it carries on as it is.
    if (existing.some((task) => [TASK_STATUS.OPEN, TASK_STATUS.IN_PROGRESS].includes(task.status_code))) {
      return;
    }
    const config = step.config_ID
      ? await tx.run(SELECT.one.from(this.db.WorkflowStepConfigs).where({ ID: step.config_ID }))
      : null;
    // Resolved before the re-open branch too: the requester may have named a different
    // approver while the step was rolled back, so a reopened task must not keep the old one.
    const approver = await this._resolveStepAssignment(tx, requestId, config);
    // The SLA clock starts the moment the task reaches its team (the previous task was just
    // completed, or the request was sent back to it); claiming it does not restart it.
    const instance = await tx.run(SELECT.one.from(this.db.RequestStepInstances)
      .columns("slaDays").where({ ID: step.ID }));
    const startedAt = new Date().toISOString();
    // A step with 0 SLA days, and PO Approval Completion whatever its configured days, has no SLA:
    // no deadline, so no breach, and the request's due date stays the one of the steps before it.
    const slaDays = this._isPoApprovalCompletionStep(config) ? 0 : (instance?.slaDays ?? config?.slaDays ?? 2);
    const deadline = Number(slaDays) === 0
      ? { slaDueAt: null, dueDate: null }
      : this._slaDeadline(startedAt, slaDays);
    const sla = { ...deadline, slaStartedAt: startedAt };
    await tx.run(UPDATE(this.db.RequestStepInstances).set(deadline).where({ ID: step.ID }));

    // A step reached again (after a send-back) gets a new task for each of its earlier ones; the
    // earlier tasks stay with their outcome as history and are marked superseded. The new task goes
    // to whoever handled the earlier one (stamped on approve / send-back); step 1 without a
    // recorded handler goes to the requester.
    if (existing.length) {
      await tx.run(UPDATE(this.db.CATasks).set({ isSuperseded: true })
        .where({ ID: { in: existing.concat(closedAdditional).map((task) => task.ID) } }));
      const request = step.stepNo === 1
        ? await tx.run(SELECT.one.from(this.db.CARequests)
          .columns("requester_ID", "requesterName", "requesterEmail", "owner_ID").where({ ID: requestId }))
        : null;
      const ownerHistory = request ? await tx.run(SELECT.from(this.db.CAHistory)
        .columns("remarks").where({ request_ID: requestId, action: "REQUEST_REASSIGNED" })) : [];
      const ownerIds = new Set([request?.requester_ID, request?.owner_ID]);
      for (const entry of ownerHistory) {
        const match = /from=([^;]+); to=([^\s]+)/.exec(entry.remarks || "");
        if (match) { ownerIds.add(match[1]); ownerIds.add(match[2]); }
      }
      const owner = request?.owner_ID && request.owner_ID !== request.requester_ID
        ? await this.master.run(SELECT.one.from(this.masterEntities.Users).where({ ID: request.owner_ID }))
        : null;
      for (const previous of existing) {
        const rework = {
          ID: cds.utils.uuid(),
          referenceNumber: await this._taskReferenceNumber(tx, requestId),
          request_ID: requestId,
          stepInstance_ID: step.ID,
          stepNo: step.stepNo,
          taskName: previous.taskName,
          description: previous.description,
          assignedTeam_ID: previous.assignedTeam_ID,
          assignedTeamName: previous.assignedTeamName,
          assignedUser_ID: previous.assignedUser_ID,
          assignedName: previous.assignedName,
          assignedEmail: previous.assignedEmail,
          ...approver,
          status_code: TASK_STATUS.OPEN,
          isMandatory: previous.isMandatory,
          isApproval: previous.isApproval,
          reworkOf_ID: previous.ID,
          ...sla
        };
        if (request && !previous.isApproval && (!rework.assignedUser_ID || ownerIds.has(rework.assignedUser_ID))) {
          Object.assign(rework, {
            assignedUser_ID: request.owner_ID || request.requester_ID,
            assignedName: request.owner_ID && request.owner_ID !== request.requester_ID ? owner?.displayName || null : request.requesterName,
            assignedEmail: request.owner_ID && request.owner_ID !== request.requester_ID ? owner?.email || null : request.requesterEmail
          });
        }
        await tx.run(INSERT.into(this.db.CATasks).entries(rework));
        await this._notifyTaskAssignment(tx, rework, notice);
      }
      if (additionalOpen) {
        await this._pauseStepSla(tx, requestId, step.stepNo);
      }
      await this._refreshRequestSla(tx, requestId);
      return;
    }

    const teamId = config?.processorTeam_ID || step.processorTeam_ID;
    const team = teamId
      ? await this.master.run(SELECT.one.from(this.masterEntities.Teams).where({ ID: teamId }))
      : null;
    const task = {
      ID: cds.utils.uuid(),
      referenceNumber: await this._taskReferenceNumber(tx, requestId),
      request_ID: requestId,
      stepInstance_ID: step.ID,
      stepNo: step.stepNo,
      taskName: config?.taskName || step.stepName,
      description: config?.activityDescription || step.activityDescription,
      assignedTeam_ID: teamId,
      assignedTeamName: team?.name || step.processorTeamName || null,
      ...approver,
      status_code: TASK_STATUS.OPEN,
      isMandatory: config?.isMandatory ?? true,
      isApproval: config?.isApproval ?? false,
      ...sla
    };
    await tx.run(INSERT.into(this.db.CATasks).entries(task));
    if (additionalOpen) {
      await this._pauseStepSla(tx, requestId, step.stepNo);
    }
    await this._refreshRequestSla(tx, requestId);
    // Step 1 is the requester's own step: they just submitted, so nobody is notified.
    if (step.stepNo > 1) {
      await this._notifyTaskAssignment(tx, task, notice);
    }
  }

  // A team task records who handled it (approved or sent it back), like a claim, so a re-opened
  // task returns to that person. Claimed and approver tasks keep their user.
  _handlerStamp(task, user) {
    return task.assignedUser_ID
      ? {}
      : { assignedUser_ID: user.ID, assignedName: user.displayName, assignedEmail: user.email };
  }

  // E-mails whoever a task is assigned to, through the SAP Build Process Automation process
  // "Task Assignment Notification Process_CA" (destination bpa_workflow_technical): every active
  // member of the processor team, or the one assigned user (Selected Approval, LoA, SCM). The
  // payload is built inside the transaction; the call runs only after it commits, so a rejected
  // approval never e-mails anyone. A BPA failure is logged and never blocks the workflow.
  // notice.notificationType is "ASSIGNED" (default) or "SENT_BACK"; a send-back adds the
  // remarks and who sent it back, which the BPA template shows.
  async _notifyTaskAssignment(tx, task, notice = {}) {
    const log = cds.log("task-notification");
    const recipients = await this._taskRecipients(task);
    if (!recipients.length) {
      log.warn(`No e-mail sent for task ${task.ID}: no recipient e-mail address`);
      return;
    }

    const request = await tx.run(SELECT.one.from(this.db.CARequests)
      .columns("ID", "referenceNumber", "title", "requestType_code", "requesterName")
      .where({ ID: task.request_ID }));
    const requestType = request?.requestType_code
      ? await tx.run(SELECT.one.from(this.db.RequestTypes).columns("name").where({ code: request.requestType_code }))
      : null;
    const appUrl = this._taskAppUrl();
    if (!appUrl) {
      log.warn(`Task ${task.ID} is e-mailed without a link: set FLOWMATE_CA_APP_URL`);
    }
    const data = {
      definitionId: process.env.BPA_TASK_NOTIFICATION_DEFINITION_ID ||
        "ap11.arize-qas-9339ozek.taskassignmentnotificationprocessca.taskAssignmentNotificationProcess",
      context: {
        taskId: task.referenceNumber || task.ID,
        taskTitle: task.taskName || "Workflow task",
        assigneeEmail: recipients,
        assigneeName: (task.assignedUser_ID && task.assignedName) || task.assignedTeamName || "",
        taskUrl: appUrl ? `${appUrl}#/tasks/${encodeURIComponent(task.ID)}` : "",
        assignedDate: formatAssignedDate(task.slaStartedAt || task.createdAt || new Date(), SLA_TIME_ZONE),
        requesterName: request?.requesterName || "",
        requestId: request?.referenceNumber || task.request_ID,
        processorTeam: task.assignedTeamName || "",
        requestTitle: request?.title || "",
        requestType: requestType?.name || request?.requestType_code || "",
        // A task reopened by a send-back says who sent it back, from which step and why.
        status: notice.notificationType === "SENT_BACK" ? sentBackStatus(notice) : "Assigned"
      }
    };

    await this._startBpaProcess(data, `Task ${task.ID} notification for ${recipients.length} recipient(s)`);
  }

  // E-mails the requester about their request through the BPA process
  // "requestStatusNotificationProcess": "Completed" (last step completed), "Rejected" or
  // "Sendback" (REQUEST_OUTCOME), with the approver's remarks.
  // Who decided a task and at which step, for the Rejected / Sent Back e-mail.
  async _decisionContext(tx, task, user) {
    const step = await tx.run(SELECT.one.from(this.db.RequestStepInstances)
      .columns("stepName").where({ request_ID: task.request_ID, stepNo: task.stepNo }));
    return { actorName: user.displayName, task, stepNo: task.stepNo, stepName: step?.stepName || "" };
  }

  // The approval data approvers record on the request's details row (a single-line request's
  // codes and numbers), as e-mail lines for the Completed e-mail.
  async _approvalDataSummary(tx, requestTypeCode, requestId) {
    const fields = APPROVAL_DATA_FIELDS[requestTypeCode];
    const details = fields ? await this._loadDetails(tx, requestTypeCode, requestId) : null;
    return details ? approvalDataText(fields.map(([name, label]) => [label, details[name]])) : "";
  }

  // decision: { actorName, task, stepNo, stepName } of a rejection or send-back.
  async _notifyRequestOutcome(tx, requestId, status, remarks = "", decision = {}) {
    const request = await tx.run(SELECT.one.from(this.db.CARequests)
      .columns("referenceNumber", "title", "requestType_code", "requesterEmail", "requesterName")
      .where({ ID: requestId }));
    if (!request?.requesterEmail) {
      cds.log("task-notification").warn(`No ${status} e-mail for request ${requestId}: no requester e-mail address`);
      return;
    }
    const requestType = await tx.run(SELECT.one.from(this.db.RequestTypes)
      .columns("name").where({ code: request.requestType_code }));
    // A completed request's e-mail lists the approval data on its own "Approval Data:" line.
    const approvalData = status === REQUEST_OUTCOME.COMPLETED
      ? (await this._approvalDataSummary(tx, request.requestType_code, requestId)) || "None"
      : "";
    // A completed request also goes to the addresses named on it (see completionRecipients).
    const recipients = status === REQUEST_OUTCOME.COMPLETED
      ? completionRecipients(request.requesterEmail, await this._completionAddresses(tx, request.requestType_code, requestId))
      : [request.requesterEmail];
    for (const recipient of recipients) {
      await this._startBpaProcess({
        definitionId: process.env.BPA_REQUEST_STATUS_DEFINITION_ID ||
          "ap11.arize-qas-9339ozek.requeststatusnotificationprocessca.requestStatusNotificationProcess",
        context: {
          requestermail: recipient,
          requesttitle: request.title || "",
          requesttype: requestType?.name || request.requestType_code || "",
          requestid: request.referenceNumber || requestId,
          status,
          remarks: remarks || "",
          approvaldata: approvalData,
          requestername: request.requesterName || "",
          rejectedby: status === REQUEST_OUTCOME.REJECTED ? decision.actorName || "" : "",
          sendbackby: status === REQUEST_OUTCOME.SENT_BACK ? decision.actorName || "" : "",
          taskid: decision.task ? decision.task.referenceNumber || decision.task.ID : "",
          taskname: decision.task ? taskAtStep(decision.task.taskName, decision.stepNo, decision.stepName) : ""
        }
      }, `Request ${request.referenceNumber} ${status} e-mail to ${recipient}`);
    }
  }

  // The e-mail addresses a completed request names: Outline Contract "User to be notified",
  // Purchase Order "Approved PO Recipient Email", Service Entry Sheet "SES Recipient Email"
  // (Single Line on the form, Multiple Line on each Header Creation row).
  async _completionAddresses(tx, requestTypeCode, requestId) {
    if (requestTypeCode === "OUTLINE_CONTRACT") {
      const contract = await tx.run(SELECT.one.from(this.db.OutlineContractDetails)
        .columns("notifyUserEmail").where({ request_ID: requestId }));
      return [contract?.notifyUserEmail];
    }
    if (requestTypeCode === "PURCHASE_ORDER") {
      const po = await tx.run(SELECT.one.from(this.db.PurchaseOrderDetails)
        .columns("approvedPoRecipientEmail").where({ request_ID: requestId }));
      return [po?.approvedPoRecipientEmail];
    }
    if (requestTypeCode === "SERVICE_ENTRY_SHEET") {
      const ses = await tx.run(SELECT.one.from(this.db.ServiceEntrySheetDetails)
        .columns("ID", "sesRecipientEmail", "divisionalUser_ID").where({ request_ID: requestId }));
      if (!ses) {
        return [];
      }
      const rows = await tx.run(SELECT.from(this.db.ServiceEntrySheetHeaders)
        .columns("sesRecipientEmail").where({ details_ID: ses.ID }).orderBy("itemNo"));
      // ... and the Divisional User named on the request.
      const divisionalUser = ses.divisionalUser_ID
        ? await this.master.run(SELECT.one.from(this.masterEntities.Users).columns("email").where({ ID: ses.divisionalUser_ID }))
        : null;
      return [ses.sesRecipientEmail, ...rows.map((row) => row.sesRecipientEmail), divisionalUser?.email];
    }
    return [];
  }

  // Starts a BPA process instance (destination bpa_workflow_technical). It runs only after the
  // current transaction commits, so a rolled-back action never e-mails anyone; a failure is
  // logged and never blocks the workflow. awaitResult sends at once and rethrows a failure,
  // for callers that record whether the e-mail went out (the SLA breach scan).
  async _startBpaProcess(data, description, { awaitResult = false } = {}) {
    const log = cds.log("task-notification");
    const post = () => executeHttpRequest(
      { destinationName: process.env.BPA_WORKFLOW_DESTINATION || "bpa_workflow_technical" },
      {
        method: "post",
        url: "/workflow/rest/v1/workflow-instances",
        data,
        headers: { "content-type": "application/json" }
      },
      { fetchCsrfToken: false }
    );
    if (awaitResult) {
      await post();
      log.info(`${description} started`);
      return;
    }
    const send = async () => {
      try {
        await post();
        log.info(`${description} started`);
      } catch (error) {
        log.error(`Could not start ${description}: ${error.message}`);
      }
    };
    if (typeof cds.context?.on === "function") {
      cds.context.on("succeeded", send);
    } else {
      await send();
    }
  }

  // ---- Request titles ----
  // Titles are numbered per request type and year from the initials of the type's name:
  // Material Code Creation -> MCC-26-0001.
  _titlePrefix(requestType) {
    return String(requestType?.name || requestType?.code || "")
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase())
      .join("");
  }

  _titleYear() {
    return Number(new Intl.DateTimeFormat("en-CA", { timeZone: SLA_TIME_ZONE, year: "numeric" }).format(new Date()));
  }

  _formatRequestTitle(requestType, year, number) {
    return `${this._titlePrefix(requestType)}-${String(year).slice(-2)}-${String(number).padStart(4, "0")}`;
  }

  // "CA-POC-26-000001": the request type's title prefix, the year and the serial.
  _formatRequestReference(requestType, year, number) {
    return `CA-${this._titlePrefix(requestType)}-${String(year).slice(-2)}-${String(number).padStart(6, "0")}`;
  }

  // Takes the next number inside the create transaction, so parallel creates never share one.
  async _nextRequestSerial(tx, requestType) {
    const key = { requestType: requestType.code, year: this._titleYear() };
    const bump = () => tx.run(UPDATE(this.db.RequestTitleCounters).with({ lastNumber: { "+=": 1 } }).where(key));
    const read = () => tx.run(SELECT.one.from(this.db.RequestTitleCounters).where(key));
    await bump();
    let counter = await read();
    if (!counter) {
      // First request of this type this year; a parallel create may insert it first.
      try {
        await tx.run(INSERT.into(this.db.RequestTitleCounters).entries({ ...key, lastNumber: 1 }));
      } catch (error) {
        await bump();
      }
      counter = await read();
    }
    return { year: key.year, number: counter.lastNumber };
  }

  // The title the next request of this type would get; shown on the create page, taken on submit.
  _previewRequestTitle = async (req) => {
    const requestType = await SELECT.one.from(this.db.RequestTypes).where({ code: req.data.requestTypeCode });
    if (!requestType) {
      return null;
    }
    const year = this._titleYear();
    const counter = await SELECT.one.from(this.db.RequestTitleCounters).where({ requestType: requestType.code, year });
    return this._formatRequestTitle(requestType, year, Number(counter?.lastNumber || 0) + 1);
  };

  // ---- Comments and attachments ----
  // Only the person holding an open task of the request (or their active delegate) may add
  // attachments and comments to it. An unclaimed team task lets nobody add anything until someone
  // takes it. Administrators must assign the task to themselves before acting. The requester may also attach files while creating
  // the request (the create page uploads right after creating, see _beforeCreateAttachment).
  async _canContribute(req, request, user) {
    if (!this._roleCapabilities(req).canProcessAssignedTasks) return false;
    const openTasks = (await SELECT.from(this.db.CATasks)
      .columns("assignedUser_ID", "isSuperseded")
      // IN_PROGRESS: a task waiting on an added task or a Budget Check is still its holder's work.
      .where({ request_ID: request.ID, status_code: { in: [TASK_STATUS.OPEN, TASK_STATUS.IN_PROGRESS] } }))
      .filter((task) => !task.isSuperseded && task.assignedUser_ID);
    for (const task of openTasks) {
      if (await this._canActOnTask(req, user.ID, task.assignedUser_ID)) {
        return true;
      }
    }
    return false;
  }

  _canContributeToRequest = async (req) => {
    const user = await this._ensureCurrentUser(req);
    const request = await SELECT.one.from(this.db.CARequests).where({ ID: req.data.requestId });
    return !!request && this._canContribute(req, request, user);
  };

  _beforeCreateAttachment = async (req) => {
    if (req.data.draft_ID) {
      return req.reject(400, "Use DraftAttachments to upload a file to a saved draft");
    }
    const user = await this._ensureCurrentUser(req, cds.tx(req));
    const request = await SELECT.one.from(this.db.CARequests).where({ ID: req.data.request_ID });
    if (!request) {
      return req.reject(404, "Request not found");
    }
    const capabilities = this._roleCapabilities(req);
    const creating = capabilities.canCreate && request.requester_ID === user.ID
      && Date.now() - Date.parse(request.createdAt) < 15 * 60 * 1000;
    if (!creating && !await this._canContribute(req, request, user)) {
      return req.reject(403, "Only the person working on the open task can upload attachments");
    }
    req.data.uploadedByName = user.displayName;
  };

  _attachmentId(req) {
    return req.data?.ID || req.params?.[0]?.ID;
  }

  _protectRequestAttachment = async (req) => {
    const ID = this._attachmentId(req);
    if (!ID) return;
    const attachment = await cds.tx(req).run(
      SELECT.one.from(this.db.CAAttachments).columns("ID", "draft_ID", "request_ID", "createdBy").where({ ID })
    );
    if (!attachment || attachment.draft_ID) {
      return req.reject(404, "Attachment not found");
    }
    // A file can only be deleted by the person who uploaded it (on top of the rules below).
    if (req.event === "DELETE"
      && String(attachment.createdBy || "").trim().toLowerCase() !== String(req.user.id || "").trim().toLowerCase()) {
      return req.reject(403, "Only the person who uploaded an attachment can delete it");
    }
    if (Object.hasOwn(req.data || {}, "draft_ID") || Object.hasOwn(req.data || {}, "request_ID")) {
      return req.reject(400, "Attachment ownership cannot be changed through this endpoint");
    }
    const user = await this._ensureCurrentUser(req, cds.tx(req));
    const request = await cds.tx(req).run(SELECT.one.from(this.db.CARequests).where({ ID: attachment.request_ID }));
    const creating = this._roleCapabilities(req).canCreate && request?.requester_ID === user.ID
      && Date.now() - Date.parse(request.createdAt) < 15 * 60 * 1000;
    // The requester may delete their own uploads while the request is still open.
    const requesterDeleting = req.event === "DELETE" && request?.requester_ID === user.ID
      && [REQUEST_STATUS.SUBMITTED, REQUEST_STATUS.IN_PROGRESS, REQUEST_STATUS.SENT_BACK].includes(request.status_code);
    if (!creating && !requesterDeleting && (!request || !await this._canContribute(req, request, user))) {
      return req.reject(403, "Only an administrator or the person working on the open task can change attachments");
    }
  };

  _beforeCreateDraftAttachment = async (req) => {
    this._requireCreator(req);
    const tx = cds.tx(req);
    const user = await this._ensureCurrentUser(req, tx);
    if (req.data.request_ID) {
      return req.reject(400, "A draft attachment cannot belong to a submitted request");
    }
    await this._accessibleDraft(req, tx, req.data.draft_ID, user);
    req.data.request_ID = null;
    req.data.uploadedByName = user.displayName;
  };

  _protectDraftAttachment = async (req) => {
    this._requireCreator(req);
    const tx = cds.tx(req);
    const user = await this._ensureCurrentUser(req, tx);
    const ID = this._attachmentId(req);
    const attachment = ID && await tx.run(
      SELECT.one.from(this.db.CAAttachments).columns("ID", "draft_ID", "request_ID").where({ ID })
    );
    if (!attachment || !attachment.draft_ID || attachment.request_ID) {
      return req.reject(404, "Draft attachment not found");
    }
    await this._accessibleDraft(req, tx, attachment.draft_ID, user);
    if (Object.hasOwn(req.data || {}, "draft_ID") || Object.hasOwn(req.data || {}, "request_ID")) {
      return req.reject(400, "Draft attachment ownership cannot be changed through this endpoint");
    }
  };

  // ---- SLA ----
  // A task's SLA runs from the moment it reaches its team: the previous task's completion, or a
  // send-back to it. A late step therefore pushes every later due date out, and the request's
  // due date is a projection that moves with it.

  // The create page's Due Date: today plus the SLA days of every step the request will go through
  // (step 1 is signed off on submit). Shown only; each task keeps its own SLA from when it
  // reaches its team, and the stored due date follows the tasks.
  _slaPreview = async (req) => {
    let details = {};
    try {
      details = JSON.parse(req.data.details || "{}") || {};
    } catch (error) {
      details = {};
    }
    const configs = await SELECT.from(this.db.WorkflowStepConfigs)
      .where({ requestType_code: req.data.requestTypeCode, isActive: true })
      .orderBy("stepNo");
    const selected = this._selectWorkflowConfigs(configs, req.data.requestVariantCode)
      .filter((config) => this._isStepApplicable(config, details));
    if (!selected.length) {
      return { dueDate: null, slaDueAt: null, totalDays: 0, stepCount: 0 };
    }
    const totalDays = selected.slice(1).reduce((sum, config) => sum + Number(this._slaDaysForConfig(config) || 0), 0);
    return { ...this._slaDeadline(new Date(), totalDays), totalDays, stepCount: selected.length };
  };

  // Calendar days: the deadline is slaDays x 24h after
  // the start, and its date is the Sri Lankan calendar date of that moment.
  _slaDeadline(startAt, slaDays) {
    const dueAt = new Date(new Date(startAt).getTime() + Number(slaDays || 0) * DAY_MS);
    return { slaDueAt: dueAt.toISOString(), dueDate: this._slaLocalDate(dueAt) };
  }

  _slaLocalDate(date) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: SLA_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit"
    }).format(date);
  }

  // While a task added with Add Task is open, its step's own open task(s) wait In Progress (no
  // approve, send back or terminate) with the SLA paused: no deadline, so the breach scan cannot
  // flag them. _resumeStepSla reopens them.
  async _pauseStepSla(tx, requestId, stepNo, user) {
    const main = (await tx.run(SELECT.from(this.db.CATasks)
      .columns("ID", "isAdditional", "isSuperseded", "slaPausedAt", "taskName")
      .where({ request_ID: requestId, stepNo, status_code: TASK_STATUS.OPEN })))
      .filter((task) => !task.isSuperseded && !task.isAdditional);
    if (!main.length) {
      return;
    }
    const now = new Date().toISOString();
    for (const task of main) {
      await tx.run(UPDATE(this.db.CATasks).set({
        status_code: TASK_STATUS.IN_PROGRESS, slaPausedAt: task.slaPausedAt || now, slaDueAt: null, dueDate: null
      }).where({ ID: task.ID }));
      await this._writeHistory(tx, requestId, stepNo, "TASK_WAITING", user || { displayName: "SLA Monitor", email: null },
        TASK_STATUS.OPEN, TASK_STATUS.IN_PROGRESS, `${task.taskName}: waits until the added task is completed`);
    }
    await tx.run(UPDATE(this.db.RequestStepInstances)
      .set({ slaDueAt: null, dueDate: null }).where({ request_ID: requestId, stepNo }));
  }

  // Once the last open Add Task task of a step is completed, the step's waiting task(s) are OPEN
  // again, with their SLA from the start: the step's full SLA days from now.
  async _resumeStepSla(tx, additionalTask, user) {
    const stepTasks = (await tx.run(SELECT.from(this.db.CATasks)
      .where({ request_ID: additionalTask.request_ID, stepNo: additionalTask.stepNo })))
      .filter((task) => !task.isSuperseded);
    if (stepTasks.some((task) => task.isAdditional && task.status_code === TASK_STATUS.OPEN && task.ID !== additionalTask.ID)) {
      return;
    }
    // OPEN too: tasks paused before the wait moved them to In Progress.
    const paused = stepTasks.filter((task) => !task.isAdditional && task.slaPausedAt
      && [TASK_STATUS.IN_PROGRESS, TASK_STATUS.OPEN].includes(task.status_code));
    if (!paused.length) {
      return;
    }
    const step = await tx.run(SELECT.one.from(this.db.RequestStepInstances)
      .where({ request_ID: additionalTask.request_ID, stepNo: additionalTask.stepNo }));
    const config = step?.config_ID
      ? await tx.run(SELECT.one.from(this.db.WorkflowStepConfigs).where({ ID: step.config_ID }))
      : null;
    const startedAt = new Date().toISOString();
    const slaDays = this._isPoApprovalCompletionStep(config) ? 0 : (step?.slaDays ?? config?.slaDays ?? 2);
    const deadline = Number(slaDays) === 0 ? { slaDueAt: null, dueDate: null } : this._slaDeadline(startedAt, slaDays);
    const resumed = { status_code: TASK_STATUS.OPEN, ...deadline, slaStartedAt: startedAt, slaPausedAt: null };
    await tx.run(UPDATE(this.db.CATasks).set(resumed)
      .where({ ID: { in: paused.map((task) => task.ID) } }));
    if (step) {
      await tx.run(UPDATE(this.db.RequestStepInstances).set(deadline).where({ ID: step.ID }));
    }
    await this._refreshRequestSla(tx, additionalTask.request_ID);
    for (const task of paused) {
      await this._notifyTaskAssignment(tx, { ...task, ...resumed });
    }
    await this._writeHistory(tx, additionalTask.request_ID, additionalTask.stepNo, "SLA_RESTARTED", user, TASK_STATUS.IN_PROGRESS, TASK_STATUS.OPEN,
      `${paused.map((task) => task.taskName).join(", ")} reopened with a full SLA after ${additionalTask.taskName} was completed`);
  }

  // The open step's deadline plus the SLA days of the steps still to come.
  async _refreshRequestSla(tx, requestId) {
    const steps = await tx.run(SELECT.from(this.db.RequestStepInstances)
      .columns("stepNo", "status", "slaDays", "slaDueAt")
      .where({ request_ID: requestId })
      .orderBy("stepNo"));
    const open = steps.find((step) => step.status === "OPEN" && step.slaDueAt);
    if (!open) {
      return;
    }
    const remainingDays = steps
      .filter((step) => step.stepNo > open.stepNo && step.status !== "COMPLETED")
      .reduce((sum, step) => sum + Number(step.slaDays || 0), 0);
    await tx.run(UPDATE(this.db.CARequests).set(this._slaDeadline(open.slaDueAt, remainingDays)).where({ ID: requestId }));
  }

  // Closing a task after its deadline marks it breached for good, so it shows as approved with
  // a breach rather than as on time.
  _lateDecision(task, decidedAt) {
    if (task.slaBreached || !task.slaDueAt || Date.parse(decidedAt) <= Date.parse(task.slaDueAt)) {
      return {};
    }
    return { slaBreached: true, slaBreachedAt: decidedAt };
  }

  _overdueText(slaDueAt, at = new Date()) {
    const late = Math.max(0, new Date(at).getTime() - Date.parse(slaDueAt));
    if (late >= DAY_MS) {
      return `${Math.floor(late / DAY_MS)} day(s)`;
    }
    return `${Math.max(1, Math.ceil(late / HOUR_MS))} hour(s)`;
  }

  // Run by SAP Job Scheduling (scope SlaScheduler) or an administrator. Every open task past its
  // deadline is marked breached and its assignee - or, for an unclaimed team task, every active
  // member - is e-mailed once through "SLA Breach Notification Process_CA". Each e-mail is
  // claimed in SlaNotificationStates first, so overlapping or repeated scans never send it twice
  // and a failed send is retried on later scans up to SLA_MAX_RETRIES times.
  _runSlaBreachScan = async (req) => {
    const tx = cds.tx(req);
    const now = new Date().toISOString();
    const tasks = await tx.run(SELECT.from(this.db.CATasks).where({
      status_code: TASK_STATUS.OPEN,
      slaDueAt: { "<": now }
    }));
    const result = { overdueTasks: tasks.length, notificationsSent: 0, notificationsFailed: 0, notificationsSkipped: 0 };
    const monitor = { displayName: "SLA Monitor", email: null };

    for (const task of tasks) {
      if (!task.slaBreached) {
        await tx.run(UPDATE(this.db.CATasks).set({ slaBreached: true, slaBreachedAt: now }).where({ ID: task.ID }));
        await this._writeHistory(tx, task.request_ID, task.stepNo, "SLA_BREACHED", monitor, null, null,
          `${task.taskName} is ${this._overdueText(task.slaDueAt)} past its SLA due date`);
      }
      const recipients = await this._taskRecipients(task);
      if (!recipients.length) {
        result.notificationsSkipped += 1;
        cds.log("sla-scheduler").warn(`No recipient for the SLA breach of task ${task.ID}`);
        continue;
      }
      for (const email of recipients) {
        const key = ["SLA_BREACH", "TASK", task.ID, task.slaDueAt, email].join(":").toLowerCase();
        if (!await this._claimSlaNotification(tx, key, task, email)) {
          result.notificationsSkipped += 1;
          continue;
        }
        try {
          await this._notifySlaBreach(tx, task, email);
          await this._completeSlaNotification(tx, key, "SENT");
          result.notificationsSent += 1;
        } catch (error) {
          await this._completeSlaNotification(tx, key, "FAILED", error.message);
          result.notificationsFailed += 1;
        }
      }
    }
    cds.log("sla-scheduler").info("SLA breach scan completed", result);
    return result;
  };

  async _claimSlaNotification(tx, key, task, recipient) {
    const existing = await tx.run(SELECT.one.from(this.db.SlaNotificationStates).where({ notificationKey: key }));
    const maxAttempts = Math.max(1, Number(process.env.SLA_MAX_RETRIES || 5));
    const attempts = Number(existing?.attempts || 0);
    const inFlight = existing?.status === "PROCESSING"
      && Date.parse(existing.lastAttemptAt || 0) > Date.now() - 15 * 60 * 1000;
    if (existing?.status === "SENT" || attempts >= maxAttempts || inFlight) {
      return false;
    }
    const now = new Date().toISOString();
    if (existing) {
      await tx.run(UPDATE(this.db.SlaNotificationStates).set({
        status: "PROCESSING", attempts: attempts + 1, lastAttemptAt: now, lastError: null
      }).where({ notificationKey: key }));
      return true;
    }
    try {
      await tx.run(INSERT.into(this.db.SlaNotificationStates).entries({
        notificationKey: key,
        request_ID: task.request_ID,
        task_ID: task.ID,
        recipient,
        dueDate: task.dueDate,
        status: "PROCESSING",
        attempts: 1,
        lastAttemptAt: now
      }));
      return true;
    } catch (error) {
      if (/unique|duplicate|constraint/i.test(error.message || "")) {
        return false;
      }
      throw error;
    }
  }

  async _completeSlaNotification(tx, key, status, errorMessage = null) {
    await tx.run(UPDATE(this.db.SlaNotificationStates).set({
      status,
      notifiedAt: status === "SENT" ? new Date().toISOString() : null,
      lastError: errorMessage
    }).where({ notificationKey: key }));
  }

  async _notifySlaBreach(tx, task, email) {
    const request = await tx.run(SELECT.one.from(this.db.CARequests)
      .columns("title", "requestType_code").where({ ID: task.request_ID }));
    const requestType = await tx.run(SELECT.one.from(this.db.RequestTypes)
      .columns("name").where({ code: request?.requestType_code }));
    const appUrl = this._taskAppUrl();
    const data = {
      definitionId: process.env.BPA_SLA_BREACH_DEFINITION_ID ||
        "ap11.arize-qas-9339ozek.slabreachnotificationprocessca.sLABreachNotificationProcess",
      context: {
        taskId: task.referenceNumber || task.ID,
        taskTitle: task.taskName || "Workflow task",
        assigneeEmail: [email],
        assigneeName: (task.assignedUser_ID && task.assignedName) || task.assignedTeamName || "",
        taskUrl: appUrl ? `${appUrl}#/tasks/${encodeURIComponent(task.ID)}` : "",
        slaDueDate: new Intl.DateTimeFormat("en-GB", {
          timeZone: SLA_TIME_ZONE, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
        }).format(new Date(task.slaDueAt)),
        breachDuration: this._overdueText(task.slaDueAt),
        requestTitle: request?.title || "",
        requestType: requestType?.name || request?.requestType_code || ""
      }
    };
    await this._startBpaProcess(data, `SLA breach e-mail for task ${task.ID} to ${email}`, { awaitResult: true });
  }

  // The assigned user, or every active member of the processor team. A membership without a
  // copied e-mail falls back to the user's own e-mail.
  async _taskRecipients(task) {
    if (task.assignedUser_ID) {
      const user = await this.master.run(SELECT.one.from(this.masterEntities.Users)
        .columns("ID", "email").where({ ID: task.assignedUser_ID }));
      return this._delegatedNotificationEmails([{ ID: task.assignedUser_ID, email: user?.email || task.assignedEmail }]);
    }
    if (!task.assignedTeam_ID) {
      return [];
    }
    const members = await this.master.run(SELECT.from(this.masterEntities.TeamMembers)
      .columns("email", "user_ID")
      .where({ team_ID: task.assignedTeam_ID, isActive: true }));
    const missing = members.filter((member) => !member.email && member.user_ID).map((member) => member.user_ID);
    const users = missing.length
      ? await this.master.run(SELECT.from(this.masterEntities.Users).columns("ID", "email")
        .where({ ID: { in: missing }, isActive: true }))
      : [];
    const usersById = new Map(users.map((user) => [user.ID, user]));
    return this._delegatedNotificationEmails(members.map((member) => ({
      ID: member.user_ID,
      email: member.email || usersById.get(member.user_ID)?.email
    })));
  }

  async _delegatedNotificationEmails(recipients) {
    const normalized = recipients.filter((recipient) => recipient?.ID || recipient?.email);
    const userIds = [...new Set(normalized.map((recipient) => recipient.ID).filter(Boolean))];
    if (!userIds.length) {
      return [...new Set(normalized.map((recipient) => recipient.email).filter(Boolean))];
    }

    const today = new Date().toISOString().slice(0, 10);
    const delegations = await this.master.run(
      SELECT.from(this.masterEntities.Delegations)
        .columns("delegator_ID", "delegate_ID")
        .where({
          delegator_ID: { in: userIds },
          enabled: true,
          forwardNotifications: true,
          startDate: { "<=": today },
          endDate: { ">=": today }
        })
    );
    const delegatedByUser = new Map(delegations.map((delegation) => [delegation.delegator_ID, delegation.delegate_ID]));
    const delegateIds = [...new Set([...delegatedByUser.values()].filter(Boolean))];
    const delegates = delegateIds.length
      ? await this.master.run(
        SELECT.from(this.masterEntities.Users)
          .columns("ID", "email")
          .where({ ID: { in: delegateIds }, isActive: true })
      )
      : [];
    const delegateEmailById = new Map(delegates.map((user) => [user.ID, user.email]));

    return [...new Set(normalized.map((recipient) => {
      const delegateId = delegatedByUser.get(recipient.ID);
      return delegateEmailById.get(delegateId) || recipient.email;
    }).filter(Boolean))];
  }

  // The CA app's URL for the e-mail link: FLOWMATE_CA_APP_URL when set (local runs), otherwise
  // the approuter host the current request came through (it serves index.html at its root).
  _taskAppUrl() {
    const configured = String(process.env.FLOWMATE_CA_APP_URL || "").split("#")[0];
    if (configured) {
      return configured;
    }
    const headers = cds.context?.http?.req?.headers || {};
    const host = headers["x-forwarded-host"];
    if (!host) {
      return "";
    }
    const protocol = String(headers["x-forwarded-proto"] || "https").split(",")[0].trim();
    return `${protocol}://${String(host).split(",")[0].trim()}/index.html`;
  }

  // An APPROVER or SCM step goes to the user named on the form; every other step stays in
  // its processor team's queue.
  async _resolveStepAssignment(tx, requestId, config) {
    if (this._isPoApprovalCompletionStep(config)) {
      return this._s4ApproverAssignment(tx, requestId);
    }
    if (!["APPROVER", "SCM"].includes(config?.roleCode) && !this._isVendorAllocationStep(config)) {
      return {};
    }
    const request = await tx.run(SELECT.one.from(this.db.CARequests)
      .columns("requestType_code", "requester_ID", "requesterAdminApprovalAllowed").where({ ID: requestId }));
    const details = await this._loadDetails(tx, request?.requestType_code, requestId);
    // New Contract keeps the SCM SPOC on its line items, which _loadDetails does not read.
    const itemsEntityName = ITEMS_ENTITY_BY_REQUEST_TYPE[request?.requestType_code];
    if (details && itemsEntityName) {
      details.items = await tx.run(SELECT.from(this.db[itemsEntityName])
        .where({ details_ID: details.ID })
        .orderBy("itemNo"));
    }
    const assignment = await this._approverAssignment(config, details);
    if (config?.isApproval || config?.roleCode === "APPROVER") {
      this._assertRequesterNotApprover(null, request?.requester_ID, { approver_ID: assignment.assignedUser_ID },
        request?.requesterAdminApprovalAllowed);
    }
    return assignment;
  }

  _assertRequesterNotApprover(req, requesterId, details, requesterAdminApprovalAllowed = false) {
    if (requesterAdminApprovalAllowed === true) return;
    const selected = [details?.approver_ID, details?.loaApprover_ID];
    if (requesterId && selected.some((approverId) => approverId
      && String(approverId).toLowerCase() === String(requesterId).toLowerCase())) {
      const message = "Requester cannot be the Approver of a request";
      if (req?.reject) return req.reject(400, message);
      throw Object.assign(new Error(message), { status: 400 });
    }
  }

  _isHumanAdmin(req) {
    return Boolean(req?.user?.is?.("CAAdmin") && !req.user.is("system-user"));
  }

  _assertCurrentAdminForSelfApproval(req, request, task, user) {
    if (!task?.isApproval || !request?.requester_ID || !task.assignedUser_ID) return;
    const requesterId = String(request.requester_ID).toLowerCase();
    if (String(task.assignedUser_ID).toLowerCase() !== requesterId) return;
    if (String(user?.ID || "").toLowerCase() !== requesterId || !this._isHumanAdmin(req)) {
      return req.reject(403, "Only a current administrator may approve their own request");
    }
  }

  // E-mail list fields ("a@x.com; b@y.com") that take a limited number of addresses.
  _assertEmailLimits(req, requestTypeCode, details) {
    const limits = { PURCHASE_ORDER: [["approvedPoRecipientEmail", "Approved PO Recipient Email", 5]] }[requestTypeCode] || [];
    for (const [name, label, max] of limits) {
      const count = String(details?.[name] || "").split(";").filter((email) => email.trim()).length;
      if (count > max) {
        return req.reject(400, `${label}: up to ${max} e-mail addresses (${count} entered)`);
      }
    }
  }

  // excludeRequestId lets a requester re-submit their own request without the
  // description colliding with the copy already stored against it.
  async _assertNoDuplicateMaterialDescription(req, requestTypeCode, details, excludeRequestId) {
    if (requestTypeCode !== "MATERIAL_CODE") {
      return;
    }
    const description = String(details?.description || "").trim();
    if (!description) {
      return;
    }
    const existing = await SELECT.one.from(this.db.MaterialCodeDetails)
      .columns("request_ID")
      .where({ description });
    if (!existing || (excludeRequestId && existing.request_ID === excludeRequestId)) {
      return;
    }
    const owner = await SELECT.one.from(this.db.CARequests)
      .columns("referenceNumber")
      .where({ ID: existing.request_ID });
    return req.reject(400, `Material description "${description}" already exists on request ${owner?.referenceNumber || "another request"}`);
  }

  // Rewrites an existing detail row and replaces its line items, so itemNo stays
  // contiguous no matter how the requester added or removed rows.
  async _updateDetails(tx, requestTypeCode, requestId, details) {
    const entityName = DETAIL_ENTITY_BY_REQUEST_TYPE[requestTypeCode];
    if (!entityName) {
      return;
    }
    const { items, headers, ...headerFields } = details;
    const existing = await tx.run(SELECT.one.from(this.db[entityName]).where({ request_ID: requestId }));
    if (!existing) {
      return this._insertDetails(tx, requestTypeCode, requestId, details);
    }
    await tx.run(UPDATE(this.db[entityName]).set(headerFields).where({ ID: existing.ID }));

    await this._replaceDetailRows(tx, ITEMS_ENTITY_BY_REQUEST_TYPE[requestTypeCode], existing.ID, items);
    await this._replaceDetailRows(tx, HEADERS_ENTITY_BY_REQUEST_TYPE[requestTypeCode], existing.ID, headers);
  }

  // Replaces a detail row's child collection, renumbering itemNo so it stays contiguous no
  // matter how the requester added or removed rows.
  async _replaceDetailRows(tx, entityName, detailsId, rows) {
    if (!entityName || !Array.isArray(rows)) {
      return;
    }
    await tx.run(DELETE.from(this.db[entityName]).where({ details_ID: detailsId }));
    if (rows.length) {
      await tx.run(INSERT.into(this.db[entityName]).entries(rows.map((row, index) => ({
        ID: cds.utils.uuid(),
        details_ID: detailsId,
        ...row,
        itemNo: index + 1
      }))));
    }
  }

  async _insertDetails(tx, requestTypeCode, requestId, details) {
    const entityName = DETAIL_ENTITY_BY_REQUEST_TYPE[requestTypeCode];
    if (!entityName) {
      return;
    }
    const { items, headers, priceChanges, serviceAdditions, materialAdditions, ...headerFields } = details;
    const changeRows = { priceChanges, serviceAdditions, materialAdditions };
    const detailsId = cds.utils.uuid();
    await tx.run(INSERT.into(this.db[entityName]).entries({
      ID: detailsId,
      request_ID: requestId,
      ...headerFields
    }));

    const itemsEntityName = ITEMS_ENTITY_BY_REQUEST_TYPE[requestTypeCode];
    if (itemsEntityName && Array.isArray(items) && items.length) {
      await tx.run(INSERT.into(this.db[itemsEntityName]).entries(items.map((item, index) => ({
        ID: cds.utils.uuid(),
        details_ID: detailsId,
        itemNo: index + 1,
        ...item
      }))));
    }

    const headersEntityName = HEADERS_ENTITY_BY_REQUEST_TYPE[requestTypeCode];
    if (headersEntityName && Array.isArray(headers) && headers.length) {
      await tx.run(INSERT.into(this.db[headersEntityName]).entries(headers.map((header, index) => ({
        ID: cds.utils.uuid(),
        details_ID: detailsId,
        itemNo: index + 1,
        ...header
      }))));
    }

    if (requestTypeCode === "OUTLINE_CONTRACT") {
      const changeItems = Object.entries(CHANGE_ITEM_TYPES).flatMap(([key, changeType]) =>
        (Array.isArray(changeRows[key]) ? changeRows[key] : []).map((row, index) => ({
          ID: cds.utils.uuid(),
          details_ID: detailsId,
          changeType,
          itemNo: index + 1,
          code: row.code,
          price: row.price ?? null,
          quantity: row.quantity ?? null
        })));
      if (changeItems.length) {
        await tx.run(INSERT.into(this.db.OutlineContractChangeItems).entries(changeItems));
      }
    }
  }

  async _getPORequester(req, userId) {
    const user = await this.master.run(SELECT.one.from(this.masterEntities.Users)
      .where({ ID: userId, isActive: true }));
    if (!user) {
      return req.reject(400, "Selected requester was not found or is inactive in shared Flowmate master data");
    }
    return user;
  }

  async _ensureCurrentUser(req) {
    if (req.user.is("system-user")) {
      return req.reject(403, "This operation requires a provisioned business user");
    }
    const loginId = String(req.user.id || "").trim();
    const emailFromToken = String(
      req.user.attr?.email || req.user.attr?.mail || loginId
    ).trim();
    const normalizedLoginId = loginId.toLowerCase();
    const normalizedEmail = emailFromToken.toLowerCase();
    const activeUsers = await this.master.run(
      SELECT.from(this.masterEntities.Users).where({ isActive: true })
    );
    const user = activeUsers.find((candidate) => {
      const candidateEmail = String(candidate.email || "").trim().toLowerCase();
      const candidatePrincipal = String(
        candidate.userPrincipalName || ""
      ).trim().toLowerCase();

      return candidateEmail === normalizedEmail
        || candidatePrincipal === normalizedLoginId;
    });

    if (user) {
      return user;
    }
    return req.reject(403, "Your user is not provisioned in the shared Flowmate master data service");
  }

  async _assertTaskAccess(req, task, user) {
    if (task.assignedUser_ID) {
      if (await this._canActOnTask(req, user.ID, task.assignedUser_ID)) {
        return;
      }
      return req.reject(403, req.user.is("CAAdmin")
        ? "Assign this task to yourself before taking action"
        : "This task is assigned to another user and is not covered by an active delegation");
    }
    if (task.assignedTeam_ID) {
      const membership = await this.master.run(SELECT.one.from(this.masterEntities.TeamMembers).where({
        team_ID: task.assignedTeam_ID,
        user_ID: user.ID,
        isActive: true
      }));
      if (membership) {
        return req.reject(409, "Assign this team task to yourself before taking action");
      }
    }
    req.reject(403, "This task is not assigned to you or your team");
  }

  async _canActOnTask(req, actingUserId, assignedUserId) {
    if (req.user.is("CAAdmin")) return Boolean(actingUserId && assignedUserId && actingUserId === assignedUserId);
    return this._canActForUser(req, actingUserId, assignedUserId);
  }

  _assertMutableRequest(req, request) {
    if ([REQUEST_STATUS.COMPLETED, REQUEST_STATUS.REJECTED].includes(request.status_code)) {
      req.reject(409, "Completed or rejected requests cannot be changed");
    }
  }

  // The stored details with their line items and header rows, without technical columns,
  // so versions compare like for like.
  async _detailsSnapshot(tx, requestTypeCode, requestId) {
    const details = await this._loadDetails(tx, requestTypeCode, requestId);
    if (!details) {
      return null;
    }
    const clean = (row) => Object.fromEntries(Object.entries(row)
      .filter(([key]) => !VERSION_TECHNICAL_FIELDS.has(key)));
    const rowsOf = async (entityName) => entityName
      ? (await tx.run(SELECT.from(this.db[entityName]).where({ details_ID: details.ID }).orderBy("itemNo"))).map(clean)
      : [];
    const snapshot = clean(details);
    snapshot.items = await rowsOf(ITEMS_ENTITY_BY_REQUEST_TYPE[requestTypeCode]);
    snapshot.headers = await rowsOf(HEADERS_ENTITY_BY_REQUEST_TYPE[requestTypeCode]);
    return snapshot;
  }

  // Version 1 on creation; then the requester's resubmission after each send-back (a further
  // save in the same round replaces that round's version), and each approval that changed the
  // data (approverStep: the step it was made at). A save that changes nothing adds nothing.
  // With baselineOf, only records the current data as version 1 when the request has none.
  async _recordVersion(tx, requestId, requestTypeCode, user, { baselineOf, approverStep } = {}) {
    const versions = await tx.run(SELECT.from(this.db.RequestVersions)
      .columns("ID", "versionNo", "createdAt", "snapshot", "stepName")
      .where({ request_ID: requestId })
      .orderBy("versionNo desc"));
    if (baselineOf && versions.length) {
      return;
    }
    // A request created before versions were kept starts them at the requester's resubmission.
    if (approverStep && !versions.length) {
      return;
    }
    const snapshot = await this._detailsSnapshot(tx, requestTypeCode, requestId);
    if (!snapshot) {
      return;
    }
    const json = JSON.stringify(snapshot);
    const latest = versions[0];
    if (latest && latest.snapshot === json) {
      return;
    }
    // An approver filling in blank approval data is not a new version: it joins the current one.
    // Only changing a value that was already there makes one.
    if (latest && approverStep && !changedFilledValues(JSON.parse(latest.snapshot || "{}"), snapshot).length) {
      await tx.run(UPDATE(this.db.RequestVersions).set({ snapshot: json }).where({ ID: latest.ID }));
      return;
    }
    if (latest && !approverStep && !latest.stepName) {
      const sentBack = await tx.run(SELECT.one.from(this.db.CAHistory)
        .columns("createdAt")
        .where({ request_ID: requestId, action: "TASK_SENT_BACK" })
        .orderBy("createdAt desc"));
      const newRound = sentBack && new Date(sentBack.createdAt) > new Date(latest.createdAt);
      if (!newRound) {
        await tx.run(UPDATE(this.db.RequestVersions)
          .set({ snapshot: json, createdByName: user.displayName })
          .where({ ID: latest.ID }));
        return;
      }
    }
    await tx.run(INSERT.into(this.db.RequestVersions).entries({
      ID: cds.utils.uuid(),
      request_ID: requestId,
      versionNo: latest ? latest.versionNo + 1 : 1,
      snapshot: json,
      createdByName: baselineOf ? baselineOf.requesterName : user.displayName,
      stepNo: approverStep ? approverStep.stepNo : null,
      stepName: approverStep ? approverStep.stepName : null,
      ...(baselineOf ? { createdAt: baselineOf.createdAt } : {})
    }));
  }

  async _writeHistory(tx, requestId, stepNo, action, user, oldStatus, newStatus, remarks) {
    await tx.run(INSERT.into(this.db.CAHistory).entries({
      ID: cds.utils.uuid(),
      request_ID: requestId,
      stepNo,
      action,
      actorName: user.displayName,
      actorEmail: user.email,
      oldStatus,
      newStatus,
      remarks
    }));
  }

  async _teamIdsOf(user) {
    const memberships = await this.master.run(SELECT.from(this.masterEntities.TeamMembers)
      .columns("team_ID")
      .where({ user_ID: user.ID, isActive: true }));
    return memberships.map((membership) => membership.team_ID);
  }

  async _count(entity, where) {
    const query = SELECT.one.from(entity).columns("count(1) as count");
    const result = await (Object.keys(where || {}).length ? query.where(where) : query);
    return Number(result?.count || 0);
  }

  _parseDetails(req, value) {
    if (!value) {
      return {};
    }
    try {
      return typeof value === "string" ? JSON.parse(value) : value;
    } catch (_error) {
      req.reject(400, "Request details contain invalid JSON");
    }
  }

  // "<Request ID>-T01", "-T02", ...: the request's tasks numbered in the order they are created.
  async _taskReferenceNumber(tx, requestId) {
    const [request, count] = await Promise.all([
      tx.run(SELECT.one.from(this.db.CARequests).columns("referenceNumber").where({ ID: requestId })),
      tx.run(SELECT.one.from(this.db.CATasks).columns("count(1) as n").where({ request_ID: requestId }))
    ]);
    return formatTaskReference(request?.referenceNumber, Number(count?.n || 0) + 1);
  }
};

module.exports.REQUEST_OUTCOME = REQUEST_OUTCOME;
module.exports.formatTaskReference = formatTaskReference;
// Rules and texts used by the service, exported for the unit tests.
Object.assign(module.exports, {
  buildPoLifecycle,
  buildSpendAnalysis,
  failStatus,
  slaStatus,
  renderPoLifecyclePdf,
  renderSpendAnalysisPdf,
  validatedChartSnapshots,
  isPoApprovalCompletionStep,
  procurementCategoryForVariant,
  withVariantProcurementCategory,
  BUDGET_CHECK,
  budgetDetailsEntity,
  isBudgetCheckStep,
  isS4ValidationStep,
  approvalBlockedByBudgetCheck,
  sesDateProblem,
  withoutMultipleLineTaxFields,
  completionRecipients,
  changedFilledValues,
  formatAssignedDate,
  taskAtStep,
  sentBackStatus,
  approvalDataText
});
