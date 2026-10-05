const CLIENT_MAPPING_ENV = "FLOWMATE_CA_PO_INTEGRATION_CLIENTS";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Only use the security context produced by CAP's authentication middleware.
// Never accept the client ID or integration user from headers or the payload.
function resolveTechnicalCreator(req, mappingJson = process.env[CLIENT_MAPPING_ENV]) {
  if (!req.user.is("system-user")) return null;

  if (req.event !== "createRequest" || !req.user.is("PORequestCreate")) {
    return req.reject(403, "This API client is not authorized to create purchase order requests");
  }
  if (req.data.input?.requestTypeCode !== "PURCHASE_ORDER") {
    return req.reject(403, "This API permission allows purchase order requests only");
  }

  const clientId = req.user.authInfo?.getClientId?.();
  if (typeof clientId !== "string" || !clientId.trim()) {
    return req.reject(403, "The authenticated API client could not be identified");
  }

  let clients;
  try {
    clients = JSON.parse(mappingJson || "{}");
  } catch {
    return req.reject(503, "PO integration configuration is invalid. Contact your administrator");
  }
  if (!clients || typeof clients !== "object" || Array.isArray(clients)) {
    return req.reject(503, "PO integration configuration is invalid. Contact your administrator");
  }
  if (!Object.hasOwn(clients, clientId)) {
    return req.reject(403, "This API client has no configured PO integration user. Contact your administrator");
  }
  const userId = clients[clientId];
  if (typeof userId !== "string" || !UUID.test(userId)) {
    return req.reject(503, "The configured PO integration user ID is invalid. Contact your administrator");
  }

  return { clientId, userId };
}

function guardTechnicalOperation(req) {
  if (!req.user.is("system-user")) return;
  // Keep existing reads and the read-only connection diagnostic available.
  // Creation has its own permission and identity checks in the action handler.
  if (["READ", "createRequest", "getFlowmateConnectionStatus"].includes(req.event)) return;
  return req.reject(403, "Technical clients can create purchase orders through createRequest; this operation requires a business user");
}

function assertTechnicalDetails(req, details) {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return req.reject(400, "PO details must contain a JSON object");
  }
  if (details.items !== undefined && !Array.isArray(details.items)) {
    return req.reject(400, "PO items must contain an array");
  }
  const managed = ["ID", "createdAt", "createdBy", "modifiedAt", "modifiedBy"];
  const check = (value, reserved) => {
    if (value && reserved.some((field) => Object.hasOwn(value, field))) {
      req.reject(400, "PO details must not override record IDs, parent links or audit fields");
    }
  };
  check(details, [...managed, "request", "request_ID"]);
  for (const item of Array.isArray(details.items) ? details.items : []) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return req.reject(400, "Each PO item must contain a JSON object");
    }
    check(item, [...managed, "details", "details_ID", "itemNo"]);
  }
}

module.exports = { resolveTechnicalCreator, guardTechnicalOperation, assertTechnicalDetails };
