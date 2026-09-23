# CDS Data Drift

`@animb1996/cds-data-drift` is a read-only seed-data drift reporter for SAP CAP. It compares local `db/data` CSV records with the database configured as the CAP `db` service.

Phase one never updates the database and never rewrites a CSV.

The current release targets SAP CAP 9 (`@sap/cds >=9 <10`) and supports Node.js 20 or newer. CAP 10 is intentionally excluded because it requires Node.js 22 or newer and has not yet been certified with this release.

## Reported conditions

- `LOCAL_ONLY`: a key exists only in the CSV.
- `DATABASE_ONLY`: a key exists only in the database.
- `CHANGED`: the key exists in both sources but one or more compared fields differ.
- `DUPLICATE_KEY`: a comparison key occurs more than once.
- Validation errors such as unknown entities, columns, or missing keys.

## Install locally

From a consuming CAP project:

```sh
npm install --save-dev ../cds-data-drift
```

After publication:

```sh
npm install --save-dev @animb1996/cds-data-drift
```

## Configure

Add `cds.dataDrift` to the consuming project's `package.json`:

```json
{
  "cds": {
    "dataDrift": {
      "folders": ["db/data"],
      "dbService": "db",
      "ignoreManagedColumns": true,
      "emptyStringEqualsNull": true,
      "excludeEntities": [
        "flowmate.db.ProcessRequests",
        "flowmate.db.ProcessTasks"
      ],
      "entities": {
        "flowmate.db.ProcessSubTypes": {
          "keys": ["code"]
        },
        "flowmate.ca.db.WorkflowStepConfigs": {
          "keys": ["requestType_code", "requestVariant_code", "stepNo"],
          "ignoreColumns": ["ID"]
        }
      }
    }
  }
}
```

CDS keys are used automatically when an entity does not have an explicit key configuration.

## Run locally

Against the project's configured local database:

```sh
npx cds-data-drift
```

Against a bound SAP HANA Cloud HDI container:

```sh
cds bind db --to flowmate-db:data-drift --for ci --kind hana
cds bind --exec --profile ci -- npx cds-data-drift
```

Compare one entity:

```sh
npx cds-data-drift --entity flowmate.db.ProcessSubTypes
```

Create reports:

```sh
npx cds-data-drift --format json --out data-drift.json
npx cds-data-drift --format markdown --out data-drift.md
```

Use `--warn-only` during initial CI adoption to report mismatches without returning exit code `1`.

## Exit codes

| Code | Meaning |
|---:|---|
| 0 | Synchronized, or `--warn-only` was used |
| 1 | Drift or validation mismatch detected |
| 2 | Configuration, connection, or execution failure |

## Defaults

- Managed fields `createdAt`, `createdBy`, `modifiedAt`, and `modifiedBy` are ignored.
- Empty CSV values and database `null` are considered equal.
- Strings are not trimmed unless `trimStrings` is enabled.
- At most 100,000 records are read per entity by default.
- At most 100 mismatched records per category are printed by default.

## Security and scope

The command executes database `SELECT` queries only. The service binding should still use the minimum privileges necessary. This tool is a deployment drift check, not a substitute for SAP HANA Cloud backup and recovery.
