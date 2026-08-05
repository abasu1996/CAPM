@cds.persistence.skip
service CommonMasterDataService {
  @cds.persistence.skip
  entity Roles {
    key code : String(40);
        name : String(255);
        descr: String(1000);
  }

  @cds.persistence.skip
  entity Users {
    key ID               : UUID;
        referenceNumber  : String(30);
        userPrincipalName: String(255);
        displayName      : String(160);
        email            : String(255);
        azureObjectId    : String(100);
        department       : String(100);
        role             : Association to Roles;
        manager          : Association to Users;
        isActive         : Boolean;
  }

  @cds.persistence.skip
  entity Teams {
    key ID              : UUID;
        referenceNumber : String(30);
        teamCode        : String(40);
        name            : String(160);
        description     : String(500);
        isActive        : Boolean;
        members         : Association to many TeamMembers
                          on members.team = $self;
  }

  @cds.persistence.skip
  entity TeamMembers {
    key ID              : UUID;
        referenceNumber : String(30);
        team            : Association to Teams;
        user            : Association to Users;
        displayName     : String(160);
        email           : String(255);
        isActive        : Boolean;
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
        delegatorEmail      : String(255);
        delegateEmail       : String(255);
        startDate           : Date;
        endDate             : Date;
        forwardNotifications: Boolean;
        enabled             : Boolean;
        createdOnBehalf     : Boolean;
  }

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
}
