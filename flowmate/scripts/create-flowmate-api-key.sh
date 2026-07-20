#!/usr/bin/env bash

set -euo pipefail

SERVICE_INSTANCE="${FLOWMATE_API_AUTH_SERVICE:-flowmate-api-auth}"
SERVICE_KEY="${FLOWMATE_API_SERVICE_KEY:-flowmate-external-api-key}"

if ! cf service "${SERVICE_INSTANCE}" >/dev/null 2>&1; then
  echo "XSUAA service '${SERVICE_INSTANCE}' was not found. Deploy the MTA first."
  exit 1
fi

if cf service-key "${SERVICE_INSTANCE}" "${SERVICE_KEY}" >/dev/null 2>&1; then
  echo "Service key '${SERVICE_KEY}' already exists and was left unchanged."
  exit 0
fi

cf create-service-key "${SERVICE_INSTANCE}" "${SERVICE_KEY}" \
  -c '{"credential-type":"binding-secret"}'

echo "Created service key '${SERVICE_KEY}' on '${SERVICE_INSTANCE}'."
echo "Retrieve it explicitly with: cf service-key ${SERVICE_INSTANCE} ${SERVICE_KEY}"
