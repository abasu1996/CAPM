# Flowmate CA request drafts

Draft forms are stored in `flowmate.ca.db.CARequestDrafts`, separate from live
`CARequests`. Saving a draft does not allocate a request reference, create
workflow steps or tasks, trigger LoA approval, or call Flowmate/Workhub.

The UI offers **Save Draft** on every request-creation form. **Draft Requests** lists
saved forms; selecting one restores the entered fields, table rows and, for a
single request, its saved attachments. The
creator or a CA administrator can read and maintain a draft. Other users and
technical API clients cannot access drafts. A final **Submit** uses the
existing create action and validation path, then deletes the draft in the
same database transaction as request creation.

Single-request attachments are stored in `CAAttachments` with a draft parent.
They can be opened or removed after the draft is resumed. On final submission,
the server reparents the same attachment rows to the new request before it
initialises workflow tasks; it does not copy or re-upload the binary content.
The two parent fields are mutually controlled by separate service endpoints,
and draft attachment reads and writes are limited to the creator or a CA
administrator.

Draft attachments are intentionally not supported yet for multiple-request PO
or material-reservation submissions. Saving such a form remains supported, but
the UI refuses to save selected files with it and the backend refuses bulk
submission if a draft somehow contains attachments.

The service exposes read-only `Drafts`, protected `DraftAttachments`, and the
`saveDraft` / `deleteDraft` actions. The final `createRequest` and
`createBulkRequests` payloads accept an
optional `draftId`. The server checks draft ownership before creating a live
request. Technical API clients cannot submit a browser draft.

Deploy the HANA schema changes through the normal safe MTA schema deployment.
The change adds nullable `draft_ID` and `fieldName` columns and makes the
existing attachment `request_ID` nullable. No CSV seed or data import is
required.
