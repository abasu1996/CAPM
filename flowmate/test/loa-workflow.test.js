const test = require("node:test");
const assert = require("node:assert/strict");
const cds = require("@sap/cds");
const FlowmateService = require("../srv/flowmate");

test("queue API projections are read-only in the compiled service model", async () => {
  const path = require("node:path");
  const model = await cds.load(path.join(__dirname, "../srv/flowmate.cds"));
  for (const name of ["TeamUnreservedRequests", "MyAssignedTasks", "MyPendingApprovalTasks", "MyTeamTasks", "RequestDetailTasks"]) {
    assert.equal(model.definitions[`FlowmateService.${name}`]["@readonly"], true, name);
  }
  assert.equal(model.definitions["flowmate.db.ProcessStepConfig"].elements.stepType.default.val, "PROCESSING");
});

// Isolated CQN fixture: no application server, SQLite, HANA or remote master data.
// Real workflow methods run against deterministic in-memory records.
function fixture(t, { upfront = false, last = false, legacy = false } = {}) {
  const steps = upfront
    ? [{ ID: "s1", stepNo: 1, stepName: "LoA Approval", stepType: "LOA" }]
    : [{ ID: "s1", stepNo: 1, stepName: "Validate", stepType: "PROCESSING" },
      { ID: "s2", stepNo: 2, stepName: "LoA Approval", stepType: "LOA" }];
  if (!last) steps.push({ ID: "s3", stepNo: 3, stepName: "Payment", stepType: "PROCESSING" });
  steps.forEach((step) => { step.subProcessType_code = "TEST"; step.slaDays = 2; });
  const plan = legacy ? { loaWorkflowMode: null, loaStepNo: null } : {
    loaWorkflowMode: "GUIDED", loaStepNo: upfront ? 1 : 2,
    loaBeforeProcessing: upfront, loaApprovalState: "WAITING"
  };
  const request = { ID: "r1", subProcessType_code: "TEST", processType_code: "MAIN",
    currentStep: 1, status_code: "IN_PROGRESS", amount: 250, role: "MANAGER", currency_code: "LKR",
    reservedBy: "Processor", reservedByUser_ID: "processor", reservedAt: "2026-10-01T00:00:00Z",
    processorUser_ID: "processor", processor: "Processor", processorTeam_ID: "team", ...plan };
  const rows = {
    ProcessRequests: [request], ProcessStepConfig: steps, Invoices: [],
    ProcessSubTypes: [{ code: "TEST", loaApprovalApplicable: true }],
    ProcessTasks: upfront ? [] : [{ ID: "validation", request_ID: "r1", stepNo: 1, status_code: "APPROVED", isMandatory: true }],
    Users: [1, 2].map((n) => ({ ID: `approver${n}`, displayName: `Approver ${n}`, email: `approver${n}@example.com`, isActive: true, role_code: "MANAGER" }))
  };
  const queries = [], history = [], notifications = [];
  const value = (term, row) => term?.ref ? row[term.ref.at(-1)] : term?.list ? term.list.map((entry) => value(entry, row)) : term?.val;
  function matches(expression, row) {
    if (!expression?.length) return true;
    let i = 0;
    const atom = () => {
      const left = expression[i++];
      if (left.xpr) return matches(left.xpr, row);
      let op = expression[i++];
      if (op === "not") op += ` ${expression[i++]}`;
      const right = expression[i++];
      const a = value(left, row), b = value(right, row);
      switch (op) {
        case "=": return a === b;
        case "!=": return a !== b;
        case "in": return b.includes(a);
        case "not in": return !b.includes(a);
        default: throw new Error(`Unsupported test predicate ${op}`);
      }
    };
    let result = atom();
    while (i < expression.length) {
      const op = expression[i++], next = atom();
      result = op === "and" ? result && next : result || next;
    }
    return result;
  }
  async function run(query) {
    if (Array.isArray(query)) return Promise.all(query.map(run));
    queries.push(query);
    const statement = query.SELECT || query.UPDATE || query.INSERT;
    assert.ok(statement, "Unexpected CQN operation");
    const from = statement.from || statement.entity || statement.into;
    const segment = typeof from === "string" ? from : from.ref[0];
    const table = segment.id || segment;
    const data = rows[table];
    assert.ok(data, `Unknown fixture entity ${table}`);
    if (query.INSERT) { data.push(...structuredClone(statement.entries)); return 1; }
    const selected = data.filter((row) => matches(statement.where, row) && matches(segment.where, row));
    if (query.UPDATE) { selected.forEach((row) => Object.assign(row, statement.data)); return selected.length; }
    if (statement.orderBy) selected.sort((a, b) => a.stepNo - b.stepNo);
    return structuredClone(statement.one ? selected[0] : selected);
  }
  t.mock.method(cds, "tx", () => ({ run }));
  const service = {};
  for (const name of Object.getOwnPropertyNames(FlowmateService.prototype)) {
    if (name !== "constructor") service[name] = FlowmateService.prototype[name];
  }
  Object.assign(service, {
    entities: Object.fromEntries(Object.keys(rows).map((name) => [name, name])),
    masterEntities: { Users: "Users" }, master: { run },
    _getSteps: async () => structuredClone(steps), _clearConfigCache() {},
    _dbProcessTasksEntity: () => "ProcessTasks",
    _resolveLoaRole: async () => "MANAGER",
    _calculateSlaDeadline: async () => ({ slaDueAt: "2026-10-10T12:00:00Z" }),
    _nextReferenceNumber: async () => `TSK-${rows.ProcessTasks.length + 1}`,
    _notifyTaskAssignment: async (req, entry) => notifications.push(entry),
    _notifyTeamAssignment: async (req, entry) => notifications.push(entry),
    _writeHistory: async (req, entry) => history.push(entry),
    _syncTaskTeamMembersFromTeam: async () => {},
    _rejectIfTaskAssignedToAnotherUser: async () => {},
    _currentReservationUser: async () => ({ user: rows.Users[0] }),
    _activeTeamIdsForUser: async () => ["team"],
    _isAdministrator: () => false,
    _now: () => "2026-10-06T10:00:00Z"
  });
  const req = { data: {}, event: "CREATE", user: { id: "approver1" },
    reject(code, message) { throw Object.assign(new Error(message), { code }); } };
  return { service, req, request, rows, steps, queries, history, notifications };
}

test("planning supports approval-first, submission then approval, later approval, legacy and disabled", (t) => {
  const { service: s } = fixture(t);
  const enabled = { loaApprovalApplicable: true };
  const normal = { stepNo: 1, stepName: "Validate" };
  const gate = { stepNo: 2, stepType: "LOA" };
  assert.equal(s._loaPlan(enabled, [gate]).loaBeforeProcessing, true);
  assert.equal(s._loaPlan(enabled, [{ ...normal, role: "Requester" }, gate]).loaBeforeProcessing, true);
  assert.equal(s._loaPlan(enabled, [normal, gate]).loaApprovalState, "WAITING");
  assert.equal(s._loaPlan(enabled, [normal]).loaWorkflowMode, "LEGACY");
  assert.equal(s._loaPlan({}, [normal]).loaWorkflowMode, "NONE");
  assert.throws(() => s._loaPlan(enabled, [gate, gate]), /Only one/);
  assert.throws(() => s._loaPlan({}, [gate]), /Enable LoA/);
});

for (const upfront of [true, false]) {
  test(`${upfront ? "upfront" : "later"} approval starts once, resolves users, and resumes correctly`, async (t) => {
    const f = fixture(t, { upfront });
    const { service: s, req, request, rows, steps } = f;
    const gate = steps.find((step) => step.stepType === "LOA");
    await s._startConfiguredLoa(req, "r1", gate);
    await s._startConfiguredLoa(req, "r1", gate);
    assert.equal(request.status_code, "PENDING_APPROVAL");
    assert.equal(request.loaApprovalState, "PENDING");
    const approvals = rows.ProcessTasks.filter((task) => task.isLoaApproval);
    assert.equal(approvals.length, 2);
    assert.ok(approvals.every((task) => task.stepNo === gate.stepNo));
    assert.equal(f.notifications.length, 2);
    await s._decideLoaApproval(req, approvals[0], "APPROVED", "Approved");
    assert.equal(request.status_code, "IN_PROGRESS");
    assert.equal(request.currentStep, 3);
    assert.equal(request.loaApprovalState, "APPROVED");
    assert.equal(request.processorUser_ID, upfront ? null : "processor");
    assert.equal(request.reservedBy, upfront ? null : "Processor");
    assert.equal(request.processorTeam_ID, "team");
    assert.equal(approvals[1].decision, "SUPERSEDED");
    assert.equal(s._areStepTasksComplete(approvals), true);
    assert.equal(rows.ProcessTasks.filter((task) => task.stepNo === 3).length, 1);
    assert.equal(f.history.at(-1).stepNo, gate.stepNo);
    assert.equal(f.history.at(-1).newStatus, "IN_PROGRESS");
    assert.ok(f.queries.some((query) => query.SELECT?.forUpdate), "Request row is locked");
    await assert.rejects(() => s._decideLoaApproval(req, approvals[1], "APPROVED", "Again"), /already been decided/);
    await assert.rejects(() => s._startConfiguredLoa(req, "r1", gate), /finalized/);
  });
}

test("rejection stops the workflow without generating the next processing task", async (t) => {
  const { service: s, req, request, rows, steps } = fixture(t);
  await s._startConfiguredLoa(req, "r1", steps[1]);
  await s._decideLoaApproval(req, rows.ProcessTasks.find((task) => task.isLoaApproval), "REJECTED", "Incorrect amount");
  assert.equal(request.status_code, "REJECTED");
  assert.equal(request.loaApprovalState, "REJECTED");
  assert.equal(rows.ProcessTasks.some((task) => task.stepNo === 3), false);
});

test("a final LoA step completes the request after approval", async (t) => {
  const { service: s, req, request, rows, steps } = fixture(t, { last: true });
  await s._startConfiguredLoa(req, "r1", steps[1]);
  await s._decideLoaApproval(req, rows.ProcessTasks.find((task) => task.isLoaApproval), "APPROVED", "Done");
  assert.equal(request.status_code, "COMPLETED");
  assert.ok(request.completedAt);
});

test("incomplete earlier tasks block entry to a final LoA gate", async (t) => {
  const { service: s, req, rows, steps } = fixture(t, { last: true });
  rows.ProcessTasks[0].status_code = "OPEN";
  await assert.rejects(() => s._startConfiguredLoa(req, "r1", steps[1]), /Finish step 1/);
});

test("advancement cannot jump over an unapproved LoA gate", async (t) => {
  const { service: s, req, request, steps } = fixture(t);
  s._findIncompleteMandatoryTaskStep = async () => null;
  s._guidedCompletionChoice = async () => ({ requiresDecision: true, incompleteStepNo: 3 });
  await s._advanceGuidedStep(req, "r1", request, steps, steps[0], "Next", "jumpIncomplete", { action: "STEP_COMPLETED" });
  assert.equal(request.currentStep, 2);
  assert.equal(request.status_code, "PENDING_APPROVAL");
});

test("amount is re-evaluated at the gate, including multi-field sources", async (t) => {
  const { service: s, req, request, steps } = fixture(t);
  request.subProcessType_code = "NON_PO_IDEAMART";
  request.brcHighestTransactionValue = 500;
  request.whtNicHighestTransactionValue = 700;
  s._resolveLoaRole = async (req, entity, amount) => { assert.equal(amount, 700); return "MANAGER"; };
  await s._startConfiguredLoa(req, "r1", steps[1]);
  assert.equal(request.amount, 700);
});

test("missing matrix or missing active approvers fails instead of silently skipping approval", async (t) => {
  const { service: s, req, rows, steps } = fixture(t);
  s._resolveLoaRole = async () => "";
  await assert.rejects(() => s._startConfiguredLoa(req, "r1", steps[1]), /No LoA approval rule/);
  s._resolveLoaRole = async () => "MANAGER";
  rows.Users.length = 0;
  await assert.rejects(() => s._startConfiguredLoa(req, "r1", steps[1]), /No active user/);
  // CAP supplies transaction rollback in production; the fixture does not simulate rollback.
});

test("new request snapshots configuration; client cannot supply workflow state", async (t) => {
  const { service: s, req } = fixture(t);
  req.data = { subProcessType_code: "TEST" };
  await s._prepareLoaSnapshot(req, null, { loaApprovalApplicable: true });
  assert.equal(req.data.loaWorkflowMode, "GUIDED");
  assert.equal(req.data.loaApprovalState, "WAITING");
  assert.equal(req.data.status_code, "DRAFT");
  await assert.rejects(() => s._prepareLoaSnapshot(req, null, {}), /managed by the server/);
});

test("pending requests and approved financial basis cannot be edited", async (t) => {
  const { service: s, req, request } = fixture(t);
  request.status_code = "PENDING_APPROVAL";
  await assert.rejects(() => s._prepareLoaSnapshot(req, request, {}), /awaiting LoA/);
  request.status_code = "IN_PROGRESS";
  request.loaApprovalState = "APPROVED";
  req.data = { amount: 251 };
  await assert.rejects(() => s._prepareLoaSnapshot(req, request, {}), /approved amount/);
  req.data = { amount: "250.00" };
  await s._prepareLoaSnapshot(req, request, {});
  req.data = { currentStep: 3 };
  await assert.rejects(() => s._prepareLoaSnapshot(req, request, {}), /workflow actions/);
});

test("manual task writes cannot forge LoA tasks or skip an unapproved gate", async (t) => {
  const { service: s, req } = fixture(t);
  req.data = { request_ID: "r1", isLoaApproval: true };
  await assert.rejects(() => s._validateManualTaskLoaFields(req), /workflow only/);
  req.data = { request_ID: "r1", stepNo: 3 };
  await assert.rejects(() => s._validateManualTaskLoaFields(req), /Complete LoA/);
  req.data.stepNo = 1;
  await s._validateManualTaskLoaFields(req);
});

test("active configured requests freeze Admin step changes; duplicate gates are rejected", async (t) => {
  const { service: s, req, rows } = fixture(t);
  req.event = "UPDATE";
  req.data = { ID: "s2", stepName: "Changed" };
  await assert.rejects(() => s._validateLoaStepConfig(req), /Finish active requests/);
  rows.ProcessRequests[0].status_code = "COMPLETED";
  await s._validateLoaStepConfig(req);
  req.data = { ID: "s1", stepType: "LOA" };
  await assert.rejects(() => s._validateLoaStepConfig(req), /Only one LoA/);
});

test("legacy approval still uses the existing two-leading-step completion", async (t) => {
  const { service: s, req, request, rows } = fixture(t, { legacy: true });
  request.status_code = "PENDING_APPROVAL";
  let options;
  s._ensureInitialGuidedTask = async (req, id, request, settings) => { options = settings; };
  await s._createLoaApprovalTasks(req, request);
  const task = rows.ProcessTasks.find((entry) => entry.isLoaApproval);
  assert.equal(task.stepNo, 0);
  await s._decideLoaApproval(req, task, "APPROVED", "Legacy");
  assert.equal(options.autoCompleteSteps, 2);
});

test("invoice-based approval uses persisted invoice amounts rather than a stale header", async (t) => {
  const { service: s, req, request, rows, steps } = fixture(t);
  request.subProcessType_code = "PO_BEFORE_INVOICE_ADVANCE";
  request.highestInvoiceValue = 1;
  rows.Invoices.push({ ID: "i1", request_ID: "r1", amount: 350 }, { ID: "i2", request_ID: "r1", amount: 600 });
  s._resolveLoaRole = async (req, entity, amount) => { assert.equal(amount, 600); return "MANAGER"; };
  await s._startConfiguredLoa(req, "r1", steps[1]);
  assert.equal(request.amount, 600);
  assert.equal(request.highestInvoiceValue, 600);
});

test("invoice endpoint and deep writes cannot alter an approved invoice basis", async (t) => {
  const { service: s, req, request, rows } = fixture(t);
  request.subProcessType_code = "PO_BEFORE_INVOICE_ADVANCE";
  request.loaApprovalState = "APPROVED";
  rows.Invoices.push({ ID: "i1", request_ID: "r1", amount: 250 });
  s._rejectIfRequestLocked = async () => {};
  req.event = "UPDATE";
  req.data = { ID: "i1", amount: 1000 };
  await assert.rejects(() => s._validateLoaInvoiceWrite(req), /Invoices used for an approved LoA/);
  req.data = { invoices: [{ ID: "i1", amount: 1000 }] };
  await assert.rejects(() => s._prepareLoaSnapshot(req, request, {}), /Invoices used for an approved LoA/);
});

test("inline task writes cannot forge approval or pre-complete later steps", async (t) => {
  const { service: s, req, request } = fixture(t);
  req.data = { tasks: [{ isLoaApproval: true, status_code: "APPROVED" }] };
  await assert.rejects(() => s._prepareLoaSnapshot(req, request, {}), /task endpoints/);
  req.data.subProcessType_code = "TEST";
  await assert.rejects(() => s._prepareLoaSnapshot(req, null, {}), /do not supply inline tasks/);
});

test("a normal first processing step is not auto-approved for later LoA", async (t) => {
  const { service: s, req, request, rows } = fixture(t);
  rows.ProcessTasks.length = 0;
  await s._ensureInitialGuidedTask(req, "r1", request, { updateRequest: true, autoCompleteSteps: 1 });
  assert.equal(rows.ProcessTasks.length, 1);
  assert.equal(rows.ProcessTasks[0].status_code, "OPEN");
  assert.equal(rows.ProcessTasks[0].stepNo, 1);
  assert.equal(rows.ProcessTasks[0].isLoaApproval, undefined);
});

test("submission auto-completion cannot overwrite a landing LoA status", async (t) => {
  const { service: s, req, request, rows, steps } = fixture(t);
  rows.ProcessTasks.length = 0;
  steps[0].role = "Requester";
  request.requesterUser_ID = "requester";
  await s._autoCompleteLeadingSteps(req, "r1", request, steps, 1, "Submitted");
  assert.equal(rows.ProcessTasks[0].status_code, "APPROVED");
  assert.equal(request.status_code, "PENDING_APPROVAL");
  assert.equal(request.currentStep, 2);
});

test("team authorization is still enforced on LoA decisions", async (t) => {
  const { service: s, req, rows, steps } = fixture(t);
  await s._startConfiguredLoa(req, "r1", steps[1]);
  s._activeTeamIdsForUser = async () => ["unrelated-team"];
  await assert.rejects(() => s._decideLoaApproval(req, rows.ProcessTasks.find((task) => task.isLoaApproval), "APPROVED", ""), /processor team/);
});

test("a gate fails clearly when no role-matched approver has team access", async (t) => {
  const { service: s, req, rows, steps } = fixture(t);
  s._activeTeamIdsForUser = async () => ["unrelated-team"];
  await assert.rejects(() => s._startConfiguredLoa(req, "r1", steps[1]), /No eligible LoA approver belongs/);
  assert.equal(rows.ProcessTasks.filter((task) => task.isLoaApproval).length, 0);
});

test("UI renders an approved LoA with superseded peers as complete; pending requests cannot edit", () => {
  const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
  let controller;
  const context = { sap: { ui: { define(deps, factory) {
    controller = factory({ extend: (name, methods) => methods }, ...deps.slice(1).map(() => ({})));
  } } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../app/flowmate/webapp/controller/MyRequests.controller.js"), "utf8"), context);
  controller.getText = (key) => key;
  controller._sCurrentReservationUserId = "processor";
  const request = { currentStep: 2, processorUser_ID: "processor", reservedBy: "Processor", status_code: "PENDING_APPROVAL",
    tasks: [{ stepNo: 2, status_code: "OPEN", isLoaApproval: true, isMandatory: true }] };
  const steps = [{ stepNo: 2, stepName: "LoA", stepType: "LOA" }, { stepNo: 3, stepName: "Payment" }];
  assert.equal(controller._canCurrentUserModifyRequest(request), false);
  assert.equal(controller._buildProcessFlowSteps(steps, request)[0].completeEnabled, false);
  request.status_code = "IN_PROGRESS";
  request.currentStep = 3;
  request.tasks[0].status_code = "APPROVED";
  request.tasks.push({ stepNo: 2, status_code: "CANCELLED", isLoaApproval: true, decision: "SUPERSEDED", isMandatory: true });
  const result = controller._buildProcessFlowSteps(steps, request);
  assert.equal(result[0].state, "Success");
  assert.equal(result[0].completeEnabled, false);
});
