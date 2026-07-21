namespace flowmate.db;
using { User, managed, cuid, sap.common.CodeList } from '@sap/cds/common';
using { Attachments } from '@cap-js/attachments';

entity Flows: cuid, managed {
    title       : String(100);
    description : String(500);
    projectCode : String(10);
    status      : String(20) default 'Created';
    attachments : Composition of many Attachments;
}

// annotate Flows.attachments with {
//     content @Validation.Maximum : '25MB'
//             @Core.AcceptableMediaTypes : [
//                 'application/pdf',
//                 'image/*',
//                 'text/plain',
//                 'application/msword',
//                 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
//                 'application/vnd.ms-excel',
//                 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
//             ];
// };

entity ProcessTypes : CodeList {
    key code : String(30);
}

entity ProcessStatus : CodeList {
    key code : String(20);
}

entity TaskStatus : CodeList {
    key code : String(20);
}

entity ProcessSubTypes : CodeList {
    key code : String(30);
    processType : Association to ProcessTypes;
    processOwner : String(100);
    activityDescription : String(500);
    sapTCode : String(100);
}

entity Users : cuid, managed {
    referenceNumber   : String(30);
    azureObjectId     : String(100);//Azure ID from microsoft graph API
    userPrincipalName : String(255);
    displayName       : String(150);
    email             : String(255);
    department        : String(100);
    @title: 'Manager'
    @Common.Text: (manager.displayName)
    @Common.TextArrangement: #TextOnly
    manager           : Association to one Users @assert.target;
    isActive          : Boolean default true;
}

entity Teams : cuid, managed {
    referenceNumber : String(30);
    teamCode        : String(30);
    name            : String(150);
    description     : String(500);
    isActive        : Boolean default true;
    members         : Composition of many TeamMembers
                      on members.team = $self;
}

@assert.unique.vendorCode: [vendorCode]
entity Vendors : cuid, managed {
    vendorCode  : String(30) not null;
    vendorName  : String(150) not null;
    vendorEmail : String(255);
}

entity TeamMembers : cuid, managed {
    referenceNumber : String(30);
    team            : Association to Teams;
    user            : Association to Users;
    displayName     : String(150);
    email           : String(255);
    isActive        : Boolean default true;
}

entity Delegations : cuid, managed {
    referenceNumber      : String(30);
    delegatorUser        : Association to Users;
    delegateUser         : Association to Users;
    delegator            : String(255);
    delegate             : String(255);
    startDate            : Date;
    endDate              : Date;
    forwardNotifications : Boolean default true;
    enabled              : Boolean default true;
    createdOnBehalf      : Boolean default false;
}

entity ProcessRequests : cuid, managed {
    referenceNumber : String(30);
    processType : Association to ProcessTypes;
    subProcessType : Association to ProcessSubTypes;
    requesterUser : Association to Users;
    processorUser : Association to Users;
    processorTeam : Association to Teams;
    reservedByUser : Association to Users;
    predecessor : Association to ProcessRequests;
    successors  : Association to many ProcessRequests
                    on successors.predecessor = $self;
    title       : String(255);
    description : LargeString;
    requester   : String(100);
    processor   : String(255);
    processorEmail : String(255);
    processorTeamName : String(150);
    reservedBy  : String(255);
    reservedAt  : DateTime;
    department  : String(100);
    status      : Association to ProcessStatus;
    priority    : String(20);
    currentStep : Integer;
    dueDate     : Date;
    completedAt : DateTime;
    tasks       : Composition of many ProcessTasks
                    on tasks.request = $self;
    involvedParties : Composition of many ProcessInvolvedParties
                    on involvedParties.request = $self;
    comments    : Composition of many ProcessComments
                    on comments.request = $self;
    attachments : Composition of many ProcessAttachments
                    on attachments.request = $self;
    emailMessages : Composition of many ProcessEmailMessages
                    on emailMessages.request = $self;
    history     : Composition of many ProcessHistory
                    on history.request = $self;
}

entity ProcessTasks : cuid, managed {
    referenceNumber : String(30);
    request     : Association to ProcessRequests;
    assignedUser : Association to Users;
    processorUser : Association to Users;
    processorTeam : Association to Teams;
    stepNo      : Integer;
    taskName    : String(100);
    assignedTo  : String(100);
    processor   : String(255);
    processorEmail : String(255);
    processorTeamName : String(150);
    role        : String(100);
    isMandatory : Boolean default false;
    isTeamTask  : Boolean default false;
    status      : Association to TaskStatus;
    decision    : String(30);
    remarks     : LargeString;
    completedAt : DateTime;
    teamMembers : Composition of many ProcessTaskTeamMembers
                    on teamMembers.task = $self;
}

entity ProcessTaskTeamMembers : cuid, managed {
    referenceNumber : String(30);
    task            : Association to ProcessTasks;
    user            : Association to Users;
    displayName     : String(150);
    email           : String(255);
    notifiedAt      : DateTime;
}

entity ProcessInvolvedParties : cuid, managed {
    referenceNumber : String(30);
    request          : Association to ProcessRequests;
    user             : Association to Users;
    displayName      : String(150);
    email            : String(255);
    department       : String(100);
    purpose          : String(255);
}

entity ProcessComments : cuid, managed {
    referenceNumber : String(30);
    request : Association to ProcessRequests;
    comment : LargeString;
    userId  : String(100);
}

entity ProcessAttachments : Attachments {
    referenceNumber : String(30);
    request : Association to ProcessRequests;
}

entity ProcessEmailMessages : cuid, managed {
    referenceNumber : String(30);
    request         : Association to ProcessRequests;
    toRecipients    : LargeString;
    ccRecipients    : LargeString;
    subject         : String(255);
    body            : LargeString;
    status          : String(30) default 'QUEUED';
    interfaceSystem : String(100) default 'EMAIL';
    queuedAt        : DateTime;
    sentAt          : DateTime;
    errorMessage    : LargeString;
    attachments     : Composition of many ProcessEmailAttachments
                      on attachments.emailMessage = $self;
}

entity ProcessEmailAttachments : cuid, managed {
    referenceNumber : String(30);
    emailMessage    : Association to ProcessEmailMessages;
    attachment      : Association to ProcessAttachments;
    filename        : String(255);
    mimeType        : String(255);
}

annotate ProcessAttachments with {
    content @Validation.Maximum : '50MB'
            @Core.AcceptableMediaTypes : [
                'application/pdf',
                'image/*',
                'text/plain',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            ];
};

entity ProcessHistory : cuid, managed {
    referenceNumber : String(30);
    request   : Association to ProcessRequests;
    stepNo    : Integer;
    action    : String(50);
    actor     : String(100);
    oldStatus : String(30);
    newStatus : String(30);
    remarks   : LargeString;
}

entity ProcessStepConfig : cuid, managed {
    referenceNumber : String(30);
    processType   : Association to ProcessTypes;
    processorTeam : Association to Teams;
    processorTeamName : String(150);
    stepNo        : Integer;
    stepName      : String(100);
    activityDescription : String(500);
    role          : String(100);
    slaDays       : Integer;
}

entity RequestFilterQueries : cuid, managed {
    referenceNumber     : String(30);
    owner               : String(255);
    name                : String(100);
    processType_code    : String(30);
    subProcessType_code : String(30);
    search              : String(255);
}

entity RequestType: cuid, managed{
    requestType: Association to RequestDropDown;

}

entity projectCode: cuid, managed{
    projectCode: String(10);

}

entity materialCode: cuid, managed{
    materialCode: String(10);
}

entity serviceCode: cuid, managed{
    serviceCode: String(10);
}

entity equipmentCode : cuid, managed {
    equipmentCode: String(10);
}

entity serviceEntrySheet: cuid, managed {
        serviceEntrySheet: String(10);      
}

entity materialReservation: cuid, managed {
    materialReservation: String(10);
}

entity civilRR: cuid, managed {
        civilRR: String(10);
}

entity powerRR: cuid, managed {
        powerRR: String(10);    
}

entity outlineContract: cuid, managed {
    outlineContract: String(10);
}

entity centralizedPO: cuid, managed {
    centralizedPO: String(10);
}

entity inhousePOProcess: cuid, managed {
    inhousePOProcess: String(10);
}

entity DNSProcess: cuid, managed {
    DNSProcess: String(10);
}
entity RequestDropDown: CodeList {
    key code: String(10);
    description: String(255);
}
