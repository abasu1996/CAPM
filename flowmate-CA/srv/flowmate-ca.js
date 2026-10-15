const cds = require("@sap/cds");
const { executeHttpRequest } = require("@sap-cloud-sdk/http-client");
const { resolveTechnicalCreator, guardTechnicalOperation, assertTechnicalDetails } = require("./lib/po-integration");
const { SELECT, INSERT, UPDATE } = cds.ql;

const REQUEST_STATUS = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  IN_PROGRESS: "IN_PROGRESS",
  SENT_BACK: "SENT_BACK",
  COMPLETED: "COMPLETED",
  REJECTED: "REJECTED"
};

const TASK_STATUS = {
  OPEN: "OPEN",
  APPROVED: "APPROVED",
  SENT_BACK: "SENT_BACK",
  REJECTED: "REJECTED"
};

// SLA days are calendar days; due dates are shown and compared in Sri Lankan time.
const SLA_TIME_ZONE = process.env.SLA_TIME_ZONE || "Asia/Colombo";
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const DETAIL_ENTITY_BY_REQUEST_TYPE = {
  MATERIAL_CODE: "MaterialCodeDetails",
  SERVICE_CODE: "ServiceCodeDetails",
  EQUIPMENT_CODE: "EquipmentCodeDetails",
  PROJECT_CODE: "ProjectCodeDetails",
  MATERIAL_RESERVATION: "MaterialReservationDetails",
  OUTLINE_CONTRACT: "OutlineContractDetails",
  PURCHASE_ORDER: "PurchaseOrderDetails",
  SERVICE_ENTRY_SHEET: "ServiceEntrySheetDetails"
};

// Status values the BPA "Request Status Notification Process" script builds an e-mail for; any
// other value produces an e-mail with an empty subject and body.
const REQUEST_OUTCOME = { COMPLETED: "Completed", REJECTED: "Rejected", SENT_BACK: "Sendback" };

const ITEMS_ENTITY_BY_REQUEST_TYPE = {
  MATERIAL_CODE: "MaterialCodeItems",
  SERVICE_CODE: "ServiceCodeItems",
  EQUIPMENT_CODE: "EquipmentCodeItems",
  PROJECT_CODE: "ProjectCodeItems",
  MATERIAL_RESERVATION: "MaterialReservationItems",
  OUTLINE_CONTRACT: "OutlineContractItems",
  PURCHASE_ORDER: "PurchaseOrderItems",
  SERVICE_ENTRY_SHEET: "ServiceEntrySheetItems"
};

// Second row table carried in details.headers (Outline Contract - New Contract).
const HEADERS_ENTITY_BY_REQUEST_TYPE = {
  OUTLINE_CONTRACT: "OutlineContractHeaders",
  SERVICE_ENTRY_SHEET: "ServiceEntrySheetHeaders"
};

// Contract Modification change tables: details.<key> rows are stored in
// OutlineContractChangeItems with the matching changeType.
const CHANGE_ITEM_TYPES = {
  priceChanges: "PRICE_CHANGE",
  serviceAdditions: "SERVICE_ADDITION",
  materialAdditions: "MATERIAL_ADDITION"
};

// CAP can expose LargeBinary values as a Node.js Readable stream (especially
// with SQLite/HANA attachment storage).  Normalise every supported shape to a
// Buffer before sending the attachment to Flowmate as base64.
const readAttachmentContent = async (content) => {
  if (content === null || content === undefined) {
    return Buffer.alloc(0);
  }
  if (Buffer.isBuffer(content)) {
    return content;
  }
  if (content instanceof Uint8Array) {
    return Buffer.from(content);
  }
  if (content instanceof ArrayBuffer) {
    return Buffer.from(content);
  }
  if (typeof content === "string") {
    return Buffer.from(content);
  }
  if (typeof content[Symbol.asyncIterator] === "function") {
    const chunks = [];
    for await (const chunk of content) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  if (typeof content.getReader === "function") {
    const reader = content.getReader();
    const chunks = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock?.();
    }
    return Buffer.concat(chunks);
  }
  return Buffer.from(content);
};

module.exports = class FlowmateCAService extends cds.ApplicationService {
  async init() {
    this.db = cds.entities("flowmate.ca.db");
    this.master = await cds.connect.to("CommonMasterDataService");
    this.masterEntities = this.master.entities;
    this.flowmate = await cds.connect.to("FlowmateService");

    this.before("*", guardTechnicalOperation);

    this.on("READ", ["Users", "Teams", "TeamMembers", "Vendors"], (req) => {
      return this.master.run(req.query);
    });

    this.before("CREATE", "Delegations", this._prepareDelegationCreate);
    this.before("READ", "Delegations", this._filterDelegations);
    this.before("UPDATE", "Delegations", (req) => {
      return req.reject(405, "Delete and recreate a delegation to change its details");
    });
    this.before("DELETE", "Delegations", this._authorizeDelegationDelete);
    this.on(["READ", "CREATE", "UPDATE", "DELETE"], "Delegations", (req) => {
      return this.master.run(req.query);
    });

    this.before("READ", "MyRequests", this._filterMyRequests);
    this.before("READ", "MyTasks", this._filterMyTasks);
    this.before("READ", "MyTeamTasks", this._filterMyTeamTasks);

    this.on("getCurrentUser", this._getCurrentUser);
    this.on("getFlowmateRequestFormCatalog", this._getFlowmateRequestFormCatalog);
    this.on("getDashboardCounts", this._getDashboardCounts);
    this.on("getFlowmateConnectionStatus", this._getFlowmateConnectionStatus);
    this.on("createRequest", this._createRequest);
    this.on("previewProjectCode", this._previewProjectCode);
    this.on("slaPreview", this._slaPreview);
    this.on("runSlaBreachScan", this._runSlaBreachScan);
    this.on("createFlowmatePaymentRun", this._createFlowmatePaymentRun);
    this.on("createFlowmateServiceEntrySheet", this._createFlowmateServiceEntrySheet);
    this.on("createBulkRequests", this._createBulkRequests);
    this.on("submitRequest", this._submitRequest);
    this.on("addTask", this._addTask);
    this.on("claimTeamTask", this._claimTeamTask);
    this.on("approveTask", this._approveTask);
    this.on("rejectTask", this._rejectTask);
    this.on("sendBackTask", this._sendBackTask);
    this.on("completeStep", this._completeStep);
    this.on("saveRequesterDetails", this._saveRequesterDetails);
    this.on("addComment", this._addComment);
    this.on("createSuccessorRequest", this._createSuccessorRequest);
    this.on("sendToS4", this._sendToS4);

    return super.init();
  }

  _getFlowmateConnectionStatus = async () => {
    const checkedAt = new Date().toISOString();
    try {
      const rows = await this.flowmate.run(
        SELECT.from(this.flowmate.entities.ProcessRequests).columns("ID").limit(1)
      );
      return {
        reachable: true,
        application: "Flowmate",
        endpoint: "flowmate-api",
        sampleRecords: Array.isArray(rows) ? rows.length : (rows ? 1 : 0),
        checkedAt,
        message: "Authenticated connection to Flowmate is ready"
      };
    } catch (error) {
      cds.log("peer-integration").warn("Flowmate connection check failed", error.message);
      return {
        reachable: false,
        application: "Flowmate",
        endpoint: "flowmate-api",
        sampleRecords: 0,
        checkedAt,
        message: `Connection failed: ${error.message}`.slice(0, 500)
      };
    }
  };

  _getFlowmateRequestFormCatalog = async (req) => {
    const catalogEntities = [
      ["processTypes", "ProcessTypes"],
      ["processSubTypes", "ProcessSubTypes"],
      ["paymentCategories", "PaymentCategories"],
      ["ftkEntities", "FtkEntities"],
      ["currencies", "Currencies"],
      ["categories", "Categories"],
      ["paymentSubCategories", "PaymentSubCategories"],
      ["paymentMethods", "PaymentMethod"],
      ["typeOfPayments", "TypeOfPayment"],
      ["requestDivisions", "RequestDivision"],
      ["guaranteeTypes", "GuaranteeTypes"],
      ["priorities", "Priorities"],
      ["customers", "Customers"],
      ["vendors", "Vendors"],
      ["teams", "Teams"]
    ];
    try {
      const result = {};
      await Promise.all(catalogEntities.map(async ([key, entityName]) => {
        const entity = this.flowmate.entities[entityName];
        if (!entity) {
          result[key] = [];
          return;
        }
        const query = SELECT.from(entity);
        if (entityName !== "Customers") {
          query.where({ isActive: true });
        } else {
          query.where({ isActive: true });
        }
        result[key] = await this.flowmate.run(query);
      }));
      return JSON.stringify(result);
    } catch (error) {
      cds.log("peer-integration").warn("Flowmate request-form catalog could not be loaded", error.message);
      return req.reject(502, "Flowmate request-form values are temporarily unavailable");
    }
  };

  _createFlowmatePaymentRun = async (req) => {
    const tx = cds.tx(req);
    const user = await this._ensureCurrentUser(req);
    const requestId = req.data.requestId;
    const request = await tx.run(
      SELECT.one.from(this.db.CARequests).where({ ID: requestId })
    );
    if (!request) {
      return req.reject(404, "Commerce Automation request was not found");
    }
    if (request.requestType_code !== "PURCHASE_ORDER") {
      return req.reject(400, "Flowmate Payment Run integration is only available for purchase orders");
    }
    if (request.requester_ID !== user.ID && !req.user.is("CAAdmin")) {
      return req.reject(403, "Only the request creator or an administrator can create the Flowmate Payment Run request");
    }
    if (request.status_code !== REQUEST_STATUS.COMPLETED) {
      return req.reject(409, "The Flowmate Payment Run request can only be created after the purchase order flow is successfully completed");
    }
    if (String(request.externalStatus || "").startsWith("FLOWMATE_PAYMENT_RUN_CREATED") && request.externalObjectId) {
      const [, existingReference] = String(request.externalStatus).split("|");
      return {
        created: true,
        requestId: request.externalObjectId,
        referenceNumber: existingReference || "already created",
        attachmentCount: 0
      };
    }

    const purchaseOrder = await tx.run(
      SELECT.one.from(this.db.PurchaseOrderDetails).where({ request_ID: request.ID })
    );
    if (!purchaseOrder?.paymentRun) {
      return req.reject(400, "Payment Run was not selected for this purchase order");
    }

    let paymentRunDetails;
    try {
      paymentRunDetails = typeof purchaseOrder.paymentRunDetails === "string"
        ? JSON.parse(purchaseOrder.paymentRunDetails)
        : purchaseOrder.paymentRunDetails;
    } catch (_error) {
      return req.reject(400, "Payment Run details contain invalid JSON");
    }
    if (!paymentRunDetails || typeof paymentRunDetails !== "object") {
      return req.reject(400, "Payment Run details are missing");
    }

    const caAttachments = await tx.run(
      SELECT.from(this.db.CAAttachments)
        .columns("ID", "filename", "mimeType", "content")
        .where({ request_ID: request.ID, category: "PAYMENT_RUN" })
    );
    if (!caAttachments.length) {
      return req.reject(400, "Select at least one Payment Run attachment before creating the Flowmate request");
    }

    const dynamicDetails = paymentRunDetails.details && typeof paymentRunDetails.details === "object"
      ? paymentRunDetails.details
      : {};
    const normalizedDetails = { ...dynamicDetails };
    for (const field of [
      "invoices",
      "travelExpenses",
      "directForeignTravelEntries",
      "glBreakups",
      "merchantEntityValues",
      "settlementEntries"
    ]) {
      if (typeof normalizedDetails[field] !== "string") {
        continue;
      }
      try {
        normalizedDetails[field] = JSON.parse(normalizedDetails[field]);
      } catch (_error) {
        return req.reject(400, `Payment Run field ${field} contains invalid JSON`);
      }
      if (!Array.isArray(normalizedDetails[field])) {
        return req.reject(400, `Payment Run field ${field} must contain a JSON array`);
      }
    }
    const flowmateInput = {
      processType_code: paymentRunDetails.processType_code,
      subProcessType_code: paymentRunDetails.subProcessType_code,
      title: String(paymentRunDetails.title || request.title || "").trim(),
      description: paymentRunDetails.description || request.description || null,
      requesterUser_ID: request.requester_ID,
      processorTeam_ID: paymentRunDetails.processorTeam_ID || request.ownerTeam_ID || null,
      processorTeamName: paymentRunDetails.processorTeamName || request.ownerTeamName || null,
      department: paymentRunDetails.department || null,
      amount: paymentRunDetails.amount === "" || paymentRunDetails.amount === null || paymentRunDetails.amount === undefined
        ? null
        : Number(paymentRunDetails.amount),
      role: paymentRunDetails.role || null,
      priorityConfig_code: paymentRunDetails.priorityConfig_code || "MEDIUM",
      ...normalizedDetails
    };
    const encodedAttachments = await Promise.all(caAttachments.map(async (attachment) => ({
      filename: attachment.filename,
      mimeType: attachment.mimeType || "application/octet-stream",
      contentBase64: (await readAttachmentContent(attachment.content)).toString("base64")
    })));

    if (!flowmateInput.processType_code || !flowmateInput.subProcessType_code || !flowmateInput.title) {
      return req.reject(400, "Payment Run process type, subprocess type, and title are required");
    }
    if (!flowmateInput.processorTeam_ID) {
      return req.reject(400, "Select a Flowmate processor team for the Payment Run request");
    }
    if (encodedAttachments.some((attachment) => !attachment.contentBase64)) {
      return req.reject(400, "One or more Payment Run attachments have no content");
    }

    try {
      const result = await this.flowmate.send({
        event: "createRequestWithAttachments",
        data: {
          input: JSON.stringify(flowmateInput),
          attachments: JSON.stringify(encodedAttachments)
        }
      });
      await tx.run(UPDATE(this.db.CARequests).set({
        externalObjectId: result?.ID || null,
        externalStatus: `FLOWMATE_PAYMENT_RUN_CREATED|${result?.referenceNumber || ""}`
      }).where({ ID: request.ID }));
      await this._writeHistory(
        tx,
        request.ID,
        request.currentStep || 0,
        "FLOWMATE_PAYMENT_RUN_CREATED",
        user,
        request.status_code,
        request.status_code,
        result?.referenceNumber || "Flowmate Payment Run request created"
      );
      return {
        created: true,
        requestId: result?.ID,
        referenceNumber: result?.referenceNumber,
        attachmentCount: encodedAttachments.length
      };
    } catch (error) {
      cds.log("peer-integration").error("Flowmate Payment Run creation failed", error);
      return req.reject(502, `Flowmate request could not be created: ${error.message}`);
    }
  };

  _createFlowmateServiceEntrySheet = async (req) => {
    const tx = cds.tx(req);
    const user = await this._ensureCurrentUser(req);
    const requestId = req.data.requestId;
    const request = await tx.run(
      SELECT.one.from(this.db.CARequests).where({ ID: requestId })
    );
    if (!request) {
      return req.reject(404, "Commerce Automation request was not found");
    }
    if (request.requestType_code !== "SERVICE_ENTRY_SHEET") {
      return req.reject(400, "Flowmate Service Entry Sheet integration is only available for service entry sheet requests");
    }
    if (request.requester_ID !== user.ID && !req.user.is("CAAdmin")) {
      return req.reject(403, "Only the request creator or an administrator can create the Flowmate Service Entry Sheet request");
    }
    if (request.status_code !== REQUEST_STATUS.COMPLETED) {
      return req.reject(409, "The Flowmate Service Entry Sheet request can only be created after the service entry sheet flow is successfully completed");
    }
    if (String(request.externalStatus || "").startsWith("FLOWMATE_SES_CREATED") && request.externalObjectId) {
      const [, existingReference] = String(request.externalStatus).split("|");
      return {
        created: true,
        requestId: request.externalObjectId,
        referenceNumber: existingReference || "already created",
        attachmentCount: 0
      };
    }

    const serviceEntrySheet = await tx.run(
      SELECT.one.from(this.db.ServiceEntrySheetDetails).where({ request_ID: request.ID })
    );
    if (!serviceEntrySheet?.flowmateSesRequest) {
      return req.reject(400, "Create Flowmate Service Entry Sheet Request was not selected");
    }

    let flowmateSesDetails;
    try {
      flowmateSesDetails = typeof serviceEntrySheet.flowmateSesRequestDetails === "string"
        ? JSON.parse(serviceEntrySheet.flowmateSesRequestDetails)
        : serviceEntrySheet.flowmateSesRequestDetails;
    } catch (_error) {
      return req.reject(400, "Flowmate Service Entry Sheet details contain invalid JSON");
    }
    if (!flowmateSesDetails || typeof flowmateSesDetails !== "object") {
      return req.reject(400, "Flowmate Service Entry Sheet details are missing");
    }

    const caAttachments = await tx.run(
      SELECT.from(this.db.CAAttachments)
        .columns("ID", "filename", "mimeType", "content")
        .where({ request_ID: request.ID, category: "FLOWMATE_SES" })
    );
    if (!caAttachments.length) {
      return req.reject(400, "Select at least one Service Entry Sheet attachment before creating the Flowmate request");
    }

    const dynamicDetails = flowmateSesDetails.details && typeof flowmateSesDetails.details === "object"
      ? flowmateSesDetails.details
      : {};
    const normalizedDetails = { ...dynamicDetails };
    for (const field of [
      "invoices",
      "travelExpenses",
      "directForeignTravelEntries",
      "glBreakups",
      "merchantEntityValues",
      "settlementEntries"
    ]) {
      if (typeof normalizedDetails[field] !== "string") {
        continue;
      }
      try {
        normalizedDetails[field] = JSON.parse(normalizedDetails[field]);
      } catch (_error) {
        return req.reject(400, `Service Entry Sheet field ${field} contains invalid JSON`);
      }
      if (!Array.isArray(normalizedDetails[field])) {
        return req.reject(400, `Service Entry Sheet field ${field} must contain a JSON array`);
      }
    }

    const flowmateInput = {
      processType_code: flowmateSesDetails.processType_code,
      subProcessType_code: flowmateSesDetails.subProcessType_code,
      title: String(flowmateSesDetails.title || request.title || "").trim(),
      description: flowmateSesDetails.description || request.description || null,
      requesterUser_ID: request.requester_ID,
      processorTeam_ID: flowmateSesDetails.processorTeam_ID || request.ownerTeam_ID || null,
      processorTeamName: flowmateSesDetails.processorTeamName || request.ownerTeamName || null,
      department: flowmateSesDetails.department || null,
      amount: flowmateSesDetails.amount === "" || flowmateSesDetails.amount === null || flowmateSesDetails.amount === undefined
        ? null
        : Number(flowmateSesDetails.amount),
      role: flowmateSesDetails.role || "Service Entry Sheet",
      priorityConfig_code: flowmateSesDetails.priorityConfig_code || "MEDIUM",
      ...normalizedDetails
    };
    const encodedAttachments = await Promise.all(caAttachments.map(async (attachment) => ({
      filename: attachment.filename,
      mimeType: attachment.mimeType || "application/octet-stream",
      contentBase64: (await readAttachmentContent(attachment.content)).toString("base64")
    })));

    if (!flowmateInput.processType_code || !flowmateInput.subProcessType_code || !flowmateInput.title) {
      return req.reject(400, "Service Entry Sheet process type, subprocess type, and title are required");
    }
    if (!flowmateInput.processorTeam_ID) {
      return req.reject(400, "Select a Flowmate processor team for the Service Entry Sheet request");
    }
    if (encodedAttachments.some((attachment) => !attachment.contentBase64)) {
      return req.reject(400, "One or more Service Entry Sheet attachments have no content");
    }

    try {
      const result = await this.flowmate.send({
        event: "createRequestWithAttachments",
        data: {
          input: JSON.stringify(flowmateInput),
          attachments: JSON.stringify(encodedAttachments)
        }
      });
      await tx.run(UPDATE(this.db.CARequests).set({
        externalObjectId: result?.ID || null,
        externalStatus: `FLOWMATE_SES_CREATED|${result?.referenceNumber || ""}`
      }).where({ ID: request.ID }));
      await this._writeHistory(
        tx,
        request.ID,
        request.currentStep || 0,
        "FLOWMATE_SES_CREATED",
        user,
        request.status_code,
        request.status_code,
        result?.referenceNumber || "Flowmate Service Entry Sheet request created"
      );
      return {
        created: true,
        requestId: result?.ID,
        referenceNumber: result?.referenceNumber,
        attachmentCount: encodedAttachments.length
      };
    } catch (error) {
      cds.log("peer-integration").error("Flowmate Service Entry Sheet creation failed", error);
      return req.reject(502, `Flowmate request could not be created: ${error.message}`);
    }
  };

  /**
   * CA keeps the Flowmate integration payload and attachments on the request
   * while the CA workflow is running. The linked Flowmate request is created
   * only after the CA request reaches COMPLETED. Keeping this trigger on the
   * server prevents a rejected or partially processed CA request from creating
   * a Flowmate task queue entry.
   */
  _triggerFlowmateIntegrationIfRequired = async (req, requestId) => {
    const request = await cds.tx(req).run(
      SELECT.one.from(this.db.CARequests).where({ ID: requestId })
    );
    if (!request || request.status_code !== REQUEST_STATUS.COMPLETED || request.externalObjectId) {
      return null;
    }

    let handler;
    let event;
    if (request.requestType_code === "PURCHASE_ORDER") {
      const purchaseOrder = await cds.tx(req).run(
        SELECT.one.from(this.db.PurchaseOrderDetails).columns("paymentRun").where({ request_ID: request.ID })
      );
      // Payment Run not selected: nothing to hand over, the PO simply completes.
      if (!purchaseOrder?.paymentRun) return null;
      handler = this._createFlowmatePaymentRun;
      event = "createFlowmatePaymentRun";
    } else if (request.requestType_code === "SERVICE_ENTRY_SHEET") {
      const serviceEntrySheet = await cds.tx(req).run(
        SELECT.one.from(this.db.ServiceEntrySheetDetails).columns("flowmateSesRequest").where({ request_ID: request.ID })
      );
      if (!serviceEntrySheet?.flowmateSesRequest) return null;
      handler = this._createFlowmateServiceEntrySheet;
      event = "createFlowmateServiceEntrySheet";
    } else {
      return null;
    }

    // Use the same authenticated user and transaction context, but pass only
    // the action payload expected by the integration handler.
    const integrationReq = Object.create(req);
    integrationReq.event = event;
    integrationReq.data = { requestId };
    integrationReq.reject = (status, message) => req.reject(status, message);
    return handler.call(this, integrationReq);
  };

  _prepareDelegationCreate = async (req) => {
    const delegation = req.data;
    const currentUser = await this._ensureCurrentUser(req);
    const privileged = this._canMaintainDelegations(req);
    const requestedDelegatorId = delegation.delegator_ID || delegation.delegator?.ID;
    const delegateId = delegation.delegate_ID || delegation.delegate?.ID;
    const delegatorId = requestedDelegatorId || currentUser.ID;

    if (requestedDelegatorId && requestedDelegatorId !== currentUser.ID && !privileged) {
      return req.reject(403, "Only an administrator or supervisor can create a delegation for another user");
    }
    if (!delegateId) {
      return req.reject(400, "Select a delegate from the user list");
    }

    const users = await this.master.run(
      SELECT.from(this.masterEntities.Users)
        .columns("ID", "isActive")
        .where({ ID: { in: [...new Set([delegatorId, delegateId])] } })
    );
    const activeUserIds = new Set(users.filter((user) => user.isActive !== false).map((user) => user.ID));
    if (!activeUserIds.has(delegatorId)) {
      return req.reject(400, "Selected user on leave was not found or is inactive");
    }
    if (!activeUserIds.has(delegateId)) {
      return req.reject(400, "Selected delegate was not found or is inactive");
    }
    if (!delegation.startDate || !delegation.endDate) {
      return req.reject(400, "User, delegate, start date, and end date are required");
    }
    if (delegatorId === delegateId) {
      return req.reject(400, "A user cannot be assigned as their own delegate");
    }
    if (delegation.startDate > delegation.endDate) {
      return req.reject(400, "End date must be on or after start date");
    }

    delegation.delegator_ID = delegatorId;
    delegation.delegate_ID = delegateId;
    delegation.forwardNotifications ??= true;
    delegation.enabled ??= true;
    delegation.createdOnBehalf = delegatorId !== currentUser.ID;
    delete delegation.delegator;
    delete delegation.delegate;
  };

  _filterDelegations = async (req) => {
    if (this._canMaintainDelegations(req)) {
      return;
    }
    const currentUser = await this._ensureCurrentUser(req);
    req.query.where({ delegator_ID: currentUser.ID });
  };

  _authorizeDelegationDelete = async (req) => {
    if (this._canMaintainDelegations(req)) {
      return;
    }
    const delegationId = req.data.ID || req.params?.[0]?.ID;
    const [delegation, currentUser] = await Promise.all([
      this.master.run(SELECT.one.from(this.masterEntities.Delegations).columns("delegator_ID").where({ ID: delegationId })),
      this._ensureCurrentUser(req)
    ]);
    if (!delegation || delegation.delegator_ID !== currentUser.ID) {
      return req.reject(403, "Only the delegation owner or an administrator can delete this assignment");
    }
  };

  _canMaintainDelegations(req) {
    return Boolean(req.user.is("CAAdmin") || req.user.is("CASupervisor"));
  }

  async _activeDelegatorIds(req, delegateUserId) {
    if (!delegateUserId) {
      return [];
    }
    const today = new Date().toISOString().slice(0, 10);
    const delegations = await this.master.run(
      SELECT.from(this.masterEntities.Delegations)
        .columns("delegator_ID")
        .where({
          delegate_ID: delegateUserId,
          enabled: true,
          startDate: { "<=": today },
          endDate: { ">=": today }
        })
    );
    return [...new Set(delegations.map((delegation) => delegation.delegator_ID).filter(Boolean))];
  }

  async _effectiveTaskUserIds(req, userId) {
    return [...new Set([userId, ...(await this._activeDelegatorIds(req, userId))].filter(Boolean))];
  }

  async _canActForUser(req, actingUserId, assignedUserId) {
    if (!actingUserId || !assignedUserId) {
      return false;
    }
    return (await this._effectiveTaskUserIds(req, actingUserId)).includes(assignedUserId);
  }

  _filterMyRequests = async (req) => {
    const user = await this._ensureCurrentUser(req);
    req.query.where({ requester_ID: user.ID });
  };

  _filterMyTasks = async (req) => {
    const user = await this._ensureCurrentUser(req);
    const effectiveUserIds = await this._effectiveTaskUserIds(req, user.ID);
    req.query.where({ assignedUser_ID: { in: effectiveUserIds } });
  };

  _filterMyTeamTasks = async (req) => {
    if (req.user.is("CAAdmin")) {
      req.query.where({ assignedUser_ID: null });
      return;
    }
    const user = await this._ensureCurrentUser(req);
    const teamIds = await this._teamIdsOf(user);

    if (!teamIds.length) {
      req.query.where({ ID: null });
      return;
    }

    req.query.where({
      assignedTeam_ID: { in: teamIds },
      assignedUser_ID: null
    });
  };

  _getCurrentUser = async (req) => {
    const user = await this._ensureCurrentUser(req);
    const activeDelegatorUserIds = await this._activeDelegatorIds(req, user.ID);
    return {
      ID: user.ID,
      displayName: user.displayName,
      email: user.email,
      isAdmin: req.user.is("CAAdmin"),
      canDelegateOnBehalf: this._canMaintainDelegations(req),
      activeDelegatorUserIds
    };
  };

  _getDashboardCounts = async (req) => {
    const user = await this._ensureCurrentUser(req);
    const isAdmin = req.user.is("CAAdmin");
    const requestedBy = { requester_ID: user.ID };
    const effectiveUserIds = await this._effectiveTaskUserIds(req, user.ID);
    const assignedToMe = { assignedUser_ID: { in: effectiveUserIds } };
    // Only OPEN tasks are waiting on someone. A SENT_BACK task belongs to a step that
    // has been rolled back and is reopened when that step comes around again.
    const openStatus = { status_code: TASK_STATUS.OPEN };
    const teamIds = isAdmin ? [] : await this._teamIdsOf(user);

    const [
      allRequests,
      myRequests,
      myOpenTasks,
      sentBackRequests,
      rejectedRequests,
      pendingApproval,
      completedRequests
    ] = await Promise.all([
      this._count(this.db.CARequests, {}),
      this._count(this.db.CARequests, requestedBy),
      this._count(this.db.CATasks, { ...assignedToMe, ...openStatus }),
      this._count(this.db.CARequests, {
        ...requestedBy,
        status_code: REQUEST_STATUS.SENT_BACK
      }),
      this._count(this.db.CARequests, {
        ...requestedBy,
        status_code: REQUEST_STATUS.REJECTED
      }),
      this._count(this.db.CATasks, {
        ...assignedToMe,
        ...openStatus,
        isApproval: true
      }),
      this._count(this.db.CARequests, {
        ...requestedBy,
        status_code: REQUEST_STATUS.COMPLETED
      })
    ]);

    let myTeamTasks = 0;
    if (isAdmin) {
      myTeamTasks = await this._count(this.db.CATasks, { assignedUser_ID: null, ...openStatus });
    } else if (teamIds.length) {
      myTeamTasks = await this._count(this.db.CATasks, {
        assignedTeam_ID: { in: teamIds },
        assignedUser_ID: null,
        ...openStatus
      });
    }

    return {
      allRequests,
      myRequests,
      myOpenTasks,
      myTeamTasks,
      sentBackRequests,
      rejectedRequests,
      pendingApproval,
      completedRequests
    };
  };

  _createRequest = async (req) => {
    const input = req.data.input || {};
    const tx = cds.tx(req);
    const integration = resolveTechnicalCreator(req);
    const user = integration
      ? await this._getPORequester(req, integration.userId)
      : await this._ensureCurrentUser(req, tx);
    if (!integration && input.requesterUser_ID
      && String(input.requesterUser_ID).toLowerCase() !== String(user.ID).toLowerCase()) {
      return req.reject(403, "Browser requests must use the signed-in user as requester");
    }
    const requestType = await SELECT.one.from(this.db.RequestTypes)
      .where({ code: input.requestTypeCode, isActive: true });

    if (!requestType) {
      return req.reject(400, "Select a valid request type");
    }

    let requestVariant = null;
    if (input.requestVariantCode) {
      requestVariant = await SELECT.one.from(this.db.RequestVariants).where({
        code: input.requestVariantCode,
        requestType_code: requestType.code,
        isActive: true
      });
      if (!requestVariant) {
        return req.reject(400, "The selected request variant does not belong to this request type");
      }
    }

    let processorTeam = null;
    if (input.processorTeamCode) {
      processorTeam = await this.master.run(SELECT.one.from(this.masterEntities.Teams).where({
        teamCode: input.processorTeamCode,
        isActive: true
      }));
      if (!processorTeam) {
        return req.reject(400, "Select a valid processor team");
      }
    }


    const requestId = await this._insertOneRequest(req, tx, user, {
      requestType,
      requestVariant,
      processorTeam,
      input,
      integration
    });

    return tx.run(SELECT.one.from(this.db.CARequests).where({ ID: requestId }));
  };

  async _insertOneRequest(req, tx, user, { requestType, requestVariant, processorTeam, input, integration }) {
    const requestId = cds.utils.uuid();
    const referenceNumber = this._referenceNumber(requestType.code);
    const details = this._parseDetails(req, input.details);
    if (details.paymentRun && requestType.code !== "PURCHASE_ORDER") {
      return req.reject(400, "Payment Run is only supported for purchase order requests");
    }
    if (details.paymentRun) {
      if (!details.paymentRunDetails) {
        return req.reject(400, "Payment Run details are required when Payment Run is selected");
      }
      let paymentRunDetails;
      try {
        paymentRunDetails = typeof details.paymentRunDetails === "string"
          ? JSON.parse(details.paymentRunDetails)
          : details.paymentRunDetails;
      } catch (_error) {
        return req.reject(400, "Payment Run details contain invalid JSON");
      }
      if (!paymentRunDetails || typeof paymentRunDetails !== "object") {
        return req.reject(400, "Payment Run details must be a valid object");
      }
      for (const field of ["processTypeName", "subProcessTypeName", "title"]) {
        if (!String(paymentRunDetails[field] || "").trim()) {
          return req.reject(400, `Payment Run ${field} is required`);
        }
      }
    }
    if (details.flowmateSesRequest && requestType.code !== "SERVICE_ENTRY_SHEET") {
      return req.reject(400, "Flowmate Service Entry Sheet integration is only supported for service entry sheet requests");
    }
    if (details.flowmateSesRequest) {
      if (!details.flowmateSesRequestDetails) {
        return req.reject(400, "Flowmate Service Entry Sheet details are required when the integration is selected");
      }
      let flowmateSesDetails;
      try {
        flowmateSesDetails = typeof details.flowmateSesRequestDetails === "string"
          ? JSON.parse(details.flowmateSesRequestDetails)
          : details.flowmateSesRequestDetails;
      } catch (_error) {
        return req.reject(400, "Flowmate Service Entry Sheet details contain invalid JSON");
      }
      if (!flowmateSesDetails || typeof flowmateSesDetails !== "object") {
        return req.reject(400, "Flowmate Service Entry Sheet details must be a valid object");
      }
      for (const field of ["processTypeName", "subProcessTypeName", "title"]) {
        if (!String(flowmateSesDetails[field] || "").trim()) {
          return req.reject(400, `Flowmate Service Entry Sheet ${field} is required`);
        }
      }
    }
    if (integration) assertTechnicalDetails(req, details);
    await this._assertNoDuplicateMaterialDescription(req, requestType.code, details);
    await this._applyProjectCode(req, requestType.code, requestVariant?.code, details);

    await tx.run(INSERT.into(this.db.CARequests).entries({
      ID: requestId,
      referenceNumber,
      requestType_code: requestType.code,
      requestVariant_code: requestVariant?.code || null,
      title: input.title,
      description: input.description,
      requester_ID: user.ID,
      requesterName: user.displayName,
      requesterEmail: user.email,
      owner_ID: user.ID,
      ownerTeam_ID: processorTeam?.ID || null,
      ownerTeamName: processorTeam?.name || null,
      status_code: REQUEST_STATUS.DRAFT,
      priority_code: input.priorityCode || "MEDIUM",
      dueDate: input.dueDate || null,
      predecessor_ID: input.predecessorId || null,
      currentStep: 0
    }));

    await this._insertDetails(tx, requestType.code, requestId, details);
    await this._initializeWorkflow(tx, requestId, requestType.code, requestVariant?.code, details, user, req);
    const creationRemarks = integration ? JSON.stringify({
      source: "TECHNICAL_API",
      clientId: integration.clientId,
      requesterUserId: user.ID
    }) : undefined;
    await this._writeHistory(tx, requestId, 0, "REQUEST_CREATED", user, null, REQUEST_STATUS.SUBMITTED, creationRemarks);
    return requestId;
  }

  _createBulkRequests = async (req) => {
    const input = req.data.input || {};
    const tx = cds.tx(req);
    const user = await this._ensureCurrentUser(req, tx);

    let rows;
    try {
      rows = JSON.parse(input.rows || "[]");
    } catch (_error) {
      return req.reject(400, "The bulk rows contain invalid JSON");
    }
    if (!Array.isArray(rows) || !rows.length) {
      return req.reject(400, "Upload at least one row before submitting");
    }

    const requestType = await SELECT.one.from(this.db.RequestTypes)
      .where({ code: input.requestTypeCode, isActive: true });
    if (!requestType) {
      return req.reject(400, "Select a valid request type");
    }

    const variantCache = new Map();
    const resolveVariant = async (code) => {
      if (!code) {
        return null;
      }
      if (!variantCache.has(code)) {
        variantCache.set(code, await SELECT.one.from(this.db.RequestVariants).where({
          code,
          requestType_code: requestType.code,
          isActive: true
        }));
      }
      return variantCache.get(code);
    };

    let processorTeam = null;
    if (input.processorTeamCode) {
      processorTeam = await this.master.run(SELECT.one.from(this.masterEntities.Teams).where({
        teamCode: input.processorTeamCode,
        isActive: true
      }));
      if (!processorTeam) {
        return req.reject(400, "Select a valid processor team");
      }
    }

    const referenceNumbers = [];
    const requestIds = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index] || {};
      const { title, priorityCode, dueDate, requestVariantCode, ...details } = row;
      if (!String(title || "").trim()) {
        return req.reject(400, `Row ${index + 1}: Title is required`);
      }
      const variantCode = requestVariantCode || input.requestVariantCode;
      const requestVariant = await resolveVariant(variantCode);
      if (variantCode && !requestVariant) {
        return req.reject(400, `Row ${index + 1}: "${variantCode}" is not a valid process variant for this request type`);
      }
      try {
        const requestId = await this._insertOneRequest(req, tx, user, {
          requestType,
          requestVariant,
          processorTeam,
          input: {
            title: String(title).trim(),
            description: null,
            priorityCode: priorityCode || "MEDIUM",
            dueDate: dueDate || null,
            details: JSON.stringify(details)
          }
        });
        const created = await tx.run(
          SELECT.one.from(this.db.CARequests).columns("referenceNumber").where({ ID: requestId })
        );
        referenceNumbers.push(created.referenceNumber);
        requestIds.push(requestId);
      } catch (error) {
        return req.reject(400, `Row ${index + 1}: ${error.message}`);
      }
    }

    return {
      created: referenceNumbers.length,
      referenceNumbers: JSON.stringify(referenceNumbers),
      requestIds: JSON.stringify(requestIds)
    };
  };

  _submitRequest = async (req) => {
    const tx = cds.tx(req);
    const user = await this._ensureCurrentUser(req, tx);
    const request = await SELECT.one.from(this.db.CARequests).where({ ID: req.data.requestId });

    if (!request) {
      return req.reject(404, "Request not found");
    }
    if (request.status_code !== REQUEST_STATUS.DRAFT) {
      return req.reject(409, "Only draft requests can be submitted");
    }

    await this._initializeWorkflow(
      tx,
      request.ID,
      request.requestType_code,
      request.requestVariant_code,
      undefined,
      user,
      req
    );
    await this._writeHistory(tx, request.ID, 0, "REQUEST_SUBMITTED", user, REQUEST_STATUS.DRAFT, REQUEST_STATUS.SUBMITTED);
    return true;
  };

  _addTask = async (req) => {
    const tx = cds.tx(req);
    const user = await this._ensureCurrentUser(req, tx);
    const request = await SELECT.one.from(this.db.CARequests).where({ ID: req.data.requestId });

    if (!request) {
      return req.reject(404, "Request not found");
    }
    this._assertMutableRequest(req, request);

    const step = await SELECT.one.from(this.db.RequestStepInstances).where({
      request_ID: request.ID,
      stepNo: req.data.stepNo
    });
    if (!step) {
      return req.reject(400, "The selected step does not belong to this request");
    }

    const [assignedUser, assignedTeam] = await Promise.all([
      req.data.assignedUserId
        ? this.master.run(SELECT.one.from(this.masterEntities.Users).where({ ID: req.data.assignedUserId }))
        : null,
      req.data.assignedTeamId
        ? this.master.run(SELECT.one.from(this.masterEntities.Teams).where({ ID: req.data.assignedTeamId }))
        : null
    ]);
    const taskId = cds.utils.uuid();
    const task = {
      ID: taskId,
      referenceNumber: this._taskReferenceNumber(request.referenceNumber),
      request_ID: request.ID,
      stepInstance_ID: step.ID,
      stepNo: step.stepNo,
      taskName: req.data.taskName,
      description: req.data.description,
      assignedUser_ID: assignedUser?.ID || null,
      assignedTeam_ID: req.data.assignedTeamId || null,
      assignedName: assignedUser?.displayName || null,
      assignedEmail: assignedUser?.email || null,
      assignedTeamName: assignedTeam?.name || null,
      status_code: TASK_STATUS.OPEN,
      isMandatory: req.data.isMandatory === true,
      isApproval: req.data.isApproval === true,
      dueDate: req.data.dueDate || null
    };

    await tx.run(INSERT.into(this.db.CATasks).entries(task));
    await this._notifyTaskAssignment(tx, task);
    await tx.run(UPDATE(this.db.RequestStepInstances).set({
      status: "OPEN",
      completedAt: null,
      startedAt: step.startedAt || new Date().toISOString()
    }).where({ ID: step.ID }));
    await tx.run(UPDATE(this.db.CARequests).set({
      currentStep: Math.min(request.currentStep || step.stepNo, step.stepNo),
      status_code: REQUEST_STATUS.IN_PROGRESS,
      completedAt: null
    }).where({ ID: request.ID }));
    await this._writeHistory(tx, request.ID, step.stepNo, "TASK_ADDED", user, null, TASK_STATUS.OPEN, req.data.taskName);

    return tx.run(SELECT.one.from(this.db.CATasks).where({ ID: taskId }));
  };

  _claimTeamTask = async (req) => {
    const tx = cds.tx(req);
    const user = await this._ensureCurrentUser(req, tx);
    const task = await SELECT.one.from(this.db.CATasks).where({ ID: req.data.taskId });

    if (!task) {
      return req.reject(404, "Task not found");
    }
    if (!task.assignedTeam_ID || task.assignedUser_ID) {
      return req.reject(409, "This task is no longer available in the team queue");
    }

    const membership = await this.master.run(SELECT.one.from(this.masterEntities.TeamMembers).where({
      team_ID: task.assignedTeam_ID,
      user_ID: user.ID,
      isActive: true
    }));
    if (!membership && !req.user.is("CAAdmin")) {
      return req.reject(403, "You are not a member of the assigned team");
    }

    const iClaimed = await tx.run(UPDATE(this.db.CATasks).set({
      assignedUser_ID: user.ID,
      assignedName: user.displayName,
      assignedEmail: user.email
    }).where({
      ID: task.ID,
      assignedUser_ID: null,
      status_code: TASK_STATUS.OPEN
    }));
    if (!iClaimed) {
      return req.reject(409, "This task was just assigned to another team member");
    }
    await this._writeHistory(tx, task.request_ID, task.stepNo, "TASK_CLAIMED", user, null, TASK_STATUS.OPEN, task.taskName);
    return true;
  };

  _approveTask = async (req) => {
    const tx = cds.tx(req);
    const user = await this._ensureCurrentUser(req, tx);
    const task = await SELECT.one.from(this.db.CATasks).where({ ID: req.data.taskId });

    if (!task) {
      return req.reject(404, "Task not found");
    }
    await this._assertTaskAccess(req, task, user);
    if (task.status_code !== TASK_STATUS.OPEN) {
      return req.reject(409, "Only open tasks can be approved");
    }

    const step = await SELECT.one.from(this.db.RequestStepInstances).where({
      request_ID: task.request_ID,
      stepNo: task.stepNo
    });
    const request = await SELECT.one.from(this.db.CARequests).where({ ID: task.request_ID });
    const glEnrichmentStep = /g\s*\/?\s*l\s+account\s+enrichment/i.test(step?.stepName || "");
    const valuationClassStep = /valuation\s+class/i.test(step?.stepName || "");
    const serviceCodeStep = /s\s*\/?\s*4\s+data\s+validation/i.test(step?.stepName || "");
    // Existing variants change a code that already exists in S/4, so none of these steps
    // records a value for them. Mirrored in TaskDetail.controller.js.
    const existingVariant = /_EXISTING$/.test(request?.requestVariant_code || "");
    // Service Code and Material Code: the G/L Account Enrichment, Valuation Class and S/4 Data
    // Validation approvers record their value, once (single line) or per line item.
    const enrichment = {
      SERVICE_CODE: {
        details: "ServiceCodeDetails", items: "ServiceCodeItems",
        s4: { column: "serviceCode", param: "serviceCode", label: "Service Code", maxLength: 80 }
      },
      MATERIAL_CODE: {
        details: "MaterialCodeDetails", items: "MaterialCodeItems",
        s4: { column: "materialCode", param: "materialCode", label: "Material Code", maxLength: 40 }
      }
    }[request?.requestType_code];
    if ((glEnrichmentStep || valuationClassStep || serviceCodeStep) && enrichment && !existingVariant) {
      const serviceDetails = await SELECT.one.from(this.db[enrichment.details])
        .where({ request_ID: task.request_ID });
      const hasItemRows = serviceDetails && await SELECT.one.from(this.db[enrichment.items])
        .where({ details_ID: serviceDetails.ID });
      if (serviceDetails && !hasItemRows) {
        const updates = {};
        if (glEnrichmentStep) {
          const glAccount = String(req.data.glAccount || "").trim();
          if (!glAccount) {
            return req.reject(400, "Enter the GL Account to approve this task");
          }
          if (glAccount.length > 80) {
            return req.reject(400, "GL Account must be 80 characters or fewer");
          }
          updates.glAccount = glAccount;
        }
        if (valuationClassStep) {
          const valuationClass = String(req.data.valuationClass || "").trim();
          if (!valuationClass) {
            return req.reject(400, "Enter the Valuation Class to approve this task");
          }
          if (valuationClass.length > 40) {
            return req.reject(400, "Valuation Class must be 40 characters or fewer");
          }
          updates.valuationClass_code = valuationClass;
        }
        if (serviceCodeStep) {
          const { s4 } = enrichment;
          const code = String(req.data[s4.param] || "").trim();
          if (!code) {
            return req.reject(400, `Enter the ${s4.label} to approve this task`);
          }
          if (code.length > s4.maxLength) {
            return req.reject(400, `${s4.label} must be ${s4.maxLength} characters or fewer`);
          }
          updates[s4.column] = code;
        }
        await tx.run(UPDATE(this.db[enrichment.details]).set(updates).where({ ID: serviceDetails.ID }));
      } else if (serviceDetails && hasItemRows) {
        // Multiple line items: the approver enters the value per line (lineValues JSON).
        const target = glEnrichmentStep
          ? { column: "glAccount", label: "G/L Account", maxLength: 80 }
          : (valuationClassStep
            ? { column: "valuationClass_code", label: "Valuation Class", maxLength: 40 }
            : enrichment.s4);
        const failure = await this._applyLineValues(tx, req, this.db[enrichment.items], serviceDetails.ID, target);
        if (failure) return failure;
      }
    }

    // Equipment Code: the S/4 Data Validation approver records the created Equipment Code,
    // once for a single line item or per line item.
    if (serviceCodeStep && request?.requestType_code === "EQUIPMENT_CODE" && !existingVariant) {
      const equipmentDetails = await SELECT.one.from(this.db.EquipmentCodeDetails)
        .where({ request_ID: task.request_ID });
      const hasItemRows = equipmentDetails && await SELECT.one.from(this.db.EquipmentCodeItems)
        .where({ details_ID: equipmentDetails.ID });
      if (equipmentDetails && !hasItemRows) {
        const equipmentCode = String(req.data.equipmentCode || "").trim();
        if (!equipmentCode) {
          return req.reject(400, "Enter the Equipment Code to approve this task");
        }
        if (equipmentCode.length > 80) {
          return req.reject(400, "Equipment Code must be 80 characters or fewer");
        }
        await tx.run(UPDATE(this.db.EquipmentCodeDetails).set({ equipmentCode }).where({ ID: equipmentDetails.ID }));
      } else if (equipmentDetails && hasItemRows) {
        const failure = await this._applyLineValues(tx, req, this.db.EquipmentCodeItems, equipmentDetails.ID,
          { column: "equipmentCode", label: "Equipment Code", maxLength: 80 });
        if (failure) return failure;
      }
    }

    // Project Code: the S/4 Data Validation approver records the created Project Code (New /
    // Modification), or the Function Location / Activity per the Object Type.
    if (serviceCodeStep && request?.requestType_code === "PROJECT_CODE") {
      const projectDetails = await SELECT.one.from(this.db.ProjectCodeDetails)
        .where({ request_ID: task.request_ID });
      const target = projectDetails && this._projectValueTarget(request.requestVariant_code, projectDetails.transactionType);
      const hasItemRows = target && await SELECT.one.from(this.db.ProjectCodeItems)
        .where({ details_ID: projectDetails.ID });
      if (target && !hasItemRows) {
        const value = String(req.data.projectValue || "").trim();
        if (!value) {
          return req.reject(400, `Enter the ${target.label} to approve this task`);
        }
        if (value.length > target.maxLength) {
          return req.reject(400, `${target.label} must be ${target.maxLength} characters or fewer`);
        }
        await tx.run(UPDATE(this.db.ProjectCodeDetails).set({ [target.column]: value }).where({ ID: projectDetails.ID }));
      } else if (target && hasItemRows) {
        const failure = await this._applyLineValues(tx, req, this.db.ProjectCodeItems, projectDetails.ID, target);
        if (failure) return failure;
      }
    }

    // Material Reservation: the approver of the S/4 step records the Material Reservation Number
    // created in S/4 for each line item (both variants).
    if (request?.requestType_code === "MATERIAL_RESERVATION" && this._isReservationS4Step(step?.stepName)) {
      const reservationDetails = await SELECT.one.from(this.db.MaterialReservationDetails)
        .where({ request_ID: task.request_ID });
      if (reservationDetails) {
        const failure = await this._applyLineValues(tx, req, this.db.MaterialReservationItems, reservationDetails.ID,
          { column: "reservationNumber", label: "Material Reservation Number", maxLength: 40 });
        if (failure) return failure;
      }
    }

    // The last step of a PO with "Create SES Successor" captures the PO number for the SES.
    const poDetails = await this._poDetailsNeedingNumber(tx, task);
    if (poDetails) {
      const purchaseOrderNo = String(req.data.purchaseOrderNo || "").trim();
      if (!purchaseOrderNo) {
        return req.reject(400, "Enter the Purchase Order number to approve this task");
      }
      await tx.run(UPDATE(this.db.PurchaseOrderDetails)
        .set({ purchaseOrderNumber: purchaseOrderNo })
        .where({ ID: poDetails.ID }));
    }

    const approvedAt = new Date().toISOString();
    const lateness = this._lateDecision(task, approvedAt);
    await tx.run(UPDATE(this.db.CATasks).set({
      status_code: TASK_STATUS.APPROVED,
      decision: "APPROVED",
      remarks: req.data.remarks,
      completedAt: approvedAt,
      ...lateness,
      ...this._handlerStamp(task, user)
    }).where({ ID: task.ID }));
    await this._writeHistory(tx, task.request_ID, task.stepNo, "TASK_APPROVED", user, task.status_code, TASK_STATUS.APPROVED, req.data.remarks);
    if (task.slaBreached || lateness.slaBreached) {
      await this._writeHistory(tx, task.request_ID, task.stepNo, "APPROVED_AFTER_SLA", user, null, null,
        `Approved ${this._overdueText(task.slaDueAt, approvedAt)} after the SLA due date`);
    }
    await this._autoCompleteStepIfDone(req, tx, task, user);
    return true;
  };

  // A step completes on its own once nothing is left to do in it: no task of the step is still
  // open and every mandatory one is approved (the same rule completeStep applies). Only the
  // request's current open step advances, and the last step also needs every other step done.
  // It then takes the exact completeStep path, so next-step tasks, routing and the SES successor
  // behave as before. completeStep stays available as a manual fallback.
  _previewProjectCode = async (req) => {
    let details;
    try {
      details = JSON.parse(req.data.details || "{}");
    } catch (_error) {
      return req.reject(400, "The details contain invalid JSON");
    }
    return JSON.stringify(await this._generateProjectCode(details || {}));
  };

  // Project Code (New / Modification), Single line. From the PCC masters:
  //   Project ID          <Division letter>/<YY of the AR year>/<NNN>/<Vendor letter>, where NNN counts
  //                       per Division letter + Vendor letter across all years;
  //   Project Category    <High Level PC>/<Scope>/<Project Type> (no Scope for non-engineering);
  //   Project Description <Site ID>_<Site Name>_<Project ID>.
  // Parts whose inputs are not chosen yet stay empty. keepProjectId keeps an already assigned
  // number while the Division and Vendor letters are unchanged (requester edits on step 1).
  async _generateProjectCode(details, keepProjectId) {
    const lookup = (entity, column, value) => (value
      ? this.master.run(SELECT.one.from(this.masterEntities[entity]).where({ [column]: value }))
      : null);
    const [division, vendor, ar] = await Promise.all([
      lookup("DivisionsPcc", "division", details.division),
      lookup("VendorsPcc", "vendor", details.vendorPcc),
      lookup("ArPcc", "ar", details.arReference)
    ]);
    const projectCategory = ar?.highLevelPc && details.projectTypePcc
      ? [ar.highLevelPc, details.scope, details.projectTypePcc].filter(Boolean).join("/")
      : "";

    let projectId = "";
    if (division?.divisionLetter && vendor?.vendorLetter && ar?.year) {
      const prefix = `${division.divisionLetter}/`;
      const suffix = `/${vendor.vendorLetter}`;
      const yy = String(ar.year).slice(-2);
      const kept = String(keepProjectId || "").split("/");
      let number;
      if (kept.length === 4 && keepProjectId.startsWith(prefix) && keepProjectId.endsWith(suffix)) {
        number = kept[2];
      } else {
        const pattern = `${prefix}%${suffix}`;
        const [headerIds, itemIds] = await Promise.all([
          SELECT.from(this.db.ProjectCodeDetails).columns("projectId").where({ projectId: { like: pattern } }),
          SELECT.from(this.db.ProjectCodeItems).columns("projectId").where({ projectId: { like: pattern } })
        ]);
        const highest = headerIds.concat(itemIds).reduce((max, row) => {
          const value = Number.parseInt(String(row.projectId).split("/")[2], 10);
          return Number.isFinite(value) && value > max ? value : max;
        }, 0);
        number = String(highest + 1).padStart(3, "0");
      }
      projectId = `${division.divisionLetter}/${yy}/${number}/${vendor.vendorLetter}`;
    }

    const projectDescription = details.siteId && details.siteName && projectId
      ? `${details.siteId}_${details.siteName}_${projectId}`
      : "";
    return { projectId, projectCategory, projectDescription };
  }

  // Applies the generated values to Project Code (New / Modification) details; the server value
  // always wins over the form's preview. Multiple Line Items share the request's Project ID and
  // Category, and each line gets its own description from its own site.
  async _applyProjectCode(req, requestTypeCode, variantCode, details, keepProjectId) {
    if (requestTypeCode !== "PROJECT_CODE" || variantCode !== "PROJECT_NEW_MOD") {
      return;
    }
    const generated = await this._generateProjectCode(details, keepProjectId);
    if (!generated.projectId) {
      return req.reject(400, "Select a Division, AR and Vendor from the PCC lists to generate the Project ID");
    }
    if (!generated.projectCategory) {
      return req.reject(400, "Select an AR and Project Type from the PCC lists to generate the Project Category");
    }
    if (Array.isArray(details.items) && details.items.length) {
      const { projectId, projectCategory } = generated;
      Object.assign(details, { projectId, projectCategory, projectDescription: "" });
      details.items.forEach((item) => {
        Object.assign(item, {
          projectId,
          projectCategory,
          projectDescription: item.siteId && item.siteName ? `${item.siteId}_${item.siteName}_${projectId}` : ""
        });
      });
      return;
    }
    Object.assign(details, generated);
  }

  // What the Project Code S/4 Data Validation approver enters. Mirrored in TaskDetail.controller.js.
  // The step that creates the reservation in S/4 (named "S/4 Material Reservation" in the workflow).
  // Mirrored in TaskDetail.controller.js.
  _isReservationS4Step(stepName) {
    return /s\s*\/?\s*4\s+(data\s+validation|material\s+reservation)/i.test(stepName || "");
  }

  _projectValueTarget(variantCode, transactionType) {
    if (variantCode === "PROJECT_NEW_MOD") {
      return { column: "projectCode", label: "Project Code", maxLength: 80 };
    }
    if (variantCode === "PROJECT_FL_ACTIVITY") {
      if (transactionType === "FUNCTION_LOCATION") {
        return { column: "functionLocation", label: "Function Location", maxLength: 80 };
      }
      if (transactionType === "ACTIVITY") {
        return { column: "activityNumber", label: "Activity", maxLength: 80 };
      }
    }
    return null;
  }

  // Writes one approver-entered value per line item (lineValues JSON [{ itemId, value }]).
  // Returns the rejection when a line is missing or too long, otherwise nothing.
  async _applyLineValues(tx, req, itemsEntity, detailsId, target) {
    let lineValues;
    try {
      lineValues = JSON.parse(req.data.lineValues || "[]");
    } catch (_error) {
      return req.reject(400, "The line values contain invalid JSON");
    }
    const valueByItem = new Map((Array.isArray(lineValues) ? lineValues : [])
      .map((entry) => [entry?.itemId, String(entry?.value ?? "").trim()]));
    const items = await SELECT.from(itemsEntity)
      .columns("ID", "itemNo")
      .where({ details_ID: detailsId })
      .orderBy("itemNo");
    for (const item of items) {
      const value = valueByItem.get(item.ID) || "";
      if (!value) {
        return req.reject(400, `Row ${item.itemNo}: enter the ${target.label} to approve this task`);
      }
      if (value.length > target.maxLength) {
        return req.reject(400, `Row ${item.itemNo}: ${target.label} must be ${target.maxLength} characters or fewer`);
      }
    }
    for (const item of items) {
      await tx.run(UPDATE(itemsEntity)
        .set({ [target.column]: valueByItem.get(item.ID) })
        .where({ ID: item.ID, details_ID: detailsId }));
    }
  }

  async _autoCompleteStepIfDone(req, tx, task, user) {
    const request = await tx.run(SELECT.one.from(this.db.CARequests).where({ ID: task.request_ID }));
    if (!request || [REQUEST_STATUS.COMPLETED, REQUEST_STATUS.REJECTED].includes(request.status_code)) {
      return;
    }
    const steps = await tx.run(SELECT.from(this.db.RequestStepInstances)
      .where({ request_ID: request.ID })
      .orderBy("stepNo"));
    const step = steps.find((entry) => entry.stepNo === task.stepNo);
    if (!step || step.status !== "OPEN") {
      return;
    }
    const stepTasks = await tx.run(SELECT.from(this.db.CATasks).where({
      request_ID: request.ID,
      stepNo: step.stepNo
    }));
    const stillOpen = stepTasks.some((entry) => entry.status_code === TASK_STATUS.OPEN);
    const mandatoryPending = stepTasks.some((entry) => entry.isMandatory && entry.status_code !== TASK_STATUS.APPROVED);
    if (stillOpen || mandatoryPending) {
      return;
    }
    const lastStepNo = Math.max(...steps.map((entry) => entry.stepNo));
    if (step.stepNo === lastStepNo) {
      const incompleteStep = steps.find((entry) => entry.stepNo !== step.stepNo && entry.status !== "COMPLETED");
      const openTask = await tx.run(SELECT.one.from(this.db.CATasks).where({
        request_ID: request.ID,
        status_code: { in: [TASK_STATUS.OPEN, TASK_STATUS.SENT_BACK] }
      }));
      if (incompleteStep || openTask) {
        return;
      }
    }
    await this._advanceFromStep(tx, request, step, steps, user, req.data.remarks, req);
  }

  _rejectTask = async (req) => {
    const tx = cds.tx(req);
    const user = await this._ensureCurrentUser(req, tx);
    const task = await SELECT.one.from(this.db.CATasks).where({ ID: req.data.taskId });

    if (!task) {
      return req.reject(404, "Task not found");
    }
    await this._assertTaskAccess(req, task, user);
    if (task.status_code !== TASK_STATUS.OPEN) {
      return req.reject(409, "Only open tasks can be rejected");
    }
    if (!String(req.data.remarks || "").trim()) {
      return req.reject(400, "A reason is required to reject a request");
    }

    const rejectedAt = new Date().toISOString();
    await tx.run(UPDATE(this.db.CATasks).set({
      status_code: TASK_STATUS.REJECTED,
      decision: "REJECTED",
      remarks: req.data.remarks,
      completedAt: rejectedAt,
      ...this._lateDecision(task, rejectedAt)
    }).where({ ID: task.ID }));
    await tx.run(UPDATE(this.db.CATasks).set({
      status_code: TASK_STATUS.REJECTED,
      decision: "REJECTED",
      completedAt: rejectedAt
    }).where({
      request_ID: task.request_ID,
      status_code: { in: [TASK_STATUS.OPEN, TASK_STATUS.SENT_BACK] }
    }));
    await tx.run(UPDATE(this.db.RequestStepInstances).set({
      status: "REJECTED",
      completedAt: rejectedAt
    }).where({ request_ID: task.request_ID, stepNo: task.stepNo }));
    await tx.run(UPDATE(this.db.CARequests).set({
      status_code: REQUEST_STATUS.REJECTED,
      completedAt: rejectedAt
    }).where({ ID: task.request_ID }));
    await this._writeHistory(tx, task.request_ID, task.stepNo, "TASK_REJECTED", user, task.status_code, TASK_STATUS.REJECTED, req.data.remarks);
    await this._notifyRequestOutcome(tx, task.request_ID, REQUEST_OUTCOME.REJECTED, req.data.remarks);
    return true;
  };

  _sendBackTask = async (req) => {
    const tx = cds.tx(req);
    const user = await this._ensureCurrentUser(req, tx);
    const task = await SELECT.one.from(this.db.CATasks).where({ ID: req.data.taskId });

    if (!task) {
      return req.reject(404, "Task not found");
    }
    await this._assertTaskAccess(req, task, user);
    if (task.status_code !== TASK_STATUS.OPEN) {
      return req.reject(409, "Only open tasks can be sent back");
    }
    if (!req.data.targetStepNo || req.data.targetStepNo >= task.stepNo) {
      return req.reject(400, "Select an earlier workflow step");
    }

    const targetStep = await SELECT.one.from(this.db.RequestStepInstances).where({
      request_ID: task.request_ID,
      stepNo: req.data.targetStepNo
    });
    if (!targetStep) {
      return req.reject(400, "The selected target step does not exist");
    }

    await tx.run(UPDATE(this.db.CATasks).set({
      status_code: TASK_STATUS.SENT_BACK,
      decision: "SENT_BACK",
      remarks: req.data.remarks,
      completedAt: null,
      ...this._lateDecision(task, new Date().toISOString()),
      ...this._handlerStamp(task, user)
    }).where({ ID: task.ID }));
    await this._replanSlaFrom(tx, task.request_ID, targetStep.stepNo);
    await tx.run(UPDATE(this.db.RequestStepInstances).set({
      status: "OPEN",
      completedAt: null,
      startedAt: new Date().toISOString()
    }).where({ ID: targetStep.ID }));
    // A send-back replays the workflow from the target step, so every step after it
    // returns to PENDING; otherwise the next completion skips straight past them.
    await tx.run(UPDATE(this.db.RequestStepInstances).set({
      status: "PENDING",
      startedAt: null,
      completedAt: null
    }).where({ request_ID: task.request_ID, stepNo: { ">": targetStep.stepNo } }));
    // The step that sent the request back is flagged so the guided process shows where it
    // came from; it reopens as OPEN when the flow reaches it again.
    await tx.run(UPDATE(this.db.RequestStepInstances).set({
      status: "SENT_BACK"
    }).where({ request_ID: task.request_ID, stepNo: task.stepNo }));
    await tx.run(UPDATE(this.db.CARequests).set({
      currentStep: targetStep.stepNo,
      status_code: REQUEST_STATUS.SENT_BACK,
      completedAt: null
    }).where({ ID: task.request_ID }));
    // The reopened step's e-mail says it was sent back and carries the sender's remarks.
    await this._createConfiguredTaskIfMissing(tx, task.request_ID, targetStep, {
      notificationType: "SENT_BACK",
      remarks: req.data.remarks,
      sentBackBy: user.displayName
    });
    await this._writeHistory(tx, task.request_ID, targetStep.stepNo, "TASK_SENT_BACK", user, task.status_code, TASK_STATUS.SENT_BACK, req.data.remarks);
    // The requester is told too, with the remarks, besides the task e-mail to the step's owner.
    await this._notifyRequestOutcome(tx, task.request_ID, REQUEST_OUTCOME.SENT_BACK, req.data.remarks);
    return true;
  };

  // Step 1 is the requester's own. They edit the business content here - on creation
  // and again after a send-back - then push the request to the next step.
  // Saves the requester's corrections on their own step. The step itself is closed by
  // approving its task and completing the step, exactly as every other step is.
  _saveRequesterDetails = async (req) => {
    const tx = cds.tx(req);
    const user = await this._ensureCurrentUser(req, tx);
    const request = await SELECT.one.from(this.db.CARequests).where({ ID: req.data.requestId });

    if (!request) {
      return req.reject(404, "Request not found");
    }
    this._assertMutableRequest(req, request);
    if (!(await this._canActForUser(req, user.ID, request.owner_ID))) {
      return req.reject(403, "Only the requester or an active delegate can edit this request");
    }

    const step = await SELECT.one.from(this.db.RequestStepInstances)
      .where({ request_ID: request.ID, stepNo: 1 });
    if (!step) {
      return req.reject(404, "Workflow step not found");
    }
    if (step.status !== "OPEN") {
      return req.reject(409, "The request is no longer waiting on the requester");
    }

    const details = this._parseDetails(req, req.data.details);
    await this._assertNoDuplicateMaterialDescription(req, request.requestType_code, details, request.ID);
    if (request.requestType_code === "PROJECT_CODE") {
      const stored = await SELECT.one.from(this.db.ProjectCodeDetails).columns("projectId").where({ request_ID: request.ID });
      await this._applyProjectCode(req, request.requestType_code, request.requestVariant_code, details, stored?.projectId);
    }
    await this._updateDetails(tx, request.requestType_code, request.ID, details);
    return true;
  };

  _completeStep = async (req) => {
    const tx = cds.tx(req);
    const user = await this._ensureCurrentUser(req, tx);
    const request = await SELECT.one.from(this.db.CARequests).where({ ID: req.data.requestId });

    if (!request) {
      return req.reject(404, "Request not found");
    }
    this._assertMutableRequest(req, request);
    if (!(await this._canActForUser(req, user.ID, request.owner_ID))
        && !req.user.is("CAAdmin") && !req.user.is("CASupervisor")) {
      return req.reject(403, "Only the request owner, an active delegate, or a supervisor can complete a step");
    }

    const steps = await SELECT.from(this.db.RequestStepInstances)
      .where({ request_ID: request.ID })
      .orderBy("stepNo");
    const step = steps.find((entry) => entry.stepNo === req.data.stepNo);
    if (!step) {
      return req.reject(404, "Workflow step not found");
    }

    const tasks = await SELECT.from(this.db.CATasks).where({
      request_ID: request.ID,
      stepNo: step.stepNo
    });
    const blockingTask = tasks.find((task) => task.isMandatory && task.status_code !== TASK_STATUS.APPROVED);
    if (blockingTask) {
      return req.reject(409, `Approve mandatory task "${blockingTask.taskName}" before completing this step`);
    }

    const lastStepNo = Math.max(...steps.map((entry) => entry.stepNo));
    if (step.stepNo === lastStepNo) {
      const incompleteStep = steps.find((entry) => entry.stepNo !== step.stepNo && entry.status !== "COMPLETED");
      const openTask = await SELECT.one.from(this.db.CATasks).where({
        request_ID: request.ID,
        status_code: { in: [TASK_STATUS.OPEN, TASK_STATUS.SENT_BACK] }
      });
      if (incompleteStep || openTask) {
        return req.reject(409, "Complete every preceding step and approve every open task before closing the final step");
      }
    }

    return this._advanceFromStep(tx, request, step, steps, user, req.data.remarks, req);
  };

  // Shared by completeStep and the requester-step submit: close the given step and
  // open the next one that is not already complete. Kept in one place so the
  // send-back replay order cannot drift between the two callers.
  async _advanceFromStep(tx, request, step, steps, user, remarks, req) {
    const lastStepNo = Math.max(...steps.map((entry) => entry.stepNo));
    const now = new Date().toISOString();

    await tx.run(UPDATE(this.db.RequestStepInstances).set({
      status: "COMPLETED",
      completedAt: now
    }).where({ ID: step.ID }));

    if (step.stepNo === lastStepNo) {
      await tx.run(UPDATE(this.db.CARequests).set({
        currentStep: step.stepNo,
        status_code: REQUEST_STATUS.COMPLETED,
        completedAt: now
      }).where({ ID: request.ID }));
      await this._writeHistory(tx, request.ID, step.stepNo, "REQUEST_COMPLETED", user, request.status_code, REQUEST_STATUS.COMPLETED, remarks);
      await this._notifyRequestOutcome(tx, request.ID, REQUEST_OUTCOME.COMPLETED);
      await this._createSesSuccessor(tx, request, user);
      await this._triggerFlowmateIntegrationIfRequired(req, request.ID);
      return true;
    }

    const nextStep = steps.find((entry) => entry.stepNo > step.stepNo && entry.status !== "COMPLETED");
    if (nextStep) {
      await tx.run(UPDATE(this.db.RequestStepInstances).set({
        status: "OPEN",
        startedAt: now
      }).where({ ID: nextStep.ID }));
      await tx.run(UPDATE(this.db.CARequests).set({
        currentStep: nextStep.stepNo,
        status_code: REQUEST_STATUS.IN_PROGRESS
      }).where({ ID: request.ID }));
      await this._createConfiguredTaskIfMissing(tx, request.ID, nextStep);
    }

    await this._writeHistory(tx, request.ID, step.stepNo, "STEP_COMPLETED", user, step.status, "COMPLETED", remarks);
    return true;
  }

  _addComment = async (req) => {
    const tx = cds.tx(req);
    const user = await this._ensureCurrentUser(req, tx);
    const id = cds.utils.uuid();
    await tx.run(INSERT.into(this.db.CAComments).entries({
      ID: id,
      request_ID: req.data.requestId,
      comment: req.data.comment,
      authorName: user.displayName,
      authorEmail: user.email
    }));
    return tx.run(SELECT.one.from(this.db.CAComments).where({ ID: id }));
  };

  _createSuccessorRequest = async (req) => {
    const source = await SELECT.one.from(this.db.CARequests).where({ ID: req.data.requestId });
    if (!source) {
      return req.reject(404, "Source request not found");
    }

    req.data.input = {
      requestTypeCode: req.data.requestTypeCode,
      title: req.data.title,
      description: `Created from ${source.referenceNumber}`,
      priorityCode: source.priority_code,
      predecessorId: source.ID,
      details: "{}"
    };
    return this._createRequest(req);
  };

  _sendToS4 = async (req) => {
    const request = await SELECT.one.from(this.db.CARequests).where({ ID: req.data.requestId });
    if (!request) {
      return req.reject(404, "Request not found");
    }

    return {
      accepted: false,
      integrationState: "DESTINATION_NOT_CONFIGURED",
      message: "The S/4HANA integration boundary is ready. Configure the customer destination and API mapping before enabling transmission."
    };
  };

  async _initializeWorkflow(tx, requestId, requestTypeCode, requestVariantCode, details, user, req) {
    const configs = await SELECT.from(this.db.WorkflowStepConfigs)
      .where({ requestType_code: requestTypeCode, isActive: true })
      .orderBy("stepNo");
    const conditionSource = details || await this._loadDetails(tx, requestTypeCode, requestId);
    const selectedConfigs = this._selectWorkflowConfigs(configs, requestVariantCode)
      .filter((config) => this._isStepApplicable(config, conditionSource));

    if (!selectedConfigs.length) {
      throw new Error(`No active workflow is configured for ${requestTypeCode}`);
    }

    const teams = await this.master.run(SELECT.from(this.masterEntities.Teams));
    const teamsById = new Map(teams.map((team) => [team.ID, team]));
    const submittedAt = new Date().toISOString();
    // Step 1 is signed off by submitting, so it takes no SLA time; the rest are planned from now.
    const schedule = this._planSlaSchedule(
      selectedConfigs.map((config, index) => (index === 0 ? 0 : config.slaDays)),
      submittedAt
    );
    const stepEntries = selectedConfigs.map((config, index) => ({
      ID: cds.utils.uuid(),
      request_ID: requestId,
      config_ID: config.ID,
      stepNo: index + 1,
      stepName: config.stepName,
      activityDescription: config.activityDescription,
      processorTeam_ID: config.processorTeam_ID,
      processorTeamName: teamsById.get(config.processorTeam_ID)?.name || null,
      status: index === 0 ? "OPEN" : "PENDING",
      slaDays: config.slaDays,
      ...schedule[index],
      startedAt: index === 0 ? submittedAt : null,
      completedAt: null
    }));
    await tx.run(INSERT.into(this.db.RequestStepInstances).entries(stepEntries));

    // Step 1 belongs to the requester. Submitting the request is their sign-off, so its task
    // is approved and the step completed straight away. The task stays on the requester, so a
    // send-back to step 1 reopens it to them and they can edit the details as before.
    const requesterStep = stepEntries[0];
    await this._createConfiguredTaskIfMissing(tx, requestId, requesterStep);

    const lastDeadline = schedule[schedule.length - 1];
    await tx.run(UPDATE(this.db.CARequests).set({
      currentStep: requesterStep.stepNo,
      status_code: REQUEST_STATUS.SUBMITTED,
      submittedAt,
      dueDate: lastDeadline.dueDate,
      slaDueAt: lastDeadline.slaDueAt
    }).where({ ID: requestId }));

    const remarks = "Auto-completed on submission";
    const request = await tx.run(SELECT.one.from(this.db.CARequests).where({ ID: requestId }));
    const requesterTasks = await tx.run(SELECT.from(this.db.CATasks).where({
      request_ID: requestId,
      stepNo: requesterStep.stepNo
    }));
    for (const task of requesterTasks) {
      await tx.run(UPDATE(this.db.CATasks).set({
        status_code: TASK_STATUS.APPROVED,
        decision: "APPROVED",
        remarks,
        completedAt: submittedAt,
        assignedUser_ID: request.requester_ID,
        assignedName: request.requesterName,
        assignedEmail: request.requesterEmail
      }).where({ ID: task.ID }));
      await this._writeHistory(tx, requestId, requesterStep.stepNo, "TASK_APPROVED", user, task.status_code, TASK_STATUS.APPROVED, remarks);
    }
    await this._advanceFromStep(tx, request, requesterStep, stepEntries, user, remarks, req);
  }

  // An APPROVER step goes straight to the user the requester picked on the form
  // (approver_ID, or loaApprover_ID for SES), so it lands in that user's Pending Approval.
  // Without a selection the task stays in the processor team's queue.
  // SCM steps of an outline contract go to the SCM user named on the form: SCM Assign User
  // (Contract Modification) or the SCM SPOC (New Contract; older requests kept it on row 1).
  // All store an email.
  async _approverAssignment(config, details) {
    let where = null;
    if (config?.roleCode === "APPROVER") {
      const approverId = details?.approver_ID || details?.loaApprover_ID;
      where = approverId ? { ID: approverId } : null;
    } else if (config?.roleCode === "SCM") {
      const email = details?.scmAssignUser || details?.scmSpocUserId || details?.items?.[0]?.scmSpocUserId;
      where = email ? { email } : null;
    }
    if (!where) {
      return {};
    }
    const approver = await this.master.run(SELECT.one.from(this.masterEntities.Users)
      .where({ ...where, isActive: true }));
    if (!approver) {
      return {};
    }
    return {
      assignedUser_ID: approver.ID,
      assignedName: approver.displayName,
      assignedEmail: approver.email
    };
  }

  // The PO details row when this task is the last step of a PO that has "Create SES Successor";
  // otherwise null.
  async _poDetailsNeedingNumber(tx, task) {
    const request = await tx.run(SELECT.one.from(this.db.CARequests)
      .columns("ID", "requestType_code")
      .where({ ID: task.request_ID }));
    if (request?.requestType_code !== "PURCHASE_ORDER") {
      return null;
    }
    const details = await tx.run(SELECT.one.from(this.db.PurchaseOrderDetails)
      .columns("ID", "sesRequired")
      .where({ request_ID: request.ID }));
    if (!details?.sesRequired) {
      return null;
    }
    const steps = await tx.run(SELECT.from(this.db.RequestStepInstances)
      .columns("stepNo")
      .where({ request_ID: request.ID }));
    const lastStepNo = Math.max(...steps.map((step) => step.stepNo));
    return task.stepNo === lastStepNo ? details : null;
  }

  // Runs when a request completes. For a PO with "Create SES Successor", turns the SES captured at
  // PO creation into a real SES_NEW request: linked as successor, carrying the PO number entered
  // on the last approval, owned by the PO requester, with the SES_* attachments moved across.
  // It runs inside step completion (_advanceFromStep), which has no HTTP request, so request-level
  // checks reached through _parseDetails / _insertOneRequest throw instead of calling req.reject.
  async _createSesSuccessor(tx, poRequest, user) {
    if (poRequest.requestType_code !== "PURCHASE_ORDER") {
      return;
    }
    const req = {
      reject: (code, message) => {
        throw Object.assign(new Error(`SES successor: ${message}`), { code });
      }
    };
    const poDetails = await tx.run(SELECT.one.from(this.db.PurchaseOrderDetails)
      .where({ request_ID: poRequest.ID }));
    if (!poDetails?.sesRequired || !poDetails.sesDraft) {
      return;
    }
    const existing = await tx.run(SELECT.one.from(this.db.CARequests)
      .columns("ID")
      .where({ predecessor_ID: poRequest.ID, requestType_code: "SERVICE_ENTRY_SHEET" }));
    if (existing) {
      return;
    }

    const draft = this._parseDetails(req, poDetails.sesDraft);
    const poNumber = poDetails.purchaseOrderNumber || null;
    const details = {
      ...draft,
      sourceMode: "PO_SUCCESSOR",
      purchaseOrderNo: poNumber,
      items: (draft.items || []).map((item) => ({ ...item, poNumber: item.poNumber || poNumber }))
    };

    const [requestType, requestVariant, requester, processorTeam] = await Promise.all([
      tx.run(SELECT.one.from(this.db.RequestTypes).where({ code: "SERVICE_ENTRY_SHEET" })),
      tx.run(SELECT.one.from(this.db.RequestVariants).where({ code: "SES_NEW" })),
      this.master.run(SELECT.one.from(this.masterEntities.Users).where({ ID: poRequest.requester_ID })),
      poRequest.ownerTeam_ID
        ? this.master.run(SELECT.one.from(this.masterEntities.Teams).where({ ID: poRequest.ownerTeam_ID }))
        : null
    ]);
    const sesId = await this._insertOneRequest(req, tx, requester || user, {
      requestType,
      requestVariant,
      processorTeam,
      input: {
        title: `SES for ${poRequest.referenceNumber}`,
        description: `Created automatically from ${poRequest.referenceNumber}`,
        priorityCode: poRequest.priority_code,
        predecessorId: poRequest.ID,
        details
      }
    });

    const sesAttachments = (await tx.run(SELECT.from(this.db.CAAttachments)
      .columns("ID", "category")
      .where({ request_ID: poRequest.ID })))
      .filter((attachment) => String(attachment.category || "").startsWith("SES_"));
    for (const attachment of sesAttachments) {
      await tx.run(UPDATE(this.db.CAAttachments)
        .set({ request_ID: sesId, category: attachment.category.slice(4) })
        .where({ ID: attachment.ID }));
    }

    const ses = await tx.run(SELECT.one.from(this.db.CARequests).columns("referenceNumber").where({ ID: sesId }));
    await this._writeHistory(tx, poRequest.ID, poRequest.currentStep, "SES_SUCCESSOR_CREATED", user,
      null, null, `SES successor ${ses?.referenceNumber || sesId} created`);
  }

  _isStepApplicable(config, details) {
    if (!config.conditionField) {
      return true;
    }
    const value = details ? details[config.conditionField] : undefined;
    return this._normalizeFlag(value) === this._normalizeFlag(config.conditionValue);
  }

  _normalizeFlag(value) {
    const text = String(value === undefined || value === null ? "" : value).trim().toLowerCase();
    if (text === "1" || text === "true" || text === "yes") {
      return "true";
    }
    if (text === "" || text === "0" || text === "false" || text === "no") {
      return "false";
    }
    return text;
  }

  async _loadDetails(tx, requestTypeCode, requestId) {
    const entityName = DETAIL_ENTITY_BY_REQUEST_TYPE[requestTypeCode];
    if (!entityName) {
      return null;
    }
    return tx.run(SELECT.one.from(this.db[entityName]).where({ request_ID: requestId }));
  }

  _selectWorkflowConfigs(configs, requestVariantCode) {
    const exact = configs.filter((config) => config.requestVariant_code === requestVariantCode);
    if (exact.length) {
      return exact;
    }
    return configs.filter((config) => !config.requestVariant_code);
  }

  // notice: extra e-mail content for the (re)opened task, e.g. a send-back's remarks.
  async _createConfiguredTaskIfMissing(tx, requestId, step, notice = {}) {
    const existing = await SELECT.from(this.db.CATasks).where({
      request_ID: requestId,
      stepNo: step.stepNo
    });
    if (existing.some((task) => task.status_code === TASK_STATUS.OPEN)) {
      return;
    }
    const config = step.config_ID
      ? await SELECT.one.from(this.db.WorkflowStepConfigs).where({ ID: step.config_ID })
      : null;
    // Resolved before the re-open branch too: the requester may have named a different
    // approver while the step was rolled back, so a reopened task must not keep the old one.
    const approver = await this._resolveStepAssignment(tx, requestId, config);
    // The step's planned deadline (re-planned on a send-back). Requests planned before step SLAs
    // existed have none and keep the old "SLA days from today" due date.
    const planned = await tx.run(SELECT.one.from(this.db.RequestStepInstances)
      .columns("slaDueAt", "dueDate").where({ ID: step.ID }));
    const sla = planned?.slaDueAt
      ? { dueDate: planned.dueDate, slaDueAt: planned.slaDueAt, slaStartedAt: new Date().toISOString() }
      : null;

    if (existing.length) {
      await tx.run(UPDATE(this.db.CATasks).set({
        status_code: TASK_STATUS.OPEN,
        decision: null,
        completedAt: null,
        ...(sla ? { ...sla, slaBreached: false, slaBreachedAt: null } : {}),
        ...approver
      }).where({ ID: { in: existing.map((task) => task.ID) } }));
      // A step reached again after a send-back is e-mailed only to the person who handled it
      // (stamped on approve / send-back). Step 1 without a recorded handler goes to the requester.
      const request = step.stepNo === 1
        ? await tx.run(SELECT.one.from(this.db.CARequests)
          .columns("requester_ID", "requesterName", "requesterEmail").where({ ID: requestId }))
        : null;
      for (const task of existing) {
        const reopened = { ...task, ...approver };
        if (request && !reopened.assignedUser_ID) {
          Object.assign(reopened, {
            assignedUser_ID: request.requester_ID,
            assignedName: request.requesterName,
            assignedEmail: request.requesterEmail
          });
        }
        await this._notifyTaskAssignment(tx, reopened, notice);
      }
      return;
    }

    const teamId = config?.processorTeam_ID || step.processorTeam_ID;
    const team = teamId
      ? await this.master.run(SELECT.one.from(this.masterEntities.Teams).where({ ID: teamId }))
      : null;
    const task = {
      ID: cds.utils.uuid(),
      referenceNumber: this._taskReferenceNumber(requestId),
      request_ID: requestId,
      stepInstance_ID: step.ID,
      stepNo: step.stepNo,
      taskName: config?.taskName || step.stepName,
      description: config?.activityDescription || step.activityDescription,
      assignedTeam_ID: teamId,
      assignedTeamName: team?.name || step.processorTeamName || null,
      ...approver,
      status_code: TASK_STATUS.OPEN,
      isMandatory: config?.isMandatory ?? true,
      isApproval: config?.isApproval ?? false,
      ...(sla || { dueDate: this._addDays(config?.slaDays || 2) })
    };
    await tx.run(INSERT.into(this.db.CATasks).entries(task));
    // Step 1 is the requester's own step: they just submitted, so nobody is notified.
    if (step.stepNo > 1) {
      await this._notifyTaskAssignment(tx, task, notice);
    }
  }

  // A team task records who handled it (approved or sent it back), like a claim, so a re-opened
  // task returns to that person. Claimed and approver tasks keep their user.
  _handlerStamp(task, user) {
    return task.assignedUser_ID
      ? {}
      : { assignedUser_ID: user.ID, assignedName: user.displayName, assignedEmail: user.email };
  }

  // E-mails whoever a task is assigned to, through the SAP Build Process Automation process
  // "Task Assignment Notification Process_CA" (destination bpa_workflow_technical): every active
  // member of the processor team, or the one assigned user (Selected Approval, LoA, SCM). The
  // payload is built inside the transaction; the call runs only after it commits, so a rejected
  // approval never e-mails anyone. A BPA failure is logged and never blocks the workflow.
  // notice.notificationType is "ASSIGNED" (default) or "SENT_BACK"; a send-back adds the
  // remarks and who sent it back, which the BPA template shows.
  async _notifyTaskAssignment(tx, task, notice = {}) {
    const log = cds.log("task-notification");
    const recipients = await this._taskRecipients(task);
    if (!recipients.length) {
      log.warn(`No e-mail sent for task ${task.ID}: no recipient e-mail address`);
      return;
    }

    const request = await tx.run(SELECT.one.from(this.db.CARequests)
      .columns("ID", "referenceNumber", "title", "requestType_code", "requesterName")
      .where({ ID: task.request_ID }));
    const appUrl = this._taskAppUrl();
    if (!appUrl) {
      log.warn(`Task ${task.ID} is e-mailed without a link: set FLOWMATE_CA_APP_URL`);
    }
    const data = {
      definitionId: process.env.BPA_TASK_NOTIFICATION_DEFINITION_ID ||
        "ap11.arize-qas-9339ozek.taskassignmentnotificationprocessca.taskAssignmentNotificationProcess",
      context: {
        taskId: task.ID,
        taskTitle: task.taskName || "Workflow task",
        assigneeEmail: recipients,
        assigneeName: (task.assignedUser_ID && task.assignedName) || task.assignedTeamName || "",
        taskUrl: appUrl ? `${appUrl}#/tasks/${encodeURIComponent(task.ID)}` : "",
        assignedDate: new Date().toISOString(),
        requesterName: request?.requesterName || "",
        requestId: request?.referenceNumber || task.request_ID,
        processorTeam: task.assignedTeamName || "",
        requestTitle: request?.title || "",
        requestType: request?.requestType_code || "",
        notificationType: notice.notificationType || "ASSIGNED",
        remarks: notice.remarks || "",
        sentBackBy: notice.sentBackBy || ""
      }
    };

    await this._startBpaProcess(data, `Task ${task.ID} notification for ${recipients.length} recipient(s)`);
  }

  // E-mails the requester about their request through the BPA process
  // "requestStatusNotificationProcess": "Completed" (last step completed), "Rejected" or
  // "Sendback" (REQUEST_OUTCOME), with the approver's remarks.
  async _notifyRequestOutcome(tx, requestId, status, remarks = "") {
    const request = await tx.run(SELECT.one.from(this.db.CARequests)
      .columns("referenceNumber", "title", "requestType_code", "requesterEmail", "requesterName")
      .where({ ID: requestId }));
    if (!request?.requesterEmail) {
      cds.log("task-notification").warn(`No ${status} e-mail for request ${requestId}: no requester e-mail address`);
      return;
    }
    const requestType = await tx.run(SELECT.one.from(this.db.RequestTypes)
      .columns("name").where({ code: request.requestType_code }));
    const recipients = [request.requesterEmail];
    // A completed outline contract also goes to the "User to be notified" named on the form.
    if (status === REQUEST_OUTCOME.COMPLETED && request.requestType_code === "OUTLINE_CONTRACT") {
      const contract = await tx.run(SELECT.one.from(this.db.OutlineContractDetails)
        .columns("notifyUserEmail").where({ request_ID: requestId }));
      const notifyEmail = String(contract?.notifyUserEmail || "").trim();
      if (notifyEmail && notifyEmail.toLowerCase() !== String(request.requesterEmail).trim().toLowerCase()) {
        recipients.push(notifyEmail);
      }
    }
    for (const recipient of recipients) {
      await this._startBpaProcess({
        definitionId: process.env.BPA_REQUEST_STATUS_DEFINITION_ID ||
          "ap11.arize-qas-9339ozek.requeststatusnotificationprocessca.requestStatusNotificationProcess",
        context: {
          requestermail: recipient,
          requesttitle: request.title || "",
          requesttype: requestType?.name || request.requestType_code || "",
          requestid: request.referenceNumber || requestId,
          status,
          remarks: remarks || "",
          requestername: request.requesterName || ""
        }
      }, `Request ${request.referenceNumber} ${status} e-mail to ${recipient}`);
    }
  }

  // Starts a BPA process instance (destination bpa_workflow_technical). It runs only after the
  // current transaction commits, so a rolled-back action never e-mails anyone; a failure is
  // logged and never blocks the workflow. awaitResult sends at once and rethrows a failure,
  // for callers that record whether the e-mail went out (the SLA breach scan).
  async _startBpaProcess(data, description, { awaitResult = false } = {}) {
    const log = cds.log("task-notification");
    const post = () => executeHttpRequest(
      { destinationName: process.env.BPA_WORKFLOW_DESTINATION || "bpa_workflow_technical" },
      {
        method: "post",
        url: "/workflow/rest/v1/workflow-instances",
        data,
        headers: { "content-type": "application/json" }
      },
      { fetchCsrfToken: false }
    );
    if (awaitResult) {
      await post();
      log.info(`${description} started`);
      return;
    }
    const send = async () => {
      try {
        await post();
        log.info(`${description} started`);
      } catch (error) {
        log.error(`Could not start ${description}: ${error.message}`);
      }
    };
    if (typeof cds.context?.on === "function") {
      cds.context.on("succeeded", send);
    } else {
      await send();
    }
  }

  // ---- SLA ----
  // Every step of a request shares one schedule fixed at submission: a step is due its own SLA
  // days after the step before it is due. A step finished late therefore leaves less time for the
  // steps after it, and the request is due when its last step is.

  _slaPreview = async (req) => {
    let details = {};
    try {
      details = JSON.parse(req.data.details || "{}") || {};
    } catch (error) {
      details = {};
    }
    const configs = await SELECT.from(this.db.WorkflowStepConfigs)
      .where({ requestType_code: req.data.requestTypeCode, isActive: true })
      .orderBy("stepNo");
    const selected = this._selectWorkflowConfigs(configs, req.data.requestVariantCode)
      .filter((config) => this._isStepApplicable(config, details));
    if (!selected.length) {
      return { dueDate: null, slaDueAt: null, totalDays: 0, stepCount: 0 };
    }
    const totalDays = selected.slice(1).reduce((sum, config) => sum + Number(config.slaDays || 0), 0);
    return { ...this._slaDeadline(new Date(), totalDays), totalDays, stepCount: selected.length };
  };

  // Calendar days: the deadline is slaDays x 24h after
  // the start, and its date is the Sri Lankan calendar date of that moment.
  _slaDeadline(startAt, slaDays) {
    const dueAt = new Date(new Date(startAt).getTime() + Number(slaDays || 0) * DAY_MS);
    return { slaDueAt: dueAt.toISOString(), dueDate: this._slaLocalDate(dueAt) };
  }

  _slaLocalDate(date) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: SLA_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit"
    }).format(date);
  }

  _planSlaSchedule(slaDaysPerStep, startAt) {
    let cursor = startAt;
    return slaDaysPerStep.map((slaDays) => {
      const deadline = this._slaDeadline(cursor, slaDays);
      cursor = deadline.slaDueAt;
      return deadline;
    });
  }

  // A send-back is rework: the target step gets its full SLA again from now and the steps after
  // it follow on, so the person the request returns to is not breached the moment it arrives.
  async _replanSlaFrom(tx, requestId, fromStepNo) {
    const steps = (await tx.run(SELECT.from(this.db.RequestStepInstances)
      .columns("ID", "stepNo", "slaDays", "slaDueAt")
      .where({ request_ID: requestId })
      .orderBy("stepNo")))
      .filter((step) => step.stepNo >= fromStepNo);
    if (!steps.length || !steps.every((step) => step.slaDueAt)) {
      return;
    }
    const schedule = this._planSlaSchedule(steps.map((step) => step.slaDays), new Date().toISOString());
    for (let index = 0; index < steps.length; index++) {
      await tx.run(UPDATE(this.db.RequestStepInstances).set(schedule[index]).where({ ID: steps[index].ID }));
    }
    await tx.run(UPDATE(this.db.CARequests).set(schedule[schedule.length - 1]).where({ ID: requestId }));
  }

  // Closing a task after its deadline marks it breached for good, so it shows as approved with
  // a breach rather than as on time.
  _lateDecision(task, decidedAt) {
    if (task.slaBreached || !task.slaDueAt || Date.parse(decidedAt) <= Date.parse(task.slaDueAt)) {
      return {};
    }
    return { slaBreached: true, slaBreachedAt: decidedAt };
  }

  _overdueText(slaDueAt, at = new Date()) {
    const late = Math.max(0, new Date(at).getTime() - Date.parse(slaDueAt));
    if (late >= DAY_MS) {
      return `${Math.floor(late / DAY_MS)} day(s)`;
    }
    return `${Math.max(1, Math.ceil(late / HOUR_MS))} hour(s)`;
  }

  // Run by SAP Job Scheduling (scope SlaScheduler) or an administrator. Every open task past its
  // deadline is marked breached and its assignee - or, for an unclaimed team task, every active
  // member - is e-mailed once through "SLA Breach Notification Process_CA". Each e-mail is
  // claimed in SlaNotificationStates first, so overlapping or repeated scans never send it twice
  // and a failed send is retried on later scans up to SLA_MAX_RETRIES times.
  _runSlaBreachScan = async (req) => {
    const tx = cds.tx(req);
    const now = new Date().toISOString();
    const tasks = await tx.run(SELECT.from(this.db.CATasks).where({
      status_code: TASK_STATUS.OPEN,
      slaDueAt: { "<": now }
    }));
    const result = { overdueTasks: tasks.length, notificationsSent: 0, notificationsFailed: 0, notificationsSkipped: 0 };
    const monitor = { displayName: "SLA Monitor", email: null };

    for (const task of tasks) {
      if (!task.slaBreached) {
        await tx.run(UPDATE(this.db.CATasks).set({ slaBreached: true, slaBreachedAt: now }).where({ ID: task.ID }));
        await this._writeHistory(tx, task.request_ID, task.stepNo, "SLA_BREACHED", monitor, null, null,
          `${task.taskName} is ${this._overdueText(task.slaDueAt)} past its SLA due date`);
      }
      const recipients = await this._taskRecipients(task);
      if (!recipients.length) {
        result.notificationsSkipped += 1;
        cds.log("sla-scheduler").warn(`No recipient for the SLA breach of task ${task.ID}`);
        continue;
      }
      for (const email of recipients) {
        const key = ["SLA_BREACH", "TASK", task.ID, task.slaDueAt, email].join(":").toLowerCase();
        if (!await this._claimSlaNotification(tx, key, task, email)) {
          result.notificationsSkipped += 1;
          continue;
        }
        try {
          await this._notifySlaBreach(tx, task, email);
          await this._completeSlaNotification(tx, key, "SENT");
          result.notificationsSent += 1;
        } catch (error) {
          await this._completeSlaNotification(tx, key, "FAILED", error.message);
          result.notificationsFailed += 1;
        }
      }
    }
    cds.log("sla-scheduler").info("SLA breach scan completed", result);
    return result;
  };

  async _claimSlaNotification(tx, key, task, recipient) {
    const existing = await tx.run(SELECT.one.from(this.db.SlaNotificationStates).where({ notificationKey: key }));
    const maxAttempts = Math.max(1, Number(process.env.SLA_MAX_RETRIES || 5));
    const attempts = Number(existing?.attempts || 0);
    const inFlight = existing?.status === "PROCESSING"
      && Date.parse(existing.lastAttemptAt || 0) > Date.now() - 15 * 60 * 1000;
    if (existing?.status === "SENT" || attempts >= maxAttempts || inFlight) {
      return false;
    }
    const now = new Date().toISOString();
    if (existing) {
      await tx.run(UPDATE(this.db.SlaNotificationStates).set({
        status: "PROCESSING", attempts: attempts + 1, lastAttemptAt: now, lastError: null
      }).where({ notificationKey: key }));
      return true;
    }
    try {
      await tx.run(INSERT.into(this.db.SlaNotificationStates).entries({
        notificationKey: key,
        request_ID: task.request_ID,
        task_ID: task.ID,
        recipient,
        dueDate: task.dueDate,
        status: "PROCESSING",
        attempts: 1,
        lastAttemptAt: now
      }));
      return true;
    } catch (error) {
      if (/unique|duplicate|constraint/i.test(error.message || "")) {
        return false;
      }
      throw error;
    }
  }

  async _completeSlaNotification(tx, key, status, errorMessage = null) {
    await tx.run(UPDATE(this.db.SlaNotificationStates).set({
      status,
      notifiedAt: status === "SENT" ? new Date().toISOString() : null,
      lastError: errorMessage
    }).where({ notificationKey: key }));
  }

  async _notifySlaBreach(tx, task, email) {
    const request = await tx.run(SELECT.one.from(this.db.CARequests)
      .columns("title", "requestType_code").where({ ID: task.request_ID }));
    const requestType = await tx.run(SELECT.one.from(this.db.RequestTypes)
      .columns("name").where({ code: request?.requestType_code }));
    const appUrl = this._taskAppUrl();
    const data = {
      definitionId: process.env.BPA_SLA_BREACH_DEFINITION_ID ||
        "ap11.arize-qas-9339ozek.slabreachnotificationprocessca.sLABreachNotificationProcess",
      context: {
        taskId: task.ID,
        taskTitle: task.taskName || "Workflow task",
        assigneeEmail: [email],
        assigneeName: (task.assignedUser_ID && task.assignedName) || task.assignedTeamName || "",
        taskUrl: appUrl ? `${appUrl}#/tasks/${encodeURIComponent(task.ID)}` : "",
        slaDueDate: new Intl.DateTimeFormat("en-GB", {
          timeZone: SLA_TIME_ZONE, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
        }).format(new Date(task.slaDueAt)),
        breachDuration: this._overdueText(task.slaDueAt),
        requestTitle: request?.title || "",
        requestType: requestType?.name || request?.requestType_code || ""
      }
    };
    await this._startBpaProcess(data, `SLA breach e-mail for task ${task.ID} to ${email}`, { awaitResult: true });
  }

  // The assigned user, or every active member of the processor team. A membership without a
  // copied e-mail falls back to the user's own e-mail.
  async _taskRecipients(task) {
    if (task.assignedUser_ID) {
      const user = await this.master.run(SELECT.one.from(this.masterEntities.Users)
        .columns("ID", "email").where({ ID: task.assignedUser_ID }));
      return this._delegatedNotificationEmails([{ ID: task.assignedUser_ID, email: user?.email || task.assignedEmail }]);
    }
    if (!task.assignedTeam_ID) {
      return [];
    }
    const members = await this.master.run(SELECT.from(this.masterEntities.TeamMembers)
      .columns("email", "user_ID")
      .where({ team_ID: task.assignedTeam_ID, isActive: true }));
    const missing = members.filter((member) => !member.email && member.user_ID).map((member) => member.user_ID);
    const users = missing.length
      ? await this.master.run(SELECT.from(this.masterEntities.Users).columns("ID", "email")
        .where({ ID: { in: missing }, isActive: true }))
      : [];
    const usersById = new Map(users.map((user) => [user.ID, user]));
    return this._delegatedNotificationEmails(members.map((member) => ({
      ID: member.user_ID,
      email: member.email || usersById.get(member.user_ID)?.email
    })));
  }

  async _delegatedNotificationEmails(recipients) {
    const normalized = recipients.filter((recipient) => recipient?.ID || recipient?.email);
    const userIds = [...new Set(normalized.map((recipient) => recipient.ID).filter(Boolean))];
    if (!userIds.length) {
      return [...new Set(normalized.map((recipient) => recipient.email).filter(Boolean))];
    }

    const today = new Date().toISOString().slice(0, 10);
    const delegations = await this.master.run(
      SELECT.from(this.masterEntities.Delegations)
        .columns("delegator_ID", "delegate_ID")
        .where({
          delegator_ID: { in: userIds },
          enabled: true,
          forwardNotifications: true,
          startDate: { "<=": today },
          endDate: { ">=": today }
        })
    );
    const delegatedByUser = new Map(delegations.map((delegation) => [delegation.delegator_ID, delegation.delegate_ID]));
    const delegateIds = [...new Set([...delegatedByUser.values()].filter(Boolean))];
    const delegates = delegateIds.length
      ? await this.master.run(
        SELECT.from(this.masterEntities.Users)
          .columns("ID", "email")
          .where({ ID: { in: delegateIds }, isActive: true })
      )
      : [];
    const delegateEmailById = new Map(delegates.map((user) => [user.ID, user.email]));

    return [...new Set(normalized.map((recipient) => {
      const delegateId = delegatedByUser.get(recipient.ID);
      return delegateEmailById.get(delegateId) || recipient.email;
    }).filter(Boolean))];
  }

  // The CA app's URL for the e-mail link: FLOWMATE_CA_APP_URL when set (local runs), otherwise
  // the approuter host the current request came through (it serves index.html at its root).
  _taskAppUrl() {
    const configured = String(process.env.FLOWMATE_CA_APP_URL || "").split("#")[0];
    if (configured) {
      return configured;
    }
    const headers = cds.context?.http?.req?.headers || {};
    const host = headers["x-forwarded-host"];
    if (!host) {
      return "";
    }
    const protocol = String(headers["x-forwarded-proto"] || "https").split(",")[0].trim();
    return `${protocol}://${String(host).split(",")[0].trim()}/index.html`;
  }

  // An APPROVER or SCM step goes to the user named on the form; every other step stays in
  // its processor team's queue.
  async _resolveStepAssignment(tx, requestId, config) {
    if (!["APPROVER", "SCM"].includes(config?.roleCode)) {
      return {};
    }
    const request = await tx.run(SELECT.one.from(this.db.CARequests).columns("requestType_code").where({ ID: requestId }));
    const details = await this._loadDetails(tx, request?.requestType_code, requestId);
    // New Contract keeps the SCM SPOC on its line items, which _loadDetails does not read.
    const itemsEntityName = ITEMS_ENTITY_BY_REQUEST_TYPE[request?.requestType_code];
    if (details && itemsEntityName) {
      details.items = await tx.run(SELECT.from(this.db[itemsEntityName])
        .where({ details_ID: details.ID })
        .orderBy("itemNo"));
    }
    return this._approverAssignment(config, details);
  }

  // excludeRequestId lets a requester re-submit their own request without the
  // description colliding with the copy already stored against it.
  async _assertNoDuplicateMaterialDescription(req, requestTypeCode, details, excludeRequestId) {
    if (requestTypeCode !== "MATERIAL_CODE") {
      return;
    }
    const description = String(details?.description || "").trim();
    if (!description) {
      return;
    }
    const existing = await SELECT.one.from(this.db.MaterialCodeDetails)
      .columns("request_ID")
      .where({ description });
    if (!existing || (excludeRequestId && existing.request_ID === excludeRequestId)) {
      return;
    }
    const owner = await SELECT.one.from(this.db.CARequests)
      .columns("referenceNumber")
      .where({ ID: existing.request_ID });
    return req.reject(400, `Material description "${description}" already exists on request ${owner?.referenceNumber || "another request"}`);
  }

  // Rewrites an existing detail row and replaces its line items, so itemNo stays
  // contiguous no matter how the requester added or removed rows.
  async _updateDetails(tx, requestTypeCode, requestId, details) {
    const entityName = DETAIL_ENTITY_BY_REQUEST_TYPE[requestTypeCode];
    if (!entityName) {
      return;
    }
    const { items, headers, ...headerFields } = details;
    const existing = await tx.run(SELECT.one.from(this.db[entityName]).where({ request_ID: requestId }));
    if (!existing) {
      return this._insertDetails(tx, requestTypeCode, requestId, details);
    }
    await tx.run(UPDATE(this.db[entityName]).set(headerFields).where({ ID: existing.ID }));

    await this._replaceDetailRows(tx, ITEMS_ENTITY_BY_REQUEST_TYPE[requestTypeCode], existing.ID, items);
    await this._replaceDetailRows(tx, HEADERS_ENTITY_BY_REQUEST_TYPE[requestTypeCode], existing.ID, headers);
  }

  // Replaces a detail row's child collection, renumbering itemNo so it stays contiguous no
  // matter how the requester added or removed rows.
  async _replaceDetailRows(tx, entityName, detailsId, rows) {
    if (!entityName || !Array.isArray(rows)) {
      return;
    }
    await tx.run(DELETE.from(this.db[entityName]).where({ details_ID: detailsId }));
    if (rows.length) {
      await tx.run(INSERT.into(this.db[entityName]).entries(rows.map((row, index) => ({
        ID: cds.utils.uuid(),
        details_ID: detailsId,
        ...row,
        itemNo: index + 1
      }))));
    }
  }

  async _insertDetails(tx, requestTypeCode, requestId, details) {
    const entityName = DETAIL_ENTITY_BY_REQUEST_TYPE[requestTypeCode];
    if (!entityName) {
      return;
    }
    const { items, headers, priceChanges, serviceAdditions, materialAdditions, ...headerFields } = details;
    const changeRows = { priceChanges, serviceAdditions, materialAdditions };
    const detailsId = cds.utils.uuid();
    await tx.run(INSERT.into(this.db[entityName]).entries({
      ID: detailsId,
      request_ID: requestId,
      ...headerFields
    }));

    const itemsEntityName = ITEMS_ENTITY_BY_REQUEST_TYPE[requestTypeCode];
    if (itemsEntityName && Array.isArray(items) && items.length) {
      await tx.run(INSERT.into(this.db[itemsEntityName]).entries(items.map((item, index) => ({
        ID: cds.utils.uuid(),
        details_ID: detailsId,
        itemNo: index + 1,
        ...item
      }))));
    }

    const headersEntityName = HEADERS_ENTITY_BY_REQUEST_TYPE[requestTypeCode];
    if (headersEntityName && Array.isArray(headers) && headers.length) {
      await tx.run(INSERT.into(this.db[headersEntityName]).entries(headers.map((header, index) => ({
        ID: cds.utils.uuid(),
        details_ID: detailsId,
        itemNo: index + 1,
        ...header
      }))));
    }

    if (requestTypeCode === "OUTLINE_CONTRACT") {
      const changeItems = Object.entries(CHANGE_ITEM_TYPES).flatMap(([key, changeType]) =>
        (Array.isArray(changeRows[key]) ? changeRows[key] : []).map((row, index) => ({
          ID: cds.utils.uuid(),
          details_ID: detailsId,
          changeType,
          itemNo: index + 1,
          code: row.code,
          price: row.price ?? null,
          quantity: row.quantity ?? null
        })));
      if (changeItems.length) {
        await tx.run(INSERT.into(this.db.OutlineContractChangeItems).entries(changeItems));
      }
    }
  }

  async _getPORequester(req, userId) {
    const user = await this.master.run(SELECT.one.from(this.masterEntities.Users)
      .where({ ID: userId, isActive: true }));
    if (!user) {
      return req.reject(400, "Selected requester was not found or is inactive in shared Flowmate master data");
    }
    return user;
  }

  async _ensureCurrentUser(req) {
    if (req.user.is("system-user")) {
      return req.reject(403, "This operation requires a provisioned business user");
    }
    const loginId = String(req.user.id || "").trim();
    const emailFromToken = String(
      req.user.attr?.email || req.user.attr?.mail || loginId
    ).trim();
    const normalizedLoginId = loginId.toLowerCase();
    const normalizedEmail = emailFromToken.toLowerCase();
    const activeUsers = await this.master.run(
      SELECT.from(this.masterEntities.Users).where({ isActive: true })
    );
    const user = activeUsers.find((candidate) => {
      const candidateEmail = String(candidate.email || "").trim().toLowerCase();
      const candidatePrincipal = String(
        candidate.userPrincipalName || ""
      ).trim().toLowerCase();

      return candidateEmail === normalizedEmail
        || candidatePrincipal === normalizedLoginId;
    });

    if (user) {
      return user;
    }
    return req.reject(403, "Your user is not provisioned in the shared Flowmate master data service");
  }

  async _assertTaskAccess(req, task, user) {
    if (req.user.is("CAAdmin") || req.user.is("CASupervisor")) {
      return;
    }
    if (task.assignedUser_ID) {
      const effectiveUserIds = await this._effectiveTaskUserIds(req, user.ID);
      if (effectiveUserIds.includes(task.assignedUser_ID)) {
        return;
      }
      return req.reject(403, "This task is assigned to another user and is not covered by an active delegation");
    }
    if (task.assignedTeam_ID) {
      const membership = await this.master.run(SELECT.one.from(this.masterEntities.TeamMembers).where({
        team_ID: task.assignedTeam_ID,
        user_ID: user.ID,
        isActive: true
      }));
      if (membership) {
        return;
      }
    }
    req.reject(403, "This task is not assigned to you or your team");
  }

  _assertMutableRequest(req, request) {
    if ([REQUEST_STATUS.COMPLETED, REQUEST_STATUS.REJECTED].includes(request.status_code)) {
      req.reject(409, "Completed or rejected requests cannot be changed");
    }
  }

  async _writeHistory(tx, requestId, stepNo, action, user, oldStatus, newStatus, remarks) {
    await tx.run(INSERT.into(this.db.CAHistory).entries({
      ID: cds.utils.uuid(),
      request_ID: requestId,
      stepNo,
      action,
      actorName: user.displayName,
      actorEmail: user.email,
      oldStatus,
      newStatus,
      remarks
    }));
  }

  async _teamIdsOf(user) {
    const memberships = await this.master.run(SELECT.from(this.masterEntities.TeamMembers)
      .columns("team_ID")
      .where({ user_ID: user.ID, isActive: true }));
    return memberships.map((membership) => membership.team_ID);
  }

  async _count(entity, where) {
    const query = SELECT.one.from(entity).columns("count(1) as count");
    const result = await (Object.keys(where || {}).length ? query.where(where) : query);
    return Number(result?.count || 0);
  }

  _parseDetails(req, value) {
    if (!value) {
      return {};
    }
    try {
      return typeof value === "string" ? JSON.parse(value) : value;
    } catch (_error) {
      req.reject(400, "Request details contain invalid JSON");
    }
  }

  _referenceNumber(typeCode) {
    const date = new Date();
    const datePart = [
      String(date.getUTCFullYear()).slice(-2),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0")
    ].join("");
    const suffix = String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
    return `CA-${typeCode.slice(0, 4)}-${datePart}-${suffix}`;
  }

  _taskReferenceNumber(requestReference) {
    const suffix = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    return `TASK-${String(requestReference).slice(-12)}-${suffix}`;
  }

  _addDays(days) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + Number(days || 0));
    return date.toISOString().slice(0, 10);
  }
};

module.exports.REQUEST_OUTCOME = REQUEST_OUTCOME;
