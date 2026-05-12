# CAP + Vite + Cloud Foundry Deployment Guide

Project: Supplier Shield  
Stack: SAP CAP Node.js, SQLite, React, Vite, SAP Application Router, Cloud Foundry MTA  
Authentication model: Public app, no XSUAA, no IAS, no external IDP  
Deployment model: Packaged CAP application using `mbt build` and `cf deploy`

## 1. Goal

This guide explains how to build and deploy a small full stack SAP CAP application with:

- A CAP backend exposing an OData service.
- A React frontend built with Vite.
- A custom SAP Application Router serving the frontend and proxying OData calls.
- SQLite as the production database.
- No login requirement.
- Deployment to SAP BTP Cloud Foundry as one packaged MTA archive.

The final Cloud Foundry runtime shape is:

```text
Browser
  |
  v
suppliershield-approuter
  |-- serves React static files from app/router/resources
  |
  |-- proxies /odata/* to destination srv-api
      |
      v
suppliershield-srv
  |-- CAP OData service
  |-- SQLite db.sqlite
```

## 2. Important Trade-Off

SQLite on Cloud Foundry is stored on the app container filesystem. That means it is not durable storage.

Impact:

- Good for demos, prototypes, small read-heavy apps, and seed-data apps.
- The database can reset after restage, redeploy, crash recovery, or container replacement.
- Do not use this model for important production data.

For this application, the database is initialized from CSV data on application startup. That makes the app simple and self-contained.

## 3. Expected Project Structure

The important folders are:

```text
suppliershield/
  app/
    index.html
    package.json
    vite.config.js
    src/
      App.jsx
      main.jsx
      odata.js
      styles.css
    router/
      package.json
      xs-app.json
      resources/
  db/
    schema.cds
    data/
      db.suppliershield-SupplierShield.csv
  srv/
    supplier-shield.cds
    supplier-shield.js
  mta.yaml
  package.json
  package-lock.json
  .mtaignore
```

## 4. CAP Data Model

File:

```text
db/schema.cds
```

Example:

```cds
namespace db.suppliershield;

using { cuid, managed } from '@sap/cds/common';

aspect primary: cuid, managed {};

entity SupplierShield : primary {
  firstName   : String(255);
  lastName    : String(255);
  Description : String(255);
  IsActive    : Boolean;
}
```

Why this exists:

- Defines the database table.
- CAP uses this model to generate SQL artifacts.
- The CSV file under `db/data` can seed this entity.

Impact:

- Entity name becomes part of the CSV file naming convention.
- For this namespace and entity, the seed file is:

```text
db/data/db.suppliershield-SupplierShield.csv
```

## 5. CAP Service Definition

File:

```text
srv/supplier-shield.cds
```

Example:

```cds
using { db.suppliershield as ss } from '../db/schema';

service SupplierShieldService {
  entity SupplierShield as projection on ss.SupplierShield;

  function getVerifiedSuppliers(params : String) returns String;
}
```

Why this exists:

- Exposes the database entity as an OData service.
- Keeps the external service contract separate from the database model.
- Adds a custom function endpoint.

Impact:

- CAP exposes the service at:

```text
/odata/v4/supplier-shield
```

- The entity collection is available at:

```text
/odata/v4/supplier-shield/SupplierShield
```

## 6. CAP Service Implementation

File:

```text
srv/supplier-shield.js
```

Example:

```js
const cds = require('@sap/cds')

module.exports = class SupplierShieldService extends cds.ApplicationService {
  init() {
    const { SupplierShield } = cds.entities('SupplierShieldService')

    this.before(['CREATE', 'UPDATE'], SupplierShield, async (req) => {
      console.log('Before CREATE/UPDATE SupplierShield', req.data)
    })

    this.after('READ', SupplierShield, async (supplierShield, req) => {
      console.log('After READ SupplierShield', supplierShield)
    })

    this.on('getVerifiedSuppliers', async (req) => {
      console.log('On getVerifiedSuppliers', req.data)
      return 'List of verified suppliers'
    })

    return super.init()
  }
}
```

Why this exists:

- Adds custom event handlers to the CAP service.
- Allows validation, enrichment, logging, or custom business behavior.

Impact:

- `READ` calls log returned supplier data.
- `CREATE` and `UPDATE` calls can be extended later.
- The custom OData function returns a string.

## 7. Root `package.json`

File:

```text
package.json
```

Important configuration:

```json
{
  "name": "suppliershield",
  "version": "1.0.0",
  "engines": {
    "node": "22.x"
  },
  "dependencies": {
    "@cap-js/mcp-server": "^0.0.5",
    "@cap-js/sqlite": "^2",
    "@sap/cds": "^9"
  },
  "devDependencies": {},
  "scripts": {
    "start": "cds-deploy && cds-serve",
    "app:dev": "npm --prefix app run dev",
    "app:build": "npm --prefix app run build",
    "app:preview": "npm --prefix app run preview"
  },
  "cds": {
    "requires": {
      "db": {
        "kind": "sqlite",
        "credentials": {
          "url": "db.sqlite"
        }
      },
      "auth": {
        "kind": "dummy"
      }
    }
  },
  "private": true
}
```

Why these changes were done:

- `@cap-js/sqlite` is in `dependencies`, not `devDependencies`, because it must exist in the deployed Cloud Foundry app.
- `@sap/cds` is in `dependencies` because the deployed service needs CAP runtime.
- `engines.node` pins the intended Node.js major version for Cloud Foundry.
- `start` runs `cds-deploy` first so SQLite is initialized when the app starts.
- `cds.requires.db.kind = sqlite` tells CAP to use SQLite.
- `cds.requires.auth.kind = dummy` avoids mandatory production authentication.

Impact:

- The CAP service can run in Cloud Foundry without HANA.
- No XSUAA service binding is required.
- No user login is required.
- The SQLite database is recreated or updated from deployment artifacts at startup.

## 8. React + Vite Frontend

File:

```text
app/package.json
```

Important scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

Why this exists:

- Vite provides fast local development.
- `vite build` creates static production files in `app/dist`.

Impact:

- The frontend can be built independently from CAP.
- The app router can later serve the static build output.

## 9. Vite Development Proxy

File:

```text
app/vite.config.js
```

Configuration:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/odata': {
        target: 'http://localhost:4004',
        changeOrigin: true,
      },
    },
  },
})
```

Why this exists:

- During local development, Vite runs on port `5173`.
- CAP usually runs on port `4004`.
- The proxy forwards frontend calls from `/odata` to CAP.

Impact:

- React code can call `/odata/v4/...` in both local and deployed environments.
- No hardcoded Cloud Foundry URL is needed in frontend code.

Local development commands:

```bash
npm install
npm start
```

In another terminal:

```bash
npm --prefix app install
npm --prefix app run dev
```

Then open:

```text
http://localhost:5173
```

## 10. Frontend OData Client

File:

```text
app/src/odata.js
```

Important pattern:

```js
const SERVICE_ROOT = import.meta.env.VITE_ODATA_BASE_URL || '/odata/v4/supplier-shield'
```

Why this exists:

- The default service root works behind the app router.
- An environment variable can override it if needed.

Impact:

- Local Vite proxy and deployed app router use the same URL path.
- The frontend remains portable across environments.

Useful checks:

```bash
curl http://localhost:4004/odata/v4/supplier-shield/SupplierShield
curl http://localhost:5173/odata/v4/supplier-shield/SupplierShield
```

The first command checks CAP directly.  
The second command checks Vite proxy behavior.

## 11. Custom Application Router

Folder:

```text
app/router
```

This application uses a custom SAP Application Router because it gives direct control over:

- Static file serving.
- OData proxy routing.
- Authentication settings.
- Cloud Foundry destination wiring.

### 11.1 App Router `package.json`

File:

```text
app/router/package.json
```

Configuration:

```json
{
  "name": "suppliershield-approuter",
  "private": true,
  "version": "1.0.0",
  "scripts": {
    "start": "node node_modules/@sap/approuter/approuter.js"
  },
  "engines": {
    "node": "22.x"
  },
  "dependencies": {
    "@sap/approuter": "^20.8.2"
  }
}
```

Why this exists:

- Cloud Foundry starts this as a separate Node.js app.
- `@sap/approuter` serves the static frontend and proxies backend calls.

Impact:

- The browser only needs to access the app router URL.
- CAP service can stay behind the app router.

### 11.2 App Router Routes

File:

```text
app/router/xs-app.json
```

Configuration:

```json
{
  "welcomeFile": "/index.html",
  "authenticationMethod": "route",
  "routes": [
    {
      "source": "^/odata/(.*)$",
      "target": "/odata/$1",
      "destination": "srv-api",
      "authenticationType": "none",
      "csrfProtection": false
    },
    {
      "source": "^(.*)$",
      "target": "$1",
      "localDir": "resources",
      "authenticationType": "none"
    }
  ]
}
```

Why this exists:

- `/odata/*` requests are forwarded to the CAP service.
- All other requests are served from static frontend files.
- `authenticationType: none` makes the app public.
- `csrfProtection: false` avoids app router CSRF handling for this public OData proxy.

Impact:

- No XSUAA is needed.
- No login page appears.
- The deployed frontend can call:

```text
/odata/v4/supplier-shield/SupplierShield
```

## 12. MTA Descriptor

File:

```text
mta.yaml
```

Final structure:

```yaml
_schema-version: 3.3.0
ID: suppliershield
version: 1.0.0
description: Supplier Shield full stack CAP application

parameters:
  enable-parallel-deployments: true

build-parameters:
  before-all:
    - builder: custom
      commands:
        - npm ci
        - npx cds build --production
        - mkdir -p gen/srv/db/data
        - cp db/data/db.suppliershield-SupplierShield.csv gen/srv/db/data/

modules:
  - name: suppliershield-srv
    type: nodejs
    path: gen/srv
    parameters:
      buildpack: nodejs_buildpack
      memory: 256M
      disk-quota: 512M
    build-parameters:
      builder: npm-ci
    provides:
      - name: srv-api
        properties:
          srv-url: ${default-url}

  - name: suppliershield-approuter
    type: approuter.nodejs
    path: app/router
    parameters:
      buildpack: nodejs_buildpack
      keep-existing-routes: true
      memory: 256M
      disk-quota: 512M
    build-parameters:
      builder: custom
      commands:
        - npm ci
        - npm --prefix .. ci
        - npm --prefix .. run build
        - rm -rf resources
        - cp -R ../dist resources
    requires:
      - name: srv-api
        group: destinations
        properties:
          name: srv-api
          url: ~{srv-url}
          forwardAuthToken: false
    provides:
      - name: app-api
        properties:
          app-protocol: ${protocol}
          app-uri: ${default-uri}
```

### 12.1 Why `before-all` Exists

```bash
npm ci
npx cds build --production
mkdir -p gen/srv/db/data
cp db/data/db.suppliershield-SupplierShield.csv gen/srv/db/data/
```

Why:

- `npm ci` installs exact backend dependencies.
- `npx cds build --production` creates the deployable CAP output under `gen/srv`.
- The CSV file is copied into `gen/srv` so the deployed SQLite initialization can load seed data.

Impact:

- The MTAR contains the generated CAP app, not just source files.
- SQLite has seed data available inside the deployed service module.

### 12.2 Why There Is a `suppliershield-srv` Module

This module deploys the CAP backend.

Important properties:

```yaml
type: nodejs
path: gen/srv
```

Why:

- `gen/srv` is the CAP production build output.
- Cloud Foundry runs the generated CAP service as a Node.js app.

Impact:

- The backend starts with the root package start command copied into the generated build.
- The service provides a URL to other MTA modules through `srv-api`.

### 12.3 Why There Is a `suppliershield-approuter` Module

This module deploys the public web entry point.

Important properties:

```yaml
type: approuter.nodejs
path: app/router
```

Why:

- It packages the app router as a separate Cloud Foundry app.
- It builds the Vite frontend and copies the output into `app/router/resources`.

Impact:

- Users access only the app router URL.
- Static files and OData proxying are handled in one place.

### 12.4 Why the Destination Is Inline

Configuration:

```yaml
requires:
  - name: srv-api
    group: destinations
    properties:
      name: srv-api
      url: ~{srv-url}
      forwardAuthToken: false
```

Why:

- The app router needs to know where the CAP service is.
- The MTA provides the CAP service URL from `suppliershield-srv`.
- No destination service instance is required for this simple setup.

Impact:

- Fewer BTP service dependencies.
- No XSUAA or destination service binding is needed.
- The app router receives an environment destination named `srv-api`.

## 13. MTA Ignore File

File:

```text
.mtaignore
```

Recommended contents:

```text
node_modules/
app/node_modules/
app/router/node_modules/
mta_archives/
*.mtar
*.sqlite
*.sqlite-shm
*.sqlite-wal
.DS_Store
```

Why this exists:

- Keeps generated and local runtime files out of the MTAR.
- Prevents accidental packaging of large dependency folders.
- Prevents local SQLite files from being deployed by mistake.

Impact:

- Smaller deployment archive.
- Cleaner and more reproducible builds.

## 14. Build the Application Locally

From the project root:

```bash
npm ci
npm --prefix app ci
npm --prefix app/router ci
```

Build CAP:

```bash
npx cds build --production
```

Build frontend:

```bash
npm --prefix app run build
```

Build MTA archive:

```bash
mbt build
```

Expected result:

```text
mta_archives/suppliershield_1.0.0.mtar
```

## 15. Deploy to Cloud Foundry

Log in:

```bash
cf login -a <api-endpoint>
```

Check target:

```bash
cf target
```

Deploy:

```bash
cf deploy mta_archives/suppliershield_1.0.0.mtar -f
```

Why:

- `mbt build` creates the deployable MTAR package.
- `cf deploy` uploads and deploys the MTA to Cloud Foundry.
- `-f` allows updating an existing deployment.

Impact:

- Cloud Foundry creates or updates both apps:

```text
suppliershield-srv
suppliershield-approuter
```

## 16. Runtime Checks

Check deployed apps:

```bash
cf apps
```

Expected:

```text
suppliershield-approuter   started
suppliershield-srv         started
```

Check routes:

```bash
cf app suppliershield-approuter
cf app suppliershield-srv
```

Check logs:

```bash
cf logs suppliershield-srv --recent
cf logs suppliershield-approuter --recent
```

Stream logs during troubleshooting:

```bash
cf logs suppliershield-srv
cf logs suppliershield-approuter
```

Check environment variables:

```bash
cf env suppliershield-approuter
cf env suppliershield-srv
```

Check the frontend:

```bash
curl -I https://<approuter-route>/index.html
```

Expected:

```text
HTTP/2 200
```

Check OData through the app router:

```bash
curl https://<approuter-route>/odata/v4/supplier-shield/SupplierShield
```

Expected:

```json
{
  "value": []
}
```

or seeded supplier rows.

Check OData directly against CAP:

```bash
curl https://<srv-route>/odata/v4/supplier-shield/SupplierShield
```

This verifies whether a problem is in CAP itself or in app router routing.

## 17. Local Development Flow

Start CAP:

```bash
npm start
```

Start Vite:

```bash
npm --prefix app run dev
```

Open:

```text
http://localhost:5173
```

Check CAP:

```bash
curl http://localhost:4004/odata/v4/supplier-shield/SupplierShield
```

Check Vite proxy:

```bash
curl http://localhost:5173/odata/v4/supplier-shield/SupplierShield
```

## 18. Killing a Local Port

Find the process using port `4004`:

```bash
lsof -i :4004
```

Kill by PID:

```bash
kill <PID>
```

Force kill only if needed:

```bash
kill -9 <PID>
```

For Vite:

```bash
lsof -i :5173
kill <PID>
```

## 19. Common Failure: `cds` Not Found

Symptom:

```text
cds: command not found
```

Cause:

- The deployed app may not have the global `cds` CLI.

Fix:

- Use CAP executable package scripts such as:

```json
"start": "cds-deploy && cds-serve"
```

Why:

- CAP packages expose runtime binaries through `node_modules/.bin`.
- Cloud Foundry runs npm scripts with `node_modules/.bin` on the path.

## 20. Common Failure: SQLite Not Initialized

Symptoms:

```text
no such table
```

or empty data when seed data was expected.

Check:

```bash
cf logs suppliershield-srv --recent
```

Likely causes:

- `@cap-js/sqlite` is missing from production dependencies.
- CSV seed files were not copied into `gen/srv`.
- `cds.requires.db.kind` is not set to `sqlite`.
- Start command does not run `cds-deploy`.

Fix:

- Keep `@cap-js/sqlite` in root `dependencies`.
- Keep the CSV copy command in `mta.yaml`.
- Keep root `start` script as:

```json
"start": "cds-deploy && cds-serve"
```

## 21. Common Failure: App Router Returns 404 for OData

Check app router route:

```bash
cf logs suppliershield-approuter --recent
```

Check direct CAP route:

```bash
curl https://<srv-route>/odata/v4/supplier-shield/SupplierShield
```

If direct CAP works but app router fails, inspect:

```text
app/router/xs-app.json
```

The OData route must appear before the static catch-all route:

```json
{
  "source": "^/odata/(.*)$",
  "target": "/odata/$1",
  "destination": "srv-api",
  "authenticationType": "none",
  "csrfProtection": false
}
```

Why:

- Routes are evaluated in order.
- The catch-all static route would otherwise capture `/odata`.

## 22. Common Failure: Login Page Appears

Cause:

- XSUAA was added.
- A route has authentication enabled.
- CAP auth is configured for production authentication.

Checks:

```bash
cf env suppliershield-approuter
```

Inspect:

```text
app/router/xs-app.json
package.json
mta.yaml
```

Expected:

- No XSUAA resource in `mta.yaml`.
- No XSUAA binding in any module.
- `authenticationType` is `none` for public routes.
- CAP auth uses dummy mode:

```json
"auth": {
  "kind": "dummy"
}
```

Impact:

- The app is public.
- Anyone with the route can access frontend and OData endpoints.

## 23. Common Failure: MTAR Includes Too Much

Symptom:

- MTAR is unexpectedly large.
- Build is slow.
- Local database files are packaged.

Check:

```bash
du -sh mta_archives/*
```

Inspect:

```bash
tar -tf mta_archives/suppliershield_1.0.0.mtar
```

Fix:

- Maintain `.mtaignore`.
- Do not package `node_modules`, local SQLite files, or old build output unless intentionally needed.

## 24. Clean Rebuild

Use this when a deployment behaves strangely after many local changes:

```bash
rm -rf gen
rm -rf app/dist
rm -rf app/router/resources
rm -rf mta_archives
npm ci
npm --prefix app ci
npm --prefix app/router ci
mbt build
cf deploy mta_archives/suppliershield_1.0.0.mtar -f
```

Note:

- `rm -rf` is destructive.
- Review the paths before running it.

## 25. Useful Command Cheat Sheet

Install backend dependencies:

```bash
npm ci
```

Install frontend dependencies:

```bash
npm --prefix app ci
```

Install app router dependencies:

```bash
npm --prefix app/router ci
```

Run CAP locally:

```bash
npm start
```

Run Vite locally:

```bash
npm --prefix app run dev
```

Build frontend:

```bash
npm --prefix app run build
```

Build CAP:

```bash
npx cds build --production
```

Build MTAR:

```bash
mbt build
```

Deploy MTAR:

```bash
cf deploy mta_archives/suppliershield_1.0.0.mtar -f
```

Check CF target:

```bash
cf target
```

Check apps:

```bash
cf apps
```

Check one app:

```bash
cf app suppliershield-approuter
cf app suppliershield-srv
```

Check recent logs:

```bash
cf logs suppliershield-srv --recent
cf logs suppliershield-approuter --recent
```

Check frontend route:

```bash
curl -I https://<approuter-route>/index.html
```

Check OData through app router:

```bash
curl https://<approuter-route>/odata/v4/supplier-shield/SupplierShield
```

Check OData directly:

```bash
curl https://<srv-route>/odata/v4/supplier-shield/SupplierShield
```

## 26. Deployment Checklist

Before deploy:

- `package.json` has `@cap-js/sqlite` in `dependencies`.
- `package.json` has `@sap/cds` in `dependencies`.
- `package.json` has `start` set to `cds-deploy && cds-serve`.
- `package.json` has CAP `db.kind` set to `sqlite`.
- `package.json` has CAP `auth.kind` set to `dummy`.
- `app/router/package.json` has `@sap/approuter`.
- `app/router/xs-app.json` has public routes.
- `mta.yaml` has only the backend and app router modules.
- `mta.yaml` has no XSUAA resource.
- `mta.yaml` has no HANA resource.
- `mta.yaml` copies seed CSV files into `gen/srv`.
- `.mtaignore` excludes local runtime files.

After deploy:

- `cf apps` shows both apps started.
- App router `/index.html` returns `200`.
- App router `/odata/v4/...` returns `200`.
- CAP service direct route returns `200`.
- Logs do not show SQLite initialization errors.

## 27. Current Supplier Shield Deployment Example

The deployed app router URL from this project was:

```text
https://brainbox-consulting-bv-brainboxconsultingig-dev-supplier8d21874.cfapps.eu10-005.hana.ondemand.com/
```

The deployed OData endpoint was:

```text
https://brainbox-consulting-bv-brainboxconsultingig-dev-supplier8d21874.cfapps.eu10-005.hana.ondemand.com/odata/v4/supplier-shield/SupplierShield
```

The generated MTAR was:

```text
mta_archives/suppliershield_1.0.0.mtar
```

## 28. When to Change This Architecture

Use this SQLite and no-auth model when:

- The app is small.
- The app is a demo, prototype, or internal throwaway tool.
- Data can be reset from CSV.
- Public access is acceptable.

Switch to HANA and XSUAA or IAS when:

- Data must be durable.
- Users need login.
- Different users need different authorizations.
- The app handles sensitive or business-critical data.
- Auditing and compliance matter.

