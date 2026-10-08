const cds = require("@sap/cds");
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
  OUTLINE_CONTRACT: "OutlineContractHeaders"
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

    this.before("READ", "MyRequests", this._filterMyRequests);
    this.before("READ", "MyTasks", this._filterMyTasks);
    this.before("READ", "MyTeamTasks", this._filterMyTeamTasks);

    this.on("getCurrentUser", this._getCurrentUser);
    this.on("getFlowmateRequestFormCatalog", this._getFlowmateRequestFormCatalog);
    this.on("getDashboardCounts", this._getDashboardCounts);
    this.on("getFlowmateConnectionStatus", this._getFlowmateConnectionStatus);
    this.on("createRequest", this._createRequest);
    this.on("createFlowmatePaymentRun", this._createFlowmatePaymentRun);
    this.on("createBulkRequests", this._createBulkRequests);
    this.on("submitRequest", this._submitRequest);
    this.on("addTask", this._addTask);
    this.on("claimTeamTask", this._claimTeamTask);
    this.on("approveTask", this._approveTask);
    this.on("rejectTask", this._rejectTask);
    this.on("sendBackTask", this._sendBackTask);
    this.on("completeStep", this._completeStep);
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

  _filterMyRequests = async (req) => {
    const user = await this._ensureCurrentUser(req);
    req.query.where({ requester_ID: user.ID });
  };

  _filterMyTasks = async (req) => {
    const user = await this._ensureCurrentUser(req);
    req.query.where({ assignedUser_ID: user.ID });
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
    return {
      ID: user.ID,
      displayName: user.displayName,
      email: user.email,
      isAdmin: req.user.is("CAAdmin")
    };
  };

  _getDashboardCounts = async (req) => {
    const user = await this._ensureCurrentUser(req);
    const isAdmin = req.user.is("CAAdmin");
    const requestedBy = { requester_ID: user.ID };
    const assignedToMe = { assignedUser_ID: user.ID };
    const openStatus = { status_code: { in: [TASK_STATUS.OPEN, TASK_STATUS.SENT_BACK] } };
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
    if (integration) assertTechnicalDetails(req, details);
    await this._assertNoDuplicateMaterialDescription(req, requestType.code, details);

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
    await this._initializeWorkflow(tx, requestId, requestType.code, requestVariant?.code, user, details);
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
      } catch (error) {
        return req.reject(400, `Row ${index + 1}: ${error.message}`);
      }
    }

    return {
      created: referenceNumbers.length,
      referenceNumbers: JSON.stringify(referenceNumbers)
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
      user
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

    await tx.run(UPDATE(this.db.CATasks).set({
      assignedUser_ID: user.ID,
      assignedName: user.displayName,
      assignedEmail: user.email
    }).where({ ID: task.ID, assignedUser_ID: null }));
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

    await tx.run(UPDATE(this.db.CATasks).set({
      status_code: TASK_STATUS.APPROVED,
      decision: "APPROVED",
      remarks: req.data.remarks,
      completedAt: new Date().toISOString()
    }).where({ ID: task.ID }));
    await this._writeHistory(tx, task.request_ID, task.stepNo, "TASK_APPROVED", user, task.status_code, TASK_STATUS.APPROVED, req.data.remarks);
    return true;
  };

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
      completedAt: rejectedAt
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
      completedAt: null
    }).where({ ID: task.ID }));
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
    await tx.run(UPDATE(this.db.CARequests).set({
      currentStep: targetStep.stepNo,
      status_code: REQUEST_STATUS.SENT_BACK,
      completedAt: null
    }).where({ ID: task.request_ID }));
    await this._createConfiguredTaskIfMissing(tx, task.request_ID, targetStep);
    await this._writeHistory(tx, task.request_ID, targetStep.stepNo, "TASK_SENT_BACK", user, task.status_code, TASK_STATUS.SENT_BACK, req.data.remarks);
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
    if (request.owner_ID !== user.ID && !req.user.is("CAAdmin") && !req.user.is("CASupervisor")) {
      return req.reject(403, "Only the request owner or supervisor can complete a step");
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

    await tx.run(UPDATE(this.db.RequestStepInstances).set({
      status: "COMPLETED",
      completedAt: new Date().toISOString()
    }).where({ ID: step.ID }));

    if (step.stepNo === lastStepNo) {
      await tx.run(UPDATE(this.db.CARequests).set({
        currentStep: step.stepNo,
        status_code: REQUEST_STATUS.COMPLETED,
        completedAt: new Date().toISOString()
      }).where({ ID: request.ID }));
      await this._writeHistory(tx, request.ID, step.stepNo, "REQUEST_COMPLETED", user, request.status_code, REQUEST_STATUS.COMPLETED, req.data.remarks);
      return true;
    }

    const nextStep = steps.find((entry) => entry.stepNo > step.stepNo && entry.status !== "COMPLETED");
    if (nextStep) {
      await tx.run(UPDATE(this.db.RequestStepInstances).set({
        status: "OPEN",
        startedAt: new Date().toISOString()
      }).where({ ID: nextStep.ID }));
      await tx.run(UPDATE(this.db.CARequests).set({
        currentStep: nextStep.stepNo,
        status_code: REQUEST_STATUS.IN_PROGRESS
      }).where({ ID: request.ID }));
      await this._createConfiguredTaskIfMissing(tx, request.ID, nextStep);
    }

    await this._writeHistory(tx, request.ID, step.stepNo, "STEP_COMPLETED", user, step.status, "COMPLETED", req.data.remarks);
    return true;
  };

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

  async _initializeWorkflow(tx, requestId, requestTypeCode, requestVariantCode, user, details) {
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
    const stepEntries = selectedConfigs.map((config, index) => ({
      ID: cds.utils.uuid(),
      request_ID: requestId,
      config_ID: config.ID,
      stepNo: index + 1,
      stepName: config.stepName,
      activityDescription: config.activityDescription,
      processorTeam_ID: config.processorTeam_ID,
      processorTeamName: teamsById.get(config.processorTeam_ID)?.name || null,
      status: index === 0 ? "COMPLETED" : (index === 1 ? "OPEN" : "PENDING"),
      startedAt: index <= 1 ? submittedAt : null,
      completedAt: index === 0 ? submittedAt : null
    }));
    await tx.run(INSERT.into(this.db.RequestStepInstances).entries(stepEntries));

    const requesterStep = stepEntries[0];
    const requesterConfig = selectedConfigs[0];
    await tx.run(INSERT.into(this.db.CATasks).entries({
      ID: cds.utils.uuid(),
      referenceNumber: this._taskReferenceNumber(requestId),
      request_ID: requestId,
      stepInstance_ID: requesterStep.ID,
      stepNo: requesterStep.stepNo,
      taskName: requesterConfig.taskName || requesterConfig.stepName,
      description: requesterConfig.activityDescription,
      assignedTeam_ID: requesterConfig.processorTeam_ID,
      assignedTeamName: teamsById.get(requesterConfig.processorTeam_ID)?.name || null,
      assignedUser_ID: user.ID,
      assignedName: user.displayName,
      assignedEmail: user.email,
      status_code: TASK_STATUS.APPROVED,
      decision: "APPROVED",
      isMandatory: requesterConfig.isMandatory,
      isApproval: requesterConfig.isApproval,
      completedAt: submittedAt,
      dueDate: this._addDays(requesterConfig.slaDays || 2)
    }));
    await this._writeHistory(tx, requestId, requesterStep.stepNo, "STEP_COMPLETED", user, "OPEN", "COMPLETED", null);

    const activeStep = stepEntries[1];
    if (!activeStep) {
      await tx.run(UPDATE(this.db.CARequests).set({
        currentStep: requesterStep.stepNo,
        status_code: REQUEST_STATUS.COMPLETED,
        submittedAt,
        completedAt: submittedAt
      }).where({ ID: requestId }));
      return;
    }

    const activeConfig = selectedConfigs[1];
    await tx.run(INSERT.into(this.db.CATasks).entries({
      ID: cds.utils.uuid(),
      referenceNumber: this._taskReferenceNumber(requestId),
      request_ID: requestId,
      stepInstance_ID: activeStep.ID,
      stepNo: activeStep.stepNo,
      taskName: activeConfig.taskName || activeConfig.stepName,
      description: activeConfig.activityDescription,
      assignedTeam_ID: activeConfig.processorTeam_ID,
      assignedTeamName: teamsById.get(activeConfig.processorTeam_ID)?.name || null,
      ...await this._approverAssignment(activeConfig, conditionSource),
      status_code: TASK_STATUS.OPEN,
      isMandatory: activeConfig.isMandatory,
      isApproval: activeConfig.isApproval,
      dueDate: this._addDays(activeConfig.slaDays || 2)
    }));
    await tx.run(UPDATE(this.db.CARequests).set({
      currentStep: activeStep.stepNo,
      status_code: REQUEST_STATUS.SUBMITTED,
      submittedAt
    }).where({ ID: requestId }));
  }

  // An APPROVER step goes straight to the user the requester picked on the form
  // (approver_ID, or loaApprover_ID for SES), so it lands in that user's Pending Approval.
  // Without a selection the task stays in the processor team's queue.
  // SCM steps of an outline contract go to the SCM user named on the form: SCM Assign User
  // (Contract Modification) or row 1's SCM SPOC (New Contract). Both store an email.
  async _approverAssignment(config, details) {
    let where = null;
    if (config?.roleCode === "APPROVER") {
      const approverId = details?.approver_ID || details?.loaApprover_ID;
      where = approverId ? { ID: approverId } : null;
    } else if (config?.roleCode === "SCM") {
      const email = details?.scmAssignUser || details?.items?.[0]?.scmSpocUserId;
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

  async _createConfiguredTaskIfMissing(tx, requestId, step) {
    const existing = await SELECT.from(this.db.CATasks).where({
      request_ID: requestId,
      stepNo: step.stepNo
    });
    if (existing.some((task) => task.status_code === TASK_STATUS.OPEN)) {
      return;
    }
    if (existing.length) {
      await tx.run(UPDATE(this.db.CATasks).set({
        status_code: TASK_STATUS.OPEN,
        decision: null,
        completedAt: null
      }).where({ ID: { in: existing.map((task) => task.ID) } }));
      return;
    }

    const config = step.config_ID
      ? await SELECT.one.from(this.db.WorkflowStepConfigs).where({ ID: step.config_ID })
      : null;
    const teamId = config?.processorTeam_ID || step.processorTeam_ID;
    const team = teamId
      ? await this.master.run(SELECT.one.from(this.masterEntities.Teams).where({ ID: teamId }))
      : null;
    let approver = {};
    if (["APPROVER", "SCM"].includes(config?.roleCode)) {
      const request = await tx.run(SELECT.one.from(this.db.CARequests)
        .columns("requestType_code")
        .where({ ID: requestId }));
      const details = await this._loadDetails(tx, request?.requestType_code, requestId);
      // New Contract keeps the SCM SPOC on its line items, which _loadDetails does not read.
      const itemsEntityName = ITEMS_ENTITY_BY_REQUEST_TYPE[request?.requestType_code];
      if (details && itemsEntityName) {
        details.items = await tx.run(SELECT.from(this.db[itemsEntityName])
          .where({ details_ID: details.ID })
          .orderBy("itemNo"));
      }
      approver = await this._approverAssignment(config, details);
    }
    await tx.run(INSERT.into(this.db.CATasks).entries({
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
      dueDate: this._addDays(config?.slaDays || 2)
    }));
  }
  async _assertNoDuplicateMaterialDescription(req, requestTypeCode, details) {
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
    if (!existing) {
      return;
    }
    const owner = await SELECT.one.from(this.db.CARequests)
      .columns("referenceNumber")
      .where({ ID: existing.request_ID });
    return req.reject(400, `Material description "${description}" already exists on request ${owner?.referenceNumber || "another request"}`);
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
    if (task.assignedUser_ID === user.ID) {
      return;
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
