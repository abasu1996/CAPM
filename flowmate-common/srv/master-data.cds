using { flowmate.common.db as db } from '../db/schema';

@path: '/odata/v4/flowmate-common'
@requires: 'authenticated-user'
service CommonMasterDataService {
  @restrict: [
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin'] },
    { grant: '*', to: 'MasterDataAdmin' }
  ]
  entity Users as projection on db.Users {
    *,
    manager : redirected to Users
  };

  @restrict: [
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin'] },
    { grant: '*', to: 'MasterDataAdmin' }
  ]
  entity Teams as projection on db.Teams {
    *,
    members : redirected to TeamMembers
  };

  @restrict: [
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin'] },
    { grant: '*', to: 'MasterDataAdmin' }
  ]
  entity TeamMembers as projection on db.TeamMembers {
    *,
    team : redirected to Teams,
    user : redirected to Users
  };

  @restrict: [
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin'] },
    { grant: '*', to: 'MasterDataAdmin' }
  ]
  entity Vendors as projection on db.Vendors;

  @restrict: [
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin'] },
    { grant: '*', to: 'MasterDataAdmin' }
  ]
  entity Delegations as projection on db.Delegations {
    *,
    delegator : redirected to Users,
    delegate  : redirected to Users
  };
}
