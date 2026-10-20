const test = require("node:test");
const assert = require("node:assert/strict");
const CommonMasterDataService = require("../srv/master-data");

function serviceFixture() {
  const service = {};
  for (const name of Object.getOwnPropertyNames(CommonMasterDataService.prototype)) {
    if (name !== "constructor") service[name] = CommonMasterDataService.prototype[name];
  }
  return service;
}

test("users without an explicit type default to Internal User", () => {
  const user = serviceFixture()._normalizeUser({
    displayName: "Internal User",
    email: "internal@example.com",
    userPrincipalName: "internal@example.com"
  });

  assert.equal(user.userType, "INTERNAL");
});

test("unsupported user types are rejected", async () => {
  const req = {
    reject(status, message) {
      const error = new Error(message);
      error.status = status;
      throw error;
    }
  };
  const user = serviceFixture()._normalizeUser({
    displayName: "Unknown User",
    email: "unknown@example.com",
    userPrincipalName: "unknown@example.com",
    userType: "UNKNOWN"
  });

  await assert.rejects(
    serviceFixture()._validateMaintainedUser(req, user, "Users", "Roles"),
    /Select a valid user type/
  );
});
