using { flowmate.ca.db as db } from '../db/schema';
using { CommonMasterDataService as common } from './external/common-master';

@path: '/odata/v4/flowmate-ca'
@requires: 'authenticated-user'
service FlowmateCAService {
  type DashboardCounts {
    allRequests     : Integer;
    myRequests       : Integer;
    myOpenTasks      : Integer;
    myTeamTasks      : Integer;
    sentBackRequests : Integer;
    rejectedRequests : Integer;
    pendingApproval  : Integer;
    completedRequests: Integer;
  }

  type CurrentUser {
    ID                     : UUID;
    displayName            : String(160);
    email                  : String(255);
    isAdmin                : Boolean;
    canDelegateOnBehalf    : Boolean;
    canReassign            : Boolean;
    activeDelegatorUserIds : many UUID;
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
    @description: 'Active shared Users.ID of the business requester. Required for technical PO creation; browser requests use the signed-in user.'
    requesterUser_ID   : UUID;
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
  entity Delegations as projection on common.Delegations;


  entity ExternalMaterialGroups as projection on db.ExternalMaterialGroups;
  entity CoupaCommodityCodes as projection on db.CoupaCommodityCodes;
  entity Warehouses as projection on db.Warehouses;
  entity PurchaseOrderTypes as projection on db.PurchaseOrderTypes;
  entity ProjectTypes as projection on db.ProjectTypes;
  entity ContractCategories as projection on db.ContractCategories;
  entity ProfitCenter as projection on common.ProfitCenter;
  entity MRPType as projection on common.MRPType;
  entity AvailabilityCheck as projection on common.AvailabilityCheck;
  entity SerialNumberProfile as projection on common.SerialNumberProfile;
  entity DistributionChannel as projection on common.DistributionChannel;

  entity ContractTypes as projection on db.ContractTypes;
  entity ReservationProjects as projection on db.ReservationProjects;
  entity ReservationBatches as projection on db.ReservationBatches;
  entity BusinessEntities as projection on db.BusinessEntities;
  entity ProjectScopes as projection on db.ProjectScopes;
  entity MaterialTypes as projection on db.MaterialTypes;
  entity ArReferences as projection on common.ArReferences;
  entity ProjectCategories as projection on db.ProjectCategories;
  entity MaterialCategories as projection on db.MaterialCategories;

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
  @readonly entity RequestVersions as projection on db.RequestVersions;
  entity WorkflowStepConfigs as projection on db.WorkflowStepConfigs;

  entity MaterialCodeDetails as projection on db.MaterialCodeDetails;
  entity MaterialCodeItems as projection on db.MaterialCodeItems;
  entity ServiceCodeDetails as projection on db.ServiceCodeDetails;
  entity ServiceCodeItems as projection on db.ServiceCodeItems;
  entity EquipmentCodeDetails as projection on db.EquipmentCodeDetails;
  entity EquipmentCodeItems as projection on db.EquipmentCodeItems;
  entity ProjectCodeDetails as projection on db.ProjectCodeDetails;
  entity ProjectCodeItems as projection on db.ProjectCodeItems;
  entity MaterialReservationDetails as projection on db.MaterialReservationDetails;
  entity MaterialReservationItems as projection on db.MaterialReservationItems;
  entity OutlineContractDetails as projection on db.OutlineContractDetails;
  entity OutlineContractItems as projection on db.OutlineContractItems;
  entity OutlineContractHeaders as projection on db.OutlineContractHeaders;
  entity OutlineContractChangeItems as projection on db.OutlineContractChangeItems;
  entity PurchaseOrderDetails as projection on db.PurchaseOrderDetails;
  entity PurchaseOrderItems as projection on db.PurchaseOrderItems;
  entity ServiceEntrySheetDetails as projection on db.ServiceEntrySheetDetails;
  entity ServiceEntrySheetItems as projection on db.ServiceEntrySheetItems;
  entity ServiceEntrySheetHeaders as projection on db.ServiceEntrySheetHeaders;

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

  @description: 'Create a request. Technical clients require PORequestCreate, requestTypeCode PURCHASE_ORDER, and input.requesterUser_ID identifying an active shared user. No client-to-user environment mapping is required. Human users use their active signed-in identity. Workflow initialization runs during creation.'
  action createRequest(input: NewRequestInput) returns Requests;
  // Project Code (New / Modification), Single line: the Project ID / Category / Description the
  // server would generate for these details (JSON in, JSON out). Nothing is saved.
  function previewProjectCode(details: LargeString) returns LargeString;
  function getFlowmateRequestFormCatalog() returns LargeString;
  // The title the next request of this type will get (MCC-26-0001); assigned for real on create.
  function previewRequestTitle(requestTypeCode: String(40)) returns String(40);
  // Whether the signed-in user may add comments and attachments to this request.
  function canContribute(requestId: UUID) returns Boolean;
  // The Due Date the create page shows: today plus the step SLAs of the chosen workflow.
  // details (JSON) decides conditional steps such as the DMS step. Nothing is saved.
  function slaPreview(requestTypeCode: String(40), requestVariantCode: String(40), details: LargeString) returns {
    dueDate   : Date;
    slaDueAt  : DateTime;
    totalDays : Integer;
    stepCount : Integer;
  };
  // Flags open tasks past their SLA and e-mails each assignee once. Run by SAP Job Scheduling;
  // an administrator may run it on demand.
  @requires: ['SlaScheduler', 'CAAdmin']
  action runSlaBreachScan() returns {
    overdueTasks         : Integer;
    notificationsSent    : Integer;
    notificationsFailed  : Integer;
    notificationsSkipped : Integer;
  };
  @description: 'Creates the linked Flowmate Payment Run request after the purchase order request is successfully completed.'
  action createFlowmatePaymentRun(requestId: UUID) returns {
    created          : Boolean;
    requestId        : UUID;
    referenceNumber  : String(30);
    attachmentCount  : Integer;
  };
  @description: 'Creates the linked Flowmate Service Entry Sheet request after the service entry sheet request is successfully completed.'
  action createFlowmateServiceEntrySheet(requestId: UUID) returns {
    created          : Boolean;
    requestId        : UUID;
    referenceNumber  : String(30);
    attachmentCount  : Integer;
  };
  action createBulkRequests(input: BulkRequestInput) returns {
    created          : Integer;
    referenceNumbers : LargeString;
    requestIds       : LargeString; // JSON array of created request IDs, in row order
  };
  /**
   * Reporting payload for the CA dashboards. The service returns a JSON document so the
   * dashboard can add report sections without changing the transactional entity projections.
   */
  action getReportingDashboard(periodStart: Date, periodEnd: Date, poType: String(40)) returns LargeString;
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
  action reassignRequest(requestId: UUID, userId: UUID) returns Boolean;
  action reassignTask(taskId: UUID, userId: UUID) returns Boolean;
  // Purchase Order S/4 Data Validation: opens the (auto-completed) Budget Check step's task and
  // puts this task In Progress until the Budget Check is approved.
  action requestBudgetCheck(taskId: UUID) returns Boolean;
  // purchaseOrderNo is required only on the last step of a PO that has "Create SES Successor".
  action approveTask(
    taskId: UUID,
    remarks: LargeString,
    purchaseOrderNo: String(80),
    glAccount: String(80),
    valuationClass: String(40),
    serviceCode: String(80),
    materialCode: String(40),
    equipmentCode: String(80),
    // Project Code at S/4 Data Validation: the Project Code, or the Function Location / Activity.
    projectValue: String(80),
    // New SES at S/4 Data Validation, Single Line Items: the created SES Number (Multiple Line
    // Items send one per Header Creation row in lineValues).
    sesNumber: String(80),
    // Service Code with multiple line items: JSON [{ itemId, value }], one per line item, for the
    // G/L Account Enrichment, Valuation Class or S/4 Data Validation step.
    lineValues: LargeString
  ) returns Boolean;
  action rejectTask(taskId: UUID, remarks: LargeString) returns Boolean;
  action sendBackTask(taskId: UUID, targetStepNo: Integer, remarks: LargeString) returns Boolean;
  action completeStep(requestId: UUID, stepNo: Integer, remarks: LargeString) returns Boolean;
  action saveRequesterDetails(requestId: UUID, details: LargeString) returns Boolean;
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
    { grant: 'READ', to: 'authenticated-user' }
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
   entity PurchasingOrganizations as projection on common.PurchasingOrganizations;
   entity Currencies as projection on common.Currencies;
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
   entity ArReferences as projection on common.ArReferences;
   entity PaymentTerms as projection on common.PaymentTerms;
   entity SystemContractBasePO as projection on common.SystemContractBasePO;
   entity ProcurementCategories as projection on common.ProcurementCategories;
   entity ItemCategories as projection on common.ItemCategories;
   entity AccountAssignments as projection on common.AccountAssignments;
   entity ServiceCategories as projection on common.ServiceCategories;
   entity UnitsOfMeasure as projection on common.UnitsOfMeasure;
   entity Entity as projection on common.Entity;
   entity Projects as projection on common.Projects;
   entity ExtensionMaterialGroup as projection on common.ExtensionMaterialGroup;
   entity ContractType as projection on common.ContractType;
   entity BudgetCode as projection on common.BudgetCode;
   entity ProductHierarchy as projection on common.ProductHierarchy;
   entity MaterialType as projection on common.MaterialType;
   entity ArPcc as projection on common.ArPcc;
   entity VendorsPcc as projection on common.VendorsPcc;
   entity DivisionsPcc as projection on common.DivisionsPcc;
   entity ScopePcc as projection on common.ScopePcc;
   entity ProjectTypePcc as projection on common.ProjectTypePcc;
}
