# Reference data only

These CSV files are HANA reference/recovery snapshots. They intentionally live outside CAP's reserved `db/data` and `db/csv` directories, so neither `cds deploy` nor the HANA deployer imports them automatically.

Maintain production master data through the application or an explicit, reviewed migration.
