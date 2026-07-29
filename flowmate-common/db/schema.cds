namespace flowmate.common.db;

using { cuid, managed } from '@sap/cds/common';

@assert.unique.userEmail: [email]
@assert.unique.userPrincipalName: [userPrincipalName]
entity Users : cuid, managed {
  userPrincipalName : String(255);
  displayName       : String(160) not null;
  email             : String(255) not null;
  azureObjectId     : String(100);
  manager           : Association to Users;
  isActive          : Boolean default true;
}

@assert.unique.teamCode: [teamCode]
entity Teams : cuid, managed {
  teamCode    : String(40) not null;
  name        : String(160) not null;
  description : String(500);
  isActive    : Boolean default true;
  members     : Composition of many TeamMembers
                  on members.team = $self;
}

@assert.unique.teamUser: [team, user]
entity TeamMembers : cuid, managed {
  team     : Association to Teams not null;
  user     : Association to Users not null;
  isActive : Boolean default true;
}

@assert.unique.vendorCode: [vendorCode]
entity Vendors : cuid, managed {
  vendorCode  : String(40) not null;
  vendorName  : String(180) not null;
  vendorEmail : String(255);
  isActive    : Boolean default true;
}

entity Delegations : cuid, managed {
  delegator            : Association to Users not null;
  delegate             : Association to Users not null;
  startDate            : Date not null;
  endDate              : Date not null;
  forwardNotifications : Boolean default true;
  enabled              : Boolean default true;
  createdOnBehalf      : Boolean default false;
}
