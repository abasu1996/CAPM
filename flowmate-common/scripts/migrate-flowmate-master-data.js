const { execFileSync } = require("node:child_process");

const SOURCE_URL =
  process.env.FLOWMATE_SOURCE_URL ||
  "https://dialog-axiata-plc-arize-qas-9339ozek-org-a-qas-org-b-te48c9fbef.cfapps.ap11.hana.ondemand.com/odata/v4/flowmate";
const TARGET_URL =
  process.env.FLOWMATE_COMMON_URL ||
  "https://flowmate-common-srv-org-b-test.cfapps.ap11.hana.ondemand.com/odata/v4/flowmate-common";

function serviceCredentials(instance, keyName) {
  const output = execFileSync("cf", ["service-key", instance, keyName], {
    encoding: "utf8"
  });
  return JSON.parse(output.slice(output.indexOf("{"))).credentials;
}

async function accessToken(instance, keyName) {
  const credentials = serviceCredentials(instance, keyName);
  const authorization = Buffer.from(
    `${credentials.clientid}:${credentials.clientsecret}`
  ).toString("base64");
  const response = await fetch(`${credentials.url}/oauth/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${authorization}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) {
    throw new Error(`OAuth token request failed for ${instance}: HTTP ${response.status}`);
  }
  return body.access_token;
}

async function request(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...options.headers
    }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    throw new Error(
      `${options.method || "GET"} ${url} failed: HTTP ${response.status} ${JSON.stringify(body)}`
    );
  }
  return body;
}

async function readAll(baseUrl, entity, token) {
  const records = [];
  let url = `${baseUrl}/${entity}?$top=1000`;
  while (url) {
    const page = await request(url, token);
    records.push(...(page.value || []));
    const nextLink = page["@odata.nextLink"];
    url = nextLink ? new URL(nextLink, `${baseUrl}/`).toString() : undefined;
  }
  return records;
}

async function upsert(targetUrl, entity, payload, existingIds, token) {
  if (existingIds.has(payload.ID)) {
    await request(`${targetUrl}/${entity}(${payload.ID})`, token, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    return "updated";
  }
  await request(`${targetUrl}/${entity}`, token, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  existingIds.add(payload.ID);
  return "created";
}

async function main() {
  const [sourceToken, targetToken] = await Promise.all([
    accessToken(
      process.env.FLOWMATE_AUTH_INSTANCE || "flowmate-auth",
      process.env.FLOWMATE_AUTH_KEY || "flowmate-auth-key"
    ),
    accessToken(
      process.env.FLOWMATE_COMMON_AUTH_INSTANCE || "flowmate-common-auth",
      process.env.FLOWMATE_COMMON_AUTH_KEY || "flowmate-common-auth-key"
    )
  ]);

  const entityNames = ["Users", "Teams", "TeamMembers", "Vendors", "Delegations"];
  const [sourceData, targetData] = await Promise.all([
    Promise.all(entityNames.map((entity) => readAll(SOURCE_URL, entity, sourceToken))),
    Promise.all(entityNames.map((entity) => readAll(TARGET_URL, entity, targetToken)))
  ]);
  const source = Object.fromEntries(entityNames.map((entity, index) => [entity, sourceData[index]]));
  const existing = Object.fromEntries(
    entityNames.map((entity, index) => [
      entity,
      new Set(targetData[index].map((record) => record.ID))
    ])
  );
  const stats = Object.fromEntries(
    entityNames.map((entity) => [entity, { created: 0, updated: 0, skipped: 0 }])
  );

  for (const user of source.Users) {
    if (!user.ID || !user.displayName || !user.email) {
      stats.Users.skipped += 1;
      continue;
    }
    const result = await upsert(
      TARGET_URL,
      "Users",
      {
        ID: user.ID,
        userPrincipalName: user.userPrincipalName || user.email,
        displayName: user.displayName,
        email: user.email,
        azureObjectId: user.azureObjectId || null,
        isActive: user.isActive !== false
      },
      existing.Users,
      targetToken
    );
    stats.Users[result] += 1;
  }

  for (const user of source.Users) {
    if (!user.ID || !user.manager_ID || !existing.Users.has(user.manager_ID)) {
      continue;
    }
    await request(`${TARGET_URL}/Users(${user.ID})`, targetToken, {
      method: "PATCH",
      body: JSON.stringify({ manager_ID: user.manager_ID })
    });
  }

  for (const team of source.Teams) {
    if (!team.ID || !team.teamCode || !team.name) {
      stats.Teams.skipped += 1;
      continue;
    }
    const result = await upsert(
      TARGET_URL,
      "Teams",
      {
        ID: team.ID,
        teamCode: team.teamCode,
        name: team.name,
        description: team.description || null,
        isActive: team.isActive !== false
      },
      existing.Teams,
      targetToken
    );
    stats.Teams[result] += 1;
  }

  for (const vendor of source.Vendors) {
    if (!vendor.ID || !vendor.vendorCode || !vendor.vendorName) {
      stats.Vendors.skipped += 1;
      continue;
    }
    const result = await upsert(
      TARGET_URL,
      "Vendors",
      {
        ID: vendor.ID,
        vendorCode: vendor.vendorCode,
        vendorName: vendor.vendorName,
        vendorEmail: vendor.vendorEmail || null,
        isActive: true
      },
      existing.Vendors,
      targetToken
    );
    stats.Vendors[result] += 1;
  }

  for (const member of source.TeamMembers) {
    if (
      !member.ID ||
      !existing.Teams.has(member.team_ID) ||
      !existing.Users.has(member.user_ID)
    ) {
      stats.TeamMembers.skipped += 1;
      continue;
    }
    const result = await upsert(
      TARGET_URL,
      "TeamMembers",
      {
        ID: member.ID,
        team_ID: member.team_ID,
        user_ID: member.user_ID,
        isActive: member.isActive !== false
      },
      existing.TeamMembers,
      targetToken
    );
    stats.TeamMembers[result] += 1;
  }

  for (const delegation of source.Delegations) {
    const delegatorId = delegation.delegatorUser_ID;
    const delegateId = delegation.delegateUser_ID;
    if (
      !delegation.ID ||
      !existing.Users.has(delegatorId) ||
      !existing.Users.has(delegateId) ||
      !delegation.startDate ||
      !delegation.endDate
    ) {
      stats.Delegations.skipped += 1;
      continue;
    }
    const result = await upsert(
      TARGET_URL,
      "Delegations",
      {
        ID: delegation.ID,
        delegator_ID: delegatorId,
        delegate_ID: delegateId,
        startDate: delegation.startDate,
        endDate: delegation.endDate,
        forwardNotifications: delegation.forwardNotifications !== false,
        enabled: delegation.enabled !== false,
        createdOnBehalf: delegation.createdOnBehalf === true
      },
      existing.Delegations,
      targetToken
    );
    stats.Delegations[result] += 1;
  }

  console.table(stats);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
