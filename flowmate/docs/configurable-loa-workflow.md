# Configurable LoA approval position

Flowmate supports one LoA approval gate at any guided-step position per process
subtype. This change is for Flowmate only; CA workflows and shared master data are
unchanged. Approver identities and roles still come from Flowmate Common.

## Admin setup

1. Enable **LoA approval applicable** on the process subtype.
2. Under **Admin → Process Step Configuration**, edit or add the approval step.
3. Set **Step type = LoA Approval** and choose its step number. Step numbers must
   be positive and unique within the subtype. Other steps remain **Processing**.
4. Maintain the existing LoA matrix and active shared users with the required
   roles and active membership of the request's processor team. The matrix, not
   the step's team/role fields, determines the approver roles. Configured gates
   select only approvers who satisfy the existing team access policy.
5. Test with a new request after deploying the schema and service changes together.

Only one explicit approval gate is supported per subtype. A subtype cannot have
an LoA step while its LoA applicability switch is off. For a subtype with a gate,
step changes are rejected while any requests are not Completed or Rejected. Finish
those requests first, or configure a new subtype. There is no automatic migration
of in-flight requests.

## Both supported cases

| Configuration | Creation | Approval result |
| --- | --- | --- |
| LoA is the first step | Pending Approval immediately | Clears request reservation/processor and releases to the original team's unreserved queue at the next processing step |
| Request submission, then LoA | Request submission is auto-completed; Pending Approval immediately | Same approval-first behavior |
| Processing step(s), then LoA | Normal team queue and processing | Completing the preceding guided step starts approval; approval retains the processor/reservation and continues with the next configured step |
| LoA is the final step | Normal processing, unless it is also the first step | All preceding tasks must be finalized before entering approval; approval completes the request |
| LoA enabled, no explicit LoA step | Existing approval-first behavior | Existing step-0 approval and leading-step completion are retained |
| LoA disabled, no LoA step | Normal processing | No approval gate |

The existing submission-step convention recognizes a first step with a Requester
role or a name containing “Request creation”, “Request submission”, “Request raised”
or “Create request”. It is auto-completed on creation. Do not label actual processing
work as requester submission. Put LoA first when you want unambiguous approval-first
configuration without an explicit submission step.

For example, `Submission → Validation → LoA Approval → Payment → Closure` triggers
LoA when the processor completes Validation. Approving the validation task alone
does not advance the guided step: the processor must use **Complete Step**.

## Runtime and access safeguards

- On creation, the server stores the approval mode, position and state on the
  request. Clients cannot supply or change those fields.
- At the gate, the backend re-evaluates the current amount, applicable matrix rule
  and active approvers. For invoice-based flows, it reads the stored invoice amounts
  and uses the highest value. A missing amount, rule or approver blocks the transition
  with a descriptive error; the transaction rolls back.
- The creation popup remains a preview. The actual gate uses the data at that time.
- Approval uses the existing Pending Approval tile, assignment/delegation checks,
  team visibility, notifications and audit history. A request keeps its processor
  team when assigned to an individual so later approval can still use team access.
- Existing first-decision-wins behavior is unchanged: the deciding approval task
  is approved/rejected; remaining open approval tasks are cancelled as superseded.
  This is not a new unanimous or multi-level approval engine.
- A pending request is read-only for ordinary request/task operations. Decisions
  go through `approveLoaRequest` / `rejectLoaRequest` (the existing task actions also
  delegate LoA decisions to the same handler).
- API status changes, manual task creation and guided-step jumps cannot bypass the
  gate. Queue projections (`MyAssignedTasks`, `MyPendingApprovalTasks`, `MyTeamTasks`
  and `RequestDetailTasks`) are read-only; use `ProcessTasks` and workflow actions
  for writes so the same validation always runs. Request row locks serialize gate activation and approval decisions. A
  duplicate/stale decision is rejected.
- After approval, the amount, currency and subtype-specific approval source fields
  are protected; invoice-based approvals also protect their invoice records. A
  revised approval requires a successor request. Send-back cannot cross the approved
  gate. Rejection terminates the request and does not start the next step.
- Guided progress treats superseded peer approval tasks correctly; an LoA step is
  completed by its approval decision, not the ordinary Complete Step button.

## API/schema changes

`ProcessStepConfig.stepType`: `PROCESSING` (default) or `LOA`.

Server-managed fields on `ProcessRequests`:

- `loaWorkflowMode`: `NONE`, `LEGACY` or `GUIDED`; null preserves existing requests.
- `loaStepNo`: approval step number.
- `loaBeforeProcessing`: whether approval is the initial gate.
- `loaApprovalState`: `WAITING`, `PENDING`, `APPROVED` or `REJECTED` for configured gates.

`getGuidedProcessTasks` now includes approval tasks and returns `isLoaApproval`
and `decision`, in addition to its existing fields.

Existing OData paths are unchanged. The consolidated Swagger is regenerated from
the CDS service model; no new approval endpoint is required.

## Validation and safe rollout

```sh
cd flowmate
npm run test:loa
npm run build
npm run swagger:generate
```

Use the project's Node 22 toolchain. Tests use a deterministic CQN fixture, not a
live application or database. They do not verify HANA locking under load or actual
email delivery. Perform a QAS smoke test for each configured subtype after rollout.

The change adds columns only; it does not modify CSVs or deployment settings.
Use the existing backup-first CI/CD deployment with seed-artifact removal. Do not
deploy CSVs to activate this feature. Deploy schema and application code together,
then configure steps through Admin. No live deployment is performed by this change.
