const cds = require("@sap/cds");
const { executeHttpRequest } = require("@sap-cloud-sdk/http-client");
const PDFDocument = require("pdfkit");
const SVGtoPDF = require("svg-to-pdfkit");


const PROCESS_STATUS = {
  DRAFT: "DRAFT",
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
  "FTK_FACTORING_PO_VALIDATION",
  "FTK_FACTORING_BASED_ON_UAC",
  "FTK_FACTORING_PENDING_UAC"
]);
const DEFAULT_CONFIG_CACHE_TTL_MS = 60 * 1000;
const BPA_USER_DESTINATION = "bpa_workflow";
const BPA_TECHNICAL_DESTINATION = "bpa_workflow_technical";
const BPA_WORKFLOW_PATH = "/workflow/rest/v1/workflow-instances";
const BPA_EMAIL_DEFINITION_ID = "ap11.arize-qas-9339ozek.emailprocess.emailProcess";

module.exports = class FlowmateService extends cds.ApplicationService {
  async init() {
    this._configCache = new Map();
    this._configCacheTtlMs = this._getConfigCacheTtlMs();
    this.master = await cds.connect.to("CommonMasterDataService");
    this.masterEntities = this.master.entities;
    this.flowmateCA = await cds.connect.to("FlowmateCAService");

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
      WorkingCalendars,
      WorkingCalendarDays,
      WorkingCalendarHolidays,
      ProcessTypes,
      ProcessSubTypes,
      PaymentCategories,
      FtkEntities,
      Priorities,
      Operator,
      LoaApproval,
      ProcessStatus,
      TaskStatus,
      Teams: ServiceTeams,
      Roles: ServiceRoles,
      Vendors: ServiceVendors,
      TeamMembers: ServiceTeamMembers,
      RequestDropDown,
      RequestFilterQueries,
      Users: ServiceUsers,
      Delegations: ServiceDelegations
    } = this.entities;
    const {
      Users,
      Roles,
      Teams,
      Vendors,
      TeamMembers,
      Delegations
    } = this.masterEntities;

    this.on("READ", [ServiceUsers, ServiceRoles, ServiceTeams, ServiceVendors, ServiceTeamMembers], (req) => {
      return this.master.run(req.query);
    });
    this.on(["CREATE", "UPDATE", "DELETE"], [ServiceUsers, ServiceRoles, ServiceTeams, ServiceVendors, ServiceTeamMembers], (req) => {
      return this.master.run(req.query);
    });

    this.before(["CREATE", "UPDATE", "DELETE"], ServiceRoles, async (req) => {
      if (!this._isAdministrator(req)) {
        return req.reject(403, "Only an administrator can maintain roles");
      }

      if (req.event === "DELETE") {
        const sRoleCode = req.data.code || req.params?.[0]?.code;
        const oLoaRule = sRoleCode && await cds.tx(req).run(
          SELECT.one.from(LoaApproval).columns("ID").where({ roleCode: sRoleCode })
        );

        if (oLoaRule) {
          return req.reject(409, "The role is used by one or more LoA approval rules and cannot be deleted");
        }
      }
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
      if (this._isAdministrator(req)) {
        return;
      }
      const oReservationUser = await this._currentReservationUser(req, Users);
      this._applyVisibleRequestsWhere(req.query, oReservationUser);
    });

    this.after("READ", ProcessRequests, async (data, req) => {
      if (this._isAdministrator(req)) {
        return;
      }
      const oReservationUser = await this._currentReservationUser(req, Users);
      this._filterExpandedTasksByAssignment(data, oReservationUser);
    });

    this.before("READ", ProcessTasks, async (req) => {
      if (this._isAdministrator(req)) {
        return;
      }
      await this._filterByVisibleRequests(req, Users, "request_ID");
      await this._filterByAssignedTasks(req, Users);
    });

    this.before("READ", MyAssignedTasks, async (req) => {
      await this._filterByAssignedTasks(req, Users, true);
    });

    this.before("READ", MyTeamTasks, async (req) => {
      await this._filterByTeamTasks(req, Users, TeamMembers, true);
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

    this.before(["CREATE", "UPDATE", "DELETE"], [WorkingCalendars, WorkingCalendarDays, WorkingCalendarHolidays], async (req) => {
      if (!this._isAdministrator(req)) {
        return req.reject(403, "Only an administrator can maintain working calendars");
      }

      if (req.target === WorkingCalendarDays && req.event !== "DELETE") {
        const iDay = Number(req.data.dayOfWeek);
        if (!Number.isInteger(iDay) || iDay < 1 || iDay > 7) {
          return req.reject(400, "Day of week must be between 1 (Monday) and 7 (Sunday)");
        }
        this._validateWorkingHours(req);
      }

      if (req.target === WorkingCalendarHolidays && req.event !== "DELETE") {
        if (!req.data.holidayDate || !String(req.data.name || "").trim()) {
          return req.reject(400, "Holiday date and name are required");
        }
        this._validateWorkingHours(req, true);
      }

      if (req.target === WorkingCalendars && req.event !== "DELETE") {
        if (!String(req.data.code || "").trim() || !String(req.data.name || "").trim()) {
          return req.reject(400, "Calendar code and name are required");
        }
        try {
          new Intl.DateTimeFormat("en", { timeZone: req.data.timeZone || "Asia/Colombo" }).format();
        } catch (_error) {
          return req.reject(400, "Enter a valid IANA time zone, for example Asia/Colombo");
        }
      }
    });

    this.after(["CREATE", "UPDATE"], WorkingCalendars, async (calendar, req) => {
      if (!calendar?.isDefault) return;
      await cds.tx(req).run(
        UPDATE(WorkingCalendars).set({ isDefault: false }).where([
          { ref: ["ID"] }, "!=", { val: calendar.ID }
        ])
      );
    });
    this.after(["CREATE", "UPDATE", "DELETE"], [WorkingCalendars, WorkingCalendarDays, WorkingCalendarHolidays], () => this._clearConfigCache());

    this.before(["CREATE", "UPDATE", "DELETE"], LoaApproval, async (req) => {
      if (!this._isAdministrator(req)) {
        return req.reject(403, "Only an administrator can maintain LoA approval rules");
      }

      if (req.event !== "DELETE" && (
        req.data.amount === null
        || req.data.amount === undefined
        || !req.data.operator_code
        || !String(req.data.roleCode || "").trim()
      )) {
        return req.reject(400, "Amount, operator, and role are required");
      }

      if (req.event !== "DELETE") {
        const oRole = await this.master.run(
          SELECT.one.from(Roles).columns("code").where({ code: req.data.roleCode })
        );

        if (!oRole) {
          return req.reject(400, "Selected role was not found");
        }
      }
    });

    [ProcessTypes, PaymentCategories, FtkEntities, Priorities, Operator, ProcessStatus, TaskStatus, RequestDropDown].forEach((oCodeList) => {
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

    this.before(["CREATE", "UPDATE", "DELETE"], ProcessSubTypes, (req) => {
      if (!this._isAdministrator(req)) {
        return req.reject(403, "Only an administrator can maintain process subtypes");
      }

      if (req.event === "CREATE" && (!req.data.code || !req.data.name || !req.data.processType_code)) {
        return req.reject(400, "Subtype code, name, and process type are required");
      }

      if (Object.prototype.hasOwnProperty.call(req.data, "loaApprovalApplicable")) {
        req.data.loaApprovalApplicable = Boolean(req.data.loaApprovalApplicable);
      }
    });
    this.after(["CREATE", "UPDATE", "DELETE"], ProcessSubTypes, () => this._clearConfigCache());

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

      if (!oStep.subProcessType_code || !oStep.stepNo || !oStep.stepName) {
        return req.reject(400, "Process subtype, step number, and step name are required");
      }

      const oSubProcessType = await cds.tx(req).run(
        SELECT.one.from(ProcessSubTypes)
          .columns("code")
          .where({ code: oStep.subProcessType_code })
      );

      if (!oSubProcessType) {
        return req.reject(400, "Selected process subtype was not found");
      }

      const oDuplicate = await cds.tx(req).run(
        SELECT.one.from(ProcessStepConfig).where({
          subProcessType_code: oStep.subProcessType_code,
          stepNo: oStep.stepNo
        })
      );

      if (oDuplicate && oDuplicate.ID !== sStepId) {
        return req.reject(409, "A process step already exists for this process subtype and step number");
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

    this.before(["CREATE", "UPDATE"], ProcessRequests, async (req) => {
      const sRequestId = this._requestIdFromReq(req);
      const oExisting = req.event === "UPDATE" && sRequestId
        ? await cds.tx(req).run(
          SELECT.one.from(ProcessRequests)
            .columns("subProcessType_code", "amount")
            .where({ ID: sRequestId })
        )
        : null;
      const sSubProcessTypeCode = Object.prototype.hasOwnProperty.call(req.data, "subProcessType_code")
        ? req.data.subProcessType_code
        : oExisting?.subProcessType_code;
      const oSubProcessType = sSubProcessTypeCode
        ? await cds.tx(req).run(
          SELECT.one.from(ProcessSubTypes)
            .columns("loaApprovalApplicable")
            .where({ code: sSubProcessTypeCode })
        )
        : null;

      if (!oSubProcessType?.loaApprovalApplicable) {
        req.data.amount = null;
        req.data.role = null;
        return;
      }

      const vAmount = Object.prototype.hasOwnProperty.call(req.data, "amount")
        ? req.data.amount
        : oExisting?.amount;
      const fAmount = Number(vAmount);

      if (vAmount === null || vAmount === undefined || vAmount === "" || !Number.isFinite(fAmount)) {
        return req.reject(400, "Amount is required when LoA approval is applicable");
      }

      const sRoleCode = await this._resolveLoaRole(req, LoaApproval, fAmount);

      if (!sRoleCode) {
        return req.reject(400, `No LoA approval rule is configured for amount ${fAmount}`);
      }

      req.data.amount = fAmount;
      req.data.role = sRoleCode;
    });

    this.before("CREATE", ProcessRequests, async (req) => {
      if (req.data.subProcessType_code === "FTK_FACTORING_PO_VALIDATION") {
        const aMissingFields = [
          ["Payment category", req.data.paymentCategory_code],
          ["Entity", req.data.businessEntity_code],
          ["Vendor code and vendor name", req.data.vendor_ID]
        ]
          .filter(([, vValue]) => !String(vValue || "").trim())
          .map(([sLabel]) => sLabel);

        if (aMissingFields.length) {
          return req.reject(
            400,
            `${aMissingFields.join(", ")} ${aMissingFields.length === 1 ? "is" : "are"} mandatory for FTK Factoring PO Validation`
          );
        }
      }

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
      if (request.processorTeam_ID) {
        await this._notifyTeamAssignment(req, {
          assignmentType: "PROCESS",
          request,
          teamId: request.processorTeam_ID,
          teamName: request.processorTeamName
        });
      }
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
        await this._notifyTeamAssignment(req, {
          assignmentType: "TASK",
          task,
          teamId: task.processorTeam_ID,
          teamName: task.processorTeamName
        });
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

      const steps = await this._getSteps(req, request.subProcessType_code);
      const step = steps.find((oStep) => Number(oStep.stepNo || 0) === Number(task.stepNo || 0));
      const oDeadline = step
        ? await this._calculateSlaDeadline(req, request.subProcessType_code, step.slaDays)
        : {};

      await cds.tx(req).run(
        UPDATE(ProcessRequests, task.request_ID).set({
          status_code: PROCESS_STATUS.IN_PROGRESS,
          currentStep: task.stepNo,
          dueDate: oDeadline.dueDate || request.dueDate,
          slaDueAt: oDeadline.slaDueAt || request.slaDueAt,
          slaCalendarCode: oDeadline.slaCalendarCode || request.slaCalendarCode,
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

      const steps = await this._getSteps(req, request.subProcessType_code);
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
      const oDeadline = await this._calculateSlaDeadline(req, request.subProcessType_code, sendBackStep.slaDays);

      await cds.tx(req).run(
        UPDATE(ProcessRequests, task.request_ID).set({
          status_code: PROCESS_STATUS.SENT_BACK,
          currentStep: sendBackStep.stepNo,
          ...oDeadline,
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
        const steps = await this._getSteps(req, request.subProcessType_code);
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

      if (request.processorTeam_ID !== teamId) {
        await this._notifyTeamAssignment(req, {
          assignmentType: "PROCESS",
          request: { ...request, ...oPayload },
          teamId,
          teamName: oTeam.name
        });
      }

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

      if (task.processorTeam_ID !== teamId) {
        await this._notifyTeamAssignment(req, {
          assignmentType: "TASK",
          task: { ...task, ...oPayload },
          teamId,
          teamName: oTeam.name
        });
      }

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

      const bVisibleTeamTask = await this._isTeamTaskVisibleForUser(req, taskId, oReservationUser, TeamMembers);

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

    this.on("runSlaBreachScan", async (req) => {
      return this._runSlaBreachScan(req);
    });
    this.on("recalculateOpenSlaDeadlines", async (req) => {
      if (!this._isAdministrator(req)) return req.reject(403, "Only an administrator can recalculate SLA deadlines");
      return this._recalculateOpenSlaDeadlines(req, req.data.calendarId);
    });
    this.on("getFlowmateCAConnectionStatus", async () => this._peerConnectionStatus({
      service: this.flowmateCA,
      entityName: "Requests",
      application: "Flowmate CA",
      endpoint: "flowmate-ca-api"
    }));

    this.on("getUserAdministrationCapabilities", (req) => ({
      canMaintainUsers: this._isAdministrator(req)
    }));

    this.on("getRequestReservationCounts", async (req) => {
      const oReservationUser = await this._currentReservationUser(req, Users);
      const qUnreserved = SELECT.one.from(ProcessRequests).columns("count(1) as count");
      const qReservedByMe = SELECT.one.from(ProcessRequests).columns("count(1) as count");

      if (!this._isAdministrator(req)) {
        qUnreserved.where({ requesterUser_ID: oReservationUser.user.ID });
        qReservedByMe.where({ requesterUser_ID: oReservationUser.user.ID });
      }

      if (oReservationUser.user?.ID) {
        qReservedByMe.where({ reservedByUser_ID: oReservationUser.user.ID });
      } else {
        qReservedByMe.where({ reservedBy: { in: [oReservationUser.displayName, oReservationUser.principal] } });
      }

      const [oUnreserved, oReserved] = await Promise.all([
        cds.tx(req).run(
          qUnreserved.where({ reservedBy: null })
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
      const aMemberships = await this.master.run(
        SELECT.from(TeamMembers)
          .columns("team_ID")
          .where({ user_ID: oReservationUser.user.ID, isActive: true })
      );
      const aTeamIds = [...new Set(aMemberships.map((oMembership) => oMembership.team_ID).filter(Boolean))];

      if (!aTeamIds.length) {
        return 0;
      }

      const oTaskCount = await cds.tx(req).run(
        SELECT.one.from(ProcessTasks)
          .columns("count(1) as count")
          .where({ isTeamTask: true })
          .where([
            { ref: ["processorUser_ID"] }, "is", "null",
            "and", { ref: ["processorEmail"] }, "is", "null",
            "and", { ref: ["processorTeam_ID"] }, "in", { list: aTeamIds.map((sTeamId) => ({ val: sTeamId })) }
          ])
      );

      return Number(oTaskCount?.count || oTaskCount?.COUNT || 0);
    });

    this.on("getReportDashboard", async (req) => {
      return this._getReportDashboard(req, req.data.filter || {}, ProcessRequests, ProcessTasks, ProcessTypes, Users);
    });

    this.on("exportReportDashboardPdf", async (req) => {
      const sDashboardKey = String(req.data.dashboardKey || "operational").toLowerCase();
      const aSupportedDashboards = ["overallsla", "averageprocessing", "operational", "sla", "teams", "trends", "users", "audit"];
      if (!aSupportedDashboards.includes(sDashboardKey)) {
        return req.reject(400, "Select a valid dashboard for PDF export");
      }
      const oDashboard = await this._getReportDashboard(
        req,
        req.data.filter || {},
        ProcessRequests,
        ProcessTasks,
        ProcessTypes,
        Users
      );
      const oRange = this._reportDateRange(req, req.data.filter?.fromDate, req.data.filter?.toDate);
      const aCharts = this._validatedReportChartSnapshots(req, sDashboardKey, req.data.charts);
      const oPdf = await this._renderReportDashboardPdf(sDashboardKey, oDashboard, oRange, aCharts);
      return {
        fileName: oPdf.fileName,
        mimeType: "application/pdf",
        content: oPdf.content.toString("base64")
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

  async _peerConnectionStatus({ service, entityName, application, endpoint }) {
    const checkedAt = this._now();
    try {
      const entity = service.entities[entityName];
      const rows = await service.run(SELECT.from(entity).columns("ID").limit(1));
      return {
        reachable: true,
        application,
        endpoint,
        sampleRecords: Array.isArray(rows) ? rows.length : (rows ? 1 : 0),
        checkedAt,
        message: `Authenticated connection to ${application} is ready`
      };
    } catch (error) {
      cds.log("peer-integration").warn(`${application} connection check failed`, error.message);
      return {
        reachable: false,
        application,
        endpoint,
        sampleRecords: 0,
        checkedAt,
        message: `Connection failed: ${error.message}`.slice(0, 500)
      };
    }
  }

  _isSlaDeadlineBreached(request, today = new Date().toISOString().slice(0, 10)) {
    if (request?.slaDueAt) {
      const deadline = Date.parse(request.slaDueAt);
      return Number.isFinite(deadline) && deadline < Date.now();
    }
    return Boolean(request?.dueDate && String(request.dueDate).slice(0, 10) < today);
  }

  _validateWorkingHours(req, bHoliday = false) {
    const bWorking = req.data.isWorkingDay === true;
    const sStart = req.data.startTime;
    const sEnd = req.data.endTime;

    if (!bWorking && bHoliday) return;
    if (!bWorking) return;
    if (!sStart || !sEnd || this._timeToMinutes(sEnd) <= this._timeToMinutes(sStart)) {
      req.reject(400, "A working day must have an end time later than its start time");
    }
  }

  _timeToMinutes(value) {
    if (value && typeof value === "object" && Number.isFinite(value.ms)) {
      return Math.floor(value.ms / 60000);
    }
    const duration = /^PT(?:(\d+)H)?(?:(\d+)M)?/i.exec(String(value || ""));
    if (duration) {
      return (Number(duration[1] || 0) * 60) + Number(duration[2] || 0);
    }
    const [hours, minutes] = String(value || "00:00").split(":").map(Number);
    return (hours * 60) + minutes;
  }

  _zonedParts(date, timeZone) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date).reduce((result, part) => {
      if (part.type !== "literal") result[part.type] = part.value;
      return result;
    }, {});
    return {
      date: `${parts.year}-${parts.month}-${parts.day}`,
      minutes: (Number(parts.hour) * 60) + Number(parts.minute),
      year: Number(parts.year), month: Number(parts.month), day: Number(parts.day)
    };
  }

  _zonedDateTimeToUtc(dateValue, timeValue, timeZone) {
    const [year, month, day] = String(dateValue).split("-").map(Number);
    const [hour, minute, second = 0] = String(timeValue || "00:00:00").split(":").map(Number);
    const desired = Date.UTC(year, month - 1, day, hour, minute, second);
    let guess = desired;

    for (let index = 0; index < 3; index += 1) {
      const actual = this._zonedParts(new Date(guess), timeZone);
      const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, Math.floor(actual.minutes / 60), actual.minutes % 60, second);
      guess += desired - actualAsUtc;
    }
    return new Date(guess);
  }

  _addLocalDays(dateValue, days) {
    const date = new Date(`${dateValue}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  _isoDayOfWeek(dateValue) {
    const day = new Date(`${dateValue}T00:00:00Z`).getUTCDay();
    return day === 0 ? 7 : day;
  }

  async _workingCalendar(req, subProcessTypeCode) {
    const { WorkingCalendars, WorkingCalendarDays, WorkingCalendarHolidays, ProcessSubTypes } = this.entities;
    const tx = cds.tx(req);
    let calendarId;

    if (subProcessTypeCode) {
      const subType = await tx.run(
        SELECT.one.from(ProcessSubTypes).columns("workingCalendar_ID").where({ code: subProcessTypeCode })
      );
      calendarId = subType?.workingCalendar_ID;
    }

    const calendar = calendarId
      ? await tx.run(SELECT.one.from(WorkingCalendars).where({ ID: calendarId, isActive: true }))
      : await tx.run(SELECT.one.from(WorkingCalendars).where({ isDefault: true, isActive: true }));
    if (!calendar) return null;

    const [days, holidays] = await Promise.all([
      tx.run(SELECT.from(WorkingCalendarDays).where({ calendar_ID: calendar.ID })),
      tx.run(SELECT.from(WorkingCalendarHolidays).where({ calendar_ID: calendar.ID, isActive: true }))
    ]);
    return { ...calendar, days, holidays };
  }

  async _calculateSlaDeadline(req, subProcessTypeCode, slaDays = 0, startAt = new Date()) {
    const startedAt = new Date(startAt);
    const calendar = await this._workingCalendar(req, subProcessTypeCode);

    if (!calendar?.days?.some((day) => day.isWorkingDay)) {
      const fallback = new Date(startAt);
      fallback.setUTCDate(fallback.getUTCDate() + Number(slaDays || 0));
      return {
        dueDate: fallback.toISOString().slice(0, 10),
        slaStartedAt: startedAt.toISOString(),
        slaDueAt: fallback.toISOString(),
        slaCalendarCode: calendar?.code || null
      };
    }

    const timeZone = calendar.timeZone || "Asia/Colombo";
    const schedules = new Map(calendar.days.map((day) => [Number(day.dayOfWeek), day]));
    const holidays = new Map(calendar.holidays.map((holiday) => [String(holiday.holidayDate).slice(0, 10), holiday]));
    const normalWorkingMinutes = Math.max(...calendar.days
      .filter((day) => day.isWorkingDay)
      .map((day) => this._timeToMinutes(day.endTime) - this._timeToMinutes(day.startTime)));
    let remaining = Math.max(0, Number(slaDays || 0) * normalWorkingMinutes);
    let cursor = new Date(startAt);

    for (let guard = 0; guard < 3700; guard += 1) {
      const local = this._zonedParts(cursor, timeZone);
      const holiday = holidays.get(local.date);
      const weekly = schedules.get(this._isoDayOfWeek(local.date));
      const schedule = holiday
        ? (holiday.isWorkingDay ? holiday : null)
        : (weekly?.isWorkingDay ? weekly : null);

      if (schedule) {
        const startMinutes = this._timeToMinutes(schedule.startTime);
        const endMinutes = this._timeToMinutes(schedule.endTime);
        const effectiveMinutes = Math.max(local.minutes, startMinutes);

        if (effectiveMinutes < endMinutes) {
          const effectiveStart = this._zonedDateTimeToUtc(
            local.date,
            `${String(Math.floor(effectiveMinutes / 60)).padStart(2, "0")}:${String(effectiveMinutes % 60).padStart(2, "0")}:00`,
            timeZone
          );
          const available = endMinutes - effectiveMinutes;
          if (remaining <= available) {
            const dueAt = new Date(effectiveStart.getTime() + (remaining * 60000));
            return {
              dueDate: this._zonedParts(dueAt, timeZone).date,
              slaStartedAt: startedAt.toISOString(),
              slaDueAt: dueAt.toISOString(),
              slaCalendarCode: calendar.code
            };
          }
          remaining -= available;
        }
      }

      const nextDate = this._addLocalDays(local.date, 1);
      cursor = this._zonedDateTimeToUtc(nextDate, "00:00:00", timeZone);
    }
    throw new Error(`Unable to calculate SLA deadline for working calendar ${calendar.code}`);
  }

  async _recalculateOpenSlaDeadlines(req, calendarId) {
    const { ProcessRequests, ProcessStepConfig, ProcessSubTypes, WorkingCalendars } = this.entities;
    const tx = cds.tx(req);
    const calendar = calendarId
      ? await tx.run(SELECT.one.from(WorkingCalendars).columns("ID", "code", "isDefault").where({ ID: calendarId }))
      : null;
    if (calendarId && !calendar) return req.reject(404, "Working calendar was not found");

    const requests = await tx.run(
      SELECT.from(ProcessRequests).columns(
        "ID", "subProcessType_code", "currentStep", "slaStartedAt", "createdAt", "modifiedAt", "status_code"
      ).where([
        { ref: ["status_code"] }, "not in", {
          list: [PROCESS_STATUS.COMPLETED, PROCESS_STATUS.REJECTED].map((status) => ({ val: status }))
        }
      ])
    );
    let updated = 0;
    for (const request of requests) {
      if (calendar) {
        const subType = await tx.run(
          SELECT.one.from(ProcessSubTypes).columns("workingCalendar_ID").where({ code: request.subProcessType_code })
        );
        const effectiveCalendarId = subType?.workingCalendar_ID || (calendar.isDefault ? calendar.ID : null);
        if (effectiveCalendarId !== calendar.ID) continue;
      }
      const step = await tx.run(
        SELECT.one.from(ProcessStepConfig).columns("slaDays").where({
          subProcessType_code: request.subProcessType_code,
          stepNo: request.currentStep
        })
      );
      if (!step) continue;
      const startedAt = request.slaStartedAt || request.modifiedAt || request.createdAt || this._now();
      const deadline = await this._calculateSlaDeadline(req, request.subProcessType_code, step.slaDays, new Date(startedAt));
      await tx.run(UPDATE(ProcessRequests, request.ID).set(deadline));
      updated += 1;
    }
    return updated;
  }

  async _getReportDashboard(req, filter, ProcessRequests, ProcessTasks, ProcessTypes, Users) {
    const oCurrentUser = this._isAdministrator(req)
      ? null
      : await this._currentReservationUser(req, Users);
    const oRange = this._reportDateRange(req, filter.fromDate, filter.toDate);
    const qScopedRequests = SELECT.from(ProcessRequests).columns("ID");
    const fnApplyRequestFilters = (query) => {
      query.where([
        { ref: ["createdAt"] }, ">=", { val: oRange.fromDateTime },
        "and",
        { ref: ["createdAt"] }, "<=", { val: oRange.toDateTime }
      ]);
      if (!this._isAdministrator(req)) {
        query.where({ requesterUser_ID: oCurrentUser.user.ID });
      }
      if (filter.processTypeCode) {
        query.where({ processType_code: filter.processTypeCode });
      }
      if (filter.subProcessTypeCode) {
        query.where({ subProcessType_code: filter.subProcessTypeCode });
      }
      if (filter.statusCode) {
        query.where({ status_code: filter.statusCode });
      }
      return query;
    };

    fnApplyRequestFilters(qScopedRequests);
    const aRequests = await cds.tx(req).run(fnApplyRequestFilters(
      SELECT.from(ProcessRequests).columns(
        "ID", "createdAt", "completedAt", "dueDate", "slaDueAt", "status_code", "processType_code", "referenceNumber", "title"
      )
    ));
    const aProcessTypes = await cds.tx(req).run(SELECT.from(ProcessTypes).columns("code", "name"));
    const mProcessNames = new Map(aProcessTypes.map((oType) => [oType.code, oType.name || oType.code]));
    const sToday = new Date().toISOString().slice(0, 10);
    const mStatus = new Map();
    const mProcess = new Map();
    const mTrend = new Map();
    let iCompleted = 0;
    let iOpen = 0;
    let iOverdue = 0;
    let iSlaEligible = 0;
    let iSlaMet = 0;

    aRequests.forEach((oRequest) => {
      const sStatus = oRequest.status_code || "UNSPECIFIED";
      const sProcess = oRequest.processType_code || "UNSPECIFIED";
      const sPeriod = String(oRequest.createdAt || "").slice(0, 7);
      const bCompleted = sStatus === PROCESS_STATUS.COMPLETED;
      const bClosed = bCompleted || sStatus === PROCESS_STATUS.REJECTED;
      const bOverdue = !bClosed && this._isSlaDeadlineBreached(oRequest, sToday);

      mStatus.set(sStatus, (mStatus.get(sStatus) || 0) + 1);
      mProcess.set(sProcess, (mProcess.get(sProcess) || 0) + 1);
      if (sPeriod) {
        mTrend.set(sPeriod, (mTrend.get(sPeriod) || 0) + 1);
      }
      iCompleted += bCompleted ? 1 : 0;
      iOpen += bClosed ? 0 : 1;
      iOverdue += bOverdue ? 1 : 0;
      if ((oRequest.slaDueAt || oRequest.dueDate) && (bClosed || bOverdue)) {
        iSlaEligible += 1;
        const sCompletedAt = oRequest.completedAt || new Date().toISOString();
        const bMet = oRequest.slaDueAt
          ? Date.parse(sCompletedAt) <= Date.parse(oRequest.slaDueAt)
          : String(sCompletedAt).slice(0, 10) <= oRequest.dueDate;
        iSlaMet += bMet ? 1 : 0;
      }
    });

    const aTeamRows = await cds.tx(req).run(
      SELECT.from(ProcessTasks)
        .columns("processorTeam_ID", "processorTeamName", "count(1) as count")
        .where({ request_ID: { in: qScopedRequests } })
        .where([
          { ref: ["status_code"] }, "not in", {
            list: [TASK_STATUS.APPROVED, TASK_STATUS.REJECTED].map((sStatus) => ({ val: sStatus }))
          }
        ])
        .groupBy("processorTeam_ID", "processorTeamName")
    );
    const aOverdueRequestIds = aRequests
      .filter((oRequest) => ![PROCESS_STATUS.COMPLETED, PROCESS_STATUS.REJECTED].includes(oRequest.status_code) && this._isSlaDeadlineBreached(oRequest, sToday))
      .map((oRequest) => oRequest.ID);
    const aOverdueTaskRows = aOverdueRequestIds.length
      ? await cds.tx(req).run(
          SELECT.from(ProcessTasks)
            .columns("ID", "referenceNumber", "taskName", "request_ID", "processorTeamName", "status_code")
            .where({ request_ID: { in: aOverdueRequestIds } })
            .where([
              { ref: ["status_code"] }, "not in", {
                list: [TASK_STATUS.APPROVED, TASK_STATUS.REJECTED].map((sStatus) => ({ val: sStatus }))
              }
            ])
            .limit(50)
        )
      : [];
    const [aUserActivityRows, aAuditActivityRows] = await Promise.all([
      cds.tx(req).run(
        SELECT.from(this.entities.ProcessHistory)
          .columns("actor", "count(1) as count")
          .where({ request_ID: { in: qScopedRequests } })
          .groupBy("actor")
      ),
      cds.tx(req).run(
        SELECT.from(this.entities.ProcessHistory)
          .columns("action", "count(1) as count")
          .where({ request_ID: { in: qScopedRequests } })
          .groupBy("action")
      )
    ]);
    const mRequests = new Map(aRequests.map((oRequest) => [oRequest.ID, oRequest]));
    const fnBreakdown = (mValues, fnLabel = (sKey) => this._reportLabel(sKey)) => [...mValues.entries()]
      .map(([sKey, iCount]) => ({ code: sKey, label: fnLabel(sKey), count: iCount }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    const oOverallSla = await this._getOverallSlaMetrics(req, filter, oRange, oCurrentUser);
    const oAverageProcessing = await this._getAverageProcessingMetrics(req, filter, oRange, oCurrentUser);

    return {
      totalRequests: aRequests.length,
      openRequests: iOpen,
      completedRequests: iCompleted,
      overdueRequests: iOverdue,
      slaCompliancePercent: iSlaEligible ? Number(((iSlaMet / iSlaEligible) * 100).toFixed(2)) : 100,
      statusBreakdown: fnBreakdown(mStatus),
      processBreakdown: fnBreakdown(mProcess, (sKey) => mProcessNames.get(sKey) || this._reportLabel(sKey)),
      monthlyTrend: [...mTrend.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([sPeriod, iCount]) => ({
        period: sPeriod,
        label: new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${sPeriod}-01T00:00:00Z`)),
        count: iCount
      })),
      teamWorkload: aTeamRows.map((oRow) => ({
        code: oRow.processorTeam_ID || "UNASSIGNED",
        label: oRow.processorTeamName || "Unassigned",
        count: Number(oRow.count || oRow.COUNT || 0)
      })).sort((a, b) => b.count - a.count),
      userActivity: aUserActivityRows.map((oRow) => ({
        code: oRow.actor || "SYSTEM",
        label: oRow.actor || "System",
        count: Number(oRow.count || oRow.COUNT || 0)
      })).sort((a, b) => b.count - a.count),
      auditActivity: aAuditActivityRows.map((oRow) => ({
        code: oRow.action || "UNSPECIFIED",
        label: this._reportLabel(oRow.action),
        count: Number(oRow.count || oRow.COUNT || 0)
      })).sort((a, b) => b.count - a.count),
      overdueTasks: aOverdueTaskRows.map((oTask) => {
        const oRequest = mRequests.get(oTask.request_ID) || {};
        const sDeadline = oRequest.slaDueAt || (oRequest.dueDate ? `${oRequest.dueDate}T00:00:00Z` : null);
        const iOverdueDays = sDeadline
          ? Math.max(0, Math.floor((Date.now() - Date.parse(sDeadline)) / 86400000))
          : 0;
        return {
          ID: oTask.ID,
          referenceNumber: oTask.referenceNumber,
          taskName: oTask.taskName,
          requestId: oTask.request_ID,
          requestNumber: oRequest.referenceNumber,
          requestTitle: oRequest.title,
          teamName: oTask.processorTeamName || "Unassigned",
          dueDate: oRequest.dueDate,
          overdueDays: iOverdueDays,
          statusCode: oTask.status_code
        };
      }).sort((a, b) => b.overdueDays - a.overdueDays),
      ...oOverallSla,
      ...oAverageProcessing
    };
  }

  async _getOverallSlaMetrics(req, filter, oRange, oCurrentUser) {
    const OverallSlaReport = cds.entities("flowmate.db").OverallSlaReport;
    const qMetrics = SELECT.from(OverallSlaReport)
      .columns(
        "mainFlowCode", "mainFlowName", "subFlowCode", "subFlowName", "slaResult",
        "count(ID) as volume", "sum(amount) as value"
      )
      .where([
        { ref: ["reportingDate"] }, ">=", { val: oRange.fromDateTime },
        "and",
        { ref: ["reportingDate"] }, "<=", { val: oRange.toDateTime }
      ])
      .groupBy("mainFlowCode", "mainFlowName", "subFlowCode", "subFlowName", "slaResult");

    if (!this._isAdministrator(req)) {
      qMetrics.where({ requesterUserId: oCurrentUser.user.ID });
    }
    if (filter.processTypeCode) {
      qMetrics.where({ mainFlowCode: filter.processTypeCode });
    }
    if (filter.subProcessTypeCode) {
      qMetrics.where({ subFlowCode: filter.subProcessTypeCode });
    }
    if (filter.statusCode) {
      qMetrics.where({ statusCode: filter.statusCode });
    }

    const aRows = await cds.tx(req).run(qMetrics);
    const fnAccumulator = (mainFlowCode = null, mainFlowName = null, subFlowCode = null, subFlowName = null) => ({
      mainFlowCode,
      mainFlowName: mainFlowName || this._reportLabel(mainFlowCode),
      subFlowCode,
      subFlowName: subFlowCode ? (subFlowName || this._reportLabel(subFlowCode)) : null,
      volume: 0,
      value: 0,
      withinSlaVolume: 0,
      withinSlaValue: 0,
      exceededSlaVolume: 0,
      exceededSlaValue: 0
    });
    const oOverall = fnAccumulator();
    const mMainFlows = new Map();
    const mSubFlows = new Map();
    const fnAdd = (oTarget, sResult, iVolume, fValue) => {
      oTarget.volume += iVolume;
      oTarget.value += fValue;
      if (sResult === "WITHIN_SLA") {
        oTarget.withinSlaVolume += iVolume;
        oTarget.withinSlaValue += fValue;
      } else if (sResult === "SLA_EXCEEDED") {
        oTarget.exceededSlaVolume += iVolume;
        oTarget.exceededSlaValue += fValue;
      }
    };

    aRows.forEach((oRow) => {
      const sMainCode = oRow.mainFlowCode || "UNSPECIFIED";
      const sSubCode = oRow.subFlowCode || "UNSPECIFIED";
      const sMainKey = sMainCode;
      const sSubKey = `${sMainCode}\u0000${sSubCode}`;
      const iVolume = Number(oRow.volume || oRow.VOLUME || 0);
      const fValue = Number(oRow.value || oRow.VALUE || 0);
      const sResult = oRow.slaResult;
      if (!mMainFlows.has(sMainKey)) {
        mMainFlows.set(sMainKey, fnAccumulator(sMainCode, oRow.mainFlowName));
      }
      if (!mSubFlows.has(sSubKey)) {
        mSubFlows.set(sSubKey, fnAccumulator(sMainCode, oRow.mainFlowName, sSubCode, oRow.subFlowName));
      }
      fnAdd(oOverall, sResult, iVolume, fValue);
      fnAdd(mMainFlows.get(sMainKey), sResult, iVolume, fValue);
      fnAdd(mSubFlows.get(sSubKey), sResult, iVolume, fValue);
    });

    const fnFinalize = (oMetric) => ({
      ...oMetric,
      value: Number(oMetric.value.toFixed(2)),
      withinSlaValue: Number(oMetric.withinSlaValue.toFixed(2)),
      exceededSlaValue: Number(oMetric.exceededSlaValue.toFixed(2)),
      withinSlaPercent: oMetric.volume ? Number(((oMetric.withinSlaVolume / oMetric.volume) * 100).toFixed(2)) : 0,
      exceededSlaPercent: oMetric.volume ? Number(((oMetric.exceededSlaVolume / oMetric.volume) * 100).toFixed(2)) : 0
    });
    const oTotals = fnFinalize(oOverall);
    const fnSort = (a, b) => b.volume - a.volume || a.mainFlowName.localeCompare(b.mainFlowName)
      || String(a.subFlowName || "").localeCompare(String(b.subFlowName || ""));

    return {
      overallSlaVolume: oTotals.volume,
      overallSlaValue: oTotals.value,
      overallWithinVolume: oTotals.withinSlaVolume,
      overallWithinValue: oTotals.withinSlaValue,
      overallWithinPercent: oTotals.withinSlaPercent,
      overallExceededVolume: oTotals.exceededSlaVolume,
      overallExceededValue: oTotals.exceededSlaValue,
      overallExceededPercent: oTotals.exceededSlaPercent,
      mainFlowSlaMetrics: [...mMainFlows.values()].map(fnFinalize).sort(fnSort),
      subFlowSlaMetrics: [...mSubFlows.values()].map(fnFinalize).sort(fnSort)
    };
  }

  async _getAverageProcessingMetrics(req, filter, oRange, oCurrentUser) {
    const AverageProcessingDaysReport = cds.entities("flowmate.db").AverageProcessingDaysReport;
    const qMetrics = SELECT.from(AverageProcessingDaysReport)
      .columns(
        "mainFlowCode", "mainFlowName", "subFlowCode", "subFlowName",
        "count(ID) as completedVolume", "sum(processingDays) as totalProcessingDays"
      )
      .where([
        { ref: ["reportingDate"] }, ">=", { val: oRange.fromDateTime },
        "and",
        { ref: ["reportingDate"] }, "<=", { val: oRange.toDateTime }
      ])
      .groupBy("mainFlowCode", "mainFlowName", "subFlowCode", "subFlowName");

    if (!this._isAdministrator(req)) {
      qMetrics.where({ requesterUserId: oCurrentUser.user.ID });
    }
    if (filter.processTypeCode) {
      qMetrics.where({ mainFlowCode: filter.processTypeCode });
    }
    if (filter.subProcessTypeCode) {
      qMetrics.where({ subFlowCode: filter.subProcessTypeCode });
    }
    const aRows = await cds.tx(req).run(qMetrics);
    const fnAccumulator = (mainFlowCode = null, mainFlowName = null, subFlowCode = null, subFlowName = null) => ({
      mainFlowCode,
      mainFlowName: mainFlowName || this._reportLabel(mainFlowCode),
      subFlowCode,
      subFlowName: subFlowCode ? (subFlowName || this._reportLabel(subFlowCode)) : null,
      completedVolume: 0,
      totalProcessingDays: 0
    });
    const oOverall = fnAccumulator();
    const mMainFlows = new Map();
    const mSubFlows = new Map();
    const fnAdd = (oTarget, iVolume, fDays) => {
      oTarget.completedVolume += iVolume;
      oTarget.totalProcessingDays += fDays;
    };

    aRows.forEach((oRow) => {
      const sMainCode = oRow.mainFlowCode || "UNSPECIFIED";
      const sSubCode = oRow.subFlowCode || "UNSPECIFIED";
      const sSubKey = `${sMainCode}\u0000${sSubCode}`;
      const iVolume = Number(oRow.completedVolume || oRow.COMPLETEDVOLUME || 0);
      const fDays = Number(oRow.totalProcessingDays || oRow.TOTALPROCESSINGDAYS || 0);
      if (!mMainFlows.has(sMainCode)) {
        mMainFlows.set(sMainCode, fnAccumulator(sMainCode, oRow.mainFlowName));
      }
      if (!mSubFlows.has(sSubKey)) {
        mSubFlows.set(sSubKey, fnAccumulator(sMainCode, oRow.mainFlowName, sSubCode, oRow.subFlowName));
      }
      fnAdd(oOverall, iVolume, fDays);
      fnAdd(mMainFlows.get(sMainCode), iVolume, fDays);
      fnAdd(mSubFlows.get(sSubKey), iVolume, fDays);
    });

    const fnFinalize = (oMetric) => ({
      mainFlowCode: oMetric.mainFlowCode,
      mainFlowName: oMetric.mainFlowName,
      subFlowCode: oMetric.subFlowCode,
      subFlowName: oMetric.subFlowName,
      completedVolume: oMetric.completedVolume,
      averageProcessingDays: oMetric.completedVolume
        ? Number((oMetric.totalProcessingDays / oMetric.completedVolume).toFixed(2))
        : 0
    });
    const fnSort = (a, b) => b.averageProcessingDays - a.averageProcessingDays
      || a.mainFlowName.localeCompare(b.mainFlowName)
      || String(a.subFlowName || "").localeCompare(String(b.subFlowName || ""));

    return {
      completedProcessingVolume: oOverall.completedVolume,
      overallAverageProcessingDays: oOverall.completedVolume
        ? Number((oOverall.totalProcessingDays / oOverall.completedVolume).toFixed(2))
        : 0,
      mainFlowProcessingMetrics: [...mMainFlows.values()].map(fnFinalize).sort(fnSort),
      subFlowProcessingMetrics: [...mSubFlows.values()].map(fnFinalize).sort(fnSort)
    };
  }

  _validatedReportChartSnapshots(req, sDashboardKey, charts) {
    const mAllowedChartKeys = {
      overallsla: new Set(["overallSlaVolume", "overallSlaValue"]),
      averageprocessing: new Set(["averageProcessing"]),
      operational: new Set(["statusBreakdown", "processBreakdown"]),
      sla: new Set(),
      teams: new Set(["teamWorkload"]),
      trends: new Set(["monthlyTrend", "processBreakdown"]),
      users: new Set(["userActivity"]),
      audit: new Set(["auditActivity"])
    };
    const aCharts = Array.isArray(charts) ? charts : [];
    if (aCharts.length > 4) {
      return req.reject(400, "A maximum of four dashboard charts can be exported at once");
    }
    const oAllowedKeys = mAllowedChartKeys[sDashboardKey];
    return aCharts.map((oChart) => {
      const sKey = String(oChart?.chartKey || "");
      const sTitle = String(oChart?.title || "").trim().slice(0, 150);
      const sSvg = String(oChart?.svg || "");
      if (!oAllowedKeys.has(sKey)) {
        return req.reject(400, `Chart ${sKey || "without a key"} is not valid for this dashboard`);
      }
      if (!sSvg.trim().startsWith("<svg") || sSvg.length > 1500000) {
        return req.reject(400, `Chart ${sKey} contains invalid or excessive SVG content`);
      }
      return { chartKey: sKey, title: sTitle || this._reportLabel(sKey), svg: this._sanitizeReportChartSvg(sSvg) };
    });
  }

  _sanitizeReportChartSvg(svg) {
    return svg
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
      .replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject\s*>/gi, "")
      .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, "")
      .replace(/\s+(?:href|xlink:href)\s*=\s*("|')(?!(?:#|data:image\/))[^"']*\1/gi, "");
  }

  _renderReportDashboardPdf(sDashboardKey, oData, oRange, aCharts = []) {
    const mTitles = {
      overallsla: "Overall SLA Dashboard",
      averageprocessing: "Average Processing Days",
      operational: "Operational Overview",
      sla: "SLA & Aging",
      teams: "Team Workload",
      trends: "Process Trends",
      users: "User Activity",
      audit: "Audit Activity"
    };
    const sTitle = mTitles[sDashboardKey];
    const sPeriod = `${oRange.fromDateTime.slice(0, 10)} to ${oRange.toDateTime.slice(0, 10)}`;

    return new Promise((resolve, reject) => {
      const oDocument = new PDFDocument({ size: "A4", layout: "landscape", margin: 42, bufferPages: true });
      const aChunks = [];
      oDocument.on("data", (oChunk) => aChunks.push(oChunk));
      oDocument.on("error", reject);
      oDocument.on("end", () => resolve({
        fileName: `flowmate-${sDashboardKey}-${oRange.toDateTime.slice(0, 10)}.pdf`,
        content: Buffer.concat(aChunks)
      }));

      this._drawPdfHeader(oDocument, sTitle, sPeriod);
      const fnDrawChartOrFallback = (sKey, sFallbackTitle, fnFallback) => {
        const oChart = aCharts.find((oItem) => oItem.chartKey === sKey);
        if (oChart) {
          this._drawPdfSvgChart(oDocument, oChart.title || sFallbackTitle, oChart.svg);
        } else {
          fnFallback();
        }
      };
      switch (sDashboardKey) {
        case "overallsla":
          this._drawPdfKpis(oDocument, [
            ["Transaction Volume", oData.overallSlaVolume],
            ["Transaction Value", Number(oData.overallSlaValue || 0).toFixed(2)],
            ["Within SLA", `${oData.overallWithinPercent}%`],
            ["SLA Exceeded", `${oData.overallExceededPercent}%`]
          ]);
          fnDrawChartOrFallback("overallSlaVolume", "SLA Volume by Main Flow", () =>
            this._drawPdfSlaBars(oDocument, "SLA Volume by Main Flow", oData.mainFlowSlaMetrics, "withinSlaVolume", "exceededSlaVolume"));
          fnDrawChartOrFallback("overallSlaValue", "SLA Value by Main Flow", () =>
            this._drawPdfSlaBars(oDocument, "SLA Value by Main Flow", oData.mainFlowSlaMetrics, "withinSlaValue", "exceededSlaValue"));
          this._drawPdfTable(oDocument, "SLA Performance by Sub Flow", oData.subFlowSlaMetrics, [
            ["Main Flow", "mainFlowName", 105], ["Sub Flow", "subFlowName", 130],
            ["Volume", "volume", 55], ["Value", "value", 75], ["Within %", "withinSlaPercent", 60],
            ["Exceeded %", "exceededSlaPercent", 65]
          ]);
          break;
        case "averageprocessing":
          this._drawPdfKpis(oDocument, [
            ["Average Processing Days", oData.overallAverageProcessingDays],
            ["Completed Requests", oData.completedProcessingVolume]
          ]);
          fnDrawChartOrFallback("averageProcessing", "Average Processing Days by Main Flow", () =>
            this._drawPdfBars(oDocument, "Average Processing Days by Main Flow", oData.mainFlowProcessingMetrics.map((oRow) => ({
              code: oRow.mainFlowCode,
              label: oRow.mainFlowName,
              count: oRow.averageProcessingDays
            }))));
          this._drawPdfTable(oDocument, "Average Processing Days by Sub Flow", oData.subFlowProcessingMetrics, [
            ["Main Flow", "mainFlowName", 180], ["Sub Flow", "subFlowName", 220],
            ["Completed", "completedVolume", 90], ["Average Days", "averageProcessingDays", 100]
          ]);
          break;
        case "sla":
          this._drawPdfKpis(oDocument, [
            ["SLA Compliance", `${oData.slaCompliancePercent}%`],
            ["Overdue Requests", oData.overdueRequests],
            ["Open Requests", oData.openRequests]
          ]);
          this._drawPdfTable(oDocument, "Overdue Open Tasks", oData.overdueTasks, [
            ["Request", "requestNumber", 80], ["Task", "taskName", 160], ["Team", "teamName", 130],
            ["Due Date", "dueDate", 80], ["Days", "overdueDays", 50]
          ]);
          break;
        case "teams":
          fnDrawChartOrFallback("teamWorkload", "Open Task Workload by Team", () =>
            this._drawPdfBars(oDocument, "Open Task Workload by Team", oData.teamWorkload));
          break;
        case "trends":
          fnDrawChartOrFallback("monthlyTrend", "Monthly Request Trend", () =>
            this._drawPdfTrend(oDocument, "Monthly Request Trend", oData.monthlyTrend));
          fnDrawChartOrFallback("processBreakdown", "Requests by Process Type", () =>
            this._drawPdfBars(oDocument, "Requests by Process Type", oData.processBreakdown));
          break;
        case "users":
          fnDrawChartOrFallback("userActivity", "Recorded Activities by User", () =>
            this._drawPdfBars(oDocument, "Recorded Activities by User", oData.userActivity));
          break;
        case "audit":
          fnDrawChartOrFallback("auditActivity", "Audit Events by Action", () =>
            this._drawPdfBars(oDocument, "Audit Events by Action", oData.auditActivity));
          break;
        default:
          this._drawPdfKpis(oDocument, [
            ["Total Requests", oData.totalRequests], ["Open Requests", oData.openRequests],
            ["Completed Requests", oData.completedRequests], ["Overdue Requests", oData.overdueRequests]
          ]);
          fnDrawChartOrFallback("statusBreakdown", "Requests by Status", () =>
            this._drawPdfBars(oDocument, "Requests by Status", oData.statusBreakdown));
          fnDrawChartOrFallback("processBreakdown", "Requests by Process Type", () =>
            this._drawPdfBars(oDocument, "Requests by Process Type", oData.processBreakdown));
      }

      const iPageCount = oDocument.bufferedPageRange().count;
      for (let iPage = 0; iPage < iPageCount; iPage += 1) {
        oDocument.switchToPage(iPage);
        oDocument.fontSize(8).fillColor("#64748b")
          .text(`Generated by Flowmate | Page ${iPage + 1} of ${iPageCount}`, 42, 535, { align: "right", width: 710, lineBreak: false });
      }
      oDocument.end();
    });
  }

  _drawPdfSvgChart(oDocument, sTitle, sSvg) {
    if (oDocument.y > 325) {
      oDocument.addPage();
      oDocument.y = 42;
    }
    oDocument.fillColor("#1e293b").font("Helvetica-Bold").fontSize(14).text(sTitle, 42, oDocument.y);
    const iTop = oDocument.y + 10;
    oDocument.roundedRect(42, iTop, 710, 300, 6).fillAndStroke("#ffffff", "#dbe3ea");
    SVGtoPDF(oDocument, sSvg, 52, iTop + 10, {
      width: 690,
      height: 280,
      preserveAspectRatio: "xMidYMid meet",
      assumePt: true
    });
    oDocument.y = iTop + 318;
  }

  _drawPdfHeader(oDocument, sTitle, sPeriod) {
    oDocument.fillColor("#0f7490").rect(0, 0, 842, 76).fill();
    oDocument.fillColor("#ffffff").font("Helvetica-Bold").fontSize(22).text(sTitle, 42, 22);
    oDocument.font("Helvetica").fontSize(10).text(`Reporting period: ${sPeriod}`, 42, 51);
    oDocument.y = 98;
  }

  _drawPdfKpis(oDocument, aKpis) {
    const iWidth = 165;
    const iGap = 14;
    const iTop = oDocument.y;
    aKpis.forEach(([sLabel, vValue], iIndex) => {
      const iLeft = 42 + iIndex * (iWidth + iGap);
      oDocument.roundedRect(iLeft, iTop, iWidth, 62, 6).fillAndStroke("#f0f9fb", "#b9dce4");
      oDocument.fillColor("#475569").font("Helvetica").fontSize(9).text(String(sLabel), iLeft + 12, iTop + 11, { width: iWidth - 24 });
      oDocument.fillColor("#0f7490").font("Helvetica-Bold").fontSize(20).text(String(vValue ?? 0), iLeft + 12, iTop + 29, { width: iWidth - 24 });
    });
    oDocument.y = iTop + 80;
  }

  _drawPdfBars(oDocument, sTitle, aRows = []) {
    if (oDocument.y > 390) {
      oDocument.addPage();
      oDocument.y = 42;
    }
    oDocument.fillColor("#1e293b").font("Helvetica-Bold").fontSize(14).text(sTitle, 42, oDocument.y);
    const aVisibleRows = aRows.slice(0, 10);
    if (!aVisibleRows.length) {
      oDocument.moveDown(0.6).fillColor("#64748b").font("Helvetica").fontSize(10).text("No data for the selected filters.");
      oDocument.moveDown(1);
      return;
    }
    const iMaximum = Math.max(...aVisibleRows.map((oRow) => Number(oRow.count || 0)), 1);
    let iTop = oDocument.y + 12;
    aVisibleRows.forEach((oRow) => {
      const iCount = Number(oRow.count || 0);
      oDocument.fillColor("#334155").font("Helvetica").fontSize(9).text(String(oRow.label || oRow.code), 42, iTop + 3, { width: 170, ellipsis: true });
      oDocument.fillColor("#e2e8f0").rect(220, iTop, 450, 14).fill();
      oDocument.fillColor("#0f7490").rect(220, iTop, Math.max(2, (iCount / iMaximum) * 450), 14).fill();
      oDocument.fillColor("#334155").font("Helvetica-Bold").text(String(iCount), 680, iTop + 3, { width: 50, align: "right" });
      iTop += 22;
    });
    oDocument.y = iTop + 12;
  }

  _drawPdfSlaBars(oDocument, sTitle, aRows = [], sWithinProperty, sExceededProperty) {
    if (oDocument.y > 390) {
      oDocument.addPage();
      oDocument.y = 42;
    }
    oDocument.fillColor("#1e293b").font("Helvetica-Bold").fontSize(14).text(sTitle, 42, oDocument.y);
    const aVisibleRows = aRows.slice(0, 10);
    if (!aVisibleRows.length) {
      oDocument.moveDown(0.6).fillColor("#64748b").font("Helvetica").fontSize(10).text("No data for the selected filters.");
      oDocument.moveDown(1);
      return;
    }
    const iMaximum = Math.max(...aVisibleRows.map((oRow) =>
      Number(oRow[sWithinProperty] || 0) + Number(oRow[sExceededProperty] || 0)), 1);
    let iTop = oDocument.y + 12;
    aVisibleRows.forEach((oRow) => {
      const fWithin = Number(oRow[sWithinProperty] || 0);
      const fExceeded = Number(oRow[sExceededProperty] || 0);
      const iWithinWidth = (fWithin / iMaximum) * 430;
      const iExceededWidth = (fExceeded / iMaximum) * 430;
      oDocument.fillColor("#334155").font("Helvetica").fontSize(9)
        .text(String(oRow.mainFlowName || oRow.mainFlowCode), 42, iTop + 3, { width: 170, ellipsis: true });
      oDocument.fillColor("#e2e8f0").rect(220, iTop, 430, 14).fill();
      if (iWithinWidth > 0) oDocument.fillColor("#30914c").rect(220, iTop, iWithinWidth, 14).fill();
      if (iExceededWidth > 0) oDocument.fillColor("#c0392b").rect(220 + iWithinWidth, iTop, iExceededWidth, 14).fill();
      oDocument.fillColor("#334155").font("Helvetica-Bold").fontSize(8)
        .text(`${fWithin} / ${fExceeded}`, 660, iTop + 3, { width: 70, align: "right" });
      iTop += 22;
    });
    oDocument.fillColor("#30914c").font("Helvetica-Bold").fontSize(8).text("Within SLA", 220, iTop + 2);
    oDocument.fillColor("#c0392b").text("SLA Exceeded", 290, iTop + 2);
    oDocument.y = iTop + 22;
  }

  _drawPdfTrend(oDocument, sTitle, aRows = []) {
    oDocument.fillColor("#1e293b").font("Helvetica-Bold").fontSize(14).text(sTitle, 42, oDocument.y);
    const aVisibleRows = aRows.slice(-12);
    if (!aVisibleRows.length) {
      oDocument.moveDown(0.6).fillColor("#64748b").font("Helvetica").fontSize(10).text("No data for the selected filters.");
      oDocument.moveDown(1);
      return;
    }
    const iLeft = 70;
    const iTop = oDocument.y + 18;
    const iWidth = 650;
    const iHeight = 130;
    const iMaximum = Math.max(...aVisibleRows.map((oRow) => Number(oRow.count || 0)), 1);
    oDocument.strokeColor("#cbd5e1").moveTo(iLeft, iTop).lineTo(iLeft, iTop + iHeight).lineTo(iLeft + iWidth, iTop + iHeight).stroke();
    const aPoints = aVisibleRows.map((oRow, iIndex) => ({
      x: iLeft + (aVisibleRows.length === 1 ? iWidth / 2 : (iIndex / (aVisibleRows.length - 1)) * iWidth),
      y: iTop + iHeight - (Number(oRow.count || 0) / iMaximum) * iHeight,
      row: oRow
    }));
    oDocument.strokeColor("#0f7490").lineWidth(2);
    aPoints.forEach((oPoint, iIndex) => iIndex ? oDocument.lineTo(oPoint.x, oPoint.y) : oDocument.moveTo(oPoint.x, oPoint.y));
    oDocument.stroke();
    aPoints.forEach((oPoint) => {
      oDocument.fillColor("#0f7490").circle(oPoint.x, oPoint.y, 3).fill();
      oDocument.fillColor("#475569").font("Helvetica").fontSize(7).text(String(oPoint.row.label), oPoint.x - 25, iTop + iHeight + 6, { width: 50, align: "center" });
    });
    oDocument.y = iTop + iHeight + 35;
  }

  _drawPdfTable(oDocument, sTitle, aRows = [], aColumns = []) {
    if (oDocument.y > 390) {
      oDocument.addPage();
      oDocument.y = 42;
    }
    oDocument.fillColor("#1e293b").font("Helvetica-Bold").fontSize(14).text(sTitle, 42, oDocument.y);
    let iTop = oDocument.y + 12;
    const fnDrawRow = (oRow, bHeader = false) => {
      let iLeft = 42;
      aColumns.forEach(([sLabel, sProperty, iWidth]) => {
        oDocument.fillColor(bHeader ? "#0f7490" : "#334155").font(bHeader ? "Helvetica-Bold" : "Helvetica").fontSize(8)
          .text(String(bHeader ? sLabel : (oRow[sProperty] ?? "")), iLeft + 4, iTop + 5, { width: iWidth - 8, ellipsis: true });
        iLeft += iWidth;
      });
      oDocument.strokeColor("#dbe3ea").moveTo(42, iTop + 20).lineTo(iLeft, iTop + 20).stroke();
      iTop += 21;
    };
    fnDrawRow({}, true);
    aRows.slice(0, 16).forEach((oRow) => fnDrawRow(oRow));
    if (!aRows.length) {
      oDocument.fillColor("#64748b").font("Helvetica").fontSize(10).text("No overdue tasks for the selected filters.", 46, iTop + 6);
      iTop += 28;
    }
    oDocument.y = iTop + 10;
  }

  _reportDateRange(req, fromDate, toDate) {
    const oToday = new Date();
    const oDefaultFrom = new Date(Date.UTC(oToday.getUTCFullYear(), oToday.getUTCMonth(), 1));
    const sFrom = fromDate || oDefaultFrom.toISOString().slice(0, 10);
    const sTo = toDate || oToday.toISOString().slice(0, 10);
    const oFrom = new Date(`${sFrom}T00:00:00Z`);
    const oTo = new Date(`${sTo}T23:59:59.999Z`);

    if (!Number.isFinite(oFrom.getTime()) || !Number.isFinite(oTo.getTime()) || oFrom > oTo) {
      return req.reject(400, "Enter a valid reporting date range");
    }
    if ((oTo - oFrom) / 86400000 > 366) {
      return req.reject(400, "The reporting date range cannot exceed 366 days");
    }
    return { fromDateTime: oFrom.toISOString(), toDateTime: oTo.toISOString() };
  }

  _reportLabel(value) {
    return String(value || "Unspecified")
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (sCharacter) => sCharacter.toUpperCase());
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
    if (this._isAdministrator(req)) {
      return;
    }
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

  async _filterByAssignedTasks(req, Users, forceUserScope = false) {
    if (this._isAdministrator(req) && !forceUserScope) {
      return;
    }
    const oReservationUser = await this._currentReservationUser(req, Users);
    const aPredicates = this._taskAssignmentPredicates(oReservationUser);

    if (!aPredicates.length) {
      req.query.where(this._alwaysFalsePredicate());
      return;
    }

    req.query.where({ xpr: aPredicates });
  }

  async _filterByTeamTasks(req, Users, TeamMembers = this.masterEntities.TeamMembers, forceUserScope = false) {
    if (this._isAdministrator(req) && !forceUserScope) {
      return;
    }
    const oReservationUser = await this._currentReservationUser(req, Users);
    const aMemberships = await this.master.run(
      SELECT.from(TeamMembers)
        .columns("team_ID")
        .where({ user_ID: oReservationUser.user.ID, isActive: true })
    );
    const aTeamIds = [...new Set(aMemberships.map((oMembership) => oMembership.team_ID).filter(Boolean))];

    if (!aTeamIds.length) {
      req.query.where(this._alwaysFalsePredicate());
      return;
    }

    req.query
      .where({ isTeamTask: true })
      .where([
        { ref: ["processorUser_ID"] }, "is", "null",
        "and", { ref: ["processorEmail"] }, "is", "null",
        "and", { ref: ["processorTeam_ID"] }, "in", { list: aTeamIds.map((sTeamId) => ({ val: sTeamId })) }
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

  async _isTeamTaskVisibleForUser(req, taskId, reservationUser, TeamMembers = this.masterEntities.TeamMembers) {
    if (!reservationUser.user?.ID) {
      return false;
    }

    const oTask = await cds.tx(req).run(
      SELECT.one.from(this.entities.ProcessTasks)
        .columns("processorTeam_ID")
        .where({ ID: taskId })
    );
    if (!oTask?.processorTeam_ID) {
      return false;
    }

    const oMembership = await this.master.run(
      SELECT.one.from(TeamMembers).columns("ID").where({
        team_ID: oTask.processorTeam_ID,
        user_ID: reservationUser.user.ID,
        isActive: true
      })
    );

    return Boolean(oMembership);
  }

  _taskAssignmentPredicates(reservationUser) {
    const aPredicates = [];

    if (reservationUser.user?.ID) {
      this._addStringEqualsPredicate(aPredicates, "processorUser_ID", reservationUser.user.ID);
    }

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
    const sAuthenticatedPrincipal = req.user?.id || "anonymous";
    const sPrincipal = process.env.NODE_ENV !== "production" && sAuthenticatedPrincipal === "anonymous"
      ? process.env.FLOWMATE_LOCAL_USER || "ca.admin@flowmate.demo"
      : sAuthenticatedPrincipal;
    const sEmail = this._emailFromAuthenticatedUser(req.user);
    const sNormalizedPrincipal = String(sPrincipal).trim().toLowerCase();
    const sNormalizedEmail = String(sEmail || sPrincipal).trim().toLowerCase();
    const aActiveUsers = await this.master.run(
      SELECT.from(Users)
        .columns("ID", "email", "userPrincipalName", "azureObjectId", "displayName", "department")
        .where({ isActive: true })
    );
    let oUser = aActiveUsers.find((oCandidate) => {
      const sCandidateEmail = String(oCandidate.email || "").trim().toLowerCase();
      const sCandidatePrincipal = String(oCandidate.userPrincipalName || "").trim().toLowerCase();
      const sCandidateObjectId = String(oCandidate.azureObjectId || "").trim().toLowerCase();

      return sCandidateEmail === sNormalizedEmail
        || sCandidatePrincipal === sNormalizedPrincipal
        || sCandidateObjectId === sNormalizedPrincipal;
    });
    if (!oUser && cds.env.profiles?.includes("development")) {
      const sLocalUser = String(process.env.FLOWMATE_LOCAL_USER || "ca.admin@flowmate.demo").trim().toLowerCase();
      oUser = aActiveUsers.find((oCandidate) =>
        [oCandidate.email, oCandidate.userPrincipalName]
          .some((sCandidate) => String(sCandidate || "").trim().toLowerCase() === sLocalUser)
      );
    }
    if (!oUser) {
      return req.reject(403, "Your user is not provisioned in the shared Flowmate master data service");
    }
    const sResolvedEmail = sEmail || oUser?.email || oUser?.userPrincipalName || (this._looksLikeEmail(sPrincipal) ? sPrincipal : "");

    return {
      user: oUser,
      principal: sPrincipal,
      email: sResolvedEmail,
      displayName: oUser ? this._userDisplayName(oUser) : sPrincipal
    };
  }

  _applyVisibleRequestsWhere(query, reservationUser) {
    query.where({ requesterUser_ID: reservationUser.user.ID });
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

    const steps = await this._getSteps(req, request.subProcessType_code);
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

    const steps = await this._getSteps(req, request.subProcessType_code);
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
      const oDeadline = await this._calculateSlaDeadline(req, request.subProcessType_code, guidedNextStep.slaDays);
      await cds.tx(req).run(
        UPDATE(this.entities.ProcessRequests, requestId).set({
          status_code: sNewRequestStatus,
          currentStep: guidedNextStep.stepNo,
          ...oDeadline,
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

  async _getSteps(req, subProcessTypeCode) {
    if (!subProcessTypeCode) {
      return [];
    }

    const sCacheKey = this._configCacheKey("steps", subProcessTypeCode);
    const aCachedSteps = this._getConfigCache(sCacheKey);

    if (aCachedSteps) {
      return aCachedSteps.map((step) => ({ ...step }));
    }

    const aSteps = await cds.tx(req).run(
      SELECT.from(this.entities.ProcessStepConfig)
        .where({ subProcessType_code: subProcessTypeCode })
        .orderBy("stepNo")
    );

    this._setConfigCache(sCacheKey, aSteps.map((step) => ({ ...step })));

    return aSteps;
  }

  async _resolveLoaRole(req, LoaApproval, amount) {
    const aRules = await cds.tx(req).run(
      SELECT.from(LoaApproval).columns("amount", "operator_code", "roleCode")
    );
    let oWinner = null;

    for (const oRule of aRules) {
      const fThreshold = Number(oRule.amount);

      if (!Number.isFinite(fThreshold) || !this._evaluateLoaOperator(amount, oRule.operator_code, fThreshold)) {
        continue;
      }

      if (!oWinner) {
        oWinner = oRule;
        continue;
      }

      const bPrefersHigher = oRule.operator_code === ">" || oRule.operator_code === ">=";
      const fWinnerThreshold = Number(oWinner.amount);

      if ((bPrefersHigher && fThreshold > fWinnerThreshold) || (!bPrefersHigher && fThreshold < fWinnerThreshold)) {
        oWinner = oRule;
      }
    }

    return oWinner?.roleCode || "";
  }

  _evaluateLoaOperator(amount, operator, threshold) {
    return {
      "=": amount === threshold,
      "!=": amount !== threshold,
      "<": amount < threshold,
      "<=": amount <= threshold,
      ">": amount > threshold,
      ">=": amount >= threshold
    }[operator] || false;
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
    const steps = await this._getSteps(req, oRequest?.subProcessType_code);
    const firstTaskStep = this._getInitialGuidedStep(steps);

    if (firstTaskStep) {
      await this._createTask(req, requestId, firstTaskStep, { skipIfExistingStep: true, request: oRequest });

      if (options.updateRequest && (
        Number(oRequest?.currentStep || 0) !== Number(firstTaskStep.stepNo || 0)
        || oRequest?.status_code !== PROCESS_STATUS.IN_PROGRESS
      )) {
        const oDeadline = await this._calculateSlaDeadline(req, oRequest.subProcessType_code, firstTaskStep.slaDays);
        await cds.tx(req).run(
          UPDATE(this.entities.ProcessRequests, requestId).set({
            status_code: PROCESS_STATUS.IN_PROGRESS,
            currentStep: firstTaskStep.stepNo,
            ...oDeadline
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
      await this._notifyTeamAssignment(req, {
        assignmentType: "TASK",
        request,
        task: {
          ID: sTaskId,
          referenceNumber: sReferenceNumber,
          request_ID: requestId,
          taskName: step.stepName,
          processorTeam_ID: oTaskOwnership.processorTeam_ID,
          processorTeamName: oTaskOwnership.processorTeamName
        },
        teamId: oTaskOwnership.processorTeam_ID,
        teamName: oTaskOwnership.processorTeamName
      });
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

  async _runSlaBreachScan(req) {
    const sToday = new Date().toISOString().slice(0, 10);
    const ProcessRequests = this.entities.ProcessRequests;
    const ProcessTasks = this.entities.ProcessTasks;
    const aOpenRequests = await cds.tx(req).run(
      SELECT.from(ProcessRequests)
        .columns(
          "ID", "referenceNumber", "requester", "department", "amount", "dueDate", "slaDueAt",
          "processorUser_ID", "processorTeam_ID", "processorTeamName", "status_code"
        )
        .where([
          { ref: ["status_code"] }, "not in", {
            list: [PROCESS_STATUS.COMPLETED, PROCESS_STATUS.REJECTED].map((status) => ({ val: status }))
          }
        ])
    );
    const aRequests = aOpenRequests.filter((request) => this._isSlaDeadlineBreached(request, sToday));
    const aRequestIds = aRequests.map((oRequest) => oRequest.ID);
    const aTasks = aRequestIds.length
      ? await cds.tx(req).run(
        SELECT.from(ProcessTasks)
          .columns(
            "ID", "referenceNumber", "request_ID", "taskName", "status_code",
            "assignedUser_ID", "processorUser_ID", "processorTeam_ID", "processorTeamName",
            "processor", "processorEmail"
          )
          .where({
            request_ID: { in: aRequestIds },
            status_code: { in: [TASK_STATUS.OPEN, TASK_STATUS.SENT_BACK] }
          })
      )
      : [];
    const mRequests = new Map(aRequests.map((oRequest) => [oRequest.ID, oRequest]));
    const oResult = {
      overdueRequests: aRequests.length,
      overdueTasks: aTasks.length,
      notificationsSent: 0,
      notificationsFailed: 0,
      notificationsSkipped: 0
    };

    for (const oRequest of aRequests) {
      await this._processSlaTarget(req, {
        targetType: "PROCESS",
        target: oRequest,
        request: oRequest,
        dueDate: oRequest.slaDueAt || oRequest.dueDate
      }, oResult);
    }

    for (const oTask of aTasks) {
      await this._processSlaTarget(req, {
        targetType: "TASK",
        target: oTask,
        request: mRequests.get(oTask.request_ID),
        dueDate: mRequests.get(oTask.request_ID)?.slaDueAt || mRequests.get(oTask.request_ID)?.dueDate
      }, oResult);
    }

    cds.log("sla-scheduler").info("SLA breach scan completed", oResult);
    return oResult;
  }

  async _processSlaTarget(req, slaTarget, result) {
    const aRecipients = await this._slaRecipients(req, slaTarget.target);

    if (!aRecipients.length) {
      result.notificationsSkipped += 1;
      cds.log("sla-scheduler").warn(
        `No active recipient is configured for ${slaTarget.targetType} ${slaTarget.target.ID}`
      );
      return;
    }

    for (const oRecipient of aRecipients) {
      const sNotificationKey = [
        "SLA_BREACH",
        slaTarget.targetType,
        slaTarget.target.ID,
        slaTarget.dueDate,
        oRecipient.email
      ].join(":").toLowerCase();
      const bClaimed = await this._claimSlaNotification(req, {
        notificationKey: sNotificationKey,
        requestId: slaTarget.request.ID,
        taskId: slaTarget.targetType === "TASK" ? slaTarget.target.ID : null,
        targetType: slaTarget.targetType,
        recipient: oRecipient.email,
        dueDate: slaTarget.dueDate
      });

      if (!bClaimed) {
        result.notificationsSkipped += 1;
        continue;
      }

      try {
        await this._startBpaEmailWorkflow(req, {
          assignment: {
            assignmentType: slaTarget.targetType,
            task: slaTarget.targetType === "TASK" ? slaTarget.target : null,
            teamName: slaTarget.target.processorTeamName || null
          },
          request: slaTarget.request,
          recipient: oRecipient
        });
        await this._completeSlaNotification(req, sNotificationKey, "SENT");
        result.notificationsSent += 1;
      } catch (error) {
        await this._completeSlaNotification(req, sNotificationKey, "FAILED", error.message);
        result.notificationsFailed += 1;
      }
    }
  }

  async _slaRecipients(req, target) {
    let aCandidates = [];
    const sUserId = target.processorUser_ID || target.assignedUser_ID;

    if (sUserId) {
      const oUser = await this._getUser(req, sUserId, this.masterEntities.Users);
      if (oUser) {
        aCandidates.push({
          email: this._userEmail(oUser),
          displayName: this._userDisplayName(oUser)
        });
      }
    } else if (target.processorTeam_ID) {
      const aMembers = await this.master.run(
        SELECT.from(this.masterEntities.TeamMembers).where({
          team_ID: target.processorTeam_ID,
          isActive: true
        })
      );
      aCandidates = aMembers.map((oMember) => ({
        email: oMember.email,
        displayName: oMember.displayName
      }));
    } else if (target.processorEmail) {
      aCandidates.push({
        email: target.processorEmail,
        displayName: target.processor || target.processorEmail
      });
    }

    const aRecipients = [];
    for (const oCandidate of aCandidates) {
      const sEmail = String(oCandidate.email || "").trim().toLowerCase();
      if (!sEmail) {
        continue;
      }
      const oResolved = await this._resolveDelegatedRecipient(
        req,
        sEmail,
        this.masterEntities.Delegations
      );
      const sRecipient = String(oResolved.recipient || "").trim().toLowerCase();
      if (sRecipient && !aRecipients.some((oEntry) => oEntry.email === sRecipient)) {
        aRecipients.push({
          email: sRecipient,
          displayName: oCandidate.displayName || sRecipient
        });
      }
    }

    return aRecipients;
  }

  async _claimSlaNotification(req, notification) {
    const SlaNotificationStates = cds.entities("flowmate.db").SlaNotificationStates;
    const oExisting = await cds.tx(req).run(
      SELECT.one.from(SlaNotificationStates).where({ notificationKey: notification.notificationKey })
    );
    const iMaxAttempts = Math.max(1, Number(process.env.FLOWMATE_SLA_MAX_RETRIES || 5));
    const iAttempts = Number(oExisting?.attempts || 0);
    const iStaleBefore = Date.now() - 15 * 60 * 1000;
    const bProcessing = oExisting?.status === "PROCESSING"
      && Date.parse(oExisting.lastAttemptAt || 0) > iStaleBefore;

    if (oExisting?.status === "SENT" || iAttempts >= iMaxAttempts || bProcessing) {
      return false;
    }

    if (oExisting) {
      await cds.tx(req).run(
        UPDATE(SlaNotificationStates, notification.notificationKey).set({
          status: "PROCESSING",
          attempts: iAttempts + 1,
          lastAttemptAt: this._now(),
          lastError: null
        })
      );
      return true;
    }

    try {
      await cds.tx(req).run(
        INSERT.into(SlaNotificationStates).entries({
          notificationKey: notification.notificationKey,
          request_ID: notification.requestId,
          task_ID: notification.taskId,
          targetType: notification.targetType,
          recipient: notification.recipient,
          dueDate: notification.dueDate ? String(notification.dueDate).slice(0, 10) : null,
          status: "PROCESSING",
          attempts: 1,
          lastAttemptAt: this._now()
        })
      );
      return true;
    } catch (error) {
      if (/unique|duplicate/i.test(error.message || "")) {
        return false;
      }
      throw error;
    }
  }

  async _completeSlaNotification(req, notificationKey, status, errorMessage = null) {
    const SlaNotificationStates = cds.entities("flowmate.db").SlaNotificationStates;
    await cds.tx(req).run(
      UPDATE(SlaNotificationStates, notificationKey).set({
        status,
        notifiedAt: status === "SENT" ? this._now() : null,
        lastError: errorMessage
      })
    );
  }

  async _notifyTeamAssignment(req, assignment) {
    const oLog = cds.log("team-notifications");

    try {
      const oRequest = assignment.request || await this._getRequest(
        req,
        assignment.task?.request_ID
      );
      const aMembers = await this.master.run(
        SELECT.from(this.masterEntities.TeamMembers).where({
          team_ID: assignment.teamId,
          isActive: true
        })
      );
      const aRecipients = [];

      for (const oMember of aMembers) {
        const sMemberEmail = String(oMember.email || "").trim().toLowerCase();

        if (!sMemberEmail) {
          continue;
        }

        const oResolved = await this._resolveDelegatedRecipient(
          req,
          sMemberEmail,
          this.masterEntities.Delegations
        );
        const sRecipient = String(oResolved.recipient || "").trim().toLowerCase();

        if (sRecipient && !aRecipients.some((oRecipient) => oRecipient.email === sRecipient)) {
          aRecipients.push({
            email: sRecipient,
            displayName: oMember.displayName || sRecipient
          });
        }
      }

      if (!aRecipients.length) {
        oLog.warn(`No active team-member email is maintained for team ${assignment.teamId}`);
        return;
      }

      for (const oRecipient of aRecipients) {
        try {
          await this._startBpaEmailWorkflow(req, {
            assignment,
            request: oRequest,
            recipient: oRecipient
          });
        } catch (error) {
          oLog.error(`Team-assignment notification failed for ${oRecipient.email}`, error);
        }
      }
    } catch (error) {
      // Assignment remains successful if the external notification endpoint is unavailable.
      oLog.error("Team-assignment notification failed", error);
    }
  }

  async _startBpaEmailWorkflow(req, notification) {
    const { assignment, request, recipient } = notification;
    const sRequestId = request?.ID || assignment.task?.request_ID || null;
    const sSubject = assignment.assignmentType === "TASK"
      ? `Flowmate task assigned to ${assignment.teamName || "your team"}`
      : `Flowmate process assigned to ${assignment.teamName || "your team"}`;
    const sJwt = this._requestJwt(req);
    const bUseUserDestination = this._hasBusinessUserJwt(req, sJwt);
    const sDestinationName = bUseUserDestination
      ? BPA_USER_DESTINATION
      : BPA_TECHNICAL_DESTINATION;
    const oPayload = {
      definitionId: BPA_EMAIL_DEFINITION_ID,
      context: {
        requesterName: request?.requester || "",
        requestID: request?.referenceNumber || sRequestId || "",
        department: request?.department || "",
        displayName: recipient.displayName,
        uRL: this._assignmentUrl(req, sRequestId, assignment.task?.ID),
        amount: Number(request?.amount || 0),
        email: recipient.email
      }
    };

    try {
      await executeHttpRequest(
        {
          destinationName: sDestinationName,
          ...(bUseUserDestination ? { jwt: sJwt } : {})
        },
        {
          method: "POST",
          url: BPA_WORKFLOW_PATH,
          data: oPayload,
          headers: { "content-type": "application/json" }
        }
      );
      await this._recordTeamNotification(req, {
        requestId: sRequestId,
        recipient: recipient.email,
        subject: sSubject,
        status: "SENT"
      });
    } catch (error) {
      await this._recordTeamNotification(req, {
        requestId: sRequestId,
        recipient: recipient.email,
        subject: sSubject,
        status: "FAILED",
        errorMessage: error.message
      });
      throw error;
    }
  }

  async _recordTeamNotification(req, notification) {
    if (!notification.requestId) {
      return;
    }

    await cds.tx(req).run(
      INSERT.into(this.entities.ProcessEmailMessages).entries({
        ID: cds.utils.uuid(),
        referenceNumber: await this._nextReferenceNumber(req, this.entities.ProcessEmailMessages, "EML"),
        request_ID: notification.requestId,
        toRecipients: notification.recipient,
        subject: notification.subject,
        body: notification.subject,
        status: notification.status,
        interfaceSystem: "BPA_EMAIL_WORKFLOW",
        queuedAt: this._now(),
        sentAt: notification.status === "SENT" ? this._now() : null,
        errorMessage: notification.errorMessage || null
      })
    );
  }

  _requestJwt(req) {
    const sAuthorization = req?.headers?.authorization || "";
    const sBearerToken = /^Bearer\s+(.+)$/i.exec(sAuthorization)?.[1];

    return req?.user?.authInfo?.token?.jwt || sBearerToken || undefined;
  }

  _hasBusinessUserJwt(req, jwt) {
    if (!jwt) {
      return false;
    }

    const sGrantType = req?.user?.authInfo?.getGrantType?.()
      || req?.user?.authInfo?.token?.grantType
      || "";

    return String(sGrantType).toLowerCase() !== "client_credentials";
  }

  _assignmentUrl(req, requestId, taskId) {
    const sConfiguredUrl = String(process.env.FLOWMATE_APP_URL || "").replace(/\/$/, "");
    const sForwardedHost = req?.headers?.["x-forwarded-host"];
    const sProtocol = req?.headers?.["x-forwarded-proto"] || "https";
    const sOrigin = sConfiguredUrl || req?.headers?.origin || (sForwardedHost ? `${sProtocol}://${sForwardedHost}` : "");
    const sRoute = taskId ? `tasks/${taskId}` : `requests/${requestId}`;

    return sOrigin ? `${sOrigin}/index.html#/${sRoute}` : `#/${sRoute}`;
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
