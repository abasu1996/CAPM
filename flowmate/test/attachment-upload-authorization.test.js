const test = require("node:test");
const assert = require("node:assert/strict");
const cds = require("@sap/cds");
const FlowmateService = require("../srv/flowmate");

function fixture(t, options = {}) {
  const request = { ID: "r1", requesterUser_ID: "requester", status_code: "IN_PROGRESS", createdBy: "integration", ...options.request };
  const attachment = options.attachment === undefined
    ? { ID: "a1", request_ID: "r1", createdBy: "reader@example.com" }
    : options.attachment;
  const queries = [];
  const service = {};
  for (const name of Object.getOwnPropertyNames(FlowmateService.prototype)) {
    if (name !== "constructor") service[name] = FlowmateService.prototype[name];
  }
  service.entities = { ProcessRequests: "ProcessRequests", ProcessAttachments: "ProcessAttachments", ProcessTasks: "ProcessTasks" };
  service._getRequest = async (_, id) => id === request.ID ? request : null;
  service._isAdministrator = () => Boolean(options.admin);
  service._canProvisionRequests = () => Boolean(options.integration);
  service._currentReservationUser = async () => ({ user: { ID: "reader" } });
  service._activeDelegatorIds = async () => [];
  service._rejectIfRequestReservedByAnotherUser = async () => { throw new Error("processor required"); };
  t.mock.method(cds, "tx", () => ({ run: async (query) => {
    queries.push(query);
    const table = query.SELECT.from.ref[0];
    if (table === "ProcessAttachments") return attachment;
    if (table === "ProcessRequests") return options.visible === false ? undefined : { ID: request.ID };
    throw new Error(`Unexpected table ${table}`);
  } }));
  const req = (event, data, user = "reader@example.com") => ({
    event, data, user: { id: user },
    reject: (status, message) => { const error = new Error(message); error.status = status; throw error; }
  });
  return { service, req, queries };
}

test("a user with request visibility can create attachment metadata", async (t) => {
  const { service, req, queries } = fixture(t);
  await service._rejectIfAttachmentRequestLocked(req("CREATE", { request_ID: "r1" }), { upload: true });
  const visibility = JSON.stringify(queries.at(-1).SELECT.where);
  assert.match(visibility, /requesterUser_ID/);
  assert.match(visibility, /processorUser_ID/);
  assert.match(visibility, /ProcessTasks/);
});

test("a user without request visibility cannot upload", async (t) => {
  const { service, req } = fixture(t, { visible: false });
  await assert.rejects(service._rejectIfAttachmentRequestLocked(req("CREATE", { request_ID: "r1" }), { upload: true }), /cannot access/);
});

test("a user can upload bytes only to their own attachment metadata", async (t) => {
  const { service, req } = fixture(t);
  await service._rejectIfAttachmentRequestLocked(req("UPDATE", { ID: "a1", content: Buffer.from("test") }), { upload: true });
  await assert.rejects(service._rejectIfAttachmentRequestLocked(req("UPDATE", { ID: "a1", content: Buffer.from("test") }, "other@example.com"), { upload: true }), /attachment you created/);
});

test("only a content-only update uses the relaxed upload permission", async (t) => {
  const { service, req } = fixture(t);
  assert.equal(service._isAttachmentContentUpload(req("UPDATE", { ID: "a1", content: Buffer.from("test") })), true);
  assert.equal(service._isAttachmentContentUpload(req("UPDATE", { ID: "a1", content: Buffer.from("test"), request_ID: "r2" })), false);
  assert.equal(service._isAttachmentContentUpload(req("UPDATE", { ID: "a1", content: null })), false);
  assert.equal(service._isAttachmentContentUpload(req("UPDATE", { ID: "a1", filename: "other.txt" })), false);
  assert.equal(service._isAttachmentContentUpload(req("DELETE", { ID: "a1" })), false);
});

test("completed and rejected requests remain locked", async (t) => {
  const { service, req } = fixture(t, { request: { status_code: "COMPLETED" } });
  await assert.rejects(service._rejectIfAttachmentRequestLocked(req("CREATE", { request_ID: "r1" }), { upload: true }), /locked/);
});

test("integration clients remain limited to their own requests", async (t) => {
  const { service, req } = fixture(t, { integration: true });
  await service._rejectIfAttachmentRequestLocked(req("CREATE", { request_ID: "r1" }, "integration"), { upload: true });
  await assert.rejects(service._rejectIfAttachmentRequestLocked(req("CREATE", { request_ID: "r1" }, "another-client"), { upload: true }), /requests it created/);
});

test("administrators are not incorrectly limited to integration-created attachments", async (t) => {
  const { service, req } = fixture(t, { admin: true, integration: true });
  const query = { where() { throw new Error("administrator was filtered"); } };
  await service._filterAttachmentReads({ ...req("READ", {}), query }, "Users");
});

test("integration attachment reads are limited to requests created by that client", async (t) => {
  const { service, req } = fixture(t, { integration: true });
  let filter;
  const query = { where(value) { filter = value; } };
  await service._filterAttachmentReads({ ...req("READ", {}, "integration"), query }, "Users");
  const subquery = filter.request_ID.in.SELECT;
  assert.equal(subquery.from.ref[0], "ProcessRequests");
  assert.match(JSON.stringify(subquery.where), /integration/);
});

test("normal attachment reads use request visibility restrictions", async (t) => {
  const { service, req } = fixture(t);
  let call;
  service._filterByVisibleRequests = async (...args) => { call = args; };
  const read = req("READ", {});
  await service._filterAttachmentReads(read, "Users");
  assert.deepEqual(call, [read, "Users", "request_ID"]);
});

test("deleting an attachment retains request-processor restrictions", async (t) => {
  const { service, req } = fixture(t);
  await assert.rejects(service._rejectIfAttachmentRequestLocked(req("DELETE", { ID: "a1" })), /processor required/);
});
