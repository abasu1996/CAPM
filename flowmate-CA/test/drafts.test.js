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
  const attachmentRows = new Map();
  const touched = [];
  const whereId = (where) => where?.find((part) => part && Object.hasOwn(part, "val"))?.val;
  const targetName = (target) => target?.ref?.[0] || target;
  const whereValue = (where, column) => {
    const index = where?.findIndex((part) => part?.ref?.at(-1) === column) ?? -1;
    return index >= 0 ? where.slice(index + 1).find((part) => part && Object.hasOwn(part, "val"))?.val : undefined;
  };
  const matchingAttachments = (where) => Array.from(attachmentRows.values()).filter((row) => {
    const ID = whereValue(where, "ID");
    const draftId = whereValue(where, "draft_ID");
    const requiresNullContent = where?.some((part, index) => part?.ref?.at(-1) === "content" && where[index + 2]?.val === null);
    return (ID === undefined || row.ID === ID)
      && (draftId === undefined || row.draft_ID === draftId)
      && (!requiresNullContent || row.content == null);
  });
  const tx = {
    async run(query) {
      if (query.INSERT) {
        const entries = query.INSERT.entries;
        const target = targetName(query.INSERT.into);
        const store = target === "Attachments" ? attachmentRows : rows;
        for (const row of entries) store.set(row.ID, { ...row });
        touched.push("INSERT");
        return entries.length;
      }
      if (query.SELECT) {
        const target = targetName(query.SELECT.from);
        if (target === "Attachments") {
          const matches = matchingAttachments(query.SELECT.where);
          return query.SELECT.one ? matches[0] : matches;
        }
        return rows.get(whereId(query.SELECT.where));
      }
      if (query.UPDATE) {
        const target = targetName(query.UPDATE.entity);
        if (target === "Attachments") {
          matchingAttachments(query.UPDATE.where).forEach((row) => Object.assign(row, query.UPDATE.data));
        } else {
          Object.assign(rows.get(whereId(query.UPDATE.where)), query.UPDATE.data);
        }
        touched.push("UPDATE");
        return 1;
      }
      if (query.DELETE) {
        const target = targetName(query.DELETE.from);
        if (target === "Attachments") {
          matchingAttachments(query.DELETE.where).forEach((row) => attachmentRows.delete(row.ID));
        } else {
          rows.delete(whereId(query.DELETE.where));
        }
        touched.push("DELETE");
        return 1;
      }
      throw new Error("Unexpected query");
    }
  };
  cds.db = { tx: () => tx };
  const service = new FlowmateCAService("FlowmateCAService");
  service.db = { CARequestDrafts: "Drafts", CAAttachments: "Attachments" };
  service._ensureCurrentUser = async () => ({ ID: actor, displayName: "Draft Creator" });
  const req = (data = {}) => ({
    data,
    user: { is: (role) => admin ? role === "CAAdmin" : role === "CARequester" },
    reject(status, message) { throw Object.assign(new Error(message), { status }); }
  });
  return { service, rows, attachmentRows, touched, req, tx };
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

test("a CA administrator sees and maintains only drafts they created", async (t) => {
  const { service, rows, req } = harness(t, OTHER, true);
  const id = "33333333-3333-4333-8333-333333333333";
  rows.set(id, { ID: id, creator_ID: CREATOR, formData: "{}" });
  const query = { where(value) { this.filter = value; } };
  await service._filterDrafts({ ...req(), query });
  assert.deepEqual(query.filter, { creator_ID: OTHER });
  await assert.rejects(service._deleteDraft(req({ draftId: id })), { status: 404 });
  assert.equal(rows.has(id), true);
});

test("draft attachment reads are scoped to the logged-in creator even for administrators", async (t) => {
  const { service, req } = harness(t, OTHER, true);
  const filters = [];
  await service._filterDraftAttachments({ ...req(), query: { where(value) { filters.push(value); } } });
  assert.deepEqual(filters, [
    [{ ref: ["draft", "creator_ID"] }, "=", { val: OTHER }],
    { request_ID: null }
  ]);
});

test("final submission can consume the creator's draft in its request transaction", async (t) => {
  const { service, rows, touched, req } = harness(t);
  const id = "44444444-4444-4444-8444-444444444444";
  rows.set(id, { ID: id, creator_ID: CREATOR, formData: "{}" });
  await service._consumeDraft(req(), cds.db.tx(), id, { ID: CREATOR });
  assert.equal(rows.has(id), false);
  assert.deepEqual(touched, ["DELETE"]);
});

test("single submission reparents complete draft attachments without copying their content", async (t) => {
  const { service, rows, attachmentRows, req, tx } = harness(t);
  const draftId = "44444444-4444-4444-8444-444444444444";
  const requestId = "55555555-5555-4555-8555-555555555555";
  rows.set(draftId, { ID: draftId, creator_ID: CREATOR, formData: "{}" });
  attachmentRows.set("file-1", { ID: "file-1", draft_ID: draftId, request_ID: null, content: Buffer.from("pdf") });
  assert.equal(await service._moveDraftAttachments(req(), tx, draftId, requestId, { ID: CREATOR }), 1);
  assert.equal(attachmentRows.get("file-1").draft_ID, null);
  assert.equal(attachmentRows.get("file-1").request_ID, requestId);
  assert.deepEqual(attachmentRows.get("file-1").content, Buffer.from("pdf"));
});

test("single submission rejects an incomplete draft attachment row", async (t) => {
  const { service, rows, attachmentRows, req, tx } = harness(t);
  const draftId = "44444444-4444-4444-8444-444444444444";
  rows.set(draftId, { ID: draftId, creator_ID: CREATOR, formData: "{}" });
  attachmentRows.set("file-1", { ID: "file-1", draft_ID: draftId, request_ID: null, content: null });
  await assert.rejects(
    service._moveDraftAttachments(req(), tx, draftId, "55555555-5555-4555-8555-555555555555", { ID: CREATOR }),
    { status: 409 }
  );
});

test("bulk submission refuses a draft that contains attachments", async (t) => {
  const { service, attachmentRows, req, tx } = harness(t);
  const draftId = "44444444-4444-4444-8444-444444444444";
  attachmentRows.set("file-1", { ID: "file-1", draft_ID: draftId, content: Buffer.from("pdf") });
  await assert.rejects(service._assertNoBulkDraftAttachments(req(), tx, draftId), { status: 400 });
});
