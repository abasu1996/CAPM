const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const FlowmateCAService = require("../srv/flowmate-ca");

class Filter {
  constructor(field, operator, value) {
    if (typeof field === "object") Object.assign(this, field);
    else Object.assign(this, { field, operator, value });
  }
}
let requestFilters;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../app/flowmateca/webapp/model/requestFilters.js"), "utf8"), {
  Date,
  sap: { ui: { define(_dependencies, factory) {
    requestFilters = factory(Filter, { EQ: "EQ", GE: "GE", LT: "LT", Contains: "Contains" });
  } } }
});

test("All Requests has no implicit user, team, status or time filter", () => {
  assert.equal(requestFilters.build({}).length, 0);
});

test("status and request type combine with the creation range", () => {
  const filters = requestFilters.build({
    status: "SUBMITTED", requestType: "PURCHASE_ORDER",
    startDate: new Date(2026, 9, 1), endDate: new Date(2026, 9, 5)
  });
  assert.equal(filters.length, 4);
  assert.deepEqual(filters[0], new Filter("status_code", "EQ", "SUBMITTED"));
  assert.deepEqual(filters[1], new Filter("requestType_code", "EQ", "PURCHASE_ORDER"));
  assert.deepEqual(filters[2], new Filter("createdAt", "GE", new Date(2026, 9, 1).toISOString()));
  assert.deepEqual(filters[3], new Filter("createdAt", "LT", new Date(2026, 9, 6).toISOString()));
});

test("one-sided dates are supported and the selected end day is fully included", () => {
  const start = requestFilters.build({ startDate: new Date(2026, 9, 5, 15) });
  const end = requestFilters.build({ endDate: new Date(2026, 9, 5, 15) });
  assert.equal(start.length, 1);
  assert.equal(end.length, 1);
  assert.equal(start[0].value, new Date(2026, 9, 5).toISOString());
  assert.equal(end[0].value, new Date(2026, 9, 6).toISOString());
  assert.ok(new Date(2026, 9, 5, 23, 59, 59, 999) < new Date(end[0].value));
});

test("creation dates respect browser timezone and daylight-saving boundaries", (t) => {
  const previous = process.env.TZ;
  t.after(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });
  process.env.TZ = "Asia/Kolkata";
  let filters = requestFilters.build({ startDate: new Date(2026, 9, 5), endDate: new Date(2026, 9, 5) });
  assert.equal(filters[0].value, "2026-10-04T18:30:00.000Z");
  assert.equal(filters[1].value, "2026-10-05T18:30:00.000Z");
  process.env.TZ = "America/New_York";
  filters = requestFilters.build({ startDate: new Date(2026, 2, 8), endDate: new Date(2026, 2, 8) });
  assert.equal(new Date(filters[1].value) - new Date(filters[0].value), 23 * 60 * 60 * 1000);
});

test("reversed dates fail validation", () => {
  assert.throws(() => requestFilters.build({
    startDate: new Date(2026, 9, 10), endDate: new Date(2026, 9, 5)
  }), /invalidCreationRange/);
});

test("search is an OR group combined with the other filters", () => {
  const filters = requestFilters.build({ status: "REJECTED", search: "  O'Brien  " });
  assert.equal(filters.length, 2);
  assert.equal(filters[1].and, false);
  assert.equal(filters[1].filters.length, 3);
  for (const filter of filters[1].filters) assert.equal(filter.value, "O'Brien");
});

test("dashboard counts all users and teams while My Requests remains personal", async () => {
  const service = new FlowmateCAService("FlowmateCAService");
  service.db = { CARequests: "requests", CATasks: "tasks" };
  service._ensureCurrentUser = async () => ({ ID: "alice" });
  service._teamIdsOf = async () => [];
  const requests = [
    { requester_ID: "alice", ownerTeam_ID: "team-a", status_code: "SUBMITTED" },
    { requester_ID: "bob", ownerTeam_ID: "team-b", status_code: "REJECTED" },
    { requester_ID: "integration", ownerTeam_ID: "team-c", status_code: "COMPLETED" },
    { requester_ID: "bob", ownerTeam_ID: null, status_code: "DRAFT" }
  ];
  service._count = async (entity, where) => entity === "tasks" ? 0 : requests.filter((row) =>
    Object.entries(where).every(([key, value]) => row[key] === value)).length;
  const counts = await service._getDashboardCounts({ user: { is: () => false } });
  assert.equal(counts.allRequests, 4);
  assert.equal(counts.myRequests, 1);
  assert.equal(counts.rejectedRequests, 0);
  assert.equal(counts.completedRequests, 0);
});
