const cds = require("@sap/cds");
const { SELECT, UPDATE } = cds.ql;
const INTERNAL_FIELDS = ["loaWorkflowMode", "loaStepNo", "loaBeforeProcessing", "loaApprovalState"];

module.exports = (amountSources) => ({
  async _validateLoaInvoiceWrite(req) {
    const tx = cds.tx(req);
    const id = req.data.ID || req.params?.at(-1)?.ID;
    const existing = req.event !== "CREATE" && id
      ? await tx.run(SELECT.one.from(this.entities.Invoices).where({ ID: id })) : null;
    if (existing && req.data.request_ID && req.data.request_ID !== existing.request_ID) {
      return req.reject(409, "An invoice cannot be moved to a different request");
    }
    const requestId = existing?.request_ID || req.data.request_ID;
    if (!requestId) return req.reject(400, "A request is required for the invoice");
    const request = await tx.run(SELECT.one.from(this.entities.ProcessRequests).where({ ID: requestId }).forUpdate());
    if (request?.loaWorkflowMode !== "GUIDED") return;
    await this._rejectIfRequestLocked(req, requestId);
    if (request.loaApprovalState === "APPROVED" && amountSources[request.subProcessType_code] === "highestInvoiceValue") {
      return req.reject(409, "Invoices used for an approved LoA cannot be changed; create a successor request");
    }
  },

  async _validateManualTaskLoaFields(req, existing) {
    if (req.data.isLoaApproval || (existing && Object.hasOwn(req.data, "isLoaApproval"))) {
      return req.reject(409, "LoA tasks are created and maintained by the approval workflow only");
    }
    if (existing && Object.hasOwn(req.data, "request_ID") && req.data.request_ID !== existing.request_ID) {
      return req.reject(409, "A task cannot be moved to a different request");
    }
    const request = await this._getRequest(req, existing?.request_ID || req.data.request_ID);
    if (request?.status_code === "PENDING_APPROVAL") return req.reject(409, "Tasks cannot be changed while the request is awaiting LoA approval");
    if (request?.loaWorkflowMode !== "GUIDED") return;
    const stepNo = Number(req.data.stepNo ?? existing?.stepNo ?? request.currentStep);
    if (stepNo === Number(request.loaStepNo)
      || (request.loaApprovalState !== "APPROVED" && stepNo >= Number(request.loaStepNo))) {
      return req.reject(409, "Complete LoA approval before creating or moving tasks at or beyond the approval step");
    }
  },

  _isLoaStep(step) { return step?.stepType === "LOA"; },

  _isRequesterSubmissionStep(step) {
    return /requester/i.test(step?.role || "")
      || /request (?:creation|submission|raised)|create request/i.test(step?.stepName || "");
  },

  _loaPlan(subtype, steps) {
    const approvalSteps = steps.filter((step) => this._isLoaStep(step));
    if (approvalSteps.length > 1) throw new Error("Only one LoA approval step is allowed per process subtype");
    if (!subtype?.loaApprovalApplicable) {
      if (approvalSteps.length) throw new Error("Enable LoA approval for the subtype before configuring an LoA step");
      return { loaWorkflowMode: "NONE", loaStepNo: null, loaBeforeProcessing: false, loaApprovalState: null };
    }
    if (!approvalSteps.length) {
      return { loaWorkflowMode: "LEGACY", loaStepNo: 0, loaBeforeProcessing: true, loaApprovalState: "PENDING" };
    }
    const step = approvalSteps[0];
    const index = steps.indexOf(step);
    const upfront = index === 0 || (index === 1 && this._isRequesterSubmissionStep(steps[0]));
    return { loaWorkflowMode: "GUIDED", loaStepNo: step.stepNo, loaBeforeProcessing: upfront,
      loaApprovalState: upfront ? "PENDING" : "WAITING" };
  },

  async _prepareLoaSnapshot(req, existing, subtype) {
    if (INTERNAL_FIELDS.some((field) => Object.hasOwn(req.data, field))) {
      return req.reject(400, "LoA workflow position and state are managed by the server");
    }
    if (existing) {
      if (existing.status_code === "PENDING_APPROVAL") {
        return req.reject(409, "This request is awaiting LoA approval and cannot be changed");
      }
      if (existing.loaWorkflowMode === "GUIDED") {
        if (Object.hasOwn(req.data, "tasks")) return req.reject(409, "Use the task endpoints to maintain tasks; approval tasks are workflow-managed");
        if (Object.hasOwn(req.data, "subProcessType_code") && req.data.subProcessType_code !== existing.subProcessType_code) {
          return req.reject(409, "The process subtype cannot change after request creation; create a successor request");
        }
        for (const field of ["status_code", "currentStep"]) {
          if (Object.hasOwn(req.data, field) && req.data[field] !== existing[field]) {
            return req.reject(409, "Use workflow actions to change the request status or guided step");
          }
        }
        if (existing.loaApprovalState === "APPROVED") {
          if (amountSources[existing.subProcessType_code] === "highestInvoiceValue" && Object.hasOwn(req.data, "invoices")) {
            return req.reject(409, "Invoices used for an approved LoA cannot be changed; create a successor request");
          }
          const sources = ["amount", "currency_code", ...[amountSources[existing.subProcessType_code]].flat().filter(Boolean)];
          if (sources.some((field) => Object.hasOwn(req.data, field)
            && (field === "currency_code"
              ? req.data[field] !== existing[field]
              : Number(req.data[field]) !== Number(existing[field])
                || (req.data[field] == null) !== (existing[field] == null)))) {
            return req.reject(409, "The approved amount and currency cannot be changed; create a successor request for a revised approval");
          }
        }
      }
      return;
    }
    // Share the configuration lock with Admin writes and avoid a stale cache snapshot.
    if (!req.data.subProcessType_code) return req.reject(400, "Select a process subtype");
    const lockedSubtype = await cds.tx(req).run(SELECT.one.from(this.entities.ProcessSubTypes)
      .where({ code: req.data.subProcessType_code }).forUpdate());
    if (!lockedSubtype) return req.reject(400, "Selected process subtype was not found");
    Object.assign(subtype, lockedSubtype);
    const steps = await cds.tx(req).run(SELECT.from(this.entities.ProcessStepConfig)
      .where({ subProcessType_code: req.data.subProcessType_code }).orderBy("stepNo"));
    this._clearConfigCache();
    try { Object.assign(req.data, this._loaPlan(subtype, steps)); }
    catch (error) { return req.reject(400, error.message); }
    if (req.data.loaWorkflowMode === "GUIDED" && Object.hasOwn(req.data, "tasks")) {
      return req.reject(409, "Tasks are generated from the configured workflow; do not supply inline tasks");
    }
    if (req.data.loaWorkflowMode === "GUIDED" && !req.data.loaBeforeProcessing) {
      req.data.status_code = "DRAFT";
      req.data.currentStep = steps[0]?.stepNo || 0;
    }
  },

  async _validateLoaStepConfig(req) {
    const tx = cds.tx(req);
    const id = req.data.ID || req.params?.[0]?.ID;
    const existing = id ? await tx.run(SELECT.one.from(this.entities.ProcessStepConfig).where({ ID: id })) : null;
    const next = { ...existing, ...req.data };
    const codes = [...new Set([existing?.subProcessType_code, next.subProcessType_code].filter(Boolean))].sort();
    for (const code of codes) {
      // Serialize step configuration changes for this subtype.
      const subtype = await tx.run(SELECT.one.from(this.entities.ProcessSubTypes).where({ code }).forUpdate());
      if (!subtype) return req.reject(400, "Selected process subtype was not found");
      const before = await tx.run(SELECT.from(this.entities.ProcessStepConfig).where({ subProcessType_code: code }));
      const after = before.filter((step) => step.ID !== id);
      if (req.event !== "DELETE" && next.subProcessType_code === code) after.push(next);
      if (new Set(after.map((step) => Number(step.stepNo))).size !== after.length) {
        return req.reject(400, "Each step number must be unique within a process subtype");
      }
      try { this._loaPlan(subtype, after.sort((a, b) => a.stepNo - b.stepNo)); }
      catch (error) { return req.reject(400, error.message); }
      if (next.stepType && !["PROCESSING", "LOA"].includes(next.stepType)) {
        return req.reject(400, "Step type must be Processing or LoA Approval");
      }
      if (req.event !== "DELETE" && (!Number.isInteger(Number(next.stepNo)) || Number(next.stepNo) <= 0)) {
        return req.reject(400, "Step number must be a positive integer");
      }
      if (before.some((step) => this._isLoaStep(step)) || after.some((step) => this._isLoaStep(step))) {
        const active = await tx.run(SELECT.one.from(this.entities.ProcessRequests).columns("ID")
          .where({ subProcessType_code: code }).where({ status_code: { "not in": ["COMPLETED", "REJECTED"] } }));
        if (active) return req.reject(409, "Finish active requests before changing steps for a subtype with a configured LoA step, or configure a new subtype");
      }
    }
    if (req.event !== "DELETE" && this._isLoaStep(next)) {
      req.data.processorTeam_ID = null;
      req.data.processorTeamName = null;
      req.data.role = null;
      req.data.isVendorNotification = false;
      req.data.isActiveDemandTask = false;
    }
  },

  _currentLoaAmount(request) {
    const source = amountSources[request.subProcessType_code];
    const values = (source ? [source].flat().map((field) => request[field]) : [request.amount])
      .filter((value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)))
      .map(Number);
    return values.length ? Math.max(...values) : null;
  },

  async _startConfiguredLoa(req, requestId, step) {
    const tx = cds.tx(req);
    const request = await tx.run(SELECT.one.from(this.entities.ProcessRequests).where({ ID: requestId }).forUpdate());
    if (!step || !request || request.loaWorkflowMode !== "GUIDED" || Number(request.loaStepNo) !== Number(step.stepNo)) {
      return req.reject(409, "The configured LoA step no longer matches this request");
    }
    if (["COMPLETED", "REJECTED"].includes(request.status_code) || request.loaApprovalState === "APPROVED") {
      return req.reject(409, "This LoA approval is already finalized and cannot be retriggered");
    }
    const openTask = await tx.run(SELECT.one.from(this.entities.ProcessTasks).columns("ID")
      .where({ request_ID: requestId, isLoaApproval: true, status_code: "OPEN" }));
    if (openTask) return;
    const steps = await this._getSteps(req, request.subProcessType_code);
    if (!this._getNextStep(steps, step)) {
      const incomplete = await this._findIncompleteGuidedStep(req, requestId, steps, {
        beforeStepNo: step.stepNo, includeClosingSteps: true, allowTerminalTasks: true
      });
      if (incomplete) return req.reject(409, `Finish step ${incomplete.stepNo} before starting the final LoA approval`);
    }
    const invoiceBasis = amountSources[request.subProcessType_code] === "highestInvoiceValue";
    if (invoiceBasis) {
      const invoices = await tx.run(SELECT.from(this.entities.Invoices).columns("amount").where({ request_ID: requestId }));
      const amounts = invoices.map((entry) => entry.amount).filter((value) => value != null && value !== "" && Number.isFinite(Number(value))).map(Number);
      request.highestInvoiceValue = amounts.length ? Math.max(...amounts) : null;
    }
    const amount = this._currentLoaAmount(request);
    if (amount === null) return req.reject(400, "A valid approval amount is required before starting the LoA step");
    const role = await this._resolveLoaRole(req, this.entities.LoaApproval, amount, request);
    if (!role) return req.reject(400, `No LoA approval rule is configured for amount ${amount}`);
    const deadline = await this._calculateSlaDeadline(req, request.subProcessType_code, step.slaDays);
    const changes = { amount, role, currentStep: step.stepNo, status_code: "PENDING_APPROVAL", loaApprovalState: "PENDING", completedAt: null, ...deadline };
    if (invoiceBasis) changes.highestInvoiceValue = amount;
    await tx.run(UPDATE(this.entities.ProcessRequests, requestId).set(changes));
    await this._createLoaApprovalTasks(req, { ...request, ...changes }, this.masterEntities.Users,
      request.loaBeforeProcessing ? "DRAFT" : request.status_code);
  },

  async _resumeConfiguredLoa(req, request, task, approved) {
    const tx = cds.tx(req);
    const steps = await this._getSteps(req, request.subProcessType_code);
    const step = this._findStepByNo(steps, request.loaStepNo);
    if (!step || !this._isLoaStep(step)) return req.reject(409, "The LoA workflow configuration has changed");
    const next = this._getNextStep(steps, step);
    if (approved && !next) {
      const incomplete = await this._findIncompleteGuidedStep(req, request.ID, steps, { includeClosingSteps: true, allowTerminalTasks: true });
      if (incomplete) return req.reject(409, `Finish step ${incomplete.stepNo} before completing the final LoA approval`);
    }
    const changes = {
      loaApprovalState: approved ? "APPROVED" : "REJECTED",
      status_code: approved ? (next ? "IN_PROGRESS" : "COMPLETED") : "REJECTED",
      currentStep: approved && next ? next.stepNo : step.stepNo,
      completedAt: approved && next ? null : this._now()
    };
    if (approved && request.loaBeforeProcessing) {
      Object.assign(changes, { reservedBy: null, reservedByUser_ID: null, reservedAt: null,
        processorUser_ID: null, processor: null, processorEmail: null });
    }
    if (approved && next) {
      Object.assign(changes, await this._calculateSlaDeadline(req, request.subProcessType_code, next.slaDays));
    }
    await tx.run(UPDATE(this.entities.ProcessRequests, request.ID).set(changes));
    if (approved && next) {
      await this._createTask(req, request.ID, next, { request: { ...request, ...changes }, skipIfExistingStep: true });
      if (request.loaBeforeProcessing && request.processorTeam_ID) {
        await this._notifyTeamAssignment(req, { assignmentType: "PROCESS", request: { ...request, ...changes },
          teamId: request.processorTeam_ID, teamName: request.processorTeamName });
      }
    }
    return changes.status_code;
  }
});
