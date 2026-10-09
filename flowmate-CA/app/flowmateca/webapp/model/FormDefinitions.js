sap.ui.define([], function () {
  "use strict";

  const field = (name, label, type, extra) => Object.assign({
    name,
    label,
    type: type || "input",
    required: false,
    placeholder: ""
  }, extra || {});

  const YES_NO = [
    { key: "YES", text: "Yes" },
    { key: "NO", text: "No" }
  ];

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
    field("industrySector", "Industry Sector", "select", {
      required: true,
      readOnly: true,
      defaultValue: "TELECOMMUNICATION",
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
    field("availabilityCheck", "Availability Check", "combo", { required: true, entity: "AvailabilityCheck", key: "availabilityCheckCode", text: "availabilityCheckDescription" }),
    field("serialNumberProfile", "Serial Number Profile", "combo", { entity: "SerialNumberProfile", key: "serialNumberProfileCode", text: "serialNumberProfileDescription" })
  ];

  const matCore = [
    field("industrySector", "Industry Sector", "select", {
      required: true,
      readOnly: true,
      defaultValue: "TELECOMMUNICATION",
      options: [{ key: "TELECOMMUNICATION", text: "Telecommunication" }]
    }),
    field("materialType", "Material Type", "combo", { required: true, entity: "MaterialTypes" }),
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
    field("mrpType", "MRP Type", "combo", {
      required: true,
      entity: "MRPType", key: "mrpTypeCode", text: "mrpTypeDescription"
    }),
    field("grProcessingTime", "GR Processing Time", "input"),
    field("availabilityCheck", "Availability Check", "combo", {
      required: true,
      entity: "AvailabilityCheck", key: "availabilityCheckCode", text: "availabilityCheckDescription"
    }),
    field("serialNumberProfile", "Serial Number Profile", "combo", {
      entity: "SerialNumberProfile", key: "serialNumberProfileCode", text: "serialNumberProfileDescription"
    }),
    field("hsCode", "HS Code", "input", { required: true }),
    field("valuationClass_code", "Valuation Class", "combo", {
      required: true,
      entity: "ValuationClass", key: "valuationclassCode", text: "valuationclassDescription"
    }),
    field("perUnitPrice", "Per Unit Price", "number"),
    field("approvalDocumentsAttachment", "Approval Documents Attachment", "file", {
      required: true
    })
  ];

  const matTrading = [
    field("storageLocation", "Storage Location", "combo", {
      required: true,
      entity: "StorageLocation", key: "storageLocationCode", text: "storageLocationName"
    }),
    field("salesOrganization", "Sales Org", "combo", {
      required: true,
      entity: "SalesOrg", key: "salesOrgCode", text: "salesOrgName"
    }),
    field("distributionChannel", "Distribution Channel", "combo", {
      required: true,
      entity: "DistributionChannel", key: "distributionChannelCode", text: "distributionChannelDescription"
    }),
    field("division", "Division", "combo", {
      required: true,
      entity: "Divisions", key: "divisionCode", text: "divisionName"
    }),
    field("deliveringPlant_code", "Delivering Plant", "combo", {
      required: true,
      entity: "Plant", key: "plantCode", text: "plantName"
    }),
    field("taxClass", "Tax Class", "input", { required: true }),
    field("accountAssignmentGroup", "Account Assignment Group", "input", { required: true }),
    field("productHierarchy", "Product Hierarchy", "input", { required: true }),
    field("inspectionStock", "Post to Inspection Stock", "checkbox"),
    field("sourceList", "Source List", "checkbox")
  ];

  const dmsToggle = field("dmsUpdate", "DMS Update Required", "checkbox");

  const whenDms = { field: "dmsUpdate", equals: true };
  const dmsBlock = [
    field("dmsSapMaterialCode", "SAP Material Code", "input", { required: true, visibleWhen: whenDms }),
    field("itemName", "Item Name", "input", { required: true, visibleWhen: whenDms }),
    field("itemCategory", "Item Category", "input", { required: true, visibleWhen: whenDms }),
    field("unitsPerItem", "Units per Item", "number", { required: true, visibleWhen: whenDms }),
    field("unitPrice", "Unit Price", "number", { required: true, visibleWhen: whenDms }),
    field("taxPercentage", "Tax Percentage", "number", { required: true, visibleWhen: whenDms }),
    field("isSaleable", "Is Saleable", "checkbox", { visibleWhen: whenDms }),
    field("isSerialized", "Is Serialized", "checkbox", { visibleWhen: whenDms }),
    field("requiredAgents", "Required Agents", "input", { required: true, visibleWhen: whenDms }),
    Object.assign({}, vendor, { label: "Vendor ERP", required: true, visibleWhen: whenDms }),
    field("defaultWarrantyPeriod", "Default Warranty Period", "number", { required: true, visibleWhen: whenDms }),
    field("warrantyType", "Warranty Type", "input", { required: true, visibleWhen: whenDms }),
    field("valueType", "Value Type", "input", { required: true, visibleWhen: whenDms }),
    field("sbu", "SBU", "input", { required: true, visibleWhen: whenDms }),
    field("configurationId", "Config ID", "input", {
      required: true,
      visibleWhen: whenDms,
      placeholder: "1 = serials from 2500, 2 = from 1000, 3 = random or sequential, 4 = alphanumeric"
    })
  ];

  const referenceMaterial = field("referenceMaterialCode", "Reference Material Code", "input", {
    required: true,
    placeholder: "Existing SAP material code"
  });

  const materialCategoryFields = {
    ENG_IT: matCore,
    ADMIN_CONS: matCore,
    TRADING: matCore.concat(matTrading, [dmsToggle], dmsBlock)
  };

  const materialDefinitions = {};
  Object.keys(materialCategoryFields).forEach(function (categoryCode) {
    const base = materialCategoryFields[categoryCode];
    materialDefinitions[categoryCode + ":MAT_NEW"] = base;
    materialDefinitions[categoryCode + ":MAT_EXISTING"] = [referenceMaterial].concat(base);
    materialDefinitions[categoryCode + ":MAT_NEW_REF"] = [referenceMaterial].concat(base);
  });

  const serviceNewBase = [
    field("serviceCategory", "Service Category", "combo", { required: true, entity: "ServiceCategories", text: "description" }),
    field("serviceDescription", "Service Description", "input", {
      required: true,
      maxLength: 40,
      placeholder: "Maximum 40 characters"
    }),
    uom,
    field("serviceGroup_code", "Service Group", "combo", {
      required: true,
      entity: "ServiceGroups", key: "servicegroupCode", text: "servicegroupDescription"
    }),
    field("valuationClass_code", "Valuation Class", "combo", {
      required: true,
      entity: "ValuationClass", key: "valuationclassCode", text: "valuationclassDescription"
    }),
    field("supportingAttachment", "Supporting Attachment", "file"),
    field("remarks", "Remarks", "textarea")
  ];

  const definitions = {
    MAT_ENG_IT: materialBase,
    MAT_ADMIN_CONS: materialBase,
    MAT_ZTRD_NEW: [
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
      field("serialNumberProfile", "Serial Number Profile", "combo", { entity: "SerialNumberProfile", key: "serialNumberProfileCode", text: "serialNumberProfileDescription" }),
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
    SVC_NEW: serviceNewBase,
    SVC_NEW_REF: [
      field("referenceServiceCode", "Reference Service Code", "input", {
        required: true,
        maxLength: 40,
        placeholder: "Existing service code to copy from"
      }),
      ...serviceNewBase
    ],
    SVC_EXISTING: [
      field("referenceServiceCode", "Existing Service Code", "input", {
        required: true
      }),
      field("serviceDescription", "Requested Description", "input", {
        maxLength: 40,
        placeholder: "Maximum 40 characters"
      }),
      uom,
      field("serviceGroup_code", "Service Group", "combo", {
        entity: "ServiceGroups", key: "servicegroupCode", text: "servicegroupDescription"
      }),
      field("supportingAttachment", "Supporting Attachment", "file"),
      field("remarks", "Remarks", "textarea")
    ],
    EQP_NEW: [
      field("siteId", "Site ID", "combo", {
        required: true,
        entity: "Sites", key: "siteId", text: "siteId", secondaryText: "siteName",
        autoFills: { field: "siteName", from: "siteName" }
      }),
      field("siteName", "Site Name", "readonly", {
        required: true,
        placeholder: "Filled from the selected Site ID"
      }),
      field("materialCode", "Material Code", "combo", {
        required: true,
        entity: "Materials", key: "materialCode", text: "materialCode", secondaryText: "materialDescription",
        autoFills: { field: "materialDescription", from: "materialDescription" }
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
      field("siteId", "Site ID", "combo", {
        required: true,
        entity: "Sites", key: "siteId", text: "siteId", secondaryText: "siteName",
        autoFills: { field: "siteName", from: "siteName" }
      }),
      field("siteName", "Site Name", "readonly", {
        required: true,
        placeholder: "Filled from the selected Site ID"
      }),
      field("materialCode", "Material Code", "combo", {
        required: true,
        entity: "Materials", key: "materialCode", text: "materialCode", secondaryText: "materialDescription",
        autoFills: { field: "materialDescription", from: "materialDescription" }
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
      field("requestedByArea", "Requested By", "select", {
        required: true,
        options: [
          { key: "ENGINEERING", text: "Engineering" },
          { key: "NON_ENGINEERING", text: "Non-Engineering" }
        ]
      }),
      field("functionLocationRequired", "Function Location Required", "checkbox"),
      field("functionLocation", "Function Location", "input", {
        required: true,
        maxLength: 80,
        placeholder: "Enter the function location",
        visibleWhen: { field: "functionLocationRequired", equals: true }
      }),
      field("activityRequired", "Activity Required", "checkbox"),
      field("activityNumber", "Activity", "input", {
        required: true,
        maxLength: 80,
        placeholder: "Enter the activity",
        visibleWhen: { field: "activityRequired", equals: true }
      }),
      field("projectName", "Project Name", "input", { required: true }),
      vendor,
      // Spec 8: Scope applies to engineering requests only.
      field("scope", "Scope", "combo", {
        required: true,
        entity: "ProjectScopes",
        visibleWhen: { field: "requestedByArea", equals: "ENGINEERING" }
      }),
      field("entityCode", "Entity", "combo", { required: true, entity: "BusinessEntities" }),
      field("projectType_code", "Project Type", "combo", {
        required: true,
        entity: "ProjectTypes"
      }),
      field("arReference", "AR Reference", "combo", { entity: "ArReferences", key: "arReferenceCode", text: "arReferenceDescription" }),
      field("siteId", "Site ID", "combo", {
        required: true,
        entity: "Sites", key: "siteId", text: "siteId", secondaryText: "siteName",
        autoFills: { field: "siteName", from: "siteName" }
      }),
      field("siteName", "Site Name", "readonly", {
        required: true,
        placeholder: "Filled from the selected Site ID"
      }),
      field("projectCategory", "Project Category", "combo", {
        required: true,
        entity: "Projects", key: "projectCategory", text: "projectCategory", secondaryText: "projectID",
        autoFills: [
          { field: "projectId", from: "projectID" },
          { field: "projectDescription", from: "projectDescription" }
        ]
      }),
      field("projectId", "Project ID", "readonly", {
        required: true,
        placeholder: "Filled from the selected Project Category"
      }),
      field("projectDescription", "Project Description", "readonly", {
        required: true,
        placeholder: "Filled from the selected Project Category"
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
      field("siteId", "Site ID", "combo", {
        required: true,
        entity: "Sites", key: "siteId", text: "siteId", secondaryText: "siteName",
        autoFills: { field: "siteName", from: "siteName" },
        visibleWhen: { field: "transactionType", equals: "FUNCTION_LOCATION" }
      }),
      field("siteName", "Site Name", "readonly", {
        required: true,
        placeholder: "Filled from the selected Site ID",
        visibleWhen: { field: "transactionType", equals: "FUNCTION_LOCATION" }
      }),
      field("projectId", "Project Code", "combo", {
        required: true,
        entity: "Projects", key: "projectID", text: "projectID", secondaryText: "projectDescription",
        visibleWhen: { field: "transactionType", equals: "ACTIVITY" }
      }),
      field("remarks", "Remarks", "textarea"),
      field("supportingAttachment", "Supporting Attachment", "file")
    ],
    RES_DIRECT: [
      field("engineeringType", "Request Type", "select", {
        required: true,
        options: [
          { key: "ENGINEERING", text: "Engineering" },
          { key: "NON_ENGINEERING", text: "Non-Engineering" }
        ]
      }),
      // Spec 7: Project and Batch apply to engineering requests only.
      field("project", "Project", "combo", {
        required: true,
        entity: "ReservationProjects",
        visibleWhen: { field: "engineeringType", equals: "ENGINEERING" }
      }),
      field("batch", "Batch", "combo", {
        required: true,
        entity: "ReservationBatches",
        visibleWhen: { field: "engineeringType", equals: "ENGINEERING" }
      }),
      field("materialType", "Material Type", "select", {
        required: true,
        options: [
          { key: "WAREHOUSE", text: "Warehouse" },
          { key: "DIRECT", text: "Direct Delivery" }
        ]
      }),
      field("poNumber", "PO Number", "input"),
      field("warehouse_code", "Warehouse Location", "combo", {
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
      field("engineeringType", "Request Type", "select", {
        required: true,
        options: [
          { key: "ENGINEERING", text: "Engineering" },
          { key: "NON_ENGINEERING", text: "Non-Engineering" }
        ]
      }),
      // Spec 7: Project and Batch apply to engineering requests only.
      field("project", "Project", "combo", {
        required: true,
        entity: "ReservationProjects",
        visibleWhen: { field: "engineeringType", equals: "ENGINEERING" }
      }),
      field("batch", "Batch", "combo", {
        required: true,
        entity: "ReservationBatches",
        visibleWhen: { field: "engineeringType", equals: "ENGINEERING" }
      }),
      field("materialType", "Material Type", "select", {
        required: true,
        options: [
          { key: "WAREHOUSE", text: "Warehouse" },
          { key: "DIRECT", text: "Direct Delivery" }
        ]
      }),
      field("warehouse_code", "Warehouse Location", "combo", {
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
      field("approvalDocumentsAttachment", "Approval Documents Attachment", "file"),
      field("otherComments", "Other Comments", "textarea")
      // Contract count, SCM SPOC, target value and the SAP header terms are captured per row
      // in the Header Creation and Contract Creation Details tables (see headerTableColumns).
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
    // Contract Modification with Single Line Items (getFields lineMode "SINGLE_LINE").
    // Fields carry a section; the Yes drivers of the Details section also open the change
    // tables defined in conditionalGrids.
    CONTRACT_MOD_SINGLE: [
      field("contractNumber", "Contract Number", "input", { section: "Header Change" }),
      field("headerTaxCode", "Tax Code", "input", { section: "Header Change" }),
      field("headerServiceCode", "Service Code", "input", { section: "Header Change" }),
      field("headerMaterialCode", "Material Code", "input", { section: "Header Change" }),
      field("targetValue", "Target Value", "input", { section: "Header Change" }),
      field("targetDate", "Target Date", "date", { section: "Header Change" }),
      field("headerPaymentTerms", "Payment Terms", "input", { section: "Header Change" }),
      field("contractRevoked", "Contract Revoked", "select", { section: "Header Change", required: true, options: YES_NO }),
      field("scmAssignUser", "SCM Assign User", "combo", {
        section: "Header Change",
        required: true,
        entity: "Users", key: "email", text: "displayName", secondaryText: "email"
      }),
      field("headerChangesAttachment", "Header Changes Attachment", "file", { section: "Header Change" }),
      field("headerComment", "Comment", "textarea", { section: "Header Change" }),

      field("amendmentContractNumber", "Contract Number", "input", { section: "Details" }),
      field("priceChange", "Price Change", "select", { section: "Details", options: YES_NO }),
      field("serviceAddition", "Service Addition", "select", { section: "Details", options: YES_NO }),
      field("materialAddition", "Material Addition", "select", { section: "Details", options: YES_NO }),
      field("ceilingValueChange", "Ceiling Value", "select", { section: "Details", options: YES_NO }),
      field("ceilingValue", "Ceiling Value Amount", "input", {
        section: "Details", required: true,
        visibleWhen: { field: "ceilingValueChange", equals: "YES" }
      }),
      field("othersChange", "Others", "select", { section: "Details", options: YES_NO }),
      field("otherDetails", "Other Details", "input", {
        section: "Details", required: true,
        visibleWhen: { field: "othersChange", equals: "YES" }
      }),
      field("dateExtension", "Date Extension", "select", { section: "Details", options: YES_NO }),
      field("extendedDate", "Extended Date", "date", {
        section: "Details", required: true,
        visibleWhen: { field: "dateExtension", equals: "YES" }
      }),
      field("conditionChange", "Condition Change", "select", { section: "Details", options: YES_NO }),
      field("conditionChangeDetails", "Condition Change Details", "input", {
        section: "Details", required: true,
        visibleWhen: { field: "conditionChange", equals: "YES" }
      }),
      field("approvalDocumentsAttachment", "Approval Attachments", "file", { section: "Details" }),
      field("amendmentComments", "Comments", "textarea", { section: "Details" })
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
  // Dummy PSR references for Decentralized procurement until a PSR source is connected.
  const PSR_IDS = ["PSR-000001", "PSR-000002", "PSR-000003", "PSR-000004", "PSR-000005"]
    .map(function (key) { return { key, text: key }; });

  const poFields = [
    field("purchaseOrderType_code", "PO Type", "combo", {
      required: true,
      entity: "PurchaseOrderTypes"
    }),
    field("contractBased", "Contract Based PO", "checkbox"),
    field("systemContractId", "System Contract / Outline Agreement ID", "input", {
      required: true,
      visibleWhen: { field: "contractBased", equals: true }
    }),
    field("procurementType", "Procurement Type", "select", {
      required: true,
      options: [
        { key: "CENTRALIZED", text: "Centralized Procurement" },
        { key: "DECENTRALIZED", text: "Decentralized Procurement" }
      ]
    }),
    field("centralizedProcurementId", "Centralized Procurement ID", "input", {
      required: true,
      visibleWhen: { field: "procurementType", equals: "CENTRALIZED" }
    }),
    field("psrId", "PSR ID", "select", {
      required: true,
      options: PSR_IDS,
      visibleWhen: { field: "procurementType", equals: "DECENTRALIZED" }
    }),
    field("procurementCategory_code", "Procurement Category", "combo", {
      required: true,
      entity: "ProcurementCategories"
    }),
    field("division", "Division", "combo", { entity: "Divisions", key: "divisionCode", text: "divisionName" }),
    field("specialPersonArea", "Special Person Area", "select", {
      options: ["FTK", "ENGINEERING", "IT", "DBS", "MARKETING", "FOC", "DNS"].map(function (key) {
        return { key, text: key };
      })
    }),
    field("arNumber", "AR Number", "input"),
    // WBS Element, Cost Center, Budget Code and Campaign / Location Code are captured per line
    // item (itemColumns.PURCHASE_ORDER). Tax stays here because it drives PO Value (With Taxes).
    field("documentType", "Document Type", "combo", { entity: "DocumentTypes", key: "documentTypeCode", text: "documentTypeDescription" }),
    field("taxApplicable", "Tax Applicable", "checkbox"),
    field("applicableTax", "Applicable Tax", "combo", {
      required: true,
      entity: "ApplicableTaxes", key: "taxCode", text: "taxDescription", secondaryText: "taxCode",
      visibleWhen: { field: "taxApplicable", equals: true }
    }),
    field("clearanceChargeApplicable", "Clearance Charge Applicable", "checkbox"),
    field("clearanceCharge", "Clearance Charge", "number", {
      required: true,
      visibleWhen: { field: "clearanceChargeApplicable", equals: true }
    }),
    field("materialImported", "Material Imported", "checkbox"),
    field("sesRequired", "Create SES Successor", "checkbox"),
    field("paymentRequestRequired", "Create Payment Successor", "checkbox"),
    field("paymentRun", "Payment Run", "checkbox", { onSelect: "onPaymentRunSelect" }),
    field("poHeaderText", "PO Header Text", "textarea", { required: true }),
    field("WorkHUBID", "WorkHub ID", "input"),
    field("WorkHubAppID", "WorkHub Application ID", "input"),
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
    field("purchasingOrganization_ID", "Purchasing Organization", "combo", {
      required: true,
      entity: "PurchasingOrganizations", key: "ID",
      text: "purchasingOrganizationName", secondaryText: "purchasingOrganizationCode"
    }),
    field("companyCode", "Company Code", "combo", {
      required: true,
      entity: "CompanyCodes", key: "companyCode", text: "companyName", secondaryText: "companyCode"
    }),
    field("purchasingGroup", "Purchasing Group", "combo", {
      required: true,
      entity: "PurchasingGroups", key: "purchasingGroupCode", text: "purchasingGroupName", secondaryText: "purchasingGroupCode"
    }),
    // Site ID, Plant and Currency are captured per line item (itemColumns.PURCHASE_ORDER).
    field("totalValue", "PO Value (Without Taxes)", "number", { required: true }),
    field("poValueWithTaxes", "PO Value (With Taxes)", "readonly", {
      placeholder: "Calculated from the PO value and the applicable tax"
    }),
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
    field("purchaseOrderNo", "Purchase Order Number", "input", { required: true }),
    field("existingSesNo", "Existing SES Number", "input"),
    field("loaApprover_ID", "LOA Approver", "combo", {
      required: true,
      entity: "Users",
      key: "ID",
      text: "displayName",
      secondaryText: "email"
    }),
    field("paymentRequestRequired", "Available Invoices", "checkbox"),
    field("flowmateSesRequest", "Create Flowmate Service Entry Sheet Request", "checkbox", { onSelect: "onFlowmateServiceEntrySheetSelect" }),
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
    field("additionalAttachment", "Additional Attachment", "file"),
    field("comment", "Comment", "textarea")
  ];
  sesFields.push(...requesterFields);
  // These stay on the form in both line modes: the LOA approver routes the approval task from
  // the detail row, the division describes the whole request, an attachment cannot live in a
  // table row, and the requester fields are request metadata. Everything else is captured per
  // row in the Header Creation table when Multiple Line is chosen.
  const sesFormFieldNames = new Set([
    "loaApprover_ID", "division", "divisionalUser_ID", "approvalDivisionalHead_ID",
    "invoiceBoqAttachment", "taxInvoiceAttachment", "additionalAttachment",
    "requesterName", "requesterEmail", "requestDateTime"
  ]);
  // Only a modification quotes an existing SES number; a new one has none yet.
  const sesVariantFields = {
    SES_NEW: sesFields.filter(function (f) { return f.name !== "existingSesNo"; }),
    SES_MOD: sesFields
  };
  // Single Line keeps every field on the form; Multiple Line moves the row fields into the
  // header table. LOA approval applies to both variants, so both collect the LOA approver.
  const sesHeaderRowFields = {};
  Object.keys(sesVariantFields).forEach(function (variant) {
    definitions[variant + "_SINGLE"] = sesVariantFields[variant];
    definitions[variant] = sesVariantFields[variant]
      .filter(function (f) { return sesFormFieldNames.has(f.name); });
    sesHeaderRowFields[variant] = sesVariantFields[variant]
      .filter(function (f) { return !sesFormFieldNames.has(f.name); });
  });

  const column = (name, label, type, extra) => Object.assign({ name, label, type: type || "input" }, extra || {});

  const COLUMN_KEYS = [
    "name", "label", "type", "required", "entity", "key", "text", "secondaryText",
    "options", "maxLength", "autoFills", "placeholder"
  ];

  const isHeaderOnlyField = (field, drivers) =>
    field.type === "file" || !!field.visibleWhen || field.source === "request" || drivers.has(field.name);

  const fieldToColumn = (field) => {
    const col = {};
    COLUMN_KEYS.forEach(function (prop) {
      if (field[prop] !== undefined) {
        col[prop] = field[prop];
      }
    });
    return col;
  };

  const visibilityDrivers = (fields) => {
    const drivers = new Set();
    fields.forEach(function (field) {
      if (field.visibleWhen && field.visibleWhen.field) {
        drivers.add(field.visibleWhen.field);
      }
    });
    return drivers;
  };

  // Outline contract dropdowns, bound to the Admin-maintained master data (flowmate-common).
  const contractColumn = {
    contractType: column("contractType", "Contract Type", "combo", {
      entity: "ContractType", key: "contractTypeCode", text: "contractTypeDescription", secondaryText: "contractTypeCode"
    }),
    itemCategory: column("itemCategory", "Item Category", "combo", { entity: "ItemCategories" }),
    purchaseOrg: column("purchaseOrg", "Purchase Org", "combo", {
      entity: "PurchasingOrganizations", key: "purchasingOrganizationCode", text: "purchasingOrganizationName",
      secondaryText: "purchasingOrganizationCode"
    }),
    purchaseGroup: column("purchaseGroup", "Purchase Group", "combo", {
      entity: "PurchasingGroups", key: "purchasingGroupCode", text: "purchasingGroupName", secondaryText: "purchasingGroupCode"
    }),
    vendorId: column("vendorId", "Vendor ID", "combo", {
      entity: "Vendors", key: "vendorCode", text: "vendorName", secondaryText: "vendorCode"
    }),
    companyCode: column("companyCode", "Company Code", "combo", {
      entity: "CompanyCodes", key: "companyCode", text: "companyName", secondaryText: "companyCode"
    }),
    plant: column("plant", "Plant", "combo", { entity: "Plant", key: "plantCode", text: "plantName" }),
    incoterms: column("incoterms", "Incoterms", "combo", {
      entity: "Incoterms", key: "incotermsCode", text: "incotermsDescription", secondaryText: "incotermsCode"
    }),
    currency: column("currency", "Currency", "combo", { entity: "Currencies" }),
    taxCode: column("taxCode", "Tax Code", "combo", {
      entity: "ApplicableTaxes", key: "taxCode", text: "taxDescription", secondaryText: "taxCode"
    }),
    paymentTerm: column("paymentTerm", "Payment Term", "combo", { entity: "PaymentTerms" }),
    accountAssignment: column("accountAssignment", "Account Assignment", "combo", { entity: "AccountAssignments" }),
    costCenter: column("costCenter", "Cost Center", "combo", {
      entity: "CostCenter", key: "costCenterCode", text: "costCenterName", secondaryText: "costCenterCode"
    }),
    wbsElement: column("wbsElement", "WBS Element", "combo", {
      entity: "Wbs", key: "wbsCode", text: "wbsDescription", secondaryText: "wbsCode"
    })
  };

  const itemColumns = {
    // Shown for Single and Multiple Line Items alike (see alwaysHasItems).
    PURCHASE_ORDER: [
      column("materialOrService", "Service Code / Material Code", "input", { required: true }),
      column("wbsElement", "WBS Element", "combo", {
        required: true, entity: "Wbs", key: "wbsCode", text: "wbsDescription", secondaryText: "wbsCode"
      }),
      column("costCenter", "Cost Center", "combo", {
        required: true, entity: "CostCenter", key: "costCenterCode", text: "costCenterName", secondaryText: "costCenterCode"
      }),
      column("budgetCode", "Budget Code", "combo", {
        required: true, entity: "BudgetCode", key: "budgetCode", text: "budgetCodeDescription", secondaryText: "budgetCode"
      }),
      column("quantity", "Quantity", "number", { required: true }),
      column("unitPrice", "Unit Price", "number", { required: true }),
      column("currency", "Currency", "combo", { required: true, entity: "Currencies" }),
      column("taxCode", "Applicable Taxes", "combo", {
        required: true, entity: "ApplicableTaxes", key: "taxCode", text: "taxDescription", secondaryText: "taxCode"
      }),
      column("campaignLocationCode", "Campaign / Location Code", "combo", {
        entity: "Sites", key: "siteId", text: "siteName", secondaryText: "siteId"
      }),
      column("siteId", "Site ID Available", "combo", { entity: "Sites", key: "siteId", text: "siteId", secondaryText: "siteName" }),
      column("plant", "Plant", "combo", { required: true, entity: "Plant", key: "plantCode", text: "plantName" }),
      column("itemCategory", "Item Category", "combo", { required: true, entity: "ItemCategories" }),
      column("accountAssignment", "Account Assignment", "combo", { required: true, entity: "AccountAssignments" }),
      column("materialGroup", "Material Group", "combo", {
        required: true, entity: "MatGroup", key: "matGroupCode", text: "matGroupDescription", secondaryText: "matGroupCode"
      })
    ],
    // Shown for Single and Multiple Line Items alike (see alwaysHasItems).
    SERVICE_ENTRY_SHEET: [
      column("itemNo", "ID", "readonly"),
      // PO Number stays optional: an SES captured as a PO successor only gets its PO number on the
      // PO's last approval.
      column("poNumber", "PO Number"),
      column("poLineItemNo", "PO Line Item Number"),
      column("value", "SES Amount", "number", { required: true }),
      column("quantity", "Quantity", "number")
    ],
    MATERIAL_RESERVATION: [
      column("itemNo", "ID", "readonly"),
      column("siteId", "Site ID", "combo", {
        required: true,
        entity: "Sites", key: "siteId", text: "siteId", secondaryText: "siteName"
      }),
      column("siteName", "Site Name", "input"),
      column("sapCode", "SAP Code"),
      column("indentWo", "Indent/WO"),
      column("equipmentNo", "Equipment No. (if CTL)"),
      column("materialCode", "Material Code", "combo", {
        required: true,
        entity: "Materials", key: "materialCode", text: "materialCode", secondaryText: "materialDescription",
        autoFills: { field: "description", from: "materialDescription" }
      }),
      column("description", "Material Description", "readonly"),
      column("plant", "Plant", "combo", { entity: "Plant", key: "plantCode", text: "plantName" }),
      column("storageLocation", "Storage Location", "combo", {
        entity: "StorageLocation", key: "storageLocationCode", text: "storageLocationName"
      }),
      column("ctlType", "CTL / Non_CTL", "select", {
        required: true,
        options: [{ key: "CTL", text: "CTL" }, { key: "NON_CTL", text: "Non-CTL" }]
      }),
      column("quantity", "Quantity", "number", { required: true }),
      column("unitOfMeasure_code", "Unit of Measure", "combo", { required: true, entity: "UnitsOfMeasure" }),
      column("comments", "Comments")
    ],
    OUTLINE_CONTRACT: [
      contractColumn.contractType,
      column("lineItem", "Line Item"),
      contractColumn.itemCategory,
      contractColumn.purchaseOrg,
      contractColumn.purchaseGroup,
      contractColumn.vendorId,
      contractColumn.companyCode,
      contractColumn.plant,
      column("validityStartDate", "Validity Start Date", "date"),
      column("validityEndDate", "Validity End Date", "date"),
      contractColumn.incoterms,
      column("incotermsLocation", "Incoterms Location"),
      column("targetQuantity", "Target Quantity", "number"),
      column("coupaSourcingEventNo", "Ariba Sourcing Event No"),
      column("serviceLine", "Service Line"),
      column("shortTextForServices", "Short Text for Services", "input", { maxLength: 40 }),
      column("materialServiceCode", "Material / Service Code"),
      column("quantity", "Quantity", "number"),
      column("grossPrice", "Gross Price", "number"),
      column("priceUnit", "Price Unit"),
      contractColumn.currency,
      column("materialSavingPct", "Material Saving %", "number"),
      column("serviceSavingPct", "Service Saving %", "number"),
      contractColumn.taxCode,
      contractColumn.paymentTerm,
      contractColumn.accountAssignment,
      contractColumn.costCenter,
      column("orderNumber", "Order Number"),
      contractColumn.wbsElement
    ],
    // Labels follow "Details of Contract Creation-SCC M-212.csv" so that file imports as-is.
    CONTRACT_NEW: [
      column("itemNo", "ID", "readonly"),
      column("contractCount", "Contract Count", "number", { required: true }),
      contractColumn.contractType,
      column("lineItem", "Line Item"),
      contractColumn.itemCategory,
      contractColumn.purchaseOrg,
      contractColumn.purchaseGroup,
      Object.assign({}, contractColumn.vendorId, { required: true }),
      contractColumn.companyCode,
      contractColumn.plant,
      column("validityStartDate", "Validity Start Date", "date"),
      column("validityEndDate", "Validity End Date", "date"),
      contractColumn.incoterms,
      column("incotermsLocation", "Incoterms Location"),
      column("totalTargetValue", "Total Target Value", "number", { required: true }),
      column("targetQuantity", "Target Quantity", "number"),
      column("coupaSourcingEventNo", "Ariba Sourcing Event No"),
      column("serviceLine", "Service Line"),
      column("shortTextForServices", "Short Text for Services", "input", { maxLength: 40 }),
      column("materialServiceCode", "Material/Service Code"),
      column("quantity", "Quantity", "number"),
      column("grossPrice", "Gross Price", "number"),
      column("priceUnit", "Price Unit"),
      contractColumn.currency,
      column("materialSavingPct", "Material Saving %", "number"),
      column("serviceSavingPct", "Service Saving %", "number"),
      contractColumn.taxCode,
      contractColumn.paymentTerm,
      contractColumn.accountAssignment,
      contractColumn.costCenter,
      column("orderNumber", "Order Number"),
      Object.assign({}, contractColumn.wbsElement, { label: "Work Breakdown Structure Element (WBS Element)" }),
      column("scmSpocUserId", "User ID - SCM SPOC", "combo", {
        required: true,
        entity: "Users", key: "email", text: "displayName", secondaryText: "email"
      })
    ]
  };

  // Second row table, keyed by variant. Labels follow "Details of Header Creation-SCC M-212.csv".
  const headerTableColumns = {
    CONTRACT_NEW: [
      column("itemNo", "ID", "readonly"),
      Object.assign({}, contractColumn.vendorId, { name: "vendorCode", label: "Vendor Code", required: true }),
      column("coupaSourcingEventNo", "Ariba Sourcing Event No", "input", { required: true }),
      column("poHeaderText", "PO header text", "input", { required: true }),
      Object.assign({}, contractColumn.paymentTerm, { name: "paymentTerms", label: "Payment terms", required: true }),
      column("warranty", "Warranty"),
      column("penalties", "Penalties for breach of contract"),
      column("termsOfDelivery", "Terms of delivery/delivery SLA"),
      column("guarantees", "Guarantees/Performance Bond"),
      column("otherCommercialTerms", "Any other commercial term(s) to be included in PO")
    ]
  };

  // Service Entry Sheet captures the same fields per row, so its header columns are derived
  // from the field definitions rather than restated.
  Object.keys(sesHeaderRowFields).forEach(function (variant) {
    headerTableColumns[variant] = [column("itemNo", "ID", "readonly")]
      .concat(sesHeaderRowFields[variant].map(fieldToColumn));
  });

  // CONTRACT_NEW has no Single/Multiple choice and always shows both tables. SES keeps the
  // choice: its header table replaces those form fields only in Multiple Line mode.
  const headerTableOnlyWhenMultiple = new Set(["SES_NEW", "SES_MOD"]);

  Object.assign(definitions, materialDefinitions);

  const variantsByRequestType = {
    MATERIAL_CODE: Object.keys(materialDefinitions)
      .concat(["MAT_ENG_IT", "MAT_ADMIN_CONS", "MAT_ZTRD_NEW", "MAT_ZTRD_EXISTING"]),
    SERVICE_CODE: ["SVC_NEW", "SVC_NEW_REF", "SVC_EXISTING"],
    EQUIPMENT_CODE: ["EQP_NEW", "EQP_EXISTING"],
    PROJECT_CODE: ["PROJECT_NEW_MOD", "PROJECT_FL_ACTIVITY"],
    MATERIAL_RESERVATION: ["RES_DIRECT", "RES_WAREHOUSE"],
    OUTLINE_CONTRACT: ["CONTRACT_NEW", "CONTRACT_MOD", "CONTRACT_MOD_SINGLE"],
    PURCHASE_ORDER: ["PO_CAPEX_IM", "PO_CAPEX_FM", "PO_OPEX"],
    SERVICE_ENTRY_SHEET: ["SES_NEW", "SES_MOD"]
  };

  // Tables shown inside the details section while their driver field is "YES".
  // Labels follow the agreed Excel headers so filled sheets import as-is.
  const conditionalGrids = {
    CONTRACT_MOD: [
      {
        key: "priceChanges", title: "Price Change", driver: "priceChange",
        columns: [
          column("itemNo", "ID", "readonly"),
          column("code", "Material or service code", "input", { required: true }),
          column("price", "Price", "number")
        ]
      },
      {
        key: "serviceAdditions", title: "Service Addition", driver: "serviceAddition",
        columns: [
          column("itemNo", "ID", "readonly"),
          column("code", "Service code", "input", { required: true }),
          column("price", "Pricing", "number"),
          column("quantity", "Quantity", "number")
        ]
      },
      {
        key: "materialAdditions", title: "Material Addition", driver: "materialAddition",
        columns: [
          column("itemNo", "ID", "readonly"),
          column("code", "Material code", "input", { required: true }),
          column("price", "Pricing", "number"),
          column("quantity", "Quantity", "number")
        ]
      }
    ]
  };

  // changeType stored by the backend for each conditional grid key.
  const CHANGE_TYPE_BY_GRID = {
    priceChanges: "PRICE_CHANGE",
    serviceAdditions: "SERVICE_ADDITION",
    materialAdditions: "MATERIAL_ADDITION"
  };

  return {
    // lineMode "SINGLE_LINE" picks a "<variant>_SINGLE" definition when one exists.
    getFields: function (variantCode, categoryCode, lineMode) {
      if (lineMode === "SINGLE_LINE" && definitions[variantCode + "_SINGLE"]) {
        return definitions[variantCode + "_SINGLE"];
      }
      if (categoryCode && definitions[categoryCode + ":" + variantCode]) {
        return definitions[categoryCode + ":" + variantCode];
      }
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
    getItemColumns: function (requestTypeCode, variantCode, categoryCode) {
      if (variantCode && itemColumns[variantCode]) {
        return itemColumns[variantCode];
      }
      if (itemColumns[requestTypeCode]) {
        return itemColumns[requestTypeCode];
      }
      const fields = this.getFields(variantCode, categoryCode);
      const drivers = visibilityDrivers(fields);
      return fields.filter(function (field) {
        return !isHeaderOnlyField(field, drivers);
      }).map(fieldToColumn);
    },
    // Variants that capture rows in two tables (header rows + item rows) instead of offering
    // the Single/Multiple line choice.
    hasHeaderTable: function (variantCode) {
      return !!headerTableColumns[variantCode];
    },
    // Whether the header table is actually shown for the chosen line mode, and whether the
    // variant still offers the Single/Multiple choice at all.
    showsHeaderTable: function (variantCode, lineMode) {
      if (!headerTableColumns[variantCode]) {
        return false;
      }
      return headerTableOnlyWhenMultiple.has(variantCode) ? lineMode === "MULTIPLE_LINE" : true;
    },
    offersLineModeChoice: function (variantCode) {
      return !headerTableColumns[variantCode] || headerTableOnlyWhenMultiple.has(variantCode);
    },
    headerTableIsLineModeDependent: function (variantCode) {
      return headerTableOnlyWhenMultiple.has(variantCode);
    },
    // ---- Bulk Request = Multiple (Purchase Order): one PO per row of a details table ----
    // Columns of the details table: every PO field except the successor checkboxes, the files and
    // Remarks (those sit in a shared section). Fields that a checkbox or choice normally opens
    // become plain optional columns, since a table cell cannot appear and disappear per row.
    getBulkTableColumns: function (requestTypeCode) {
      if (requestTypeCode !== "PURCHASE_ORDER") {
        return [];
      }
      const excluded = ["sesRequired", "paymentRequestRequired", "remarks"];
      return [column("itemNo", "Row #", "readonly")].concat(poFields
        .filter(function (definition) {
          return definition.source !== "request" && definition.type !== "file"
            && excluded.indexOf(definition.name) < 0;
        })
        .map(function (definition) {
          const col = fieldToColumn(definition);
          if (definition.visibleWhen) {
            col.required = false;
          }
          return col;
        }));
    },
    // The shared "Attachments & Comments" section, applied to every PO created from the table.
    getBulkSharedFields: function (requestTypeCode) {
      if (requestTypeCode !== "PURCHASE_ORDER") {
        return [];
      }
      return poFields
        .filter(function (definition) {
          return definition.type === "file" || definition.name === "remarks";
        })
        .map(function (definition) {
          return Object.assign({}, definition, { section: "Attachments & Comments" });
        });
    },
    // Line items in bulk mode carry the Row # of the details row (PO) they belong to.
    getBulkItemColumns: function (requestTypeCode, variantCode) {
      return [column("poRow", "Row #", "number", { required: true })]
        .concat(this.getItemColumns(requestTypeCode, variantCode));
    },
    // Request types whose line-items table shows for Single as well as Multiple Line Items.
    alwaysHasItems: function (requestTypeCode) {
      return requestTypeCode === "PURCHASE_ORDER" || requestTypeCode === "SERVICE_ENTRY_SHEET";
    },
    getHeaderTableColumns: function (variantCode) {
      return headerTableColumns[variantCode] || [];
    },
    getConditionalGrids: function (variantCode) {
      return (conditionalGrids[variantCode] || []).map(function (grid) {
        return Object.assign({ changeType: CHANGE_TYPE_BY_GRID[grid.key] }, grid);
      });
    },
    getHeaderFields: function (requestTypeCode, variantCode, categoryCode, lineMode) {
      const fields = this.getFields(variantCode, categoryCode, lineMode);
      if (itemColumns[requestTypeCode]) {
        return fields;
      }
      const drivers = visibilityDrivers(fields);
      return fields.filter(function (field) {
        return isHeaderOnlyField(field, drivers);
      });
    }
  };
});
