using { flowmate.common.db as db } from '../db/schema';

@path: '/odata/v4/flowmate-common'
@requires: 'authenticated-user'
@impl: './master-data.js'
service CommonMasterDataService {
  @restrict: [
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin', 'UserProvisioning'] },
    { grant: '*', to: 'MasterDataAdmin' },
    { grant: ['CREATE', 'UPDATE', 'DELETE'], to: 'UserProvisioning' }
  ]
  entity Users as projection on db.Users {
    *,
    manager : redirected to Users
  };

  @restrict: [
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin', 'UserProvisioning'] },
    { grant: '*', to: 'MasterDataAdmin' }
  ]
  entity Teams as projection on db.Teams {
    *,
    members : redirected to TeamMembers
  };

  @restrict: [
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin', 'UserProvisioning'] },
    { grant: '*', to: 'MasterDataAdmin' }
  ]
  entity TeamMembers as projection on db.TeamMembers {
    *,
    team : redirected to Teams,
    user : redirected to Users
  };

  @restrict: [
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin', 'VendorProvisioning'] },
    { grant: '*', to: 'MasterDataAdmin' },
    { grant: ['CREATE', 'UPDATE', 'DELETE'], to: 'VendorProvisioning' }
  ]
  entity Vendors as projection on db.Vendors;

  @restrict: [
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin', 'UserProvisioning'] },
    { grant: '*', to: 'MasterDataAdmin' }
  ]
  entity Delegations as projection on db.Delegations {
    *,
    delegator : redirected to Users,
    delegate  : redirected to Users
  };

  @restrict: [
    { grant: '*', to: ['MasterDataAdmin', 'UserProvisioning'] }
  ]
  action createUserWithTeams(
    userId: UUID,
    azureObjectId: String(100),
    userPrincipalName: String(255),
    displayName: String(160),
    email: String(255),
    department: String(100),
    managerId: UUID,
    teamIds: many UUID,
    isActive: Boolean
  ) returns Users;

  function getUserAdministrationCapabilities() returns {
    canMaintainUsers : Boolean;
  };
}
