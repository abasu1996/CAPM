@cds.persistence.skip
service CommonMasterDataService {
  @cds.persistence.skip
  entity Users {
    key ID              : UUID;
        userPrincipalName: String(255);
        displayName      : String(160);
        email            : String(255);
        azureObjectId    : String(100);
        manager          : Association to Users;
        isActive         : Boolean;
  }

  @cds.persistence.skip
  entity Teams {
    key ID         : UUID;
        teamCode   : String(40);
        name       : String(160);
        description: String(500);
        isActive   : Boolean;
  }

  @cds.persistence.skip
  entity TeamMembers {
    key ID       : UUID;
        team     : Association to Teams;
        user     : Association to Users;
        isActive : Boolean;
  }

  @cds.persistence.skip
  entity Vendors {
    key ID         : UUID;
        vendorCode : String(40);
        vendorName : String(180);
        vendorEmail: String(255);
        isActive   : Boolean;
  }

  @cds.persistence.skip
  entity Delegations {
    key ID                  : UUID;
        delegator           : Association to Users;
        delegate            : Association to Users;
        startDate           : Date;
        endDate             : Date;
        forwardNotifications: Boolean;
        enabled             : Boolean;
        createdOnBehalf     : Boolean;
  }
}
