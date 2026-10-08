sap.ui.define([], function () {
  "use strict";

  const field = (name, label, type, extra) => Object.assign({
    name,
    label,
    type: type || "input",
    required: false
  }, extra || {});

  const catalogField = (name, label, catalog, extra) => field(name, label, "combo", Object.assign({
    catalog,
    key: "code",
    text: "name",
    secondaryText: "code"
  }, extra || {}));

  const COMMON = [
    catalogField("paymentCategory_code", "Payment Category", "flowmatePaymentCategories"),
    catalogField("businessEntity_code", "Entity", "flowmateFtkEntities"),
    catalogField("currency_code", "Currency", "flowmateCurrencies"),
    catalogField("category_code", "Category", "flowmateCategories"),
    catalogField("paymentSubCategory_code", "Payment Sub-Category", "flowmatePaymentSubCategories"),
    catalogField("paymentMethod_code", "Payment Method", "flowmatePaymentMethods"),
    catalogField("requestingDivision_code", "Requesting Division", "flowmateRequestDivisions"),
    catalogField("typeOfPayment_code", "Type of Payment", "flowmateTypeOfPayments"),
    catalogField("guaranteeType_code", "Guarantee Type", "flowmateGuaranteeTypes")
  ];

  const VENDOR = [
    field("vendor_ID", "Vendor", "combo", {
      catalog: "flowmateVendors", key: "ID", text: "vendorName", secondaryText: "vendorCode",
      autoFills: { vendorCode: "vendorCode", vendorName: "vendorName" }
    }),
    field("vendorCode", "Vendor Code", "input"),
    field("vendorName", "Vendor Name", "readonly")
  ];

  const CUSTOMER = [
    field("customer_ID", "Customer", "combo", {
      catalog: "flowmateCustomers", key: "ID", text: "customerName", secondaryText: "customerCode",
      autoFills: { customerCode: "customerCode", customerName: "customerName" }
    }),
    field("customerCode", "Customer Code", "input"),
    field("customerName", "Customer Name", "readonly")
  ];

  const PO = [
    field("userDivisionRepresentativeName", "User Division Representative"),
    field("poNumber", "PO Number"),
    field("invoices", "Invoices / Invoice Details", "json"),
    field("whtCertificateReference", "WHT Certificate Reference"),
    field("highestInvoiceValue", "Highest Invoice Value", "number"),
    field("remainingBalanceAfterAdvanceSettlement", "Remaining Balance After Advance Settlement", "number")
  ];

  const OFN = [
    field("invoiceDate", "Invoice Date", "date"),
    field("invoiceNumber", "Invoice Number"),
    field("costCentre", "Cost Centre"),
    field("profitCentre", "Profit Centre"),
    field("wbsElement", "WBS Element"),
    field("paymentMethod_code", "Payment Method", "combo", {
      catalog: "flowmatePaymentMethods", key: "code", text: "name", secondaryText: "code"
    }),
    field("totalRentValue", "Total Rent Value", "number"),
    field("totalSupervisionValue", "Total Supervision Value", "number"),
    field("securityDepositValue", "Security Deposit Value", "number"),
    field("totalValue", "Total Value", "number"),
    field("ofnReference", "OFN Reference"),
    field("siteId", "Site ID"),
    field("siteName", "Site Name")
  ];

  const NON_PO = [
    field("fuelInclVat", "Fuel Including VAT", "number"),
    field("taxi", "Taxi", "number"),
    field("highestValueInFile", "Highest Value in File", "number"),
    field("highestPayableValueInList", "Highest Payable Value in List", "number"),
    field("totalInvoiceValue", "Total Invoice Value", "number"),
    field("liabilityBookingDocumentNumber", "Liability Booking Document Number"),
    field("invoiceDescription", "Invoice Description", "textarea"),
    field("totalPayableValue", "Total Payable Value", "number"),
    field("paymentDescription", "Payment Description", "textarea"),
    field("authorityVendorCode", "Authority Vendor Code"),
    field("authorityVendorName", "Authority Vendor Name"),
    field("employeeVendorCode", "Employee Vendor Code"),
    field("employeeVendorName", "Employee Vendor Name"),
    field("highestMonthlyRentalValueInFile", "Highest Monthly Rental Value", "number"),
    field("totalFileValue", "Total File Value", "number"),
    field("depositedAmount", "Deposited Amount", "number"),
    field("highestRefundValueOfFile", "Highest Refund Value", "number"),
    field("ivDocumentPostingDate", "IV Document Posting Date", "date"),
    field("trcslProformaInvoiceDate", "TRCSL Proforma Invoice Date", "date"),
    field("trcslProformaInvoiceTotalValue", "TRCSL Proforma Invoice Total Value", "number"),
    field("pivDate", "PIV Date", "date"),
    field("pivApplicationNumber", "PIV Application Number"),
    field("totalPivValue", "Total PIV Value", "number"),
    field("cusdecDate", "CUSDEC Date", "date"),
    field("cusdecNumber", "CUSDEC Number"),
    field("totalDeclarationValueInCusdec", "Total Declaration Value in CUSDEC", "number"),
    field("ccPeriodFromDate", "Credit Card Period From", "date"),
    field("ccPeriodToDate", "Credit Card Period To", "date"),
    field("vatAmount", "VAT Amount", "number")
  ];

  const TRAVEL = [
    field("directForeignTravelEntries", "Travel Entries", "json"),
    field("totalAmountForeignCurrency", "Total Foreign Currency Amount", "number"),
    field("totalAmountLKR", "Total Amount (LKR)", "number"),
    field("balanceToBeReturned", "Balance to be Returned", "number"),
    field("nameEmpNo", "Employee Name / Number"),
    field("designation", "Designation"),
    field("purposeOfTrip", "Purpose of Trip", "textarea"),
    field("month", "Month", "date"),
    field("country", "Country"),
    field("budgetCode", "Budget Code"),
    field("travelExpenses", "Travel Expenses", "json")
  ];

  const TAX = [
    field("taxType", "Tax Type"),
    field("reference", "Reference"),
    field("totalTaxPayable", "Total Tax Payable", "number"),
    field("tin", "TIN"),
    field("din", "DIN"),
    field("taxDueDate", "Tax Due Date", "date"),
    field("glBreakups", "GL Breakups", "json")
  ];

  const CREDIT_CARD = [
    field("ccCustodianName", "Credit Card Custodian"),
    field("whtEligibilityConfirmation", "WHT Eligibility Confirmation", "checkbox"),
    field("sesReference", "SES Reference"),
    field("transactionAmountDocumentCurrency", "Transaction Amount (Document Currency)", "number"),
    field("transactionAmountLocalCurrency", "Transaction Amount (Local Currency)", "number"),
    field("descriptionOfPayment", "Description of Payment", "textarea"),
    field("justificationForCreditCardUse", "Justification for Credit Card Use", "textarea"),
    field("bankName", "Bank Name"),
    field("ccPeriodFromDate", "Credit Card Period From", "date"),
    field("ccPeriodToDate", "Credit Card Period To", "date"),
    field("annualFee", "Annual Fee", "number"),
    field("stampDuty", "Stamp Duty", "number"),
    field("latePaymentFee", "Late Payment Fee", "number"),
    field("interestCharges", "Interest Charges", "number"),
    field("totalAmountPayableCcSettlement", "Total Amount Payable", "number"),
    field("settlementEntries", "Settlement Entries", "json")
  ];

  const MERCHANT = [
    field("merchantEntityValues", "Merchant Entity Values", "json"),
    field("highestValueInExcel", "Highest Value in Excel", "number"),
    field("aggregateTotalValueAcrossAllFiles", "Aggregate Total Value", "number"),
    field("processingBankAccountDetails", "Processing Bank Account Details", "textarea")
  ];

  const BANK_GUARANTEE = [
    field("amountPayable", "Amount Payable", "number"),
    field("beneficiaryName", "Beneficiary Name"),
    field("beneficiaryAddress", "Beneficiary Address", "textarea"),
    field("commencingDate", "Commencing Date", "date"),
    field("expiryDate", "Expiry Date", "date"),
    field("claimDate", "Claim Date", "date"),
    field("tenderDate", "Tender Date", "date"),
    field("expectedDate", "Expected Date", "date"),
    field("purposeOfBankGuarantee", "Purpose of Bank Guarantee", "textarea"),
    field("bidTenderReference", "Bid / Tender Reference"),
    field("collectorName", "Collector Name"),
    field("collectorNic", "Collector NIC"),
    field("collectorContactNumber", "Collector Contact Number"),
    field("specificBgFormatAvailable", "Specific BG Format Available", "checkbox")
  ];

  // These fields mirror the ProcessRequests schema in Flowmate.  Keeping the
  // catalogue here means the Payment Run dialog can use the same field names,
  // data types and subtype rules as the native Flowmate request form.
  const FLOWMATE_FIELD_OVERRIDES = {
    invoiceDebitNoteDate: field("invoiceDebitNoteDate", "Invoice / Debit Note Date", "date"),
    invoiceDebitNoteNumber: field("invoiceDebitNoteNumber", "Invoice / Debit Note Number"),
    totalDebitNoteValue: field("totalDebitNoteValue", "Total Debit Note Value", "number"),
    totalInvoiceValueRelevantCurrency: field("totalInvoiceValueRelevantCurrency", "Total Invoice Value (Relevant Currency)", "number"),
    totalInvoiceValueLKR: field("totalInvoiceValueLKR", "Total Invoice Value (LKR)", "number"),
    totalDebitNoteValue: field("totalDebitNoteValue", "Total Debit Note Value", "number"),
    commodityImportCode: field("commodityImportCode", "Commodity / Import Code"),
    totalPivValue: field("totalPivValue", "Total PIV Value", "number"),
    debitGL: field("debitGL", "Debit GL"),
    zeroIvUserConfirmationAttached: field("zeroIvUserConfirmationAttached", "Zero IV User Confirmation Attached", "checkbox"),
    invoiceDate: field("invoiceDate", "Invoice Date", "date"),
    invoiceNumber: field("invoiceNumber", "Invoice Number"),
    transactionDate: field("transactionDate", "Transaction Date", "date"),
    totalAmountForeignCurrency: field("totalAmountForeignCurrency", "Total Amount (Foreign Currency)", "number"),
    totalAmountLKR: field("totalAmountLKR", "Total Amount (LKR)", "number"),
    totalPayableValue: field("totalPayableValue", "Total Payable Value", "number"),
    whtEligibilityConfirmation: field("whtEligibilityConfirmation", "WHT Eligibility Confirmation", "checkbox"),
    totalInvoiceValue: field("totalInvoiceValue", "Total Invoice Value", "number"),
    totalInvoiceValueRelevantCurrency: field("totalInvoiceValueRelevantCurrency", "Total Invoice Value (Relevant Currency)", "number"),
    totalInvoiceValueLKR: field("totalInvoiceValueLKR", "Total Invoice Value (LKR)", "number"),
    highestPayableValueInList: field("highestPayableValueInList", "Highest Payable Value in List", "number"),
    ivDocumentPostingDate: field("ivDocumentPostingDate", "IV Document Posting Date", "date"),
    trcslProformaInvoiceDate: field("trcslProformaInvoiceDate", "TRCSL Proforma Invoice Date", "date"),
    trcslProformaInvoiceTotalValue: field("trcslProformaInvoiceTotalValue", "TRCSL Proforma Invoice Total Value", "number"),
    pivDate: field("pivDate", "PIV Date", "date"),
    cusdecDate: field("cusdecDate", "CUSDEC Date", "date"),
    ccPeriodFromDate: field("ccPeriodFromDate", "Credit Card Period From", "date"),
    ccPeriodToDate: field("ccPeriodToDate", "Credit Card Period To", "date"),
    annualFee: field("annualFee", "Annual Fee", "number"),
    stampDuty: field("stampDuty", "Stamp Duty", "number"),
    latePaymentFee: field("latePaymentFee", "Late Payment Fee", "number"),
    interestCharges: field("interestCharges", "Interest Charges", "number"),
    totalAmountPayableCcSettlement: field("totalAmountPayableCcSettlement", "Total Amount Payable", "number"),
    highestValueInExcel: field("highestValueInExcel", "Highest Value in Excel", "number"),
    aggregateTotalValueAcrossAllFiles: field("aggregateTotalValueAcrossAllFiles", "Aggregate Total Value", "number"),
    processingBankAccountDetails: field("processingBankAccountDetails", "Processing Bank Account Details", "textarea"),
    depositedAmount: field("depositedAmount", "Deposited Amount", "number"),
    amountPayable: field("amountPayable", "Amount Payable", "number"),
    customer_ID: field("customer_ID", "Customer", "combo", {
      catalog: "flowmateCustomers", key: "ID", text: "customerName", secondaryText: "customerCode",
      autoFills: { customerCode: "customerCode", customerName: "customerName" }
    }),
    customerCode: field("customerCode", "Customer Code"),
    customerName: field("customerName", "Customer Name", "readonly"),
    invoices: field("invoices", "Invoice Details", "grid"),
    directForeignTravelEntries: field("directForeignTravelEntries", "Direct Foreign Travel Entries", "grid"),
    travelExpenses: field("travelExpenses", "Travel Expenses", "grid"),
    glBreakups: field("glBreakups", "GL Breakups", "grid"),
    settlementEntries: field("settlementEntries", "Settlement Entries", "grid"),
    merchantEntityValues: field("merchantEntityValues", "Merchant Entity Values", "grid"),
    remarks: field("remarks", "Remarks", "textarea")
  };

  // This is the same required/optional map used by Flowmate's request create
  // controller.  The Payment Run form deliberately consumes this map rather
  // than inferring requirements from a broad prefix, so every subtype shows
  // the same fields and mandatory markers as Flowmate.
  const SUBTYPE_FIELDS = {
    FTK_FACTORING_PO_VALIDATION: { required: ["paymentCategory_code", "businessEntity_code", "vendor_ID", "vendorCode", "vendorName"], optional: ["remarks"] },
    FTK_FACTORING_PO_VALIDATION_HW: { required: ["paymentCategory_code", "businessEntity_code", "vendor_ID", "vendorCode", "vendorName"], optional: ["remarks"] },
    FTK_FACTORING_PO_VALID_HW_SW: { required: ["paymentCategory_code", "businessEntity_code", "vendor_ID", "vendorCode", "vendorName"], optional: ["remarks"] },
    FTK_FACTORING_BASED_ON_UAC: { required: ["paymentCategory_code", "businessEntity_code", "vendor_ID", "vendorCode", "vendorName", "currency_code", "category_code"], optional: ["remarks"] },
    FTK_NON_FACTORING_BASED_UAC: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "category_code", "vendor_ID", "vendorCode", "vendorName"], optional: ["remarks"] },
    FTK_SERVICE_PAYMENT: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "vendor_ID", "vendorCode", "vendorName"], optional: ["remarks"] },
    FTK_DUTY_REIMBURSEMENT: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "amountPayable", "vendor_ID", "vendorCode", "vendorName", "invoiceDebitNoteDate", "invoiceDebitNoteNumber", "totalDebitNoteValue", "userDivisionRepresentativeName", "poNumber"], optional: ["remarks"] },
    PO_BEFORE_INVOICE_NON_ADV: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "vendor_ID", "vendorCode", "vendorName", "paymentSubCategory_code", "userDivisionRepresentativeName", "poNumber", "invoices"], optional: ["remarks", "whtCertificateReference"] },
    PO_BEFORE_INVOICE_NON_ADV_LIAB: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "vendor_ID", "vendorCode", "vendorName", "paymentSubCategory_code", "userDivisionRepresentativeName", "poNumber", "invoices"], optional: ["remarks", "whtCertificateReference"] },
    PO_AFTER_INVOICE_NON_ADV: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "vendor_ID", "vendorCode", "vendorName", "paymentSubCategory_code", "userDivisionRepresentativeName", "poNumber", "invoices"], optional: ["remarks", "whtCertificateReference"] },
    PO_AFTER_INVOICE_NON_ADV_LIAB: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "vendor_ID", "vendorCode", "vendorName", "paymentSubCategory_code", "userDivisionRepresentativeName", "poNumber", "invoices"], optional: ["remarks", "whtCertificateReference"] },
    PO_BEFORE_INVOICE_ADVANCE: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "vendor_ID", "vendorCode", "vendorName", "paymentSubCategory_code", "userDivisionRepresentativeName", "poNumber", "invoices"], optional: ["remarks"] },
    PO_AFTER_INVOICE_ADVANCE: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "vendor_ID", "vendorCode", "vendorName", "paymentSubCategory_code", "userDivisionRepresentativeName", "poNumber", "invoices"], optional: ["remarks"] },
    PO_BEFORE_INVOICE_ADV_STLMT: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "vendor_ID", "vendorCode", "vendorName", "paymentSubCategory_code", "userDivisionRepresentativeName", "poNumber", "remainingBalanceAfterAdvanceSettlement", "invoices"], optional: ["remarks"] },
    "PO_BEFORE_INVOICE_ADV_STLMT_100%": { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "vendor_ID", "vendorCode", "vendorName", "paymentSubCategory_code", "userDivisionRepresentativeName", "poNumber", "remainingBalanceAfterAdvanceSettlement", "invoices"], optional: ["remarks"] },
    PO_AFTER_INVOICE_ADV_STLMT: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "vendor_ID", "vendorCode", "vendorName", "paymentSubCategory_code", "userDivisionRepresentativeName", "poNumber", "remainingBalanceAfterAdvanceSettlement", "invoices"], optional: ["remarks"] },
    "PO_AFTER_INVOICE_ADV_STLMT_100%": { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "vendor_ID", "vendorCode", "vendorName", "paymentSubCategory_code", "userDivisionRepresentativeName", "poNumber", "remainingBalanceAfterAdvanceSettlement", "invoices"], optional: ["remarks"] },
    NON_PO_DIRECT_OFN_AUTHORITY: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "vendor_ID", "vendorCode", "vendorName", "invoiceDate", "invoiceNumber", "costCentre", "profitCentre", "paymentMethod_code", "totalValue", "ofnReference", "siteId", "wbsElement", "totalRentValue", "totalSupervisionValue", "securityDepositValue", "siteName"], optional: ["remarks"] },
    NON_PO_ADV_SETTLE_OFN_OTHER: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "vendor_ID", "vendorCode", "vendorName", "invoiceDate", "invoiceNumber", "costCentre", "profitCentre", "paymentMethod_code", "totalValue", "ofnReference", "siteId", "wbsElement", "totalRentValue", "totalSupervisionValue", "securityDepositValue", "siteName"], optional: ["remarks"] },
    NON_PO_DIRECT_FOREIGN_TRAVEL: { required: ["paymentCategory_code", "businessEntity_code", "directForeignTravelEntries"], optional: ["remarks"] },
    NON_PO_FUEL_STAFF: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "fuelInclVat", "highestValueInFile"], optional: ["taxi", "remarks"] },
    NON_PO_FUEL_GENERATOR: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "fuelInclVat", "highestValueInFile"], optional: ["taxi", "remarks"] },
    NON_PO_IDEAMART: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "customer_ID", "customerCode", "customerName", "invoiceDebitNoteDate", "invoiceDebitNoteNumber", "totalPaymentValueForMonth", "userDivisionRepresentativeName", "whtNicHighestTransactionValue", "lessThan100kNicBlankHighestTransactionValue", "retentionRepaymentValue"], optional: ["brcHighestTransactionValue", "remarks"] },
    NON_PO_APPMAKER: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "customer_ID", "customerCode", "customerName", "invoiceDebitNoteDate", "invoiceDebitNoteNumber", "totalPaymentValueForMonth", "userDivisionRepresentativeName", "whtNicHighestTransactionValue", "lessThan100kNicBlankHighestTransactionValue", "retentionRepaymentValue"], optional: ["brcHighestTransactionValue", "remarks"] },
    NON_PO_CUSTOMER_REFUNDS: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "highestRefundValueOfFile"], optional: ["remarks"] },
    NON_PO_STELACOM_CONSIGNMENT: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "vendor_ID", "vendorCode", "vendorName", "totalInvoiceValue", "invoiceNumber", "invoiceDate", "liabilityBookingDocumentNumber"], optional: ["remarks"] },
    NON_PO_SITE_SHARE_LIABILITY: { required: ["paymentCategory_code", "businessEntity_code", "category_code", "currency_code", "vendor_ID", "vendorCode", "vendorName", "invoiceDate", "invoiceNumber", "totalInvoiceValue", "invoiceDescription"], optional: ["remarks"] },
    NON_PO_SITE_SHARING_SETOFF: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "vendorCode", "vendorName"], optional: ["remarks"] },
    "NON_PO_SITE_SHARING_SETOFF&PAY": { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "vendorCode", "vendorName"], optional: ["remarks"] },
    NON_PO_SITE_RENT_TAX_INVOICE: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "vendor_ID", "vendorCode", "vendorName", "totalInvoiceValue", "invoiceNumber", "invoiceDate"], optional: ["remarks"] },
    NON_PO_SITE_RENT_MONTHLY_FILE: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "highestMonthlyRentalValueInFile", "totalFileValue", "invoiceDescription"], optional: ["remarks"] },
    NON_PO_SITE_RENT_STAMP_ADHOC: { required: ["paymentCategory_code", "businessEntity_code", "vendor_ID", "vendorCode", "vendorName", "currency_code", "totalPayableValue", "paymentDescription"], optional: ["invoiceDate", "invoiceNumber", "siteId", "siteName", "remarks"] },
    DIRECT_NON_PO_REIMB_LIAB: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "authorityVendorCode", "authorityVendorName", "employeeVendorCode", "employeeVendorName", "invoiceDate", "invoiceNumber", "costCentre", "wbsElement", "totalValue", "ofnReference", "siteId", "siteName"], optional: ["remarks"] },
    DIRECT_NON_PO_REIMB_PAYMENT: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "authorityVendorCode", "authorityVendorName", "employeeVendorCode", "employeeVendorName", "invoiceDate", "invoiceNumber", "costCentre", "wbsElement", "totalValue", "ofnReference", "siteId", "siteName"], optional: ["remarks"] },
    DIRECT_FOREIGN_TRAVEL_REIMB: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "nameEmpNo", "designation", "purposeOfTrip", "month", "country", "budgetCode", "employeeVendorCode", "employeeVendorName", "balanceToBeReturned", "totalAmountLKR", "travelExpenses"], optional: ["transactionDate", "totalAmountForeignCurrency", "remarks"] },
    NON_PO_TAX_LIAB_PAY_OTTP: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "requestingDivision_code", "vendor_ID", "vendorCode", "vendorName", "taxType", "reference", "totalTaxPayable", "tin", "taxDueDate", "glBreakups"], optional: ["remarks", "din"] },
    NON_PO_TAX_LIAB_PAY_PAYORDER: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "requestingDivision_code", "vendor_ID", "vendorCode", "vendorName", "taxType", "reference", "totalTaxPayable", "tin", "taxDueDate", "glBreakups"], optional: ["remarks", "din"] },
    NON_PO_INTERCONNECT_LIAB: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "customer_ID", "customerCode", "customerName", "invoiceDebitNoteDate", "invoiceDebitNoteNumber", "totalInvoiceValueRelevantCurrency", "totalInvoiceValueLKR"], optional: ["vatAmount", "remarks"] },
    NON_PO_INTERCONNECTION_PAY: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "customer_ID", "customerCode", "customerName"], optional: ["remarks", "whtCertificateReference"] },
    NON_PO_ROAMING_PAY: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "customer_ID", "customerCode", "customerName"], optional: ["remarks", "whtCertificateReference"] },
    NON_PO_ROAMING_LIABILITY: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "customer_ID", "customerCode", "customerName", "totalInvoiceValueRelevantCurrency", "totalInvoiceValueLKR"], optional: [] },
    NON_PO_STAR_POINT_PAYMENTS: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "highestPayableValueInList", "ivDocumentPostingDate"], optional: ["remarks"] },
    NON_PO_IMPORT_TRC: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "vendor_ID", "vendorCode", "vendorName", "trcslProformaInvoiceDate", "typeOfPayment_code", "trcslProformaInvoiceTotalValue"], optional: ["poNumber", "budgetCode", "remarks"] },
    NON_PO_IMPORT_ICL: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "vendor_ID", "vendorCode", "vendorName", "pivDate", "pivApplicationNumber", "totalPivValue"], optional: ["remarks"] },
    NON_PO_IMPORT_DGC_ADV: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "vendor_ID", "vendorCode", "vendorName", "cusdecDate", "cusdecNumber", "poNumber", "totalDeclarationValueInCusdec"], optional: ["remarks"] },
    NON_PO_IMPORT_DGC_DIRECT: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "vendor_ID", "vendorCode", "vendorName", "cusdecDate", "cusdecNumber", "poNumber", "totalDeclarationValueInCusdec"], optional: ["remarks"] },
    NON_PO_CC_PAYMENT: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "ccCustodianName", "vendor_ID", "vendorCode", "vendorName", "whtEligibilityConfirmation", "poNumber", "sesReference", "transactionAmountDocumentCurrency", "transactionAmountLocalCurrency", "descriptionOfPayment", "justificationForCreditCardUse"], optional: ["invoiceDate", "invoiceNumber", "budgetCode", "remarks"] },
    NON_PO_CC_SETTLEMENT: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "bankName", "ccCustodianName", "ccPeriodFromDate", "ccPeriodToDate", "settlementEntries", "stampDuty", "latePaymentFee", "interestCharges", "totalAmountPayableCcSettlement"], optional: ["annualFee", "remarks"] },
    NON_PO_MERCHANT_SETTLEMENTS: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "merchantEntityValues", "highestValueInExcel", "aggregateTotalValueAcrossAllFiles", "processingBankAccountDetails"], optional: [] },
    NON_PO_MISC_RECEIPTS: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "depositedAmount"], optional: ["vendor_ID", "vendorCode", "vendorName", "costCentre", "remarks"] },
    PO_ZERO_IV: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "zeroIvUserConfirmationAttached"], optional: ["remarks"] },
    BANK_GUARANTEE: { required: ["paymentCategory_code", "businessEntity_code", "currency_code", "amountPayable", "guaranteeType_code", "beneficiaryName", "beneficiaryAddress", "commencingDate", "expiryDate", "claimDate", "tenderDate", "expectedDate", "purposeOfBankGuarantee", "bidTenderReference", "collectorName", "collectorNic", "collectorContactNumber", "specificBgFormatAvailable"], optional: ["remarks"] }
  };

  // Names retained in the reference data for legacy variants.  Flowmate's
  // request form treats these as the same field sets as their newer names.
  const SUBTYPE_ALIASES = {
    FTK_FACTORING_PENDING_UAC: "FTK_FACTORING_PO_VALIDATION",
    NON_PO_IDEAMART_APPMAKER: "NON_PO_IDEAMART",
    DIRECT_NON_PO_REIMBURSEMENTS: "DIRECT_NON_PO_REIMB_PAYMENT",
    NON_PO_TAX_LIABILITY_PAYMENT: "NON_PO_TAX_LIAB_PAY_OTTP",
    NON_PO_INTERCONNECT_ROAM_PAY: "NON_PO_INTERCONNECTION_PAY",
    NON_PO_IMPORT_DGC_ADV_DIRECT: "NON_PO_IMPORT_DGC_ADV",
    NON_PO_CC_PAY_SETTLEMENT: "NON_PO_CC_SETTLEMENT"
  };

  const REQUIRED = {
    payment: ["paymentCategory_code", "businessEntity_code"],
    currency: ["currency_code"],
    vendor: ["vendor_ID", "vendorCode", "vendorName"],
    customer: ["customer_ID", "customerCode", "customerName"]
  };

  const KNOWN_FIELDS = {};
  [COMMON, VENDOR, CUSTOMER, PO, OFN, NON_PO, TRAVEL, TAX, CREDIT_CARD, MERCHANT, BANK_GUARANTEE]
    .flat()
    .forEach(function (definition) {
      if (!KNOWN_FIELDS[definition.name]) {
        KNOWN_FIELDS[definition.name] = definition;
      }
    });
  Object.assign(KNOWN_FIELDS, FLOWMATE_FIELD_OVERRIDES);

  const labelFromName = function (name) {
    return String(name || "")
      .replace(/_code$/, "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/_/g, " ")
      .replace(/^./, function (value) { return value.toUpperCase(); });
  };

  const exactFields = function (subtype) {
    const rule = SUBTYPE_FIELDS[subtype] || SUBTYPE_FIELDS[SUBTYPE_ALIASES[subtype]];
    if (!rule) {
      return null;
    }
    const required = new Set(rule.required || []);
    const names = Array.from(new Set([].concat(rule.required || [], rule.optional || [])));
    return names.map(function (name) {
      const definition = KNOWN_FIELDS[name] || field(name, labelFromName(name),
        /Date$/.test(name) ? "date" : (/Value|Amount|Fee|Charges|Days|Number$/.test(name) ? "number" : "input"));
      return Object.assign({}, definition, { required: required.has(name) });
    });
  };

  const allFields = function (code) {
    const subtype = String(code || "");
    const exact = exactFields(subtype);
    if (exact) {
      return exact;
    }
    const fields = [];
    const add = function (list) {
      list.forEach(function (definition) {
        if (!fields.some(function (entry) { return entry.name === definition.name; })) {
          fields.push(Object.assign({}, definition));
        }
      });
    };
    add(COMMON);
    if (subtype.startsWith("FTK_")) {
      add(VENDOR);
      add([field("amountPayable", "Amount Payable", "number")]);
    }
    if (subtype.startsWith("PO_")) {
      add(PO);
      add(VENDOR);
      add([field("amountPayable", "Amount Payable", "number")]);
    }
    if (subtype.startsWith("NON_PO_") || subtype.startsWith("DIRECT_NON_PO")) {
      add(NON_PO);
      add(VENDOR);
    }
    if (subtype.includes("OFN") || subtype.includes("SITE_RENT") || subtype.includes("SITE_SHARE")) {
      add(OFN);
      add(VENDOR);
    }
    if (subtype.includes("DIRECT_FOREIGN_TRAVEL") || subtype.includes("FOREIGN_TRAVEL")) {
      add(TRAVEL);
    }
    if (subtype.includes("TAX_LIAB")) {
      add(TAX);
      add(VENDOR);
    }
    if (subtype.includes("INTERCONNECT") || subtype.includes("ROAMING")) {
      add(CUSTOMER);
      add([field("totalInvoiceValueRelevantCurrency", "Total Invoice Value (Relevant Currency)", "number"),
        field("totalInvoiceValueLKR", "Total Invoice Value (LKR)", "number"),
        field("vatAmount", "VAT Amount", "number")]);
    }
    if (subtype.includes("IDEAMART") || subtype.includes("APPMAKER") || subtype.includes("CUSTOMER_REFUNDS")) {
      add(CUSTOMER);
      add([field("brcHighestTransactionValue", "BRC Highest Transaction Value", "number"),
        field("whtNicHighestTransactionValue", "WHT NIC Highest Transaction Value", "number"),
        field("lessThan100kNicBlankHighestTransactionValue", "Below 100K NIC Value", "number"),
        field("totalPaymentValueForMonth", "Total Payment Value for Month", "number"),
        field("retentionRepaymentValue", "Retention Repayment Value", "number"),
        field("highestRefundValueOfFile", "Highest Refund Value", "number")]);
    }
    if (subtype.includes("CC_")) {
      add(CREDIT_CARD);
      add(VENDOR);
    }
    if (subtype.includes("MERCHANT")) {
      add(MERCHANT);
    }
    if (subtype === "BANK_GUARANTEE") {
      add(BANK_GUARANTEE);
    }
    add([field("remarks", "Remarks", "textarea")]);

    const required = new Set(REQUIRED.payment);
    if (!subtype.startsWith("FTK_FACTORING") && !subtype.startsWith("FTK_SERVICE")) {
      REQUIRED.currency.forEach(function (name) { required.add(name); });
    }
    if (subtype.startsWith("PO_") || subtype.includes("STELACOM") || subtype.includes("SITE_")) {
      REQUIRED.vendor.forEach(function (name) { required.add(name); });
    }
    if (subtype.includes("INTERCONNECT") || subtype.includes("ROAMING") || subtype.includes("IDEAMART")
      || subtype.includes("APPMAKER") || subtype.includes("CUSTOMER_REFUNDS")) {
      REQUIRED.customer.forEach(function (name) { required.add(name); });
    }
    if (subtype === "BANK_GUARANTEE") {
      ["amountPayable", "guaranteeType_code", "beneficiaryName", "beneficiaryAddress", "commencingDate",
        "expiryDate", "claimDate", "tenderDate", "expectedDate", "purposeOfBankGuarantee",
        "bidTenderReference", "collectorName", "collectorNic", "collectorContactNumber",
        "specificBgFormatAvailable"].forEach(function (name) { required.add(name); });
    }
    return fields.map(function (definition) {
      definition.required = required.has(definition.name);
      return definition;
    });
  };

  return {
    getFields: allFields
  };
});
