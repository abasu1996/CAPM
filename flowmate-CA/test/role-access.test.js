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

test("all business roles can read the all-requests catalogue without receiving mutation capability", () => {
  const service = new FlowmateCAService("FlowmateCAService");
  for (const role of ["CARequester", "CAProcessor", "CASupervisor", "CAAdmin"]) {
    const req = requestFor(role);
    const query = { where() { throw new Error(`${role} must not be filtered`); } };
    assert.doesNotThrow(() => service._filterRequestsByRole({ ...req, query }));
  }
  const query = { where(value) { this.filter = value; } };
  service._filterRequestsByRole({ ...requestFor(), query });
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

test("requester All Tasks includes their requests and directly assigned approval tasks", async () => {
  const service = new FlowmateCAService("FlowmateCAService");
  service._ensureCurrentUser = async () => ({ ID: "requester" });
  service._effectiveTaskUserIds = async () => ["requester", "delegator"];
  const query = { where(value) { this.filter = value; } };
  await service._filterTasksByRole({ ...requestFor("CARequester"), query });
  const serialized = JSON.stringify(query.filter);
  assert.match(serialized, /requester_ID/);
  assert.match(serialized, /owner_ID/);
  assert.match(serialized, /assignedUser_ID/);
  assert.match(serialized, /requester/);
  assert.match(serialized, /delegator/);
});

test("processor All Tasks includes direct and active-team work", async () => {
  const service = new FlowmateCAService("FlowmateCAService");
  service._ensureCurrentUser = async () => ({ ID: "processor" });
  service._effectiveTaskUserIds = async () => ["processor"];
  service._teamIdsOf = async () => ["team-a", "team-b"];
  const query = { where(value) { this.filter = value; } };
  await service._filterTasksByRole({ ...requestFor("CAProcessor"), query });
  const serialized = JSON.stringify(query.filter);
  assert.match(serialized, /assignedUser_ID/);
  assert.match(serialized, /assignedTeam_ID/);
  assert.doesNotMatch(serialized, /requester_ID/);
  assert.match(serialized, /team-a/);
});
