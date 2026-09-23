@cds.persistence.skip
service CommonMasterDataService {
  @cds.persistence.skip
  entity Users {
    key ID              : UUID;
        referenceNumber : String(30);
        userPrincipalName: String(255);
        displayName      : String(160);
        email            : String(255);
        azureObjectId    : String(100);
        department       : String(100);
        manager          : Association to Users;
        isActive         : Boolean;
  }

  @cds.persistence.skip
  entity Teams {
    key ID         : UUID;
        referenceNumber: String(30);
        teamCode   : String(40);
        name       : String(160);
        description: String(500);
        isActive   : Boolean;
  }

  @cds.persistence.skip
  entity TeamMembers {
    key ID       : UUID;
        referenceNumber: String(30);
        team     : Association to Teams;
        user     : Association to Users;
        displayName: String(160);
        email      : String(255);
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
   @cds.persistence.skip
  entity Sites {
    key ID       : UUID;
        siteId   : String(40);
        siteName : String(180);
        isActive : Boolean;
  }

   @cds.persistence.skip
  entity Materials {
    key ID       : UUID;
        materialCode   : String(40);
        materialDescription : String(180);
        isActive : Boolean;
  }

   @cds.persistence.skip
  entity Wbs {
    key ID       : UUID;
        wbsCode   : String(40);
        wbsDescription : String(180);
        isActive : Boolean;
  }

  @cds.persistence.skip
  entity DocumentTypes {
    key ID       : UUID;
        documentTypeCode   : String(40);
        documentTypeDescription : String(180);
        isActive : Boolean;
  }

  @cds.persistence.skip
  entity CompanyCodes {
    key ID       : UUID;
        companyCode   : String(40);
        companyName : String(180);
        isActive : Boolean;
  }

  @cds.persistence.skip
  entity PurchasingGroups {
    key ID       : UUID;
        purchasingGroupCode   : String(40);
        purchasingGroupName : String(180);
        isActive : Boolean;
  }

  @cds.persistence.skip
  entity Divisions {
    key ID       : UUID;
        divisionCode   : String(40);
        divisionName : String(180);
        isActive : Boolean;
  }

  @cds.persistence.skip
  entity ApplicableTaxes {
    key ID       : UUID;
        taxCode   : String(40);
        taxDescription : String(180);
        isActive : Boolean;
  }
  @cds.persistence.skip
  entity Plant {
    key ID       : UUID;
        plantCode   : String(40);
        plantName : String(180);
        isActive : Boolean;
  }
  @cds.persistence.skip
  entity ServiceGroups {
    key ID      : UUID;
    servicegroupCode : String(40) not null;
    servicegroupDescription : String(180) not null;
    isActive  : Boolean default true;
  }
  @cds.persistence.skip
  entity ValuationClass {
    key ID    :UUID;
    valuationclassCode : String(40) not null;
    valuationclassDescription : String(180) not null;
    isActive : Boolean default true;

  }
  @cds.persistence.skip
  entity StorageLocation {
    key ID  :UUID;
  storageLocationCode : String(40) not null;
  storageLocationName : String(180) not null;
  isActive : Boolean default true;
  }

  @cds.persistence.skip
  entity SalesOrg {
  key ID: UUID;
  salesOrgCode : String(40) not null;
  salesOrgName : String(180) not null;
  isActive : Boolean default true;
}
  @cds.persistence.skip
  entity Incoterms {
    key ID: UUID;
     incotermsCode : String(40) not null;
  incotermsDescription : String(180) not null;
  isActive : Boolean default true;
  }
   @cds.persistence.skip
  entity CostCenter {
  key ID  :UUID;
  costCenterCode : String(40) not null;
  costCenterName : String(180) not null;
  isActive : Boolean default true;
  }

  @cds.persistence.skip
  entity MatGroup {
    key ID : UUID;
    matGroupCode : String(40) not null;
    matGroupDescription : String(180) not null;
    isActive : Boolean default true;
  }

  @cds.persistence.skip
  entity ProfitCenter {
    key ID : UUID;
    profitCenterCode : String(40) not null;
    profitCenterDescription : String(180) not null;
    isActive : Boolean default true;
  }

  @cds.persistence.skip
  entity MRPType {
    key ID : UUID;
    mrpTypeCode : String(40) not null;
    mrpTypeDescription : String(180) not null;
    isActive : Boolean default true;
  }

  @cds.persistence.skip
  entity AvailabilityCheck {
    key ID : UUID;
    availabilityCheckCode : String(40) not null;
    availabilityCheckDescription : String(180) not null;
    isActive : Boolean default true;
  }

  @cds.persistence.skip
  entity SerialNumberProfile {
    key ID : UUID;
    serialNumberProfileCode : String(40) not null;
    serialNumberProfileDescription : String(180) not null;
    isActive : Boolean default true;
  }

  @cds.persistence.skip
  entity DistributionChannel {
    key ID : UUID;
    distributionChannelCode : String(40) not null;
    distributionChannelDescription : String(180) not null;
    isActive : Boolean default true;
  }
}
