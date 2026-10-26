const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLIENT_FILE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const MAX_MANIFEST_FILES = 20;
const TECHNICAL_ATTACHMENT_CATEGORIES = new Set([
  "INVOICE_BOQ_ATTACHMENT",
  "EMAIL_APPROVAL_ATTACHMENT",
  "PROCUREMENT_APPROVAL_ATTACHMENT",
  "SUPPORTIVE_DOCUMENT_ATTACHMENT",
  "SUPPORTING_DOCUMENT"
]);
const EXACT_MEDIA_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
]);

function reject(req, status, message) {
  if (req?.reject) return req.reject(status, message);
  throw Object.assign(new Error(message), { status, statusCode: status });
}

function authenticatedTechnicalClient(user, req) {
  if (!user?.is?.("system-user") || !user.is("PORequestCreate")) {
    return reject(req, 403, "This API client is not authorized to upload purchase order attachments");
  }
  const clientId = user.authInfo?.getClientId?.();
  if (typeof clientId !== "string" || !clientId.trim()) {
    return reject(req, 403, "The authenticated API client could not be identified");
  }
  return clientId.trim();
}

function supportedMediaType(value) {
  const mimeType = String(value || "").trim().toLowerCase();
  return mimeType.startsWith("image/") || EXACT_MEDIA_TYPES.has(mimeType);
}

function normalizeAttachmentManifest(req, value, integration) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return reject(req, 400, "attachmentManifest must be an array");
  if (!integration && value.length) {
    return reject(req, 403, "attachmentManifest is available only to authorized technical PO clients");
  }
  if (value.length > MAX_MANIFEST_FILES) {
    return reject(req, 400, `attachmentManifest supports at most ${MAX_MANIFEST_FILES} files`);
  }
  const ids = new Set();
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return reject(req, 400, `attachmentManifest[${index}] must be an object`);
    }
    const clientFileId = String(entry.clientFileId || "").trim();
    const filename = String(entry.filename || "").trim();
    const category = String(entry.category || "").trim().toUpperCase();
    const mimeType = String(entry.mimeType || "").trim().toLowerCase();
    if (!CLIENT_FILE_ID.test(clientFileId)) {
      return reject(req, 400, `attachmentManifest[${index}].clientFileId is invalid`);
    }
    if (ids.has(clientFileId)) return reject(req, 400, `Duplicate clientFileId '${clientFileId}'`);
    ids.add(clientFileId);
    if (!filename || filename.length > 255 || /[\\/\0]/.test(filename) || filename === "." || filename === "..") {
      return reject(req, 400, `attachmentManifest[${index}].filename is invalid`);
    }
    if (!TECHNICAL_ATTACHMENT_CATEGORIES.has(category)) {
      return reject(req, 400, `attachmentManifest[${index}].category is not supported`);
    }
    if (!supportedMediaType(mimeType)) {
      return reject(req, 400, `attachmentManifest[${index}].mimeType is not supported`);
    }
    return { clientFileId, filename, category, mimeType };
  });
}

// Only use the security context produced by CAP's authentication middleware.
// The authorized client supplies the business requester separately in the
// payload. Its active shared-user record is validated by the action handler.
function resolveTechnicalCreator(req) {
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

  const userId = req.data.input?.requesterUser_ID;
  if (!userId) {
    return req.reject(400, "requesterUser_ID is required for an integration-created request");
  }
  if (typeof userId !== "string" || !UUID.test(userId)) {
    return req.reject(400, "requesterUser_ID must be a valid shared-user UUID");
  }

  return { clientId, userId: userId.toLowerCase() };
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

module.exports = {
  resolveTechnicalCreator,
  guardTechnicalOperation,
  assertTechnicalDetails,
  authenticatedTechnicalClient,
  normalizeAttachmentManifest,
  supportedMediaType,
  MAX_MANIFEST_FILES
};
