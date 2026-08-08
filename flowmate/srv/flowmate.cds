using { flowmate.db as fldb } from '../db/schema';
using { CommonMasterDataService as common } from './external/common-master';

@requires: 'authenticated-user'
service FlowmateService {
    type ReportFilter {
        fromDate        : Date;
        toDate          : Date;
        processTypeCode : String(30);
        statusCode      : String(20);
    }
    type ReportBreakdown {
        code  : String(100);
        label : String(150);
        count : Integer;
    }
    type ReportTrendPoint {
        period : String(7);
        label  : String(20);
        count  : Integer;
    }
    type ReportOverdueTask {
        ID              : UUID;
        referenceNumber : String(30);
        taskName         : String(100);
        requestId        : UUID;
        requestNumber    : String(30);
        requestTitle     : String(255);
        teamName         : String(150);
        dueDate          : Date;
        overdueDays      : Integer;
        statusCode       : String(20);
    }
    type ReportDashboard {
        totalRequests        : Integer;
        openRequests         : Integer;
        completedRequests    : Integer;
        overdueRequests      : Integer;
        slaCompliancePercent : Decimal(5, 2);
        statusBreakdown      : many ReportBreakdown;
        processBreakdown     : many ReportBreakdown;
        monthlyTrend         : many ReportTrendPoint;
        teamWorkload         : many ReportBreakdown;
        userActivity         : many ReportBreakdown;
        auditActivity        : many ReportBreakdown;
        overdueTasks         : many ReportOverdueTask;
    }
    type GuidedProcessTask {
        ID          : UUID;
        stepNo      : Integer;
        status_code : String(30);
        isMandatory : Boolean;
    }

    entity ProcessTypes as projection on fldb.ProcessTypes;
    entity ProcessSubTypes as projection on fldb.ProcessSubTypes;
    entity PaymentCategories as projection on fldb.PaymentCategories;
    entity FtkEntities as projection on fldb.FtkEntities;
    entity Priorities as projection on fldb.Priorities;
    entity Operator as projection on fldb.Operator;
    entity Roles as projection on common.Roles;
    entity LoaApproval as projection on fldb.LoaApproval {
        *,
        role : Association to one Roles on role.code = roleCode
    };
    entity ProcessStatus as projection on fldb.ProcessStatus;
    entity TaskStatus as projection on fldb.TaskStatus;
    entity Users as projection on common.Users {
        *,
        role : redirected to Roles,
        manager : redirected to Users
    };
    entity Teams as projection on common.Teams {
        *,
        members : redirected to TeamMembers
    };
    entity Vendors as projection on common.Vendors;
    entity TeamMembers as projection on common.TeamMembers {
        *,
        team : redirected to Teams,
        user : redirected to Users
    };
    entity Delegations as projection on common.Delegations {
        ID,
        delegator as delegatorUser,
        delegate as delegateUser,
        delegator.email as delegator,
        delegate.email as delegate,
        startDate,
        endDate,
        forwardNotifications,
        enabled,
        createdOnBehalf
    };
    entity ProcessRequests as projection on fldb.ProcessRequests {
        *,
        paymentCategory : redirected to PaymentCategories,
        businessEntity  : redirected to FtkEntities,
        priorityConfig  : redirected to Priorities,
        tasks       : redirected to ProcessTasks,
        attachments : redirected to ProcessAttachments,
        emailMessages : redirected to ProcessEmailMessages
    };
    @cds.redirection.target
    entity ProcessTasks as projection on fldb.ProcessTasks {
        *,
        request : redirected to ProcessRequests,
        teamMembers : redirected to ProcessTaskTeamMembers
    };
    entity MyAssignedTasks as projection on fldb.ProcessTasks {
        *,
        request : redirected to ProcessRequests
    };
    entity MyTeamTasks as projection on fldb.ProcessTasks {
        *,
        request : redirected to ProcessRequests,
        teamMembers : redirected to ProcessTaskTeamMembers
    };
    entity RequestDetailTasks as projection on fldb.ProcessTasks {
        *,
        request : redirected to ProcessRequests,
        teamMembers : redirected to ProcessTaskTeamMembers
    };
    entity ProcessTaskTeamMembers as projection on fldb.ProcessTaskTeamMembers {
        *,
        task : redirected to ProcessTasks
    };
    entity ProcessInvolvedParties as projection on fldb.ProcessInvolvedParties;
    entity ProcessComments as projection on fldb.ProcessComments;
    entity ProcessAttachments as projection on fldb.ProcessAttachments {
        *,
        request : redirected to ProcessRequests
    };
    entity ProcessEmailMessages as projection on fldb.ProcessEmailMessages {
        *,
        request     : redirected to ProcessRequests,
        attachments : redirected to ProcessEmailAttachments
    };
    entity ProcessEmailAttachments as projection on fldb.ProcessEmailAttachments {
        *,
        emailMessage : redirected to ProcessEmailMessages,
        attachment   : redirected to ProcessAttachments
    };
    entity ProcessHistory as projection on fldb.ProcessHistory;
    entity ProcessStepConfig as projection on fldb.ProcessStepConfig {
        *
    };
    entity RequestFilterQueries as projection on fldb.RequestFilterQueries;

    action createUserWithTeams(
        userId: UUID,
        azureObjectId: String(100),
        userPrincipalName: String(255),
        displayName: String(150),
        email: String(255),
        department: String(100),
        roleCode: String(40),
        managerId: UUID,
        teamIds: many UUID,
        isActive: Boolean
    ) returns Users;
    action submitRequest(requestId: UUID) returns Boolean;
    action approveTask(taskId: UUID, remarks: String) returns Boolean;
    action analyzeGuidedTaskCompletion(taskId: UUID) returns {
        requiresDecision   : Boolean;
        nextStepNo         : Integer;
        nextStepName       : String(100);
        incompleteStepNo   : Integer;
        incompleteStepName : String(100);
    };
    action completeGuidedTask(taskId: UUID, remarks: String, progressionMode: String(30)) returns Boolean;
    action analyzeGuidedStepCompletion(requestId: UUID, stepNo: Integer) returns {
        requiresDecision   : Boolean;
        nextStepNo         : Integer;
        nextStepName       : String(100);
        incompleteStepNo   : Integer;
        incompleteStepName : String(100);
    };
    action completeGuidedStep(requestId: UUID, stepNo: Integer, remarks: String, progressionMode: String(30)) returns Boolean;
    action getGuidedProcessTasks(requestId: UUID) returns many GuidedProcessTask;
    action rejectTask(taskId: UUID, remarks: String) returns Boolean;
    action sendBack(taskId: UUID, remarks: String, targetStepNo: Integer) returns Boolean;
    action sendRequestEmail(
        requestId: UUID,
        toRecipients: LargeString,
        ccRecipients: LargeString,
        subject: String(255),
        body: LargeString,
        attachmentIds: LargeString
    ) returns {
        emailId         : UUID;
        status          : String(30);
        attachmentCount : Integer;
    };
    action reserveRequest(requestId: UUID) returns Boolean;
    action updateRequestStatus(requestId: UUID, statusCode: String(20)) returns Boolean;
    action updateTaskStatus(taskId: UUID, statusCode: String(20)) returns Boolean;
    action assignRequestProcessor(requestId: UUID, processorUserId: UUID) returns Boolean;
    action assignRequestTeam(requestId: UUID, teamId: UUID) returns Boolean;
    action assignTaskProcessor(taskId: UUID, processorUserId: UUID) returns Boolean;
    action assignTaskTeam(taskId: UUID, teamId: UUID) returns Boolean;
    action assignTeamTaskToMe(taskId: UUID) returns Boolean;
    action getCurrentUserDetails() returns {
        ID                : UUID;
        displayName       : String(150);
        email             : String(255);
        userPrincipalName : String(255);
        department        : String(100);
    };
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
    action resolveTaskTeamNotificationRecipients(taskId: UUID) returns {
        recipients      : LargeString;
        recipientCount  : Integer;
        delegatedCount  : Integer;
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
    function getRequestReservationCounts() returns {
        unreservedRequests : Integer;
        reservedRequests   : Integer;
    };
    function getMyTaskCount() returns Integer;
    function getMyTeamTaskCount() returns Integer;
    action getReportDashboard(filter: ReportFilter) returns ReportDashboard;
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
