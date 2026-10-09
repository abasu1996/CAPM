const { test } = require("node:test");
const assert = require("node:assert/strict");
const cds = require("@sap/cds");
const FlowmateCAService = require("../srv/flowmate-ca");
const { resolveTechnicalCreator, guardTechnicalOperation, assertTechnicalDetails } = require("../srv/lib/po-integration");

const CLIENT = "sb-test-po-client";
const USER_ID = "ad5d68d0-d527-4f88-97a9-3d40a866781e";
const REQUESTER = { ID: USER_ID, displayName: "Business Requester", email: "requester@example.test", isActive: true };

function request({ technical = true, roles = ["PORequestCreate"], clientId = CLIENT, event = "createRequest", input = {} } = {}) {
  return {
    event,
    data: { input: {
      requestTypeCode: "PURCHASE_ORDER", title: "API PO", details: "{}",
      ...(technical ? { requesterUser_ID: USER_ID } : {}), ...input
    } },
    user: new cds.User({
      id: technical ? "system" : "PERSON@EXAMPLE.TEST",
      roles: [...roles, ...(technical ? ["system-user"] : [])],
      authInfo: { getClientId: () => clientId }
    }),
    reject(status, message) { throw Object.assign(new Error(message), { status }); }
  };
}

test("authorized client supplies the requester but cannot spoof the authenticated client ID", () => {
  const req = request({ input: { requesterId: "spoofed", integrationUserId: "spoofed", clientId: "spoofed" } });
  req.headers = { "x-client-id": "spoofed" };
  assert.deepEqual(resolveTechnicalCreator(req), { clientId: CLIENT, userId: USER_ID });
});

for (const [label, options, status] of [
  ["missing dedicated scope even with CAAdmin", { roles: ["CAAdmin"] }, 403],
  ["non-PO type", { input: { requestTypeCode: "MATERIAL_CODE" } }, 403],
  ["bulk action", { event: "createBulkRequests" }, 403],
  ["missing token client ID", { clientId: null }, 403],
  ["missing requester ID", { input: { requesterUser_ID: undefined } }, 400],
  ["empty requester ID", { input: { requesterUser_ID: "" } }, 400],
  ["email instead of requester UUID", { input: { requesterUser_ID: "person@example.test" } }, 400],
  ["object instead of requester UUID", { input: { requesterUser_ID: { ID: USER_ID } } }, 400]
]) {
  test(`rejects ${label}`, () => {
    assert.throws(() => resolveTechnicalCreator(request(options)), { status });
  });
}

test("any correctly scoped authenticated client can supply a requester without environment mapping", () => {
  assert.deepEqual(resolveTechnicalCreator(request({ clientId: "sb-external-client" })), {
    clientId: "sb-external-client", userId: USER_ID
  });
});

test("requester UUID casing is normalized", () => {
  assert.equal(resolveTechnicalCreator(request({ input: { requesterUser_ID: USER_ID.toUpperCase() } })).userId, USER_ID);
});

test("browser users use the existing identity path", () => {
  assert.equal(resolveTechnicalCreator(request({ technical: false })), null);
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
function serviceHarness(t, { masterUser = REQUESTER } = {}) {
  const previousDb = cds.db;
  t.after(() => {
    cds.db = previousDb;
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

test("PO creation uses the payload requester, initializes workflow and records the authenticated client", async (t) => {
  const { service, tables, masterQueries } = serviceHarness(t);
  const req = request({ input: {
    requestVariantCode: "PO_OPEX",
    details: JSON.stringify({ vendorCode: "TEST", totalValue: 100, items: [{ quantity: 2, unitPrice: 50 }] })
  } });
  const created = await service._createRequest(req);
  assert.equal(created.requester_ID, USER_ID);
  assert.equal(created.owner_ID, USER_ID);
  assert.equal(created.requesterName, REQUESTER.displayName);
  assert.equal(created.status_code, "SUBMITTED");
  assert.equal(tables.PurchaseOrderDetails[0].request_ID, created.ID);
  assert.equal(tables.PurchaseOrderItems[0].details_ID, tables.PurchaseOrderDetails[0].ID);
  // The imported requester-review workflow opens step 1 instead of auto-completing it.
  assert.equal(tables.CATasks.length, 1);
  assert.equal(tables.CATasks[0].stepNo, 1);
  assert.equal(tables.CATasks[0].status_code, "OPEN");
  assert.equal(created.currentStep, 1);
  const history = tables.CAHistory.find((entry) => entry.action === "REQUEST_CREATED");
  assert.equal(history.actorEmail, REQUESTER.email);
  assert.deepEqual(JSON.parse(history.remarks), {
    source: "TECHNICAL_API", clientId: CLIENT, requesterUserId: USER_ID
  });
  assert.deepEqual(masterQueries[0].SELECT.where, [
    { ref: ["ID"] }, "=", { val: USER_ID }, "and", { ref: ["isActive"] }, "=", { val: true }
  ]);
});

for (const [label, masterUser] of [["missing", null], ["inactive", { ...REQUESTER, isActive: false }]]) {
  test(`${label} requester prevents all database inserts`, async (t) => {
    const { service, tables } = serviceHarness(t, { masterUser });
    await assert.rejects(service._createRequest(request()), { status: 400 });
    assert.equal(tables.CARequests.length, 0);
    assert.equal(tables.CAHistory.length, 0);
  });
}

test("browser creation retains case-insensitive provisioning and normal history", async (t) => {
  const user = { ...REQUESTER, email: "person@example.test" };
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
  const { service } = serviceHarness(t, { masterUser: { ...REQUESTER, userPrincipalName: "system" } });
  await assert.rejects(service._ensureCurrentUser(request()), { status: 403 });
});

test("an authorized client can create for a different active business requester", async (t) => {
  const otherUser = { ...REQUESTER, ID: "45674567-89ab-cdef-0123-456789abcdef", displayName: "Another Requester" };
  const { service, tables } = serviceHarness(t, { masterUser: otherUser });
  const created = await service._createRequest(request({ input: { requesterUser_ID: otherUser.ID } }));
  assert.equal(created.requester_ID, otherUser.ID);
  assert.equal(created.owner_ID, otherUser.ID);
  assert.equal(created.requesterName, otherUser.displayName);
  const audit = JSON.parse(tables.CAHistory.find((entry) => entry.action === "REQUEST_CREATED").remarks);
  assert.equal(audit.requesterUserId, otherUser.ID);
  assert.equal(audit.clientId, CLIENT);
});

test("a different requester cannot be supplied by a browser user", async (t) => {
  const { service, tables } = serviceHarness(t, { masterUser: { ...REQUESTER, email: "person@example.test" } });
  await assert.rejects(service._createRequest(request({ technical: false,
    input: { requesterUser_ID: "45674567-89ab-cdef-0123-456789abcdef" }
  })), { status: 403 });
  assert.equal(tables.CARequests.length, 0);
});

test("missing requester fails creation before any database insert", async (t) => {
  const { service, tables } = serviceHarness(t);
  await assert.rejects(service._createRequest(request({ input: { requesterUser_ID: undefined } })), { status: 400 });
  assert.equal(tables.CARequests.length, 0);
});
