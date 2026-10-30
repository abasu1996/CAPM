const { test } = require("node:test");
const assert = require("node:assert/strict");
const FlowmateCAService = require("../srv/flowmate-ca");

const reject = (status, message) => {
  throw Object.assign(new Error(message), { status });
};

const requestFor = (...roles) => ({
  user: { is: (role) => roles.includes(role) },
  reject
});

test("creator can create and monitor but cannot validate, assign, or terminate", () => {
  const service = new FlowmateCAService("FlowmateCAService");
  const req = requestFor("CARequester");
  const access = service._roleCapabilities(req);
  assert.equal(access.canCreate, true);
  assert.equal(access.canViewDrafts, true);
  assert.equal(access.canValidate, false);
  assert.equal(access.canProcessAssignedTasks, true);
  assert.equal(access.canViewAllTasks, true);
  assert.equal(access.canAddTask, false);
  assert.equal(access.canViewSentBack, true);
  assert.equal(access.canViewTerminated, true);
  assert.equal(access.canAssign, false);
  assert.equal(access.canViewAllRequests, true);
  assert.equal(access.canViewReports, false);
  assert.equal(access.canTerminate, false);
  assert.doesNotThrow(() => service._requireCreator(req));
  assert.throws(() => service._requireValidator(req), { status: 403 });
  assert.throws(() => service._requireAdmin(req), { status: 403 });
});

test("validator can process tasks but cannot create, assign, or terminate", () => {
  const service = new FlowmateCAService("FlowmateCAService");
  const req = requestFor("CAProcessor");
  const access = service._roleCapabilities(req);
  assert.equal(access.canCreate, false);
  assert.equal(access.canViewDrafts, false);
  assert.equal(access.canValidate, true);
  assert.equal(access.canProcessAssignedTasks, true);
  assert.equal(access.canViewAllTasks, true);
  assert.equal(access.canAddTask, true);
  assert.equal(access.canViewSentBack, true);
  assert.equal(access.canViewTerminated, false);
  assert.equal(access.canAssign, false);
  assert.equal(access.canViewAllRequests, true);
  assert.equal(access.canViewReports, false);
  assert.equal(access.canTerminate, false);
  assert.doesNotThrow(() => service._requireValidator(req));
  assert.throws(() => service._requireCreator(req), { status: 403 });
});

test("supervisor can validate, assign, and maintain delegation but cannot create or terminate", () => {
  const service = new FlowmateCAService("FlowmateCAService");
  const req = requestFor("CASupervisor");
  const access = service._roleCapabilities(req);
  assert.equal(access.canCreate, false);
  assert.equal(access.canViewDrafts, false);
  assert.equal(access.canValidate, true);
  assert.equal(access.canProcessAssignedTasks, true);
  assert.equal(access.canViewAllTasks, true);
  assert.equal(access.canAddTask, true);
  assert.equal(access.canViewSentBack, true);
  assert.equal(access.canViewTerminated, false);
  assert.equal(access.canAssign, true);
  assert.equal(access.canManageDelegation, true);
  assert.equal(access.canViewAllRequests, true);
  assert.equal(access.canViewReports, true);
  assert.equal(access.canTerminate, false);
  assert.doesNotThrow(() => service._requireSupervisor(req));
  assert.throws(() => service._requireAdmin(req), { status: 403 });
});

test("administrator has every business capability", () => {
  const service = new FlowmateCAService("FlowmateCAService");
  const access = service._roleCapabilities(requestFor("CAAdmin"));
  assert.deepEqual(access, {
    isAdmin: true,
    isSupervisor: true,
    isValidator: true,
    isCreator: true,
    canCreate: true,
    canViewDrafts: true,
    canValidate: true,
    canProcessAssignedTasks: true,
    canViewAllTasks: true,
    canAddTask: true,
    canViewSentBack: true,
    canViewTerminated: true,
    canAssign: true,
    canManageDelegation: true,
    canViewAllRequests: true,
    canViewReports: true,
    canTerminate: true,
    canAdminister: true
  });
});

test("technical PO client retains createRequest access only", () => {
  const service = new FlowmateCAService("FlowmateCAService");
  const req = requestFor("system-user", "PORequestCreate");
  assert.doesNotThrow(() => service._requireCreateAccess(req));
  assert.equal(service._roleCapabilities(req).canViewAllRequests, false);
  assert.equal(service._roleCapabilities(req).canViewAllTasks, false);
  assert.throws(() => service._requireValidator(req), { status: 403 });
});

test("All Requests reads are global for business roles, but unavailable to technical clients", async () => {
  const service = new FlowmateCAService("FlowmateCAService");
  for (const role of ["CARequester", "CAProcessor", "CASupervisor", "CAAdmin"]) {
    const query = { where() { throw new Error(`${role} should see every request`); } };
    assert.doesNotThrow(() => service._filterRequestsByRole({ ...requestFor(role), query }));
  }
  const query = { where(value) { this.filter = value; } };
  await service._filterRequestsByRole({ ...requestFor(), query });
  assert.deepEqual(query.filter, { ID: null });
});

test("supervisor and administrator must own a task before processing", async () => {
  const service = new FlowmateCAService("FlowmateCAService");
  service._effectiveTaskUserIds = async (_req, userId) => [userId];
  await assert.rejects(service._assertTaskAccess(
    requestFor("CASupervisor"),
    { assignedUser_ID: "validator", assignedTeam_ID: "team" },
    { ID: "supervisor" }
  ), { status: 403 });
  await assert.rejects(service._assertTaskAccess(
    requestFor("CAAdmin"),
    { assignedUser_ID: "validator", assignedTeam_ID: "team" },
    { ID: "admin" }
  ), { status: 403 });
  await assert.doesNotReject(service._assertTaskAccess(
    requestFor("CAAdmin"),
    { assignedUser_ID: "admin", assignedTeam_ID: "team" },
    { ID: "admin" }
  ));
});

test("administrator cannot act on a delegator's task without self-assignment", async () => {
  const service = new FlowmateCAService("FlowmateCAService");
  service._effectiveTaskUserIds = async () => ["admin", "delegator"];
  await assert.rejects(service._assertTaskAccess(
    requestFor("CAAdmin"),
    { assignedUser_ID: "delegator" },
    { ID: "admin" }
  ), { status: 403 });
  await assert.doesNotReject(service._assertTaskAccess(
    requestFor("CAProcessor"),
    { assignedUser_ID: "delegator" },
    { ID: "admin" }
  ));
});

test("administrator My Tasks is limited to tasks assigned directly to the administrator", async () => {
  const service = new FlowmateCAService("FlowmateCAService");
  service._ensureCurrentUser = async () => ({ ID: "admin" });
  service._effectiveTaskUserIds = async () => ["admin", "delegator"];
  const query = { where(value) { this.filter = value; } };
  await service._filterMyTasks({ ...requestFor("CAAdmin"), query });
  assert.deepEqual(query.filter, { assignedUser_ID: { in: ["admin"] } });
  const delegatedQuery = { where(value) { this.filter = value; } };
  await service._filterMyTasks({ ...requestFor("CAProcessor"), query: delegatedQuery });
  assert.deepEqual(delegatedQuery.filter, { assignedUser_ID: { in: ["admin", "delegator"] } });
});

test("validator must claim an available team task before processing", async () => {
  const service = new FlowmateCAService("FlowmateCAService");
  service.masterEntities = { TeamMembers: "TeamMembers" };
  service.master = { run: async () => ({ ID: "membership" }) };
  await assert.rejects(service._assertTaskAccess(
    requestFor("CAProcessor"),
    { assignedUser_ID: null, assignedTeam_ID: "team" },
    { ID: "validator" }
  ), { status: 409 });
});

test("requester may process a task assigned directly to them but not another user's task", async () => {
  const service = new FlowmateCAService("FlowmateCAService");
  service._effectiveTaskUserIds = async () => ["requester"];
  await assert.doesNotReject(service._assertTaskAccess(
    requestFor("CARequester"),
    { assignedUser_ID: "requester", assignedTeam_ID: null },
    { ID: "requester" }
  ));
  await assert.rejects(service._assertTaskAccess(
    requestFor("CARequester"),
    { assignedUser_ID: "someone-else", assignedTeam_ID: null },
    { ID: "requester" }
  ), { status: 403 });
});

test("request creation rejects the requester as the selected approver", async () => {
  const service = new FlowmateCAService("FlowmateCAService");
  service._assertNoDuplicateMaterialDescription = async () => {};
  service._applyProjectCode = async () => {};
  service._applyReservationMaterialType = () => {};
  await assert.rejects(service._insertOneRequest(
    requestFor("CARequester"),
    { run() { throw new Error("An invalid request must not be inserted"); } },
    { ID: "requester" },
    {
      requestType: { code: "SERVICE_ENTRY_SHEET" },
      input: { details: JSON.stringify({ loaApprover_ID: "REQUESTER" }) }
    }
  ), { status: 400, message: "Requester cannot be the Approver of a request" });
  assert.doesNotThrow(() => service._assertRequesterNotApprover(
    requestFor("CARequester"), "requester", { loaApprover_ID: "someone-else" }
  ));
  await assert.rejects(service._insertOneRequest(
    requestFor("CARequester"),
    { run() { throw new Error("An invalid successor must not be inserted"); } },
    { ID: "requester" },
    {
      requestType: { code: "PURCHASE_ORDER" },
      input: { details: JSON.stringify({
        sesRequired: true,
        sesDraft: JSON.stringify({ loaApprover_ID: "requester" })
      }) }
    }
  ), { status: 400, message: "Requester cannot be the Approver of a request" });
});

test("all business roles can read any submitted task and its request context", async () => {
  const service = new FlowmateCAService("FlowmateCAService");
  for (const role of ["CARequester", "CAProcessor", "CASupervisor", "CAAdmin"]) {
    const query = { where() { throw new Error(`${role} must not receive a task read filter`); } };
    service._filterTasksByRole({ ...requestFor(role), query });
    service._filterRequestChildrenByRole({ ...requestFor(role), query });
  }
});

test("technical clients cannot read tasks or submitted request details", () => {
  const service = new FlowmateCAService("FlowmateCAService");
  const taskQuery = { where(value) { this.filter = value; } };
  service._filterTasksByRole({ ...requestFor("system-user", "PORequestCreate"), query: taskQuery });
  assert.deepEqual(taskQuery.filter, { ID: null });
  const detailQuery = { where(value) { this.filter = value; } };
  service._filterRequestChildrenByRole({ ...requestFor("system-user", "PORequestCreate"), query: detailQuery });
  assert.deepEqual(detailQuery.filter, { request_ID: null });
});

test("normal attachment reads exclude drafts even when business users can read submitted requests", async () => {
  const service = new FlowmateCAService("FlowmateCAService");
  const filters = [];
  await service._filterRequestAttachments({ ...requestFor("CARequester"), query: { where(value) { filters.push(value); } } });
  assert.deepEqual(filters, [{ draft_ID: null }]);
});
