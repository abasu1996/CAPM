const cds = require("@sap/cds");

const PROCESS_STATUS = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  IN_PROGRESS: "IN_PROGRESS",
  SENT_BACK: "SENT_BACK",
  REJECTED: "REJECTED",
  COMPLETED: "COMPLETED"
};

const LOCKED_REQUEST_STATUSES = new Set([
  PROCESS_STATUS.COMPLETED,
  PROCESS_STATUS.REJECTED
]);

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

    this.before("READ", ProcessRequests, async (req) => {
      const oReservationUser = await this._currentReservationUser(req, Users);
      this._applyVisibleRequestsWhere(req.query, oReservationUser);
    });

    this.after("READ", ProcessRequests, async (data, req) => {
      const oReservationUser = await this._currentReservationUser(req, Users);
      this._filterExpandedTasksByAssignment(data, oReservationUser);
    });

    this.before("READ", ProcessTasks, async (req) => {
      await this._filterByVisibleRequests(req, Users, "request_ID");
      await this._filterByAssignedTasks(req, Users);
    });

    this.before("READ", ProcessInvolvedParties, async (req) => {
      await this._filterByVisibleRequests(req, Users, "request_ID");
    });

    this.before("READ", ProcessAttachments, async (req) => {
      await this._filterByVisibleRequests(req, Users, "request_ID");
    });

    this.before("READ", ProcessComments, async (req) => {
      await this._filterByVisibleRequests(req, Users, "request_ID");
    });

    this.before("READ", ProcessHistory, async (req) => {
      await this._filterByVisibleRequests(req, Users, "request_ID");
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

    this.before(["CREATE", "UPDATE", "DELETE"], ProcessStepConfig, (req) => {
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

    this.before(["CREATE", "UPDATE"], ProcessStepConfig, async (req) => {
      const sStepId = req.data.ID || req.params?.[0]?.ID;
      const oExisting = req.event === "UPDATE" && sStepId
        ? await cds.tx(req).run(SELECT.one.from(ProcessStepConfig).where({ ID: sStepId }))
        : {};
      const oStep = { ...oExisting, ...req.data };

      if (!oStep.processType_code || !oStep.stepNo || !oStep.stepName) {
        return req.reject(400, "Process type, step number, and step name are required");
      }

      const oDuplicate = await cds.tx(req).run(
        SELECT.one.from(ProcessStepConfig).where({
          processType_code: oStep.processType_code,
          stepNo: oStep.stepNo
        })
      );

      if (oDuplicate && oDuplicate.ID !== sStepId) {
        return req.reject(409, "A process step already exists for this process type and step number");
      }
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

    this.after("CREATE", ProcessRequests, async (request, req) => {
      await this._ensureInitialGuidedTask(req, request.ID, request, { updateRequest: true });
    });

    this.before(["UPDATE", "DELETE"], ProcessRequests, async (req) => {
      const sRequestId = this._requestIdFromReq(req);

      if (sRequestId) {
        await this._rejectIfRequestLocked(req, sRequestId);
      }
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
      await this._rejectIfRequestLocked(req, req.data.request_ID);

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
      await this._rejectIfTaskRequestLocked(req);

      if (!req.data.processorUser_ID) {
        return;
      }

      const oProcessor = await this._getUser(req, req.data.processorUser_ID, Users);

      if (!oProcessor) {
        return req.reject(400, "Selected processor was not found");
      }

      req.data.processor = this._userDisplayName(oProcessor);
    });

    this.before("DELETE", ProcessTasks, async (req) => {
      await this._rejectIfTaskRequestLocked(req);
    });

    this.after("CREATE", ProcessTasks, async (task, req) => {
      if (!task.request_ID || !task.stepNo || task.status_code === TASK_STATUS.APPROVED) {
        return;
      }

      const request = await this._getRequest(req, task.request_ID);

      if (!request || this._isLockedRequest(request)) {
        return;
      }

      const steps = await this._getSteps(req, request.processType_code);
      const step = steps.find((oStep) => Number(oStep.stepNo || 0) === Number(task.stepNo || 0));

      await cds.tx(req).run(
        UPDATE(ProcessRequests, task.request_ID).set({
          status_code: PROCESS_STATUS.IN_PROGRESS,
          currentStep: task.stepNo,
          dueDate: step ? this._calculateDueDate(step.slaDays) : request.dueDate,
          completedAt: null
        })
      );
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

      if (this._isLockedRequest(oRequest)) {
        return this._rejectLockedRequest(req);
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

    this.before(["UPDATE", "DELETE"], ProcessInvolvedParties, async (req) => {
      await this._rejectIfInvolvedPartyRequestLocked(req);
    });

    this.before("CREATE", ProcessComments, async (req) => {
      await this._rejectIfRequestLocked(req, req.data.request_ID);
      req.data.referenceNumber = await this._nextReferenceNumber(req, ProcessComments, "CMT");
    });

    this.before(["UPDATE", "DELETE"], ProcessComments, async (req) => {
      await this._rejectIfCommentRequestLocked(req);
    });

    this.before("CREATE", ProcessAttachments, async (req) => {
      await this._rejectIfRequestLocked(req, req.data.request_ID);
      req.data.referenceNumber ??= await this._nextReferenceNumber(req, ProcessAttachments, "ATT");
    });

    this.before(["UPDATE", "DELETE"], ProcessAttachments, async (req) => {
      await this._rejectIfAttachmentRequestLocked(req);
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

    this.before("CREATE", ProcessHistory, async (req) => {
      req.data.referenceNumber = await this._nextReferenceNumber(req, ProcessHistory, "HIS");
    });

    this.on("submitRequest", async (req) => {
      const { requestId } = req.data;
      const request = await this._getRequest(req, requestId);

      if (!request) {
        return req.reject(404, `Process request ${requestId} was not found`);
      }

      await this._rejectIfRequestReservedByAnotherUser(req, request, Users);

      if (this._isLockedRequest(request)) {
        return this._rejectLockedRequest(req);
      }

      const { firstTaskStep } = await this._ensureInitialGuidedTask(req, requestId, request);
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

      await this._rejectIfTaskAssignedToAnotherUser(req, task, Users);

      const request = await this._getRequest(req, task.request_ID);

      await this._rejectIfRequestReservedByAnotherUser(req, request, Users);

      if (this._isLockedRequest(request)) {
        return this._rejectLockedRequest(req);
      }

      const steps = await this._getSteps(req, request.processType_code);
      const currentStep = steps.find((step) => step.stepNo === task.stepNo);
      const oBlockingError = this._getTaskProgressionError(task, request, currentStep);

      if (oBlockingError) {
        return req.reject(400, oBlockingError);
      }

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

      const bStepStillHasOpenWork = await this._hasIncompleteTasksForStep(req, task.request_ID, task.stepNo);

      if (bStepStillHasOpenWork) {
        await cds.tx(req).run(
          UPDATE(ProcessRequests, task.request_ID).set({
            status_code: PROCESS_STATUS.IN_PROGRESS,
            currentStep: task.stepNo,
            dueDate: currentStep ? this._calculateDueDate(currentStep.slaDays) : request.dueDate,
            completedAt: null
          })
        );

        await this._writeHistory(req, {
          requestId: task.request_ID,
          stepNo: task.stepNo,
          action: "APPROVED",
          actor: req.user?.id,
          oldStatus,
          newStatus: PROCESS_STATUS.IN_PROGRESS,
          remarks
        });

        return true;
      }

      const mandatoryStep = await this._findIncompleteMandatoryStep(req, task.request_ID, steps, {
        afterStepNo: task.stepNo,
        beforeStepNo: nextStep?.stepNo,
        assumeCompletedStepNo: task.stepNo
      });
      const guidedNextStep = mandatoryStep || nextStep;
      let sNewRequestStatus = PROCESS_STATUS.COMPLETED;

      if (guidedNextStep && !this._isClosingStep(guidedNextStep)) {
        await this._createTask(req, task.request_ID, guidedNextStep);
        sNewRequestStatus = PROCESS_STATUS.IN_PROGRESS;
        await cds.tx(req).run(
          UPDATE(ProcessRequests, task.request_ID).set({
            status_code: sNewRequestStatus,
            currentStep: guidedNextStep.stepNo,
            dueDate: this._calculateDueDate(guidedNextStep.slaDays)
          })
        );
      } else {
        const incompleteStep = await this._findIncompleteMandatoryStep(req, task.request_ID, steps, {
          assumeCompletedStepNo: task.stepNo
        });

        if (incompleteStep) {
          await this._createTask(req, task.request_ID, incompleteStep);
          sNewRequestStatus = PROCESS_STATUS.IN_PROGRESS;
          await cds.tx(req).run(
            UPDATE(ProcessRequests, task.request_ID).set({
              status_code: sNewRequestStatus,
              currentStep: incompleteStep.stepNo,
              dueDate: this._calculateDueDate(incompleteStep.slaDays)
            })
          );
        } else {
          await cds.tx(req).run(
            UPDATE(ProcessRequests, task.request_ID).set({
              status_code: sNewRequestStatus,
              currentStep: guidedNextStep?.stepNo || task.stepNo,
              completedAt: this._now()
            })
          );
        }
      }

      await this._writeHistory(req, {
        requestId: task.request_ID,
        stepNo: task.stepNo,
        action: "APPROVED",
        actor: req.user?.id,
        oldStatus,
        newStatus: sNewRequestStatus,
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

      await this._rejectIfTaskAssignedToAnotherUser(req, task, Users);

      const request = await this._getRequest(req, task.request_ID);

      await this._rejectIfRequestReservedByAnotherUser(req, request, Users);

      if (this._isLockedRequest(request)) {
        return this._rejectLockedRequest(req);
      }

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

      await this._rejectIfTaskAssignedToAnotherUser(req, task, Users);

      const request = await this._getRequest(req, task.request_ID);

      await this._rejectIfRequestReservedByAnotherUser(req, request, Users);

      if (this._isLockedRequest(request)) {
        return this._rejectLockedRequest(req);
      }

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

    this.on("reserveRequest", async (req) => {
      const { requestId } = req.data;
      const request = await this._getRequest(req, requestId);

      if (!request) {
        return req.reject(404, `Process request ${requestId} was not found`);
      }

      if (this._isLockedRequest(request)) {
        return this._rejectLockedRequest(req);
      }

      if (request.reservedBy) {
        await this._rejectIfRequestReservedByAnotherUser(req, request, Users);
        return true;
      }

      const oReservationUser = await this._currentReservationUser(req, Users);
      const oCurrentUser = oReservationUser.user;
      const sReservedBy = oReservationUser.displayName;

      await cds.tx(req).run(
        UPDATE(ProcessRequests, requestId).set({
          reservedByUser_ID: oCurrentUser?.ID || null,
          reservedBy: sReservedBy,
          reservedAt: this._now(),
          processorUser_ID: oCurrentUser?.ID || null,
          processor: sReservedBy
        })
      );

      await cds.tx(req).run(
        UPDATE(ProcessTasks)
          .set({
            processorUser_ID: oCurrentUser?.ID || null,
            processor: sReservedBy
          })
          .where("request_ID =", requestId, "and processorUser_ID is null")
      );

      await this._writeHistory(req, {
        requestId,
        stepNo: request.currentStep || 0,
        action: "RESERVED",
        actor: req.user?.id,
        oldStatus: request.status_code,
        newStatus: request.status_code,
        remarks: `Request reserved by ${sReservedBy} and assigned to ${sReservedBy}`
      });

      return true;
    });

    this.on("updateRequestStatus", async (req) => {
      const { requestId, statusCode } = req.data;
      const request = await this._getRequest(req, requestId);

      if (!request) {
        return req.reject(404, `Process request ${requestId} was not found`);
      }

      await this._rejectIfRequestReservedByAnotherUser(req, request, Users);

      if (this._isLockedRequest(request)) {
        return this._rejectLockedRequest(req);
      }

      if (!await this._isConfiguredStatus(req, ProcessStatus, statusCode)) {
        return req.reject(400, "Select a valid request status");
      }

      if (request.status_code === statusCode) {
        return true;
      }

      if (statusCode === PROCESS_STATUS.COMPLETED) {
        const steps = await this._getSteps(req, request.processType_code);
        const incompleteStep = await this._findIncompleteMandatoryStep(req, requestId, steps);

        if (incompleteStep) {
          return req.reject(400, `Complete mandatory step ${incompleteStep.stepNo} - ${incompleteStep.stepName} before completing this request`);
        }
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

      await this._rejectIfTaskAssignedToAnotherUser(req, task, Users);

      await this._rejectIfRequestLocked(req, task.request_ID);
      await this._rejectIfRequestReservedByAnotherUser(req, await this._getRequest(req, task.request_ID), Users);

      if (!await this._isConfiguredStatus(req, TaskStatus, statusCode)) {
        return req.reject(400, "Select a valid task status");
      }

      if (task.status_code === statusCode) {
        return true;
      }

      if (statusCode === TASK_STATUS.APPROVED) {
        const request = await this._getRequest(req, task.request_ID);
        const steps = request ? await this._getSteps(req, request.processType_code) : [];
        const currentStep = steps.find((step) => Number(step.stepNo || 0) === Number(task.stepNo || 0));

        if (currentStep?.isMandatory) {
          return req.reject(400, `Complete mandatory step ${currentStep.stepNo} - ${currentStep.stepName} from the task action`);
        }
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

      await this._rejectIfRequestReservedByAnotherUser(req, request, Users);

      if (this._isLockedRequest(request)) {
        return this._rejectLockedRequest(req);
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

      await this._rejectIfTaskAssignedToAnotherUser(req, task, Users);

      await this._rejectIfRequestLocked(req, task.request_ID);
      await this._rejectIfRequestReservedByAnotherUser(req, await this._getRequest(req, task.request_ID), Users);

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

    this.on("getRequestReservationCounts", async (req) => {
      const oReservationUser = await this._currentReservationUser(req, Users);
      const qReservedByMe = SELECT.one.from(ProcessRequests).columns("count(1) as count");

      if (oReservationUser.user?.ID) {
        qReservedByMe.where({ reservedByUser_ID: oReservationUser.user.ID });
      } else {
        qReservedByMe.where({ reservedBy: { in: [oReservationUser.displayName, oReservationUser.principal] } });
      }

      const [oUnreserved, oReserved] = await Promise.all([
        cds.tx(req).run(
          SELECT.one.from(ProcessRequests).columns("count(1) as count").where({ reservedBy: null })
        ),
        cds.tx(req).run(qReservedByMe)
      ]);

      return {
        unreservedRequests: Number(oUnreserved?.count || oUnreserved?.COUNT || 0),
        reservedRequests: Number(oReserved?.count || oReserved?.COUNT || 0)
      };
    });

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

  _requestIdFromReq(req) {
    return req.data?.ID || req.params?.[0]?.ID || req.params?.[0];
  }

  _isLockedRequest(request) {
    return LOCKED_REQUEST_STATUSES.has(request?.status_code);
  }

  _rejectLockedRequest(req) {
    return req.reject(403, "Completed or rejected requests are locked and cannot be modified");
  }

  async _rejectIfRequestReservedByAnotherUser(req, request, Users = this.entities.Users) {
    if (!request?.reservedBy) {
      return;
    }

    const oReservationUser = await this._currentReservationUser(req, Users);

    if (!this._isReservedByCurrentUser(request, oReservationUser)) {
      return req.reject(403, `Request is reserved by ${request.reservedBy} and cannot be modified by another user`);
    }
  }

  async _filterByVisibleRequests(req, Users, requestFieldName) {
    const oReservationUser = await this._currentReservationUser(req, Users);
    const qVisibleRequests = SELECT.from(this.entities.ProcessRequests).columns("ID");

    this._applyVisibleRequestsWhere(qVisibleRequests, oReservationUser);
    req.query.where([
      { ref: [requestFieldName] },
      "in",
      qVisibleRequests
    ]);
  }

  async _filterByAssignedTasks(req, Users) {
    const oReservationUser = await this._currentReservationUser(req, Users);
    const aPredicates = [];

    if (oReservationUser.user?.ID) {
      this._addStringEqualsPredicate(aPredicates, "processorUser_ID", oReservationUser.user.ID);
      this._addStringEqualsPredicate(aPredicates, "assignedUser_ID", oReservationUser.user.ID);
    }

    this._addStringEqualsPredicate(aPredicates, "processor", oReservationUser.displayName);
    this._addStringEqualsPredicate(aPredicates, "assignedTo", oReservationUser.displayName);
    this._addStringEqualsPredicate(aPredicates, "processor", oReservationUser.principal);
    this._addStringEqualsPredicate(aPredicates, "assignedTo", oReservationUser.principal);

    if (!aPredicates.length) {
      req.query.where(this._alwaysFalsePredicate());
      return;
    }

    req.query.where({ xpr: aPredicates });
  }

  _toQueryString(value) {
    if (value === undefined || value === null || value === "") {
      return "";
    }

    return String(value);
  }

  _addStringEqualsPredicate(predicates, fieldName, value) {
    const sValue = this._toQueryString(value);

    if (!sValue) {
      return;
    }

    if (predicates.length) {
      predicates.push("or");
    }

    predicates.push({ ref: [fieldName] }, "=", { val: sValue });
  }

  _alwaysFalsePredicate() {
    return [
      { val: "1" },
      "=",
      { val: "0" }
    ];
  }

  _filterExpandedTasksByAssignment(data, reservationUser) {
    const aRequests = Array.isArray(data) ? data : [data];

    aRequests.filter(Boolean).forEach((request) => {
      if (!request.tasks) {
        return;
      }

      if (Array.isArray(request.tasks)) {
        request.tasks = request.tasks.filter((task) => this._isTaskAssignedToCurrentUser(task, reservationUser));
        return;
      }

      if (Array.isArray(request.tasks.results)) {
        request.tasks.results = request.tasks.results.filter((task) => this._isTaskAssignedToCurrentUser(task, reservationUser));
      }
    });
  }

  async _rejectIfTaskAssignedToAnotherUser(req, task, Users = this.entities.Users) {
    if (!task || this._isTaskAssignedToCurrentUser(task, await this._currentReservationUser(req, Users))) {
      return;
    }

    return req.reject(403, "Task is assigned to another user and cannot be accessed or modified");
  }

  async _currentReservationUser(req, Users = this.entities.Users) {
    const sPrincipal = req.user?.id || "anonymous";
    const oUser = await this._findUserByPrincipal(req, sPrincipal, Users);

    return {
      user: oUser,
      principal: sPrincipal,
      displayName: oUser ? this._userDisplayName(oUser) : sPrincipal
    };
  }

  _applyVisibleRequestsWhere(query, reservationUser) {
    if (reservationUser.user?.ID) {
      query.where("(reservedBy is null or reservedByUser_ID =", reservationUser.user.ID, ")");
      return;
    }

    query.where("(reservedBy is null or reservedBy =", reservationUser.displayName, ")");
  }

  _isReservedByCurrentUser(request, reservationUser) {
    if (!request?.reservedBy) {
      return false;
    }

    if (request.reservedByUser_ID && reservationUser.user?.ID) {
      return request.reservedByUser_ID === reservationUser.user.ID;
    }

    return request.reservedBy === reservationUser.displayName || request.reservedBy === reservationUser.principal;
  }

  _isTaskAssignedToCurrentUser(task, reservationUser) {
    if (task.processorUser_ID || task.assignedUser_ID) {
      return Boolean(
        reservationUser.user?.ID &&
        (task.processorUser_ID === reservationUser.user.ID || task.assignedUser_ID === reservationUser.user.ID)
      );
    }

    return [task.processor, task.assignedTo].some((sOwner) =>
      sOwner === reservationUser.displayName ||
      sOwner === reservationUser.principal
    );
  }

  async _rejectIfRequestLocked(req, requestId) {
    if (!requestId) {
      return;
    }

    const request = await this._getRequest(req, requestId);

    if (this._isLockedRequest(request)) {
      return this._rejectLockedRequest(req);
    }

    await this._rejectIfRequestReservedByAnotherUser(req, request);
  }

  async _rejectIfTaskRequestLocked(req) {
    const taskId = this._requestIdFromReq(req);
    const task = taskId ? await this._getTask(req, taskId) : null;

    await this._rejectIfRequestLocked(req, task?.request_ID || req.data?.request_ID);
  }

  async _rejectIfInvolvedPartyRequestLocked(req) {
    const partyId = this._requestIdFromReq(req);
    const party = partyId
      ? await cds.tx(req).run(SELECT.one.from(this.entities.ProcessInvolvedParties).where({ ID: partyId }))
      : null;

    await this._rejectIfRequestLocked(req, party?.request_ID || req.data?.request_ID);
  }

  async _rejectIfCommentRequestLocked(req) {
    const commentId = this._requestIdFromReq(req);
    const comment = commentId
      ? await cds.tx(req).run(SELECT.one.from(this.entities.ProcessComments).where({ ID: commentId }))
      : null;

    await this._rejectIfRequestLocked(req, comment?.request_ID || req.data?.request_ID);
  }

  async _rejectIfAttachmentRequestLocked(req) {
    const attachmentId = this._requestIdFromReq(req);
    const attachment = attachmentId
      ? await cds.tx(req).run(SELECT.one.from(this.entities.ProcessAttachments).where({ ID: attachmentId }))
      : null;

    await this._rejectIfRequestLocked(req, attachment?.request_ID || req.data?.request_ID);
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
      const oLastReference = await cds.tx(req).run(
        SELECT.one.from(entity).columns("referenceNumber").where({
          referenceNumber: { like: `${prefix}-%` }
        }).orderBy("referenceNumber desc")
      );
      const iLastNumber = Number((oLastReference?.referenceNumber || "").slice(prefix.length + 1)) || 0;

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

  _getInitialGuidedStep(steps) {
    if (!steps.length) {
      return null;
    }

    return steps.find((step) => !this._isClosingStep(step)) || null;
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

  _getTaskProgressionError(task, request, currentStep) {
    if (task.status_code !== TASK_STATUS.OPEN) {
      return "Only open tasks can be completed";
    }

    if (!currentStep) {
      return null;
    }

    if (Number(request.currentStep || 0) !== Number(task.stepNo || 0)) {
      return `Complete the current guided step ${request.currentStep} before processing step ${task.stepNo}`;
    }

    return null;
  }

  async _findIncompleteMandatoryStep(req, requestId, steps, options = {}) {
    const aMandatorySteps = steps
      .filter((step) => step.isMandatory)
      .filter((step) => options.afterStepNo == null || step.stepNo > options.afterStepNo)
      .filter((step) => options.beforeStepNo == null || step.stepNo < options.beforeStepNo);

    if (!aMandatorySteps.length) {
      return null;
    }

    const aTasks = await cds.tx(req).run(
      SELECT.from(this.entities.ProcessTasks).where({ request_ID: requestId })
    );
    const mTasksByStep = aTasks.reduce((mResult, task) => {
      const sStepNo = String(Number(task.stepNo || 0));
      const aStepTasks = mResult.get(sStepNo) || [];

      aStepTasks.push(task);
      mResult.set(sStepNo, aStepTasks);
      return mResult;
    }, new Map());

    return aMandatorySteps.find((step) => {
      const aStepTasks = mTasksByStep.get(String(Number(step.stepNo || 0))) || [];

      return !this._areStepTasksComplete(aStepTasks);
    }) || null;
  }

  _areStepTasksComplete(tasks) {
    return Boolean(tasks.length) && tasks.every((task) => task.status_code === TASK_STATUS.APPROVED);
  }

  async _hasIncompleteTasksForStep(req, requestId, stepNo) {
    const aTasks = await cds.tx(req).run(
      SELECT.from(this.entities.ProcessTasks)
        .columns("status_code")
        .where({ request_ID: requestId, stepNo })
    );

    return Boolean(aTasks.length) && !this._areStepTasksComplete(aTasks);
  }

  _isClosingStep(step) {
    return /closed|complete|completed/i.test(step.stepName || "") || Number(step.slaDays || 0) === 0 && !step.nextOnApprove;
  }

  async _ensureInitialGuidedTask(req, requestId, request, options = {}) {
    const steps = await this._getSteps(req, request.processType_code);
    const firstTaskStep = this._getInitialGuidedStep(steps);

    if (firstTaskStep) {
      await this._createTask(req, requestId, firstTaskStep, { skipIfExistingStep: true });

      if (options.updateRequest && Number(request.currentStep || 0) !== Number(firstTaskStep.stepNo || 0)) {
        await cds.tx(req).run(
          UPDATE(this.entities.ProcessRequests, requestId).set({
            currentStep: firstTaskStep.stepNo,
            dueDate: this._calculateDueDate(firstTaskStep.slaDays)
          })
        );
      }
    }

    return {
      steps,
      firstTaskStep
    };
  }

  async _createTask(req, requestId, step, options = {}) {
    const request = await this._getRequest(req, requestId);
    const oExistingTask = await cds.tx(req).run(
      SELECT.one.from(this.entities.ProcessTasks).where(
        options.skipIfExistingStep
          ? { request_ID: requestId, stepNo: step.stepNo }
          : { request_ID: requestId, stepNo: step.stepNo, status_code: TASK_STATUS.OPEN }
      )
    );

    if (oExistingTask) {
      return;
    }

    const sReferenceNumber = await this._nextReferenceNumber(req, this.entities.ProcessTasks, "TSK");

    await cds.tx(req).run(
      INSERT.into(this.entities.ProcessTasks).entries({
        referenceNumber: sReferenceNumber,
        request_ID: requestId,
        processorUser_ID: request?.processorUser_ID || null,
        stepNo: step.stepNo,
        taskName: step.stepName,
        // Kept for workflow compatibility; assignee details are no longer presented by the UI.
        assignedTo: step.role,
        processor: request?.processor || null,
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
