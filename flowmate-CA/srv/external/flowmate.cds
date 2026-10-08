@cds.external
@cds.persistence.skip
@path: '/odata/v4/flowmate'
service FlowmateService {
  entity ProcessTypes {
    key code     : String(30);
        name     : String(255);
        descr    : String(500);
        isActive : Boolean;
  }
  entity ProcessSubTypes {
    key code                 : String(50);
        name                 : String(255);
        descr                : String(500);
        isActive             : Boolean;
        processType_code     : String(30);
        loaApprovalApplicable: Boolean;
        processOwner         : String(100);
        activityDescription  : String(500);
        sapTCode             : String(100);
  }
  entity PaymentCategories {
    key code     : String(20);
        name     : String(255);
        descr    : String(500);
        isActive : Boolean;
  }
  entity FtkEntities {
    key code     : String(30);
        name     : String(255);
        descr    : String(500);
        isActive : Boolean;
  }
  entity Currencies {
    key code     : String(10);
        name     : String(255);
        descr    : String(500);
        isActive : Boolean;
  }
  entity Categories {
    key code     : String(20);
        name     : String(255);
        descr    : String(500);
        isActive : Boolean;
  }
  entity PaymentSubCategories {
    key code     : String(20);
        name     : String(255);
        descr    : String(500);
        isActive : Boolean;
  }
  entity PaymentMethod {
    key code     : String(20);
        name     : String(255);
        descr    : String(500);
        isActive : Boolean;
  }
  entity TypeOfPayment {
    key code     : String(30);
        name     : String(255);
        descr    : String(500);
        isActive : Boolean;
  }
  entity RequestDivision {
    key code     : String(30);
        name     : String(255);
        descr    : String(500);
        isActive : Boolean;
  }
  entity GuaranteeTypes {
    key code     : String(40);
        name     : String(255);
        descr    : String(500);
        isActive : Boolean;
  }
  entity Priorities {
    key code     : String(20);
        name     : String(255);
        descr    : String(500);
        isActive : Boolean;
  }
  entity Customers {
    key ID          : UUID;
        customerCode : String(40);
        customerName : String(180);
        customerEmail: String(255);
        isActive     : Boolean;
  }
  entity Vendors {
    key ID         : UUID;
        vendorCode : String(40);
        vendorName : String(180);
        vendorEmail: String(255);
        isActive   : Boolean;
  }
  entity Teams {
    key ID       : UUID;
        teamCode : String(40);
        name     : String(160);
        isActive : Boolean;
  }
  @cds.persistence.skip
  entity ProcessRequests {
    key ID              : UUID;
        referenceNumber : String(30);
        title           : String(255);
        description     : LargeString;
        processType_code : String(30);
        subProcessType_code : String(50);
        requesterUser_ID : UUID;
        requesterUserName : String(100);
        requesterEmail : String(255);
        processorTeam_ID : UUID;
        processorTeamName : String(150);
        department : String(100);
        amount : Decimal(15,2);
        role : String(100);
        priorityConfig_code : String(20);
        status_code     : String(20);
        requester       : String(100);
        createdAt       : Timestamp;
  }

  @requires: 'RequestProvisioning'
  action createRequestWithAttachments(
    input       : LargeString,
    attachments : LargeString
  ) returns ProcessRequests;
}
