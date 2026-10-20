const test = require("node:test");
const assert = require("node:assert/strict");
const FlowmateService = require("../srv/flowmate");

function serviceFixture() {
  const service = {};
  for (const name of Object.getOwnPropertyNames(FlowmateService.prototype)) {
    if (name !== "constructor") service[name] = FlowmateService.prototype[name];
  }
  return service;
}

test("team task assignment visibility is limited to active user teams", () => {
  const service = serviceFixture();
  const tasks = [
    { ID: "mine", processorTeam_ID: "team-a", status_code: "OPEN", request: { status_code: "IN_PROGRESS" } },
    { ID: "other", processorTeam_ID: "team-b", status_code: "OPEN", request: { status_code: "IN_PROGRESS" } }
  ];

  service._setTeamTaskAssignmentEligibility(tasks, { teamIds: ["team-a"] });

  assert.equal(tasks[0].canAssignToMe, true);
  assert.equal(tasks[1].canAssignToMe, false);
});

test("assigned, finalized and locked team tasks cannot be offered", () => {
  const service = serviceFixture();
  const tasks = [
    { processorTeam_ID: "team-a", processorUser_ID: "user-a", status_code: "OPEN", request: { status_code: "IN_PROGRESS" } },
    { processorTeam_ID: "team-a", status_code: "APPROVED", request: { status_code: "IN_PROGRESS" } },
    { processorTeam_ID: "team-a", status_code: "OPEN", request: { status_code: "COMPLETED" } }
  ];

  service._setTeamTaskAssignmentEligibility(tasks, { teamIds: ["team-a"] });

  assert.deepEqual(tasks.map((task) => task.canAssignToMe), [false, false, false]);
});

test("My Team Tasks can reuse its prevalidated membership scope", () => {
  const service = serviceFixture();
  const task = { processorTeam_ID: "team-a", status_code: "SENT_BACK", request: { status_code: "IN_PROGRESS" } };

  service._setTeamTaskAssignmentEligibility(task, { membershipPrevalidated: true });

  assert.equal(task.canAssignToMe, true);
});
