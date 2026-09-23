sap.ui.define([], function () {
  "use strict";

  const field = (name, label, type, extra) => Object.assign({
    name,
    label,
    type: type || "input",
    required: false,
    placeholder: ""
  }, extra || {});

  const transactionType = field("transactionType", "Transaction Type", "select", {
    required: true,
    options: [
      { key: "NEW", text: "New" },
      { key: "MODIFICATION", text: "Modification" }
    ]
  });
  const plant = field("plant_code", "Plant", "combo", {
    required: true,
    entity: "Plant", key: "plantCode", text: "plantName"
  });
  const uom = field("unitOfMeasure_code", "Unit of Measure", "combo", {
    required: true,
    entity: "UnitsOfMeasure"
  });
  const vendor = field("vendor_ID", "Vendor", "combo", {
    entity: "Vendors",
    key: "ID",
    text: "vendorName",
    secondaryText: "vendorCode"
  });

  const materialBase = [
    transactionType,
    field("industrySector", "Industry Sector", "select", {
      required: true,
      options: [{ key: "TELECOMMUNICATION", text: "Telecommunication" }]
    }),
    field("materialType", "Material Type", "combo", { required: true, entity: "MaterialTypes" }),
    field("referenceMaterialCode", "Reference Material Code", "input", {
      placeholder: "Optional existing SAP material code"
    }),
    plant,
    field("description", "Material Description", "input", {
      required: true,
      maxLength: 40,
      placeholder: "Maximum 40 characters"
    }),
    uom,
    field("materialGroup_code", "Material Group", "combo", {
      required: true,
      entity: "MatGroup", key: "matGroupCode", text: "matGroupDescription"
    }),
    field("externalMaterialGroup_code", "External Material Group", "combo", {
      entity: "ExternalMaterialGroups"
    }),
    field("profitCenter_code", "Profit Center", "combo", {
      required: true,
      entity: "ProfitCenter", key: "profitCenterCode", text: "profitCenterDescription"
    }),
    field("snp", "SNP", "input"),
    field("hsCode", "HS Code", "input"),
    field("valuationClass_code", "Valuation Class", "combo", {
      entity: "ValuationClass", key: "valuationclassCode", text: "valuationclassDescription"
    }),
    field("coupaCommodityCode_code", "Coupa Commodity Code", "combo", {
      entity: "CoupaCommodityCodes"
    }),
    field("grProcessingTime", "GR Processing Time", "input"),
    field("perUnitPrice", "Per Unit Price", "number"),
    field("approvalDocumentsAttachment", "Approval Documents Attachment", "file", {
      required: true
    }),
    field("mrpType", "MRP Type", "combo", { required: true, entity: "MRPType", key: "mrpTypeCode", text: "mrpTypeDescription" }),
    field("availabilityCheck", "Availability Check", "combo", { required: true, entity: "AvailabilityCheck", key: "availabilityCheckCode", text: "availabilityCheckDescription" })
  ];

  const definitions = {
    MAT_ENG_IT: materialBase,
    MAT_ADMIN_CONS: materialBase,
    MAT_ZTRD_NEW: [
      field("transactionType", "Transaction Type", "select", {
        required: true,
        options: [{ key: "NEW", text: "New Trading Material" }]
      }),
      field("referenceMaterialCode", "Reference Material Code", "input"),
      field("dmsUpdate", "DMS Update Required", "checkbox"),
      plant,
      field("storageLocation", "Storage Location", "combo", { entity: "StorageLocation", key: "storageLocationCode", text: "storageLocationName" }),
      field("salesOrganization", "Sales Org", "combo", { entity: "SalesOrg", key: "salesOrgCode", text: "salesOrgName" }),
      field("distributionChannel", "Distribution Channel", "combo", { entity: "DistributionChannel", key: "distributionChannelCode", text: "distributionChannelDescription" }),
      field("description", "Material Description", "input", {
        required: true,
        maxLength: 40
      }),
      field("materialGroup_code", "Material Group", "combo", {
        required: true,
        entity: "MatGroup", key: "matGroupCode", text: "matGroupDescription"
      }),
      field("externalMaterialGroup_code", "External Material Group", "combo", {
        entity: "ExternalMaterialGroups"
      }),
      field("division", "Division", "combo", { entity: "Divisions", key: "divisionCode", text: "divisionName" }),
      field("deliveringPlant_code", "Delivering Plant", "combo", {
        entity: "Plant", key: "plantCode", text: "plantName"
      }),
      field("taxClass", "Tax Class", "input"),
      field("accountAssignmentGroup", "Account Assignment Group", "input"),
      field("productHierarchy", "Product Hierarchy", "input"),
      field("profitCenter_code", "Profit Center", "combo", {
        entity: "ProfitCenter", key: "profitCenterCode", text: "profitCenterDescription"
      }),
      field("serialNumberProfile", "Serial Number Profile", "combo", { entity: "SerialNumberProfile", key: "serialNumberProfileCode", text: "serialNumberProfileDescription" }),
      field("inspectionStock", "Post to Inspection Stock", "checkbox"),
      field("sourceList", "Source List", "checkbox"),
      field("commodityImportCode", "Commodity / Import Code", "input"),
      field("valuationClass_code", "Valuation Class", "combo", {
        entity: "ValuationClass", key: "valuationclassCode", text: "valuationclassDescription"
      }),
      field("itemName", "DMS Item Name", "input"),
      field("itemCategory", "DMS Item Category", "input"),
      field("unitsPerItem", "Units per Item", "number"),
      field("unitPrice", "Unit Price", "number"),
      field("taxPercentage", "Tax Percentage", "number"),
      field("isSaleable", "Saleable", "checkbox"),
      field("isSerialized", "Serialized", "checkbox"),
      field("requiredAgents", "Required Agents", "input"),
      vendor,
      field("defaultWarrantyPeriod", "Default Warranty Period", "number"),
      field("warrantyType", "Warranty Type", "input"),
      field("valueType", "Value Type", "input"),
      field("sbu", "SBU", "input"),
      field("configurationId", "Configuration ID", "input"),
      field("grProcessingTime", "GR Processing Time", "input"),
      field("approvalDocumentsAttachment", "Approval Documents Attachment", "file", {
        required: true
      }),
      field("dmsSapMaterialCode", "DMS - SAP Material Code", "input", {
        required: true
      })
    ],
    MAT_ZTRD_EXISTING: [
      field("transactionType", "Change Type", "select", {
        required: true,
        options: [
          { key: "CHANGE", text: "Change" },
          { key: "EXTENSION", text: "Extension" },
          { key: "DMS_UPDATE", text: "DMS Update" }
        ]
      }),
      field("referenceMaterialCode", "Existing Material Code", "input", {
        required: true
      }),
      field("dmsUpdate", "DMS Update Required", "checkbox"),
      field("itemName", "DMS Item Name", "input"),
      field("itemCategory", "DMS Item Category", "input"),
      field("unitsPerItem", "Units per Item", "number"),
      field("unitPrice", "Unit Price", "number"),
      field("taxPercentage", "Tax Percentage", "number"),
      field("isSaleable", "Saleable", "checkbox"),
      field("isSerialized", "Serialized", "checkbox"),
      field("requiredAgents", "Required Agents", "input"),
      vendor,
      field("defaultWarrantyPeriod", "Default Warranty Period", "number"),
      field("warrantyType", "Warranty Type", "input"),
      field("valueType", "Value Type", "input"),
      field("sbu", "SBU", "input"),
      field("configurationId", "Configuration ID", "input"),
      field("grProcessingTime", "GR Processing Time", "input"),
      field("approvalDocumentsAttachment", "Approval Documents Attachment", "file", {
        required: true
      }),
      field("dmsSapMaterialCode", "DMS - SAP Material Code", "input", {
        required: true
      })
    ],
    SVC_NEW: [
      transactionType,
      field("serviceCategory", "Service Category", "combo", { required: true, entity: "ServiceCategories", text: "description" }),
      field("serviceDescription", "Service Description", "input", {
        required: true,
        maxLength: 40
      }),
      uom,
      field("serviceGroup_code", "Service Group", "combo", {
        required: true,
        entity: "ServiceGroups", key: "servicegroupCode", text: "servicegroupDescription"
      }),
      field("valuationClass_code", "Valuation Class", "combo", {
        entity: "ValuationClass", key: "valuationclassCode", text: "valuationclassDescription"
      }),
      field("coupaCommodityCode_code", "Coupa Commodity Code", "combo", {
        entity: "CoupaCommodityCodes"
      }),
      field("supportingAttachment", "Supporting Attachment", "file"),
      field("remarks", "Remarks", "textarea")
    ],
    SVC_EXISTING: [
      transactionType,
      field("referenceServiceCode", "Existing Service Code", "input", {
        required: true
      }),
      field("serviceDescription", "Requested Description", "input", {
        maxLength: 40
      }),
      uom,
      field("serviceGroup_code", "Service Group", "combo", {
        entity: "ServiceGroups", key: "servicegroupCode", text: "servicegroupDescription"
      }),
      field("supportingAttachment", "Supporting Attachment", "file"),
      field("remarks", "Remarks", "textarea")
    ],
    EQP_NEW: [
      transactionType,
      field("siteId", "Site ID", "combo", {
        required: true,
        entity: "Sites", key: "siteId", text: "siteName",
        autoFills: { field: "siteName", from: "name" }
      }),
      field("siteName", "Site Name", "readonly", {
        required: true,
        placeholder: "Filled from the selected Site ID"
      }),
      field("materialCode", "Material Code", "combo", {
        required: true,
        entity: "Materials", key: "materialCode", text: "materialDescription",
        autoFills: { field: "materialDescription", from: "name" }
      }),
      field("materialDescription", "Material Description", "readonly", {
        required: true,
        placeholder: "Filled from the selected Material Code"
      }),
      field("serialNumber", "Serial Number", "input", { required: true }),
      field("wbsElement", "WBS Element", "combo", { entity: "Wbs", key: "wbsCode", text: "wbsDescription" }),
      field("commissionedDate", "Commissioned Date", "date"),
      field("remarks", "Remarks", "textarea"),
      field("supportingAttachment", "Supporting Attachment", "file")
    ],
    EQP_EXISTING: [
      transactionType,
      field("siteId", "Site ID", "combo", {
        required: true,
        entity: "Sites", key: "siteId", text: "siteName",
        autoFills: { field: "siteName", from: "name" }
      }),
      field("siteName", "Site Name", "readonly", {
        required: true,
        placeholder: "Filled from the selected Site ID"
      }),
      field("materialCode", "Material Code", "combo", {
        required: true,
        entity: "Materials", key: "materialCode", text: "materialDescription",
        autoFills: { field: "materialDescription", from: "name" }
      }),
      field("materialDescription", "Material Description", "readonly", {
        required: true,
        placeholder: "Filled from the selected Material Code"
      }),
      field("serialNumber", "Serial Number", "input", { required: true }),
      field("wbsElement", "WBS Element", "combo", { entity: "Wbs", key: "wbsCode", text: "wbsDescription" }),
      field("commissionedDate", "Commissioned Date", "date"),
      field("approver_ID", "Approver", "combo", {
        required: true,
        entity: "Users",
        key: "ID",
        text: "displayName",
        secondaryText: "email"
      }),
      field("remarks", "Remarks", "textarea"),
      field("supportingAttachment", "Supporting Attachment", "file")
    ],
    PROJECT_NEW_MOD: [
      field("selectionMode", "Selection", "select", {
        required: true,
        options: [
          { key: "SINGLE", text: "Single" },
          { key: "BULK", text: "Bulk" }
        ]
      }),
      transactionType,
      field("requestedByArea", "Requested By", "select", {
        options: [
          { key: "ENGINEERING", text: "Engineering" },
          { key: "NON_ENGINEERING", text: "Non-Engineering" }
        ]
      }),
      field("functionLocationRequired", "Function Location Required", "checkbox"),
      field("activityRequired", "Activity Required", "checkbox"),
      field("projectName", "Project Name", "input", { required: true }),
      vendor,
      field("scope", "Scope", "combo", { required: true, entity: "ProjectScopes" }),
      field("entityCode", "Entity", "combo", { entity: "BusinessEntities" }),
      field("projectType_code", "Project Type", "combo", {
        entity: "ProjectTypes"
      }),
      field("arReference", "AR Reference", "combo", { entity: "ArReferences" }),
      field("siteId", "Site ID", "combo", {
        required: true,
        entity: "Sites", key: "siteId", text: "siteName",
        autoFills: { field: "siteName", from: "name" }
      }),
      field("siteName", "Site Name", "readonly", {
        required: true,
        placeholder: "Filled from the selected Site ID"
      }),
      field("projectId", "Project ID", "readonly", {
        placeholder: "Derived by BTP once the integration is live"
      }),
      field("projectCategory", "Project Category", "combo", { entity: "ProjectCategories" }),
      field("projectDescription", "Project Description", "readonly", {
        placeholder: "Derived by BTP once the integration is live"
      }),
      field("remarks", "Remarks", "textarea"),
      field("supportingAttachment", "Supporting Attachment", "file")
    ],
    PROJECT_FL_ACTIVITY: [
      field("transactionType", "Object Type", "select", {
        required: true,
        options: [
          { key: "FUNCTION_LOCATION", text: "Function Location" },
          { key: "ACTIVITY", text: "Activity" }
        ]
      }),
      field("projectName", "Project Name", "input", { required: true }),
      field("functionLocation", "Function Location", "input"),
      field("activityNumber", "Activity Number", "input"),
      field("scope", "Scope", "combo", { entity: "ProjectScopes" }),
      field("remarks", "Remarks", "textarea"),
      field("supportingAttachment", "Supporting Attachment", "file")
    ],
    RES_DIRECT: [
      field("project", "Project", "combo", { required: true, entity: "ReservationProjects" }),
      field("batch", "Batch", "combo", { entity: "ReservationBatches" }),
      field("engineeringType", "Engineering Type", "select", {
        options: [
          { key: "ENGINEERING", text: "Engineering" },
          { key: "NON_ENGINEERING", text: "Non-Engineering" }
        ]
      }),
      field("requestType", "Request Type", "input"),
      field("deliveryType", "Delivery Type", "select", {
        required: true,
        options: [{ key: "DIRECT", text: "Direct Delivery" }]
      }),
      field("warehouse_code", "Warehouse", "combo", {
        entity: "Warehouses"
      }),
      field("allocationOwner_ID", "Vendor Allocation Owner", "combo", {
        entity: "Users",
        key: "ID",
        text: "displayName",
        secondaryText: "email"
      }),
      field("remarks", "Remarks", "textarea"),
      field("supportingAttachment", "Supporting Attachment", "file")
    ],
    RES_WAREHOUSE: [
      field("project", "Project", "combo", { required: true, entity: "ReservationProjects" }),
      field("batch", "Batch", "combo", { entity: "ReservationBatches" }),
      field("engineeringType", "Engineering Type", "select", {
        options: [
          { key: "ENGINEERING", text: "Engineering" },
          { key: "NON_ENGINEERING", text: "Non-Engineering" }
        ]
      }),
      field("requestType", "Request Type", "input"),
      field("deliveryType", "Delivery Type", "select", {
        required: true,
        options: [{ key: "WAREHOUSE", text: "Warehouse" }]
      }),
      field("warehouse_code", "Warehouse", "combo", {
        required: true,
        entity: "Warehouses"
      }),
      field("allocationOwner_ID", "Vendor Allocation Owner", "combo", {
        required: true,
        entity: "Users",
        key: "ID",
        text: "displayName",
        secondaryText: "email"
      }),
      field("remarks", "Remarks", "textarea"),
      field("supportingAttachment", "Supporting Attachment", "file")
    ],
    CONTRACT_NEW: [
      field("transactionType", "Contract Action", "select", {
        required: true,
        options: [{ key: "NEW_CONTRACT", text: "New Contract Creation" }]
      }),
      field("selectionMode", "Selection", "select", {
        options: [
          { key: "SINGLE", text: "Single" },
          { key: "MULTIPLE", text: "Multiple" }
        ]
      }),
      field("category_code", "Contract Category", "combo", {
        required: true,
        entity: "ContractCategories"
      }),
      field("approvalReference", "Approval Reference", "input"),
      field("remarks", "Remarks", "textarea"),
      field("approvalDocumentsAttachment", "Approval Documents Attachment", "file", {
        required: true
      }),
      field("otherSupportingDocumentsAttachment", "Other Supporting Documents", "file"),
      field("otherComments", "Other Comments", "textarea"),
      field("contractCount", "Contract Count", "number", { required: true }),
      field("scmSpocUserId", "User ID - SCM SPOC", "input", { required: true }),
      field("totalTargetValue", "Total Target Value (Contract Ceiling)", "number", {
        required: true
      }),
      field("sapVendorCode", "SAP Header - Vendor Code", "input", { required: true }),
      field("sapSourcingEventNo", "SAP Header - Sourcing Event No.", "input", {
        required: true
      }),
      field("sapPoHeaderText", "SAP Header - PO Header Text", "textarea", {
        required: true
      }),
      field("sapPaymentTerms", "SAP Header - Payment Terms", "input", { required: true }),
      field("sapWarranty", "SAP Header - Warranty", "textarea"),
      field("sapPenalties", "SAP Header - Penalties for Breach of Contract (LD / Service Credits)", "textarea"),
      field("sapTermsOfDelivery", "SAP Header - Terms of Delivery / Delivery SLA", "textarea"),
      field("sapGuarantees", "SAP Header - Guarantees / Performance Bond", "textarea"),
      field("sapOtherCommercialTerms", "SAP Header - Any Other Commercial Terms for PO", "textarea")
    ],
    CONTRACT_MOD: [
      field("transactionType", "Contract Action", "select", {
        required: true,
        options: [
          { key: "HEADER_CHANGE", text: "Contract Header Change" },
          { key: "AMENDMENT", text: "Contract Amendment" }
        ]
      }),
      field("selectionMode", "Selection", "select", {
        options: [
          { key: "SINGLE", text: "Single" },
          { key: "MULTIPLE", text: "Multiple" }
        ]
      }),
      field("contractNumber", "Contract Number", "input", { required: true }),
      field("category_code", "Contract Category", "combo", {
        required: true,
        entity: "ContractCategories"
      }),
      field("approvalReference", "Approval Reference", "input"),
      field("remarks", "Remarks", "textarea"),
      field("approvalDocumentsAttachment", "Approval Documents Attachment", "file", {
        required: true
      }),
      field("otherSupportingDocumentsAttachment", "Other Supporting Documents", "file"),
      field("otherComments", "Other Comments", "textarea"),
      field("contractCount", "Contract Count", "number", { required: true }),
      field("scmSpocUserId", "User ID - SCM SPOC", "input", { required: true }),
      field("totalTargetValue", "Total Target Value (Contract Ceiling)", "number", {
        required: true
      }),
      field("sapVendorCode", "SAP Header - Vendor Code", "input", { required: true }),
      field("sapSourcingEventNo", "SAP Header - Sourcing Event No.", "input", {
        required: true
      }),
      field("sapPoHeaderText", "SAP Header - PO Header Text", "textarea", {
        required: true
      }),
      field("sapPaymentTerms", "SAP Header - Payment Terms", "input", { required: true }),
      field("sapWarranty", "SAP Header - Warranty", "textarea"),
      field("sapPenalties", "SAP Header - Penalties for Breach of Contract (LD / Service Credits)", "textarea"),
      field("sapTermsOfDelivery", "SAP Header - Terms of Delivery / Delivery SLA", "textarea"),
      field("sapGuarantees", "SAP Header - Guarantees / Performance Bond", "textarea"),
      field("sapOtherCommercialTerms", "SAP Header - Any Other Commercial Terms for PO", "textarea")
    ],
    PO_CAPEX_IM: [],
    PO_CAPEX_FM: [],
    PO_OPEX: [],
    SES_NEW: [],
    SES_MOD: []
  };


  const requesterFields = [
    field("requesterName", "Requester Name", "readonly", { source: "request" }),
    field("requesterEmail", "Requester Email", "readonly", { source: "request" }),
    field("requestDateTime", "Request Date & Time", "readonly", { source: "request" })
  ];
  const poFields = [
    field("selectionMode", "Selection", "select", {
      required: true,
      options: [
        { key: "SINGLE", text: "Single" },
        { key: "MULTIPLE", text: "Multiple" }
      ]
    }),
    field("purchaseOrderType_code", "PO Type", "combo", {
      required: true,
      entity: "PurchaseOrderTypes"
    }),
    field("contractBased", "Contract Based PO", "checkbox"),
    field("contractNumber", "Contract Number", "input"),
    field("procurementCategory_code", "Procurement Category", "combo", {
      required: true,
      entity: "ProcurementCategories"
    }),
    field("division", "Division", "combo", { entity: "Divisions", key: "divisionCode", text: "divisionName" }),
    field("delegatedUser_ID", "Delegation User", "combo", {
      entity: "Users",
      key: "ID",
      text: "displayName",
      secondaryText: "email"
    }),
    field("specialPersonArea", "Special Person Area", "select", {
      options: ["FTK", "ENGINEERING", "IT", "DBS", "MARKETING", "FOC", "DNS"].map(function (key) {
        return { key, text: key };
      })
    }),
    field("arNumber", "AR Number", "input"),
    field("wbsElement", "WBS Element", "combo", { entity: "Wbs", key: "wbsCode", text: "wbsDescription" }),
    field("documentType", "Document Type", "combo", { entity: "DocumentTypes", key: "documentTypeCode", text: "documentTypeDescription" }),
    field("taxApplicable", "Tax Applicable", "checkbox"),
    field("clearanceChargeApplicable", "Clearance Charge Applicable", "checkbox"),
    field("materialImported", "Material Imported", "checkbox"),
    field("sesRequired", "Create SES Successor", "checkbox"),
    field("paymentRequestRequired", "Create Payment Successor", "checkbox"),
    field("poHeaderText", "PO Header Text", "textarea"),
    field("campaignLocationCode", "Campaign / Location Code", "combo", { entity: "Sites", key: "siteId", text: "siteName" }),
    field("procurementDescription", "Procurement Description", "textarea", {
      required: true
    }),
    field("vendor_ID", "Vendor Name", "combo", {
      entity: "Vendors",
      key: "ID",
      text: "vendorName",
      secondaryText: "vendorCode",
      autoFills: { field: "vendorCode", from: "vendorCode" }
    }),
    field("vendorCode", "Vendor Code", "readonly", {
      required: true,
      placeholder: "Filled from the selected Vendor Name"
    }),
    field("purchasingOrganization_code", "Purchasing Organization", "combo", {
      entity: "PurchasingOrganizations",
      autoFills: { field: "companyCode", from: "description" }
    }),
    field("companyCode", "Company Code", "readonly", {
      placeholder: "Filled from the Purchasing Organization"
    }),
    field("purchasingGroup", "Purchasing Group", "combo", { entity: "PurchasingGroups", key: "purchasingGroupCode", text: "purchasingGroupName" }),
    field("siteId", "Site ID", "combo", { entity: "Sites", key: "siteId", text: "siteName" }),
    field("currency_code", "Currency", "combo", {
      required: true,
      entity: "Currencies"
    }),
    plant,
    field("totalValue", "PO Value (Without Taxes)", "number", { required: true }),
    field("poValueWithTaxes", "PO Value (With Taxes)", "readonly", { placeholder: "Calculated from the PO value and tax code" }),
    field("procurementValue", "Procurement Value", "number"),
    field("paymentTerms_code", "Payment Terms", "combo", {
      entity: "PaymentTerms"
    }),
    field("remarks", "Remarks", "textarea"),
    field("termsOfDelivery", "Terms of Delivery", "textarea", { required: true }),
    field("warranty", "Warranty", "textarea", { required: true }),
    field("paymentMilestone", "Payment Milestone", "input"),
    field("approvedPoRecipientEmail", "Approved PO Recipient Email", "input", {
      required: true
    }),
    field("invoiceBoqAttachment", "Invoice / BoQ / PI / Quotation Attachment", "file", {
      required: true
    }),
    field("emailApprovalAttachment", "Email Approval Attachment (max 5MB)", "file", {
      required: true
    }),
    field("summary", "Summary", "textarea"),
    field("psrRefNo", "PSR Ref No", "input", { required: true }),
    field("systemContractId", "System Contract / Outline Agreement ID", "input", {
      required: true
    }),
    field("divisionalUser_ID", "Divisional User", "combo", {
      required: true,
      entity: "Users",
      key: "ID",
      text: "displayName",
      secondaryText: "email"
    }),
    field("procurementApprovalAttachment", "Procurement Approval", "file", {
      required: true
    }),
    field("supportiveDocumentAttachment", "Supportive Document", "file", {
      required: true
    })
  ];
  poFields.push(...requesterFields);
  definitions.PO_CAPEX_IM = poFields;
  definitions.PO_CAPEX_FM = poFields;
  definitions.PO_OPEX = poFields;

  const sesFields = [
    transactionType,
    field("sourceMode", "Creation Source", "select", {
      required: true,
      options: [
        { key: "MANUAL", text: "Manual Request" },
        { key: "PO_SUCCESSOR", text: "From Purchase Order" }
      ]
    }),
    field("purchaseOrderNo", "Purchase Order Number", "input", { required: true }),
    field("existingSesNo", "Existing SES Number", "input"),
    field("loaApprover_ID", "LOA Approver", "combo", {
      required: true,
      entity: "Users",
      key: "ID",
      text: "displayName",
      secondaryText: "email"
    }),
    field("foreignCurrency", "Foreign Currency PO", "checkbox"),
    field("currency_code", "Currency", "combo", {
      required: true,
      entity: "Currencies"
    }),
    field("totalValue", "SES Value", "number", { required: true }),
    field("paymentRequestRequired", "Create Payment Successor", "checkbox"),
    field("remarks", "Remarks", "textarea"),
    field("sesPaymentOption", "SES / Payment Option", "select", {
      required: true,
      options: [
        { key: "SES_REQUIRED", text: "SES Required" },
        { key: "PAYMENT_REQUIRED", text: "Payment Required" },
        { key: "PAYMENT_REQUIRED_GRN_PO", text: "Payment Required for GRN PO" }
      ]
    }),
    field("sesRecipientEmail", "SES Recipient Email", "input", { required: true }),
    field("specialPersonArea", "Special Person Area", "select", {
      options: [
        { key: "DBS", text: "DBS" },
        { key: "MARKETING", text: "Marketing" }
      ]
    }),
    field("invoiceBoqAttachment", "Invoice / BoQ / PI / Quotation Attachment", "file"),
    field("division", "Division", "combo", { required: true, entity: "Divisions", key: "divisionCode", text: "divisionName" }),
    field("divisionalUser_ID", "Divisional User", "combo", {
      required: true,
      entity: "Users",
      key: "ID",
      text: "displayName",
      secondaryText: "email"
    }),
    field("approvalDivisionalHead_ID", "Approval - Divisional Head", "combo", {
      required: true,
      entity: "Users",
      key: "ID",
      text: "displayName",
      secondaryText: "email"
    }),
    field("taxInvoiceAttachment", "Tax Invoice Attachment", "file", { required: true }),
    field("additionalAttachment", "Additional Attachment", "file", { required: true }),
    field("comment", "Comment", "textarea", { required: true })
  ];
  sesFields.push(...requesterFields);
  definitions.SES_NEW = sesFields;
  definitions.SES_MOD = sesFields;

  const column = (name, label, type) => ({ name, label, type: type || "input" });

  const itemColumns = {
    PURCHASE_ORDER: [
      column("materialOrService", "Service Code / Material Code"),
      column("wbsElement", "WBS Element / Cost Center / Budget Code"),
      column("quantity", "Quantity", "number"),
      column("unitPrice", "Unit Price", "number"),
      column("currency", "Currency"),
      column("taxCode", "Applicable Taxes"),
      column("contractNo", "Contract No"),
      column("campaignLocationCode", "Campaign / Location Code"),
      column("siteId", "Site ID"),
      column("plant", "Plant"),
      column("itemCategory", "Item Category"),
      column("accountAssignment", "Account Assignment"),
      column("materialGroup", "Material Group")
    ],
    SERVICE_ENTRY_SHEET: [
      column("poNumber", "PO Number"),
      column("poLineItemNo", "PO Line Item No"),
      column("quantity", "Quantity", "number"),
      column("value", "SES Amount", "number")
    ],
    MATERIAL_RESERVATION: [
      column("materialCode", "Material Code"),
      column("description", "Description"),
      column("quantity", "Quantity", "number"),
      column("unitOfMeasure_code", "Unit of Measure")
    ],
    OUTLINE_CONTRACT: [
      column("contractType", "Contract Type"),
      column("lineItem", "Line Item"),
      column("itemCategory", "Item Category"),
      column("purchaseOrg", "Purchase Org"),
      column("purchaseGroup", "Purchase Group"),
      column("vendorId", "Vendor ID"),
      column("companyCode", "Company Code"),
      column("plant", "Plant"),
      column("validityStartDate", "Validity Start Date", "date"),
      column("validityEndDate", "Validity End Date", "date"),
      column("incoterms", "Incoterms"),
      column("incotermsLocation", "Incoterms Location"),
      column("targetQuantity", "Target Quantity", "number"),
      column("coupaSourcingEventNo", "Coupa Sourcing Event No."),
      column("serviceLine", "Service Line"),
      column("shortTextForServices", "Short Text for Services"),
      column("materialServiceCode", "Material / Service Code"),
      column("quantity", "Quantity", "number"),
      column("grossPrice", "Gross Price", "number"),
      column("priceUnit", "Price Unit"),
      column("currency", "Currency"),
      column("materialSavingPct", "Material Saving %", "number"),
      column("serviceSavingPct", "Service Saving %", "number"),
      column("taxCode", "Tax Code"),
      column("paymentTerm", "Payment Term"),
      column("accountAssignment", "Account Assignment"),
      column("costCenter", "Cost Center"),
      column("orderNumber", "Order Number"),
      column("wbsElement", "WBS Element")
    ]
  };

  const variantsByRequestType = {
    MATERIAL_CODE: ["MAT_ENG_IT", "MAT_ADMIN_CONS", "MAT_ZTRD_NEW", "MAT_ZTRD_EXISTING"],
    SERVICE_CODE: ["SVC_NEW", "SVC_EXISTING"],
    EQUIPMENT_CODE: ["EQP_NEW", "EQP_EXISTING"],
    PROJECT_CODE: ["PROJECT_NEW_MOD", "PROJECT_FL_ACTIVITY"],
    MATERIAL_RESERVATION: ["RES_DIRECT", "RES_WAREHOUSE"],
    OUTLINE_CONTRACT: ["CONTRACT_NEW", "CONTRACT_MOD"],
    PURCHASE_ORDER: ["PO_CAPEX_IM", "PO_CAPEX_FM", "PO_OPEX"],
    SERVICE_ENTRY_SHEET: ["SES_NEW", "SES_MOD"]
  };

  return {
    getFields: function (variantCode) {
      return definitions[variantCode] || [];
    },
    getFieldsByRequestType: function (requestTypeCode) {
      const variantCodes = variantsByRequestType[requestTypeCode] || [];
      const seen = new Set();
      const merged = [];
      variantCodes.forEach(function (variantCode) {
        (definitions[variantCode] || []).forEach(function (fieldDefinition) {
          if (!seen.has(fieldDefinition.name)) {
            seen.add(fieldDefinition.name);
            merged.push(fieldDefinition);
          }
        });
      });
      return merged;
    },
    getItemColumns: function (requestTypeCode) {
      return itemColumns[requestTypeCode] || [];
    }
  };
});
