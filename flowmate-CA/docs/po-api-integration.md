# PO creation from Postman or another system

`POST /odata/v4/flowmate-ca/createRequest` supports human users and authorized
technical clients. The request body remains `{ "input": { ... } }`; `details`
remains a JSON-encoded string.

## Technical-client setup

1. In the shared master-data Admin UI, create a dedicated active user such as
   **Flowmate PO Integration**, with an organization-approved integration email
   and unique user principal name. Record its `ID` (UUID). No administrator role
   or team membership is needed for API creation. Use this account for integration
   records only; the caller does not supply a requester identity in the payload.
2. Obtain the `clientid` from the `flowmate-api-auth-key` service key on the
   `flowmate-api-auth` XSUAA instance. Use the exact value; service instance names
   and `req.user.id` (`system` for technical tokens) are not client identifiers.
3. Configure `FLOWMATE_CA_PO_INTEGRATION_CLIENTS` on **flowmate-ca-srv** as a JSON
   object mapping each allowed client ID to an active shared user UUID:

   ```json
   {
     "<exact-service-key-clientid>": "<integration-user-uuid>"
   }
   ```

   For a persistent deployment setting, copy
   `config/po-integration.mtaext.example` to an environment-specific `.mtaext`,
   replace the placeholders and include it in your normal deployment:

   ```sh
   cf deploy flowmate-CA/mta_archives/flowmate-ca.mtar -e /path/to/qas-po-integration.mtaext -f
   ```

   The archive filename above follows the CI convention; use the actual built
   archive path. To configure an already deployed server, the equivalent is:

   ```sh
   cf set-env flowmate-ca-srv FLOWMATE_CA_PO_INTEGRATION_CLIENTS '{"<exact-service-key-clientid>":"<integration-user-uuid>"}'
   cf restage flowmate-ca-srv
   ```

   These examples contain IDs only, never a client secret. Include the extension
   in subsequent CI deployments so the configuration remains explicit.
4. Deploy the updated CA service and `flowmate-CA/xs-security.json`. The security
   descriptor grants `$XSAPPNAME.PORequestCreate` to `flowmate-api-client`.
   The existing API XSUAA instance already accepts granted authorities; it does
   not need a new service key. Existing CAAdmin grants are retained, but they do
   not substitute for PORequestCreate on this action.
5. Obtain a **new** access token after the XSUAA update. In Postman, POST to
   `<service-key-url>/oauth/token`, use Basic Auth with the key's `clientid` and
   `clientsecret`, and send `grant_type=client_credentials` as
   `application/x-www-form-urlencoded`. Use the returned token as Bearer Auth
   against the direct Flowmate CA service URL.

No schema migration or CSV deployment is required for this feature. Provision
the integration user through the application/API, not seed CSVs.

## Authorization and workflow behavior

- The authenticated token must represent a CAP `system-user`, carry the local
  `PORequestCreate` permission, and identify a client present in the mapping.
- `input.requestTypeCode` must be `PURCHASE_ORDER`. This initial permission
  covers only `createRequest`, not bulk creation or other request types.
- The mapped user must exist and be active in shared master data. Its identity
  supplies requester, owner, requester-step actor and creation-history fields.
- The server uses the validated XSUAA security context for the client ID.
  Headers and payload fields cannot select the integration user. Reserved
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

`History` records with `action = REQUEST_CREATED` include JSON in `remarks`:

```json
{
  "source": "TECHNICAL_API",
  "clientId": "<authenticated-client-id>",
  "integrationUserId": "<shared-user-uuid>"
}
```

The record's actor name/email comes from the mapped user. No token or secret is
stored. Because this uses the existing history transaction, failed creation
rolls back the request and its history together.

## Troubleshooting

| Response | Check |
| --- | --- |
| 401 | Token expiry, token issuer/audience and deployed XSUAA binding. |
| 403: not authorized to create purchase orders | Fresh token contains the CA `PORequestCreate` scope. CAAdmin alone is insufficient. |
| 403: purchase order requests only | `input.requestTypeCode` is exactly `PURCHASE_ORDER`. |
| 403: no configured integration user | Exact token client ID is a key in the mapping. Update the mapping if credentials rotate to a different client ID. |
| 403: integration user missing or inactive | The mapped UUID exists and is active in common master data. |
| 503: configuration invalid | Mapping is valid JSON, an object, and contains a UUID for the client. |
| 400: invalid type, variant or processor team | Reference values exist and are active in the target environment. |

## Verification

With the project's Node 22 version selected:

```sh
cd flowmate-CA
npm run test:po-integration
```

These tests use fake persistence and run the actual creation/workflow/history
handlers. They do not start an application server, connect to HANA, or load CSVs.
Live token issuance and database integration must be verified after deployment
and environment configuration.
