const cds = require("@sap/cds");
const { SELECT, INSERT, UPDATE } = cds.ql;

const REQUEST_STATUS = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  IN_PROGRESS: "IN_PROGRESS",
  SENT_BACK: "SENT_BACK",
  COMPLETED: "COMPLETED"
};

const TASK_STATUS = {
  OPEN: "OPEN",
  APPROVED: "APPROVED",
  SENT_BACK: "SENT_BACK"
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

module.exports = class FlowmateCAService extends cds.ApplicationService {
  async init() {
    this.db = cds.entities("flowmate.ca.db");
    this.master = await cds.connect.to("CommonMasterDataService");
    this.masterEntities = this.master.entities;

    this.on("READ", ["Users", "Teams", "TeamMembers", "Vendors"], (req) => {
      return this.master.run(req.query);
    });

    this.before("READ", "MyRequests", this._filterMyRequests);
    this.before("READ", "MyTasks", this._filterMyTasks);
    this.before("READ", "MyTeamTasks", this._filterMyTeamTasks);

    this.on("getCurrentUser", this._getCurrentUser);
    this.on("getDashboardCounts", this._getDashboardCounts);
    this.on("createRequest", this._createRequest);
    this.on("submitRequest", this._submitRequest);
    this.on("addTask", this._addTask);
    this.on("claimTeamTask", this._claimTeamTask);
    this.on("approveTask", this._approveTask);
    this.on("sendBackTask", this._sendBackTask);
    this.on("completeStep", this._completeStep);
    this.on("addComment", this._addComment);
    this.on("createSuccessorRequest", this._createSuccessorRequest);
    this.on("sendToS4", this._sendToS4);

    return super.init();
  }

  _filterMyRequests = async (req) => {
    const user = await this._ensureCurrentUser(req);
    req.query.where({ requester_ID: user.ID });
  };

  _filterMyTasks = async (req) => {
    const user = await this._ensureCurrentUser(req);
    req.query.where({ assignedUser_ID: user.ID });
  };

  _filterMyTeamTasks = async (req) => {
    const user = await this._ensureCurrentUser(req);
    const memberships = await this.master.run(SELECT.from(this.masterEntities.TeamMembers)
      .columns("team_ID")
      .where({ user_ID: user.ID, isActive: true }));
    const teamIds = memberships.map((membership) => membership.team_ID);

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
    const memberships = await this.master.run(SELECT.from(this.masterEntities.TeamMembers)
      .columns("team_ID")
      .where({ user_ID: user.ID, isActive: true }));
    const teamIds = memberships.map((membership) => membership.team_ID);

    const [
      myRequests,
      myOpenTasks,
      sentBackRequests,
      pendingApproval,
      completedRequests
    ] = await Promise.all([
      this._count(this.db.CARequests, { requester_ID: user.ID }),
      this._count(this.db.CATasks, {
        assignedUser_ID: user.ID,
        status_code: { in: [TASK_STATUS.OPEN, TASK_STATUS.SENT_BACK] }
      }),
      this._count(this.db.CARequests, {
        requester_ID: user.ID,
        status_code: REQUEST_STATUS.SENT_BACK
      }),
      this._count(this.db.CATasks, {
        assignedUser_ID: user.ID,
        isApproval: true,
        status_code: { in: [TASK_STATUS.OPEN, TASK_STATUS.SENT_BACK] }
      }),
      this._count(this.db.CARequests, {
        requester_ID: user.ID,
        status_code: REQUEST_STATUS.COMPLETED
      })
    ]);

    const myTeamTasks = teamIds.length
      ? await this._count(this.db.CATasks, {
          assignedTeam_ID: { in: teamIds },
          assignedUser_ID: null,
          status_code: { in: [TASK_STATUS.OPEN, TASK_STATUS.SENT_BACK] }
        })
      : 0;

    return {
      myRequests,
      myOpenTasks,
      myTeamTasks,
      sentBackRequests,
      pendingApproval,
      completedRequests
    };
  };

  _createRequest = async (req) => {
    const input = req.data.input || {};
    const tx = cds.tx(req);
    const user = await this._ensureCurrentUser(req, tx);
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

    const requestId = cds.utils.uuid();
    const referenceNumber = this._referenceNumber(requestType.code);
    const details = this._parseDetails(req, input.details);

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
      status_code: REQUEST_STATUS.DRAFT,
      priority_code: input.priorityCode || "MEDIUM",
      dueDate: input.dueDate || null,
      predecessor_ID: input.predecessorId || null,
      currentStep: 0
    }));

    await this._insertDetails(tx, requestType.code, requestId, details);
    await this._initializeWorkflow(tx, requestId, requestType.code, requestVariant?.code, user);
    await this._writeHistory(tx, requestId, 0, "REQUEST_CREATED", user, null, REQUEST_STATUS.SUBMITTED);

    return tx.run(SELECT.one.from(this.db.CARequests).where({ ID: requestId }));
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
    if (![TASK_STATUS.OPEN, TASK_STATUS.SENT_BACK].includes(task.status_code)) {
      return req.reject(409, "Only open or sent-back tasks can be approved");
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

  async _initializeWorkflow(tx, requestId, requestTypeCode, requestVariantCode, user) {
    const configs = await SELECT.from(this.db.WorkflowStepConfigs)
      .where({ requestType_code: requestTypeCode, isActive: true })
      .orderBy("stepNo");
    const selectedConfigs = this._selectWorkflowConfigs(configs, requestVariantCode);

    if (!selectedConfigs.length) {
      throw new Error(`No active workflow is configured for ${requestTypeCode}`);
    }

    const teams = await this.master.run(SELECT.from(this.masterEntities.Teams));
    const teamsById = new Map(teams.map((team) => [team.ID, team]));
    const stepEntries = selectedConfigs.map((config, index) => ({
      ID: cds.utils.uuid(),
      request_ID: requestId,
      config_ID: config.ID,
      stepNo: config.stepNo,
      stepName: config.stepName,
      activityDescription: config.activityDescription,
      processorTeam_ID: config.processorTeam_ID,
      processorTeamName: teamsById.get(config.processorTeam_ID)?.name || null,
      status: index === 0 ? "OPEN" : "PENDING",
      startedAt: index === 0 ? new Date().toISOString() : null
    }));
    await tx.run(INSERT.into(this.db.RequestStepInstances).entries(stepEntries));

    const firstStep = stepEntries[0];
    const firstConfig = selectedConfigs[0];
    const firstTeam = teamsById.get(firstConfig.processorTeam_ID);
    await tx.run(INSERT.into(this.db.CATasks).entries({
      ID: cds.utils.uuid(),
      referenceNumber: this._taskReferenceNumber(requestId),
      request_ID: requestId,
      stepInstance_ID: firstStep.ID,
      stepNo: firstStep.stepNo,
      taskName: firstConfig.taskName || firstConfig.stepName,
      description: firstConfig.activityDescription,
      assignedTeam_ID: firstConfig.processorTeam_ID,
      assignedTeamName: firstTeam?.name || null,
      status_code: TASK_STATUS.OPEN,
      isMandatory: firstConfig.isMandatory,
      isApproval: firstConfig.isApproval,
      dueDate: this._addDays(firstConfig.slaDays || 2)
    }));
    await tx.run(UPDATE(this.db.CARequests).set({
      currentStep: firstStep.stepNo,
      status_code: REQUEST_STATUS.SUBMITTED,
      submittedAt: new Date().toISOString()
    }).where({ ID: requestId }));
  }

  _selectWorkflowConfigs(configs, requestVariantCode) {
    const exact = configs.filter((config) => config.requestVariant_code === requestVariantCode);
    if (exact.length) {
      return exact;
    }
    return configs.filter((config) => !config.requestVariant_code);
  }

  async _createConfiguredTaskIfMissing(tx, requestId, step) {
    const existing = await SELECT.one.from(this.db.CATasks).where({
      request_ID: requestId,
      stepNo: step.stepNo,
      status_code: { in: [TASK_STATUS.OPEN, TASK_STATUS.SENT_BACK] }
    });
    if (existing) {
      return;
    }

    const config = step.config_ID
      ? await SELECT.one.from(this.db.WorkflowStepConfigs).where({ ID: step.config_ID })
      : null;
    const teamId = config?.processorTeam_ID || step.processorTeam_ID;
    const team = teamId
      ? await this.master.run(SELECT.one.from(this.masterEntities.Teams).where({ ID: teamId }))
      : null;
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
      status_code: TASK_STATUS.OPEN,
      isMandatory: config?.isMandatory ?? true,
      isApproval: config?.isApproval ?? false,
      dueDate: this._addDays(config?.slaDays || 2)
    }));
  }

  async _insertDetails(tx, requestTypeCode, requestId, details) {
    const entityName = DETAIL_ENTITY_BY_REQUEST_TYPE[requestTypeCode];
    if (!entityName) {
      return;
    }
    await tx.run(INSERT.into(this.db[entityName]).entries({
      ID: cds.utils.uuid(),
      request_ID: requestId,
      ...details
    }));
  }

  async _ensureCurrentUser(req) {
    const loginId = String(req.user.id || "").trim();
    const emailFromToken = req.user.attr?.email || req.user.attr?.mail || loginId;
    let user = await this.master.run(
      SELECT.one.from(this.masterEntities.Users).where({ email: emailFromToken })
    );

    if (!user && loginId !== emailFromToken) {
      user = await this.master.run(
        SELECT.one.from(this.masterEntities.Users).where({ userPrincipalName: loginId })
      );
    }
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
    if ([REQUEST_STATUS.COMPLETED, "REJECTED"].includes(request.status_code)) {
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

  async _count(entity, where) {
    const result = await SELECT.one.from(entity).columns("count(1) as count").where(where);
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
