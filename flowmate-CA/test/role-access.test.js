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
  assert.equal(access.canValidate, false);
  assert.equal(access.canAssign, false);
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
  assert.equal(access.canValidate, true);
  assert.equal(access.canAssign, false);
  assert.equal(access.canTerminate, false);
  assert.doesNotThrow(() => service._requireValidator(req));
  assert.throws(() => service._requireCreator(req), { status: 403 });
});

test("supervisor can validate, assign, and maintain delegation but cannot create or terminate", () => {
  const service = new FlowmateCAService("FlowmateCAService");
  const req = requestFor("CASupervisor");
  const access = service._roleCapabilities(req);
  assert.equal(access.canCreate, false);
  assert.equal(access.canValidate, true);
  assert.equal(access.canAssign, true);
  assert.equal(access.canManageDelegation, true);
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
    canValidate: true,
    canAssign: true,
    canManageDelegation: true,
    canTerminate: true,
    canAdminister: true
  });
});

test("technical PO client retains createRequest access only", () => {
  const service = new FlowmateCAService("FlowmateCAService");
  const req = requestFor("system-user", "PORequestCreate");
  assert.doesNotThrow(() => service._requireCreateAccess(req));
  assert.throws(() => service._requireValidator(req), { status: 403 });
});

test("supervisor must own a task before processing; administrator may override ownership", async () => {
  const service = new FlowmateCAService("FlowmateCAService");
  service._effectiveTaskUserIds = async () => ["supervisor"];
  await assert.rejects(service._assertTaskAccess(
    requestFor("CASupervisor"),
    { assignedUser_ID: "validator", assignedTeam_ID: "team" },
    { ID: "supervisor" }
  ), { status: 403 });
  await assert.doesNotReject(service._assertTaskAccess(
    requestFor("CAAdmin"),
    { assignedUser_ID: "validator", assignedTeam_ID: "team" },
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
