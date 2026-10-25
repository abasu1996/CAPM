const { executeHttpRequest } = require("@sap-cloud-sdk/http-client");

const DEFAULT_DESTINATION = "workhub-api";

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

function taskIdFromResponse(response) {
  const body = response?.data;
  const rows = Array.isArray(body) ? body : (Array.isArray(body?.value) ? body.value : []);
  const task = rows.find((row) => row && (row.iD || row.id || row.ID));
  return task?.iD || task?.id || task?.ID || "";
}

function externalMessage(error, fallback) {
  const body = error?.response?.data;
  const candidate = body?.message || body?.error?.message || body?.error || error?.message;
  const message = typeof candidate === "string" ? candidate.replace(/\s+/g, " ").trim() : "";
  return message && !/client_secret|authorization|token/i.test(message) ? message : fallback;
}

/**
 * Sends the PO numbers to Workhub and completes the corresponding Workhub task.
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
  viewId = process.env.WORKHUB_VIEW_ID,
  clientId = process.env.WORKHUB_CLIENT_ID,
  clientSecret = process.env.WORKHUB_CLIENT_SECRET,
  httpRequest = executeHttpRequest
} = {}) {
  const application = requiredSetting("WORKHUB application ID", applicationId);
  const workflow = requiredSetting("WORKHUB_WORKFLOW_ID", workflowId);
  const view = requiredSetting("WORKHUB_VIEW_ID", viewId);
  const id = requiredSetting("WORKHUB client ID", clientId);
  const secret = requiredSetting("WORKHUB client secret", clientSecret);
  const card = cardNumber(cardId);
  const poValue = requiredSetting("pONumber1", poNumber1);

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
        "content-type": "application/json"
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
    "content-type": "application/json"
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

  let taskResponse;
  try {
    taskResponse = await request({
      method: "get",
      url: `/api/view/${encodeURIComponent(workflow)}/${encodeURIComponent(view)}?Card_ID=${card}`,
      headers
    });
  } catch (error) {
    const status = error?.response?.status;
    throw Object.assign(new Error(`Workhub task lookup failed${status ? ` (${status})` : ""}: ${externalMessage(error, "the card task could not be found")}`), {
      cause: error,
      workhubStatus: status
    });
  }

  const taskId = taskIdFromResponse(taskResponse);
  if (!taskId) {
    throw new Error("Workhub task lookup failed: no task ID was returned for this card");
  }

  try {
    await request({
      method: "post",
      url: `/api/tasks/${encodeURIComponent(workflow)}/tasks/${encodeURIComponent(taskId)}`,
      headers,
      data: {
        action: "DONE",
        comment: String(approvalComment || "")
      }
    });
  } catch (error) {
    const status = error?.response?.status;
    throw Object.assign(new Error(`Workhub task submission failed${status ? ` (${status})` : ""}: ${externalMessage(error, "the task could not be completed")}`), {
      cause: error,
      workhubStatus: status
    });
  }

  return {
    applicationID: application,
    cardID: card,
    taskID: taskId,
    pONumber1: poValue
  };
}

module.exports = {
  cardNumber,
  sendPoNumbersToWorkhub,
  taskIdFromResponse
};
