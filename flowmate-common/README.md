# Flowmate Common Master Data

This CAP service is the shared source for master data used by Flowmate I2P and
Flowmate CA.

## Ownership

The `flowmate-common-db` HDI container owns:

- Users and manager assignments
- Teams and team memberships
- Vendors
- Delegations

Transactional entities remain in their application-specific HDI containers.
Flowmate CA stores the shared record UUIDs and selected display-name snapshots,
but it does not create duplicate HANA master tables.

## Runtime

Service URL:

`https://flowmate-common-srv-org-b-test.cfapps.ap11.hana.ondemand.com/odata/v4/flowmate-common`

Flowmate CA connects through the `flowmate-common-api` destination using OAuth2
client credentials. Flowmate CA enforces the end-user roles before forwarding
maintenance requests.

## Migrating Existing I2P Master Data

The migration is non-destructive. It preserves source UUIDs, creates or updates
matching common records, and does not delete records from the I2P HDI
container.

```sh
npm run migrate:flowmate
```

Run it while logged in to the intended Cloud Foundry org and space.
