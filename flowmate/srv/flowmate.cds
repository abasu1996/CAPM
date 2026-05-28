using { flowmate.db as fldb } from '../db/schema';

@requires: 'authenticated-user'
service FlowmateService {
    entity ProcessTypes as projection on fldb.ProcessTypes;
    entity ProcessStatus as projection on fldb.ProcessStatus;
    entity TaskStatus as projection on fldb.TaskStatus;
    entity Users as projection on fldb.Users;
    entity Delegations as projection on fldb.Delegations;
    entity ProcessRequests as projection on fldb.ProcessRequests {
        *,
        tasks       : redirected to ProcessTasks,
        attachments : redirected to ProcessAttachments
    };
    entity ProcessTasks as projection on fldb.ProcessTasks {
        *,
        request : redirected to ProcessRequests
    };
    entity ProcessInvolvedParties as projection on fldb.ProcessInvolvedParties;
    entity ProcessComments as projection on fldb.ProcessComments;
    entity ProcessAttachments as projection on fldb.ProcessAttachments {
        *,
        request : redirected to ProcessRequests
    };
    entity ProcessHistory as projection on fldb.ProcessHistory;
    entity ProcessStepConfig as projection on fldb.ProcessStepConfig;

    action submitRequest(requestId: UUID) returns Boolean;
    action approveTask(taskId: UUID, remarks: String) returns Boolean;
    action rejectTask(taskId: UUID, remarks: String) returns Boolean;
    action sendBack(taskId: UUID, remarks: String) returns Boolean;
    action updateRequestStatus(requestId: UUID, statusCode: String(20)) returns Boolean;
    action updateTaskStatus(taskId: UUID, statusCode: String(20)) returns Boolean;
    action assignRequestProcessor(requestId: UUID, processorUserId: UUID) returns Boolean;
    action assignTaskProcessor(taskId: UUID, processorUserId: UUID) returns Boolean;
    action resolveNotificationRecipient(userId: String(100)) returns {
        originalRecipient : String(100);
        recipient         : String(100);
        delegated         : Boolean;
        delegationId      : UUID;
    };
    action resolveTaskNotificationRecipient(taskId: UUID) returns {
        originalRecipient : String(255);
        recipient         : String(255);
        delegated         : Boolean;
        delegationId      : UUID;
    };
    action resolveInvolvedPartyNotificationRecipient(partyId: UUID) returns {
        originalRecipient : String(255);
        recipient         : String(255);
        delegated         : Boolean;
        delegationId      : UUID;
    };
    action getUserAdministrationCapabilities() returns {
        canMaintainUsers : Boolean;
    };
    function getApplicationCapabilities() returns {
        isAdmin             : Boolean;
        canMaintainUsers    : Boolean;
        canDelegateOnBehalf : Boolean;
    };

    entity Flows as projection on fldb.Flows;
    entity RequestType as projection on fldb.RequestType;
    entity projectCode as projection on fldb.projectCode;
    entity materialCode as projection on fldb.materialCode;
    entity serviceCode as projection on fldb.serviceCode;
    entity equipmentCode as projection on fldb.equipmentCode;
    entity serviceEntrySheet as projection on fldb.serviceEntrySheet;
    entity materialReservation as projection on fldb.materialReservation;
    entity civilRR as projection on fldb.civilRR;
    entity powerRR as projection on fldb.powerRR;
    entity outlineContract as projection on fldb.outlineContract;
    entity centralizedPO as projection on fldb.centralizedPO;
    entity inhousePOProcess as projection on fldb.inhousePOProcess;
    entity DNSProcess as projection on fldb.DNSProcess;
    entity RequestDropDown as projection on fldb.RequestDropDown;

}
