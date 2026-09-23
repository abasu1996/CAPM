using { flowmate.common.db as db } from '../db/schema';

@path: '/odata/v4/flowmate-common'
@requires: 'authenticated-user'
@impl: './master-data.js'
service CommonMasterDataService {
  @restrict: [
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin', 'UserProvisioning'] },
    { grant: '*', to: 'MasterDataAdmin' }
  ]
  entity Roles as projection on db.Roles;

  @restrict: [
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin', 'UserProvisioning'] },
    { grant: '*', to: 'MasterDataAdmin' },
    { grant: ['CREATE', 'UPDATE', 'DELETE'], to: 'UserProvisioning' }
  ]
  entity Users as projection on db.Users {
    *,
    role : redirected to Roles,
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
  { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin', 'CustomerProvisioning'] },
  { grant: '*', to: 'MasterDataAdmin' },
  { grant: ['CREATE', 'UPDATE', 'DELETE'], to: 'CustomerProvisioning' }
]
entity Customers as projection on db.Customers;

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
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin', 'UserProvisioning'] },
    { grant: '*', to: 'MasterDataAdmin' }
  ]
  entity Sites as projection on db.Sites;

   @restrict: [
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin', 'UserProvisioning'] },
    { grant: '*', to: 'MasterDataAdmin' }
  ]
  entity Materials as projection on db.Materials;

   @restrict: [
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin', 'UserProvisioning'] },
    { grant: '*', to: 'MasterDataAdmin' }
  ]
  entity Wbs as projection on db.Wbs;



   @restrict: [
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin', 'UserProvisioning'] },
    { grant: '*', to: 'MasterDataAdmin' }
  ]
  entity DocumentTypes as projection on db.DocumentTypes;

   @restrict: [
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin', 'UserProvisioning'] },
    { grant: '*', to: 'MasterDataAdmin' }
  ]
  entity CompanyCodes as projection on db.CompanyCodes;

   @restrict: [
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin', 'UserProvisioning'] },
    { grant: '*', to: 'MasterDataAdmin' }
  ]
  entity PurchasingGroups as projection on db.PurchasingGroups;

     @restrict: [
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin', 'UserProvisioning'] },
    { grant: '*', to: 'MasterDataAdmin' }
  ]
  entity Divisions as projection on db.Divisions;

    @restrict: [
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin', 'UserProvisioning'] },
    { grant: '*', to: 'MasterDataAdmin' }
  ]
  entity ApplicableTaxes as projection on db.ApplicableTaxes;

     @restrict: [
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin', 'UserProvisioning'] },
    { grant: '*', to: 'MasterDataAdmin' }
  ]
  entity Plant as projection on db.Plant;

    @restrict: [
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin', 'UserProvisioning'] },
    { grant: '*', to: 'MasterDataAdmin' }
  ]
  entity ServiceGroups as projection on db.ServiceGroups;

    @restrict: [
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin', 'UserProvisioning'] },
    { grant: '*', to: 'MasterDataAdmin' }
  ]
  entity ValuationClass as projection on db.ValuationClass;

  @restrict: [
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin', 'UserProvisioning'] },
    { grant: '*', to: 'MasterDataAdmin' }
  ]
  entity StorageLocation as projection on db.StorageLocation;

  @restrict: [
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin', 'UserProvisioning'] },
    { grant: '*', to: 'MasterDataAdmin' }
  ]
  entity SalesOrg as projection on db.SalesOrg;

   @restrict: [
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin', 'UserProvisioning'] },
    { grant: '*', to: 'MasterDataAdmin' }
  ]
  entity Incoterms as projection on db.Incoterms;

    @restrict: [
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin', 'UserProvisioning'] },
    { grant: '*', to: 'MasterDataAdmin' }
  ]
  entity CostCenter as projection on db.CostCenter;

  @restrict: [
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin', 'UserProvisioning'] },
    { grant: '*', to: 'MasterDataAdmin' }
  ]
  entity MatGroup as projection on db.MatGroup;

  @restrict: [
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin', 'UserProvisioning'] },
    { grant: '*', to: 'MasterDataAdmin' }
  ]
  entity ProfitCenter as projection on db.ProfitCenter;

  @restrict: [
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin', 'UserProvisioning'] },
    { grant: '*', to: 'MasterDataAdmin' }
  ]
  entity MRPType as projection on db.MRPType;

  @restrict: [
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin', 'UserProvisioning'] },
    { grant: '*', to: 'MasterDataAdmin' }
  ]
  entity AvailabilityCheck as projection on db.AvailabilityCheck;

  @restrict: [
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin', 'UserProvisioning'] },
    { grant: '*', to: 'MasterDataAdmin' }
  ]
  entity SerialNumberProfile as projection on db.SerialNumberProfile;

  @restrict: [
    { grant: 'READ', to: ['MasterDataRead', 'MasterDataAdmin', 'UserProvisioning'] },
    { grant: '*', to: 'MasterDataAdmin' }
  ]
  entity DistributionChannel as projection on db.DistributionChannel;

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
    roleCode: String(40),
    managerId: UUID,
    teamIds: many UUID,
    isActive: Boolean
  ) returns Users;

  function getUserAdministrationCapabilities() returns {
    canMaintainUsers : Boolean;
  };
}
