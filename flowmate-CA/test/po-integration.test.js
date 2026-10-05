const { test } = require("node:test");
const assert = require("node:assert/strict");
const cds = require("@sap/cds");
const FlowmateCAService = require("../srv/flowmate-ca");
const { resolveTechnicalCreator, guardTechnicalOperation, assertTechnicalDetails } = require("../srv/lib/po-integration");

const CLIENT = "sb-test-po-client";
const USER_ID = "ad5d68d0-d527-4f88-97a9-3d40a866781e";
const INTEGRATION_USER = { ID: USER_ID, displayName: "PO Integration", email: "integration@example.test", isActive: true };
const MAPPING = JSON.stringify({ [CLIENT]: USER_ID });

function request({ technical = true, roles = ["PORequestCreate"], clientId = CLIENT, event = "createRequest", input = {} } = {}) {
  return {
    event,
    data: { input: { requestTypeCode: "PURCHASE_ORDER", title: "API PO", details: "{}", ...input } },
    user: new cds.User({
      id: technical ? "system" : "PERSON@EXAMPLE.TEST",
      roles: [...roles, ...(technical ? ["system-user"] : [])],
      authInfo: { getClientId: () => clientId }
    }),
    reject(status, message) { throw Object.assign(new Error(message), { status }); }
  };
}

test("authorized client resolves only its configured integration identity", () => {
  const req = request({ input: { requesterId: "spoofed", integrationUserId: "spoofed", clientId: "spoofed" } });
  req.headers = { "x-client-id": "spoofed" };
  assert.deepEqual(resolveTechnicalCreator(req, MAPPING), { clientId: CLIENT, userId: USER_ID });
});

for (const [label, options, mapping, status] of [
  ["missing dedicated scope even with CAAdmin", { roles: ["CAAdmin"] }, MAPPING, 403],
  ["non-PO type", { input: { requestTypeCode: "MATERIAL_CODE" } }, MAPPING, 403],
  ["bulk action", { event: "createBulkRequests" }, MAPPING, 403],
  ["unknown client", { clientId: "sb-other-client" }, MAPPING, 403],
  ["missing token client ID", { clientId: null }, MAPPING, 403],
  ["absent mapping", {}, "", 403],
  ["malformed mapping", {}, "{broken", 503],
  ["array mapping", {}, "[]", 503],
  ["null mapping", {}, "null", 503],
  ["invalid user ID", {}, JSON.stringify({ [CLIENT]: "someone@example.test" }), 503],
  ["prototype property is not a client mapping", { clientId: "toString" }, "{}", 403]
]) {
  test(`rejects ${label}`, () => {
    assert.throws(() => resolveTechnicalCreator(request(options), mapping), { status });
  });
}

test("browser users use the existing identity path regardless of integration configuration", () => {
  assert.equal(resolveTechnicalCreator(request({ technical: false }), "invalid-json"), null);
});

for (const event of ["CREATE", "UPDATE", "DELETE", "approveTask", "rejectTask", "claimTeamTask", "completeStep", "submitRequest", "createBulkRequests", "createSuccessorRequest"]) {
  test(`technical client cannot use ${event} through the workflow service`, () => {
    assert.throws(() => guardTechnicalOperation(request({ event, roles: ["PORequestCreate", "CAAdmin"] })), { status: 403 });
    assert.doesNotThrow(() => guardTechnicalOperation(request({ technical: false, event })));
  });
}

test("technical reads and createRequest pass the operation guard", () => {
  for (const event of ["READ", "createRequest", "getFlowmateConnectionStatus"]) {
    assert.doesNotThrow(() => guardTechnicalOperation(request({ event })));
  }
});

test("technical callers cannot impersonate audit authors or attach data to other requests", () => {
  const req = request();
  for (const details of [
    { request_ID: USER_ID }, { request: { ID: USER_ID } }, { createdBy: "admin" },
    { items: [{ details_ID: USER_ID }] }, { items: [{ modifiedBy: "admin" }] },
    null, [], { items: {} }, { items: [null] }
  ]) {
    assert.throws(() => assertTechnicalDetails(req, details), { status: 400 });
  }
  assert.doesNotThrow(() => assertTechnicalDetails(req, { vendorCode: "TEST", items: [{ quantity: 2 }] }));
});

// Exercise the real creation, detail, workflow and history handlers with fake
// persistence. These tests never connect to or seed a database.
function serviceHarness(t, { masterUser = INTEGRATION_USER } = {}) {
  const previousDb = cds.db;
  const previousMapping = process.env.FLOWMATE_CA_PO_INTEGRATION_CLIENTS;
  process.env.FLOWMATE_CA_PO_INTEGRATION_CLIENTS = MAPPING;
  t.after(() => {
    cds.db = previousDb;
    if (previousMapping === undefined) delete process.env.FLOWMATE_CA_PO_INTEGRATION_CLIENTS;
    else process.env.FLOWMATE_CA_PO_INTEGRATION_CLIENTS = previousMapping;
  });

  const names = ["RequestTypes", "RequestVariants", "CARequests", "PurchaseOrderDetails", "PurchaseOrderItems", "WorkflowStepConfigs", "RequestStepInstances", "CATasks", "CAHistory"];
  const tables = Object.fromEntries(names.map((name) => [name, []]));
  tables.RequestTypes.push({ code: "PURCHASE_ORDER", isActive: true });
  tables.RequestVariants.push({ code: "PO_OPEX", requestType_code: "PURCHASE_ORDER", isActive: true });
  tables.WorkflowStepConfigs.push(
    { ID: "step1", requestType_code: "PURCHASE_ORDER", stepNo: 1, stepName: "Creation", isActive: true },
    { ID: "step2", requestType_code: "PURCHASE_ORDER", stepNo: 2, stepName: "Review", isActive: true, isApproval: true }
  );
  const whereMatches = (row, where = []) => {
    for (let i = 0; i < where.length; i += 4) {
      assert.equal(where[i + 1], "=");
      if (row[where[i].ref[0]] !== where[i + 2].val) return false;
    }
    return true;
  };
  const fakeDb = {
    tx() { return this; },
    async run(query) {
      if (query.INSERT) {
        const { into, entries } = query.INSERT;
        tables[into.ref[0]].push(...structuredClone(entries));
        return entries.length;
      }
      if (query.UPDATE) {
        const { entity, data, where } = query.UPDATE;
        for (const row of tables[entity.ref[0]].filter((row) => whereMatches(row, where))) Object.assign(row, data);
        return 1;
      }
      const { from, one, where } = query.SELECT;
      const rows = tables[from.ref[0]].filter((row) => whereMatches(row, where));
      return one ? rows[0] : rows;
    }
  };
  cds.db = fakeDb;
  const service = new FlowmateCAService("FlowmateCAService");
  service.db = Object.fromEntries(names.map((name) => [name, name]));
  service.masterEntities = { Users: "Users", Teams: "Teams" };
  const masterQueries = [];
  service.master = {
    async run(query) {
      masterQueries.push(query);
      if (query.SELECT.from.ref[0] === "Teams") return [];
      const users = masterUser ? [masterUser] : [];
      return query.SELECT.one
        ? users.find((row) => whereMatches(row, query.SELECT.where))
        : users.filter((row) => whereMatches(row, query.SELECT.where));
    }
  };
  return { service, tables, masterQueries };
}

test("PO creation uses mapped ownership, initializes workflow and records the authenticated client", async (t) => {
  const { service, tables, masterQueries } = serviceHarness(t);
  const req = request({ input: {
    requestVariantCode: "PO_OPEX",
    details: JSON.stringify({ vendorCode: "TEST", totalValue: 100, items: [{ quantity: 2, unitPrice: 50 }] })
  } });
  const created = await service._createRequest(req);
  assert.equal(created.requester_ID, USER_ID);
  assert.equal(created.owner_ID, USER_ID);
  assert.equal(created.requesterName, INTEGRATION_USER.displayName);
  assert.equal(created.status_code, "SUBMITTED");
  assert.equal(tables.PurchaseOrderDetails[0].request_ID, created.ID);
  assert.equal(tables.PurchaseOrderItems[0].details_ID, tables.PurchaseOrderDetails[0].ID);
  assert.equal(tables.CATasks.length, 2);
  assert.equal(tables.CATasks[1].status_code, "OPEN");
  const history = tables.CAHistory.find((entry) => entry.action === "REQUEST_CREATED");
  assert.equal(history.actorEmail, INTEGRATION_USER.email);
  assert.deepEqual(JSON.parse(history.remarks), {
    source: "TECHNICAL_API", clientId: CLIENT, integrationUserId: USER_ID
  });
  assert.deepEqual(masterQueries[0].SELECT.where, [
    { ref: ["ID"] }, "=", { val: USER_ID }, "and", { ref: ["isActive"] }, "=", { val: true }
  ]);
});

for (const [label, masterUser] of [["missing", null], ["inactive", { ...INTEGRATION_USER, isActive: false }]]) {
  test(`${label} integration user prevents all database inserts`, async (t) => {
    const { service, tables } = serviceHarness(t, { masterUser });
    await assert.rejects(service._createRequest(request()), { status: 403 });
    assert.equal(tables.CARequests.length, 0);
    assert.equal(tables.CAHistory.length, 0);
  });
}

test("browser creation retains case-insensitive provisioning and normal history", async (t) => {
  const user = { ...INTEGRATION_USER, email: "person@example.test" };
  const { service, tables } = serviceHarness(t, { masterUser: user });
  const created = await service._createRequest(request({ technical: false }));
  assert.equal(created.requester_ID, user.ID);
  assert.equal(tables.CAHistory.find((entry) => entry.action === "REQUEST_CREATED").remarks, undefined);
});

test("unprovisioned human users still fail", async (t) => {
  const { service } = serviceHarness(t, { masterUser: null });
  await assert.rejects(service._createRequest(request({ technical: false })), { status: 403 });
});

test("technical identity is never resolved as a human even if a matching record exists", async (t) => {
  const { service } = serviceHarness(t, { masterUser: { ...INTEGRATION_USER, userPrincipalName: "system" } });
  await assert.rejects(service._ensureCurrentUser(request()), { status: 403 });
});
