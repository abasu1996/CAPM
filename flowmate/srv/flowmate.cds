using { flowmate.db as fldb } from '../db/schema';

@requires: 'authenticated-user'
service FlowmateService {
    entity ProcessTypes as projection on fldb.ProcessTypes;
    entity ProcessStatus as projection on fldb.ProcessStatus;
    entity TaskStatus as projection on fldb.TaskStatus;
    entity Users as projection on fldb.Users;
    entity Delegations as projection on fldb.Delegations;
    entity ProcessRequests as projection on fldb.ProcessRequests;
    entity ProcessTasks as projection on fldb.ProcessTasks;
    entity ProcessComments as projection on fldb.ProcessComments;
    entity ProcessAttachments as projection on fldb.ProcessAttachments;
    entity ProcessHistory as projection on fldb.ProcessHistory;
    @requires: 'Admin'
    entity ProcessStepConfig as projection on fldb.ProcessStepConfig;

    action submitRequest(requestId: UUID) returns Boolean;
    action approveTask(taskId: UUID, remarks: String) returns Boolean;
    action rejectTask(taskId: UUID, remarks: String) returns Boolean;
    action sendBack(taskId: UUID, remarks: String) returns Boolean;
    action updateRequestStatus(requestId: UUID, statusCode: String(20)) returns Boolean;
    action updateTaskStatus(taskId: UUID, statusCode: String(20)) returns Boolean;
    action resolveNotificationRecipient(userId: String(100)) returns {
        originalRecipient : String(100);
        recipient         : String(100);
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
