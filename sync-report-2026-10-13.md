# Project synchronization — 13 October 2026

Compared and merged the local repositories:

- `/Users/megamind/localDev/CAPM/CAPM`
- `/Users/megamind/localDev/dialog-project`

Source PRs: #31 (`eb46317e`), #32 (`e3170674`), #33 (`8086347f`).
Changes were merged using `d7e71925` as the pre-PR baseline; CAPM-specific features were preserved.

## Results

| Project | Incoming modified source files | Verified matching code/config/schema/test files |
| --- | ---: | ---: |
| flowmate | 7 | 79 |
| flowmate-CA | 13 | 55 |
| flowmate-common | 2 | 14 |

All 148 checked project files match byte-for-byte between the two working copies.

- PR #31: Project Code Creation masters, admin maintenance, and CA task enrichment.
- PR #32: priority editing, settlement/predecessor completion, Pending UAC reservation and requester task assignment, and form changes.
- PR #33: material code task handling, conditional field requirements, schema additions, and `approveTask.materialDetails`.
- Existing LoA configuration, primary team validation, technical PO integration, Payment Run, Flowmate SES integration, All Requests, autoscaling configuration, and invoice-dialog Save fix are retained.

## Issues discovered and handled

1. PR #32 changed guided initialization to auto-complete any initial processing step. An existing LoA regression test failed. Restored the requester-submission-only guard while retaining the caller's explicit `autoCompleteSteps: 0` option for Pending UAC. Added a test for that exception.
2. dialog-project lacked `scripts/ci/remove-hana-seed-artifacts.js`, although each project build calls it. Added the same helper used by CAPM; all three dialog-project builds now complete.
3. Cleaned trailing whitespace introduced by the incoming Flowmate changes.

## Business behavior changes to review

- Request titles become optional; the UI falls back to the request reference number.
- Completing a qualifying advance-settlement request also completes its eligible advance-payment predecessor and cancels its open/sent-back tasks as superseded.
- Pending UAC creation now reserves the request for its requester, subject to the imported authorization checks.

These behaviors were imported from PR #32. The synchronization does not establish that they have passed business UAT.

## Data handling

All 371 existing CSV/reference/recovery files checked before synchronization retained their hashes. HANA was not contacted or deployed.

Added reference copies of these seven source CSVs under `flowmate-common/db/reference-data` in both repositories:

- ArPcc
- DivisionsPcc
- ProjectTypePcc
- ScopePcc
- VendorsPcc
- BudgetCode
- ContractType

Existing `db/data` and `db/reference-data` layouts were preserved. Existing Common CSV differences for ApplicableTaxes, TeamMembers, and Teams remain intentionally unresolved. This is code synchronization, not a reconciliation against live HANA data.

No CSV or `.hdbtabledata` files remain in the generated database build output of any of the six project builds. Existing source CSVs remain present in dialog-project/db/data; use the verified build flow when deploying rather than assuming direct `cds deploy` has the same cleanup behavior.

## Verification and delivery state

- Flowmate LoA tests: 26 passed.
- CA request, technical PO integration, and Payment Run dialog tests: 44 passed.
- Production builds: passed for all three projects in both folders.
- Changed JavaScript syntax, XML parsing, and UI5 controller dependency counts: passed.
- Git whitespace checks: passed in both repositories.
- Existing CDS compiler warnings remain (including entity/element naming warnings); they did not block the builds.
- Browser UAT was not performed.

Changes are uncommitted. Nothing was pushed or deployed. Unrelated dirty CAPM submodules were left untouched.
