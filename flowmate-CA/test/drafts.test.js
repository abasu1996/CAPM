const { test } = require("node:test");
const assert = require("node:assert/strict");
const cds = require("@sap/cds");
const FlowmateCAService = require("../srv/flowmate-ca");

const CREATOR = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function harness(t, actor = CREATOR, admin = false) {
  const previousDb = cds.db;
  t.after(() => { cds.db = previousDb; });
  const rows = new Map();
  const touched = [];
  const whereId = (where) => where?.find((part) => part && Object.hasOwn(part, "val"))?.val;
  const tx = {
    async run(query) {
      if (query.INSERT) {
        const entries = query.INSERT.entries;
        for (const row of entries) rows.set(row.ID, { ...row });
        touched.push("INSERT");
        return entries.length;
      }
      if (query.SELECT) return rows.get(whereId(query.SELECT.where));
      if (query.UPDATE) {
        Object.assign(rows.get(whereId(query.UPDATE.where)), query.UPDATE.data);
        touched.push("UPDATE");
        return 1;
      }
      if (query.DELETE) {
        rows.delete(whereId(query.DELETE.where));
        touched.push("DELETE");
        return 1;
      }
      throw new Error("Unexpected query");
    }
  };
  cds.db = { tx: () => tx };
  const service = new FlowmateCAService("FlowmateCAService");
  service.db = { CARequestDrafts: "Drafts" };
  service._ensureCurrentUser = async () => ({ ID: actor, displayName: "Draft Creator" });
  const req = (data = {}) => ({
    data,
    user: { is: (role) => admin && role === "CAAdmin" },
    reject(status, message) { throw Object.assign(new Error(message), { status }); }
  });
  return { service, rows, touched, req };
}

test("saving an incomplete form writes only a draft, without request or workflow side effects", async (t) => {
  const { service, rows, touched, req } = harness(t);
  const result = await service._saveDraft(req({ formData: JSON.stringify({ description: "Started", details: { items: [{}] } }) }));
  assert.ok(result.ID);
  assert.equal(rows.get(result.ID).creator_ID, CREATOR);
  assert.equal(rows.get(result.ID).title, "Untitled draft");
  assert.deepEqual(touched, ["INSERT"]);
});

test("another user cannot view, overwrite, delete, or consume a draft", async (t) => {
  const { service, rows, req } = harness(t, OTHER);
  const id = "33333333-3333-4333-8333-333333333333";
  rows.set(id, { ID: id, creator_ID: CREATOR, formData: "{}" });
  const query = { where(value) { this.filter = value; } };
  await service._filterDrafts({ ...req(), query });
  assert.deepEqual(query.filter, { creator_ID: OTHER });
  await assert.rejects(service._saveDraft(req({ draftId: id, formData: "{}" })), { status: 404 });
  await assert.rejects(service._deleteDraft(req({ draftId: id })), { status: 404 });
  await assert.rejects(service._consumeDraft(req(), cds.db.tx(), id, { ID: OTHER }), { status: 404 });
  assert.ok(rows.has(id));
});

test("a CA administrator can access and remove a saved draft", async (t) => {
  const { service, rows, req } = harness(t, OTHER, true);
  const id = "33333333-3333-4333-8333-333333333333";
  rows.set(id, { ID: id, creator_ID: CREATOR, formData: "{}" });
  const query = { where() { throw new Error("Admin must not be filtered"); } };
  await service._filterDrafts({ ...req(), query });
  assert.equal(await service._deleteDraft(req({ draftId: id })), true);
  assert.equal(rows.has(id), false);
});

test("final submission can consume the creator's draft in its request transaction", async (t) => {
  const { service, rows, touched, req } = harness(t);
  const id = "44444444-4444-4444-8444-444444444444";
  rows.set(id, { ID: id, creator_ID: CREATOR, formData: "{}" });
  await service._consumeDraft(req(), cds.db.tx(), id, { ID: CREATOR });
  assert.equal(rows.has(id), false);
  assert.deepEqual(touched, ["DELETE"]);
});
