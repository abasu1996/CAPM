const { test } = require("node:test");
const assert = require("node:assert/strict");
const cds = require("@sap/cds");
const FlowmateCAService = require("../srv/flowmate-ca");
const { cardNumber, sendPoNumbersToWorkhub, taskIdFromResponse } = require("../srv/lib/workhub");

test("cardNumber accepts the Workhub card ID and rejects non-numeric values", () => {
  assert.equal(cardNumber("4"), 4);
  assert.throws(() => cardNumber("card-4"), /numeric Workhub card ID/);
});

test("Workhub integration sends all PO numbers in pONumber1 and completes the task", async () => {
  const calls = [];
  const httpRequest = async (destination, config, options) => {
    calls.push({ destination, config, options });
    if (config.url === "/api/auth/token") {
      return { data: { token: "workhub-token" } };
    }
    if (config.method === "put") {
      return { data: { success: true } };
    }
    if (config.method === "get") {
      return { data: [{ iD: "task-123" }] };
    }
    return { data: { success: true } };
  };

  const result = await sendPoNumbersToWorkhub({
    applicationId: "w71cbe15a5a",
    cardId: "4",
    poNumber1: "4500001234, 4500001235",
    approvalComment: "Validated",
    workflowId: "workflow-1",
    viewId: "view-1",
    clientId: "client-1",
    clientSecret: "secret-1",
    httpRequest
  });

  assert.deepEqual(result, {
    applicationID: "w71cbe15a5a",
    cardID: 4,
    taskID: "task-123",
    pONumber1: "4500001234, 4500001235"
  });
  assert.equal(calls.length, 4);
  assert.equal(calls[0].config.url, "/api/auth/token");
  assert.deepEqual(calls[0].config.data, {
    client_id: "client-1",
    client_secret: "secret-1",
    grant_type: "client_credentials"
  });
  assert.equal(calls[1].config.url, "/api/workflows/workflow-1/w71cbe15a5a/cards/4");
  assert.equal(calls[1].config.data.pONumber1, "4500001234, 4500001235");
  assert.equal(calls[1].config.data.pONumber2, "");
  assert.equal(calls[1].config.data.pONumber3, "");
  assert.equal(calls[2].config.url, "/api/view/workflow-1/view-1?Card_ID=4");
  assert.equal(calls[3].config.url, "/api/tasks/workflow-1/tasks/task-123");
  assert.deepEqual(calls[3].config.data, { action: "DONE", comment: "Validated" });
  assert.equal(calls.every((call) => call.destination.destinationName === "workhub-api"), true);
});

test("taskIdFromResponse accepts Workhub's iD response property", () => {
  assert.equal(taskIdFromResponse({ data: [{ iD: "task-1" }] }), "task-1");
  assert.equal(taskIdFromResponse({ data: { value: [{ ID: "task-2" }] } }), "task-2");
  assert.equal(taskIdFromResponse({ data: [] }), "");
});

test("service action maps WorkHUBID to cardID and WorkHubAppID to applicationID", async (t) => {
  const previousDb = cds.db;
  t.after(() => { cds.db = previousDb; });
  const tables = {
    CATasks: [{ ID: "task-1", request_ID: "request-1", stepNo: 3, status_code: "OPEN" }],
    CARequests: [{ ID: "request-1", requestType_code: "PURCHASE_ORDER" }],
    RequestStepInstances: [{ request_ID: "request-1", stepNo: 3, stepName: "S/4 Data Validation" }],
    PurchaseOrderDetails: [{ request_ID: "request-1", WorkHUBID: "4", WorkHubAppID: "w71cbe15a5a" }]
  };
  const matches = (row, where = []) => {
    for (let index = 0; index < where.length; index += 1) {
      if (where[index] === "=" && where[index - 1]?.ref && row[where[index - 1].ref[0]] !== where[index + 1]?.val) {
        return false;
      }
    }
    return true;
  };
  cds.db = {
    tx() { return this; },
    async run(query) {
      const source = query.SELECT.from.ref[0];
      const rows = (tables[source] || []).filter((row) => matches(row, query.SELECT.where));
      return query.SELECT.one ? rows[0] : rows;
    }
  };
  const service = new FlowmateCAService("FlowmateCAService");
  service.db = Object.fromEntries(Object.keys(tables).map((name) => [name, name]));
  service._ensureCurrentUser = async () => ({ ID: "user-1", displayName: "Approver", email: "approver@example.test" });
  service._assertTaskAccess = async () => {};
  service._writeHistory = async () => {};
  let received;
  service._workhubClient = async (input) => {
    received = input;
    return { applicationID: input.applicationId, cardID: 4, taskID: "wh-task-1", pONumber1: input.poNumber1 };
  };

  const result = await service._sendPoNumbersToWorkhub({
    data: {
      taskId: "task-1",
      pONumber1: "4500001234, 4500001235",
      approvalComment: "Validated"
    },
    reject(status, message) { throw Object.assign(new Error(message), { status }); }
  });

  assert.equal(result.sent, true);
  assert.deepEqual(received, {
    applicationId: "w71cbe15a5a",
    cardId: "4",
    poNumber1: "4500001234, 4500001235",
    approvalComment: "Validated"
  });
});
