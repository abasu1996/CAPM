const API_DOCUMENTATION_AUTHORITIES = Object.freeze([
  "ApiDocumentationViewer",
  "Admin",
  "UserProvisioning",
  "VendorProvisioning"
]);

function canViewApiDocumentation(user) {
  return !!user && API_DOCUMENTATION_AUTHORITIES.some((authority) => user.is?.(authority));
}

module.exports = {
  API_DOCUMENTATION_AUTHORITIES,
  canViewApiDocumentation
};
