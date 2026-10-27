const { test } = require("node:test");
const assert = require("node:assert/strict");
const FlowmateCAService = require("../srv/flowmate-ca");

const reject = (status, message) => {
  throw Object.assign(new Error(message), { status });
};

test("active delegations extend the effective task owners", async () => {
  const service = new FlowmateCAService("FlowmateCAService");
  service.masterEntities = { Delegations: "Delegations" };
  service.master = {
    async run() {
      return [{ delegator_ID: "owner-a" }, { delegator_ID: "owner-a" }, { delegator_ID: "owner-b" }];
    }
  };
  assert.deepEqual(await service._effectiveTaskUserIds({}, "delegate"), ["delegate", "owner-a", "owner-b"]);
});

test("delegation lookup excludes disabled, future and expired assignments", async () => {
  const service = new FlowmateCAService("FlowmateCAService");
  service.masterEntities = { Delegations: "Delegations" };
  let filter;
  service.master = { run: async (query) => { filter = query.SELECT.where; return []; } };
  await service._activeDelegatorIds({}, "delegate");
  const today = new Date().toISOString().slice(0, 10);
  assert.deepEqual(filter, [
    { ref: ["delegate_ID"] }, "=", { val: "delegate" }, "and",
    { ref: ["enabled"] }, "=", { val: true }, "and",
    { ref: ["startDate"] }, "<=", { val: today }, "and",
    { ref: ["endDate"] }, ">=", { val: today }
  ]);
});

test("a delegate can process the delegator's assigned task", async () => {
  const service = new FlowmateCAService("FlowmateCAService");
  service._effectiveTaskUserIds = async () => ["delegate", "owner"];
  await assert.doesNotReject(service._assertTaskAccess({
    user: { is: () => false }, reject
  }, { assignedUser_ID: "owner", assignedTeam_ID: "team" }, { ID: "delegate" }));
});

test("a delegate can act on the delegator's requester-owned step", async () => {
  const service = new FlowmateCAService("FlowmateCAService");
  service._effectiveTaskUserIds = async () => ["delegate", "request-owner"];
  assert.equal(await service._canActForUser({}, "delegate", "request-owner"), true);
  assert.equal(await service._canActForUser({}, "delegate", "someone-else"), false);
});

test("team membership cannot bypass the sole owner of an assigned task", async () => {
  const service = new FlowmateCAService("FlowmateCAService");
  service._effectiveTaskUserIds = async () => ["other-user"];
  service.master = { run: async () => ({ ID: "membership" }) };
  service.masterEntities = { TeamMembers: "TeamMembers" };
  await assert.rejects(service._assertTaskAccess({
    user: { is: () => false }, reject
  }, { assignedUser_ID: "owner", assignedTeam_ID: "team" }, { ID: "other-user" }), {
    status: 403
  });
});

test("delegated notification replaces the original recipient", async () => {
  const service = new FlowmateCAService("FlowmateCAService");
  service.masterEntities = { Delegations: "Delegations", Users: "Users" };
  let call = 0;
  service.master = {
    async run() {
      call += 1;
      return call === 1
        ? [{ delegator_ID: "owner", delegate_ID: "delegate" }]
        : [{ ID: "delegate", email: "delegate@example.test" }];
    }
  };
  assert.deepEqual(await service._delegatedNotificationEmails([
    { ID: "owner", email: "owner@example.test" }
  ]), ["delegate@example.test"]);
});

test("regular users cannot maintain delegations", async () => {
  const service = new FlowmateCAService("FlowmateCAService");
  service._ensureCurrentUser = async () => ({ ID: "current" });
  const req = {
    user: { is: () => false },
    data: {
      delegator_ID: "someone-else",
      delegate_ID: "delegate",
      startDate: "2026-10-01",
      endDate: "2026-10-31"
    },
    reject
  };
  await assert.rejects(service._prepareDelegationCreate(req), { status: 403 });
  req.data.delegator_ID = "current";
  await assert.rejects(service._prepareDelegationCreate(req), { status: 403 });
});

test("administrators and supervisors may create and delete delegations for others", async () => {
  for (const role of ["CAAdmin", "CASupervisor"]) {
    const service = new FlowmateCAService("FlowmateCAService");
    service._ensureCurrentUser = async () => ({ ID: "admin" });
    service.masterEntities = { Users: "Users" };
    service.master = { run: async () => [{ ID: "owner", isActive: true }, { ID: "delegate", isActive: true }] };
    const req = {
      user: { is: (name) => name === role }, reject,
      data: { delegator_ID: "owner", delegate_ID: "delegate", startDate: "2026-10-01", endDate: "2026-10-31" }
    };
    await service._prepareDelegationCreate(req);
    assert.equal(req.data.createdOnBehalf, true);
    await assert.doesNotReject(service._authorizeDelegationDelete(req));
  }
});

test("regular users cannot delete delegations", async () => {
  const service = new FlowmateCAService("FlowmateCAService");
  service._ensureCurrentUser = async () => ({ ID: "current" });
  service.masterEntities = { Delegations: "Delegations" };
  const req = { user: { is: () => false }, data: { ID: "delegation" }, reject };
  await assert.rejects(service._authorizeDelegationDelete(req), { status: 403 });
});

test("My Requests includes active delegators using the same scope as the dashboard", async () => {
  const service = new FlowmateCAService("FlowmateCAService");
  service._ensureCurrentUser = async () => ({ ID: "delegate" });
  service._effectiveTaskUserIds = async () => ["delegate", "owner"];
  let applied;
  await service._filterMyRequests({
    user: { is: (role) => role === "CARequester" },
    query: { where: (filter) => { applied = filter; } }
  });
  assert.deepEqual(applied, service._myRequestWhere(["delegate", "owner"]));
});
