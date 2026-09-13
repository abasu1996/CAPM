# SAP BTP QAS deployment workflow

The `deploy-sap-btp-qas.yml` workflow runs for every pushed commit and can also
be started manually. GitHub serializes deployments so two MTA deployments never
run concurrently.

Configure a GitHub Environment named `qas` with these environment variables:

- `CF_API` — for example `https://api.cf.ap11.hana.ondemand.com`
- `CF_ORG` — the exact Cloud Foundry organization name
- `CF_SPACE` — the exact Cloud Foundry space name

Configure these encrypted environment secrets:

- `CF_USERNAME` — dedicated Cloud Foundry CI technical user
- `CF_PASSWORD` — technical-user password

The technical user needs enough Cloud Foundry space permissions to read service
instances, create/read the `github-actions-backup` HDI service keys, deploy MTAs,
and inspect applications. Do not use a personal SSO password.

For additional production control, enable required reviewers on the `qas`
GitHub Environment. This pauses the job before any BTP authentication or change.

The workflow exports all physical non-binary HANA columns. Attachment binaries
are deliberately excluded. The backup artifact contains personal and business
data, is retained for seven days, and must only be accessible to authorized
repository users.

The workflow does not automatically restore HANA after a failed deployment.
Use the uploaded pre-deployment artifact for a controlled recovery.
