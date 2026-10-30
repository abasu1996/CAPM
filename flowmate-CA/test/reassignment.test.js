const { test } = require("node:test");
const assert = require("node:assert/strict");
const cds = require("@sap/cds");
const FlowmateCAService = require("../srv/flowmate-ca");

const reject = (status, message) => { throw Object.assign(new Error(message), { status }); };

function setup() {
  const service = new FlowmateCAService("FlowmateCAService");
  service.db = { CARequests: "requests", CATasks: "tasks", CAHistory: "history", RequestStepInstances: "steps" };
  service.masterEntities = { Users: "users" };
  const rows = {
    requests: [{ ID: "request", requester_ID: "original", requesterName: "Original", owner_ID: "old", status_code: "IN_PROGRESS", currentStep: 2 }],
    steps: [{ ID: "step1", slaDays: 2 }],
    history: [],
    tasks: [
      { ID: "requester-open", request_ID: "request", stepNo: 1, assignedUser_ID: "old", status_code: "OPEN", isApproval: false },
      { ID: "other-open", request_ID: "request", stepNo: 2, assignedUser_ID: "other", status_code: "OPEN" },
      { ID: "historic", request_ID: "request", stepNo: 1, assignedUser_ID: "old", status_code: "APPROVED" },
      { ID: "superseded", request_ID: "request", stepNo: 1, assignedUser_ID: "old", status_code: "OPEN", isSuperseded: true },
      { ID: "approval", request_ID: "request", stepNo: 1, assignedUser_ID: "old", status_code: "OPEN", isApproval: true }
    ]
  };
  const matches = (row, where) => {
    for (let index = 0; index < (where || []).length; index += 4) {
      const value = row[where[index].ref[0]];
      if (where[index + 1] === "in") {
        if (!where[index + 2].list.some((entry) => entry.val === value)) return false;
      } else if (value !== where[index + 2].val) return false;
    }
    return true;
  };
  const tx = { async run(query) {
    if (query.SELECT) {
      const found = rows[query.SELECT.from.ref[0]].filter((row) => matches(row, query.SELECT.where));
      return query.SELECT.one ? found[0] && { ...found[0] } : found.map((row) => ({ ...row }));
    }
    if (query.UPDATE) {
      const found = rows[query.UPDATE.entity.ref[0]].filter((row) => matches(row, query.UPDATE.where));
      found.forEach((row) => Object.assign(row, query.UPDATE.data));
      return found.length;
    }
    if (query.INSERT) {
      rows[query.INSERT.into.ref[0]].push(...query.INSERT.entries.map((row) => ({ ...row })));
      return query.INSERT.entries.length;
    }
    throw new Error("Unexpected query");
  } };
  service._ensureCurrentUser = async () => ({ ID: "admin", displayName: "Admin" });
  service.master = { run: async () => ({ ID: "new", displayName: "New User", email: "new@example.test", isActive: true }) };
  const history = [];
  const notifications = [];
  service._writeHistory = async (...args) => history.push(args);
  service._notifyTaskAssignment = async (_tx, task) => notifications.push(task);
  return { service, rows, tx, history, notifications };
}

function req(role, data) {
  return { user: { is: (name) => name === role }, data, reject };
}

test("admin transfers ownership and only the former owner's current requester work", async () => {
  const { service, rows, tx, history, notifications } = setup();
  const originalTx = cds.tx;
  cds.tx = () => tx;
  try {
    assert.equal(await service._reassignRequest(req("CAAdmin", { requestId: "request", userId: "new" })), true);
    assert.equal(rows.requests[0].owner_ID, "new");
    assert.equal(rows.requests[0].requester_ID, "original");
    assert.equal(rows.tasks[0].assignedUser_ID, "new");
    assert.deepEqual(rows.tasks.slice(1).map((task) => task.assignedUser_ID), ["other", "old", "old", "old"]);
    assert.equal(history[0][3], "REQUEST_REASSIGNED");
    assert.equal(notifications[0].assignedUser_ID, "new");
  } finally { cds.tx = originalTx; }
});

test("supervisor assigns a single open task without changing request ownership", async () => {
  const { service, rows, tx, history } = setup();
  const originalTx = cds.tx;
  cds.tx = () => tx;
  try {
    assert.equal(await service._reassignTask(req("CASupervisor", { taskId: "other-open", userId: "new" })), true);
    assert.equal(rows.tasks[1].assignedUser_ID, "new");
    assert.equal(rows.requests[0].owner_ID, "old");
    assert.equal(rows.tasks[0].assignedUser_ID, "old");
    assert.equal(history[0][3], "TASK_REASSIGNED");
  } finally { cds.tx = originalTx; }
});

test("an approval task cannot be reassigned to its requester", async () => {
  const { service, rows, tx } = setup();
  service.master.run = async () => ({ ID: "original", displayName: "Original", isActive: true });
  const originalTx = cds.tx;
  cds.tx = () => tx;
  try {
    await assert.rejects(service._reassignTask(req("CASupervisor", { taskId: "approval", userId: "original" })), {
      status: 400,
      message: "Requester cannot be the Approver of a request"
    });
    assert.equal(rows.tasks.find((task) => task.ID === "approval").assignedUser_ID, "old");
  } finally { cds.tx = originalTx; }
});

test("a requester cannot claim an approval task from a team queue", async () => {
  const { service, rows, tx } = setup();
  const approval = rows.tasks.find((task) => task.ID === "approval");
  approval.assignedUser_ID = null;
  approval.assignedTeam_ID = "team";
  service._ensureCurrentUser = async () => ({ ID: "original" });
  const originalTx = cds.tx;
  cds.tx = () => tx;
  try {
    await assert.rejects(service._claimTeamTask(req("CAProcessor", { taskId: "approval" })), {
      status: 400,
      message: "Requester cannot be the Approver of a request"
    });
    assert.equal(approval.assignedUser_ID, null);
  } finally { cds.tx = originalTx; }
});

test("a task paused in progress can also be reassigned without changing its status", async () => {
  const { service, rows, tx } = setup();
  rows.tasks[1].status_code = "IN_PROGRESS";
  const originalTx = cds.tx;
  cds.tx = () => tx;
  try {
    await service._reassignTask(req("CASupervisor", { taskId: "other-open", userId: "new" }));
    assert.equal(rows.tasks[1].assignedUser_ID, "new");
    assert.equal(rows.tasks[1].status_code, "IN_PROGRESS");
  } finally { cds.tx = originalTx; }
});

test("after send-back, requester work follows the new request owner without changing old tasks", async () => {
  const { service, rows, tx, notifications } = setup();
  rows.requests[0].owner_ID = "new";
  rows.history.push({ request_ID: "request", action: "REQUEST_REASSIGNED", remarks: "from=old; to=new" });
  rows.tasks = [{ ID: "previous", request_ID: "request", stepNo: 1, assignedUser_ID: "old", assignedName: "Old", status_code: "APPROVED", taskName: "Requester work", isMandatory: true }];
  service._resolveStepAssignment = async () => ({});
  service._slaDeadline = () => ({ slaDueAt: "2026-10-31T00:00:00Z" });
  service._taskReferenceNumber = async () => "TSK-NEW";
  service._refreshRequestSla = async () => {};
  await service._createConfiguredTaskIfMissing(tx, "request", { ID: "step1", stepNo: 1 });
  assert.equal(rows.tasks[0].assignedUser_ID, "old");
  assert.equal(rows.tasks[0].isSuperseded, true);
  assert.equal(rows.tasks[1].assignedUser_ID, "new");
  assert.equal(rows.tasks[1].reworkOf_ID, "previous");
  assert.equal(notifications[0].assignedUser_ID, "new");
});

test("send-back preserves a separately assigned requester-task processor", async () => {
  const { service, rows, tx } = setup();
  rows.requests[0].owner_ID = "new";
  rows.history.push({ request_ID: "request", action: "REQUEST_REASSIGNED", remarks: "from=old; to=new" });
  rows.tasks = [{ ID: "previous", request_ID: "request", stepNo: 1, assignedUser_ID: "other", status_code: "APPROVED", taskName: "Requester work" }];
  service._resolveStepAssignment = async () => ({});
  service._slaDeadline = () => ({});
  service._taskReferenceNumber = async () => "TSK-NEW";
  service._refreshRequestSla = async () => {};
  await service._createConfiguredTaskIfMissing(tx, "request", { ID: "step1", stepNo: 1 });
  assert.equal(rows.tasks[1].assignedUser_ID, "other");
});

test("a reassigned requester task can save details without transferring request ownership", async () => {
  const { service, rows, tx } = setup();
  rows.steps[0] = { ID: "step1", request_ID: "request", stepNo: 1, status: "OPEN" };
  rows.tasks[0].assignedUser_ID = "new";
  service._ensureCurrentUser = async () => ({ ID: "new" });
  service._effectiveTaskUserIds = async (_req, id) => [id];
  service._assertNoDuplicateMaterialDescription = async () => {};
  service._recordVersion = async () => {};
  let saved = false;
  service._updateDetails = async () => { saved = true; };
  const originalTx = cds.tx;
  cds.tx = () => tx;
  try {
    await service._saveRequesterDetails(req("CARequester", { requestId: "request", details: "{}" }));
    assert.equal(saved, true);
    assert.equal(rows.requests[0].owner_ID, "old");
    service._ensureCurrentUser = async () => ({ ID: "old" });
    await assert.rejects(service._saveRequesterDetails(req("CARequester", { requestId: "request", details: "{}" })), { status: 403 });
  } finally { cds.tx = originalTx; }
});

test("ordinary users, inactive targets, completed requests and historical tasks are rejected", async () => {
  const { service, rows, tx } = setup();
  const originalTx = cds.tx;
  cds.tx = () => tx;
  try {
    await assert.rejects(service._reassignTask(req("CAProcessor", { taskId: "other-open", userId: "new" })), { status: 403 });
    service.master.run = async () => null;
    await assert.rejects(service._reassignTask(req("CAAdmin", { taskId: "other-open", userId: "inactive" })), { status: 400 });
    service.master.run = async () => ({ ID: "new", isActive: true });
    await assert.rejects(service._reassignTask(req("CAAdmin", { taskId: "historic", userId: "new" })), { status: 409 });
    await assert.rejects(service._reassignTask(req("CAAdmin", { taskId: "superseded", userId: "new" })), { status: 409 });
    rows.requests[0].status_code = "COMPLETED";
    await assert.rejects(service._reassignRequest(req("CAAdmin", { requestId: "request", userId: "new" })), { status: 409 });
  } finally { cds.tx = originalTx; }
});

test("direct OData updates cannot bypass assignment actions", () => {
  const { service } = setup();
  assert.throws(() => service._protectRequestAssignment({ data: { owner_ID: "new" }, reject }), { status: 403 });
  assert.throws(() => service._protectRequestAssignment({ data: { tasks: [] }, reject }), { status: 403 });
  assert.throws(() => service._protectTaskAssignment({ data: { assignedUser_ID: "new" }, reject }), { status: 403 });
  assert.doesNotThrow(() => service._protectTaskAssignment({ data: { description: "text" }, reject }));
});

test("automatic PO handoff is not blocked when a different processor completes it", async () => {
  const { service, rows, tx } = setup();
  service.db.PurchaseOrderDetails = "purchaseOrders";
  rows.requests[0].status_code = "COMPLETED";
  rows.requests[0].requestType_code = "PURCHASE_ORDER";
  rows.purchaseOrders = [{ request_ID: "request", paymentRun: true, paymentRunDetails: null }];
  service._ensureCurrentUser = async () => ({ ID: "processor" });
  service._effectiveTaskUserIds = async (_req, id) => [id];
  const originalTx = cds.tx;
  cds.tx = () => tx;
  try {
    const input = req("CAProcessor", { requestId: "request" });
    await assert.rejects(service._createFlowmatePaymentRun(input), { status: 403 });
    // The internal completion path gets past authorization; deliberately missing details still fail validation.
    await assert.rejects(service._triggerFlowmateIntegrationIfRequired(input, "request"), {
      status: 400, message: "Payment Run details are missing"
    });
  } finally { cds.tx = originalTx; }
});
