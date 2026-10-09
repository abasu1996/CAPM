# SAP BTP QAS deployment workflow

The `deploy-sap-btp-qas.yml` workflow runs for every pushed commit and can also
be started manually. GitHub serializes deployments so two MTA deployments never
run concurrently.

Configure a GitHub Environment named `qas` with these encrypted environment
secrets:

- `CF_API` — for example `https://api.cf.ap11.hana.ondemand.com`
- `CF_ORG` — the exact Cloud Foundry organization name
- `CF_SPACE` — the exact Cloud Foundry space name
- `CF_USERNAME` — dedicated Cloud Foundry CI technical user
- `CF_PASSWORD` — technical-user password

The technical user needs enough Cloud Foundry space permissions to read service
instances, create/read the `github-actions-backup` HDI service keys, deploy MTAs,
and inspect applications. Do not use a personal SSO password.

The MTA descriptors provision and bind SAP Application Autoscaler instances for
the runtime and approuter modules. The initial floor is two instances per
runtime module and two approuter instances. Autoscaler policies can add up to
eight runtime instances or six approuter instances when CPU, memory utilisation
or response time thresholds are exceeded. These are load-test starting values;
they are not a capacity guarantee for 20,000 concurrent users.

The deployment workflow checks that the `autoscaler` service exposes the
`standard` plan before building or changing anything. To inspect a deployed
policy interactively, install the Cloud Foundry Application Autoscaler plugin
and run, for example:

```bash
cf autoscaling-policy flowmate-srv
cf autoscaling-policy flowmate-ca-srv
cf autoscaling-policy flowmate-common-srv
```

Tune thresholds and maximums only after reviewing load-test results and HANA
connection usage. Scaling the Node.js services does not automatically increase
HANA capacity or connection limits.

For additional production control, enable required reviewers on the `qas`
GitHub Environment. This pauses the job before any BTP authentication or change.

The workflow exports all physical non-binary HANA columns. Attachment binaries
are deliberately excluded. The backup artifact contains personal and business
data, is retained for seven days, and must only be accessible to authorized
repository users.

The workflow does not automatically restore HANA after a failed deployment.
Use the uploaded pre-deployment artifact for a controlled recovery.

The pipeline uses Node.js 22 because the current Cloud SDK dependency tree
includes `opossum@10`, which requires Node.js 22 or newer.

Flowmate's repository root is an npm workspace and is installed with
`npm install`; npm 10 currently rejects the generated workspace lock while
validating optional `keyv/cacheable` peer dependencies. Flowmate Common,
Flowmate CA, and the generated deployable modules continue to use `npm ci`.
