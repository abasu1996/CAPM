const test = require("node:test");
const assert = require("node:assert/strict");
const FlowmateService = require("../srv/flowmate");

function serviceFixture(userType = "INTERNAL") {
  const service = {};
  for (const name of Object.getOwnPropertyNames(FlowmateService.prototype)) {
    if (name !== "constructor") service[name] = FlowmateService.prototype[name];
  }
  service._currentReservationUser = async () => ({ user: { userType } });
  return service;
}

function request({ roles = [], grantType, suppliedOrigin = "VENDOR" } = {}) {
  return {
    data: { requestOrigin: suppliedOrigin },
    user: {
      id: "interactive.user@example.com",
      is: (role) => roles.includes(role),
      authInfo: grantType ? { getGrantType: () => grantType } : undefined
    }
  };
}

test("an interactive internal user's supplied origin is replaced", async () => {
  const service = serviceFixture("INTERNAL");
  const req = request({ suppliedOrigin: "EXTERNAL_API" });

  await service._applyTrustedRequestOrigin(req, {});

  assert.equal(req.data.requestOrigin, "INTERNAL_USER");
});

test("an interactive vendor is derived from the trusted user record", async () => {
  const service = serviceFixture("VENDOR");
  const req = request({ suppliedOrigin: "INTERNAL_USER" });

  await service._applyTrustedRequestOrigin(req, {});

  assert.equal(req.data.requestOrigin, "VENDOR");
});

test("a technical user record maps to the external API origin", async () => {
  const service = serviceFixture("TECHNICAL_API");
  const req = request({ suppliedOrigin: "INTERNAL_USER" });

  await service._applyTrustedRequestOrigin(req, {});

  assert.equal(req.data.requestOrigin, "EXTERNAL_API");
});

test("a wildcard system-user role on an interactive identity does not override the user record", async () => {
  const service = serviceFixture("VENDOR");
  const req = request({ roles: ["system-user"], suppliedOrigin: "INTERNAL_USER" });

  await service._applyTrustedRequestOrigin(req, {});

  assert.equal(req.data.requestOrigin, "VENDOR");
});

test("a CAP system principal is treated as an external API", async () => {
  const service = serviceFixture("VENDOR");
  service._currentReservationUser = async () => {
    throw new Error("A technical client must not be resolved from a payload user");
  };
  const req = request({ roles: ["system-user"], suppliedOrigin: "INTERNAL_USER" });
  req.user.id = "system";

  await service._applyTrustedRequestOrigin(req, {});

  assert.equal(req.data.requestOrigin, "EXTERNAL_API");
});

test("a client-credentials token is always treated as an external API", async () => {
  const service = serviceFixture("INTERNAL");
  service._currentReservationUser = async () => {
    throw new Error("A technical client must not be resolved from a payload user");
  };
  const req = request({ grantType: "client_credentials", suppliedOrigin: "VENDOR" });

  await service._applyTrustedRequestOrigin(req, {});

  assert.equal(req.data.requestOrigin, "EXTERNAL_API");
});
