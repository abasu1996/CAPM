const { executeHttpRequest } = require("@sap-cloud-sdk/http-client");

const DEFAULT_DESTINATION = "workhub-api";
// Workhub's gateway rejects the Cloud SDK's default user agent. Use the agent
// from its published cURL example for each request in this integration.
const DEFAULT_USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

function requiredSetting(name, value) {
  const resolved = String(value ?? "").trim();
  if (!resolved) {
    throw new Error(`Workhub integration is not configured: set ${name}`);
  }
  return resolved;
}

function cardNumber(value) {
  const text = String(value ?? "").trim();
  const number = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(number)) {
    throw new Error("WorkHUBID must contain the numeric Workhub card ID");
  }
  return number;
}

function externalMessage(error, fallback) {
  const body = error?.response?.data;
  const candidate = body?.message || body?.error?.message || body?.error || error?.message;
  const message = typeof candidate === "string" ? candidate.replace(/\s+/g, " ").trim() : "";
  return message && !/client_secret|authorization|token/i.test(message) ? message : fallback;
}

/**
 * Sends the PO numbers to the Workhub card without submitting its workflow task.
 *
 * Workhub's authentication API expects client credentials in a JSON body. The
 * credentials therefore come only from the server environment; they are never
 * accepted from the browser action payload.
 */
async function sendPoNumbersToWorkhub({
  applicationId,
  cardId,
  poNumber1,
  approvalComment = "",
  destinationName = process.env.WORKHUB_DESTINATION || DEFAULT_DESTINATION,
  workflowId = process.env.WORKHUB_WORKFLOW_ID,
  clientId = process.env.WORKHUB_CLIENT_ID,
  clientSecret = process.env.WORKHUB_CLIENT_SECRET,
  httpRequest = executeHttpRequest
} = {}) {
  const application = requiredSetting("WORKHUB application ID", applicationId);
  const workflow = requiredSetting("WORKHUB_WORKFLOW_ID", workflowId);
  const id = requiredSetting("WORKHUB client ID", clientId);
  const secret = requiredSetting("WORKHUB client secret", clientSecret);
  const card = cardNumber(cardId);
  const poValue = requiredSetting("pONumber1", poNumber1);
  const userAgent = process.env.WORKHUB_USER_AGENT || DEFAULT_USER_AGENT;

  const request = (config) => httpRequest(
    { destinationName },
    config,
    { fetchCsrfToken: false }
  );

  let tokenResponse;
  try {
    tokenResponse = await request({
      method: "post",
      url: "/api/auth/token",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": userAgent
      },
      data: {
        client_id: id,
        client_secret: secret,
        grant_type: "client_credentials"
      }
    });
  } catch (error) {
    const status = error?.response?.status;
    throw Object.assign(new Error(`Workhub authentication failed${status ? ` (${status})` : ""}: ${externalMessage(error, "the token endpoint rejected the request")}`), {
      cause: error,
      workhubStatus: status
    });
  }

  const token = tokenResponse?.data?.token || tokenResponse?.data?.access_token;
  if (!token) {
    throw new Error("Workhub authentication failed: the token response did not contain a token");
  }
  const headers = {
    accept: "application/json",
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "user-agent": userAgent
  };
  const updatePath = `/api/workflows/${encodeURIComponent(workflow)}/${encodeURIComponent(application)}/cards/${card}`;
  const updatePayload = {
    applicationID: application,
    approvalComment: String(approvalComment || ""),
    cardID: card,
    pONumber1: poValue,
    pONumber2: "",
    pONumber3: "",
    pOValidationStatus: "Approved",
    reasonForRejection: "",
    rejectionComment: ""
  };

  try {
    await request({ method: "put", url: updatePath, headers, data: updatePayload });
  } catch (error) {
    const status = error?.response?.status;
    throw Object.assign(new Error(`Workhub PO update failed${status ? ` (${status})` : ""}: ${externalMessage(error, "the card could not be updated")}`), {
      cause: error,
      workhubStatus: status
    });
  }

  return {
    applicationID: application,
    cardID: card,
    pONumber1: poValue
  };
}

module.exports = {
  cardNumber,
  sendPoNumbersToWorkhub
};
