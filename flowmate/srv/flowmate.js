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

const FTK_FACTORING_SUBTYPES = new Set([
  "FTK_FACTORING",
  "FTK_FACTORING_WITH_UAC",
  "FTK_FACTORING_WITHOUT_UAC"
]);
const DEFAULT_CONFIG_CACHE_TTL_MS = 60 * 1000;

module.exports = class FlowmateService extends cds.ApplicationService {
  async init() {
    this._configCache = new Map();
    this._configCacheTtlMs = this._getConfigCacheTtlMs();
    this.master = await cds.connect.to("CommonMasterDataService");
    this.masterEntities = this.master.entities;

    const {
      ProcessRequests,
      ProcessTasks,
      MyAssignedTasks,
      MyTeamTasks,
      RequestDetailTasks,
      ProcessTaskTeamMembers,
      ProcessInvolvedParties,
      ProcessComments,
      ProcessAttachments,
      ProcessEmailMessages,
      ProcessEmailAttachments,
      ProcessHistory,
      ProcessStepConfig,
      ProcessTypes,
      ProcessSubTypes,
      PaymentCategories,
      FtkEntities,
      Priorities,
      ProcessStatus,
      TaskStatus,
      Teams: ServiceTeams,
      Vendors: ServiceVendors,
      TeamMembers: ServiceTeamMembers,
      RequestDropDown,
      RequestFilterQueries,
      Users: ServiceUsers,
      Delegations: ServiceDelegations
    } = this.entities;
    const {
      Users,
      Teams,
      Vendors,
      TeamMembers,
      Delegations
    } = this.masterEntities;

    this.on("READ", [ServiceUsers, ServiceTeams, ServiceVendors, ServiceTeamMembers], (req) => {
      return this.master.run(req.query);
    });
    this.on(["CREATE", "UPDATE", "DELETE"], [ServiceUsers, ServiceTeams, ServiceVendors, ServiceTeamMembers], (req) => {
      return this.master.run(req.query);
    });

    if (this.handle_attachments) {
      await this.handle_attachments();
    }

    this.before("READ", ServiceUsers, (req) => {
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

    this.before("READ", MyAssignedTasks, async (req) => {
      await this._filterByAssignedTasks(req, Users);
    });

    this.before("READ", MyTeamTasks, async (req) => {
      await this._filterByTeamTasks(req, Users, ProcessTaskTeamMembers);
    });

    this.before("READ", RequestDetailTasks, async (req) => {
      await this._filterByVisibleRequests(req, Users, "request_ID");
    });

    const fnClearUnassignedTeamTaskProcessor = (data) => {
      this._clearUnassignedTeamTaskProcessor(data);
    };
    this.after("READ", ProcessTasks, fnClearUnassignedTeamTaskProcessor);
    this.after("READ", MyTeamTasks, fnClearUnassignedTeamTaskProcessor);
    this.after("READ", RequestDetailTasks, fnClearUnassignedTeamTaskProcessor);

    this.before("READ", ProcessTaskTeamMembers, async (req) => {
      await this._filterByVisibleTaskMembers(req, Users, ProcessTaskTeamMembers, RequestDetailTasks);
    });

    this.before("READ", ProcessInvolvedParties, async (req) => {
      await this._filterByVisibleRequests(req, Users, "request_ID");
    });

    this.before("READ", ProcessAttachments, async (req) => {
      await this._filterByVisibleRequests(req, Users, "request_ID");
    });

    this.before("READ", ProcessEmailMessages, async (req) => {
      await this._filterByVisibleRequests(req, Users, "request_ID");
    });

    this.before("READ", ProcessEmailAttachments, async (req) => {
      await this._filterByVisibleEmails(req, Users, ProcessEmailMessages);
    });

    this.before("READ", ProcessComments, async (req) => {
      await this._filterByVisibleRequests(req, Users, "request_ID");
    });

    this.before("READ", ProcessHistory, async (req) => {
      await this._filterByVisibleRequests(req, Users, "request_ID");
    });

    this.before(["CREATE", "UPDATE", "DELETE"], ServiceUsers, (req) => {
      if (!this._canProvisionUsers(req)) {
        return req.reject(403, "User administration or user provisioning authority is required");
      }
    });

    this.on("createUserWithTeams", async (req) => {
      if (!this._canProvisionUsers(req)) {
        return req.reject(403, "User administration or user provisioning authority is required");
      }
      return this.master.send({
        event: "createUserWithTeams",
        data: req.data
      });
    });

    this.before(["CREATE", "UPDATE", "DELETE"], ProcessStepConfig, (req) => {
      if (!this._isAdministrator(req)) {
        return req.reject(403, "Only an administrator can maintain process configuration");
      }
    });
    this.after(["CREATE", "UPDATE", "DELETE"], ProcessStepConfig, () => this._clearConfigCache());

    [ProcessTypes, PaymentCategories, FtkEntities, Priorities, ProcessStatus, TaskStatus, RequestDropDown].forEach((oCodeList) => {
      this.before(["CREATE", "UPDATE", "DELETE"], oCodeList, (req) => {
        if (!this._isAdministrator(req)) {
          return req.reject(403, "Only an administrator can maintain configuration code lists");
        }

        if (req.event !== "DELETE" && (!req.data.code || !req.data.name || !req.data.descr)) {
          return req.reject(400, "Code, name, and description are required");
        }
      });
      this.after(["CREATE", "UPDATE", "DELETE"], oCodeList, () => this._clearConfigCache());
    });

    this.before(["CREATE", "UPDATE", "DELETE"], ServiceVendors, (req) => {
      if (!this._canProvisionVendors(req)) {
        return req.reject(403, "Vendor administration or vendor provisioning authority is required");
      }
    });

    this.before(["CREATE", "UPDATE", "DELETE"], [ServiceTeams, ServiceTeamMembers], (req) => {
      if (!this._isAdministrator(req)) {
        return req.reject(403, "Only an administrator can maintain teams and team members");
      }
    });

    this.before("CREATE", ProcessStepConfig, async (req) => {
      req.data.referenceNumber = await this._nextReferenceNumber(req, ProcessStepConfig, "STP");
    });

    this.before(["CREATE", "UPDATE"], ProcessStepConfig, async (req) => {
      if (req.data.processorTeam_ID === "") {
        req.data.processorTeam_ID = null;
      }

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

      if (oStep.processorTeam_ID) {
        const oTeam = await this._getTeam(req, oStep.processorTeam_ID, Teams);

        if (!oTeam) {
          return req.reject(400, "Selected processor team was not found");
        }

        req.data.processorTeamName = oTeam.name || oTeam.teamCode;
      } else if (Object.prototype.hasOwnProperty.call(req.data, "processorTeam_ID")) {
        req.data.processorTeamName = null;
      }
    });

    this.before("READ", RequestFilterQueries, (req) => {
      req.query.where({ owner: this._queryOwner(req) });
    });

    this.before("CREATE", RequestFilterQueries, async (req) => {
      req.data.referenceNumber = await this._nextReferenceNumber(req, RequestFilterQueries, "QRY");
      req.data.owner = this._queryOwner(req);

      if (!req.data.name) {
        return req.reject(400, "Query name is required");
      }
    });

    this.before("UPDATE", RequestFilterQueries, async (req) => {
      await this._rejectIfRequestFilterQueryOwnedByAnotherUser(req, RequestFilterQueries);

      if (Object.prototype.hasOwnProperty.call(req.data, "owner")) {
        req.data.owner = this._queryOwner(req);
      }

      if (Object.prototype.hasOwnProperty.call(req.data, "name") && !req.data.name) {
        return req.reject(400, "Query name is required");
      }
    });

    this.before("DELETE", RequestFilterQueries, async (req) => {
      await this._rejectIfRequestFilterQueryOwnedByAnotherUser(req, RequestFilterQueries);
    });

    this.before(["CREATE", "UPDATE"], ProcessRequests, async (req) => {
      const bProcessSelectionChanged = req.event === "CREATE" ||
        Object.prototype.hasOwnProperty.call(req.data, "processType_code") ||
        Object.prototype.hasOwnProperty.call(req.data, "subProcessType_code");

      if (!bProcessSelectionChanged) {
        return;
      }

      const sRequestId = this._requestIdFromReq(req);
      const oExisting = req.event === "UPDATE" && sRequestId
        ? await cds.tx(req).run(
          SELECT.one.from(ProcessRequests)
            .columns("processType_code", "subProcessType_code")
            .where({ ID: sRequestId })
        )
        : {};
      const sProcessTypeCode = Object.prototype.hasOwnProperty.call(req.data, "processType_code")
        ? req.data.processType_code
        : oExisting?.processType_code;
      const sSubProcessTypeCode = Object.prototype.hasOwnProperty.call(req.data, "subProcessType_code")
        ? req.data.subProcessType_code
        : oExisting?.subProcessType_code;

      if (!sProcessTypeCode) {
        return req.reject(400, "Process type is required");
      }

      const [oProcessType, oConfiguredSubType] = await Promise.all([
        cds.tx(req).run(SELECT.one.from(ProcessTypes).columns("code").where({ code: sProcessTypeCode })),
        cds.tx(req).run(
          SELECT.one.from(ProcessSubTypes)
            .columns("code")
            .where({ processType_code: sProcessTypeCode })
        )
      ]);

      if (!oProcessType) {
        return req.reject(400, "Selected process type was not found");
      }

      if (oConfiguredSubType && !sSubProcessTypeCode) {
        return req.reject(400, "Select a process subtype for the selected process type");
      }

      if (sSubProcessTypeCode) {
        const oMatchingSubType = await cds.tx(req).run(
          SELECT.one.from(ProcessSubTypes)
            .columns("code")
            .where({ code: sSubProcessTypeCode, processType_code: sProcessTypeCode })
        );

        if (!oMatchingSubType) {
          return req.reject(400, "Selected process subtype does not belong to the selected process type");
        }
      }

    });

    this.before(["CREATE", "UPDATE"], ProcessRequests, async (req) => {
      const aFactoringFields = [
        "paymentCategory_code",
        "businessEntity_code",
        "taskLevelFlow",
        "vendor_ID",
        "remarks"
      ];

      if (!aFactoringFields.some((sField) => Object.prototype.hasOwnProperty.call(req.data, sField))) {
        return;
      }

      let sSubProcessTypeCode = req.data.subProcessType_code;

      if (!sSubProcessTypeCode && req.event === "UPDATE") {
        const sRequestId = this._requestIdFromReq(req);
        const oExisting = sRequestId && await cds.tx(req).run(
          SELECT.one.from(ProcessRequests)
            .columns("subProcessType_code")
            .where({ ID: sRequestId })
        );

        sSubProcessTypeCode = oExisting?.subProcessType_code;
      }

      if (!FTK_FACTORING_SUBTYPES.has(sSubProcessTypeCode)) {
        return req.reject(400, "FTK Factoring fields are only available for the Factoring subprocess");
      }

    });

    this.before("CREATE", ProcessRequests, async (req) => {
      req.data.referenceNumber = await this._nextReferenceNumber(req, ProcessRequests, "REQ");
      const oReservationUser = await this._currentReservationUser(req, Users);

      req.data.priorityConfig_code ??= "MEDIUM";
      const oPriority = await cds.tx(req).run(
        SELECT.one.from(Priorities)
          .columns("code", "name")
          .where({ code: req.data.priorityConfig_code })
      );

      if (!oPriority) {
        return req.reject(400, "Selected priority was not found");
      }

      req.data.priority = oPriority.name || oPriority.code;

      if (req.data.requesterUser_ID) {
        const oRequester = await this._getUser(req, req.data.requesterUser_ID, Users);

        if (!oRequester) {
          return req.reject(400, "Selected requester was not found");
        }

        req.data.requester = this._userDisplayName(oRequester);
        req.data.department ||= oRequester.department;
      } else {
        const oCurrentUser = oReservationUser.user;

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

        this._setProcessorSnapshot(req.data, oProcessor);
      }

      if (req.data.processorTeam_ID) {
        const oTeam = await this._getTeam(req, req.data.processorTeam_ID, Teams);

        if (!oTeam) {
          return req.reject(400, "Selected processor team was not found");
        }

        this._setProcessorTeamSnapshot(req.data, oTeam);
      }

      if (req.data.vendor_ID) {
        const oVendor = await this.master.run(
          SELECT.one.from(Vendors)
            .columns("ID", "vendorCode", "vendorName")
            .where({ ID: req.data.vendor_ID })
        );

        if (!oVendor) {
          return req.reject(400, "Selected vendor was not found");
        }

        this._setVendorSnapshot(req.data, oVendor);
      }

      req.data.status_code ??= PROCESS_STATUS.DRAFT;
      req.data.requester ??= oReservationUser.displayName || req.user?.id || "anonymous";
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
      if (Object.prototype.hasOwnProperty.call(req.data, "priorityConfig_code")) {
        const oPriority = await cds.tx(req).run(
          SELECT.one.from(Priorities)
            .columns("code", "name")
            .where({ code: req.data.priorityConfig_code })
        );

        if (!oPriority) {
          return req.reject(400, "Selected priority was not found");
        }

        req.data.priority = oPriority.name || oPriority.code;
      }

      if (req.data.processorUser_ID) {
        const oProcessor = await this._getUser(req, req.data.processorUser_ID, Users);

        if (!oProcessor) {
          return req.reject(400, "Selected processor was not found");
        }

        this._setProcessorSnapshot(req.data, oProcessor);
      }

      if (req.data.processorTeam_ID) {
        const oTeam = await this._getTeam(req, req.data.processorTeam_ID, Teams);

        if (!oTeam) {
          return req.reject(400, "Selected processor team was not found");
        }

        this._setProcessorTeamSnapshot(req.data, oTeam);
      }

      if (Object.prototype.hasOwnProperty.call(req.data, "vendor_ID")) {
        if (!req.data.vendor_ID) {
          req.data.vendor_ID = null;
          req.data.vendorCode = null;
          req.data.vendorName = null;
        } else {
          const oVendor = await this.master.run(
            SELECT.one.from(Vendors)
              .columns("ID", "vendorCode", "vendorName")
              .where({ ID: req.data.vendor_ID })
          );

          if (!oVendor) {
            return req.reject(400, "Selected vendor was not found");
          }

          this._setVendorSnapshot(req.data, oVendor);
        }
      }
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

        this._setProcessorSnapshot(req.data, oProcessor);
      }

      if (req.data.processorTeam_ID) {
        const oTeam = await this._getTeam(req, req.data.processorTeam_ID, Teams);

        if (!oTeam) {
          return req.reject(400, "Selected processor team was not found");
        }

        this._setTaskProcessorTeamSnapshot(req.data, oTeam);
      }

      if (!req.data.isTeamTask && !req.data.processorUser_ID && !req.data.assignedUser_ID && !req.data.processor && !req.data.assignedTo) {
        const oReservationUser = await this._currentReservationUser(req, Users);
        const oCurrentUser = oReservationUser.user;

        if (oCurrentUser) {
          req.data.processorUser_ID = oCurrentUser.ID;
          this._setProcessorSnapshot(req.data, oCurrentUser);
        } else {
          req.data.processor = oReservationUser.displayName;
          req.data.processorEmail = oReservationUser.email || null;
        }
      }
    });

    this.after("CREATE", ProcessTasks, async (task, req) => {
      if (task.processorTeam_ID) {
        await this._syncTaskTeamMembersFromTeam(req, task.ID, task.processorTeam_ID, ProcessTaskTeamMembers, TeamMembers);
      }
    });

    this.before("CREATE", ProcessTaskTeamMembers, async (req) => {
      if (!req.data.task_ID || !req.data.user_ID) {
        return req.reject(400, "Select a task and a team member");
      }

      const oTask = await this._getTask(req, req.data.task_ID);
      const oUser = await this._getUser(req, req.data.user_ID, Users);

      if (!oTask) {
        return req.reject(400, "Selected task was not found");
      }

      await this._rejectIfRequestLocked(req, oTask.request_ID);

      if (oTask.processorUser_ID || oTask.processorEmail || (!oTask.isTeamTask && oTask.processor)) {
        return req.reject(400, "Team members can only be added to unassigned team tasks");
      }

      if (!oUser) {
        return req.reject(400, "Selected team member was not found");
      }

      const oExisting = await cds.tx(req).run(
        SELECT.one.from(ProcessTaskTeamMembers).where({
          task_ID: req.data.task_ID,
          user_ID: req.data.user_ID
        })
      );

      if (oExisting) {
        return req.reject(409, "This user is already assigned as a team candidate for the task");
      }

      req.data.referenceNumber = await this._nextReferenceNumber(req, ProcessTaskTeamMembers, "TMB");
      req.data.displayName = this._userDisplayName(oUser);
      req.data.email = this._userEmail(oUser);

      await cds.tx(req).run(
        UPDATE(ProcessTasks, req.data.task_ID).set({ isTeamTask: true })
      );
    });

    this.before(["UPDATE", "DELETE"], ProcessTaskTeamMembers, async (req) => {
      const sMemberId = this._requestIdFromReq(req);
      const oMember = sMemberId
        ? await cds.tx(req).run(SELECT.one.from(ProcessTaskTeamMembers).where({ ID: sMemberId }))
        : null;

      if (!oMember) {
        return;
      }

      const oTask = await this._getTask(req, oMember.task_ID);
      await this._rejectIfRequestLocked(req, oTask?.request_ID);
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

      this._setProcessorSnapshot(req.data, oProcessor);
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

    this.before(["CREATE", "UPDATE", "DELETE"], ProcessEmailMessages, (req) => {
      return req.reject(405, "Use the request email action to create or change email interface records");
    });

    this.before(["CREATE", "UPDATE", "DELETE"], ProcessEmailAttachments, (req) => {
      return req.reject(405, "Email attachment interface records are maintained by the request email action");
    });

    this.before("CREATE", ServiceDelegations, async (req) => {
      const oDelegation = req.data;
      const sCurrentUser = req.user?.id || "anonymous";
      const bCreatedOnBehalf = Boolean(
        oDelegation.delegatorUser_ID || oDelegation.delegator && oDelegation.delegator !== sCurrentUser
      );

      if (!oDelegation.delegateUser_ID) {
        return req.reject(400, "Select a delegate from the user list");
      }

      const oDelegate = await this._getUser(req, oDelegation.delegateUser_ID, Users);

      if (!oDelegate) {
        return req.reject(400, "Selected delegate was not found");
      }

      if (bCreatedOnBehalf && !oDelegation.delegatorUser_ID) {
        return req.reject(400, "Select the user on leave from the user list");
      }

      if (oDelegation.delegatorUser_ID) {
        const oDelegator = await this._getUser(req, oDelegation.delegatorUser_ID, Users);

        if (!oDelegator) {
          return req.reject(400, "Selected user on leave was not found");
        }

      } else {
        const oCurrentUser = await this._findUserByPrincipal(req, sCurrentUser, Users);
        oDelegation.delegatorUser_ID ||= oCurrentUser?.ID;
      }

      oDelegation.forwardNotifications ??= true;
      oDelegation.enabled ??= true;
      oDelegation.createdOnBehalf = bCreatedOnBehalf;

      if (bCreatedOnBehalf && !this._isAdministrator(req)) {
        return req.reject(403, "Only an administrator can create a delegation for another user");
      }

      if (!oDelegation.delegatorUser_ID || !oDelegation.delegateUser_ID || !oDelegation.startDate || !oDelegation.endDate) {
        return req.reject(400, "User, delegate, start date, and end date are required");
      }

      if (oDelegation.delegatorUser_ID === oDelegation.delegateUser_ID) {
        return req.reject(400, "A user cannot be assigned as their own delegate");
      }

      if (oDelegation.startDate > oDelegation.endDate) {
        return req.reject(400, "End date must be on or after start date");
      }

      delete oDelegation.delegator;
      delete oDelegation.delegate;
    });

    this.before("READ", ServiceDelegations, async (req) => {
      if (!this._isAdministrator(req)) {
        const oCurrentUser = await this._currentReservationUser(req, Users);
        req.query.where({ delegatorUser_ID: oCurrentUser?.ID || null });
      }
    });

    this.before("UPDATE", ServiceDelegations, (req) => {
      return req.reject(405, "Delete and recreate a delegation to change its details");
    });

    this.before("DELETE", ServiceDelegations, async (req) => {
      if (this._isAdministrator(req)) {
        return;
      }

      const oDelegation = await this.master.run(
        SELECT.one.from(Delegations).where({ ID: req.data.ID || req.params?.[0]?.ID })
      );
      const oCurrentUser = await this._currentReservationUser(req, Users);

      if (!oDelegation || oDelegation.delegator_ID !== oCurrentUser?.ID) {
        return req.reject(403, "Only the delegation owner or an administrator can delete this assignment");
      }
    });

    this.on(["READ", "CREATE", "UPDATE", "DELETE"], ServiceDelegations, (req) => {
      return this.master.run(req.query);
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
      return this._approveTaskOnly(req, req.data.taskId, req.data.remarks, Users);
    });

    this.on("analyzeGuidedTaskCompletion", async (req) => {
      const task = await this._getTask(req, req.data.taskId);

      if (!task) {
        return req.reject(404, `Task ${req.data.taskId} was not found`);
      }

      return this._analyzeGuidedStepCompletion(req, task.request_ID, task.stepNo, Users);
    });

    this.on("completeGuidedTask", async (req) => {
      const task = await this._getTask(req, req.data.taskId);

      if (!task) {
        return req.reject(404, `Task ${req.data.taskId} was not found`);
      }

      return this._completeGuidedStep(
        req,
        task.request_ID,
        task.stepNo,
        req.data.remarks,
        req.data.progressionMode || "continue",
        Users
      );
    });

    this.on("analyzeGuidedStepCompletion", async (req) => {
      return this._analyzeGuidedStepCompletion(req, req.data.requestId, req.data.stepNo, Users);
    });

    this.on("completeGuidedStep", async (req) => {
      return this._completeGuidedStep(
        req,
        req.data.requestId,
        req.data.stepNo,
        req.data.remarks,
        req.data.progressionMode || "continue",
        Users
      );
    });

    this.on("getGuidedProcessTasks", async (req) => {
      const requestId = req.data.requestId;
      const request = await this._getRequest(req, requestId);

      if (!request) {
        return req.reject(404, "Selected request was not found");
      }

      const oReservationUser = await this._currentReservationUser(req, Users);

      if (request.reservedBy && !this._isReservedByCurrentUser(request, oReservationUser)) {
        return req.reject(403, `Request is reserved by ${request.reservedBy} and cannot be accessed by another user`);
      }

      return cds.tx(req).run(
        SELECT.from(this._dbProcessTasksEntity())
          .columns("ID", "stepNo", "status_code", "isMandatory")
          .where({ request_ID: requestId })
      );
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
      const { taskId, remarks, targetStepNo } = req.data;
      const task = await this._getTask(req, taskId);

      if (!task) {
        return req.reject(404, `Task ${taskId} was not found`);
      }

      await this._rejectIfTaskAssignedToAnotherUser(req, task, Users);

      const request = await this._getRequest(req, task.request_ID);

      if (this._isLockedRequest(request)) {
        return this._rejectLockedRequest(req);
      }

      const steps = await this._getSteps(req, request.processType_code);
      const taskStepNo = Number(task.stepNo || 0);
      const sendBackStepNo = Number(targetStepNo || 0);

      if (!sendBackStepNo || sendBackStepNo >= taskStepNo) {
        return req.reject(400, `Select a guided step before step ${taskStepNo} to send back this task`);
      }

      const sendBackStep = this._findStepByNo(steps, sendBackStepNo);

      if (!sendBackStep) {
        return req.reject(400, `Guided step ${sendBackStepNo} is not configured for this request type`);
      }

      await cds.tx(req).run(
        UPDATE(ProcessTasks, taskId).set({
          status_code: TASK_STATUS.SENT_BACK,
          decision: "SENT_BACK",
          remarks,
          completedAt: this._now()
        })
      );

      await this._createTask(req, task.request_ID, sendBackStep, { request });

      await cds.tx(req).run(
        UPDATE(ProcessRequests, task.request_ID).set({
          status_code: PROCESS_STATUS.SENT_BACK,
          currentStep: sendBackStep.stepNo,
          dueDate: this._calculateDueDate(sendBackStep.slaDays),
          completedAt: null
        })
      );

      await this._writeHistory(req, {
        requestId: task.request_ID,
        stepNo: sendBackStep.stepNo,
        action: "SENT_BACK",
        actor: req.user?.id,
        oldStatus: request.status_code,
        newStatus: PROCESS_STATUS.SENT_BACK,
        remarks: sendBackStep.stepNo === task.stepNo
          ? remarks
          : `${remarks || ""} Sent back from step ${task.stepNo || ""} to step ${sendBackStep.stepNo}.`.trim()
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
      const sProcessorEmail = oReservationUser.email || null;

      await cds.tx(req).run(
        UPDATE(ProcessRequests, requestId).set({
          reservedByUser_ID: oCurrentUser?.ID || null,
          reservedBy: sReservedBy,
          reservedAt: this._now(),
          processorUser_ID: oCurrentUser?.ID || null,
          processor: sReservedBy,
          processorEmail: sProcessorEmail
        })
      );

      await cds.tx(req).run(
        UPDATE(ProcessTasks)
          .set({
            processorUser_ID: oCurrentUser?.ID || null,
            processor: sReservedBy,
            processorEmail: sProcessorEmail
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
        const incompleteStep = await this._findIncompleteGuidedStep(req, requestId, steps, {
          includeClosingSteps: true
        });

        if (incompleteStep) {
          return req.reject(400, `Complete step ${incompleteStep.stepNo} - ${incompleteStep.stepName} and approve all its tasks before completing this request`);
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
      const sProcessorEmail = this._userEmail(oProcessor);

      if (request.processorUser_ID === processorUserId && request.processor === sProcessor && request.processorEmail === sProcessorEmail) {
        return true;
      }

      await cds.tx(req).run(
        UPDATE(ProcessRequests, requestId).set({
          processorUser_ID: processorUserId,
          processorTeam_ID: null,
          processorTeamName: null,
          processor: sProcessor,
          processorEmail: sProcessorEmail
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

    this.on("assignRequestTeam", async (req) => {
      const { requestId, teamId } = req.data;
      const request = await this._getRequest(req, requestId);

      if (!request) {
        return req.reject(404, `Process request ${requestId} was not found`);
      }

      await this._rejectIfRequestReservedByAnotherUser(req, request, Users);

      if (this._isLockedRequest(request)) {
        return this._rejectLockedRequest(req);
      }

      const oTeam = await this._getTeam(req, teamId, Teams);

      if (!oTeam) {
        return req.reject(400, "Select an active processor team");
      }

      const oPayload = {};
      this._setProcessorTeamSnapshot(oPayload, oTeam);
      oPayload.processorUser_ID = null;
      oPayload.processorEmail = null;

      await cds.tx(req).run(
        UPDATE(ProcessRequests, requestId).set(oPayload)
      );

      await this._writeHistory(req, {
        requestId,
        stepNo: request.currentStep || 0,
        action: "TEAM_ASSIGNED",
        actor: req.user?.id,
        oldStatus: request.status_code,
        newStatus: request.status_code,
        remarks: `Request team assigned: ${oTeam.name}`
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
      const sProcessorEmail = this._userEmail(oProcessor);

      if (task.processorUser_ID === processorUserId && task.processor === sProcessor && task.processorEmail === sProcessorEmail) {
        return true;
      }

      await cds.tx(req).run(
        UPDATE(ProcessTasks, taskId).set({
          processorUser_ID: processorUserId,
          processorTeam_ID: null,
          processorTeamName: null,
          isTeamTask: false,
          processor: sProcessor,
          processorEmail: sProcessorEmail
        })
      );
      await cds.tx(req).run(
        DELETE.from(ProcessTaskTeamMembers).where({ task_ID: taskId })
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

    this.on("assignTaskTeam", async (req) => {
      const { taskId, teamId } = req.data;
      const task = await this._getTask(req, taskId);

      if (!task) {
        return req.reject(404, `Task ${taskId} was not found`);
      }

      await this._rejectIfRequestLocked(req, task.request_ID);
      await this._rejectIfRequestReservedByAnotherUser(req, await this._getRequest(req, task.request_ID), Users);

      const oTeam = await this._getTeam(req, teamId, Teams);

      if (!oTeam) {
        return req.reject(400, "Select an active task team");
      }

      const oPayload = {
        isTeamTask: true,
        assignedUser_ID: null,
        processorUser_ID: null,
        assignedTo: null,
        processor: null,
        processorEmail: null
      };
      this._setTaskProcessorTeamSnapshot(oPayload, oTeam);

      await cds.tx(req).run(
        UPDATE(ProcessTasks, taskId).set(oPayload)
      );
      await this._syncTaskTeamMembersFromTeam(req, taskId, teamId, ProcessTaskTeamMembers, TeamMembers);

      await this._writeHistory(req, {
        requestId: task.request_ID,
        stepNo: task.stepNo,
        action: "TASK_TEAM_ASSIGNED",
        actor: req.user?.id,
        oldStatus: task.status_code,
        newStatus: task.status_code,
        remarks: `Task team assigned: ${oTeam.name}`
      });

      return true;
    });

    this.on("assignTeamTaskToMe", async (req) => {
      const { taskId } = req.data;
      const task = await this._getTask(req, taskId);

      if (!task) {
        return req.reject(404, `Task ${taskId} was not found`);
      }

      const request = await this._getRequest(req, task.request_ID);

      if (this._isLockedRequest(request)) {
        return this._rejectLockedRequest(req);
      }

      const oReservationUser = await this._currentReservationUser(req, Users);
      const oCurrentUser = oReservationUser.user;

      if (!oCurrentUser) {
        return req.reject(403, "Your logged-in user must exist in the user table before a team task can be assigned");
      }

      if (task.processorUser_ID || task.processorEmail || (!task.isTeamTask && task.processor)) {
        if (this._isTaskAssignedToCurrentUser(task, oReservationUser)) {
          return true;
        }

        return req.reject(409, "This team task is already assigned to another user");
      }

      const bVisibleTeamTask = await this._isTeamTaskVisibleForUser(req, taskId, oReservationUser, ProcessTaskTeamMembers);

      if (!bVisibleTeamTask) {
        return req.reject(403, "This team task is not available for your team membership");
      }

      await cds.tx(req).run(
        UPDATE(ProcessTasks, taskId).set({
          assignedUser_ID: oCurrentUser.ID,
          processorUser_ID: oCurrentUser.ID,
          assignedTo: this._userDisplayName(oCurrentUser),
          processor: this._userDisplayName(oCurrentUser),
          processorEmail: this._userEmail(oCurrentUser)
        })
      );

      await this._writeHistory(req, {
        requestId: task.request_ID,
        stepNo: task.stepNo,
        action: "TEAM_TASK_ASSIGNED",
        actor: req.user?.id,
        oldStatus: task.status_code,
        newStatus: task.status_code,
        remarks: `Team task assigned to ${this._userDisplayName(oCurrentUser)}`
      });

      return true;
    });

    this.on("getCurrentUserDetails", async (req) => {
      const oReservationUser = await this._currentReservationUser(req, Users);
      const oUser = oReservationUser.user;

      return {
        ID: oUser?.ID || null,
        displayName: oUser ? this._userDisplayName(oUser) : oReservationUser.displayName,
        email: oUser ? this._userEmail(oUser) : oReservationUser.email,
        userPrincipalName: oUser?.userPrincipalName || "",
        department: oUser?.department || ""
      };
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

      const oProcessor = await this.master.run(
        SELECT.one.from(Users).where({ ID: task.processorUser_ID, isActive: true })
      );

      if (!oProcessor?.email) {
        return req.reject(400, "Please maintain an email first for the processor.");
      }

      return this._resolveDelegatedRecipient(req, oProcessor.email, Delegations);
    });

    this.on("resolveTaskTeamNotificationRecipients", async (req) => {
      const task = await this._getTask(req, req.data.taskId);

      if (!task) {
        return req.reject(404, `Task ${req.data.taskId} was not found`);
      }

      const aMembers = await cds.tx(req).run(
        SELECT.from(ProcessTaskTeamMembers).where({ task_ID: req.data.taskId })
      );

      const aEmails = [...new Set(aMembers
        .map((oMember) => oMember.email)
        .filter(Boolean))];

      if (!aEmails.length) {
        return req.reject(400, "Please maintain at least one team member email first.");
      }

      const aRecipients = [];
      let iDelegatedCount = 0;

      for (const sEmail of aEmails) {
        const oResolved = await this._resolveDelegatedRecipient(req, sEmail, Delegations);
        aRecipients.push(oResolved.recipient);

        if (oResolved.delegated) {
          iDelegatedCount += 1;
        }
      }

      await cds.tx(req).run(
        UPDATE(ProcessTaskTeamMembers)
          .set({ notifiedAt: this._now() })
          .where({ task_ID: req.data.taskId })
      );

      return {
        recipients: [...new Set(aRecipients)].join(","),
        recipientCount: aRecipients.length,
        delegatedCount: iDelegatedCount
      };
    });

    this.on("resolveInvolvedPartyNotificationRecipient", async (req) => {
      const oParty = await cds.tx(req).run(
        SELECT.one.from(ProcessInvolvedParties).where({ ID: req.data.partyId })
      );

      if (!oParty) {
        return req.reject(404, `Involved party ${req.data.partyId} was not found`);
      }

      const oUser = await this.master.run(
        SELECT.one.from(Users).where({ ID: oParty.user_ID, isActive: true })
      );

      if (!oUser?.email) {
        return req.reject(400, "Please maintain an email first for the involved party.");
      }

      return this._resolveDelegatedRecipient(req, oUser.email, Delegations);
    });

    this.on("sendRequestEmail", async (req) => {
      const { requestId, toRecipients, ccRecipients, subject, body, attachmentIds } = req.data;
      const request = await this._getRequest(req, requestId);

      if (!request) {
        return req.reject(404, `Process request ${requestId} was not found`);
      }

      await this._rejectIfRequestReservedByAnotherUser(req, request, Users);

      const aToRecipients = this._parseEmailRecipients(toRecipients);
      const aCcRecipients = this._parseEmailRecipients(ccRecipients);

      this._rejectInvalidEmailRecipients(req, aToRecipients, "To");
      this._rejectInvalidEmailRecipients(req, aCcRecipients, "CC");

      if (!aToRecipients.length) {
        return req.reject(400, "At least one To recipient is required");
      }

      if (!body) {
        return req.reject(400, "Email body is required");
      }

      const aAttachmentIds = this._parseAttachmentIds(attachmentIds);
      const aAttachments = await this._getEmailAttachmentRows(req, requestId, aAttachmentIds, ProcessAttachments);
      const sEmailId = cds.utils.uuid();
      const sReferenceNumber = await this._nextReferenceNumber(req, ProcessEmailMessages, "EML");
      const sStatus = "QUEUED";

      await cds.tx(req).run(
        INSERT.into(ProcessEmailMessages).entries({
          ID: sEmailId,
          referenceNumber: sReferenceNumber,
          request_ID: requestId,
          toRecipients: aToRecipients.join(", "),
          ccRecipients: aCcRecipients.join(", "),
          subject: subject || `Flowmate request ${request.referenceNumber || ""}`.trim(),
          body,
          status: sStatus,
          interfaceSystem: "EMAIL",
          queuedAt: this._now()
        })
      );

      if (aAttachments.length) {
        await cds.tx(req).run(
          INSERT.into(ProcessEmailAttachments).entries(aAttachments.map((oAttachment) => ({
            ID: cds.utils.uuid(),
            referenceNumber: oAttachment.referenceNumber || null,
            emailMessage_ID: sEmailId,
            attachment_ID: oAttachment.ID,
            filename: oAttachment.filename,
            mimeType: oAttachment.mimeType
          })))
        );
      }

      await this._writeHistory(req, {
        requestId,
        stepNo: request.currentStep || 0,
        action: "EMAIL_QUEUED",
        actor: req.user?.id,
        oldStatus: request.status_code,
        newStatus: request.status_code,
        remarks: `Email queued to ${aToRecipients.join(", ")} with ${aAttachments.length} attachment(s)`
      });

      return {
        emailId: sEmailId,
        status: sStatus,
        attachmentCount: aAttachments.length
      };
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

    this.on("getMyTaskCount", async (req) => {
      const oReservationUser = await this._currentReservationUser(req, Users);
      const aAssignmentPredicates = this._taskAssignmentPredicates(oReservationUser);

      if (!aAssignmentPredicates.length) {
        return 0;
      }

      const oTaskCount = await cds.tx(req).run(
        SELECT.one.from(ProcessTasks)
          .columns("count(1) as count")
          .where({ xpr: aAssignmentPredicates })
      );

      return Number(oTaskCount?.count || oTaskCount?.COUNT || 0);
    });

    this.on("getMyTeamTaskCount", async (req) => {
      const oReservationUser = await this._currentReservationUser(req, Users);
      const qTeamTasks = this._teamTaskMembershipQuery(oReservationUser, ProcessTaskTeamMembers);

      if (!qTeamTasks) {
        return 0;
      }

      const oTaskCount = await cds.tx(req).run(
        SELECT.one.from(ProcessTasks)
          .columns("count(1) as count")
          .where({ isTeamTask: true })
          .where([
            { ref: ["processorUser_ID"] }, "is", "null",
            "and", { ref: ["processorEmail"] }, "is", "null",
            "and", { ref: ["ID"] }, "in", qTeamTasks
          ])
      );

      return Number(oTaskCount?.count || oTaskCount?.COUNT || 0);
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

  async _rejectIfRequestReservedByAnotherUser(req, request, Users = this.masterEntities.Users) {
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

  async _filterByVisibleEmails(req, Users, ProcessEmailMessages = this.entities.ProcessEmailMessages) {
    const oReservationUser = await this._currentReservationUser(req, Users);
    const qVisibleRequests = SELECT.from(this.entities.ProcessRequests).columns("ID");
    const qVisibleEmails = SELECT.from(ProcessEmailMessages).columns("ID");

    this._applyVisibleRequestsWhere(qVisibleRequests, oReservationUser);
    qVisibleEmails.where([
      { ref: ["request_ID"] },
      "in",
      qVisibleRequests
    ]);
    req.query.where([
      { ref: ["emailMessage_ID"] },
      "in",
      qVisibleEmails
    ]);
  }

  async _filterByAssignedTasks(req, Users) {
    const oReservationUser = await this._currentReservationUser(req, Users);
    const aPredicates = this._taskAssignmentPredicates(oReservationUser);

    if (!aPredicates.length) {
      req.query.where(this._alwaysFalsePredicate());
      return;
    }

    req.query.where({ xpr: aPredicates });
  }

  async _filterByTeamTasks(req, Users, ProcessTaskTeamMembers = this.entities.ProcessTaskTeamMembers) {
    const oReservationUser = await this._currentReservationUser(req, Users);
    const qTeamTasks = this._teamTaskMembershipQuery(oReservationUser, ProcessTaskTeamMembers);

    if (!qTeamTasks) {
      req.query.where(this._alwaysFalsePredicate());
      return;
    }

    req.query
      .where({ isTeamTask: true })
      .where([
        { ref: ["processorUser_ID"] }, "is", "null",
        "and", { ref: ["processorEmail"] }, "is", "null",
        "and", { ref: ["ID"] }, "in", qTeamTasks
      ]);
  }

  async _filterByVisibleTaskMembers(req, Users, ProcessTaskTeamMembers = this.entities.ProcessTaskTeamMembers) {
    const qVisibleTasks = SELECT.from(this.entities.RequestDetailTasks).columns("ID");

    await this._filterByVisibleRequests({ query: qVisibleTasks }, Users, "request_ID");

    req.query.where([
      { ref: ["task_ID"] },
      "in",
      qVisibleTasks
    ]);

    // Team-member row visibility follows the parent task/request visibility.
    // The My Team Tasks queue is filtered separately by explicit user membership.
  }

  _teamTaskMembershipQuery(reservationUser, ProcessTaskTeamMembers = this.entities.ProcessTaskTeamMembers) {
    const qTeamTasks = SELECT.from(ProcessTaskTeamMembers).columns("task_ID");
    const aPredicates = this._teamTaskMembershipPredicates(reservationUser);

    if (!aPredicates.length) {
      return null;
    }

    qTeamTasks.where({ xpr: aPredicates });
    return qTeamTasks;
  }

  async _isTeamTaskVisibleForUser(req, taskId, reservationUser, ProcessTaskTeamMembers = this.entities.ProcessTaskTeamMembers) {
    const aPredicates = this._teamTaskMembershipPredicates(reservationUser);

    if (!aPredicates.length) {
      return false;
    }

    const oMember = await cds.tx(req).run(
      SELECT.one.from(ProcessTaskTeamMembers)
        .columns("ID")
        .where({ task_ID: taskId })
        .where({ xpr: aPredicates })
    );

    return Boolean(oMember);
  }

  _teamTaskMembershipPredicates(reservationUser) {
    const aPredicates = [];

    if (reservationUser.user?.ID) {
      this._addStringEqualsPredicate(aPredicates, "user_ID", reservationUser.user.ID);
    }

    return aPredicates;
  }

  _taskAssignmentPredicates(reservationUser) {
    const aPredicates = [];

      if (reservationUser.email) {
      this._addStringEqualsPredicate(aPredicates, "processorEmail", reservationUser.email);

      if (reservationUser.user?.ID) {
        this._addStringEqualsPredicate(aPredicates, "processorUser_ID", reservationUser.user.ID);
      }

      return aPredicates;
    }

    this._addStringEqualsPredicate(aPredicates, "processor", reservationUser.principal);

    return aPredicates;
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
        request.tasks = request.tasks.filter((task) => this._isTaskVisibleForRequest(task, request, reservationUser));
        this._clearUnassignedTeamTaskProcessor(request.tasks);
        return;
      }

      if (Array.isArray(request.tasks.results)) {
        request.tasks.results = request.tasks.results.filter((task) => this._isTaskVisibleForRequest(task, request, reservationUser));
        this._clearUnassignedTeamTaskProcessor(request.tasks.results);
      }
    });
  }

  _clearUnassignedTeamTaskProcessor(data) {
    const aTasks = Array.isArray(data) ? data : [data];

    aTasks.filter(Boolean).forEach((task) => {
      if (task.isTeamTask && !task.processorUser_ID && !task.processorEmail) {
        task.processor = null;
      }
    });
  }

  async _rejectIfTaskAssignedToAnotherUser(req, task, Users = this.masterEntities.Users) {
    if (!task || this._isTaskAssignedToCurrentUser(task, await this._currentReservationUser(req, Users))) {
      return;
    }

    return req.reject(403, "Task is assigned to another user and cannot be accessed or modified");
  }

  async _currentReservationUser(req, Users = this.masterEntities.Users) {
    const sPrincipal = req.user?.id || "anonymous";
    const sEmail = this._emailFromAuthenticatedUser(req.user);
    const oUser = await this._findUserByPrincipal(req, sEmail || sPrincipal, Users);
    const sResolvedEmail = sEmail || oUser?.email || oUser?.userPrincipalName || (this._looksLikeEmail(sPrincipal) ? sPrincipal : "");

    return {
      user: oUser,
      principal: sPrincipal,
      email: sResolvedEmail,
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
    if (task.processorEmail) {
      return Boolean(reservationUser.email && task.processorEmail === reservationUser.email);
    }

    if (task.processorUser_ID || task.assignedUser_ID) {
      return Boolean(
        reservationUser.user?.ID &&
        (task.processorUser_ID === reservationUser.user.ID || task.assignedUser_ID === reservationUser.user.ID)
      );
    }

    return [task.processor, task.assignedTo].some((sOwner) =>
      sOwner === reservationUser.email ||
      sOwner === reservationUser.displayName ||
      sOwner === reservationUser.principal
    );
  }

  _isTaskVisibleForRequest(task, request, reservationUser) {
    if (this._isTaskAssignedToCurrentUser(task, reservationUser)) {
      return true;
    }

    const bLegacyRequesterTask = !task.processorUser_ID
      && !task.assignedUser_ID
      && !task.processor
      && /requester/i.test(task.assignedTo || task.role || "");

    if (!bLegacyRequesterTask) {
      return false;
    }

    if (request.requesterUser_ID && reservationUser.user?.ID) {
      return request.requesterUser_ID === reservationUser.user.ID;
    }

    return request.requester === reservationUser.displayName || request.requester === reservationUser.principal;
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
    return this.master.run(SELECT.one.from(Users).where({ ID: userId, isActive: true }));
  }

  async _validateMaintainedUser(req, user, Users = this.masterEntities.Users) {
    if (!user.displayName || !user.email || !user.userPrincipalName) {
      return req.reject(400, "Name, email, and user principal name are required");
    }

    if (user.manager_ID && user.manager_ID === user.ID) {
      return req.reject(400, "A user cannot be assigned as their own manager");
    }

    if (user.manager_ID) {
      const oManager = await this.master.run(
        SELECT.one.from(Users).columns("ID").where({ ID: user.manager_ID, isActive: true })
      );

      if (!oManager) {
        return req.reject(400, "Select an active user as the manager");
      }
    }

    const aUsers = await this.master.run(SELECT.from(Users));
    const sEmail = user.email.toLowerCase();
    const sPrincipal = user.userPrincipalName.toLowerCase();
    const bDuplicate = aUsers.some((oOther) =>
      oOther.ID !== user.ID &&
      (oOther.email?.toLowerCase() === sEmail ||
        oOther.userPrincipalName?.toLowerCase() === sPrincipal ||
        user.azureObjectId && oOther.azureObjectId === user.azureObjectId)
    );

    if (bDuplicate) {
      return req.reject(409, "A user already exists with the same email, principal name, or Azure object ID");
    }
  }

  async _getTeam(req, teamId, Teams = this.masterEntities.Teams) {
    return this.master.run(SELECT.one.from(Teams).where({ ID: teamId, isActive: true }));
  }

  async _syncTaskTeamMembersFromTeam(req, taskId, teamId, ProcessTaskTeamMembers = this.entities.ProcessTaskTeamMembers, TeamMembers = this.masterEntities.TeamMembers) {
    const aTeamMembers = await this.master.run(
      SELECT.from(TeamMembers).where({ team_ID: teamId, isActive: true })
    );

    if (!aTeamMembers.length) {
      return;
    }

    for (const oMember of aTeamMembers) {
      const oExisting = await cds.tx(req).run(
        SELECT.one.from(ProcessTaskTeamMembers).where({
          task_ID: taskId,
          user_ID: oMember.user_ID
        })
      );

      if (oExisting) {
        continue;
      }

      await cds.tx(req).run(
        INSERT.into(ProcessTaskTeamMembers).entries({
          ID: cds.utils.uuid(),
          referenceNumber: await this._nextReferenceNumber(req, ProcessTaskTeamMembers, "TMB"),
          task_ID: taskId,
          user_ID: oMember.user_ID,
          displayName: oMember.displayName,
          email: oMember.email
        })
      );
    }
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

    const sPrincipal = String(principal).trim().toLowerCase();
    const aUsers = await this.master.run(
      SELECT.from(Users).where({ isActive: true })
    );
    return aUsers.find((oUser) =>
      ["email", "userPrincipalName", "azureObjectId"].some((sProperty) =>
        String(oUser[sProperty] || "").trim().toLowerCase() === sPrincipal
      )
    ) || null;
  }

  _queryOwner(req) {
    return this._emailFromAuthenticatedUser(req.user) || req.user?.id || "anonymous";
  }

  _parseEmailRecipients(value) {
    return [...new Set(String(value || "")
      .split(/[;,\n]+/)
      .map((sRecipient) => sRecipient.trim())
      .filter(Boolean))];
  }

  _rejectInvalidEmailRecipients(req, recipients, label) {
    const sInvalidRecipient = recipients.find((sRecipient) => !this._looksLikeEmail(sRecipient));

    if (sInvalidRecipient) {
      return req.reject(400, `${label} contains an invalid email address: ${sInvalidRecipient}`);
    }
  }

  _parseAttachmentIds(value) {
    if (value == null || value === "") {
      return null;
    }

    try {
      const vParsed = JSON.parse(value);

      if (Array.isArray(vParsed)) {
        return [...new Set(vParsed.map((sId) => String(sId || "").trim()).filter(Boolean))];
      }
    } catch (oError) {
      // Fall back to comma-separated IDs.
    }

    return [...new Set(String(value)
      .split(/[;,\n]+/)
      .map((sId) => sId.trim())
      .filter(Boolean))];
  }

  async _getEmailAttachmentRows(req, requestId, attachmentIds, ProcessAttachments = this.entities.ProcessAttachments) {
    const aAttachments = await cds.tx(req).run(
      SELECT.from(ProcessAttachments)
        .columns("ID", "referenceNumber", "filename", "mimeType", "status")
        .where({ request_ID: requestId })
    );

    if (attachmentIds === null) {
      return aAttachments;
    }

    const mAttachments = new Map(aAttachments.map((oAttachment) => [oAttachment.ID, oAttachment]));
    const sMissingAttachmentId = attachmentIds.find((sAttachmentId) => !mAttachments.has(sAttachmentId));

    if (sMissingAttachmentId) {
      return req.reject(400, `Attachment ${sMissingAttachmentId} does not belong to this request`);
    }

    return attachmentIds.map((sAttachmentId) => mAttachments.get(sAttachmentId));
  }

  async _rejectIfRequestFilterQueryOwnedByAnotherUser(req, RequestFilterQueries = this.entities.RequestFilterQueries) {
    const sQueryId = req.params?.[0]?.ID || req.data?.ID;

    if (!sQueryId) {
      return req.reject(400, "Filter query ID is required");
    }

    const oQuery = await cds.tx(req).run(SELECT.one.from(RequestFilterQueries).where({ ID: sQueryId }));

    if (!oQuery) {
      return req.reject(404, "Filter query not found");
    }

    if (oQuery.owner !== this._queryOwner(req)) {
      return req.reject(403, "You can only maintain your own filter queries");
    }
  }

  _emailFromAuthenticatedUser(user) {
    const vEmail = user?.attr?.email || user?.attr?.mail || user?.attr?.user_name;
    const sEmail = Array.isArray(vEmail) ? vEmail[0] : vEmail;

    if (this._looksLikeEmail(sEmail)) {
      return sEmail;
    }

    return this._looksLikeEmail(user?.id) ? user.id : "";
  }

  _looksLikeEmail(value) {
    return typeof value === "string" && value.includes("@");
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

  _userEmail(user) {
    return user.email || user.userPrincipalName || "";
  }

  _setProcessorSnapshot(target, user) {
    target.processor = this._userDisplayName(user);
    target.processorEmail = this._userEmail(user);
  }

  _setProcessorTeamSnapshot(target, team) {
    target.processorTeamName = team.name || team.teamCode;
    target.processor = team.name || team.teamCode;
    target.processorEmail = null;
  }

  _setVendorSnapshot(target, vendor) {
    target.vendorCode = vendor.vendorCode;
    target.vendorName = vendor.vendorName;
  }

  _setTaskProcessorTeamSnapshot(target, team) {
    target.processorTeamName = team.name || team.teamCode;
    target.processor = null;
    target.processorEmail = null;
    target.processorUser_ID = null;
    target.assignedUser_ID = null;
    target.assignedTo = null;
    target.isTeamTask = true;
  }

  _setTeamMemberSnapshot(target, user) {
    target.displayName = this._userDisplayName(user);
    target.email = this._userEmail(user);
  }

  _getConfigCacheTtlMs() {
    const iConfiguredTtl = Number(process.env.FLOWMATE_CONFIG_CACHE_TTL_MS);

    if (Number.isFinite(iConfiguredTtl) && iConfiguredTtl >= 0) {
      return iConfiguredTtl;
    }

    return DEFAULT_CONFIG_CACHE_TTL_MS;
  }

  _configCacheKey(...aParts) {
    return aParts.map((vPart) => String(vPart || "")).join("::");
  }

  _entityCacheName(entity) {
    return entity?.name || entity?.["@cds.persistence.name"] || String(entity);
  }

  _getConfigCache(sKey) {
    if (!this._configCacheTtlMs || !this._configCache?.has(sKey)) {
      return undefined;
    }

    const oEntry = this._configCache.get(sKey);

    if (oEntry.expiresAt <= Date.now()) {
      this._configCache.delete(sKey);
      return undefined;
    }

    return oEntry.value;
  }

  _setConfigCache(sKey, vValue) {
    if (!this._configCacheTtlMs) {
      return;
    }

    this._configCache.set(sKey, {
      value: vValue,
      expiresAt: Date.now() + this._configCacheTtlMs
    });
  }

  _clearConfigCache() {
    this._configCache?.clear();
  }

  async _isConfiguredStatus(req, StatusEntity, statusCode) {
    if (!statusCode) {
      return false;
    }

    const sCacheKey = this._configCacheKey("status", this._entityCacheName(StatusEntity), statusCode);
    const vCached = this._getConfigCache(sCacheKey);

    if (vCached !== undefined) {
      return vCached;
    }

    const bExists = Boolean(await cds.tx(req).run(
      SELECT.one.from(StatusEntity).where({ code: statusCode })
    ));

    this._setConfigCache(sCacheKey, bExists);

    return bExists;
  }

  async _resolveDelegatedRecipient(req, originalRecipient, Delegations) {
    const sToday = new Date().toISOString().slice(0, 10);
    const oDelegator = await this._findUserByPrincipal(
      req,
      originalRecipient,
      this.masterEntities.Users
    );
    if (!oDelegator) {
      return {
        originalRecipient,
        recipient: originalRecipient,
        delegated: false,
        delegationId: null
      };
    }
    const oDelegation = await this.master.run(
      SELECT.one.from(Delegations).where({
        delegator_ID: oDelegator.ID,
        enabled: true,
        forwardNotifications: true,
        startDate: { "<=": sToday },
        endDate: { ">=": sToday }
      })
    );
    const oDelegate = oDelegation?.delegate_ID
      ? await this._getUser(req, oDelegation.delegate_ID, this.masterEntities.Users)
      : null;

    return {
      originalRecipient,
      recipient: oDelegate?.email || originalRecipient,
      delegated: Boolean(oDelegation),
      delegationId: oDelegation?.ID || null
    };
  }

  _isAdministrator(req) {
    return Boolean(req.user?.is("Admin") || req.user?.is("admin"));
  }

  _canProvisionUsers(req) {
    return Boolean(this._isAdministrator(req) || req.user?.is("UserProvisioning"));
  }

  _canProvisionVendors(req) {
    return Boolean(this._isAdministrator(req) || req.user?.is("VendorProvisioning"));
  }

  _canProvisionPaymentCategories(req){
    return Boolean(this._isAdministrator(req) || req.user?.is("PaymentCategoryProvisioning"));
  }

  async _getTaskCompletionContext(req, taskId, Users = this.masterEntities.Users) {
    const task = await this._getTask(req, taskId);

    if (!task) {
      return req.reject(404, `Task ${taskId} was not found`);
    }

    await this._rejectIfTaskAssignedToAnotherUser(req, task, Users);

    const request = await this._getRequest(req, task.request_ID);

    if (this._isLockedRequest(request)) {
      return this._rejectLockedRequest(req);
    }

    const steps = await this._getSteps(req, request.processType_code);
    const currentStep = this._findStepByNo(steps, task.stepNo);

    return {
      task,
      request,
      steps,
      currentStep
    };
  }

  async _approveTaskOnly(req, taskId, remarks, Users = this.masterEntities.Users) {
    const { task, request } = await this._getTaskCompletionContext(req, taskId, Users);
    const oBlockingError = this._getTaskProgressionError(task);

    if (oBlockingError) {
      return req.reject(400, oBlockingError);
    }

    const oldStatus = request.status_code || PROCESS_STATUS.IN_PROGRESS;

    await cds.tx(req).run(
      UPDATE(this.entities.ProcessTasks, taskId).set({
        status_code: TASK_STATUS.APPROVED,
        decision: "APPROVED",
        remarks,
        completedAt: this._now()
      })
    );

    await this._writeHistory(req, {
      requestId: task.request_ID,
      stepNo: task.stepNo,
      action: "APPROVED",
      actor: req.user?.id,
      oldStatus,
      newStatus: oldStatus,
      remarks
    });

    return true;
  }

  async _getStepCompletionContext(req, requestId, stepNo, Users = this.masterEntities.Users) {
    const request = await this._getRequest(req, requestId);

    if (!request) {
      return req.reject(404, `Request ${requestId} was not found`);
    }

    if (!request.reservedBy) {
      return req.reject(400, "Reserve the request before completing a guided step");
    }

    await this._rejectIfRequestReservedByAnotherUser(req, request, Users);

    if (this._isLockedRequest(request)) {
      return this._rejectLockedRequest(req);
    }

    const steps = await this._getSteps(req, request.processType_code);
    const currentStep = this._findStepByNo(steps, stepNo);

    if (!currentStep) {
      return req.reject(400, `Guided step ${stepNo} is not configured for this request type`);
    }

    if (Number(request.currentStep || 0) !== Number(currentStep.stepNo || 0)) {
      return req.reject(400, `Complete the current guided step ${request.currentStep} before processing step ${currentStep.stepNo}`);
    }

    return {
      request,
      steps,
      currentStep
    };
  }

  async _analyzeGuidedStepCompletion(req, requestId, stepNo, Users = this.masterEntities.Users) {
    const { steps, currentStep } = await this._getStepCompletionContext(req, requestId, stepNo, Users);
    await this._rejectUnlessGuidedStepCanComplete(req, requestId, steps, currentStep);

    return this._guidedCompletionChoice(req, requestId, steps, currentStep);
  }

  async _completeGuidedStep(req, requestId, stepNo, remarks, progressionMode = "continue", Users = this.masterEntities.Users) {
    const { request, steps, currentStep } = await this._getStepCompletionContext(req, requestId, stepNo, Users);

    await this._rejectUnlessGuidedStepCanComplete(req, requestId, steps, currentStep);

    return this._advanceGuidedStep(req, requestId, request, steps, currentStep, remarks, progressionMode, {
      action: "STEP_COMPLETED",
      jumpedAction: "STEP_COMPLETED_JUMPED"
    });
  }

  async _advanceGuidedStep(req, requestId, request, steps, currentStep, remarks, progressionMode, actionNames) {
    const nextStep = this._getNextStep(steps, currentStep);
    const oldStatus = request.status_code || PROCESS_STATUS.IN_PROGRESS;
    const mandatoryStep = await this._findIncompleteMandatoryTaskStep(req, requestId, steps, {
      afterStepNo: currentStep.stepNo,
      beforeStepNo: nextStep?.stepNo
    });
    const oChoice = await this._guidedCompletionChoice(req, requestId, steps, currentStep);
    const guidedNextStep = mandatoryStep || this._guidedNextStepForProgression(steps, nextStep, oChoice, progressionMode);
    let sNewRequestStatus = PROCESS_STATUS.COMPLETED;

    if (guidedNextStep) {
      await this._createTask(req, requestId, guidedNextStep);
      sNewRequestStatus = PROCESS_STATUS.IN_PROGRESS;
      await cds.tx(req).run(
        UPDATE(this.entities.ProcessRequests, requestId).set({
          status_code: sNewRequestStatus,
          currentStep: guidedNextStep.stepNo,
          dueDate: this._calculateDueDate(guidedNextStep.slaDays),
          completedAt: null
        })
      );
    } else {
      const incompleteStep = await this._findIncompleteGuidedStep(req, requestId, steps, {
        includeClosingSteps: true
      });

      if (incompleteStep) {
        return req.reject(400, `Complete step ${incompleteStep.stepNo} - ${incompleteStep.stepName} and approve all its tasks before completing this request`);
      }

      await cds.tx(req).run(
        UPDATE(this.entities.ProcessRequests, requestId).set({
          status_code: sNewRequestStatus,
          currentStep: this._completionStepNo(steps, currentStep),
          completedAt: this._now()
        })
      );
    }

    await this._writeHistory(req, {
      requestId,
      stepNo: currentStep.stepNo,
      action: progressionMode === "jumpIncomplete" ? actionNames.jumpedAction : actionNames.action,
      actor: req.user?.id,
      oldStatus,
      newStatus: sNewRequestStatus,
      remarks
    });

    return true;
  }

  async _getTask(req, taskId) {
    return cds.tx(req).run(SELECT.one.from(this.entities.ProcessTasks).where({ ID: taskId }));
  }

  async _getSteps(req, processTypeCode) {
    if (!processTypeCode) {
      return [];
    }

    const sCacheKey = this._configCacheKey("steps", processTypeCode);
    const aCachedSteps = this._getConfigCache(sCacheKey);

    if (aCachedSteps) {
      return aCachedSteps.map((step) => ({ ...step }));
    }

    const aSteps = await cds.tx(req).run(
      SELECT.from(this.entities.ProcessStepConfig)
        .where({ processType_code: processTypeCode })
        .orderBy("stepNo")
    );

    this._setConfigCache(sCacheKey, aSteps.map((step) => ({ ...step })));

    return aSteps;
  }

  _getInitialGuidedStep(steps) {
    if (!steps.length) {
      return null;
    }

    return steps.find((step) => !this._isClosingStep(step)) || null;
  }

  _getNextStep(steps, currentStep) {
    if (!currentStep) {
      return null;
    }

    return this._findStepByNo(steps, this._getNextStepNo(steps, currentStep.stepNo));
  }

  _getNextStepNo(steps, currentStepNo) {
    return steps.find((step) => Number(step.stepNo || 0) > Number(currentStepNo || 0))?.stepNo;
  }

  _getPreviousStep(steps, currentStepNo) {
    const previousSteps = steps.filter((step) => step.stepNo < currentStepNo);
    return previousSteps[previousSteps.length - 1] || null;
  }

  _isFinalGuidedStep(steps, currentStep) {
    if (!currentStep) {
      return false;
    }

    const nextStep = this._getNextStep(steps, currentStep);

    return !nextStep;
  }

  _completionStepNo(steps, currentStep) {
    return steps[steps.length - 1]?.stepNo || currentStep.stepNo;
  }

  _getTaskProgressionError(task, request, currentStep) {
    const sTaskStatus = this._taskStatusCode(task);

    if (![TASK_STATUS.OPEN, TASK_STATUS.SENT_BACK].includes(sTaskStatus)) {
      return "Only open or sent back tasks can be completed";
    }

    return null;
  }

  async _findIncompleteMandatoryTaskStep(req, requestId, steps, options = {}) {
    const aRelevantSteps = steps
      .filter((step) => !this._isClosingStep(step))
      .filter((step) => options.afterStepNo == null || step.stepNo > options.afterStepNo)
      .filter((step) => options.beforeStepNo == null || step.stepNo < options.beforeStepNo)
      .filter((step) => options.assumeCompletedStepNo == null || Number(step.stepNo || 0) !== Number(options.assumeCompletedStepNo || 0));

    if (!aRelevantSteps.length) {
      return null;
    }

    const aTasks = await cds.tx(req).run(
      SELECT.from(this._dbProcessTasksEntity()).where({ request_ID: requestId })
    );
    const mTasksByStep = aTasks.reduce((mResult, task) => {
      const sStepNo = String(Number(task.stepNo || 0));
      const aStepTasks = mResult.get(sStepNo) || [];

      aStepTasks.push(task);
      mResult.set(sStepNo, aStepTasks);
      return mResult;
    }, new Map());

    return aRelevantSteps.find((step) => {
      const aStepTasks = mTasksByStep.get(String(Number(step.stepNo || 0))) || [];

      return aStepTasks.some((task) => this._isMandatoryTask(task) && this._taskStatusCode(task) !== TASK_STATUS.APPROVED);
    }) || null;
  }

  async _findIncompleteGuidedStep(req, requestId, steps, options = {}) {
    const aTasks = await cds.tx(req).run(
      SELECT.from(this._dbProcessTasksEntity()).where({ request_ID: requestId })
    );

    return this._findIncompleteStep(steps, this._tasksByStep(aTasks), options)
      || this._findIncompleteUnconfiguredTaskStep(aTasks, steps, options);
  }

  async _guidedCompletionChoice(req, requestId, steps, currentStep) {
    const nextStep = this._getNextStep(steps, currentStep);
    const oEmptyChoice = {
      requiresDecision: false,
      nextStepNo: nextStep?.stepNo || null,
      nextStepName: nextStep?.stepName || "",
      incompleteStepNo: null,
      incompleteStepName: "",
      nextStepCompleted: false
    };

    if (!nextStep) {
      return oEmptyChoice;
    }

    const aTasks = await cds.tx(req).run(
      SELECT.from(this._dbProcessTasksEntity()).where({ request_ID: requestId })
    );
    const mTasksByStep = this._tasksByStep(aTasks);
    const aNextStepTasks = mTasksByStep.get(String(Number(nextStep.stepNo || 0))) || [];

    if (!this._areStepTasksComplete(aNextStepTasks)) {
      return oEmptyChoice;
    }

    const incompleteStep = this._findIncompleteStep(steps, mTasksByStep, {
      afterStepNo: nextStep.stepNo,
      includeClosingSteps: true
    });

    if (!incompleteStep) {
      return {
        ...oEmptyChoice,
        nextStepCompleted: true
      };
    }

    return {
      requiresDecision: true,
      nextStepNo: nextStep.stepNo,
      nextStepName: nextStep.stepName || "",
      incompleteStepNo: incompleteStep.stepNo,
      incompleteStepName: incompleteStep.stepName || "",
      nextStepCompleted: true
    };
  }

  _guidedNextStepForProgression(steps, nextStep, choice, progressionMode) {
    if (!nextStep) {
      return null;
    }

    if (progressionMode === "retriggerNext") {
      return nextStep;
    }

    if ((progressionMode === "jumpIncomplete" || progressionMode === "continue") && choice.requiresDecision) {
      return this._findStepByNo(steps, choice.incompleteStepNo);
    }

    if (progressionMode === "continue" && choice.nextStepCompleted) {
      return nextStep;
    }

    return nextStep;
  }

  _findIncompleteStep(steps, tasksByStep, options = {}) {
    return steps
      .filter((step) => options.includeClosingSteps || !this._isClosingStep(step))
      .filter((step) => options.afterStepNo == null || step.stepNo > options.afterStepNo)
      .filter((step) => options.beforeStepNo == null || step.stepNo < options.beforeStepNo)
      .filter((step) => options.assumeCompletedStepNo == null || Number(step.stepNo || 0) !== Number(options.assumeCompletedStepNo || 0))
      .find((step) => {
        const aStepTasks = tasksByStep.get(String(Number(step.stepNo || 0))) || [];

        return !this._areStepTasksComplete(aStepTasks);
      }) || null;
  }

  _findIncompleteUnconfiguredTaskStep(tasks, steps, options = {}) {
    const task = tasks
      .filter((oTask) => options.afterStepNo == null || Number(oTask.stepNo || 0) > Number(options.afterStepNo || 0))
      .filter((oTask) => options.beforeStepNo == null || Number(oTask.stepNo || 0) < Number(options.beforeStepNo || 0))
      .filter((oTask) => options.assumeCompletedStepNo == null || Number(oTask.stepNo || 0) !== Number(options.assumeCompletedStepNo || 0))
      .find((oTask) =>
        this._taskStatusCode(oTask) !== TASK_STATUS.APPROVED &&
        !this._findStepByNo(steps, oTask.stepNo)
      );

    return task
      ? {
          stepNo: task.stepNo || 0,
          stepName: task.taskName || `Task ${task.referenceNumber || task.ID || ""}`
        }
      : null;
  }

  _tasksByStep(tasks) {
    return tasks.reduce((mResult, task) => {
      const sStepNo = String(Number(task.stepNo || 0));
      const aStepTasks = mResult.get(sStepNo) || [];

      aStepTasks.push(task);
      mResult.set(sStepNo, aStepTasks);
      return mResult;
    }, new Map());
  }

  _areStepTasksComplete(tasks) {
    return Boolean(tasks.length) && tasks.every((task) => this._taskStatusCode(task) === TASK_STATUS.APPROVED);
  }

  _isOpenLikeTask(task) {
    return [TASK_STATUS.OPEN, TASK_STATUS.SENT_BACK].includes(this._taskStatusCode(task));
  }

  _isMandatoryTask(task) {
    return task?.isMandatory === true || task?.isMandatory === "true" || task?.isMandatory === 1;
  }

  _taskStatusCode(task) {
    return String(task?.status_code?.code || task?.status_code || "").toUpperCase();
  }

  _dbProcessTasksEntity() {
    return cds.entities("flowmate.db").ProcessTasks;
  }

  async _hasIncompleteTasksForStep(req, requestId, stepNo) {
    const aTasks = await cds.tx(req).run(
      SELECT.from(this._dbProcessTasksEntity())
        .columns("status_code")
        .where({ request_ID: requestId, stepNo })
    );

    return Boolean(aTasks.length) && !this._areStepTasksComplete(aTasks);
  }

  async _rejectUnlessGuidedStepCanComplete(req, requestId, steps, currentStep) {
    if (this._isFinalGuidedStep(steps, currentStep)) {
      const incompleteStep = await this._findIncompleteGuidedStep(req, requestId, steps, {
        includeClosingSteps: true
      });

      if (incompleteStep) {
        return req.reject(400, `Complete step ${incompleteStep.stepNo} - ${incompleteStep.stepName} and approve all its tasks before completing this request`);
      }

      return;
    }

    const aTasks = await cds.tx(req).run(
      SELECT.from(this._dbProcessTasksEntity())
        .columns("status_code", "isMandatory")
        .where({ request_ID: requestId, stepNo: currentStep.stepNo })
    );
    const aMandatoryTasks = aTasks.filter((task) => this._isMandatoryTask(task));

    if (aMandatoryTasks.length && !aMandatoryTasks.every((task) => this._taskStatusCode(task) === TASK_STATUS.APPROVED)) {
      return req.reject(400, `Approve all mandatory tasks for step ${currentStep.stepNo} before completing the guided step`);
    }
  }

  async _rejectUnlessStepTasksApproved(req, requestId, stepNo) {
    const aTasks = await cds.tx(req).run(
      SELECT.from(this._dbProcessTasksEntity())
        .columns("status_code")
        .where({ request_ID: requestId, stepNo })
    );

    if (!this._areStepTasksComplete(aTasks)) {
      return req.reject(400, `Approve all tasks for step ${stepNo} before completing the guided step`);
    }
  }

  async _rejectUnlessStepHasSentBackTask(req, requestId, stepNo) {
    const aTasks = await cds.tx(req).run(
      SELECT.from(this._dbProcessTasksEntity())
        .columns("status_code")
        .where({ request_ID: requestId, stepNo })
    );
    const bHasSentBackTask = aTasks.some((task) => this._taskStatusCode(task) === TASK_STATUS.SENT_BACK);

    if (!bHasSentBackTask) {
      return req.reject(400, `At least one task for step ${stepNo} must be sent back before sending back the guided step`);
    }
  }

  _isClosingStep(step) {
    return /closed|complete|completed/i.test(step.stepName || "");
  }

  _findStepByNo(steps, stepNo) {
    return steps.find((step) => Number(step.stepNo || 0) === Number(stepNo || 0)) || null;
  }

  async _ensureInitialGuidedTask(req, requestId, request, options = {}) {
    const oRequest = request?.processType_code ? request : await this._getRequest(req, requestId);
    const steps = await this._getSteps(req, oRequest?.processType_code);
    const firstTaskStep = this._getInitialGuidedStep(steps);

    if (firstTaskStep) {
      await this._createTask(req, requestId, firstTaskStep, { skipIfExistingStep: true, request: oRequest });

      if (options.updateRequest && Number(oRequest?.currentStep || 0) !== Number(firstTaskStep.stepNo || 0)) {
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
    const request = options.request || await this._getRequest(req, requestId);
    const oTaskOwnership = this._taskOwnershipForStep(request, step);
    const aExistingTasks = await cds.tx(req).run(
      SELECT.from(this.entities.ProcessTasks).where({ request_ID: requestId, stepNo: step.stepNo })
    );
    const oExistingTask = options.skipIfExistingStep
      ? aExistingTasks[0]
      : aExistingTasks.find((task) => this._isOpenLikeTask(task));

    if (oExistingTask) {
      await this._ensureExistingTaskOwnership(req, oExistingTask, oTaskOwnership);
      if (oTaskOwnership.processorTeam_ID) {
        await this._syncTaskTeamMembersFromTeam(req, oExistingTask.ID, oTaskOwnership.processorTeam_ID);
      }
      return;
    }

    const sTaskId = cds.utils.uuid();
    const sReferenceNumber = await this._nextReferenceNumber(req, this.entities.ProcessTasks, "TSK");

    await cds.tx(req).run(
      INSERT.into(this.entities.ProcessTasks).entries({
        ID: sTaskId,
        referenceNumber: sReferenceNumber,
        request_ID: requestId,
        assignedUser_ID: oTaskOwnership.assignedUser_ID,
        processorUser_ID: oTaskOwnership.processorUser_ID,
        processorTeam_ID: oTaskOwnership.processorTeam_ID,
        processorTeamName: oTaskOwnership.processorTeamName,
        processorEmail: oTaskOwnership.processorEmail,
        stepNo: step.stepNo,
        taskName: step.stepName,
        // Kept for workflow compatibility; assignee details are no longer presented by the UI.
        assignedTo: oTaskOwnership.assignedTo,
        processor: oTaskOwnership.processor,
        role: step.role,
        isMandatory: true,
        isTeamTask: Boolean(oTaskOwnership.processorTeam_ID),
        status_code: TASK_STATUS.OPEN
      })
    );

    if (oTaskOwnership.processorTeam_ID) {
      await this._syncTaskTeamMembersFromTeam(req, sTaskId, oTaskOwnership.processorTeam_ID);
    }
  }

  _taskOwnershipForStep(request, step) {
    const bRequesterStep = /requester/i.test(step?.role || "") || Number(step?.stepNo || 0) === 1;
    const sRequesterName = request?.requester || null;
    const sProcessorName = request?.processor || null;
    const sProcessorEmail = request?.processorEmail || null;

    if (step?.processorTeam_ID) {
      return {
        assignedUser_ID: null,
        processorUser_ID: null,
        processorTeam_ID: step.processorTeam_ID,
        processorTeamName: step.processorTeamName || null,
        assignedTo: step?.role || null,
        processor: null,
        processorEmail: null
      };
    }

    if (request?.processorTeam_ID) {
      return {
        assignedUser_ID: null,
        processorUser_ID: null,
        processorTeam_ID: request.processorTeam_ID,
        processorTeamName: request.processorTeamName || null,
        assignedTo: step?.role || null,
        processor: null,
        processorEmail: null
      };
    }

    if (bRequesterStep && (request?.requesterUser_ID || sRequesterName)) {
      return {
        assignedUser_ID: request?.requesterUser_ID || null,
        processorUser_ID: null,
        processorTeam_ID: null,
        processorTeamName: null,
        assignedTo: sRequesterName || step?.role || null,
        processor: null,
        processorEmail: null
      };
    }

    if (request?.processorUser_ID || sProcessorName) {
      return {
        assignedUser_ID: null,
        processorUser_ID: request?.processorUser_ID || null,
        processorTeam_ID: request?.processorTeam_ID || null,
        processorTeamName: request?.processorTeamName || null,
        assignedTo: step?.role || null,
        processor: sProcessorName || null,
        processorEmail: sProcessorEmail
      };
    }

    return {
      assignedUser_ID: request?.requesterUser_ID || null,
      processorUser_ID: null,
      processorTeam_ID: null,
      processorTeamName: null,
      assignedTo: sRequesterName || step?.role || null,
      processor: null,
      processorEmail: null
    };
  }

  async _ensureExistingTaskOwnership(req, task, ownership) {
    if (task.assignedUser_ID || task.processorUser_ID || task.processorTeam_ID || task.processorEmail || task.processor) {
      return;
    }

    await cds.tx(req).run(
      UPDATE(this.entities.ProcessTasks, task.ID).set({
        assignedUser_ID: ownership.assignedUser_ID,
        processorUser_ID: ownership.processorUser_ID,
        processorTeam_ID: ownership.processorTeam_ID,
        processorTeamName: ownership.processorTeamName,
        assignedTo: ownership.assignedTo,
        processor: ownership.processor,
        processorEmail: ownership.processorEmail,
        isTeamTask: Boolean(ownership.processorTeam_ID)
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
