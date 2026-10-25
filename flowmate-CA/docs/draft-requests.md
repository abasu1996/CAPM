# Flowmate CA request drafts

Draft forms are stored in `flowmate.ca.db.CARequestDrafts`, separate from live
`CARequests`. Saving a draft does not allocate a request reference, create
workflow steps or tasks, trigger LoA approval, or call Flowmate/Workhub.

The UI offers **Save Draft** on every request-creation form, including the
multiple-request PO and material-reservation modes. **Draft Requests** lists
saved forms; selecting one restores the entered fields and table rows. The
creator or a CA administrator can read and maintain a draft. Other users and
technical API clients cannot access drafts. A final **Submit** uses the
existing create action and validation path, then deletes the draft in the
same database transaction as request creation.

Selected browser files are not stored with this first-phase draft. Users must
reattach them after resuming; the UI clears saved file-field names and warns
about this. Payment Run and Flowmate SES attachments must be selected again
before submission.

The service exposes read-only `Drafts` and the `saveDraft` / `deleteDraft`
actions. The final `createRequest` and `createBulkRequests` payloads accept an
optional `draftId`. The server checks draft ownership before creating a live
request. Technical API clients cannot submit a browser draft.

Deploy the new `CARequestDrafts` HANA table through the normal MTA schema
deployment. No CSV seed or data import is required.
