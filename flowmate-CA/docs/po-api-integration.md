# PO creation from Postman or another system

`POST /odata/v4/flowmate-ca/createRequest` supports human users and authorized
technical clients. The request body remains `{ "input": { ... } }`; `details`
remains a JSON-encoded string.

## Technical-client setup

1. Choose the business requester from the active Users in shared Flowmate master
   data. Use that record's `ID` (UUID) as `input.requesterUser_ID` on each call.
   A dedicated integration user is optional; an authorized system can create on
   behalf of different active users, just as in Flowmate. No client-to-user
   environment mapping is required.
2. Use a service key on `flowmate-api-auth`, such as
   `flowmate-external-api-key` or `flowmate-api-auth-key`, for token issuance.
3. Deploy the updated CA service and `flowmate-CA/xs-security.json`. The security
   descriptor grants `$XSAPPNAME.PORequestCreate` to `flowmate-api-client`.
   The existing API XSUAA instance already accepts granted authorities; it does
   not need a new service key. Existing CAAdmin grants are retained, but they do
   not substitute for PORequestCreate on this action.
4. Obtain a **new** access token after the XSUAA update. In Postman, POST to
   `<service-key-url>/oauth/token`, use Basic Auth with the key's `clientid` and
   `clientsecret`, and send `grant_type=client_credentials` as
   `application/x-www-form-urlencoded`. Use the returned token as Bearer Auth
   against the direct Flowmate CA service URL.

This requester change updates the service input type and handler, not database
tables. No database migration or CSV deployment is required for this change.
Existing `FLOWMATE_CA_PO_INTEGRATION_CLIENTS` settings are ignored by the new
handler and may be removed from your environment/deployment extensions.

## Example request

Replace the example UUID with an active shared user ID and the team code with
the intended active team. WorkHUB fields belong inside the `details` string.

```json
{
  "input": {
    "requestTypeCode": "PURCHASE_ORDER",
    "requestVariantCode": "PO_OPEX",
    "requesterUser_ID": "01234567-89ab-cdef-0123-456789abcdef",
    "title": "WorkHUB PO integration example",
    "priorityCode": "MEDIUM",
    "processorTeamCode": "REPLACE_WITH_ACTIVE_TEAM_CODE",
    "details": "{\"WorkHUBID\":\"4\",\"WorkHubAppID\":\"w71cbe15a5a\",\"purchaseOrderType_code\":\"GENERAL\",\"procurementCategory_code\":\"OPEX\",\"currency_code\":\"LKR\",\"totalValue\":1000,\"items\":[{\"description\":\"Sample material\",\"quantity\":2,\"unitPrice\":500,\"unitOfMeasure_code\":\"EA\"}]}"
  }
}
```

## Authorization and workflow behavior

- The authenticated token must represent a CAP `system-user`, carry the local
  `PORequestCreate` permission, and contain an authenticated client ID.
- `input.requestTypeCode` must be `PURCHASE_ORDER`. This initial permission
  covers only `createRequest`, not bulk creation or other request types.
- The payload's `requesterUser_ID` must exist and be active in shared master data. Its identity
  supplies requester, owner, requester-step actor and creation-history fields.
- The server uses the validated XSUAA security context for the client ID.
  Headers and payload fields cannot override that client identity. Reserved
  parent links, record IDs and audit fields in PO details/items are rejected.
- The normal variant/team validation and workflow initialization still run.
  Creation completes the configured requester step and opens the next step;
  with a single applicable step, the existing workflow completes the request.
  The initial DRAFT insert is therefore not necessarily the returned status.
- In `FlowmateCAService`, technical clients cannot directly CREATE, UPDATE or
  DELETE entities, or invoke task approval, assignment, submission, bulk or
  other workflow actions. Existing reads and the permission-protected connection
  diagnostic remain available. The master-data service's existing provisioning
  permissions are outside this workflow permission and remain unchanged.
- Human users retain the existing active-user lookup and workflow access checks.
  They can omit `requesterUser_ID`; if supplied, it must match the signed-in user.

`History` records with `action = REQUEST_CREATED` include JSON in `remarks`:

```json
{
  "source": "TECHNICAL_API",
  "clientId": "<authenticated-client-id>",
  "requesterUserId": "<payload-requester-user-uuid>"
}
```

The record's actor name/email comes from the validated business requester. The
client ID identifies the technical caller separately. No token or secret is
stored. Because this uses the existing history transaction, failed creation
rolls back the request and its history together.

## Troubleshooting

| Response | Check |
| --- | --- |
| 401 | Token expiry, token issuer/audience and deployed XSUAA binding. |
| 403: not authorized to create purchase orders | Fresh token contains the CA `PORequestCreate` scope. CAAdmin alone is insufficient. |
| 403: purchase order requests only | `input.requestTypeCode` is exactly `PURCHASE_ORDER`. |
| 400: requesterUser_ID is required | Supply the ID directly under `input`, not inside `details`. |
| 400: requesterUser_ID must be a valid UUID | Supply the shared user UUID, not an email or client ID. |
| 400: selected requester missing or inactive | The payload UUID must identify an active common Users record. |
| 403: browser requests must use the signed-in user | Use your own requester ID, or omit it for browser-user creation. |
| 400: invalid type, variant or processor team | Reference values exist and are active in the target environment. |

## Verification

With the project's Node 22 version selected:

```sh
cd flowmate-CA
npm run test:po-integration
```

These tests use fake persistence and run the actual creation/workflow/history
handlers. They do not start an application server, connect to HANA, or load CSVs.
Live token issuance and database integration must be verified after deployment.
