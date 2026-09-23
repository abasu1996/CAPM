using { flowmate.ca.db as db } from '../db/schema';
using { CommonMasterDataService as common } from './external/common-master';

@path: '/odata/v4/flowmate-ca'
@requires: 'authenticated-user'
service FlowmateCAService {
  type DashboardCounts {
    myRequests       : Integer;
    myOpenTasks      : Integer;
    myTeamTasks      : Integer;
    sentBackRequests : Integer;
    pendingApproval  : Integer;
    completedRequests: Integer;
  }

  type CurrentUser {
    ID          : UUID;
    displayName : String(160);
    email       : String(255);
    isAdmin     : Boolean;
  }

  type NewRequestInput {
    requestTypeCode    : String(40);
    requestVariantCode : String(40);
    title              : String(255);
    description        : LargeString;
    priorityCode       : String(40);
    dueDate            : Date;
    predecessorId      : UUID;
    processorTeamCode  : String(40);
    details            : LargeString;

    }

  type BulkRequestInput {
    requestTypeCode    : String(40);
    requestVariantCode : String(40);
    processorTeamCode  : String(40);
    rows               : LargeString;
  }

  entity RequestTypes as projection on db.RequestTypes;
  entity RequestVariants as projection on db.RequestVariants;
  entity RequestStatuses as projection on db.RequestStatuses;
  entity TaskStatuses as projection on db.TaskStatuses;
  entity Priorities as projection on db.Priorities;
  entity Users as projection on common.Users;
  entity Teams as projection on common.Teams;
  entity TeamMembers as projection on common.TeamMembers;
  entity Vendors as projection on common.Vendors;


  entity UnitsOfMeasure as projection on db.UnitsOfMeasure;
  entity ExternalMaterialGroups as projection on db.ExternalMaterialGroups;
  entity CoupaCommodityCodes as projection on db.CoupaCommodityCodes;
  entity Warehouses as projection on db.Warehouses;
  entity PurchaseOrderTypes as projection on db.PurchaseOrderTypes;
  entity ProcurementCategories as projection on db.ProcurementCategories;
  entity Currencies as projection on db.Currencies;
  entity PurchasingOrganizations as projection on db.PurchasingOrganizations;
  entity PaymentTerms as projection on db.PaymentTerms;
  entity ProjectTypes as projection on db.ProjectTypes;
  entity SystemContractBasePO as projection on db.SystemContractBasePO;
  entity ContractCategories as projection on db.ContractCategories;
  entity AccountAssignment as projection on db.AccountAssignment;
  entity Entity as projection on db.Entity;
  entity Projects as projection on db.Projects;
  entity ExtensionMaterialGroup as projection on db.ExtensionMaterialGroup;
  entity ContractType as projection on db.ContractType;

  entity CompanyCodes as projection on db.CompanyCodes;
  entity TaxCodes as projection on db.TaxCodes;
  entity ItemCategories as projection on db.ItemCategories;
  entity AccountAssignments as projection on db.AccountAssignments;
  entity CostCenters as projection on db.CostCenters;
  entity ContractTypes as projection on db.ContractTypes;
  entity Incoterms as projection on db.Incoterms;
  entity ReservationProjects as projection on db.ReservationProjects;
  entity ReservationBatches as projection on db.ReservationBatches;
  entity BusinessEntities as projection on db.BusinessEntities;
  entity ProjectScopes as projection on db.ProjectScopes;
  entity MaterialTypes as projection on db.MaterialTypes;
  entity ServiceCategories as projection on db.ServiceCategories;
  entity ArReferences as projection on db.ArReferences;
  entity ProjectCategories as projection on db.ProjectCategories;

  @cds.redirection.target
  entity Requests as projection on db.CARequests;
  entity MyRequests as projection on db.CARequests;
  entity RequestQueue as projection on db.CARequests;

  @cds.redirection.target
  entity Tasks as projection on db.CATasks;
  entity MyTasks as projection on db.CATasks;
  entity MyTeamTasks as projection on db.CATasks;

  entity RequestSteps as projection on db.RequestStepInstances;
  entity Attachments as projection on db.CAAttachments;
  entity Comments as projection on db.CAComments;
  entity InvolvedParties as projection on db.CAInvolvedParties;
  entity History as projection on db.CAHistory;
  entity WorkflowStepConfigs as projection on db.WorkflowStepConfigs;

  entity MaterialCodeDetails as projection on db.MaterialCodeDetails;
  entity ServiceCodeDetails as projection on db.ServiceCodeDetails;
  entity EquipmentCodeDetails as projection on db.EquipmentCodeDetails;
  entity ProjectCodeDetails as projection on db.ProjectCodeDetails;
  entity MaterialReservationDetails as projection on db.MaterialReservationDetails;
  entity MaterialReservationItems as projection on db.MaterialReservationItems;
  entity OutlineContractDetails as projection on db.OutlineContractDetails;
  entity OutlineContractItems as projection on db.OutlineContractItems;
  entity PurchaseOrderDetails as projection on db.PurchaseOrderDetails;
  entity PurchaseOrderItems as projection on db.PurchaseOrderItems;
  entity ServiceEntrySheetDetails as projection on db.ServiceEntrySheetDetails;
  entity ServiceEntrySheetItems as projection on db.ServiceEntrySheetItems;

  function getDashboardCounts() returns DashboardCounts;
  function getCurrentUser() returns CurrentUser;
  @requires: 'CAAdmin'
  function getFlowmateConnectionStatus() returns {
    reachable     : Boolean;
    application   : String(40);
    endpoint      : String(255);
    sampleRecords : Integer;
    checkedAt     : DateTime;
    message       : String(500);
  };

  action createRequest(input: NewRequestInput) returns Requests;
  action createBulkRequests(input: BulkRequestInput) returns {
    created          : Integer;
    referenceNumbers : LargeString;
  };
  action submitRequest(requestId: UUID) returns Boolean;
  action addTask(
    requestId: UUID,
    stepNo: Integer,
    taskName: String(180),
    description: LargeString,
    assignedUserId: UUID,
    assignedTeamId: UUID,
    isMandatory: Boolean,
    isApproval: Boolean,
    dueDate: Date
  ) returns Tasks;
  action claimTeamTask(taskId: UUID) returns Boolean;
  action approveTask(taskId: UUID, remarks: LargeString) returns Boolean;
  action sendBackTask(taskId: UUID, targetStepNo: Integer, remarks: LargeString) returns Boolean;
  action completeStep(requestId: UUID, stepNo: Integer, remarks: LargeString) returns Boolean;
  action addComment(requestId: UUID, comment: LargeString) returns Comments;
  action createSuccessorRequest(requestId: UUID, requestTypeCode: String(40), title: String(255)) returns Requests;
  action sendToS4(requestId: UUID) returns {
    accepted        : Boolean;
    integrationState: String(80);
    message         : String(500);
  };
}

@path: '/odata/v4/flowmate-ca-master'
@requires: 'authenticated-user'
@impl: './ca-master-data.js'
service CAMasterDataService {
  @restrict: [
    { grant: 'READ', to: 'authenticated-user' },
    { grant: '*', to: 'CAAdmin' }
  ]
  entity Users as projection on common.Users;

  @restrict: [
    { grant: 'READ', to: 'authenticated-user' },
    { grant: '*', to: 'CAAdmin' }
  ]
  entity Teams as projection on common.Teams;

  @restrict: [
    { grant: 'READ', to: 'authenticated-user' },
    { grant: '*', to: 'CAAdmin' }
  ]
  entity TeamMembers as projection on common.TeamMembers;

  @restrict: [
    { grant: 'READ', to: 'authenticated-user' },
    { grant: '*', to: 'CAAdmin' }
  ]
  entity Vendors as projection on common.Vendors;

  @restrict: [
    { grant: 'READ', to: 'authenticated-user' },
    { grant: '*', to: 'CASupervisor' },
    { grant: '*', to: 'CAAdmin' }
  ]
  entity Delegations as projection on common.Delegations;

  @restrict: [
    { grant: 'READ', to: 'authenticated-user' },
    { grant: '*', to: 'CAAdmin' }
  ]
  entity RequestTypes as projection on db.RequestTypes;

  @restrict: [
    { grant: 'READ', to: 'authenticated-user' },
    { grant: '*', to: 'CAAdmin' }
  ]
  entity RequestVariants as projection on db.RequestVariants;

  @restrict: [
    { grant: 'READ', to: 'authenticated-user' },
    { grant: '*', to: 'CAAdmin' }
  ]
  entity WorkflowStepConfigs as projection on db.WorkflowStepConfigs;
   entity Sites as projection on common.Sites;
   entity Materials as projection on common.Materials;
   entity Wbs as projection on common.Wbs;
   entity DocumentTypes as projection on common.DocumentTypes;
   entity CompanyCodes as projection on common.CompanyCodes;
   entity PurchasingGroups as projection on common.PurchasingGroups;
   entity Divisions as projection on common.Divisions;
   entity ApplicableTaxes as projection on common.ApplicableTaxes;
   entity Plant as projection on common.Plant;
   entity ServiceGroups as projection on common.ServiceGroups;
   entity ValuationClass as projection on common.ValuationClass;
   entity StorageLocation as projection on common.StorageLocation;
   entity SalesOrg as projection on common.SalesOrg;
   entity Incoterms as projection on common.Incoterms;
   entity CostCenter as projection on common.CostCenter;
   entity MatGroup as projection on common.MatGroup;
   entity ProfitCenter as projection on common.ProfitCenter;
   entity MRPType as projection on common.MRPType;
   entity AvailabilityCheck as projection on common.AvailabilityCheck;
   entity SerialNumberProfile as projection on common.SerialNumberProfile;
   entity DistributionChannel as projection on common.DistributionChannel;
}
