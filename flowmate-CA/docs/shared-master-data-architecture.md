# Shared Master Data Architecture

Flowmate CA uses a separate transaction service and HDI container from
Flowmate I2P. Shared business master data is owned by `flowmate-common`.

```text
Flowmate I2P UI/API ----\
                         > Flowmate Common API -> flowmate-common-db
Flowmate CA UI/API -----/          |
                                   +-- Users and managers
                                   +-- Teams and memberships
                                   +-- Vendors
                                   +-- Delegations

Flowmate I2P API -> flowmate-db       (I2P transactions)
Flowmate CA API  -> flowmate-ca-db    (CA transactions and workflow config)
```

Flowmate CA resolves master records through the `flowmate-common-api`
destination. Its HANA artifacts contain only CA-owned tables and scalar foreign
keys to shared record UUIDs.

The existing I2P application still reads its legacy master tables until its
service is cut over to the common API. The migration utility copies the current
master records without deleting the source data, allowing that cutover to be
performed and verified separately.
