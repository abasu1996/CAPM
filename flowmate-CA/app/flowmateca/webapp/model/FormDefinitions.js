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
    entity: "Plants"
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
      entity: "MaterialGroups"
    }),
    field("externalMaterialGroup_code", "External Material Group", "combo", {
      entity: "ExternalMaterialGroups"
    }),
    field("profitCenter_code", "Profit Center", "combo", {
      required: true,
      entity: "ProfitCenters"
    }),
    field("snp", "SNP", "input"),
    field("hsCode", "HS Code", "input"),
    field("valuationClass_code", "Valuation Class", "combo", {
      entity: "ValuationClasses"
    }),
    field("coupaCommodityCode_code", "Coupa Commodity Code", "combo", {
      entity: "CoupaCommodityCodes"
    })
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
      field("storageLocation", "Storage Location", "input"),
      field("salesOrganization", "Sales Organization", "input"),
      field("distributionChannel", "Distribution Channel", "input"),
      field("description", "Material Description", "input", {
        required: true,
        maxLength: 40
      }),
      field("materialGroup_code", "Material Group", "combo", {
        required: true,
        entity: "MaterialGroups"
      }),
      field("externalMaterialGroup_code", "External Material Group", "combo", {
        entity: "ExternalMaterialGroups"
      }),
      field("division", "Division", "input"),
      field("deliveringPlant_code", "Delivering Plant", "combo", {
        entity: "Plants"
      }),
      field("taxClass", "Tax Class", "input"),
      field("accountAssignmentGroup", "Account Assignment Group", "input"),
      field("productHierarchy", "Product Hierarchy", "input"),
      field("profitCenter_code", "Profit Center", "combo", {
        entity: "ProfitCenters"
      }),
      field("serialNumberProfile", "Serial Number Profile", "input"),
      field("inspectionStock", "Post to Inspection Stock", "checkbox"),
      field("sourceList", "Source List", "checkbox"),
      field("commodityImportCode", "Commodity / Import Code", "input"),
      field("valuationClass_code", "Valuation Class", "combo", {
        entity: "ValuationClasses"
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
      field("configurationId", "Configuration ID", "input")
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
      field("requiredAgents", "Required Agents", "input"),
      vendor,
      field("warrantyType", "Warranty Type", "input"),
      field("valueType", "Value Type", "input"),
      field("sbu", "SBU", "input"),
      field("configurationId", "Configuration ID", "input")
    ],
    SVC_NEW: [
      transactionType,
      field("serviceCategory", "Service Category", "input", { required: true }),
      field("serviceDescription", "Service Description", "input", {
        required: true,
        maxLength: 40
      }),
      uom,
      field("serviceGroup_code", "Service Group", "combo", {
        required: true,
        entity: "ServiceGroups"
      }),
      field("valuationClass_code", "Valuation Class", "combo", {
        entity: "ValuationClasses"
      }),
      field("coupaCommodityCode_code", "Coupa Commodity Code", "combo", {
        entity: "CoupaCommodityCodes"
      })
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
        entity: "ServiceGroups"
      })
    ],
    EQP_NEW: [
      transactionType,
      field("siteId", "Site ID", "input", { required: true }),
      field("materialCode", "Material Code", "input", { required: true }),
      field("serialNumber", "Serial Number", "input", { required: true }),
      field("wbsElement", "WBS Element", "input"),
      field("commissionedDate", "Commissioned Date", "date")
    ],
    EQP_EXISTING: [
      transactionType,
      field("siteId", "Site ID", "input", { required: true }),
      field("materialCode", "Material Code", "input", { required: true }),
      field("serialNumber", "Serial Number", "input", { required: true }),
      field("wbsElement", "WBS Element", "input"),
      field("commissionedDate", "Commissioned Date", "date"),
      field("approver_ID", "Approver", "combo", {
        required: true,
        entity: "Users",
        key: "ID",
        text: "displayName",
        secondaryText: "email"
      })
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
      field("scope", "Scope", "textarea", { required: true }),
      field("entityCode", "Entity", "input"),
      field("projectType_code", "Project Type", "combo", {
        entity: "ProjectTypes"
      }),
      field("arReference", "AR Reference", "input"),
      field("remarks", "Remarks", "textarea")
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
      field("scope", "Scope", "textarea"),
      field("remarks", "Remarks", "textarea")
    ],
    RES_DIRECT: [
      field("project", "Project", "input", { required: true }),
      field("batch", "Batch", "input"),
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
      field("remarks", "Remarks", "textarea")
    ],
    RES_WAREHOUSE: [
      field("project", "Project", "input", { required: true }),
      field("batch", "Batch", "input"),
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
      field("remarks", "Remarks", "textarea")
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
      field("remarks", "Remarks", "textarea")
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
      field("remarks", "Remarks", "textarea")
    ],
    PO_CAPEX_IM: [],
    PO_CAPEX_FM: [],
    PO_OPEX: [],
    SES_NEW: [],
    SES_MOD: []
  };

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
    field("division", "Division", "input"),
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
    field("wbsElement", "WBS Element", "input"),
    field("documentType", "Document Type", "input"),
    field("taxApplicable", "Tax Applicable", "checkbox"),
    field("clearanceChargeApplicable", "Clearance Charge Applicable", "checkbox"),
    field("materialImported", "Material Imported", "checkbox"),
    field("sesRequired", "Create SES Successor", "checkbox"),
    field("paymentRequestRequired", "Create Payment Successor", "checkbox"),
    field("poHeaderText", "PO Header Text", "textarea"),
    field("campaignLocationCode", "Campaign / Location Code", "input"),
    field("procurementDescription", "Procurement Description", "textarea", {
      required: true
    }),
    vendor,
    field("companyCode", "Company Code", "input"),
    field("purchasingGroup", "Purchasing Group", "input"),
    field("purchasingOrganization_code", "Purchasing Organization", "combo", {
      entity: "PurchasingOrganizations"
    }),
    field("siteId", "Site ID", "input"),
    field("currency_code", "Currency", "combo", {
      required: true,
      entity: "Currencies"
    }),
    plant,
    field("totalValue", "PO Value", "number", { required: true }),
    field("paymentTerms_code", "Payment Terms", "combo", {
      entity: "PaymentTerms"
    }),
    field("remarks", "Remarks", "textarea")
  ];
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
    field("remarks", "Remarks", "textarea")
  ];
  definitions.SES_NEW = sesFields;
  definitions.SES_MOD = sesFields;

  return {
    getFields: function (variantCode) {
      return definitions[variantCode] || [];
    }
  };
});
