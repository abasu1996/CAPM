namespace flowmate.ca.db;

using { cuid, managed } from '@sap/cds/common';
using { Attachments } from '@cap-js/attachments';
using { CommonMasterDataService as common } from '../srv/external/common-master';

aspect ConfigCode {
  key code        : String(40);
      name        : String(160) not null;
      description : String(500);
      isActive    : Boolean default true;
      sortOrder   : Integer default 0;
}

entity RequestTypes : ConfigCode {
  icon : String(80);
}

entity RequestVariants : ConfigCode {
  requestType : Association to RequestTypes not null;
}

entity RequestStatuses : ConfigCode {};
entity TaskStatuses : ConfigCode {};
entity Priorities : ConfigCode {};
entity Plants : ConfigCode {};
entity UnitsOfMeasure : ConfigCode {};
entity MaterialGroups : ConfigCode {};
entity ExternalMaterialGroups : ConfigCode {};
entity ProfitCenters : ConfigCode {};
entity ValuationClasses : ConfigCode {};
entity CoupaCommodityCodes : ConfigCode {};
entity ServiceGroups : ConfigCode {};
entity Warehouses : ConfigCode {};
entity PurchaseOrderTypes : ConfigCode {};
entity ProcurementCategories : ConfigCode {};
entity Currencies : ConfigCode {};
entity PurchasingOrganizations : ConfigCode {};
entity PaymentTerms : ConfigCode {};
entity ProjectTypes : ConfigCode {};
entity ContractCategories : ConfigCode {};

entity WorkflowStepConfigs : cuid, managed {
  requestType         : Association to RequestTypes not null;
  requestVariant      : Association to RequestVariants;
  stepNo              : Integer not null;
  stepName            : String(160) not null;
  activityDescription : String(1000);
  processorTeam       : Association to common.Teams;
  roleCode            : String(80);
  taskName            : String(180);
  isApproval          : Boolean default false;
  isMandatory         : Boolean default true;
  slaDays             : Integer default 2;
  isActive            : Boolean default true;
}

entity CARequests : cuid, managed {
  referenceNumber : String(40);
  requestType     : Association to RequestTypes not null;
  requestVariant  : Association to RequestVariants;
  title           : String(255) not null;
  description     : LargeString;
  requester       : Association to common.Users;
  requesterName   : String(160);
  requesterEmail  : String(255);
  owner           : Association to common.Users;
  ownerTeam       : Association to common.Teams;
  ownerTeamName   : String(160);
  status          : Association to RequestStatuses;
  priority        : Association to Priorities;
  currentStep     : Integer default 0;
  dueDate         : Date;
  submittedAt     : DateTime;
  completedAt     : DateTime;
  externalObjectId: String(120);
  externalStatus  : String(80);

  predecessor     : Association to CARequests;
  successors      : Association to many CARequests
                      on successors.predecessor = $self;
  stepInstances   : Composition of many RequestStepInstances
                      on stepInstances.request = $self;
  tasks           : Composition of many CATasks
                      on tasks.request = $self;
  attachments     : Composition of many CAAttachments
                      on attachments.request = $self;
  comments        : Composition of many CAComments
                      on comments.request = $self;
  involvedParties : Composition of many CAInvolvedParties
                      on involvedParties.request = $self;
  history         : Composition of many CAHistory
                      on history.request = $self;

  materialCode       : Composition of one MaterialCodeDetails
                         on materialCode.request = $self;
  serviceCode        : Composition of one ServiceCodeDetails
                         on serviceCode.request = $self;
  equipmentCode      : Composition of one EquipmentCodeDetails
                         on equipmentCode.request = $self;
  projectCode        : Composition of one ProjectCodeDetails
                         on projectCode.request = $self;
  materialReservation: Composition of one MaterialReservationDetails
                         on materialReservation.request = $self;
  outlineContract    : Composition of one OutlineContractDetails
                         on outlineContract.request = $self;
  purchaseOrder      : Composition of one PurchaseOrderDetails
                         on purchaseOrder.request = $self;
  serviceEntrySheet  : Composition of one ServiceEntrySheetDetails
                         on serviceEntrySheet.request = $self;
}

entity RequestStepInstances : cuid, managed {
  request             : Association to CARequests not null;
  config              : Association to WorkflowStepConfigs;
  stepNo              : Integer not null;
  stepName            : String(160) not null;
  activityDescription : String(1000);
  processorTeam       : Association to common.Teams;
  processorTeamName   : String(160);
  status              : String(30) default 'PENDING';
  startedAt           : DateTime;
  completedAt         : DateTime;
}

entity CATasks : cuid, managed {
  referenceNumber : String(40);
  request         : Association to CARequests not null;
  stepInstance    : Association to RequestStepInstances;
  stepNo          : Integer not null;
  taskName        : String(180) not null;
  description     : LargeString;
  assignedUser    : Association to common.Users;
  assignedTeam    : Association to common.Teams;
  assignedName    : String(160);
  assignedEmail   : String(255);
  assignedTeamName: String(160);
  status          : Association to TaskStatuses;
  isMandatory     : Boolean default true;
  isApproval      : Boolean default false;
  dueDate         : Date;
  decision        : String(40);
  remarks         : LargeString;
  completedAt     : DateTime;
}

entity CAAttachments : Attachments {
  request : Association to CARequests not null;
  category: String(60);
}

annotate CAAttachments with {
  content @Validation.Maximum: '400MB'
          @Core.AcceptableMediaTypes: [
            'application/pdf',
            'image/*',
            'text/plain',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          ];
};

entity CAComments : cuid, managed {
  request     : Association to CARequests not null;
  comment     : LargeString not null;
  authorName  : String(160);
  authorEmail : String(255);
}

entity CAInvolvedParties : cuid, managed {
  request     : Association to CARequests not null;
  user        : Association to common.Users not null;
  displayName : String(160);
  email       : String(255);
  purpose     : String(500);
}

entity CAHistory : cuid, managed {
  request   : Association to CARequests not null;
  stepNo    : Integer;
  action    : String(80) not null;
  actorName : String(160);
  actorEmail: String(255);
  oldStatus : String(40);
  newStatus : String(40);
  remarks   : LargeString;
}

entity MaterialCodeDetails : cuid, managed {
  request                : Association to CARequests not null;
  materialCategory       : String(40);
  transactionType        : String(40);
  referenceMaterialCode  : String(40);
  dmsUpdate              : Boolean default false;
  plant                  : Association to Plants;
  description            : String(40);
  unitOfMeasure          : Association to UnitsOfMeasure;
  materialGroup          : Association to MaterialGroups;
  externalMaterialGroup  : Association to ExternalMaterialGroups;
  profitCenter           : Association to ProfitCenters;
  snp                    : String(60);
  hsCode                 : String(40);
  valuationClass         : Association to ValuationClasses;
  coupaCommodityCode     : Association to CoupaCommodityCodes;
  storageLocation        : String(40);
  salesOrganization      : String(40);
  distributionChannel    : String(40);
  division               : String(40);
  deliveringPlant        : Association to Plants;
  taxClass               : String(40);
  accountAssignmentGroup : String(60);
  productHierarchy       : String(120);
  serialNumberProfile    : String(80);
  inspectionStock        : Boolean default false;
  sourceList             : Boolean default false;
  commodityImportCode    : String(60);
  itemName               : String(160);
  itemCategory           : String(80);
  unitsPerItem           : Decimal(15,3);
  unitPrice              : Decimal(15,2);
  taxPercentage          : Decimal(5,2);
  isSaleable             : Boolean;
  isSerialized           : Boolean;
  requiredAgents         : String(255);
  vendor                 : Association to common.Vendors;
  defaultWarrantyPeriod  : Integer;
  warrantyType           : String(80);
  valueType              : String(80);
  sbu                    : String(80);
  configurationId        : String(80);
}

entity ServiceCodeDetails : cuid, managed {
  request            : Association to CARequests not null;
  transactionType    : String(40);
  referenceServiceCode: String(40);
  serviceCategory    : String(80);
  serviceDescription : String(40);
  unitOfMeasure      : Association to UnitsOfMeasure;
  serviceGroup       : Association to ServiceGroups;
  valuationClass     : Association to ValuationClasses;
  coupaCommodityCode : Association to CoupaCommodityCodes;
}

entity EquipmentCodeDetails : cuid, managed {
  request          : Association to CARequests not null;
  transactionType  : String(40);
  siteId           : String(80);
  materialCode     : String(40);
  serialNumber     : String(100);
  wbsElement       : String(80);
  commissionedDate : Date;
  approver          : Association to common.Users;
}

entity ProjectCodeDetails : cuid, managed {
  request                 : Association to CARequests not null;
  selectionMode           : String(20);
  transactionType         : String(40);
  requestedByArea         : String(40);
  functionLocationRequired: Boolean default false;
  activityRequired        : Boolean default false;
  projectName             : String(180);
  vendor                  : Association to common.Vendors;
  scope                   : LargeString;
  entityCode              : String(60);
  projectType             : Association to ProjectTypes;
  arReference             : String(80);
  functionLocation        : String(80);
  activityNumber          : String(80);
  remarks                 : LargeString;
}

entity MaterialReservationDetails : cuid, managed {
  request          : Association to CARequests not null;
  project          : String(80);
  batch            : String(60);
  engineeringType  : String(40);
  requestType      : String(40);
  deliveryType     : String(40);
  warehouse        : Association to Warehouses;
  allocationOwner  : Association to common.Users;
  remarks          : LargeString;
  items            : Composition of many MaterialReservationItems
                       on items.details = $self;
}

entity MaterialReservationItems : cuid, managed {
  details      : Association to MaterialReservationDetails not null;
  materialCode: String(40);
  description : String(180);
  quantity    : Decimal(15,3);
  unitOfMeasure: Association to UnitsOfMeasure;
  vendor      : Association to common.Vendors;
}

entity OutlineContractDetails : cuid, managed {
  request          : Association to CARequests not null;
  transactionType  : String(50);
  selectionMode    : String(20);
  contractNumber   : String(80);
  category         : Association to ContractCategories;
  approvalReference: String(120);
  remarks          : LargeString;
}

entity PurchaseOrderDetails : cuid, managed {
  request                 : Association to CARequests not null;
  selectionMode           : String(20);
  purchaseOrderType       : Association to PurchaseOrderTypes;
  contractBased           : Boolean default false;
  contractNumber          : String(80);
  procurementCategory     : Association to ProcurementCategories;
  division                : String(80);
  delegatedUser           : Association to common.Users;
  specialPersonArea       : String(80);
  arNumber                : String(80);
  wbsElement              : String(80);
  documentType            : String(40);
  taxApplicable           : Boolean default false;
  clearanceChargeApplicable: Boolean default false;
  materialImported        : Boolean default false;
  sesRequired             : Boolean default false;
  paymentRequestRequired  : Boolean default false;
  poHeaderText            : LargeString;
  campaignLocationCode    : String(100);
  procurementDescription  : LargeString;
  vendor                  : Association to common.Vendors;
  companyCode             : String(40);
  purchasingGroup         : String(40);
  purchasingOrganization  : Association to PurchasingOrganizations;
  siteId                  : String(80);
  currency                : Association to Currencies;
  plant                   : Association to Plants;
  totalValue              : Decimal(17,2);
  paymentTerms            : Association to PaymentTerms;
  remarks                 : LargeString;
  items                   : Composition of many PurchaseOrderItems
                              on items.details = $self;
}

entity PurchaseOrderItems : cuid, managed {
  details          : Association to PurchaseOrderDetails not null;
  itemNo           : Integer;
  itemType         : String(30);
  materialOrService: String(80);
  description      : String(180);
  quantity         : Decimal(15,3);
  unitOfMeasure    : Association to UnitsOfMeasure;
  unitPrice        : Decimal(17,2);
  taxCode          : String(40);
  deliveryDate     : Date;
}

entity ServiceEntrySheetDetails : cuid, managed {
  request          : Association to CARequests not null;
  transactionType  : String(40);
  sourceMode       : String(40);
  purchaseOrderNo  : String(80);
  existingSesNo    : String(80);
  loaApprover      : Association to common.Users;
  foreignCurrency  : Boolean default false;
  currency         : Association to Currencies;
  totalValue       : Decimal(17,2);
  paymentRequestRequired: Boolean default false;
  remarks          : LargeString;
  items            : Composition of many ServiceEntrySheetItems
                       on items.details = $self;
}

entity ServiceEntrySheetItems : cuid, managed {
  details     : Association to ServiceEntrySheetDetails not null;
  itemNo      : Integer;
  serviceCode: String(80);
  description: String(180);
  quantity   : Decimal(15,3);
  unitOfMeasure: Association to UnitsOfMeasure;
  value      : Decimal(17,2);
}
