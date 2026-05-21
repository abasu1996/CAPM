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
      ProcessHistory,
      ProcessStepConfig
    } = this.entities;

    if (this.handle_attachments) {
      await this.handle_attachments();
    }

    this.before("CREATE", ProcessRequests, (req) => {
      req.data.status_code ??= PROCESS_STATUS.DRAFT;
      req.data.requester ??= req.user?.id || "anonymous";
      req.data.priority ??= "Medium";
      req.data.currentStep ??= 0;
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
    await cds.tx(req).run(
      INSERT.into(this.entities.ProcessTasks).entries({
        request_ID: requestId,
        stepNo: step.stepNo,
        taskName: step.stepName,
        assignedTo: step.role,
        role: step.role,
        status_code: TASK_STATUS.OPEN
      })
    );
  }

  async _writeHistory(req, entry) {
    await cds.tx(req).run(
      INSERT.into(this.entities.ProcessHistory).entries({
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
