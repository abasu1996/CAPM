const cds = require("@sap/cds");

const PROCESS_STATUS = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  IN_PROGRESS: "IN_PROGRESS",
  SENT_BACK: "SENT_BACK",
  REJECTED: "REJECTED",
  COMPLETED: "COMPLETED"
};

const TASK_STATUS = {
  OPEN: "OPEN",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  SENT_BACK: "SENT_BACK"
};

module.exports = class FlowmateService extends cds.ApplicationService {
  async init() {
    const {
      ProcessRequests,
      ProcessTasks,
      ProcessInvolvedParties,
      ProcessComments,
      ProcessAttachments,
      ProcessHistory,
      ProcessStepConfig,
      ProcessTypes,
      ProcessStatus,
      TaskStatus,
      RequestDropDown,
      Users,
      Delegations
    } = this.entities;

    if (this.handle_attachments) {
      await this.handle_attachments();
    }

    this.before("READ", Users, (req) => {
      if (!this._isAdministrator(req)) {
        req.query.where({ isActive: true });
      }
    });

    this.before(["CREATE", "UPDATE"], Users, async (req) => {
      if (!this._isAdministrator(req)) {
        return req.reject(403, "Only a user administrator can maintain users");
      }

      if (req.event === "CREATE") {
        req.data.referenceNumber = await this._nextReferenceNumber(req, Users, "USR");
      }

      const oExisting = req.event === "UPDATE"
        ? await cds.tx(req).run(SELECT.one.from(Users).where({ ID: req.data.ID }))
        : {};
      const oUser = { ...oExisting, ...req.data };

      if (!oUser.displayName || !oUser.email || !oUser.userPrincipalName) {
        return req.reject(400, "Name, email, and user principal name are required");
      }

      const aUsers = await cds.tx(req).run(SELECT.from(Users));
      const sEmail = oUser.email.toLowerCase();
      const sPrincipal = oUser.userPrincipalName.toLowerCase();
      const bDuplicate = aUsers.some((oOther) =>
        oOther.ID !== oUser.ID &&
        (oOther.email?.toLowerCase() === sEmail ||
          oOther.userPrincipalName?.toLowerCase() === sPrincipal ||
          oUser.azureObjectId && oOther.azureObjectId === oUser.azureObjectId)
      );

      if (bDuplicate) {
        return req.reject(409, "A user already exists with the same email, principal name, or Azure object ID");
      }
    });

    this.before("DELETE", Users, (req) => {
      if (!this._isAdministrator(req)) {
        return req.reject(403, "Only a user administrator can maintain users");
      }

      return req.reject(405, "Deactivate users instead of deleting them to preserve workflow history");
    });

    this.before(["READ", "CREATE", "UPDATE", "DELETE"], ProcessStepConfig, (req) => {
      if (!this._isAdministrator(req)) {
        return req.reject(403, "Only an administrator can maintain process configuration");
      }
    });

    [ProcessTypes, ProcessStatus, TaskStatus, RequestDropDown].forEach((oCodeList) => {
      this.before(["CREATE", "UPDATE", "DELETE"], oCodeList, (req) => {
        if (!this._isAdministrator(req)) {
          return req.reject(403, "Only an administrator can maintain configuration code lists");
        }

        if (req.event !== "DELETE" && (!req.data.code || !req.data.name || !req.data.descr)) {
          return req.reject(400, "Code, name, and description are required");
        }
      });
    });

    this.before("CREATE", ProcessStepConfig, async (req) => {
      req.data.referenceNumber = await this._nextReferenceNumber(req, ProcessStepConfig, "STP");
    });

    this.before("CREATE", ProcessRequests, async (req) => {
      req.data.referenceNumber = await this._nextReferenceNumber(req, ProcessRequests, "REQ");

      if (req.data.requesterUser_ID) {
        const oRequester = await this._getUser(req, req.data.requesterUser_ID, Users);

        if (!oRequester) {
          return req.reject(400, "Selected requester was not found");
        }

        req.data.requester = this._userDisplayName(oRequester);
        req.data.department ||= oRequester.department;
      } else {
        const oCurrentUser = await this._findUserByPrincipal(req, req.user?.id, Users);

        if (oCurrentUser) {
          req.data.requesterUser_ID = oCurrentUser.ID;
          req.data.requester = this._userDisplayName(oCurrentUser);
          req.data.department ||= oCurrentUser.department;
        }
      }

      if (req.data.processorUser_ID) {
        const oProcessor = await this._getUser(req, req.data.processorUser_ID, Users);

        if (!oProcessor) {
          return req.reject(400, "Selected processor was not found");
        }

        req.data.processor = this._userDisplayName(oProcessor);
      }

      req.data.status_code ??= PROCESS_STATUS.DRAFT;
      req.data.requester ??= req.user?.id || "anonymous";
      req.data.priority ??= "Medium";
      req.data.currentStep ??= 0;
    });

    this.before("UPDATE", ProcessRequests, async (req) => {
      if (!req.data.processorUser_ID) {
        return;
      }

      const oProcessor = await this._getUser(req, req.data.processorUser_ID, Users);

      if (!oProcessor) {
        return req.reject(400, "Selected processor was not found");
      }

      req.data.processor = this._userDisplayName(oProcessor);
    });

    this.before("CREATE", ProcessTasks, async (req) => {
      req.data.referenceNumber = await this._nextReferenceNumber(req, ProcessTasks, "TSK");

      // Backend-only compatibility: external clients can still maintain an assignee snapshot.
      if (req.data.assignedUser_ID) {
        const oAssignee = await this._getUser(req, req.data.assignedUser_ID, Users);

        if (!oAssignee) {
          return req.reject(400, "Selected assignee was not found");
        }

        req.data.assignedTo = this._userAddress(oAssignee);
      }

      if (req.data.processorUser_ID) {
        const oProcessor = await this._getUser(req, req.data.processorUser_ID, Users);

        if (!oProcessor) {
          return req.reject(400, "Selected processor was not found");
        }

        req.data.processor = this._userDisplayName(oProcessor);
      }
    });

    this.before("UPDATE", ProcessTasks, async (req) => {
      if (!req.data.processorUser_ID) {
        return;
      }

      const oProcessor = await this._getUser(req, req.data.processorUser_ID, Users);

      if (!oProcessor) {
        return req.reject(400, "Selected processor was not found");
      }

      req.data.processor = this._userDisplayName(oProcessor);
    });

    this.before("CREATE", ProcessInvolvedParties, async (req) => {
      if (!req.data.request_ID || !req.data.user_ID) {
        return req.reject(400, "Select a request and an involved party");
      }

      const oRequest = await this._getRequest(req, req.data.request_ID);
      const oUser = await this._getUser(req, req.data.user_ID, Users);

      if (!oRequest) {
        return req.reject(400, "Selected request was not found");
      }

      if (!oUser) {
        return req.reject(400, "Selected involved party was not found");
      }

      const oExisting = await cds.tx(req).run(
        SELECT.one.from(ProcessInvolvedParties).where({
          request_ID: req.data.request_ID,
          user_ID: req.data.user_ID
        })
      );

      if (oExisting) {
        return req.reject(409, "This user is already an involved party for the request");
      }

      req.data.referenceNumber = await this._nextReferenceNumber(req, ProcessInvolvedParties, "PTY");
      req.data.displayName = this._userDisplayName(oUser);
      req.data.email = oUser.email;
      req.data.department = oUser.department;
    });

    this.before("CREATE", Delegations, async (req) => {
      const oDelegation = req.data;
      const sCurrentUser = req.user?.id || "anonymous";
      const bCreatedOnBehalf = Boolean(
        oDelegation.delegatorUser_ID || oDelegation.delegator && oDelegation.delegator !== sCurrentUser
      );

      oDelegation.referenceNumber = await this._nextReferenceNumber(req, Delegations, "DLG");

      if (!oDelegation.delegateUser_ID) {
        return req.reject(400, "Select a delegate from the user list");
      }

      const oDelegate = await this._getUser(req, oDelegation.delegateUser_ID, Users);

      if (!oDelegate) {
        return req.reject(400, "Selected delegate was not found");
      }

      oDelegation.delegate = this._userAddress(oDelegate);

      if (bCreatedOnBehalf && !oDelegation.delegatorUser_ID) {
        return req.reject(400, "Select the user on leave from the user list");
      }

      if (oDelegation.delegatorUser_ID) {
        const oDelegator = await this._getUser(req, oDelegation.delegatorUser_ID, Users);

        if (!oDelegator) {
          return req.reject(400, "Selected user on leave was not found");
        }

        oDelegation.delegator = this._userAddress(oDelegator);
      } else {
        const oCurrentUser = await this._findUserByPrincipal(req, sCurrentUser, Users);
        oDelegation.delegatorUser_ID ||= oCurrentUser?.ID;
        oDelegation.delegator = oCurrentUser ? this._userAddress(oCurrentUser) : sCurrentUser;
      }

      oDelegation.forwardNotifications ??= true;
      oDelegation.enabled ??= true;
      oDelegation.createdOnBehalf = bCreatedOnBehalf;

      if (bCreatedOnBehalf && !this._isAdministrator(req)) {
        return req.reject(403, "Only an administrator can create a delegation for another user");
      }

      if (!oDelegation.delegator || !oDelegation.delegate || !oDelegation.startDate || !oDelegation.endDate) {
        return req.reject(400, "User, delegate, start date, and end date are required");
      }

      if (oDelegation.delegator === oDelegation.delegate) {
        return req.reject(400, "A user cannot be assigned as their own delegate");
      }

      if (oDelegation.startDate > oDelegation.endDate) {
        return req.reject(400, "End date must be on or after start date");
      }

      if (oDelegation.enabled && oDelegation.forwardNotifications) {
        const aDelegations = await cds.tx(req).run(
          SELECT.from(Delegations).where({
            delegator: oDelegation.delegator,
            enabled: true,
            forwardNotifications: true
          })
        );
        const bOverlaps = aDelegations.some((oExisting) =>
          oExisting.startDate <= oDelegation.endDate && oExisting.endDate >= oDelegation.startDate
        );

        if (bOverlaps) {
          return req.reject(409, "An active notification delegation already exists during this period");
        }
      }
    });

    this.before("READ", Delegations, async (req) => {
      if (!this._isAdministrator(req)) {
        req.query.where({ delegator: await this._currentUserAddress(req, Users) });
      }
    });

    this.before("UPDATE", Delegations, (req) => {
      return req.reject(405, "Delete and recreate a delegation to change its details");
    });

    this.before("DELETE", Delegations, async (req) => {
      if (this._isAdministrator(req)) {
        return;
      }

      const oDelegation = await cds.tx(req).run(
        SELECT.one.from(Delegations).where({ ID: req.data.ID })
      );

      if (!oDelegation || oDelegation.delegator !== await this._currentUserAddress(req, Users)) {
        return req.reject(403, "Only the delegation owner or an administrator can delete this assignment");
      }
    });

    this.before("CREATE", ProcessAttachments, async (req) => {
      req.data.referenceNumber = await this._nextReferenceNumber(req, ProcessAttachments, "ATT");
    });

    this.before("CREATE", ProcessComments, async (req) => {
      req.data.referenceNumber = await this._nextReferenceNumber(req, ProcessComments, "CMT");
    });

    this.before("CREATE", ProcessHistory, async (req) => {
      req.data.referenceNumber = await this._nextReferenceNumber(req, ProcessHistory, "HIS");
    });

    this.on("submitRequest", async (req) => {
      const { requestId } = req.data;
      const request = await this._getRequest(req, requestId);

      if (!request) {
        return req.reject(404, `Process request ${requestId} was not found`);
      }

      const steps = await this._getSteps(req, request.processType_code);
      const firstTaskStep = this._getFirstActionableStep(steps);
      const oldStatus = request.status_code || PROCESS_STATUS.DRAFT;

      await this._writeHistory(req, {
        requestId,
        stepNo: firstTaskStep?.stepNo || request.currentStep || 0,
        action: "SUBMITTED",
        actor: req.user?.id,
        oldStatus,
        newStatus: firstTaskStep ? PROCESS_STATUS.IN_PROGRESS : PROCESS_STATUS.SUBMITTED,
        remarks: "Request submitted"
      });

      if (firstTaskStep) {
        await this._createTask(req, requestId, firstTaskStep);
      }

      await cds.tx(req).run(
        UPDATE(ProcessRequests, requestId).set({
          status_code: firstTaskStep ? PROCESS_STATUS.IN_PROGRESS : PROCESS_STATUS.SUBMITTED,
          currentStep: firstTaskStep?.stepNo || request.currentStep || 0,
          dueDate: firstTaskStep ? this._calculateDueDate(firstTaskStep.slaDays) : request.dueDate
        })
      );

      return true;
    });

    this.on("approveTask", async (req) => {
      const { taskId, remarks } = req.data;
      const task = await this._getTask(req, taskId);

      if (!task) {
        return req.reject(404, `Task ${taskId} was not found`);
      }

      const request = await this._getRequest(req, task.request_ID);
      const steps = await this._getSteps(req, request.processType_code);
      const currentStep = steps.find((step) => step.stepNo === task.stepNo);
      const nextStep = this._getNextStep(steps, currentStep, "approve");
      const oldStatus = request.status_code || PROCESS_STATUS.IN_PROGRESS;

      await cds.tx(req).run(
        UPDATE(ProcessTasks, taskId).set({
          status_code: TASK_STATUS.APPROVED,
          decision: "APPROVED",
          remarks,
          completedAt: this._now()
        })
      );

      if (nextStep && !this._isClosingStep(nextStep)) {
        await this._createTask(req, task.request_ID, nextStep);
        await cds.tx(req).run(
          UPDATE(ProcessRequests, task.request_ID).set({
            status_code: PROCESS_STATUS.IN_PROGRESS,
            currentStep: nextStep.stepNo,
            dueDate: this._calculateDueDate(nextStep.slaDays)
          })
        );
      } else {
        await cds.tx(req).run(
          UPDATE(ProcessRequests, task.request_ID).set({
            status_code: PROCESS_STATUS.COMPLETED,
            currentStep: nextStep?.stepNo || task.stepNo,
            completedAt: this._now()
          })
        );
      }

      await this._writeHistory(req, {
        requestId: task.request_ID,
        stepNo: task.stepNo,
        action: "APPROVED",
        actor: req.user?.id,
        oldStatus,
        newStatus: nextStep && !this._isClosingStep(nextStep) ? PROCESS_STATUS.IN_PROGRESS : PROCESS_STATUS.COMPLETED,
        remarks
      });

      return true;
    });

    this.on("rejectTask", async (req) => {
      const { taskId, remarks } = req.data;
      const task = await this._getTask(req, taskId);

      if (!task) {
        return req.reject(404, `Task ${taskId} was not found`);
      }

      const request = await this._getRequest(req, task.request_ID);

      await cds.tx(req).run([
        UPDATE(ProcessTasks, taskId).set({
          status_code: TASK_STATUS.REJECTED,
          decision: "REJECTED",
          remarks,
          completedAt: this._now()
        }),
        UPDATE(ProcessRequests, task.request_ID).set({
          status_code: PROCESS_STATUS.REJECTED,
          completedAt: this._now()
        })
      ]);

      await this._writeHistory(req, {
        requestId: task.request_ID,
        stepNo: task.stepNo,
        action: "REJECTED",
        actor: req.user?.id,
        oldStatus: request.status_code,
        newStatus: PROCESS_STATUS.REJECTED,
        remarks
      });

      return true;
    });

    this.on("sendBack", async (req) => {
      const { taskId, remarks } = req.data;
      const task = await this._getTask(req, taskId);

      if (!task) {
        return req.reject(404, `Task ${taskId} was not found`);
      }

      const request = await this._getRequest(req, task.request_ID);
      const steps = await this._getSteps(req, request.processType_code);
      const currentStep = steps.find((step) => step.stepNo === task.stepNo);
      const sendBackStep = this._getNextStep(steps, currentStep, "reject") || this._getPreviousStep(steps, task.stepNo);

      await cds.tx(req).run(
        UPDATE(ProcessTasks, taskId).set({
          status_code: TASK_STATUS.SENT_BACK,
          decision: "SENT_BACK",
          remarks,
          completedAt: this._now()
        })
      );

      if (sendBackStep) {
        await this._createTask(req, task.request_ID, sendBackStep);
      }

      await cds.tx(req).run(
        UPDATE(ProcessRequests, task.request_ID).set({
          status_code: PROCESS_STATUS.SENT_BACK,
          currentStep: sendBackStep?.stepNo || task.stepNo,
          dueDate: sendBackStep ? this._calculateDueDate(sendBackStep.slaDays) : request.dueDate
        })
      );

      await this._writeHistory(req, {
        requestId: task.request_ID,
        stepNo: task.stepNo,
        action: "SENT_BACK",
        actor: req.user?.id,
        oldStatus: request.status_code,
        newStatus: PROCESS_STATUS.SENT_BACK,
        remarks
      });

      return true;
    });

    this.on("updateRequestStatus", async (req) => {
      const { requestId, statusCode } = req.data;
      const request = await this._getRequest(req, requestId);

      if (!request) {
        return req.reject(404, `Process request ${requestId} was not found`);
      }

      if (!await this._isConfiguredStatus(req, ProcessStatus, statusCode)) {
        return req.reject(400, "Select a valid request status");
      }

      if (request.status_code === statusCode) {
        return true;
      }

      await cds.tx(req).run(
        UPDATE(ProcessRequests, requestId).set({ status_code: statusCode })
      );

      await this._writeHistory(req, {
        requestId,
        stepNo: request.currentStep || 0,
        action: "STATUS_CHANGED",
        actor: req.user?.id,
        oldStatus: request.status_code,
        newStatus: statusCode,
        remarks: "Request status changed manually"
      });

      return true;
    });

    this.on("updateTaskStatus", async (req) => {
      const { taskId, statusCode } = req.data;
      const task = await this._getTask(req, taskId);

      if (!task) {
        return req.reject(404, `Task ${taskId} was not found`);
      }

      if (!await this._isConfiguredStatus(req, TaskStatus, statusCode)) {
        return req.reject(400, "Select a valid task status");
      }

      if (task.status_code === statusCode) {
        return true;
      }

      await cds.tx(req).run(
        UPDATE(ProcessTasks, taskId).set({ status_code: statusCode })
      );

      await this._writeHistory(req, {
        requestId: task.request_ID,
        stepNo: task.stepNo,
        action: "TASK_STATUS_CHANGED",
        actor: req.user?.id,
        oldStatus: task.status_code,
        newStatus: statusCode,
        remarks: `Task status changed manually: ${task.taskName || ""}`
      });

      return true;
    });

    this.on("assignRequestProcessor", async (req) => {
      const { requestId, processorUserId } = req.data;
      const request = await this._getRequest(req, requestId);

      if (!request) {
        return req.reject(404, `Process request ${requestId} was not found`);
      }

      const oProcessor = await this._getUser(req, processorUserId, Users);

      if (!oProcessor) {
        return req.reject(400, "Select an active request processor");
      }

      const sProcessor = this._userDisplayName(oProcessor);

      if (request.processorUser_ID === processorUserId && request.processor === sProcessor) {
        return true;
      }

      await cds.tx(req).run(
        UPDATE(ProcessRequests, requestId).set({
          processorUser_ID: processorUserId,
          processor: sProcessor
        })
      );

      await this._writeHistory(req, {
        requestId,
        stepNo: request.currentStep || 0,
        action: "PROCESSOR_ASSIGNED",
        actor: req.user?.id,
        oldStatus: request.status_code,
        newStatus: request.status_code,
        remarks: `Request processor assigned: ${sProcessor}`
      });

      return true;
    });

    this.on("assignTaskProcessor", async (req) => {
      const { taskId, processorUserId } = req.data;
      const task = await this._getTask(req, taskId);

      if (!task) {
        return req.reject(404, `Task ${taskId} was not found`);
      }

      const oProcessor = await this._getUser(req, processorUserId, Users);

      if (!oProcessor) {
        return req.reject(400, "Select an active task processor");
      }

      const sProcessor = this._userDisplayName(oProcessor);

      if (task.processorUser_ID === processorUserId && task.processor === sProcessor) {
        return true;
      }

      await cds.tx(req).run(
        UPDATE(ProcessTasks, taskId).set({
          processorUser_ID: processorUserId,
          processor: sProcessor
        })
      );

      await this._writeHistory(req, {
        requestId: task.request_ID,
        stepNo: task.stepNo,
        action: "TASK_PROCESSOR_ASSIGNED",
        actor: req.user?.id,
        oldStatus: task.status_code,
        newStatus: task.status_code,
        remarks: `Task processor assigned: ${sProcessor}`
      });

      return true;
    });

    this.on("resolveNotificationRecipient", async (req) => {
      const sOriginalRecipient = req.data.userId;

      if (!sOriginalRecipient) {
        return req.reject(400, "Notification recipient is required");
      }

      return this._resolveDelegatedRecipient(req, sOriginalRecipient, Delegations);
    });

    this.on("resolveTaskNotificationRecipient", async (req) => {
      const task = await this._getTask(req, req.data.taskId);

      if (!task) {
        return req.reject(404, `Task ${req.data.taskId} was not found`);
      }

      if (!task.processorUser_ID) {
        return req.reject(400, "Please maintain an email first for the processor.");
      }

      const oProcessor = await cds.tx(req).run(
        SELECT.one.from(Users).where({ ID: task.processorUser_ID, isActive: true })
      );

      if (!oProcessor?.email) {
        return req.reject(400, "Please maintain an email first for the processor.");
      }

      return this._resolveDelegatedRecipient(req, oProcessor.email, Delegations);
    });

    this.on("resolveInvolvedPartyNotificationRecipient", async (req) => {
      const oParty = await cds.tx(req).run(
        SELECT.one.from(ProcessInvolvedParties).where({ ID: req.data.partyId })
      );

      if (!oParty) {
        return req.reject(404, `Involved party ${req.data.partyId} was not found`);
      }

      const oUser = await cds.tx(req).run(
        SELECT.one.from(Users).where({ ID: oParty.user_ID, isActive: true })
      );

      if (!oUser?.email) {
        return req.reject(400, "Please maintain an email first for the involved party.");
      }

      return this._resolveDelegatedRecipient(req, oUser.email, Delegations);
    });

    this.on("getUserAdministrationCapabilities", (req) => ({
      canMaintainUsers: this._isAdministrator(req)
    }));

    this.on("getApplicationCapabilities", (req) => ({
      isAdmin: this._isAdministrator(req),
      canMaintainUsers: this._isAdministrator(req),
      canDelegateOnBehalf: this._isAdministrator(req)
    }));

    return super.init();
  }

  _now() {
    return new Date().toISOString();
  }

  _calculateDueDate(slaDays = 0) {
    const dueDate = new Date();
    dueDate.setUTCDate(dueDate.getUTCDate() + Number(slaDays || 0));
    return dueDate.toISOString().slice(0, 10);
  }

  async _getRequest(req, requestId) {
    return cds.tx(req).run(SELECT.one.from(this.entities.ProcessRequests).where({ ID: requestId }));
  }

  async _getUser(req, userId, Users) {
    return cds.tx(req).run(SELECT.one.from(Users).where({ ID: userId, isActive: true }));
  }

  async _nextReferenceNumber(req, entity, prefix) {
    this._referenceNumberLocks ??= new Map();
    const oPrevious = this._referenceNumberLocks.get(prefix) || Promise.resolve();
    let fnRelease;
    const oCurrent = new Promise((resolve) => {
      fnRelease = resolve;
    });

    this._referenceNumberLocks.set(prefix, oPrevious.then(() => oCurrent));
    await oPrevious;

    try {
      const aReferences = await cds.tx(req).run(
        SELECT.from(entity).columns("referenceNumber").where({
          referenceNumber: { like: `${prefix}-%` }
        })
      );
      const iLastNumber = aReferences.reduce((iHighest, oEntry) => {
        const iNumber = Number((oEntry.referenceNumber || "").slice(prefix.length + 1));
        return Number.isFinite(iNumber) ? Math.max(iHighest, iNumber) : iHighest;
      }, 0);

      return `${prefix}-${String(iLastNumber + 1).padStart(6, "0")}`;
    } finally {
      fnRelease();
    }
  }

  async _findUserByPrincipal(req, principal, Users) {
    if (!principal) {
      return null;
    }

    for (const sProperty of ["email", "userPrincipalName", "azureObjectId"]) {
      const oUser = await cds.tx(req).run(
        SELECT.one.from(Users).where({ [sProperty]: principal, isActive: true })
      );

      if (oUser) {
        return oUser;
      }
    }

    return null;
  }

  async _currentUserAddress(req, Users) {
    const sPrincipal = req.user?.id || "anonymous";
    const oUser = await this._findUserByPrincipal(req, sPrincipal, Users);

    return oUser ? this._userAddress(oUser) : sPrincipal;
  }

  _userAddress(user) {
    return user.email || user.userPrincipalName || user.displayName;
  }

  _userDisplayName(user) {
    return user.displayName || user.email || user.userPrincipalName;
  }

  async _isConfiguredStatus(req, StatusEntity, statusCode) {
    if (!statusCode) {
      return false;
    }

    return Boolean(await cds.tx(req).run(
      SELECT.one.from(StatusEntity).where({ code: statusCode })
    ));
  }

  async _resolveDelegatedRecipient(req, originalRecipient, Delegations) {
    const sToday = new Date().toISOString().slice(0, 10);
    const oDelegation = await cds.tx(req).run(
      SELECT.one.from(Delegations).where({
        delegator: originalRecipient,
        enabled: true,
        forwardNotifications: true,
        startDate: { "<=": sToday },
        endDate: { ">=": sToday }
      })
    );

    return {
      originalRecipient,
      recipient: oDelegation?.delegate || originalRecipient,
      delegated: Boolean(oDelegation),
      delegationId: oDelegation?.ID || null
    };
  }

  _isAdministrator(req) {
    return Boolean(req.user?.is("Admin") || req.user?.is("admin"));
  }

  async _getTask(req, taskId) {
    return cds.tx(req).run(SELECT.one.from(this.entities.ProcessTasks).where({ ID: taskId }));
  }

  async _getSteps(req, processTypeCode) {
    if (!processTypeCode) {
      return [];
    }

    return cds.tx(req).run(
      SELECT.from(this.entities.ProcessStepConfig)
        .where({ processType_code: processTypeCode })
        .orderBy("stepNo")
    );
  }

  _getFirstActionableStep(steps) {
    if (!steps.length) {
      return null;
    }

    const submitStep = steps[0];
    const nextStepNo = submitStep.nextOnApprove;

    if (nextStepNo) {
      return steps.find((step) => step.stepNo === nextStepNo) || submitStep;
    }

    return /submit/i.test(submitStep.stepName || "") ? steps[1] || submitStep : submitStep;
  }

  _getNextStep(steps, currentStep, decision) {
    if (!currentStep) {
      return null;
    }

    const configuredStepNo = decision === "approve" ? currentStep.nextOnApprove : currentStep.nextOnReject;
    const nextStepNo = configuredStepNo || (decision === "approve" ? this._getNextStepNo(steps, currentStep.stepNo) : null);

    return steps.find((step) => step.stepNo === nextStepNo) || null;
  }

  _getNextStepNo(steps, currentStepNo) {
    return steps.find((step) => step.stepNo > currentStepNo)?.stepNo;
  }

  _getPreviousStep(steps, currentStepNo) {
    const previousSteps = steps.filter((step) => step.stepNo < currentStepNo);
    return previousSteps[previousSteps.length - 1] || null;
  }

  _isClosingStep(step) {
    return /closed|complete|completed/i.test(step.stepName || "") || Number(step.slaDays || 0) === 0 && !step.nextOnApprove;
  }

  async _createTask(req, requestId, step) {
    const sReferenceNumber = await this._nextReferenceNumber(req, this.entities.ProcessTasks, "TSK");

    await cds.tx(req).run(
      INSERT.into(this.entities.ProcessTasks).entries({
        referenceNumber: sReferenceNumber,
        request_ID: requestId,
        stepNo: step.stepNo,
        taskName: step.stepName,
        // Kept for workflow compatibility; assignee details are no longer presented by the UI.
        assignedTo: step.role,
        role: step.role,
        status_code: TASK_STATUS.OPEN
      })
    );
  }

  async _writeHistory(req, entry) {
    const sReferenceNumber = await this._nextReferenceNumber(req, this.entities.ProcessHistory, "HIS");

    await cds.tx(req).run(
      INSERT.into(this.entities.ProcessHistory).entries({
        referenceNumber: sReferenceNumber,
        request_ID: entry.requestId,
        stepNo: entry.stepNo,
        action: entry.action,
        actor: entry.actor || "anonymous",
        oldStatus: entry.oldStatus,
        newStatus: entry.newStatus,
        remarks: entry.remarks
      })
    );
  }
};
