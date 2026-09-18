sap.ui.define([
    "flowmate/controller/BaseController",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/json/JSONModel"
], (BaseController, MessageBox, MessageToast, Filter, FilterOperator, JSONModel) => {
    "use strict";

    const MAX_ATTACHMENT_SIZE_MB = 400;
    const MAX_ATTACHMENT_SIZE_BYTES = MAX_ATTACHMENT_SIZE_MB * 1024 * 1024;

    const PO_NON_ADV_FIELDS = {
        required: [
            "paymentCategory_code",
            "businessEntity_code",
            "currency_code",
            "vendor_ID",
            "vendorCode",
            "vendorName",
            "paymentSubCategory_code",
            "userDivisionRepresentativeName",
            "poNumber",
            "invoices"
        ],
        optional: ["remarks", "whtCertificateReference"]
    };
    const PO_ADVANCE_FIELDS = {
        required: [
            "paymentCategory_code",
            "businessEntity_code",
            "currency_code",
            "vendor_ID",
            "vendorCode",
            "vendorName",
            "paymentSubCategory_code",
            "userDivisionRepresentativeName",
            "poNumber",
            "invoices"
        ],
        optional: ["remarks"]
    };
    const PO_ADV_SETTLEMENT_FIELDS = {
        required: [
            "paymentCategory_code",
            "businessEntity_code",
            "currency_code",
            "vendor_ID",
            "vendorCode",
            "vendorName",
            "paymentSubCategory_code",
            "userDivisionRepresentativeName",
            "poNumber",
            "remainingBalanceAfterAdvanceSettlement",
            "invoices"
        ],
        optional: ["remarks"]
    };
    const NON_PO_OFN_FIELDS = {
        required: [
            "paymentCategory_code",
            "businessEntity_code",
            "currency_code",
            "vendor_ID",
            "vendorCode",
            "vendorName",
            "invoiceDate",
            "invoiceNumber",
            "costCentre",
            "profitCentre",
            "paymentMethod_code",
            "totalValue",
            "ofnReference",
            "siteId",
            "wbsElement",
            "totalRentValue",
            "totalSupervisionValue",
            "securityDepositValue",
            "siteName"
        ],
        optional: ["remarks"]
    };
    const NON_PO_IDEAMART_APPMAKER_FIELDS = {
        required: [
            "paymentCategory_code",
            "businessEntity_code",
            "currency_code",
            "customer_ID",
            "customerCode",
            "customerName",
            "invoiceDebitNoteDate",
            "invoiceDebitNoteNumber",
            "totalPaymentValueForMonth",
            "userDivisionRepresentativeName",
            "whtNicHighestTransactionValue",
            "lessThan100kNicBlankHighestTransactionValue",
            "retentionRepaymentValue"
        ],
        optional: [
            "brcHighestTransactionValue", "remarks"
        ]
    };
    const NON_PO_SITE_SHARING_FIELDS = {
        required: [
            "paymentCategory_code",
            "businessEntity_code",
            "currency_code",
            "vendorCode",
            "vendorName"
        ],
        optional: [
            "remarks"
        ]
    };
    const DIRECT_NON_PO_REIMBURSEMENT_FIELDS = {
        required: [
            "paymentCategory_code", "businessEntity_code", "currency_code",
            "authorityVendorCode", "authorityVendorName",
            "employeeVendorCode", "employeeVendorName",
            "invoiceDate", "invoiceNumber", "costCentre", "wbsElement",
            "totalValue", "ofnReference", "siteId", "siteName"
        ],
        optional: ["remarks"]
    };
    const NON_PO_TAX_LIABILITY_FIELDS = {
        required: [
            "paymentCategory_code",
            "businessEntity_code",
            "currency_code",
            "requestingDivision_code",
            "vendor_ID",
            "vendorCode",
            "vendorName",
            "taxType",
            "reference",
            "totalTaxPayable",
            "tin",
            "taxDueDate",
            "glBreakups"
        ],
        optional: ["remarks", "din"]
    };
    const NON_PO_IMPORT_DGC_FIELDS = {
        required: [
            "paymentCategory_code",
            "businessEntity_code",
            "currency_code",
            "vendor_ID",
            "vendorCode",
            "vendorName",
            "cusdecDate",
            "cusdecNumber",
            "poNumber",
            "totalDeclarationValueInCusdec"
        ],
        optional: ["remarks"]
    };
    // Define the required and optional fields for each sub-process type. This will be used to validate the form before submission.
    const SUBTYPE_FIELDS = {
        FTK_FACTORING_PO_VALIDATION: {
            required: ["paymentCategory_code", "businessEntity_code", "vendor_ID", "vendorCode", "vendorName"],
            optional: ["remarks"]
        },
        FTK_FACTORING_BASED_ON_UAC: {
            required: ["paymentCategory_code", "businessEntity_code", "vendor_ID", "vendorCode", "vendorName", "currency_code", "category_code"],
            optional: ["remarks"]
        },
        // FTK_FACTORING_PENDING_UAC: {
        //     required: [],
        //     optional: ["paymentCategory_code", "businessEntity_code", "vendor_ID", "vendorCode", "vendorName", "remarks"]
        // },
        FTK_NON_FACTORING_BASED_UAC: {
            required: ["paymentCategory_code", "businessEntity_code", "currency_code", "category_code", "vendor_ID", "vendorCode", "vendorName"],
            optional: ["remarks"]
        },
        FTK_SERVICE_PAYMENT: {
            required: ["paymentCategory_code", "businessEntity_code", "currency_code", "vendor_ID", "vendorCode", "vendorName"],
            optional: ["remarks"]
        },
        FTK_DUTY_REIMBURSEMENT: {
            required: [
                "paymentCategory_code", "businessEntity_code", "currency_code", "amount",
                "vendor_ID", "vendorCode", "vendorName",
                "invoiceDebitNoteDate", "invoiceDebitNoteNumber", "totalDebitNoteValue", "userDivisionRepresentativeName", "poNumber"
            ],
            optional: ["remarks"]
        },
        PO_BEFORE_INVOICE_NON_ADV: PO_NON_ADV_FIELDS,
        PO_BEFORE_INVOICE_NON_ADV_LIAB: PO_NON_ADV_FIELDS,
        PO_AFTER_INVOICE_NON_ADV: PO_NON_ADV_FIELDS,
        PO_AFTER_INVOICE_NON_ADV_LIAB: PO_NON_ADV_FIELDS,
        PO_BEFORE_INVOICE_ADVANCE: PO_ADVANCE_FIELDS,
        PO_AFTER_INVOICE_ADVANCE: PO_ADVANCE_FIELDS,
        PO_BEFORE_INVOICE_ADV_STLMT: PO_ADV_SETTLEMENT_FIELDS,
        "PO_BEFORE_INVOICE_ADV_STLMT_100%": PO_ADV_SETTLEMENT_FIELDS,
        PO_AFTER_INVOICE_ADV_STLMT: PO_ADV_SETTLEMENT_FIELDS,
        "PO_AFTER_INVOICE_ADV_STLMT_100%": PO_ADV_SETTLEMENT_FIELDS,
        NON_PO_DIRECT_OFN_AUTHORITY: NON_PO_OFN_FIELDS,
        NON_PO_ADV_SETTLE_OFN_OTHER: NON_PO_OFN_FIELDS,
        NON_PO_DIRECT_FOREIGN_TRAVEL: {
            required: [
                "paymentCategory_code",
                "businessEntity_code",
                "directForeignTravelEntries"
            ],
            optional: []
        },
        NON_PO_FUEL_STAFF: {
            required: ["paymentCategory_code", "businessEntity_code", "currency_code", "fuelInclVat", "highestValueInFile"],
            optional: ["taxi", "remarks"]
        },
        NON_PO_FUEL_GENERATOR: {
            required: ["paymentCategory_code", "businessEntity_code", "currency_code", "fuelInclVat", "highestValueInFile"],
            optional: ["remarks"]
        },
        NON_PO_IDEAMART: NON_PO_IDEAMART_APPMAKER_FIELDS,
        NON_PO_APPMAKER: NON_PO_IDEAMART_APPMAKER_FIELDS,
        NON_PO_CUSTOMER_REFUNDS: {
            required: ["paymentCategory_code", "businessEntity_code", "currency_code", "highestRefundValueOfFile"],
            optional: ["remarks"]
        },
        NON_PO_STELACOM_CONSIGNMENT: {
            required: [
                "paymentCategory_code", "businessEntity_code", "currency_code", "vendor_ID","vendorCode", "vendorName", "totalInvoiceValue", "invoiceNumber",
                "invoiceDate", "liabilityBookingDocumentNumber"
            ],
            optional: ["remarks"]
        },
        NON_PO_SITE_SHARE_LIABILITY: {
            required: [
                "paymentCategory_code", "businessEntity_code", "category_code", "currency_code",
                "vendor_ID", "vendorCode", "vendorName",
                "invoiceDate", "invoiceNumber", "totalInvoiceValue", "invoiceDescription"
            ],
            optional: ["remarks"]
        },
        NON_PO_SITE_SHARING_SETOFF: NON_PO_SITE_SHARING_FIELDS,
        "NON_PO_SITE_SHARING_SETOFF&PAY": NON_PO_SITE_SHARING_FIELDS,
        NON_PO_SITE_RENT_TAX_INVOICE: {
            required: [
                "paymentCategory_code", "businessEntity_code", "currency_code",
                "vendor_ID", "vendorCode", "vendorName",
                "totalInvoiceValue", "invoiceNumber", "invoiceDate"
            ],
            optional: ["remarks"]
        },
        NON_PO_SITE_RENT_MONTHLY_FILE: {
            required: [
                "paymentCategory_code", "businessEntity_code", "currency_code", "highestMonthlyRentalValueInFile",
                "totalFileValue", "invoiceDescription"
            ],
            optional: ["remarks"]
        },
        NON_PO_SITE_RENT_STAMP_ADHOC: {
            required: [
                "paymentCategory_code", "businessEntity_code",
                "vendor_ID", "vendorCode", "vendorName",
                "currency_code", "totalPayableValue", "paymentDescription"
            ],
            optional: [
                "invoiceDate", "invoiceNumber", "siteId", "siteName", "remarks"
            ]
        },
        DIRECT_NON_PO_REIMB_LIAB: DIRECT_NON_PO_REIMBURSEMENT_FIELDS,
        DIRECT_NON_PO_REIMB_PAYMENT: DIRECT_NON_PO_REIMBURSEMENT_FIELDS,
        DIRECT_FOREIGN_TRAVEL_REIMB: {
            required: [
                "paymentCategory_code", "businessEntity_code", "currency_code",
                "nameEmpNo", "designation", "purposeOfTrip", "month", "country", "budgetCode",
                "employeeVendorCode", "employeeVendorName",
                "balanceToBeReturned", "totalAmountLKR",
                "travelExpenses"
            ],
            optional: [
                "transactionDate", "totalAmountForeignCurrency", "remarks"
            ]
        },
        NON_PO_TAX_LIAB_PAY_OTTP: NON_PO_TAX_LIABILITY_FIELDS,
        NON_PO_TAX_LIAB_PAY_PAYORDER: NON_PO_TAX_LIABILITY_FIELDS,
        NON_PO_INTERCONNECT_LIAB: {
            required: [
                "paymentCategory_code",
                "businessEntity_code",
                "currency_code",
                "customer_ID",
                "customerCode",
                "customerName",
                "invoiceDebitNoteDate",
                "invoiceDebitNoteNumber",
                "totalInvoiceValueRelevantCurrency",
                "totalInvoiceValueLKR"
            ],
            optional: ["vatAmount", "remarks"]
        },
        NON_PO_INTERCONNECT_ROAM_PAY: {
            required: [
                "paymentCategory_code",
                "businessEntity_code",
                "currency_code",
                "customer_ID",
                "customerCode",
                "customerName"
            ],
            optional: ["remarks", "whtCertificateReference"]
        },
        NON_PO_ROAMING_LIABILITY: {
            required: [
                "paymentCategory_code",
                "businessEntity_code",
                "currency_code",
                "customer_ID",
                "customerCode",
                "customerName",
                "totalInvoiceValueRelevantCurrency",
                "totalInvoiceValueLKR"
            ],
            optional: []
        },
        NON_PO_STAR_POINT_PAYMENTS: {
            required: [
                "paymentCategory_code",
                "businessEntity_code",
                "currency_code",
                "highestPayableValueInList",
                "ivDocumentPostingDate"
            ],
            optional: ["remarks"]
        },
        NON_PO_IMPORT_TRC: {
            required: [
                "paymentCategory_code",
                "businessEntity_code",
                "currency_code",
                "vendor_ID",
                "vendorCode",
                "vendorName",
                "trcslProformaInvoiceDate",
                "typeOfPayment_code",
                "trcslProformaInvoiceTotalValue"
            ],
            optional: ["poNumber", "budgetCode", "remarks"]
        },
        NON_PO_IMPORT_ICL: {
            required: [
                "paymentCategory_code",
                "businessEntity_code",
                "currency_code",
                "vendor_ID",
                "vendorCode",
                "vendorName",
                "pivDate",
                "pivApplicationNumber",
                "totalPivValue"
            ],
            optional: ["remarks"]
        },
        NON_PO_IMPORT_DGC_ADV: NON_PO_IMPORT_DGC_FIELDS,
        NON_PO_IMPORT_DGC_DIRECT: NON_PO_IMPORT_DGC_FIELDS,
        NON_PO_CC_PAYMENT: {
            required: [
                "paymentCategory_code",
                "businessEntity_code",
                "currency_code",
                "ccCustodianName",
                "vendor_ID",
                "vendorCode",
                "vendorName",
                "whtEligibilityConfirmation",
                "poNumber",
                "sesReference",
                "totalAmountPayable",
                "descriptionOfPayment",
                "justificationForCreditCardUse"
            ],
            optional: ["invoiceDate", "invoiceNumber", "budgetCode", "remarks"]
        },
        NON_PO_CC_SETTLEMENT: {
            required: [
                "paymentCategory_code",
                "businessEntity_code",
                "currency_code",
                "bankName",
                "ccCustodianName",
                "ccPeriodFromDate",
                "ccPeriodToDate",
                "settlementEntries",
                "stampDuty",
                "latePaymentFee",
                "interestCharges",
                "totalAmountPayableCcSettlement"
            ],
            optional: ["annualFee", "remarks"]
        },
        NON_PO_MERCHANT_SETTLEMENTS: {
            required: [
                "paymentCategory_code",
                "businessEntity_code",
                "currency_code",
                "merchantEntityValues",
                "highestValueInExcel",
                "aggregateTotalValueAcrossAllFiles",
                "processingBankAccountDetails"
            ],
            optional: []
        },
        NON_PO_MISC_RECEIPTS: {
            required: [
                "paymentCategory_code",
                "businessEntity_code",
                "currency_code",
                "depositedAmount",
                "debitGL"
            ],
            optional: ["vendor_ID", "vendorCode", "vendorName", "costCentre", "remarks"]
        },
        PO_ZERO_IV: {
            required: [
                "paymentCategory_code",
                "businessEntity_code",
                "currency_code",
                "zeroIvUserConfirmationAttached"
            ],
            optional: ["remarks"]
        },
        BANK_GUARANTEE: {
            required: [
                "paymentCategory_code",
                "businessEntity_code",
                "currency_code",
                "amount",
                "guaranteeType_code",
                "beneficiaryName",
                "beneficiaryAddress",
                "commencingDate",
                "expiryDate",
                "claimDate",
                "tenderDate",
                "expectedDate",
                "purposeOfBankGuarantee",
                "bidTenderReference",
                "collectorName",
                "collectorNic",
                "collectorContactNumber",
                "specificBgFormatAvailable"
            ],
            optional: ["remarks"]
        }

    };


    return BaseController.extend("flowmate.controller.RequestCreate", {
        formatter: {
            isDinMandatory(bIsNonPoTaxLiability, sBusinessEntityCode) {
                return Boolean(bIsNonPoTaxLiability) &&
                    ["DAP", "DBN", "DTV", "H_ONE"].includes(sBusinessEntityCode);
            }
        },
        onInit() {
            this.getRouter().getRoute("RouteRequestCreate").attachPatternMatched(this.onRouteMatched, this);
        },

        async onRouteMatched(oEvent) {
            const oQuery = oEvent.getParameter("arguments")["?query"] || {};

            this._bReturnToUnreservedOnly = oQuery.unreserved === "true";
            this._bReturnToReservedOnly = oQuery.reserved === "true";
            this._sPredecessorId = oQuery.predecessorId || "";
            this.setTwoColumnLayout();
            this._aAttachmentFiles = [];
            this._sActiveSubProcessTypeCode = "";
            this.getView().setModel(new JSONModel({
                predecessor_ID: this._sPredecessorId,
                predecessorReferenceNumber: "",
                predecessorTitle: "",
                predecessorDisplay: "",
                processType_code: "",
                processTypeName: "",
                subProcessType_code: "",
                subProcessTypeName: "",
                hasSubProcessTypes: false,
                loaApprovalApplicable: false,
                isPaymentRequest: false,
                amount: null,
                role: "",
                isFtkFactoring: false,
                isFtkPoValidation: false,
                isFtkBasedOnUac: false,
                isFtkNonFactoring: false,
                isFtkServicePayment: false,
                isFtkDutyReimbursement: false,
                isPoBasedNonAdvance: false,
                isPoAdvance: false,
                isPoAdvSettlement: false,
                isOfnAuthority: false,
                isNonPoDirectForeignTravel: false,
                isNonPoFuel: false,
                isNonPoIdeaMartAppMaker: false,
                isNonPoCustomerRefunds: false,
                isNonPoStelacomConsignment: false,
                isNonPoSiteShareLiability: false,
                isNonPoSiteSharing: false,
                isNonPoSiteRentTaxInvoice: false,
                isNonPoSiteRentMonthlyFile: false,
                isNonPoSiteRentStampAdhoc: false,
                isDirectNonPoReimbursement: false,
                isDirectForeignTravelReimb: false,
                isNonPoTaxLiability: false,
                isNonPoInterconnectLiab: false,
                isNonPoInterconnectRoamPay: false,
                isNonPoRoamingLiability: false,
                isNonPoStarPointPayments: false,
                isNonPoImportTrc: false,
                isNonPoImportIcl: false,
                isNonPoImportDgc: false,
                isNonPoCcPayment: false,
                isNonPoCcSettlement: false,
                isNonPoMerchantSettlements: false,
                isNonPoMiscReceipts: false,
                isPoZeroIv: false,
                isBankGuarantee: false,
                paymentCategory_code: "",
                businessEntity_code: "",
                currency_code: "",
                category_code: "",
                invoiceDebitNoteDate: null,
                invoiceDebitNoteNumber: "",
                totalDebitNoteValue: null,
                poNumber: "",
                userDivisionRepresentativeName: "",
                vatAmount: null,
                sesReference: "",
                paymentSubCategory_code: "",
                whtCertificateReference: "",
                remainingBalanceAfterAdvanceSettlement: null,
                invoiceDate: null,
                invoiceNumber: "",
                costCentre: "",
                profitCentre: "",
                wbsElement: "",
                totalRentValue: null,
                totalSupervisionValue: null,
                securityDepositValue: null,
                totalValue: null,
                ofnReference: "",
                siteId: "",
                siteName: "",
                directForeignTravelEntries: [],
                fuelInclVat: null,
                taxi: null,
                highestValueInFile: null,
                brcHighestTransactionValue: null,
                whtNicHighestTransactionValue: null,
                lessThan100kNicBlankHighestTransactionValue: null,
                totalPaymentValueForMonth: null,
                retentionRepaymentValue: null,
                highestRefundValueOfFile: null,
                totalInvoiceValue: null,
                liabilityBookingDocumentNumber: "",
                invoiceDescription: "",
                highestMonthlyRentalValueInFile: null,
                totalFileValue: null,
                totalPayableValue: null,
                paymentDescription: "",
                authorityVendorCode: "",
                authorityVendorName: "",
                employeeVendorCode: "",
                employeeVendorName: "",
                transactionDate: null,
                totalAmountForeignCurrency: null,
                totalAmountLKR: null,
                balanceToBeReturned: null,
                nameEmpNo: "",
                designation: "",
                purposeOfTrip: "",
                month: null,
                country: "",
                travelExpenses: [],
                taxType: "",
                reference: "",
                totalTaxPayable: null,
                tin: "",
                din: "",
                taxDueDate: null,
                glBreakups: [],
                highestPayableValueInList: null,
                ivDocumentPostingDate: null,
                budgetCode: "",
                trcslProformaInvoiceDate: null,
                typeOfPayment_code: "",
                trcslProformaInvoiceTotalValue: null,
                pivDate: null,
                pivApplicationNumber: "",
                totalPivValue: null,
                cusdecDate: null,
                cusdecNumber: "",
                totalDeclarationValueInCusdec: null,
                ccCustodianName: "",
                whtEligibilityConfirmation: false,
                totalAmountPayable: null,
                descriptionOfPayment: "",
                justificationForCreditCardUse: "",
                bankName: "",
                ccPeriodFromDate: null,
                ccPeriodToDate: null,
                annualFee: null,
                stampDuty: null,
                latePaymentFee: null,
                interestCharges: null,
                totalAmountPayableCcSettlement: null,
                settlementEntries: [],
                highestValueInExcel: null,
                aggregateTotalValueAcrossAllFiles: null,
                processingBankAccountDetails: "",
                merchantEntityValues: [],
                depositedAmount: null,
                debitGL: "",
                zeroIvUserConfirmationAttached: false,
                guaranteeType_code: "",
                beneficiaryName: "",
                beneficiaryAddress: "",
                commencingDate: null,
                expiryDate: null,
                claimDate: null,
                tenderDate: null,
                expectedDate: null,
                purposeOfBankGuarantee: "",
                bidTenderReference: "",
                collectorName: "",
                collectorNic: "",
                collectorContactNumber: "",
                specificBgFormatAvailable: false,
                vendor_ID: "",
                vendorCode: "",
                vendorName: "",
                customer_ID: "",
                customerCode: "",
                customerName: "",
                remarks: "",
                title: "",
                description: "",
                requesterUser_ID: "",
                requesterName: "",
                requester: "",
                processorTeam_ID: "",
                processorTeamName: "",
                department: "",
                priorityConfig_code: "MEDIUM",
                creating: false,
                uploading: false,
                attachments: [],
                Invoices: []
            }), "create");
            this.getView().setModel(new JSONModel({
                dialogTitle: "",
                invoiceDate: null,
                invoiceNumber: "",
                amount: null,
                vatAmount: null,
                sesReference: "",
                remarks: ""
            }), "invoiceEdit");
            this.getView().setModel(new JSONModel({
                dialogTitle: "",
                travelerName: "",
                category: "",
                vendorCode: "",
                ctmProposalNo: "",
                purposeOfTravel: "",
                venue: "",
                departureDateTime: null,
                arrivalDateTime: null,
                budgetCode: "",
                currency_code: "",
                airfare: null,
                visaFee: null,
                perDayAllowanceUSD: null,
                noOfDays: null,
                totalInUSD: null,
                exchangeRate: null,
                totalInLKR: null,
                totalCostForeignCurrency: null,
                totalCostLKR: null,
                confirmedTravelItinerary: "",
                selectedScheme: "",
                personalTravelInvolved: false,
                periodOfPersonalTravel: "",
                specialRemarks: ""
            }), "directForeignTravelEdit");
            this.getView().setModel(new JSONModel({
                dialogTitle: "",
                date: null,
                particulars: "",
                transport: null,
                hotel: null,
                meals: null,
                entertainment: null,
                laundry: null,
                phone: null,
                sundry: null,
                miscellaneous: null,
                total: null
            }), "travelExpenseEdit");
            this.getView().setModel(new JSONModel({
                dialogTitle: "",
                glAccount: "",
                relevantDescription: "",
                relevantAmount: null,
                costCentre: "",
                profitCentre: ""
            }), "glBreakupEdit");
            this.getView().setModel(new JSONModel({
                dialogTitle: "",
                paymentRequestRef_ID: "",
                paymentRequest: "",
                poNumber: "",
                sesReference: "",
                invoiceNumber: "",
                invoiceDate: null,
                description: "",
                transactionAmountUSD: null,
                paymentAmountLKR: null,
                availabilityOfInvoice: false
            }), "settlementEntryEdit");
            this.getView().setModel(new JSONModel({
                dialogTitle: "",
                businessEntity_code: "",
                totalPayableValue: null
            }), "merchantEntityValueEdit");

            await this._populateCurrentRequester();

            if (this._sPredecessorId) {
                await this._prefillFromPredecessor(this._sPredecessorId);
                await this._populateCurrentRequester();
            }
        },

        async onCreate() {
            const oPayload = this.getView().getModel("create").getData();

            if (!oPayload.title || !oPayload.processType_code) {
                MessageBox.warning(this.getText("createRequiredMessage"));
                return;
            }

            if (oPayload.hasSubProcessTypes && !oPayload.subProcessType_code) {
                MessageBox.warning(this.getText("subProcessTypeRequiredMessage"));
                return;
            }

            if (oPayload.loaApprovalApplicable && (
                oPayload.amount === ""
                || oPayload.amount === null
                || oPayload.amount === undefined
                || !Number.isFinite(Number(oPayload.amount))
            )) {
                MessageBox.warning(this.getText("amountRequiredMessage"));
                return;
            }

            // if (oPayload.isFtkPoValidation && (
            //     !String(oPayload.paymentCategory_code || "").trim()
            //     || !String(oPayload.businessEntity_code || "").trim()
            //     || !String(oPayload.vendor_ID || "").trim()
            //     || !String(oPayload.vendorCode || "").trim()
            //     || !String(oPayload.vendorName || "").trim()
            //     || !this._aAttachmentFiles.length
            // )) {
            //     MessageBox.warning(this.getText("ftkPoValidationRequiredMessage"));
            //     return;
            // }

            // const oCreateModel = this.getView().getModel("create");
            // oCreateModel.setProperty("/creating", true);
            // try {
            //     const oCreated = await this.createEntry("/ProcessRequests", {
            //         processType_code: oPayload.processType_code,
            //         subProcessType_code: oPayload.subProcessType_code || undefined,
            //         title: oPayload.title,
            //         description: oPayload.description,
            //         requesterUser_ID: oPayload.requesterUser_ID || undefined,
            //         requester: oPayload.requester,
            //         processorTeam_ID: oPayload.processorTeam_ID || undefined,
            //         processorTeamName: oPayload.processorTeamName,
            //         predecessor_ID: oPayload.predecessor_ID || undefined,
            //         department: oPayload.department,
            //         amount: oPayload.loaApprovalApplicable ? Number(oPayload.amount) : undefined,
            //         role: oPayload.loaApprovalApplicable ? oPayload.role : undefined,
            //         priorityConfig_code: oPayload.priorityConfig_code || "MEDIUM",
            //         ...(oPayload.isFtkFactoring ? {
            //             paymentCategory_code: oPayload.paymentCategory_code || undefined,
            //             businessEntity_code: oPayload.businessEntity_code || undefined,
            //             vendor_ID: oPayload.vendor_ID || undefined,
            //             remarks: oPayload.remarks
            //         } : {}),
            //         status_code: "DRAFT"
            //     });
            // checking for required fields based on subProcessType_code
            const oFieldSet = SUBTYPE_FIELDS[oPayload.subProcessType_code];

            if (oFieldSet) {
                const aMissing = oFieldSet.required.filter((sField) => {
                    const vValue = oPayload[sField];

                    // Array fields
                    if (Array.isArray(vValue)) {
                        return vValue.length === 0;
                    }

                    return (
                        vValue === "" ||
                        vValue === null ||
                        vValue === undefined
                    );
                });
                // WHT Certificate Reference is mandatory only for Foreign payment category
                if (
                    this._isPoBasedNonAdvanceSubtype(oPayload.subProcessType_code) &&
                    oPayload.paymentCategory_code === "FOREIGN" &&
                    !String(oPayload.whtCertificateReference || "").trim()
                ) {
                    aMissing.push("whtCertificateReference");
                }
                if (
                    this._isNonPoInterconnectRoamPaySubtype(oPayload.subProcessType_code) &&
                    oPayload.paymentCategory_code === "FOREIGN" &&
                    !String(oPayload.whtCertificateReference || "").trim()
                ) {
                    aMissing.push("whtCertificateReference");
                }
                //
                if (
                    oPayload.subProcessType_code === "NON_PO_IDEAMART" &&
                    (
                        oPayload.brcHighestTransactionValue === "" ||
                        oPayload.brcHighestTransactionValue === null ||
                        oPayload.brcHighestTransactionValue === undefined
                    )
                ) {
                    aMissing.push("brcHighestTransactionValue");
                }
                // DIN is mandatory only for specific entities on the Non-PO Tax Liability subtypes
                if (
                    this._isNonPoTaxLiabilitySubtype(oPayload.subProcessType_code) &&
                    ["DAP", "DBN", "DTV", "H_ONE"].includes(oPayload.businessEntity_code) &&
                    !String(oPayload.din || "").trim()
                ) {
                    aMissing.push("din");
                }

                if (!this._aAttachmentFiles.length) {
                    aMissing.push("Supporting Documents");
                }

                if (aMissing.length) {
                    MessageBox.warning(this.getText("subtypeRequiredFieldsMessage", [aMissing.join(", ")]));
                    return;
                }
            }

            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/creating", true);

            try {
                const aAttachmentUploads = this._aAttachmentFiles.map((oFile) => ({
                    ID: this._createUuid(),
                    file: oFile,
                    filename: oFile.name,
                    mimeType: oFile.type || "application/octet-stream"
                }));
                // Prepare the payload with only the required and optional fields for the selected sub-process type
                // const oExtendedFields = oFieldSet
                //     ? [...oFieldSet.required, ...oFieldSet.optional].reduce((oResult, sField) => {
                //         const vValue = oPayload[sField];
                //         if (vValue !== "" && vValue !== null && vValue !== undefined) {
                //             oResult[sField] = sField.endsWith("Value") || ["amount", "vatAmount", "totalDebitNoteValue",
                //                 "totalValue", "totalRentValue", "totalSupervisionValue", "securityDepositValue",
                //                 "fuelInclVat", "taxi", "highestValueInFile", "brcHighestTransactionValue",
                //                 "whtNicHighestTransactionValue", "lessThan100kNicBlankHighestTransactionValue",
                //                 "totalPaymentValueForMonth", "retentionRepaymentValue", "highestRefundValueOfFile", "totalInvoiceValue", "highestMonthlyRentalValueInFile", "totalFileValue"

                //             ].includes(sField) ? Number(vValue) : vValue;
                //         }

                //         return oResult;
                //     }, {})
                //     : {};
                const oExtendedFields = oFieldSet
                    ? [...oFieldSet.required, ...oFieldSet.optional].reduce((oResult, sField) => {
                        const vValue = oPayload[sField];

                        if (vValue !== "" && vValue !== null && vValue !== undefined) {

                            // Composition field
                            if (sField === "invoices") {
                                oResult.invoices = vValue.map((oInvoice) => ({
                                    invoiceDate: oInvoice.invoiceDate,
                                    invoiceNumber: oInvoice.invoiceNumber,
                                    amount: Number(oInvoice.amount),
                                    vatAmount: Number(oInvoice.vatAmount),
                                    sesReference: oInvoice.sesReference,
                                    remarks: oInvoice.remarks || "",
                                    subProcessType_code:
                                        oInvoice.subProcessType_code
                                }));

                                return oResult;
                            }
                            if (sField === "travelExpenses") {
                                oResult.travelExpenses = vValue.map((oExpense) => ({
                                    date: oExpense.date,
                                    particulars: oExpense.particulars,
                                    transport: Number(oExpense.transport),
                                    hotel: Number(oExpense.hotel),
                                    meals: Number(oExpense.meals),
                                    entertainment: Number(oExpense.entertainment),
                                    laundry: Number(oExpense.laundry),
                                    phone: Number(oExpense.phone),
                                    sundry: Number(oExpense.sundry),
                                    miscellaneous: Number(oExpense.miscellaneous),
                                    total: Number(oExpense.total)
                                }));
                                return oResult;
                            }
                            if (sField === "directForeignTravelEntries") {
                                oResult.directForeignTravelEntries = vValue.map((oEntry) => ({
                                    travelerName: oEntry.travelerName,
                                    category: oEntry.category || "",
                                    vendorCode: oEntry.vendorCode,
                                    ctmProposalNo: oEntry.ctmProposalNo,
                                    purposeOfTravel: oEntry.purposeOfTravel,
                                    venue: oEntry.venue || "",
                                    departureDateTime: oEntry.departureDateTime,
                                    arrivalDateTime: oEntry.arrivalDateTime,
                                    budgetCode: oEntry.budgetCode || "",
                                    currency_code: oEntry.currency_code,
                                    airfare: oEntry.airfare !== null && oEntry.airfare !== "" ? Number(oEntry.airfare) : null,
                                    visaFee: oEntry.visaFee !== null && oEntry.visaFee !== "" ? Number(oEntry.visaFee) : null,
                                    perDayAllowanceUSD: Number(oEntry.perDayAllowanceUSD),
                                    noOfDays: Number(oEntry.noOfDays),
                                    totalInUSD: oEntry.totalInUSD !== null && oEntry.totalInUSD !== "" ? Number(oEntry.totalInUSD) : null,
                                    exchangeRate: oEntry.exchangeRate !== null && oEntry.exchangeRate !== "" ? Number(oEntry.exchangeRate) : null,
                                    totalInLKR: oEntry.totalInLKR !== null && oEntry.totalInLKR !== "" ? Number(oEntry.totalInLKR) : null,
                                    totalCostForeignCurrency: oEntry.totalCostForeignCurrency !== null && oEntry.totalCostForeignCurrency !== "" ? Number(oEntry.totalCostForeignCurrency) : null,
                                    totalCostLKR: oEntry.totalCostLKR !== null && oEntry.totalCostLKR !== "" ? Number(oEntry.totalCostLKR) : null,
                                    confirmedTravelItinerary: oEntry.confirmedTravelItinerary || "",
                                    selectedScheme: oEntry.selectedScheme || "",
                                    personalTravelInvolved: Boolean(oEntry.personalTravelInvolved),
                                    periodOfPersonalTravel: oEntry.periodOfPersonalTravel || "",
                                    specialRemarks: oEntry.specialRemarks || ""
                                }));
                                return oResult;
                            }
                            if (sField === "glBreakups") {
                                oResult.glBreakups = vValue.map((oBreakup) => ({
                                    glAccount: oBreakup.glAccount,
                                    relevantDescription: oBreakup.relevantDescription,
                                    relevantAmount: Number(oBreakup.relevantAmount),
                                    costCentre: oBreakup.costCentre,
                                    profitCentre: oBreakup.profitCentre || ""
                                }));
                                return oResult;
                            }
                            if (sField === "merchantEntityValues") {
                                oResult.merchantEntityValues = vValue.map((oEntry) => ({
                                    businessEntity_code: oEntry.businessEntity_code,
                                    totalPayableValue: Number(oEntry.totalPayableValue)
                                }));
                                return oResult;
                            }
                            if (sField === "settlementEntries") {
                                oResult.settlementEntries = vValue.map((oEntry) => ({
                                    paymentRequestRef_ID: oEntry.paymentRequestRef_ID || undefined,
                                    paymentRequest: oEntry.paymentRequest,
                                    poNumber: oEntry.poNumber,
                                    sesReference: oEntry.sesReference,
                                    invoiceNumber: oEntry.invoiceNumber,
                                    invoiceDate: oEntry.invoiceDate,
                                    description: oEntry.description,
                                    transactionAmountUSD: Number(oEntry.transactionAmountUSD),
                                    paymentAmountLKR: Number(oEntry.paymentAmountLKR),
                                    availabilityOfInvoice: Boolean(oEntry.availabilityOfInvoice)
                                }));
                                return oResult;
                            }

                            const aNumericFields = [
                                "amount",
                                "vatAmount",
                                "totalDebitNoteValue",
                                "totalValue",
                                "totalRentValue",
                                "totalSupervisionValue",
                                "securityDepositValue",
                                "fuelInclVat",
                                "taxi",
                                "highestValueInFile",
                                "remainingBalanceAfterAdvanceSettlement",
                                "brcHighestTransactionValue",
                                "whtNicHighestTransactionValue",
                                "lessThan100kNicBlankHighestTransactionValue",
                                "totalPaymentValueForMonth",
                                "retentionRepaymentValue",
                                "highestRefundValueOfFile",
                                "totalInvoiceValue", "highestMonthlyRentalValueInFile", "totalFileValue", "totalPayableValue",
                                "totalAmountForeignCurrency", "totalAmountLKR", "balanceToBeReturned", "totalTaxPayable", "totalInvoiceValueRelevantCurrency",
                                "totalInvoiceValueLKR",
                                "highestPayableValueInList", "trcslProformaInvoiceTotalValue", "totalAmountPayable", "totalPivValue", "totalDeclarationValueInCusdec",
                                "annualFee", "stampDuty",
                                "latePaymentFee",
                                "interestCharges",
                                "totalAmountPayableCcSettlement",
                                "highestValueInExcel",
                                "aggregateTotalValueAcrossAllFiles", "depositedAmount"
                            ];

                            oResult[sField] =
                                sField.endsWith("Value") || aNumericFields.includes(sField)
                                    ? Number(vValue)
                                    : vValue;
                        }

                        return oResult;
                    }, {})
                    : {};

                const oCreated = await this.createEntry("/ProcessRequests", {
                    processType_code: oPayload.processType_code,
                    subProcessType_code: oPayload.subProcessType_code || undefined,
                    title: oPayload.title,
                    description: oPayload.description,
                    requesterUser_ID: oPayload.requesterUser_ID || undefined,
                    requester: oPayload.requester,
                    processorTeam_ID: oPayload.processorTeam_ID || undefined,
                    processorTeamName: oPayload.processorTeamName,
                    predecessor_ID: oPayload.predecessor_ID || undefined,
                    department: oPayload.department,
                    amount: oPayload.loaApprovalApplicable ? Number(oPayload.amount) : undefined,
                    role: oPayload.loaApprovalApplicable ? oPayload.role : undefined,
                    priorityConfig_code: oPayload.priorityConfig_code || "MEDIUM",
                    ...(oPayload.isFtkFactoring ? {
                        paymentCategory_code: oPayload.paymentCategory_code || undefined,
                        businessEntity_code: oPayload.businessEntity_code || undefined,
                        vendor_ID: oPayload.vendor_ID || undefined,
                        remarks: oPayload.remarks
                    } : {}),
                    ...(aAttachmentUploads.length ? {
                        attachments: aAttachmentUploads.map(({ ID, filename, mimeType }) => ({
                            ID,
                            filename,
                            mimeType
                        }))
                    } : {}),
                    ...oExtendedFields,
                    status_code: "DRAFT"
                });

                if (aAttachmentUploads.length) {
                    this._startAttachmentUploadInBackground(aAttachmentUploads);
                    MessageToast.show(this.getText("requestCreatedAttachmentUploadStartedMessage"));
                } else {
                    MessageToast.show(this.getText("requestCreatedMessage"));
                }

                this.navTo("RouteMyRequests", this._getRequestListRouteParameters({
                    requestId: oCreated.ID
                }));
            } catch (oError) {
                MessageBox.error(this.getErrorMessage(oError, this.getText("requestCreateFailedMessage")));
            } finally {
                oCreateModel.setProperty("/creating", false);
            }
        },

        onCancel() {
            this.navTo("RouteMyRequests", this._getRequestListRouteParameters(), true);
        },

        onAttachmentsSelected(oEvent) {
            const aFiles = Array.from(oEvent.getParameter("files") || []);

            if (!this._validateAttachmentFiles(aFiles)) {
                oEvent.getSource().clear();
                return;
            }

            this._aAttachmentFiles.push(...aFiles);
            this._syncAttachmentModel();
            oEvent.getSource().clear();
        },

        onAttachmentFileSizeExceed(oEvent) {
            MessageBox.warning(this.getText("attachmentSizeExceededMessage", [
                oEvent.getParameter("fileName"),
                MAX_ATTACHMENT_SIZE_MB
            ]));
            oEvent.getSource().clear();
        },

        onRemoveAttachment(oEvent) {
            const sPath = oEvent.getSource().getBindingContext("create").getPath();
            const iIndex = Number(sPath.split("/").pop());

            this._aAttachmentFiles.splice(iIndex, 1);
            this._syncAttachmentModel();
        },

        onProcessTypeValueHelpRequest() {
            this.byId("processTypeValueHelpDialog").open();
        },

        onProcessTypeSuggest(oEvent) {
            this._filterSuggestionItems(oEvent, ["code", "name", "descr"], [
                new Filter("isActive", FilterOperator.EQ, true)
            ]);
        },

        async onProcessTypeSuggestionSelected(oEvent) {
            const oContext = this._getSuggestionContext(oEvent);

            if (!oContext) {
                return;
            }

            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/processType_code", oContext.getProperty("code"));
            oCreateModel.setProperty("/processTypeName", oContext.getProperty("name"));
            await this._onProcessSelectionChanged();
        },

        onProcessTypeLiveChange() {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/processType_code", "");
            oCreateModel.setProperty("/subProcessType_code", "");
            oCreateModel.setProperty("/subProcessTypeName", "");
            oCreateModel.setProperty("/hasSubProcessTypes", false);
            this._setFtkFactoringMode(false);
        },

        onProcessTypeValueHelpSearch(oEvent) {
            const sQuery = oEvent.getParameter("value") || "";
            const oBinding = oEvent.getSource().getBinding("items");
            const oActiveFilter = new Filter("isActive", FilterOperator.EQ, true);

            if (!sQuery) {
                oBinding.filter([oActiveFilter]);
                return;
            }

            oBinding.filter([
                oActiveFilter,
                new Filter({
                    filters: [
                        new Filter("code", FilterOperator.Contains, sQuery),
                        new Filter("name", FilterOperator.Contains, sQuery),
                        new Filter("descr", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                })
            ]);
        },

        async onProcessTypeValueHelpConfirm(oEvent) {
            const oSelectedItem = oEvent.getParameter("selectedItem");
            const oContext = oSelectedItem && oSelectedItem.getBindingContext();

            if (!oContext) {
                return;
            }

            this.getView().getModel("create").setProperty("/processType_code", oContext.getProperty("code"));
            this.getView().getModel("create").setProperty("/processTypeName", oContext.getProperty("name"));
            await this._onProcessSelectionChanged();
            this.onProcessTypeValueHelpClose(oEvent);
        },

        onProcessTypeValueHelpClose(oEvent) {
            const oBinding = oEvent.getSource().getBinding("items");

            if (oBinding) {
                oBinding.filter([]);
            }
        },

        onPredecessorRequestValueHelpRequest() {
            this.byId("predecessorRequestValueHelpDialog").open();
        },

        onPredecessorRequestSuggest(oEvent) {
            this._filterSuggestionItems(oEvent, [
                "referenceNumber",
                "title",
                "processType_code",
                "subProcessType_code",
                "requester",
                "processor"
            ]);
        },

        onPredecessorRequestSuggestionSelected(oEvent) {
            const oContext = this._getSuggestionContext(oEvent);

            if (!oContext) {
                return;
            }

            this._setPredecessor(oContext);
        },

        onPredecessorRequestLiveChange() {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/predecessor_ID", "");
            oCreateModel.setProperty("/predecessorReferenceNumber", "");
            oCreateModel.setProperty("/predecessorTitle", "");
        },

        onPredecessorRequestValueHelpSearch(oEvent) {
            const sQuery = oEvent.getParameter("value") || "";
            const oBinding = oEvent.getSource().getBinding("items");

            if (!sQuery) {
                oBinding.filter([]);
                return;
            }

            oBinding.filter([
                new Filter({
                    filters: [
                        new Filter("referenceNumber", FilterOperator.Contains, sQuery),
                        new Filter("title", FilterOperator.Contains, sQuery),
                        new Filter("processType_code", FilterOperator.Contains, sQuery),
                        new Filter("subProcessType_code", FilterOperator.Contains, sQuery),
                        new Filter("status_code", FilterOperator.Contains, sQuery),
                        new Filter("requester", FilterOperator.Contains, sQuery),
                        new Filter("processor", FilterOperator.Contains, sQuery),
                        new Filter("reservedBy", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                })
            ]);
        },

        onPredecessorRequestValueHelpConfirm(oEvent) {
            const oContext = oEvent.getParameter("selectedItem")?.getBindingContext();

            if (!oContext) {
                return;
            }

            this._setPredecessor(oContext);
            this.onPredecessorRequestValueHelpClose(oEvent);
        },

        onPredecessorRequestValueHelpClose(oEvent) {
            oEvent.getSource().getBinding("items")?.filter([]);
        },

        onClearPredecessorRequest() {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/predecessor_ID", "");
            oCreateModel.setProperty("/predecessorReferenceNumber", "");
            oCreateModel.setProperty("/predecessorTitle", "");
            oCreateModel.setProperty("/predecessorDisplay", "");
        },

        onSubProcessTypeValueHelpRequest() {
            const sProcessTypeCode = this.getView().getModel("create").getProperty("/processType_code");

            if (!sProcessTypeCode) {
                MessageToast.show(this.getText("selectProcessTypeFirstMessage"));
                return;
            }

            const oDialog = this.byId("subProcessTypeValueHelpDialog");
            this._filterSubProcessTypeDialog(oDialog, "");
            oDialog.open();
        },

        onSubProcessTypeSuggest(oEvent) {
            const sProcessTypeCode = this.getView().getModel("create").getProperty("/processType_code");
            const aFixedFilters = sProcessTypeCode
                ? [
                    new Filter("isActive", FilterOperator.EQ, true),
                    new Filter("processType_code", FilterOperator.EQ, sProcessTypeCode)
                ]
                : [new Filter("isActive", FilterOperator.EQ, true)];

            this._filterSuggestionItems(oEvent, ["code", "name", "descr", "processOwner"], aFixedFilters);
        },

        onSubProcessTypeSuggestionSelected(oEvent) {
            const oContext = this._getSuggestionContext(oEvent);

            if (!oContext) {
                return;
            }

            this._setSubProcessType(oContext);
        },

        onSubProcessTypeLiveChange() {
            const oCreateModel = this.getView().getModel("create");

            oCreateModel.setProperty("/subProcessType_code", "");
            oCreateModel.setProperty("/loaApprovalApplicable", false);
            oCreateModel.setProperty("/isPaymentRequest", false);
            oCreateModel.setProperty("/amount", null);
            oCreateModel.setProperty("/role", "");
            this._setFtkFactoringMode(false);
        },

        onSubProcessTypeValueHelpSearch(oEvent) {
            this._filterSubProcessTypeDialog(oEvent.getSource(), oEvent.getParameter("value") || "");
        },

        async onSubProcessTypeValueHelpConfirm(oEvent) {
            const oContext = oEvent.getParameter("selectedItem")?.getBindingContext();

            if (!oContext) {
                return;
            }

            this._setSubProcessType(oContext);
            this.onSubProcessTypeValueHelpClose(oEvent);
        },

        onSubProcessTypeValueHelpClose(oEvent) {
            oEvent.getSource().getBinding("items")?.filter([]);
        },

        onCreateTeamValueHelpRequest() {
            this.byId("requestCreateTeamValueHelpDialog").open();
        },

        onCreateTeamSuggestionSelected(oEvent) {
            const oContext = this._getSuggestionContext(oEvent);

            if (!oContext) {
                return;
            }

            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/processorTeam_ID", oContext.getProperty("ID"));
            oCreateModel.setProperty("/processorTeamName", oContext.getProperty("name"));
        },

        onCreateTeamLiveChange() {
            this.getView().getModel("create").setProperty("/processorTeam_ID", "");
        },

        onCreateTeamValueHelpSearch(oEvent) {
            const sQuery = oEvent.getParameter("value") || "";
            const oBinding = oEvent.getSource().getBinding("items");

            if (!sQuery) {
                oBinding.filter([]);
                return;
            }

            oBinding.filter([
                new Filter({
                    filters: [
                        new Filter("teamCode", FilterOperator.Contains, sQuery),
                        new Filter("name", FilterOperator.Contains, sQuery),
                        new Filter("description", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                })
            ]);
        },

        onCreateTeamValueHelpConfirm(oEvent) {
            const oContext = oEvent.getParameter("selectedItem")?.getBindingContext();

            if (!oContext) {
                return;
            }

            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/processorTeam_ID", oContext.getProperty("ID"));
            oCreateModel.setProperty("/processorTeamName", oContext.getProperty("name"));
            this.onCreateTeamValueHelpClose(oEvent);
        },

        onCreateTeamValueHelpClose(oEvent) {
            oEvent.getSource().getBinding("items")?.filter([]);
        },

        onVendorValueHelpRequest() {
            this.byId("requestCreateVendorValueHelpDialog").open();
        },

        onVendorSuggest(oEvent) {
            this._filterSuggestionItems(oEvent, ["vendorCode", "vendorName", "vendorEmail"], [
                new Filter("isActive", FilterOperator.EQ, true)
            ]);
        },

        onVendorSuggestionSelected(oEvent) {
            const oContext = this._getSuggestionContext(oEvent);

            if (oContext) {
                this._setVendor(oContext);
            }
        },

        onVendorLiveChange() {
            const oCreateModel = this.getView().getModel("create");

            oCreateModel.setProperty("/vendor_ID", "");
            oCreateModel.setProperty("/vendorName", "");
        },

        onVendorValueHelpSearch(oEvent) {
            const sQuery = (oEvent.getParameter("value") || "").trim();
            const oBinding = oEvent.getSource().getBinding("items");
            const oActiveFilter = new Filter("isActive", FilterOperator.EQ, true);

            if (!sQuery) {
                oBinding.filter([oActiveFilter]);
                return;
            }

            oBinding.filter([
                oActiveFilter,
                new Filter({
                    filters: ["vendorCode", "vendorName", "vendorEmail"].map((sProperty) => new Filter({
                        path: sProperty,
                        operator: FilterOperator.Contains,
                        value1: sQuery,
                        caseSensitive: false
                    })),
                    and: false
                })
            ]);
        },

        // onVendorValueHelpConfirm(oEvent) {
        //     const oContext = oEvent.getParameter("selectedItem")?.getBindingContext();

        //     if (oContext) {
        //         this._setVendor(oContext);
        //     }

        //     this.onVendorValueHelpClose(oEvent);
        // },
        onVendorValueHelpConfirm(oEvent) {
            const oContext = oEvent.getParameter("selectedItem")?.getBindingContext();

            if (oContext) {
                if (this._sVendorHelpTarget === "authority") {
                    this._setAuthorityVendor(oContext);
                } else if (this._sVendorHelpTarget === "employee") {
                    this._setEmployeeVendor(oContext);
                } else {
                    this._setVendor(oContext);
                }
            }

            this._sVendorHelpTarget = null;
            this.onVendorValueHelpClose(oEvent);
        },
        onVendorValueHelpClose(oEvent) {
            oEvent.getSource().getBinding("items")?.filter([
                new Filter("isActive", FilterOperator.EQ, true)
            ]);
        },
        onAuthorityVendorSuggest(oEvent) {
            this._filterSuggestionItems(oEvent, ["vendorCode", "vendorName", "vendorEmail"], [
                new Filter("isActive", FilterOperator.EQ, true)
            ]);
        },
        onAuthorityVendorSuggestionSelected(oEvent) {
            const oContext = this._getSuggestionContext(oEvent);
            if (oContext) {
                this._setAuthorityVendor(oContext);
            }
        },
        onAuthorityVendorLiveChange() {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/authorityVendorName", "");
        },
        _setAuthorityVendor(oContext) {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/authorityVendorCode", oContext.getProperty("vendorCode"));
            oCreateModel.setProperty("/authorityVendorName", oContext.getProperty("vendorName"));
        },

        onEmployeeVendorSuggest(oEvent) {
            this._filterSuggestionItems(oEvent, ["vendorCode", "vendorName", "vendorEmail"], [
                new Filter("isActive", FilterOperator.EQ, true)
            ]);
        },
        onEmployeeVendorSuggestionSelected(oEvent) {
            const oContext = this._getSuggestionContext(oEvent);
            if (oContext) {
                this._setEmployeeVendor(oContext);
            }
        },
        onEmployeeVendorLiveChange() {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/employeeVendorName", "");
        },
        _setEmployeeVendor(oContext) {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/employeeVendorCode", oContext.getProperty("vendorCode"));
            oCreateModel.setProperty("/employeeVendorName", oContext.getProperty("vendorName"));
        },
        onAuthorityVendorValueHelpRequest() {
            this._sVendorHelpTarget = "authority";
            this.byId("requestCreateVendorValueHelpDialog").open();
        },
        onEmployeeVendorValueHelpRequest() {
            this._sVendorHelpTarget = "employee";
            this.byId("requestCreateVendorValueHelpDialog").open();
        },
        onCustomerValueHelpRequest() {
            this.byId("requestCreateCustomerValueHelpDialog").open();
        },

        onCustomerSuggest(oEvent) {
            this._filterSuggestionItems(oEvent, ["customerCode", "customerName", "customerEmail"], [
                new Filter("isActive", FilterOperator.EQ, true)
            ]);
        },

        onCustomerSuggestionSelected(oEvent) {
            const oContext = this._getSuggestionContext(oEvent);

            if (oContext) {
                this._setCustomer(oContext);
            }
        },

        onCustomerLiveChange() {
            const oCreateModel = this.getView().getModel("create");

            oCreateModel.setProperty("/customer_ID", "");
            oCreateModel.setProperty("/customerName", "");
        },

        onCustomerValueHelpSearch(oEvent) {
            const sQuery = (oEvent.getParameter("value") || "").trim();
            const oBinding = oEvent.getSource().getBinding("items");
            const oActiveFilter = new Filter("isActive", FilterOperator.EQ, true);

            if (!sQuery) {
                oBinding.filter([oActiveFilter]);
                return;
            }

            oBinding.filter([
                oActiveFilter,
                new Filter({
                    filters: ["customerCode", "customerName", "customerEmail"].map((sProperty) => new Filter({
                        path: sProperty,
                        operator: FilterOperator.Contains,
                        value1: sQuery,
                        caseSensitive: false
                    })),
                    and: false
                })
            ]);
        },

        onCustomerValueHelpConfirm(oEvent) {
            const oContext = oEvent.getParameter("selectedItem")?.getBindingContext();

            if (oContext) {
                this._setCustomer(oContext);
            }

            this.onCustomerValueHelpClose(oEvent);
        },

        onCustomerValueHelpClose(oEvent) {
            oEvent.getSource().getBinding("items")?.filter([
                new Filter("isActive", FilterOperator.EQ, true)
            ]);
        },

        _setCustomer(oContext) {
            const oCreateModel = this.getView().getModel("create");

            oCreateModel.setProperty("/customer_ID", oContext.getProperty("ID"));
            oCreateModel.setProperty("/customerCode", oContext.getProperty("customerCode"));
            oCreateModel.setProperty("/customerName", oContext.getProperty("customerName"));
        },
        _setSettlementPaymentRequest(oContext) {
            const oModel = this.getView().getModel("settlementEntryEdit");

            oModel.setProperty("/paymentRequestRef_ID", oContext.getProperty("ID"));
            oModel.setProperty("/paymentRequest", oContext.getProperty("referenceNumber") || "");
            oModel.setProperty("/poNumber", oContext.getProperty("poNumber") || "");
            oModel.setProperty("/sesReference", oContext.getProperty("sesReference") || "");
            oModel.setProperty("/invoiceNumber", oContext.getProperty("invoiceNumber") || "");
            oModel.setProperty("/invoiceDate", oContext.getProperty("invoiceDate") || null);
            oModel.setProperty("/description", oContext.getProperty("descriptionOfPayment") || "");
        },

        onSettlementPaymentRequestSuggest(oEvent) {
            const aFixedFilters = [
                new Filter("subProcessType_code", FilterOperator.EQ, "NON_PO_CC_PAYMENT")
            ];

            this._filterSuggestionItems(oEvent, ["referenceNumber", "title", "poNumber", "sesReference"], aFixedFilters);
        },

        onSettlementPaymentRequestSuggestionSelected(oEvent) {
            const oContext = this._getSuggestionContext(oEvent);

            if (oContext) {
                this._setSettlementPaymentRequest(oContext);
            }
        },

        onSettlementPaymentRequestLiveChange() {
            const oModel = this.getView().getModel("settlementEntryEdit");

            oModel.setProperty("/paymentRequestRef_ID", "");
            oModel.setProperty("/poNumber", "");
            oModel.setProperty("/sesReference", "");
            oModel.setProperty("/invoiceNumber", "");
            oModel.setProperty("/invoiceDate", null);
            oModel.setProperty("/description", "");
        },

        onSettlementPaymentRequestValueHelpRequest() {
            const oDialog = this.byId("settlementPaymentRequestValueHelpDialog");
            this._filterSettlementPaymentRequestDialog(oDialog, "");
            oDialog.open();
        },

        onSettlementPaymentRequestValueHelpSearch(oEvent) {
            this._filterSettlementPaymentRequestDialog(oEvent.getSource(), oEvent.getParameter("value") || "");
        },

        onSettlementPaymentRequestValueHelpConfirm(oEvent) {
            const oContext = oEvent.getParameter("selectedItem")?.getBindingContext();

            if (oContext) {
                this._setSettlementPaymentRequest(oContext);
            }

            this.onSettlementPaymentRequestValueHelpClose(oEvent);
        },

        onSettlementPaymentRequestValueHelpClose(oEvent) {
            this._filterSettlementPaymentRequestDialog(oEvent.getSource(), "");
        },

        _filterSettlementPaymentRequestDialog(oDialog, sQuery) {
            const oBinding = oDialog.getBinding("items");
            const aFilters = [
                new Filter("subProcessType_code", FilterOperator.EQ, "NON_PO_CC_PAYMENT")
            ];

            if (sQuery) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("referenceNumber", FilterOperator.Contains, sQuery),
                        new Filter("title", FilterOperator.Contains, sQuery),
                        new Filter("poNumber", FilterOperator.Contains, sQuery),
                        new Filter("sesReference", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                }));
            }

            oBinding.filter(aFilters);
        },
        onAddInvoice() {
            const oInvoiceModel = this.getView().getModel("invoiceEdit");

            oInvoiceModel.setData({
                dialogTitle: this.getText("addInvoiceTitle"),
                invoiceDate: null,
                invoiceNumber: "",
                amount: null,
                vatAmount: null,
                sesReference: "",
                remarks: ""
            });

            this.getView().byId("invoiceDialog").open();
        },

       

        onSaveInvoice() {
            const oInvoiceModel = this.getView().getModel("invoiceEdit");
            const oCreateModel = this.getView().getModel("create");

            const oInvoice = oInvoiceModel.getData();
            const bRequiresVatAndSes =
                oCreateModel.getProperty("/isPoBasedNonAdvance") ||
                oCreateModel.getProperty("/isPoAdvSettlement");

            const bMissingBasicFields =
                !oInvoice.invoiceDate ||
                !String(oInvoice.invoiceNumber || "").trim() ||
                oInvoice.amount === null ||
                oInvoice.amount === "" ||
                oInvoice.amount === undefined;

            const bMissingVatOrSes =
                bRequiresVatAndSes &&
                (
                    !String(oInvoice.sesReference || "").trim() ||
                    oInvoice.vatAmount === null ||
                    oInvoice.vatAmount === "" ||
                    oInvoice.vatAmount === undefined
                );

            if (bMissingBasicFields || bMissingVatOrSes) {
                MessageBox.warning(
                    this.getText(
                        bRequiresVatAndSes
                            ? "invoiceRequiredFieldsWithVatSesMessage"
                            : "invoiceRequiredFieldsMessage"
                    )
                );
                return;
            }

            const aInvoices = oCreateModel.getProperty("/invoices") || [];

            const oInvoiceData = {
                invoiceDate: oInvoice.invoiceDate,
                invoiceNumber: String(oInvoice.invoiceNumber).trim(),
                amount: Number(oInvoice.amount),
                vatAmount: bRequiresVatAndSes ? Number(oInvoice.vatAmount) : null,
                sesReference: bRequiresVatAndSes ? oInvoice.sesReference.trim() : "",
                remarks: oInvoice.remarks || "",
                subProcessType_code: oCreateModel.getProperty("/subProcessType_code")
            };

            if (oInvoice._editIndex !== undefined && oInvoice._editIndex !== null) {
                aInvoices[oInvoice._editIndex] = oInvoiceData;
            } else {
                aInvoices.push(oInvoiceData);
            }

            oCreateModel.setProperty("/invoices", aInvoices);

            this.getView().byId("invoiceDialog").close();
        },
        onCloseInvoiceDialog() {
            this.getView().byId("invoiceDialog").close();
        },
        onEditInvoice(oEvent) {
            const oCreateModel = this.getView().getModel("create");
            const oInvoiceModel = this.getView().getModel("invoiceEdit");

            const oContext = oEvent.getSource().getBindingContext("create");

            if (!oContext) {
                return;
            }

            const sPath = oContext.getPath();
            const iIndex = Number(sPath.split("/").pop());

            const aInvoices = oCreateModel.getProperty("/invoices") || [];
            const oInvoice = aInvoices[iIndex];

            if (!oInvoice) {
                return;
            }

            oInvoiceModel.setData({
                dialogTitle: this.getText("editInvoiceTitle"),
                invoiceDate: oInvoice.invoiceDate,
                invoiceNumber: oInvoice.invoiceNumber,
                amount: oInvoice.amount,
                vatAmount: oInvoice.vatAmount,
                sesReference: oInvoice.sesReference,
                remarks: oInvoice.remarks || "",

                _editIndex: iIndex
            });

            this.getView().byId("invoiceDialog").open();
        },
        onDeleteInvoice(oEvent) {
            const oCreateModel = this.getView().getModel("create");
            const oContext = oEvent.getSource().getBindingContext("create");

            if (!oContext) {
                return;
            }

            const sPath = oContext.getPath();
            const iIndex = Number(sPath.split("/").pop());

            const aInvoices = oCreateModel.getProperty("/invoices") || [];
            const oInvoice = aInvoices[iIndex];

            MessageBox.confirm(
                this.getText("deleteInvoiceConfirmation"),
                {
                    onClose: (sAction) => {
                        if (sAction === MessageBox.Action.OK) {
                            aInvoices.splice(iIndex, 1);
                            oCreateModel.setProperty("/invoices", aInvoices);
                        }
                    }
                }
            );
        },
        onCalculateDirectForeignTravelTotals() {
            const oModel = this.getView().getModel("directForeignTravelEdit");
            const oData = oModel.getData();

            const fPerDay = Number(oData.perDayAllowanceUSD) || 0;
            const iDays = Number(oData.noOfDays) || 0;
            const fTotalUSD = fPerDay * iDays;
            const fExchangeRate = Number(oData.exchangeRate) || 0;
            const fTotalLKR = fTotalUSD * fExchangeRate;
            const fAirfare = Number(oData.airfare) || 0;
            const fVisaFee = Number(oData.visaFee) || 0;
            const fTotalForeign = fAirfare + fVisaFee + fTotalUSD;

            oModel.setProperty("/totalInUSD", fTotalUSD);
            oModel.setProperty("/totalInLKR", fTotalLKR);
            oModel.setProperty("/totalCostForeignCurrency", fTotalForeign);
            oModel.setProperty("/totalCostLKR", fTotalForeign * fExchangeRate);
        },
        onAddDirectForeignTravelEntry() {
            const oModel = this.getView().getModel("directForeignTravelEdit");

            oModel.setData({
                dialogTitle: this.getText("addDirectForeignTravelEntryTitle"),
                travelerName: "",
                category: "",
                vendorCode: "",
                ctmProposalNo: "",
                purposeOfTravel: "",
                venue: "",
                departureDateTime: null,
                arrivalDateTime: null,
                budgetCode: "",
                currency_code: "",
                airfare: null,
                visaFee: null,
                perDayAllowanceUSD: null,
                noOfDays: null,
                totalInUSD: null,
                exchangeRate: null,
                totalInLKR: null,
                totalCostForeignCurrency: null,
                totalCostLKR: null,
                confirmedTravelItinerary: "",
                selectedScheme: "",
                personalTravelInvolved: false,
                periodOfPersonalTravel: "",
                specialRemarks: ""
            });

            this.getView().byId("directForeignTravelDialog").open();
        },

        onSaveDirectForeignTravelEntry() {
            const oModel = this.getView().getModel("directForeignTravelEdit");
            const oCreateModel = this.getView().getModel("create");
            const oEntry = oModel.getData();

            if (
                !String(oEntry.travelerName || "").trim() ||
                !String(oEntry.vendorCode || "").trim() ||
                !String(oEntry.ctmProposalNo || "").trim() ||
                !String(oEntry.purposeOfTravel || "").trim() ||
                !oEntry.currency_code ||
                oEntry.perDayAllowanceUSD === null ||
                oEntry.perDayAllowanceUSD === "" ||
                oEntry.perDayAllowanceUSD === undefined ||
                oEntry.noOfDays === null ||
                oEntry.noOfDays === "" ||
                oEntry.noOfDays === undefined
            ) {
                MessageBox.warning(this.getText("directForeignTravelEntryRequiredFieldsMessage"));
                return;
            }

            const aEntries = oCreateModel.getProperty("/directForeignTravelEntries") || [];

            const oEntryData = {
                travelerName: String(oEntry.travelerName).trim(),
                category: oEntry.category || "",
                vendorCode: String(oEntry.vendorCode).trim(),
                ctmProposalNo: String(oEntry.ctmProposalNo).trim(),
                purposeOfTravel: String(oEntry.purposeOfTravel).trim(),
                venue: oEntry.venue || "",
                departureDateTime: oEntry.departureDateTime,
                arrivalDateTime: oEntry.arrivalDateTime,
                budgetCode: oEntry.budgetCode || "",
                currency_code: oEntry.currency_code,
                airfare: oEntry.airfare !== null && oEntry.airfare !== "" ? Number(oEntry.airfare) : null,
                visaFee: oEntry.visaFee !== null && oEntry.visaFee !== "" ? Number(oEntry.visaFee) : null,
                perDayAllowanceUSD: Number(oEntry.perDayAllowanceUSD),
                noOfDays: Number(oEntry.noOfDays),
                totalInUSD: oEntry.totalInUSD !== null && oEntry.totalInUSD !== "" ? Number(oEntry.totalInUSD) : null,
                exchangeRate: oEntry.exchangeRate !== null && oEntry.exchangeRate !== "" ? Number(oEntry.exchangeRate) : null,
                totalInLKR: oEntry.totalInLKR !== null && oEntry.totalInLKR !== "" ? Number(oEntry.totalInLKR) : null,
                totalCostForeignCurrency: oEntry.totalCostForeignCurrency !== null && oEntry.totalCostForeignCurrency !== "" ? Number(oEntry.totalCostForeignCurrency) : null,
                totalCostLKR: oEntry.totalCostLKR !== null && oEntry.totalCostLKR !== "" ? Number(oEntry.totalCostLKR) : null,
                confirmedTravelItinerary: oEntry.confirmedTravelItinerary || "",
                selectedScheme: oEntry.selectedScheme || "",
                personalTravelInvolved: Boolean(oEntry.personalTravelInvolved),
                periodOfPersonalTravel: oEntry.periodOfPersonalTravel || "",
                specialRemarks: oEntry.specialRemarks || ""
            };

            if (oEntry._editIndex !== undefined && oEntry._editIndex !== null) {
                aEntries[oEntry._editIndex] = oEntryData;
            } else {
                aEntries.push(oEntryData);
            }

            oCreateModel.setProperty("/directForeignTravelEntries", aEntries);
            this.getView().byId("directForeignTravelDialog").close();
        },

        onCloseDirectForeignTravelDialog() {
            this.getView().byId("directForeignTravelDialog").close();
        },

        onEditDirectForeignTravelEntry(oEvent) {
            const oCreateModel = this.getView().getModel("create");
            const oModel = this.getView().getModel("directForeignTravelEdit");
            const oContext = oEvent.getSource().getBindingContext("create");

            if (!oContext) {
                return;
            }

            const sPath = oContext.getPath();
            const iIndex = Number(sPath.split("/").pop());

            const aEntries = oCreateModel.getProperty("/directForeignTravelEntries") || [];
            const oEntry = aEntries[iIndex];

            if (!oEntry) {
                return;
            }

            oModel.setData({
                dialogTitle: this.getText("editDirectForeignTravelEntryTitle"),
                ...oEntry,
                _editIndex: iIndex
            });

            this.getView().byId("directForeignTravelDialog").open();
        },

        onDeleteDirectForeignTravelEntry(oEvent) {
            const oCreateModel = this.getView().getModel("create");
            const oContext = oEvent.getSource().getBindingContext("create");

            if (!oContext) {
                return;
            }

            const sPath = oContext.getPath();
            const iIndex = Number(sPath.split("/").pop());

            MessageBox.confirm(
                this.getText("deleteDirectForeignTravelEntryConfirmation"),
                {
                    onClose: (sAction) => {
                        if (sAction === MessageBox.Action.OK) {
                            const aEntries = oCreateModel.getProperty("/directForeignTravelEntries") || [];
                            aEntries.splice(iIndex, 1);
                            oCreateModel.setProperty("/directForeignTravelEntries", aEntries);
                        }
                    }
                }
            );
        },
        onAddTravelExpense() {
            const oExpenseModel = this.getView().getModel("travelExpenseEdit");

            oExpenseModel.setData({
                dialogTitle: this.getText("addTravelExpenseTitle"),
                date: null,
                particulars: "",
                transport: null,
                hotel: null,
                meals: null,
                entertainment: null,
                laundry: null,
                phone: null,
                sundry: null,
                miscellaneous: null,
                total: null
            });

            this.getView().byId("travelExpenseDialog").open();
        },

        onCalculateTravelExpenseTotal() {
            const oExpenseModel = this.getView().getModel("travelExpenseEdit");
            const oData = oExpenseModel.getData();

            const fTotal = [
                "transport", "hotel", "meals", "entertainment",
                "laundry", "phone", "sundry", "miscellaneous"
            ].reduce((fSum, sField) => fSum + (Number(oData[sField]) || 0), 0);

            oExpenseModel.setProperty("/total", fTotal);
        },

        onSaveTravelExpense() {
            const oExpenseModel = this.getView().getModel("travelExpenseEdit");
            const oCreateModel = this.getView().getModel("create");
            const oExpense = oExpenseModel.getData();

            if (!oExpense.date || !String(oExpense.particulars || "").trim()) {
                MessageBox.warning(this.getText("travelExpenseRequiredFieldsMessage"));
                return;
            }

            const aExpenses = oCreateModel.getProperty("/travelExpenses") || [];

            const oExpenseData = {
                date: oExpense.date,
                particulars: String(oExpense.particulars).trim(),
                transport: Number(oExpense.transport) || 0,
                hotel: Number(oExpense.hotel) || 0,
                meals: Number(oExpense.meals) || 0,
                entertainment: Number(oExpense.entertainment) || 0,
                laundry: Number(oExpense.laundry) || 0,
                phone: Number(oExpense.phone) || 0,
                sundry: Number(oExpense.sundry) || 0,
                miscellaneous: Number(oExpense.miscellaneous) || 0,
                total: Number(oExpense.total)
            };

            if (oExpense._editIndex !== undefined && oExpense._editIndex !== null) {
                aExpenses[oExpense._editIndex] = oExpenseData;
            } else {
                aExpenses.push(oExpenseData);
            }

            oCreateModel.setProperty("/travelExpenses", aExpenses);
            this.getView().byId("travelExpenseDialog").close();
        },

        onCloseTravelExpenseDialog() {
            this.getView().byId("travelExpenseDialog").close();
        },

        onEditTravelExpense(oEvent) {
            const oCreateModel = this.getView().getModel("create");
            const oExpenseModel = this.getView().getModel("travelExpenseEdit");
            const oContext = oEvent.getSource().getBindingContext("create");

            if (!oContext) {
                return;
            }

            const sPath = oContext.getPath();
            const iIndex = Number(sPath.split("/").pop());

            const aExpenses = oCreateModel.getProperty("/travelExpenses") || [];
            const oExpense = aExpenses[iIndex];

            if (!oExpense) {
                return;
            }

            oExpenseModel.setData({
                dialogTitle: this.getText("editTravelExpenseTitle"),
                ...oExpense,
                _editIndex: iIndex
            });

            this.getView().byId("travelExpenseDialog").open();
        },

        onDeleteTravelExpense(oEvent) {
            const oCreateModel = this.getView().getModel("create");
            const oContext = oEvent.getSource().getBindingContext("create");

            if (!oContext) {
                return;
            }

            const sPath = oContext.getPath();
            const iIndex = Number(sPath.split("/").pop());

            MessageBox.confirm(
                this.getText("deleteTravelExpenseConfirmation"),
                {
                    onClose: (sAction) => {
                        if (sAction === MessageBox.Action.OK) {
                            const aExpenses = oCreateModel.getProperty("/travelExpenses") || [];
                            aExpenses.splice(iIndex, 1);
                            oCreateModel.setProperty("/travelExpenses", aExpenses);
                        }
                    }
                }
            );
        },
        onAddGLBreakup() {
            const oGLModel = this.getView().getModel("glBreakupEdit");

            oGLModel.setData({
                dialogTitle: this.getText("addGLBreakupTitle"),
                glAccount: "",
                relevantDescription: "",
                relevantAmount: null,
                costCentre: "",
                profitCentre: ""
            });

            this.getView().byId("glBreakupDialog").open();
        },

        onSaveGLBreakup() {
            const oGLModel = this.getView().getModel("glBreakupEdit");
            const oCreateModel = this.getView().getModel("create");
            const oGL = oGLModel.getData();

            if (
                !String(oGL.glAccount || "").trim() ||
                !String(oGL.relevantDescription || "").trim() ||
                !String(oGL.costCentre || "").trim() ||
                oGL.relevantAmount === null ||
                oGL.relevantAmount === "" ||
                oGL.relevantAmount === undefined
            ) {
                MessageBox.warning(this.getText("glBreakupRequiredFieldsMessage"));
                return;
            }

            const aBreakups = oCreateModel.getProperty("/glBreakups") || [];

            const oGLData = {
                glAccount: String(oGL.glAccount).trim(),
                relevantDescription: String(oGL.relevantDescription).trim(),
                relevantAmount: Number(oGL.relevantAmount),
                costCentre: String(oGL.costCentre).trim(),
                profitCentre: oGL.profitCentre ? String(oGL.profitCentre).trim() : ""
            };

            if (oGL._editIndex !== undefined && oGL._editIndex !== null) {
                aBreakups[oGL._editIndex] = oGLData;
            } else {
                aBreakups.push(oGLData);
            }

            oCreateModel.setProperty("/glBreakups", aBreakups);
            this.getView().byId("glBreakupDialog").close();
        },

        onCloseGLBreakupDialog() {
            this.getView().byId("glBreakupDialog").close();
        },

        onEditGLBreakup(oEvent) {
            const oCreateModel = this.getView().getModel("create");
            const oGLModel = this.getView().getModel("glBreakupEdit");
            const oContext = oEvent.getSource().getBindingContext("create");

            if (!oContext) {
                return;
            }

            const sPath = oContext.getPath();
            const iIndex = Number(sPath.split("/").pop());

            const aBreakups = oCreateModel.getProperty("/glBreakups") || [];
            const oGL = aBreakups[iIndex];

            if (!oGL) {
                return;
            }

            oGLModel.setData({
                dialogTitle: this.getText("editGLBreakupTitle"),
                ...oGL,
                _editIndex: iIndex
            });

            this.getView().byId("glBreakupDialog").open();
        },

        onDeleteGLBreakup(oEvent) {
            const oCreateModel = this.getView().getModel("create");
            const oContext = oEvent.getSource().getBindingContext("create");

            if (!oContext) {
                return;
            }

            const sPath = oContext.getPath();
            const iIndex = Number(sPath.split("/").pop());

            MessageBox.confirm(
                this.getText("deleteGLBreakupConfirmation"),
                {
                    onClose: (sAction) => {
                        if (sAction === MessageBox.Action.OK) {
                            const aBreakups = oCreateModel.getProperty("/glBreakups") || [];
                            aBreakups.splice(iIndex, 1);
                            oCreateModel.setProperty("/glBreakups", aBreakups);
                        }
                    }
                }
            );
        },
        onAddSettlementEntry() {
            const oModel = this.getView().getModel("settlementEntryEdit");

            oModel.setData({
                dialogTitle: this.getText("addSettlementEntryTitle"),
                paymentRequestRef_ID: "",
                paymentRequest: "",
                poNumber: "",
                sesReference: "",
                invoiceNumber: "",
                invoiceDate: null,
                description: "",
                transactionAmountUSD: null,
                paymentAmountLKR: null,
                availabilityOfInvoice: false
            });

            this.getView().byId("settlementEntryDialog").open();
        },

        onSaveSettlementEntry() {
            const oModel = this.getView().getModel("settlementEntryEdit");
            const oCreateModel = this.getView().getModel("create");
            const oEntry = oModel.getData();

            if (
                !oEntry.paymentRequestRef_ID ||
                !String(oEntry.paymentRequest || "").trim() ||
                oEntry.transactionAmountUSD === null ||
                oEntry.transactionAmountUSD === "" ||
                oEntry.transactionAmountUSD === undefined ||
                oEntry.paymentAmountLKR === null ||
                oEntry.paymentAmountLKR === "" ||
                oEntry.paymentAmountLKR === undefined
            ) {
                MessageBox.warning(this.getText("settlementEntryRequiredFieldsMessage"));
                return;
            }

            const aEntries = oCreateModel.getProperty("/settlementEntries") || [];

            const oEntryData = {
                paymentRequestRef_ID: oEntry.paymentRequestRef_ID,
                paymentRequest: String(oEntry.paymentRequest).trim(),
                poNumber: oEntry.poNumber || "",
                sesReference: oEntry.sesReference || "",
                invoiceNumber: oEntry.invoiceNumber || "",
                invoiceDate: oEntry.invoiceDate,
                description: String(oEntry.description).trim(),
                transactionAmountUSD: Number(oEntry.transactionAmountUSD),
                paymentAmountLKR: Number(oEntry.paymentAmountLKR),
                availabilityOfInvoice: Boolean(oEntry.availabilityOfInvoice)
            };

            if (oEntry._editIndex !== undefined && oEntry._editIndex !== null) {
                aEntries[oEntry._editIndex] = oEntryData;
            } else {
                aEntries.push(oEntryData);
            }

            oCreateModel.setProperty("/settlementEntries", aEntries);
            this.getView().byId("settlementEntryDialog").close();
        },

        onCloseSettlementEntryDialog() {
            this.getView().byId("settlementEntryDialog").close();
        },

        onEditSettlementEntry(oEvent) {
            const oCreateModel = this.getView().getModel("create");
            const oModel = this.getView().getModel("settlementEntryEdit");
            const oContext = oEvent.getSource().getBindingContext("create");

            if (!oContext) {
                return;
            }

            const sPath = oContext.getPath();
            const iIndex = Number(sPath.split("/").pop());

            const aEntries = oCreateModel.getProperty("/settlementEntries") || [];
            const oEntry = aEntries[iIndex];

            if (!oEntry) {
                return;
            }

            oModel.setData({
                dialogTitle: this.getText("editSettlementEntryTitle"),
                ...oEntry,
                _editIndex: iIndex
            });

            this.getView().byId("settlementEntryDialog").open();
        },

        onDeleteSettlementEntry(oEvent) {
            const oCreateModel = this.getView().getModel("create");
            const oContext = oEvent.getSource().getBindingContext("create");

            if (!oContext) {
                return;
            }

            const sPath = oContext.getPath();
            const iIndex = Number(sPath.split("/").pop());

            MessageBox.confirm(
                this.getText("deleteSettlementEntryConfirmation"),
                {
                    onClose: (sAction) => {
                        if (sAction === MessageBox.Action.OK) {
                            const aEntries = oCreateModel.getProperty("/settlementEntries") || [];
                            aEntries.splice(iIndex, 1);
                            oCreateModel.setProperty("/settlementEntries", aEntries);
                        }
                    }
                }
            );
        },
        onAddMerchantEntityValue() {
            const oModel = this.getView().getModel("merchantEntityValueEdit");

            oModel.setData({
                dialogTitle: this.getText("addMerchantEntityValueTitle"),
                businessEntity_code: "",
                totalPayableValue: null
            });

            this.getView().byId("merchantEntityValueDialog").open();
        },

        onSaveMerchantEntityValue() {
            const oModel = this.getView().getModel("merchantEntityValueEdit");
            const oCreateModel = this.getView().getModel("create");
            const oEntry = oModel.getData();

            if (
                !String(oEntry.businessEntity_code || "").trim() ||
                oEntry.totalPayableValue === null ||
                oEntry.totalPayableValue === "" ||
                oEntry.totalPayableValue === undefined
            ) {
                MessageBox.warning(this.getText("merchantEntityValueRequiredFieldsMessage"));
                return;
            }

            const aValues = oCreateModel.getProperty("/merchantEntityValues") || [];

            const oEntryData = {
                businessEntity_code: oEntry.businessEntity_code,
                totalPayableValue: Number(oEntry.totalPayableValue)
            };

            if (oEntry._editIndex !== undefined && oEntry._editIndex !== null) {
                aValues[oEntry._editIndex] = oEntryData;
            } else {
                aValues.push(oEntryData);
            }

            oCreateModel.setProperty("/merchantEntityValues", aValues);
            this.getView().byId("merchantEntityValueDialog").close();
        },

        onCloseMerchantEntityValueDialog() {
            this.getView().byId("merchantEntityValueDialog").close();
        },

        onEditMerchantEntityValue(oEvent) {
            const oCreateModel = this.getView().getModel("create");
            const oModel = this.getView().getModel("merchantEntityValueEdit");
            const oContext = oEvent.getSource().getBindingContext("create");

            if (!oContext) {
                return;
            }

            const sPath = oContext.getPath();
            const iIndex = Number(sPath.split("/").pop());

            const aValues = oCreateModel.getProperty("/merchantEntityValues") || [];
            const oEntry = aValues[iIndex];

            if (!oEntry) {
                return;
            }

            oModel.setData({
                dialogTitle: this.getText("editMerchantEntityValueTitle"),
                ...oEntry,
                _editIndex: iIndex
            });

            this.getView().byId("merchantEntityValueDialog").open();
        },

        onDeleteMerchantEntityValue(oEvent) {
            const oCreateModel = this.getView().getModel("create");
            const oContext = oEvent.getSource().getBindingContext("create");

            if (!oContext) {
                return;
            }

            const sPath = oContext.getPath();
            const iIndex = Number(sPath.split("/").pop());

            MessageBox.confirm(
                this.getText("deleteMerchantEntityValueConfirmation"),
                {
                    onClose: (sAction) => {
                        if (sAction === MessageBox.Action.OK) {
                            const aValues = oCreateModel.getProperty("/merchantEntityValues") || [];
                            aValues.splice(iIndex, 1);
                            oCreateModel.setProperty("/merchantEntityValues", aValues);
                        }
                    }
                }
            );
        },
        _filterSubProcessTypeDialog(oDialog, sQuery) {
            const sProcessTypeCode = this.getView().getModel("create").getProperty("/processType_code");
            const oBinding = oDialog.getBinding("items");
            const aFilters = [
                new Filter("isActive", FilterOperator.EQ, true),
                new Filter("processType_code", FilterOperator.EQ, sProcessTypeCode)
            ];

            if (sQuery) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("code", FilterOperator.Contains, sQuery),
                        new Filter("name", FilterOperator.Contains, sQuery),
                        new Filter("descr", FilterOperator.Contains, sQuery),
                        new Filter("processOwner", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                }));
            }

            oBinding.filter(aFilters);
        },

        _setPredecessor(oContext) {
            const oCreateModel = this.getView().getModel("create");
            const sReferenceNumber = oContext.getProperty("referenceNumber") || "";
            const sTitle = oContext.getProperty("title") || "";

            oCreateModel.setProperty("/predecessor_ID", oContext.getProperty("ID"));
            oCreateModel.setProperty("/predecessorReferenceNumber", sReferenceNumber);
            oCreateModel.setProperty("/predecessorTitle", sTitle);
            oCreateModel.setProperty("/predecessorDisplay", [sReferenceNumber, sTitle].filter(Boolean).join(" - "));
        },

        _setSubProcessType(oContext) {
            const oCreateModel = this.getView().getModel("create");
            const sCode = oContext.getProperty("code");
            const bCodeChanged = this._sActiveSubProcessTypeCode !== sCode;
            oCreateModel.setProperty("/subProcessType_code", sCode);
            oCreateModel.setProperty("/subProcessTypeName", oContext.getProperty("name"));
            const bLoaApplicable = Boolean(oContext.getProperty("loaApprovalApplicable"));
            oCreateModel.setProperty("/loaApprovalApplicable", bLoaApplicable);
            oCreateModel.setProperty("/isPaymentRequest", bLoaApplicable);

            if (!bLoaApplicable) {
                oCreateModel.setProperty("/amount", null);
                oCreateModel.setProperty("/role", "");
            }

            this._setFtkFactoringMode(this._isFtkFactoringSubtype(sCode));
            this._setFtkNonFactoringMode(this._isFtkNonFactoringSubtype(sCode));
            this._setFtkServicePaymentMode(this._isFtkServicePaymentSubtype(sCode));
            this._setFtkDutyReimbursementMode(this._isFtkDutyReimbursementSubtype(sCode));
            this._setPoBasedNonAdvanceMode(this._isPoBasedNonAdvanceSubtype(sCode), bCodeChanged);
            this._setPoAdvanceMode(this._isPoAdvanceSubtype(sCode), bCodeChanged);
            this._setPoAdvSettlementMode(this._isPoAdvSettlementSubtype(sCode), bCodeChanged);
            this._setOfnAuthorityMode(this._isOfnAuthoritySubtype(sCode), bCodeChanged);
            this._setNonPoDirectForeignTravelMode(this._isNonPoDirectForeignTravelSubtype(sCode));
            this._setNonPoFuelMode(this._isNonPoFuelSubtype(sCode), bCodeChanged);
            this._setNonPoIdeaMartAppMakerMode(this._isNonPoIdeaMartAppMakerSubtype(sCode), bCodeChanged);
            this._setNonPoCustomerRefundsMode(this._isNonPoCustomerRefundsSubtype(sCode));
            this._setNonPoStelacomConsignmentMode(this._isNonPoStelacomConsignmentSubtype(sCode));
            this._setNonPoSiteShareLiabilityMode(this._isNonPoSiteShareLiabilitySubtype(sCode));
            this._setNonPoSiteSharingMode(this._isNonPoSiteSharingSubtype(sCode), bCodeChanged);
            this._setNonPoSiteRentTaxInvoiceMode(this._isNonPoSiteRentTaxInvoiceSubtype(sCode));
            this._setNonPoSiteRentMonthlyFileMode(this._isNonPoSiteRentMonthlyFileSubtype(sCode));
            this._setNonPoSiteRentStampAdhocMode(this._isNonPoSiteRentStampAdhocSubtype(sCode));
            this._setDirectNonPoReimbursementMode(this._isDirectNonPoReimbursementSubtype(sCode), bCodeChanged);
            this._setDirectForeignTravelReimbMode(this._isDirectForeignTravelReimbSubtype(sCode));
            this._setNonPoTaxLiabilityMode(this._isNonPoTaxLiabilitySubtype(sCode), bCodeChanged);
            this._setNonPoInterconnectLiabMode(this._isNonPoInterconnectLiabSubtype(sCode));
            this._setNonPoInterconnectRoamPayMode(this._isNonPoInterconnectRoamPaySubtype(sCode));
            this._setNonPoRoamingLiabilityMode(this._isNonPoRoamingLiabilitySubtype(sCode));
            this._setNonPoStarPointPaymentsMode(this._isNonPoStarPointPaymentsSubtype(sCode));
            this._setNonPoImportTrcMode(this._isNonPoImportTrcSubtype(sCode));
            this._setNonPoImportIclMode(this._isNonPoImportIclSubtype(sCode));
            this._setNonPoImportDgcMode(this._isNonPoImportDgcSubtype(sCode), bCodeChanged);
            this._setNonPoCcPaymentMode(this._isNonPoCcPaymentSubtype(sCode));
            this._setNonPoCcSettlementMode(this._isNonPoCcSettlementSubtype(sCode));
            this._setNonPoMerchantSettlementsMode(this._isNonPoMerchantSettlementsSubtype(sCode));
            this._setNonPoMiscReceiptsMode(this._isNonPoMiscReceiptsSubtype(sCode));
            this._setPoZeroIvMode(this._isPoZeroIvSubtype(sCode));
            this._setBankGuaranteeMode(this._isBankGuaranteeSubtype(sCode));

            oCreateModel.setProperty("/isFtkPoValidation", sCode === "FTK_FACTORING_PO_VALIDATION");
            this._setFtkBasedOnUacMode(sCode === "FTK_FACTORING_BASED_ON_UAC");
            this._sActiveSubProcessTypeCode = sCode;
            if (sCode === "FTK_DUTY_REIMBURSEMENT" || sCode === "NON_PO_IMPORT_TRC" || sCode === "NON_PO_IMPORT_ICL"
                || sCode === "NON_PO_FUEL_GENERATOR" ||
                sCode === "NON_PO_FUEL_STAFF" || sCode === "NON_PO_TAX_LIAB_PAY_OTTP" ||
                sCode === "NON_PO_TAX_LIAB_PAY_PAYORDER"
            ) {
                oCreateModel.setProperty("/currency_code", "LKR");
            }
            if (
                sCode === "NON_PO_IDEAMART" ||
                sCode === "NON_PO_APPMAKER" ||
                sCode === "NON_PO_CUSTOMER_REFUNDS" ||
                sCode === "NON_PO_MISC_RECEIPTS" ||
                sCode === "NON_PO_STAR_POINT_PAYMENTS" ||
                sCode === "PO_ZERO_IV" 

            ) {
                oCreateModel.setProperty("/currency_code", "USD");
            }
            if(
                sCode === "DIRECT_NON_PO_REIMB_PAYMENT" || sCode === "DIRECT_NON_PO_REIMB_LIAB"
            ){
                oCreateModel.setProperty("/paymentCategory_code", "LOCAL")
            }
        },

        _isFtkFactoringSubtype(sCode) {
            return [
                "FTK_FACTORING_PO_VALIDATION",
                "FTK_FACTORING_BASED_ON_UAC"
            ].includes(sCode);
        },
        _isFtkNonFactoringSubtype(sCode) {
            return sCode === "FTK_NON_FACTORING_BASED_UAC";
        },
        _isFtkServicePaymentSubtype(sCode) {
            return sCode === "FTK_SERVICE_PAYMENT";
        },
        _isFtkDutyReimbursementSubtype(sCode) {
            return sCode === "FTK_DUTY_REIMBURSEMENT";
        },
        _isPoBasedNonAdvanceSubtype(sCode) {
            return [
                "PO_BEFORE_INVOICE_NON_ADV",
                "PO_BEFORE_INVOICE_NON_ADV_LIAB",
                "PO_AFTER_INVOICE_NON_ADV",
                "PO_AFTER_INVOICE_NON_ADV_LIAB"
            ].includes(sCode);
        },
        _isPoAdvSettlementSubtype(sCode) {
            return [
                "PO_BEFORE_INVOICE_ADV_STLMT",
                "PO_BEFORE_INVOICE_ADV_STLMT_100%",
                "PO_AFTER_INVOICE_ADV_STLMT",
                "PO_AFTER_INVOICE_ADV_STLMT_100%"
            ].includes(sCode);
        },
        _isPoAdvanceSubtype(sCode) {
            return [
                "PO_BEFORE_INVOICE_ADVANCE",
                "PO_AFTER_INVOICE_ADVANCE"
            ].includes(sCode);
        },
        _isOfnAuthoritySubtype(sCode) {
            return [
                "NON_PO_DIRECT_OFN_AUTHORITY",
                "NON_PO_ADV_SETTLE_OFN_OTHER"
            ].includes(sCode);
        },
        _isNonPoDirectForeignTravelSubtype(sCode) {
            return sCode === "NON_PO_DIRECT_FOREIGN_TRAVEL";
        },
        _isNonPoFuelSubtype(sCode) {
            return [
                "NON_PO_FUEL_STAFF",
                "NON_PO_FUEL_GENERATOR"
            ].includes(sCode);

        },
        _isNonPoIdeaMartAppMakerSubtype(sCode) {
            return [
                "NON_PO_IDEAMART",
                "NON_PO_APPMAKER"
            ].includes(sCode);
        },
        _isNonPoCustomerRefundsSubtype(sCode) {
            return sCode === "NON_PO_CUSTOMER_REFUNDS";
        },
        _isNonPoStelacomConsignmentSubtype(sCode) {
            return sCode === "NON_PO_STELACOM_CONSIGNMENT";
        },
        _isNonPoSiteShareLiabilitySubtype(sCode) {
            return sCode === "NON_PO_SITE_SHARE_LIABILITY";
        },
        _isNonPoSiteSharingSubtype(sCode) {
            return [
                "NON_PO_SITE_SHARING_SETOFF",
                "NON_PO_SITE_SHARING_SETOFF&PAY"
            ].includes(sCode);
        },
        _isNonPoSiteRentTaxInvoiceSubtype(sCode) {
            return sCode === "NON_PO_SITE_RENT_TAX_INVOICE";
        },
        _isNonPoSiteRentMonthlyFileSubtype(sCode) {
            return sCode === "NON_PO_SITE_RENT_MONTHLY_FILE";
        },
        _isNonPoSiteRentStampAdhocSubtype(sCode) {
            return sCode === "NON_PO_SITE_RENT_STAMP_ADHOC";
        },
        _isDirectNonPoReimbursementSubtype(sCode) {
            return [
                "DIRECT_NON_PO_REIMB_LIAB",
                "DIRECT_NON_PO_REIMB_PAYMENT"
            ].includes(sCode);
        },
        _isDirectForeignTravelReimbSubtype(sCode) {
            return sCode === "DIRECT_FOREIGN_TRAVEL_REIMB";
        },
        _isNonPoTaxLiabilitySubtype(sCode) {
            return [
                "NON_PO_TAX_LIAB_PAY_OTTP",
                "NON_PO_TAX_LIAB_PAY_PAYORDER"
            ].includes(sCode);
        },
        _isNonPoInterconnectLiabSubtype(sCode) {
            return sCode === "NON_PO_INTERCONNECT_LIAB";
        },
        _isNonPoInterconnectRoamPaySubtype(sCode) {
            return sCode === "NON_PO_INTERCONNECT_ROAM_PAY";
        },
        _isNonPoRoamingLiabilitySubtype(sCode) {
            return sCode === "NON_PO_ROAMING_LIABILITY";
        },
        _isNonPoStarPointPaymentsSubtype(sCode) {
            return sCode === "NON_PO_STAR_POINT_PAYMENTS";
        },
        _isNonPoImportTrcSubtype(sCode) {
            return sCode === "NON_PO_IMPORT_TRC";
        },
        _isNonPoImportIclSubtype(sCode) {
            return sCode === "NON_PO_IMPORT_ICL";
        },
        _isNonPoImportDgcSubtype(sCode) {
            return [
                "NON_PO_IMPORT_DGC_ADV",
                "NON_PO_IMPORT_DGC_DIRECT"
            ].includes(sCode);
        },
        _isNonPoCcPaymentSubtype(sCode) {
            return sCode === "NON_PO_CC_PAYMENT";
        },
        _isNonPoCcSettlementSubtype(sCode) {
            return sCode === "NON_PO_CC_SETTLEMENT";
        },
        _isNonPoMerchantSettlementsSubtype(sCode) {
            return sCode === "NON_PO_MERCHANT_SETTLEMENTS";
        },
        _isNonPoMiscReceiptsSubtype(sCode) {
            return sCode === "NON_PO_MISC_RECEIPTS";
        },
        _isPoZeroIvSubtype(sCode) {
            return sCode === "PO_ZERO_IV";
        },
        _isBankGuaranteeSubtype(sCode) {
            return sCode === "BANK_GUARANTEE";
        },

        _setFtkFactoringMode(bEnabled) {
            const oCreateModel = this.getView().getModel("create");

            oCreateModel.setProperty("/isFtkFactoring", bEnabled);

            if (!bEnabled) {
                oCreateModel.setProperty("/isFtkPoValidation", false);
                [
                    "paymentCategory_code",
                    "businessEntity_code",
                    "vendor_ID",
                    "vendorCode",
                    "vendorName",
                    "remarks"
                ].forEach((sProperty) => oCreateModel.setProperty(`/${sProperty}`, ""));
            }
        },
        _setFtkBasedOnUacMode(bEnabled) {
            const oCreateModel = this.getView().getModel("create");

            oCreateModel.setProperty("/isFtkBasedOnUac", bEnabled);

            if (!bEnabled) {
                [
                    "currency_code",
                    "category_code"
                ].forEach((sProperty) => {
                    oCreateModel.setProperty(`/${sProperty}`, "");
                });
            }
        },
        _setFtkNonFactoringMode(bEnabled) {
            const oCreateModel = this.getView().getModel("create");

            oCreateModel.setProperty("/isFtkNonFactoring", bEnabled);
            if (!bEnabled) {
                [
                    "paymentCategory_code",
                    "businessEntity_code",
                    "currency_code",
                    "category_code",
                    "vendor_ID",
                    "vendorCode",
                    "vendorName",
                    "remarks"
                ].forEach((sProperty) => {
                    oCreateModel.setProperty(`/${sProperty}`, "");
                });
            }
        },
        _setFtkServicePaymentMode(bEnabled) {
            const oCreateModel = this.getView().getModel("create");

            oCreateModel.setProperty("/isFtkServicePayment", bEnabled);
            if (!bEnabled) {
                [
                    "paymentCategory_code",
                    "businessEntity_code",
                    "currency_code",
                    "vendor_ID",
                    "vendorCode",
                    "vendorName",
                    "remarks"
                ].forEach((sProperty) => {
                    oCreateModel.setProperty(`/${sProperty}`, "");
                });
            }
        },
        _setFtkDutyReimbursementMode(bEnabled) {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/isFtkDutyReimbursement", bEnabled);
            if (bEnabled) {
                oCreateModel.setProperty("/currency_code", "LKR");
            }
            else {
                [
                    "paymentCategory_code", "businessEntity_code", "currency_code", "vendor_ID", "vendorCode", "vendorName",
                    "invoiceDebitNoteNumber", "poNumber", "userDivisionRepresentativeName", "remarks"
                ].forEach((sProperty) => oCreateModel.setProperty(`/${sProperty}`, ""));

                oCreateModel.setProperty("/invoiceDebitNoteDate", null);

                ["amount", "totalDebitNoteValue"].forEach((sProperty) => oCreateModel.setProperty(`/${sProperty}`, null));
            }
        },
        _setPoBasedNonAdvanceMode(bEnabled, bCodeChanged) {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/isPoBasedNonAdvance", bEnabled);

            // Clears whenever leaving the family, AND whenever switching between
            // the four PO-Based-Non-Advance codes that all share this one flag.
            if (!bEnabled || bCodeChanged) {
                this._clearPoBasedNonAdvanceFields();
            }
        },
        _clearPoBasedNonAdvanceFields() {
            const oCreateModel = this.getView().getModel("create");

            [
                "paymentCategory_code",
                "businessEntity_code",
                "currency_code",
                "poNumber",
                "vendor_ID",
                "vendorCode",
                "vendorName",
                "paymentSubCategory_code",
                "userDivisionRepresentativeName",
                "whtCertificateReference",
                "remarks"
            ].forEach((sProperty) => {
                oCreateModel.setProperty(`/${sProperty}`, "");
            });

            // Clear invoice table
            oCreateModel.setProperty("/invoices", []);
        },
        _setPoAdvanceMode(bEnabled, bCodeChanged) {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/isPoAdvance", bEnabled);

            // Clears on exit AND when switching between the two Advance codes.
            if (!bEnabled || bCodeChanged) {
                this._clearPoAdvanceFields();
            }
        },

        _clearPoAdvanceFields() {
            const oCreateModel = this.getView().getModel("create");

            [
                "paymentCategory_code",
                "businessEntity_code",
                "currency_code",
                "poNumber",
                "vendor_ID",
                "vendorCode",
                "vendorName",
                "paymentSubCategory_code",
                "userDivisionRepresentativeName",
                "remarks"
            ].forEach((sProperty) => {
                oCreateModel.setProperty(`/${sProperty}`, "");
            });

            oCreateModel.setProperty("/invoices", []);
        },
        _setPoAdvSettlementMode(bEnabled, bCodeChanged) {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/isPoAdvSettlement", bEnabled);

            // Clears on exit AND when switching between the four Advance Settlement codes.
            if (!bEnabled || bCodeChanged) {
                this._clearPoAdvSettlementFields();
            }
        },

        _clearPoAdvSettlementFields() {
            const oCreateModel = this.getView().getModel("create");

            [
                "paymentCategory_code",
                "businessEntity_code",
                "currency_code",
                "poNumber",
                "vendor_ID",
                "vendorCode",
                "vendorName",
                "paymentSubCategory_code",
                "userDivisionRepresentativeName",
                "remarks"
            ].forEach((sProperty) => {
                oCreateModel.setProperty(`/${sProperty}`, "");
            });

            oCreateModel.setProperty("/remainingBalanceAfterAdvanceSettlement", null);
            oCreateModel.setProperty("/invoices", []);
        },
        _setOfnAuthorityMode(bEnabled, bCodeChanged) {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/isOfnAuthority", bEnabled);

            // Clears on exit AND when switching between the two OFN Authority codes.
            if (!bEnabled || bCodeChanged) {
                [
                    "paymentCategory_code", "businessEntity_code", "currency_code", "vendor_ID", "vendorCode", "vendorName",
                    "invoiceNumber", "costCentre", "profitCentre", "paymentMethod_code", "ofnReference", "siteId", "siteName",
                    "wbsElement", "remarks"
                ].forEach((sProperty) => oCreateModel.setProperty(`/${sProperty}`, ""));

                oCreateModel.setProperty("/invoiceDate", null);
                [
                    "totalValue", "totalRentValue", "totalSupervisionValue", "securityDepositValue"
                ].forEach((sProperty) => oCreateModel.setProperty(`/${sProperty}`, null));
            }
        },
        _setNonPoDirectForeignTravelMode(bEnabled) {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/isNonPoDirectForeignTravel", bEnabled);

            if (!bEnabled) {
                [
                    "paymentCategory_code",
                    "businessEntity_code"
                ].forEach((sProperty) => oCreateModel.setProperty(`/${sProperty}`, ""));

                oCreateModel.setProperty("/directForeignTravelEntries", []);
            }
        },
        _setNonPoFuelMode(bEnabled, bCodeChanged) {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/isNonPoFuel", bEnabled);

            // Clears on exit AND when switching between Fuel Staff / Fuel Generator.
            if (!bEnabled || bCodeChanged) {
                [
                    "paymentCategory_code", "businessEntity_code", "currency_code", "remarks"
                ].forEach((sProperty) => oCreateModel.setProperty(`/${sProperty}`, ""));

                [
                    "fuelInclVat", "taxi", "highestValueInFile"
                ].forEach((sProperty) => oCreateModel.setProperty(`/${sProperty}`, null));
            }
        },

        _setNonPoIdeaMartAppMakerMode(bEnabled, bCodeChanged) {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty(
                "/isNonPoIdeaMartAppMaker",
                bEnabled
            );
            if (!bEnabled || bCodeChanged) {
                [
                    "paymentCategory_code",
                    "businessEntity_code",
                    "currency_code",
                    "customer_ID",
                    "customerCode",
                    "customerName",
                    "invoiceDebitNoteNumber",
                    "userDivisionRepresentativeName",
                    "remarks"
                ].forEach((sProperty) => {
                    oCreateModel.setProperty(`/${sProperty}`, "");
                });

                oCreateModel.setProperty("/invoiceDebitNoteDate", null);

                [
                    "brcHighestTransactionValue",
                    "whtNicHighestTransactionValue",
                    "lessThan100kNicBlankHighestTransactionValue",
                    "totalPaymentValueForMonth",
                    "retentionRepaymentValue"
                ].forEach((sProperty) => {
                    oCreateModel.setProperty(`/${sProperty}`, null);
                });
            }
        },
        _setNonPoCustomerRefundsMode(bEnabled) {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/isNonPoCustomerRefunds", bEnabled);
            if (!bEnabled) {
                [
                    "paymentCategory_code",
                    "businessEntity_code",
                    "currency_code",
                    "remarks"
                ].forEach((sProperty) => {
                    oCreateModel.setProperty(`/${sProperty}`, "");
                });
                oCreateModel.setProperty("/highestRefundValueOfFile", null);
            }
        },
        _setNonPoStelacomConsignmentMode(bEnabled) {
            const oCreateModel = this.getView().getModel("create");

            oCreateModel.setProperty("/isNonPoStelacomConsignment", bEnabled);

            if (!bEnabled) {
                [
                    "paymentCategory_code",
                    "businessEntity_code",
                    "currency_code",
                    "vendorCode",
                    "vendorName",
                    "invoiceNumber",
                    "liabilityBookingDocumentNumber",
                    "remarks"
                ].forEach((sProperty) => {
                    oCreateModel.setProperty(`/${sProperty}`, "");
                });

                [
                    "totalInvoiceValue"
                ].forEach((sProperty) => {
                    oCreateModel.setProperty(`/${sProperty}`, null);
                });

                oCreateModel.setProperty("/invoiceDate", null);
            }
        },
        _setNonPoSiteShareLiabilityMode(bEnabled) {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/isNonPoSiteShareLiability", bEnabled);
            if (!bEnabled) {
                [
                    "paymentCategory_code", "businessEntity_code", "category_code", "currency_code",
                    "vendor_ID", "vendorCode", "vendorName", "invoiceNumber", "invoiceDescription", "remarks"
                ].forEach((sProperty) => oCreateModel.setProperty(`/${sProperty}`, ""));

                oCreateModel.setProperty("/invoiceDate", null);
                oCreateModel.setProperty("/totalInvoiceValue", null);
            }
        },
        _setNonPoSiteSharingMode(bEnabled, bCodeChanged) {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/isNonPoSiteSharing", bEnabled);

            if (!bEnabled || bCodeChanged) {
                [
                    "paymentCategory_code",
                    "businessEntity_code",
                    "currency_code",
                    "vendor_ID",
                    "vendorCode",
                    "vendorName",
                    "remarks"
                ].forEach((sProperty) => oCreateModel.setProperty(`/${sProperty}`, ""));
            }
        },
        _setNonPoSiteRentTaxInvoiceMode(bEnabled) {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/isNonPoSiteRentTaxInvoice", bEnabled);

            if (!bEnabled) {
                [
                    "paymentCategory_code",
                    "businessEntity_code",
                    "currency_code",
                    "vendor_ID",
                    "vendorCode",
                    "vendorName",
                    "invoiceNumber",
                    "remarks"
                ].forEach((sProperty) => oCreateModel.setProperty(`/${sProperty}`, ""));
                [
                    "totalInvoiceValue"
                ].forEach((sProperty) => {
                    oCreateModel.setProperty(`/${sProperty}`, null);
                });
                oCreateModel.setProperty("/invoiceDate", null);
            }
        },
        _setNonPoSiteRentMonthlyFileMode(bEnabled) {
            const oCreateModel = this.getView().getModel("create");

            oCreateModel.setProperty("/isNonPoSiteRentMonthlyFile", bEnabled);

            if (!bEnabled) {
                [
                    "paymentCategory_code",
                    "businessEntity_code",
                    "currency_code",
                    "invoiceDescription",
                    "remarks"
                ].forEach((sProperty) => {
                    oCreateModel.setProperty(`/${sProperty}`, "");
                });

                [
                    "highestMonthlyRentalValueInFile",
                    "totalFileValue"
                ].forEach((sProperty) => {
                    oCreateModel.setProperty(`/${sProperty}`, null);
                });
            }
        },

        _setNonPoSiteRentStampAdhocMode(bEnabled) {
            const oCreateModel = this.getView().getModel("create");

            oCreateModel.setProperty("/isNonPoSiteRentStampAdhoc", bEnabled);

            if (!bEnabled) {
                [
                    "paymentCategory_code",
                    "businessEntity_code",
                    "vendor_ID",
                    "vendorCode",
                    "vendorName",
                    "invoiceNumber",
                    "siteId",
                    "siteName",
                    "currency_code",
                    "paymentDescription",
                    "remarks"
                ].forEach((sProperty) => {
                    oCreateModel.setProperty(`/${sProperty}`, "");
                });

                [
                    "totalPayableValue"
                ].forEach((sProperty) => {
                    oCreateModel.setProperty(`/${sProperty}`, null);
                });
                oCreateModel.setProperty("/invoiceDate", null);
            }
        },
        _setDirectNonPoReimbursementMode(bEnabled, bCodeChanged) {
            const oCreateModel = this.getView().getModel("create");

            oCreateModel.setProperty("/isDirectNonPoReimbursement", bEnabled);

            if (!bEnabled || bCodeChanged) {
                [
                    "paymentCategory_code",
                    "businessEntity_code",
                    "currency_code",
                    "authorityVendorCode",
                    "authorityVendorName",
                    "employeeVendorCode",
                    "employeeVendorName",
                    "invoiceNumber",
                    "costCentre",
                    "wbsElement",
                    "ofnReference",
                    "siteId",
                    "siteName",
                    "remarks"
                ].forEach((sProperty) => {
                    oCreateModel.setProperty(`/${sProperty}`, "");
                });

                [
                    "totalValue"
                ].forEach((sProperty) => {
                    oCreateModel.setProperty(`/${sProperty}`, null);
                });
                oCreateModel.setProperty("/invoiceDate", null);
            }
        },
        _setDirectForeignTravelReimbMode(bEnabled) {
            const oCreateModel = this.getView().getModel("create");

            oCreateModel.setProperty("/isDirectForeignTravelReimb", bEnabled);

            if (!bEnabled) {
                [
                    "paymentCategory_code",
                    "businessEntity_code",
                    "currency_code",
                     "nameEmpNo",
                    "designation",
                    "purposeOfTrip",
                    "country",
                    "budgetCode",
                    "employeeVendorCode",
                    "employeeVendorName",
                    "remarks"
                ].forEach((sProperty) => {
                    oCreateModel.setProperty(`/${sProperty}`, "");
                });

                [
                    "totalAmountForeignCurrency",
                    "totalAmountLKR",
                    "balanceToBeReturned"
                ].forEach((sProperty) => {
                    oCreateModel.setProperty(`/${sProperty}`, null);
                });
                oCreateModel.setProperty("/month", null);
                oCreateModel.setProperty("/transactionDate", null);
                oCreateModel.setProperty("/travelExpenses", []);
            }
        },
        _setNonPoTaxLiabilityMode(bEnabled, bCodeChanged) {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/isNonPoTaxLiability", bEnabled);

            // Clears on exit AND when switching between OTTP / PayOrder codes.
            if (!bEnabled || bCodeChanged) {
                [
                    "paymentCategory_code",
                    "businessEntity_code",
                    "currency_code",
                    "requestingDivision_code",
                    "vendor_ID",
                    "vendorCode",
                    "vendorName",
                    "taxType",
                    "reference",
                    "tin",
                    "din",
                    "remarks"
                ].forEach((sProperty) => oCreateModel.setProperty(`/${sProperty}`, ""));

                oCreateModel.setProperty("/taxDueDate", null);
                oCreateModel.setProperty("/totalTaxPayable", null);
                oCreateModel.setProperty("/glBreakups", []);
            }
        },
        _setNonPoInterconnectLiabMode(bEnabled) {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/isNonPoInterconnectLiab", bEnabled);

            if (!bEnabled) {
                [
                    "paymentCategory_code",
                    "businessEntity_code",
                    "currency_code",
                    "customer_ID",
                    "customerCode",
                    "customerName",
                    "invoiceDebitNoteNumber",
                    "remarks"
                ].forEach((sProperty) => oCreateModel.setProperty(`/${sProperty}`, ""));

                oCreateModel.setProperty("/invoiceDebitNoteDate", null);

                [
                    "totalInvoiceValueRelevantCurrency",
                    "totalInvoiceValueLKR",
                    "vatAmount"
                ].forEach((sProperty) => oCreateModel.setProperty(`/${sProperty}`, null));
            }
        },
        _setNonPoInterconnectRoamPayMode(bEnabled) {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/isNonPoInterconnectRoamPay", bEnabled);

            if (!bEnabled) {
                [
                    "paymentCategory_code",
                    "businessEntity_code",
                    "currency_code",
                    "customer_ID",
                    "customerCode",
                    "customerName",
                    "whtCertificateReference",
                    "remarks"
                ].forEach((sProperty) => oCreateModel.setProperty(`/${sProperty}`, ""));
            }
        },
        _setNonPoRoamingLiabilityMode(bEnabled) {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/isNonPoRoamingLiability", bEnabled);

            if (!bEnabled) {
                [
                    "paymentCategory_code",
                    "businessEntity_code",
                    "currency_code",
                    "customer_ID",
                    "customerCode",
                    "customerName"
                ].forEach((sProperty) => oCreateModel.setProperty(`/${sProperty}`, ""));

                oCreateModel.setProperty("/totalInvoiceValueRelevantCurrency", null);
                oCreateModel.setProperty("/totalInvoiceValueLKR", null);
            }
        },
        _setNonPoStarPointPaymentsMode(bEnabled) {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/isNonPoStarPointPayments", bEnabled);

            if (!bEnabled) {
                [
                    "paymentCategory_code",
                    "businessEntity_code",
                    "currency_code",
                    "remarks"
                ].forEach((sProperty) => oCreateModel.setProperty(`/${sProperty}`, ""));

                oCreateModel.setProperty("/highestPayableValueInList", null);
                oCreateModel.setProperty("/ivDocumentPostingDate", null);
            }
        },
        _setNonPoImportTrcMode(bEnabled) {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/isNonPoImportTrc", bEnabled);

            if (!bEnabled) {
                [
                    "paymentCategory_code",
                    "businessEntity_code",
                    "currency_code",
                    "vendor_ID",
                    "vendorCode",
                    "vendorName",
                    "poNumber",
                    "budgetCode",
                    "typeOfPayment_code",
                    "remarks"
                ].forEach((sProperty) => oCreateModel.setProperty(`/${sProperty}`, ""));

                oCreateModel.setProperty("/trcslProformaInvoiceDate", null);
                oCreateModel.setProperty("/trcslProformaInvoiceTotalValue", null);
            }
        },
        _setNonPoImportIclMode(bEnabled) {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/isNonPoImportIcl", bEnabled);

            if (!bEnabled) {
                [
                    "paymentCategory_code",
                    "businessEntity_code",
                    "currency_code",
                    "vendor_ID",
                    "vendorCode",
                    "vendorName",
                    "pivApplicationNumber",
                    "remarks"
                ].forEach((sProperty) => oCreateModel.setProperty(`/${sProperty}`, ""));

                oCreateModel.setProperty("/pivDate", null);
                oCreateModel.setProperty("/totalPivValue", null);
            }
        },
        _setNonPoImportDgcMode(bEnabled, bCodeChanged) {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/isNonPoImportDgc", bEnabled);

            if (!bEnabled || bCodeChanged) {
                [
                    "paymentCategory_code",
                    "businessEntity_code",
                    "currency_code",
                    "vendor_ID",
                    "vendorCode",
                    "vendorName",
                    "poNumber",
                    "cusdecNumber",
                    "remarks"
                ].forEach((sProperty) => oCreateModel.setProperty(`/${sProperty}`, ""));

                oCreateModel.setProperty("/cusdecDate", null);
                oCreateModel.setProperty("/totalDeclarationValueInCusdec", null);
            }
        },
        _setNonPoCcPaymentMode(bEnabled) {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/isNonPoCcPayment", bEnabled);

            if (!bEnabled) {
                [
                    "paymentCategory_code",
                    "businessEntity_code",
                    "currency_code",
                    "ccCustodianName",
                    "vendor_ID",
                    "vendorCode",
                    "vendorName",
                    "poNumber",
                    "sesReference",
                    "invoiceNumber",
                    "budgetCode",
                    "descriptionOfPayment",
                    "justificationForCreditCardUse",
                    "remarks"
                ].forEach((sProperty) => oCreateModel.setProperty(`/${sProperty}`, ""));

                oCreateModel.setProperty("/whtEligibilityConfirmation", false);
                oCreateModel.setProperty("/invoiceDate", null);
                oCreateModel.setProperty("/totalAmountPayable", null);
            }
        },
        _setNonPoCcSettlementMode(bEnabled) {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/isNonPoCcSettlement", bEnabled);

            if (!bEnabled) {
                [
                    "paymentCategory_code",
                    "businessEntity_code",
                    "currency_code",
                    "bankName",
                    "ccCustodianName",
                    "remarks"
                ].forEach((sProperty) => oCreateModel.setProperty(`/${sProperty}`, ""));

                [
                    "ccPeriodFromDate",
                    "ccPeriodToDate"
                ].forEach((sProperty) => oCreateModel.setProperty(`/${sProperty}`, null));

                [
                    "annualFee",
                    "stampDuty",
                    "latePaymentFee",
                    "interestCharges",
                    "totalAmountPayableCcSettlement"
                ].forEach((sProperty) => oCreateModel.setProperty(`/${sProperty}`, null));

                oCreateModel.setProperty("/settlementEntries", []);
            }
        },
        _setNonPoMerchantSettlementsMode(bEnabled) {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/isNonPoMerchantSettlements", bEnabled);

            if (!bEnabled) {
                [
                    "paymentCategory_code",
                    "businessEntity_code",
                    "currency_code",
                    "processingBankAccountDetails"
                ].forEach((sProperty) => oCreateModel.setProperty(`/${sProperty}`, ""));

                oCreateModel.setProperty("/highestValueInExcel", null);
                oCreateModel.setProperty("/aggregateTotalValueAcrossAllFiles", null);
                oCreateModel.setProperty("/merchantEntityValues", []);
            }
        },
        _setNonPoMiscReceiptsMode(bEnabled) {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/isNonPoMiscReceipts", bEnabled);

            if (!bEnabled) {
                [
                    "paymentCategory_code",
                    "businessEntity_code",
                    "currency_code",
                    "vendor_ID",
                    "vendorCode",
                    "vendorName",
                    "costCentre",
                    "debitGL",
                    "remarks"
                ].forEach((sProperty) => oCreateModel.setProperty(`/${sProperty}`, ""));

                oCreateModel.setProperty("/depositedAmount", null);
            }
        },
        _setPoZeroIvMode(bEnabled) {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/isPoZeroIv", bEnabled);

            if (!bEnabled) {
                [
                    "paymentCategory_code",
                    "businessEntity_code",
                    "currency_code",
                    "remarks"
                ].forEach((sProperty) => oCreateModel.setProperty(`/${sProperty}`, ""));

                oCreateModel.setProperty("/zeroIvUserConfirmationAttached", false);
            }
        },
        _setBankGuaranteeMode(bEnabled) {
            const oCreateModel = this.getView().getModel("create");
            oCreateModel.setProperty("/isBankGuarantee", bEnabled);

            if (!bEnabled) {
                [
                    "paymentCategory_code",
                    "businessEntity_code",
                    "currency_code",
                    "guaranteeType_code",
                    "beneficiaryName",
                    "beneficiaryAddress",
                    "purposeOfBankGuarantee",
                    "bidTenderReference",
                    "collectorName",
                    "collectorNic",
                    "collectorContactNumber",
                    "remarks"
                ].forEach((sProperty) => oCreateModel.setProperty(`/${sProperty}`, ""));

                [
                    "commencingDate",
                    "expiryDate",
                    "claimDate",
                    "tenderDate",
                    "expectedDate"
                ].forEach((sProperty) => oCreateModel.setProperty(`/${sProperty}`, null));

                oCreateModel.setProperty("/specificBgFormatAvailable", false);
                oCreateModel.setProperty("/amount", null);
            }
        },
        async onAmountChange(oEvent) {
            const oCreateModel = this.getView().getModel("create");

            if (!oCreateModel.getProperty("/loaApprovalApplicable")) {
                oCreateModel.setProperty("/role", "");
                return;
            }

            const sValue = oEvent.getParameter("value");
            const fAmount = Number(sValue);

            if (sValue === "" || !Number.isFinite(fAmount)) {
                oCreateModel.setProperty("/role", "");
                return;
            }

            try {
                oCreateModel.setProperty("/role", await this._resolveLoaRole(fAmount));
            } catch (oError) {
                oCreateModel.setProperty("/role", "");
            }
        },

        async _resolveLoaRole(fAmount) {
            const aRules = await this._readList("/LoaApproval", { sorters: [] });
            let oWinner = null;

            aRules.forEach((oRule) => {
                const fThreshold = Number(oRule.amount);

                if (!Number.isFinite(fThreshold) || !this._evaluateOperator(fAmount, oRule.operator_code, fThreshold)) {
                    return;
                }

                if (!oWinner) {
                    oWinner = oRule;
                    return;
                }

                const bPrefersHigher = this._prefersHigherThreshold(oRule.operator_code);
                const fWinnerThreshold = Number(oWinner.amount);

                if ((bPrefersHigher && fThreshold > fWinnerThreshold) || (!bPrefersHigher && fThreshold < fWinnerThreshold)) {
                    oWinner = oRule;
                }
            });

            return oWinner?.roleCode || "";
        },

        _prefersHigherThreshold(sOperator) {
            return sOperator === ">" || sOperator === ">=";
        },

        _evaluateOperator(fAmount, sOperator, fThreshold) {
            return {
                "=": fAmount === fThreshold,
                "!=": fAmount !== fThreshold,
                "<": fAmount < fThreshold,
                "<=": fAmount <= fThreshold,
                ">": fAmount > fThreshold,
                ">=": fAmount >= fThreshold
            }[sOperator] || false;
        },

        _setVendor(oContext) {
            const oCreateModel = this.getView().getModel("create");

            oCreateModel.setProperty("/vendor_ID", oContext.getProperty("ID"));
            oCreateModel.setProperty("/vendorCode", oContext.getProperty("vendorCode"));
            oCreateModel.setProperty("/vendorName", oContext.getProperty("vendorName"));
        },

        async _onProcessSelectionChanged() {
            const oCreateModel = this.getView().getModel("create");

            oCreateModel.setProperty("/subProcessType_code", "");
            oCreateModel.setProperty("/subProcessTypeName", "");
            this._setFtkFactoringMode(false);
            this._setFtkBasedOnUacMode(false);
            this._setFtkNonFactoringMode(false);
            this._setFtkServicePaymentMode(false);
            this._setFtkDutyReimbursementMode(false);
            this._setPoBasedNonAdvanceMode(false, true);
            this._setPoAdvanceMode(false, true);
            this._setPoAdvSettlementMode(false, true);
            this._setOfnAuthorityMode(false, true);
            this._setNonPoDirectForeignTravelMode(false);
            this._setNonPoFuelMode(false, true);
            this._setNonPoIdeaMartAppMakerMode(false, true);
            this._setNonPoCustomerRefundsMode(false);
            this._setNonPoStelacomConsignmentMode(false);
            this._setNonPoSiteShareLiabilityMode(false);
            this._setNonPoSiteSharingMode(false, true);
            this._setNonPoSiteRentTaxInvoiceMode(false);
            this._setNonPoSiteRentMonthlyFileMode(false);
            this._setNonPoSiteRentStampAdhocMode(false);
            this._setDirectNonPoReimbursementMode(false, true);
            this._setDirectForeignTravelReimbMode(false);
            this._setNonPoTaxLiabilityMode(false, true);
            this._setNonPoInterconnectLiabMode(false);
            this._setNonPoInterconnectRoamPayMode(false);
            this._setNonPoRoamingLiabilityMode(false);
            this._setNonPoStarPointPaymentsMode(false);
            this._setNonPoImportTrcMode(false);
            this._setNonPoImportIclMode(false);
            this._setNonPoImportDgcMode(false, true);
            this._setNonPoCcPaymentMode(false);
            this._setNonPoCcSettlementMode(false);
            this._setNonPoMerchantSettlementsMode(false);
            this._setNonPoMiscReceiptsMode(false);
            this._setBankGuaranteeMode(false);

            oCreateModel.setProperty("/loaApprovalApplicable", false);
            oCreateModel.setProperty("/isPaymentRequest", false);
            oCreateModel.setProperty("/amount", null);
            oCreateModel.setProperty("/role", "");

            const aSubTypes = await this._readList("/ProcessSubTypes", {
                filters: [
                    new Filter("isActive", FilterOperator.EQ, true),
                    new Filter("processType_code", FilterOperator.EQ, oCreateModel.getProperty("/processType_code"))
                ],
                sorters: []
            });

            oCreateModel.setProperty("/hasSubProcessTypes", aSubTypes.length > 0);
        },

        async _prefillFromPredecessor(sPredecessorId) {
            const oCreateModel = this.getView().getModel("create");

            oCreateModel.setProperty("/creating", true);

            try {
                const oPredecessor = await this._readEntry(`/ProcessRequests(guid'${sPredecessorId}')`, {
                    urlParameters: {
                        "$expand": "processType,subProcessType,paymentCategory,businessEntity,priorityConfig"
                    }
                });

                oCreateModel.setProperty("/predecessor_ID", oPredecessor.ID);
                oCreateModel.setProperty("/predecessorReferenceNumber", oPredecessor.referenceNumber || "");
                oCreateModel.setProperty("/predecessorTitle", oPredecessor.title || "");
                oCreateModel.setProperty("/predecessorDisplay", [
                    oPredecessor.referenceNumber,
                    oPredecessor.title
                ].filter(Boolean).join(" - "));
                oCreateModel.setProperty("/processType_code", oPredecessor.processType_code || "");
                const bLoaApplicable = Boolean(oPredecessor.subProcessType?.loaApprovalApplicable);
                oCreateModel.setProperty("/loaApprovalApplicable", bLoaApplicable);
                oCreateModel.setProperty("/isPaymentRequest", bLoaApplicable);
                oCreateModel.setProperty("/amount", oPredecessor.amount ?? null);
                oCreateModel.setProperty("/role", oPredecessor.role || "");
                oCreateModel.setProperty("/processTypeName", oPredecessor.processType?.name || oPredecessor.processType_code || "");
                oCreateModel.setProperty("/subProcessType_code", oPredecessor.subProcessType_code || "");
                oCreateModel.setProperty("/subProcessTypeName", oPredecessor.subProcessType?.name || oPredecessor.subProcessType_code || "");
                this._setFtkFactoringMode(this._isFtkFactoringSubtype(oPredecessor.subProcessType_code));
                oCreateModel.setProperty(
                    "/isFtkPoValidation",
                    oPredecessor.subProcessType_code === "FTK_FACTORING_PO_VALIDATION"
                );
                oCreateModel.setProperty("/paymentCategory_code", oPredecessor.paymentCategory_code || "");
                oCreateModel.setProperty("/businessEntity_code", oPredecessor.businessEntity_code || "");
                oCreateModel.setProperty("/vendor_ID", oPredecessor.vendor_ID || "");
                oCreateModel.setProperty("/vendorCode", oPredecessor.vendorCode || "");
                oCreateModel.setProperty("/vendorName", oPredecessor.vendorName || "");
                oCreateModel.setProperty("/remarks", oPredecessor.remarks || "");
                oCreateModel.setProperty("/title", this.getText("successorRequestTitlePrefix", [
                    oPredecessor.referenceNumber || oPredecessor.title || ""
                ]));
                oCreateModel.setProperty("/description", oPredecessor.description || "");
                oCreateModel.setProperty("/department", oPredecessor.department || "");
                oCreateModel.setProperty(
                    "/priorityConfig_code",
                    oPredecessor.priorityConfig_code || String(oPredecessor.priority || "MEDIUM").toUpperCase()
                );

                if (oPredecessor.processType_code) {
                    const aSubTypes = await this._readList("/ProcessSubTypes", {
                        filters: [
                            new Filter("isActive", FilterOperator.EQ, true),
                            new Filter("processType_code", FilterOperator.EQ, oPredecessor.processType_code)
                        ],
                        sorters: []
                    });

                    oCreateModel.setProperty("/hasSubProcessTypes", aSubTypes.length > 0);
                }
            } catch (oError) {
                MessageBox.error(this.getErrorMessage(oError, this.getText("predecessorLoadFailedMessage")));
            } finally {
                oCreateModel.setProperty("/creating", false);
            }
        },

        async _populateCurrentRequester() {
            const oCreateModel = this.getView().getModel("create");

            if (!oCreateModel) {
                return;
            }

            try {
                const oResponse = await this.callAction("getCurrentUserDetails");
                const oUser = oResponse.value || oResponse;
                const sRequesterName = oUser.displayName || oUser.email || oUser.userPrincipalName || "";

                oCreateModel.setProperty("/requesterUser_ID", oUser.ID || "");
                oCreateModel.setProperty("/requesterName", sRequesterName);
                oCreateModel.setProperty("/requester", sRequesterName);

                if (oUser.department) {
                    oCreateModel.setProperty("/department", oUser.department);
                }
            } catch (oError) {
                oCreateModel.setProperty("/requesterUser_ID", "");
                oCreateModel.setProperty("/requesterName", "");
                oCreateModel.setProperty("/requester", "");
            }
        },

        _readEntry(sPath, oParameters) {
            return new Promise((resolve, reject) => {
                this.getModel().read(sPath, {
                    ...(oParameters || {}),
                    success: resolve,
                    error: reject
                });
            });
        },

        _readList(sPath, oParameters) {
            return new Promise((resolve, reject) => {
                this.getModel().read(sPath, {
                    ...(oParameters || {}),
                    success: (oData) => resolve(oData.results || []),
                    error: reject
                });
            });
        },

        _getRequestListRouteParameters(oExtraQuery = {}) {
            const oQuery = { ...oExtraQuery };

            if (this._bReturnToUnreservedOnly) {
                oQuery.unreserved = "true";
            }

            if (this._bReturnToReservedOnly) {
                oQuery.reserved = "true";
            }

            return Object.keys(oQuery).length
                ? { "?query": oQuery }
                : {};
        },

        _syncAttachmentModel() {
            const oModel = this.getView().getModel("create");
            const aCurrentAttachments = oModel.getProperty("/attachments") || [];

            oModel.setProperty("/attachments", this._aAttachmentFiles.map((oFile, iIndex) => ({
                name: oFile.name,
                sizeText: this._formatFileSize(oFile.size),
                progress: aCurrentAttachments[iIndex]?.progress || 0,
                progressText: aCurrentAttachments[iIndex]?.progressText || "0%",
                statusText: aCurrentAttachments[iIndex]?.statusText || this.getText("attachmentSelectedStatus"),
                statusState: aCurrentAttachments[iIndex]?.statusState || "None",
                showProgress: aCurrentAttachments[iIndex]?.showProgress || false
            })));
        },

        _validateAttachmentFiles(aFiles) {
            const oOversizedFile = aFiles.find((oFile) => oFile.size > MAX_ATTACHMENT_SIZE_BYTES);

            if (!oOversizedFile) {
                return true;
            }

            MessageBox.warning(this.getText("attachmentSizeExceededMessage", [
                oOversizedFile.name,
                MAX_ATTACHMENT_SIZE_MB
            ]));
            return false;
        },

        _formatFileSize(iBytes) {
            if (!iBytes) {
                return this.getText("fileSizeZero");
            }

            const aUnits = ["B", "KB", "MB", "GB"];
            let iSize = iBytes;
            let iUnitIndex = 0;

            while (iSize >= 1024 && iUnitIndex < aUnits.length - 1) {
                iSize /= 1024;
                iUnitIndex += 1;
            }

            return `${iSize.toFixed(iUnitIndex ? 1 : 0)} ${aUnits[iUnitIndex]}`;
        },

        _createUuid() {
            if (window.crypto?.randomUUID) {
                return window.crypto.randomUUID();
            }

            return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (sCharacter) => {
                const iRandom = Math.floor(Math.random() * 16);
                const iValue = sCharacter === "x" ? iRandom : (iRandom & 0x3) | 0x8;

                return iValue.toString(16);
            });
        },

        _startAttachmentUploadInBackground(aAttachmentUploads) {
            const oCreateModel = this.getView().getModel("create");

            oCreateModel.setProperty("/uploading", true);
            this._uploadAttachments(aAttachmentUploads)
                .then(() => {
                    MessageToast.show(this.getText("attachmentsUploadedMessage"));
                })
                .catch((oError) => {
                    MessageBox.error(this.getErrorMessage(oError, this.getText("attachmentBackgroundUploadErrorMessage")));
                })
                .finally(() => {
                    oCreateModel.setProperty("/uploading", false);
                });
        },

        async _uploadAttachments(aAttachmentUploads) {
            if (!aAttachmentUploads.length) {
                return;
            }

            const sToken = await this._fetchCsrfToken();

            for (let iIndex = 0; iIndex < aAttachmentUploads.length; iIndex += 1) {
                const oAttachmentUpload = aAttachmentUploads[iIndex];
                const oFile = oAttachmentUpload.file;

                this._setAttachmentUploadStatus(iIndex, {
                    statusText: this.getText("attachmentUploadingStatus"),
                    statusState: "Information",
                    showProgress: true
                });

                try {
                    await this._uploadAttachmentContent(oAttachmentUpload.ID, oFile, sToken, (iPercent) => {
                        this._setAttachmentUploadStatus(iIndex, {
                            progress: iPercent,
                            progressText: `${iPercent}%`,
                            statusText: iPercent === 100
                                ? this.getText("attachmentProcessingStatus")
                                : this.getText("attachmentUploadingStatus")
                        });
                    });
                    this._setAttachmentUploadStatus(iIndex, {
                        progress: 100,
                        progressText: "100%",
                        statusText: this.getText("attachmentUploadedStatus"),
                        statusState: "Success"
                    });
                } catch (oError) {
                    this._setAttachmentUploadStatus(iIndex, {
                        statusText: this.getText("attachmentUploadFailedStatus"),
                        statusState: "Error"
                    });
                    throw oError;
                }
            }
        },

        _setAttachmentUploadStatus(iIndex, oValues) {
            const oModel = this.getView().getModel("create");

            Object.entries(oValues).forEach(([sProperty, vValue]) => {
                oModel.setProperty(`/attachments/${iIndex}/${sProperty}`, vValue);
            });
        },

        _uploadAttachmentContent(sAttachmentId, oFile, sToken, fnProgress) {
            return new Promise((resolve, reject) => {
                const oRequest = new XMLHttpRequest();

                oRequest.open("PUT", this.getServiceV4Url(`ProcessAttachments(ID=${sAttachmentId})/content`));
                oRequest.withCredentials = true;
                oRequest.setRequestHeader("Content-Type", oFile.type || "application/octet-stream");
                oRequest.setRequestHeader("X-CSRF-Token", sToken);
                oRequest.upload.onprogress = (oEvent) => {
                    if (oEvent.lengthComputable) {
                        fnProgress(Math.round((oEvent.loaded / oEvent.total) * 100));
                    }
                };
                oRequest.onload = () => {
                    if (oRequest.status >= 200 && oRequest.status < 300) {
                        resolve();
                        return;
                    }

                    reject(new Error(this.getText("attachmentContentErrorMessage", [oFile.name])));
                };
                oRequest.onerror = () => {
                    reject(new Error(this.getText("attachmentContentErrorMessage", [oFile.name])));
                };
                oRequest.send(oFile);
            });
        }
    });
});
