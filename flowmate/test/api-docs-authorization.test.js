const test = require("node:test");
const assert = require("node:assert/strict");
const {
  API_DOCUMENTATION_AUTHORITIES,
  canViewApiDocumentation
} = require("../srv/lib/api-docs-authorization");

const userWith = (...authorities) => ({
  is: (authority) => authorities.includes(authority)
});

test("the dedicated API documentation viewer can access Swagger", () => {
  assert.equal(canViewApiDocumentation(userWith("ApiDocumentationViewer")), true);
});

test("existing administrator and provisioning authorities retain access", () => {
  for (const authority of ["Admin", "UserProvisioning", "VendorProvisioning"]) {
    assert.equal(canViewApiDocumentation(userWith(authority)), true, authority);
  }
});

test("an authenticated application user without a documentation authority is denied", () => {
  assert.equal(canViewApiDocumentation(userWith("authenticated-user")), false);
  assert.equal(canViewApiDocumentation(null), false);
});

test("the documentation authority list remains least-privilege and explicit", () => {
  assert.deepEqual(API_DOCUMENTATION_AUTHORITIES, [
    "ApiDocumentationViewer",
    "Admin",
    "UserProvisioning",
    "VendorProvisioning"
  ]);
});
