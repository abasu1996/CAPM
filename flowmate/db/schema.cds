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
    isActive : Boolean default true;
}

entity ProcessStatus : CodeList {
    key code : String(20);
    isActive : Boolean default true;
}

entity TaskStatus : CodeList {
    key code : String(20);
    isActive : Boolean default true;
}

entity ProcessSubTypes : CodeList {
    key code : String(50);
    isActive : Boolean default true;
    processType : Association to ProcessTypes;
    workingCalendar : Association to WorkingCalendars;
    loaApprovalApplicable : Boolean default false;
    processOwner : String(100);
    activityDescription : String(500);
    sapTCode : String(100);
}

entity PaymentCategories : CodeList {
    key code : String(20);
    isActive : Boolean default true;
}

entity FtkEntities : CodeList {
    key code : String(30);
    isActive : Boolean default true;
}

entity Currencies : CodeList {
    key code : String(10);
    isActive : Boolean default true;
}
entity Categories : CodeList {
    key code : String(20);
    isActive : Boolean default true;
}

entity PaymentSubCategories : CodeList {
    key code : String(20);
    isActive : Boolean default true;
}
entity PaymentMethod : CodeList {
    key code : String(20);
    isActive : Boolean default true;
}
entity TypeOfPayment : CodeList {
    key code : String(30);
    isActive : Boolean default true;
}

entity RequestDivision : CodeList {
    key code : String(30);
    isActive : Boolean default true;
}

entity GuaranteeTypes : CodeList {
    key code : String(40);
    isActive : Boolean default true;
}
entity Priorities : CodeList {
    key code : String(20);
    isActive : Boolean default true;
}

entity Operator : CodeList {
    key code : String(10);
    isActive : Boolean default true;
}

@assert.unique.workingCalendarCode: [code]
entity WorkingCalendars : cuid, managed {
    code       : String(30) not null;
    name       : String(100) not null;
    timeZone   : String(100) default 'Asia/Colombo';
    isDefault  : Boolean default false;
    isActive   : Boolean default true;
    days       : Composition of many WorkingCalendarDays
                   on days.calendar = $self;
    holidays   : Composition of many WorkingCalendarHolidays
                   on holidays.calendar = $self;
}

@assert.unique.workingCalendarDay: [calendar, dayOfWeek]
entity WorkingCalendarDays : cuid, managed {
    calendar    : Association to WorkingCalendars not null;
    dayOfWeek   : Integer not null; // 1 = Monday, 7 = Sunday
    isWorkingDay: Boolean default false;
    startTime   : Time;
    endTime     : Time;
}

@assert.unique.workingCalendarHoliday: [calendar, holidayDate]
entity WorkingCalendarHolidays : cuid, managed {
    calendar     : Association to WorkingCalendars not null;
    holidayDate  : Date not null;
    name         : String(150) not null;
    isWorkingDay : Boolean default false;
    startTime    : Time;
    endTime      : Time;
    isActive     : Boolean default true;
    notes        : String(500);
}

entity LoaApproval : cuid, managed {
    ruleCode             : String(50);
    description          : String(255);
    minimumAmount        : Decimal(15, 2);
    maximumAmount        : Decimal(15, 2);
    minimumInclusive     : Boolean default true;
    maximumInclusive     : Boolean default true;
    approvalMode         : String(10) default 'SINGLE'; // SINGLE or ANY
    approverRoleCodes    : String(500);
    conditionCode        : String(50);
    conditionDescription : String(1000);
    priority             : Integer default 0;
    isActive             : Boolean default true;
    remarks              : String(1000);

    // Kept for compatibility with existing deployments and API consumers.
    amount               : Decimal(15, 2);
    operator             : Association to Operator;
    roleCode             : String(40);
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
@assert.unique.customerCode: [customerCode]
entity Customers : cuid, managed {
    customerCode  : String(30) not null;
    customerName  : String(150) not null;
    customerEmail : String(255);
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
    paymentCategory : Association to PaymentCategories @assert.target;
    businessEntity : Association to FtkEntities @assert.target;
    priorityConfig : Association to Priorities @assert.target;
    currency : Association to Currencies @assert.target;
    category : Association to Categories @assert.target;
    invoiceDebitNoteDate : Date;
    invoiceDebitNoteNumber : String(50);
    totalDebitNoteValue : Decimal(15, 2);
    poNumber : String(50);
    userDivisionRepresentativeName : String(150);
    vatAmount : Decimal(15, 2);
    sesReference : String(50);
    paymentSubCategory : Association to PaymentSubCategories @assert.target;
    whtCertificateReference : String(50);
    remainingBalanceAfterAdvanceSettlement : Decimal(15, 2); 
    invoiceDate: Date;
    invoiceNumber: String(50);
    costCentre : String(50);
    profitCentre : String(50);
    wbsElement : String(50);
    paymentMethod : Association to PaymentMethod @assert.target;
    totalRentValue : Decimal(15, 2);
    totalSupervisionValue : Decimal(15, 2);
    securityDepositValue : Decimal(15, 2);
    totalValue : Decimal(15, 2);
    ofnReference : String(50);
    siteId : String(50);
    siteName : String(150);
    fuelInclVat     : Decimal(15, 2);
    taxi            : Decimal(15, 2);
    highestValueInFile : Decimal(15, 2);
    brcHighestTransactionValue                : Decimal(15, 2);
    whtNicHighestTransactionValue             : Decimal(15, 2);
    lessThan100kNicBlankHighestTransactionValue : Decimal(15, 2);
    totalPaymentValueForMonth                 : Decimal(15, 2);
    retentionRepaymentValue                   : Decimal(15, 2);
    highestRefundValueOfFile : Decimal(15, 2);
    totalInvoiceValue : Decimal(15, 2);
    liabilityBookingDocumentNumber : String(50);
    invoiceDescription : String(500);
    highestMonthlyRentalValueInFile : Decimal(15, 2);
    totalFileValue                 : Decimal(15, 2);
    totalPayableValue : Decimal(15, 2);
    paymentDescription : LargeString;
    authorityVendorCode : String(30);
    authorityVendorName : String(150);
    employeeVendorCode : String(30);
    employeeVendorName : String(150);
    transactionDate : Date;
    totalAmountForeignCurrency : Decimal(15, 2);
    totalAmountLKR : Decimal(15, 2);
    balanceToBeReturned : Decimal(15, 2);
    nameEmpNo    : String(150);
    designation  : String(100);
    purposeOfTrip : String(255);
    month        : Date;
    country      : String(100);
    taxType : String(100);
    reference : String(100);
    totalTaxPayable : Decimal(15, 2);
    tin : String(50);
    din : String(50);
    requestingDivision : Association to RequestDivision @assert.target;
    taxDueDate : Date;
    customer                          : Association to Customers;
    customerCode                      : String(30);
    customerName                      : String(150);
    totalInvoiceValueRelevantCurrency : Decimal(15, 2);
    totalInvoiceValueLKR              : Decimal(15, 2);
    highestPayableValueInList : Decimal(15, 2);
    ivDocumentPostingDate     : Date;
    budgetCode                        : String(50);
    trcslProformaInvoiceDate          : Date;
    typeOfPayment                     : Association to TypeOfPayment;
    trcslProformaInvoiceTotalValue    : Decimal(15, 2);
    pivApplicationNumber : String(50);
    totalPivValue        : Decimal(15, 2);
    pivDate : Date;
    cusdecDate                      : Date;
    cusdecNumber                    : String(50);
    totalDeclarationValueInCusdec   : Decimal(15, 2);
    ccCustodianName               : String(150);
    whtEligibilityConfirmation    : Boolean default false;
    totalAmountPayable            : Decimal(15, 2);
    descriptionOfPayment          : LargeString;
    justificationForCreditCardUse : LargeString;
    bankName                        : String(150);
    ccPeriodFromDate                : Date;
    ccPeriodToDate                  : Date;
    annualFee                       : Decimal(15, 2);
    stampDuty                       : Decimal(15, 2);
    latePaymentFee                  : Decimal(15, 2);
    interestCharges                 : Decimal(15, 2);
    totalAmountPayableCcSettlement  : Decimal(15, 2);
    highestValueInExcel                : Decimal(15, 2);
    aggregateTotalValueAcrossAllFiles  : Decimal(15, 2);
    processingBankAccountDetails       : String(255);
    depositedAmount : Decimal(15, 2);
    debitGL         : String(50);
    zeroIvUserConfirmationAttached : Boolean default false;
    guaranteeType              : Association to GuaranteeTypes;
    beneficiaryName            : String(150);
    beneficiaryAddress         : String(500);
    commencingDate             : Date;
    expiryDate                 : Date;
    claimDate                  : Date;
    tenderDate                 : Date;
    expectedDate                : Date;
    purposeOfBankGuarantee     : LargeString;
    bidTenderReference          : String(100);
    collectorName               : String(150);
    collectorNic                 : String(30);
    collectorContactNumber       : String(30);
    specificBgFormatAvailable    : Boolean default false;
    vendor : Association to Vendors;
    requesterUser : Association to Users;
    processorUser : Association to Users;
    processorTeam : Association to Teams;
    reservedByUser : Association to Users;
    predecessor : Association to ProcessRequests;
    successors  : Association to many ProcessRequests
                    on successors.predecessor = $self;
    title       : String(255);
    description : LargeString;
    taskLevelFlow    : String(255);
    vendorCode       : String(30);
    vendorName       : String(150);
    remarks          : LargeString;
    requester   : String(100);
    processor   : String(255);
    processorEmail : String(255);
    processorTeamName : String(150);
    reservedBy  : String(255);
    reservedAt  : DateTime;
    department  : String(100);
    amount      : Decimal(15, 2);
    role        : String(100);
    status      : Association to ProcessStatus;
    priority    : String(20);
    currentStep : Integer;
    dueDate     : Date;
    slaStartedAt : DateTime;
    slaDueAt    : DateTime;
    slaCalendarCode : String(30);
    completedAt : DateTime;
    invoices    : Composition of many Invoices
                    on invoices.request = $self;
    directForeignTravelEntries : Composition of many DirectForeignTravelEntries
                    on directForeignTravelEntries.request = $self;
    travelExpenses : Composition of many TravelExpenses
                    on travelExpenses.request = $self;
    glBreakups : Composition of many GLBreakups
                    on glBreakups.request = $self;
    settlementEntries : Composition of many SettlementEntries
                    on settlementEntries.request = $self;
    merchantEntityValues : Composition of many MerchantEntityValues
                    on merchantEntityValues.request = $self;
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
entity Invoices : cuid, managed {
    request         : Association to ProcessRequests;
    subProcessType : Association to ProcessSubTypes;
    invoiceDate     : Date;
    invoiceNumber   : String(50);
    amount      : Decimal(15, 2);
    vatAmount       : Decimal(15, 2);
    sesReference    : String(50);
    remarks         : LargeString;
}
entity TravelExpenses : cuid {
    request       : Association to ProcessRequests;
    date          : Date;
    particulars   : String(255);
    transport     : Decimal(15, 2);
    hotel         : Decimal(15, 2);
    meals         : Decimal(15, 2);
    entertainment : Decimal(15, 2);
    laundry       : Decimal(15, 2);
    phone         : Decimal(15, 2);
    sundry        : Decimal(15, 2);
    miscellaneous : Decimal(15, 2);
    total         : Decimal(15, 2);
}
entity GLBreakups : cuid, managed {
    request : Association to ProcessRequests;
    glAccount : String(50);
    relevantDescription : String(255);
    relevantAmount : Decimal(15, 2);
    profitCentre : String(50);
    costCentre : String(50);
}
entity SettlementEntries : cuid, managed {
    request                : Association to ProcessRequests;
    paymentRequestRef      : Association to ProcessRequests; 
    paymentRequest         : String(50);
    poNumber                : String(50);
    sesReference            : String(50);
    invoiceNumber            : String(50);
    invoiceDate               : Date;
    description                : String(500);
    transactionAmountUSD     : Decimal(15, 2);
    paymentAmountLKR          : Decimal(15, 2);
    availabilityOfInvoice     : Boolean default false;
}
entity MerchantEntityValues : cuid, managed {
    request            : Association to ProcessRequests;
    businessEntity     : Association to FtkEntities;
    totalPayableValue  : Decimal(15, 2);
}
entity DirectForeignTravelEntries : cuid, managed {
    request                    : Association to ProcessRequests;
    travelerName               : String(150);
    category                   : String(100);
    vendorCode                 : String(30);
    ctmProposalNo              : String(50);
    purposeOfTravel            : String(255);
    venue                      : String(150);
    departureDateTime          : DateTime;
    arrivalDateTime            : DateTime;
    budgetCode                 : String(50);
    currency                   : Association to Currencies;
    airfare                    : Decimal(15, 2);
    visaFee                    : Decimal(15, 2);
    perDayAllowanceUSD         : Decimal(15, 2);
    noOfDays                   : Integer;
    totalInUSD                 : Decimal(15, 2);
    exchangeRate               : Decimal(15, 6);
    totalInLKR                 : Decimal(15, 2);
    totalCostForeignCurrency   : Decimal(15, 2);
    totalCostLKR               : Decimal(15, 2);
    confirmedTravelItinerary   : LargeString;
    selectedScheme             : String(100);
    personalTravelInvolved     : Boolean default false;
    periodOfPersonalTravel     : String(150);
    specialRemarks             : LargeString;
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
    isLoaApproval : Boolean default false;
    status      : Association to TaskStatus;
    decision    : String(30);
    remarks     : LargeString;
    completedAt : DateTime;
    teamMembers : Composition of many ProcessTaskTeamMembers
                    on teamMembers.task = $self;
}

/**
 * Reporting source for request-level SLA analytics. Keeping the normalization
 * in a CDS view lets HANA apply reporting-period filters and aggregations
 * without loading the transactional request table into the application tier.
 */
@readonly
view OverallSlaReport as select from ProcessRequests as request {
    key request.ID                              as ID,
        request.createdAt                       as reportingDate,
        request.requesterUser.ID                as requesterUserId,
        request.processType.code                as mainFlowCode,
        request.processType.name                as mainFlowName,
        request.subProcessType.code             as subFlowCode,
        request.subProcessType.name             as subFlowName,
        request.referenceNumber                 as requestReference,
        request.title                           as requestTitle,
        request.amount                          as amount,
        request.status.code                     as statusCode,
        request.slaStartedAt                    as slaStartedAt,
        request.slaDueAt                        as slaDueAt,
        request.completedAt                     as completedAt,
        case
            when request.slaDueAt is null then 'NOT_APPLICABLE'
            when request.completedAt is not null and request.completedAt <= request.slaDueAt then 'WITHIN_SLA'
            when request.completedAt is not null and request.completedAt > request.slaDueAt then 'SLA_EXCEEDED'
            when request.completedAt is null and $now <= request.slaDueAt then 'WITHIN_SLA'
            else 'SLA_EXCEEDED'
        end                                      as slaResult : String(20)
};

/** Completed-request source for average calendar-day processing analytics. */
@readonly
view AverageProcessingDaysReport as select from ProcessRequests as request {
    key request.ID                              as ID,
        request.completedAt                     as reportingDate,
        request.requesterUser.ID                as requesterUserId,
        request.processType.code                as mainFlowCode,
        request.processType.name                as mainFlowName,
        request.subProcessType.code             as subFlowCode,
        request.subProcessType.name             as subFlowName,
        request.referenceNumber                 as requestReference,
        request.title                           as requestTitle,
        request.createdAt                       as createdAt,
        request.status.code                     as statusCode,
        request.completedAt                     as completedAt,
        cast(seconds_between(request.createdAt, request.completedAt) as Decimal(18, 4)) / 86400
                                                   as processingDays : Decimal(18, 4)
}
where request.completedAt is not null
  and request.status.code = 'COMPLETED';

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

@assert.unique.slaNotification: [notificationKey]
entity SlaNotificationStates : managed {
    key notificationKey : String(512);
    request             : Association to ProcessRequests;
    task                : Association to ProcessTasks;
    targetType          : String(20);
    recipient           : String(255);
    dueDate             : Date;
    status              : String(30) default 'PROCESSING';
    attempts            : Integer default 0;
    lastAttemptAt       : DateTime;
    notifiedAt          : DateTime;
    lastError           : LargeString;
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
    subProcessType : Association to ProcessSubTypes;
    // Retained for deployed data compatibility. New configuration uses subProcessType.
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
    isActive : Boolean default true;
}
