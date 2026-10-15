const { test } = require("node:test");
const assert = require("node:assert/strict");
const FlowmateCAService = require("../srv/flowmate-ca");
const { REQUEST_OUTCOME } = FlowmateCAService;

// The BPA "Request Status Notification Process" only words an e-mail for these two values.
const BPA_STATUSES = ["Completed", "Rejected", "Sendback"];

async function outcomeContext(status, remarks) {
  const service = Object.create(FlowmateCAService.prototype);
  service.db = { CARequests: "CARequests", RequestTypes: "RequestTypes" };
  let started;
  service._startBpaProcess = async (data) => { started = data; };
  const results = [
    { referenceNumber: "CA-PO-1", title: "Laptops", requestType_code: "PURCHASE_ORDER", requesterEmail: "requester@example.test", requesterName: "Rita Requester" },
    { name: "Purchase Order" }
  ];
  await service._notifyRequestOutcome({ run: async () => results.shift() }, "request-id", status, remarks);
  return started.context;
}

test("the final-approval e-mail sends a status the BPA template handles", async () => {
  assert.equal(REQUEST_OUTCOME.COMPLETED, "Completed");
  const context = await outcomeContext(REQUEST_OUTCOME.COMPLETED);
  assert.ok(BPA_STATUSES.includes(context.status));
  assert.deepEqual(context, {
    requestermail: "requester@example.test",
    requesttitle: "Laptops",
    requesttype: "Purchase Order",
    requestid: "CA-PO-1",
    status: "Completed",
    remarks: "",
    requestername: "Rita Requester"
  });
});

test("the rejection e-mail sends a status the BPA template handles, with the reason", async () => {
  const context = await outcomeContext(REQUEST_OUTCOME.REJECTED, "Wrong vendor");
  assert.equal(context.status, "Rejected");
  assert.equal(context.remarks, "Wrong vendor");
  assert.ok(BPA_STATUSES.includes(context.status));
});

async function taskContext(notice) {
  const service = Object.create(FlowmateCAService.prototype);
  service.db = { CARequests: "CARequests" };
  service._taskRecipients = async () => ["approver@example.test"];
  service._taskAppUrl = () => "https://ca.example.test/index.html";
  let started;
  service._startBpaProcess = async (data) => { started = data; };
  const task = { ID: "task-1", request_ID: "request-id", taskName: "Finance Review", assignedTeamName: "Finance" };
  const tx = { run: async () => ({ referenceNumber: "CA-PO-1", title: "Laptops", requestType_code: "PURCHASE_ORDER", requesterName: "Req" }) };
  await (notice ? service._notifyTaskAssignment(tx, task, notice) : service._notifyTaskAssignment(tx, task));
  return started.context;
}

test("a send-back e-mail carries the remarks and who sent it back", async () => {
  const context = await taskContext({ notificationType: "SENT_BACK", remarks: "Fix the quantity", sentBackBy: "Ann Approver" });
  assert.equal(context.notificationType, "SENT_BACK");
  assert.equal(context.remarks, "Fix the quantity");
  assert.equal(context.sentBackBy, "Ann Approver");
  assert.equal(context.taskUrl, "https://ca.example.test/index.html#/tasks/task-1");
});

test("a normal task assignment e-mail stays an assignment without remarks", async () => {
  const context = await taskContext();
  assert.equal(context.notificationType, "ASSIGNED");
  assert.equal(context.remarks, "");
  assert.equal(context.sentBackBy, "");
});

async function outcomeRecipients({ status, type = "OUTLINE_CONTRACT", requester = "requester@example.test", notify }) {
  const service = Object.create(FlowmateCAService.prototype);
  service.db = { CARequests: "CARequests", RequestTypes: "RequestTypes", OutlineContractDetails: "OutlineContractDetails" };
  const started = [];
  service._startBpaProcess = async (data) => { started.push(data.context.requestermail); };
  const results = [
    { referenceNumber: "CA-OC-1", title: "Contract", requestType_code: type, requesterEmail: requester },
    { name: "Outline Contract" },
    { notifyUserEmail: notify }
  ];
  await service._notifyRequestOutcome({ run: async () => results.shift() }, "request-id", status);
  return started;
}

test("a completed outline contract also e-mails the user to be notified", async () => {
  assert.deepEqual(await outcomeRecipients({ status: REQUEST_OUTCOME.COMPLETED, notify: "notify@example.test" }),
    ["requester@example.test", "notify@example.test"]);
});

test("the user to be notified is not e-mailed twice when it is the requester", async () => {
  assert.deepEqual(await outcomeRecipients({ status: REQUEST_OUTCOME.COMPLETED, notify: "Requester@Example.test" }),
    ["requester@example.test"]);
});

test("a rejected outline contract and other request types only e-mail the requester", async () => {
  assert.deepEqual(await outcomeRecipients({ status: REQUEST_OUTCOME.REJECTED, notify: "notify@example.test" }),
    ["requester@example.test"]);
  assert.deepEqual(await outcomeRecipients({ status: REQUEST_OUTCOME.COMPLETED, type: "PURCHASE_ORDER", notify: "notify@example.test" }),
    ["requester@example.test"]);
});

test("the SCM step of a New Contract goes to the detail-level SCM SPOC", async () => {
  const service = Object.create(FlowmateCAService.prototype);
  let where;
  service.master = { run: async (query) => { where = query.SELECT.where; return null; } };
  service.masterEntities = { Users: "Users" };
  await service._approverAssignment({ roleCode: "SCM" }, { scmSpocUserId: "spoc@example.test", items: [] });
  assert.ok(JSON.stringify(where).includes("spoc@example.test"));
});

test("a send-back e-mails the requester with status Sendback and the remarks", async () => {
  const context = await outcomeContext(REQUEST_OUTCOME.SENT_BACK, "Attach the quotation");
  assert.equal(context.status, "Sendback");
  assert.ok(BPA_STATUSES.includes(context.status));
  assert.equal(context.remarks, "Attach the quotation");
  assert.equal(context.requestername, "Rita Requester");
});

test("a sent-back outline contract does not e-mail the user to be notified", async () => {
  assert.deepEqual(await outcomeRecipients({ status: REQUEST_OUTCOME.SENT_BACK, notify: "notify@example.test" }),
    ["requester@example.test"]);
});
