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

test("regular users cannot create a delegation for someone else", async () => {
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
});
