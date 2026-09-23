namespace flowmate.common.db;

using { cuid, managed, sap.common.CodeList } from '@sap/cds/common';

entity Roles : CodeList {
  key code : String(40);
  isActive : Boolean default true;
}

@assert.unique.userEmail: [email]
@assert.unique.userPrincipalName: [userPrincipalName]
entity Users : cuid, managed {
  referenceNumber   : String(30);
  userPrincipalName : String(255);
  displayName       : String(160) not null;
  email             : String(255) not null;
  azureObjectId     : String(100);
  department        : String(100);
  @title: 'Role'
  @Common.Text: (role.name)
  @Common.TextArrangement: #TextOnly
  role              : Association to one Roles @assert.target;
  @title: 'Manager'
  @Common.Text: (manager.displayName)
  @Common.TextArrangement: #TextOnly
  manager           : Association to one Users @assert.target;
  isActive          : Boolean default true;
}

@assert.unique.teamCode: [teamCode]
entity Teams : cuid, managed {
  referenceNumber : String(30);
  teamCode    : String(40) not null;
  name        : String(160) not null;
  description : String(500);
  isActive    : Boolean default true;
  members     : Composition of many TeamMembers
                  on members.team = $self;
}

@assert.unique.teamUser: [team, user]
entity TeamMembers : cuid, managed {
  referenceNumber : String(30);
  team            : Association to Teams not null;
  user            : Association to Users not null;
  displayName     : String(160);
  email           : String(255);
  isActive        : Boolean default true;
}

@assert.unique.vendorCode: [vendorCode]
entity Vendors : cuid, managed {
  vendorCode  : String(40) not null;
  vendorName  : String(180) not null;
  vendorEmail : String(255);
  isActive    : Boolean default true;
}
@assert.unique.customerCode: [customerCode]
entity Customers : cuid, managed {
    customerCode  : String(30) not null;
    customerName  : String(150) not null;
    customerEmail : String(255);
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

entity Sites : cuid, managed {
  siteId   : String(40) not null;
  siteName : String(180) not null;
  isActive : Boolean default true;
}

entity Materials: cuid, managed {
  materialCode : String(40) not null;
  materialDescription : String(180) not null;
  isActive     : Boolean default true;
}

entity Wbs: cuid, managed {
  wbsCode : String(40) not null;
  wbsDescription : String(180) not null;
  isActive     : Boolean default true;
}

entity DocumentTypes : cuid, managed {
  documentTypeCode : String(40) not null;
  documentTypeDescription : String(180) not null;
  isActive     : Boolean default true;
}

entity CompanyCodes : cuid, managed {
  companyCode : String(40) not null;
  companyName : String(180) not null;
  isActive     : Boolean default true;
}

entity PurchasingGroups : cuid, managed {
  purchasingGroupCode : String(40) not null;
  purchasingGroupName : String(180) not null;
  isActive     : Boolean default true;
}

entity Divisions : cuid, managed {
  divisionCode : String(40) not null;
  divisionName : String(180) not null;
  isActive     : Boolean default true;
}

entity ApplicableTaxes : cuid, managed {
  taxCode : String(40) not null;
  taxDescription : String(180) not null;
  isActive     : Boolean default true;
}

entity Plant : cuid, managed {
  plantCode : String(40) not null;
  plantName : String(180) not null;
  isActive     : Boolean default true;
}

entity ServiceGroups : cuid, managed {
  servicegroupCode : String(40) not null;
  servicegroupDescription : String(180) not null;
  isActive  : Boolean default true;
}

entity ValuationClass : cuid, managed{
  valuationclassCode : String(40) not null;
  valuationclassDescription : String(180) not null;
  isActive : Boolean default true;
}

entity StorageLocation : cuid, managed {
  storageLocationCode : String(40) not null;
  storageLocationName : String(180) not null;
  isActive : Boolean default true;
}

entity SalesOrg : cuid, managed {
  salesOrgCode : String(40) not null;
  salesOrgName : String(180) not null;
  isActive : Boolean default true;
}

entity Incoterms : cuid, managed {
  incotermsCode : String(40) not null;
  incotermsDescription : String(180) not null;
  isActive : Boolean default true;
}

entity CostCenter : cuid, managed {
  costCenterCode : String(40) not null;
  costCenterName : String(180) not null;
  isActive : Boolean default true;
}

entity MatGroup : cuid, managed {
  matGroupCode : String(40) not null;
  matGroupDescription : String(180) not null;
  isActive : Boolean default true;
}

entity ProfitCenter : cuid, managed {
  profitCenterCode : String(40) not null;
  profitCenterDescription : String(180) not null;
  isActive : Boolean default true;
}

entity MRPType : cuid, managed {
  mrpTypeCode : String(40) not null;
  mrpTypeDescription : String(180) not null;
  isActive : Boolean default true;
}

entity AvailabilityCheck : cuid, managed {
  availabilityCheckCode : String(40) not null;
  availabilityCheckDescription : String(180) not null;
  isActive : Boolean default true;
}

entity SerialNumberProfile : cuid, managed {
  serialNumberProfileCode : String(40) not null;
  serialNumberProfileDescription : String(180) not null;
  isActive : Boolean default true;
}

entity DistributionChannel : cuid, managed {
  distributionChannelCode : String(40) not null;
  distributionChannelDescription : String(180) not null;
  isActive : Boolean default true;
}
