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
  const HEADER_CHANGE = "Contract Header Change";

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
    field("materialType", "Material Type", "combo", {
      required: true,
      entity: "MaterialType", key: "materialTypeCode", text: "materialTypeDescription", secondaryText: "materialTypeCode"
    }),
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
      entity: "ExtensionMaterialGroup", key: "extensionMaterialGroupCode", text: "extensionMaterialGroupDescription",
      secondaryText: "extensionMaterialGroupCode"
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
    field("materialType", "Material Type", "combo", {
      required: true,
      entity: "MaterialType", key: "materialTypeCode", text: "materialTypeDescription", secondaryText: "materialTypeCode"
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
      entity: "ExtensionMaterialGroup", key: "extensionMaterialGroupCode", text: "extensionMaterialGroupDescription",
      secondaryText: "extensionMaterialGroupCode"
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
    field("hsCode", "HS Code", "input"),
    field("perUnitPrice", "Per Unit Price", "number"),
    field("approvalDocumentsAttachment", "Approval Documents Attachment", "file", {
      required: false
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
    // Both pick from Admin console tables (Account Assignments, Product Hierarchy).
    field("accountAssignmentGroup", "Account Assignment Group", "combo", {
      required: true, entity: "AccountAssignments"
    }),
    field("productHierarchy", "Product Hierarchy", "combo", {
      required: true, entity: "ProductHierarchy",
      key: "productHierarchyCode", text: "productHierarchyDescription", secondaryText: "productHierarchyCode"
    }),
    field("inspectionStock", "Post to Inspection Stock", "checkbox"),
    field("sourceList", "Source List", "checkbox")
  ];

  const dmsToggle = field("dmsUpdate", "DMS Update Required", "checkbox");

  const whenDms = { field: "dmsUpdate", equals: true };
  const dmsBlock = [
    field("dmsSapMaterialCode", "SAP Material Code", "input", { visibleWhen: whenDms }),
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

  const materialStatus = field("materialStatus", "Material Status (Block/Unblock)", "select", {
    options: [{ key: "BLOCK", text: "Block" }, { key: "UNBLOCK", text: "Unblock" }]
  });
  const whenExtension = { field: "transactionType", equals: "EXTENSION" };
  const whenChange = { field: "transactionType", equals: "CHANGE" };
  const whenTradingChange = { field: "transactionType", equals: "CHANGE_DMS" };
  const changeType = field("transactionType", "Modification Type", "select", {
    required: true,
    options: [{ key: "EXTENSION", text: "Extension" }, { key: "CHANGE", text: "Change" }]
  });
  const tradingChangeType = field("transactionType", "Modification Type", "select", {
    required: true,
    options: [
      { key: "EXTENSION", text: "Extension" },
      { key: "CHANGE_DMS", text: "Change With DMS Update" },
      { key: "DMS_UPDATE_ONLY", text: "DMS Update only" }
    ]
  });
  // An extension needs a plant to extend into; a change works on the material as it stands,
  // so the plant is only mandatory for the extension.
  const modificationPlant = Object.assign({}, plant, { required: false, requiredWhen: whenExtension });
  // Trading needs the plant for an extension and a change with DMS update, but not for DMS update only.
  const tradingModificationPlant = Object.assign({}, plant, {
    required: false,
    requiredWhen: { field: "transactionType", notEquals: "DMS_UPDATE_ONLY" }
  });
  // lineItem: with Multiple Line Items the field is a column of the items table, shown or hidden
  // by its visibleWhen rule, instead of a header field.
  const materialModificationFields = [
    field("referenceMaterialCode", "Material Code", "input", { required: true }),
    modificationPlant,
    field("storageLocation", "Storage Location", "combo", {
      entity: "StorageLocation", key: "storageLocationCode", text: "storageLocationName",
      visibleWhen: whenExtension, lineItem: true
    }),
    field("serialNumberProfile", "Serial Number Profile", "combo", {
      entity: "SerialNumberProfile", key: "serialNumberProfileCode", text: "serialNumberProfileDescription", visibleWhen: whenChange
    }),
    field("description", "Material Description", "input", { maxLength: 40, visibleWhen: whenChange }),
    Object.assign({}, materialStatus, { visibleWhen: whenChange, lineItem: true })
  ];
  const tradingModificationFields = [
    field("referenceMaterialCode", "Material Code", "input", { required: true }),
    tradingModificationPlant,
    field("storageLocation", "Storage Location", "combo", {
      entity: "StorageLocation", key: "storageLocationCode", text: "storageLocationName", visibleWhen: whenExtension
    }),
    field("distributionChannel", "Distribution Channel", "combo", {
      entity: "DistributionChannel", key: "distributionChannelCode", text: "distributionChannelDescription", visibleWhen: whenExtension
    }),
    field("salesOrganization", "Sales Org", "combo", {
      entity: "SalesOrg", key: "salesOrgCode", text: "salesOrgName", visibleWhen: whenExtension
    }),
    field("divisionChanging", "Division Changing", "input", {
      maxLength: 255, visibleWhen: whenTradingChange, lineItem: true
    }),
    field("description", "Material Description", "input", { maxLength: 40, visibleWhen: whenTradingChange }),
    field("serialNumberChange", "Serial Number", "input", {
      maxLength: 255, visibleWhen: whenTradingChange, lineItem: true
    }),
    field("shippingLoadingData", "Shipping / Loading Data", "input", {
      maxLength: 255, visibleWhen: whenTradingChange, lineItem: true
    }),
    Object.assign({}, materialStatus, { visibleWhen: whenTradingChange, lineItem: true }),
    field("infoRecord", "Info Record", "checkbox", { visibleWhen: whenTradingChange, lineItem: true }),
    field("dmsUpdate", "DMS Update", "checkbox", { visibleWhen: whenTradingChange }),
    field("dmsUpdate", "DMS Update", "checkbox", {
      visibleWhen: { field: "transactionType", equals: "DMS_UPDATE_ONLY" }
    }),
    ...dmsBlock
  ];

  const materialCategoryFields = {
    ENG_IT: matCore,
    ADMIN_CONS: matCore,
    TRADING: matCore.concat(matTrading, [dmsToggle], dmsBlock, [field("cepDE", "CEP (DE)", "checkbox")])
  };

  // Keep the original material fields on the reference and modification forms.
  // The workbook relaxes those fields for these request types, so only fields
  // explicitly required by the workbook stay mandatory. DMS fields retain their
  // existing conditional requirements (with SAP Material Code optional).
  const optionalMaterialFields = function (base) {
    return base.map(function (definition) {
      const copy = Object.assign({}, definition, { required: false });
      if (dmsBlock.indexOf(definition) >= 0) {
        copy.required = definition.required;
      }
      return copy;
    });
  };
  const appendMissingFields = function (fields, additions) {
    const names = new Set(fields.map(function (definition) { return definition.name; }));
    additions.forEach(function (definition) {
      if (!names.has(definition.name)) {
        fields.push(definition);
        names.add(definition.name);
      }
    });
    return fields;
  };

  const materialDefinitions = {};
  Object.keys(materialCategoryFields).forEach(function (categoryCode) {
    const base = materialCategoryFields[categoryCode];
    materialDefinitions[categoryCode + ":MAT_NEW"] = base;
    const referenceFields = [
      field("referenceMaterialCode", categoryCode === "TRADING" ? "Material Code" : "Reference Material Code", "input", {
        required: true, placeholder: "Existing SAP material code"
      }),
      plant,
      field("description", "Material Description", "input", { required: true, maxLength: 40 }),
      Object.assign({}, uom, { required: false })
    ];
    if (categoryCode === "TRADING") {
      referenceFields.push(
        field("distributionChannel", "Distribution Channel", "combo", {
          required: true, entity: "DistributionChannel", key: "distributionChannelCode", text: "distributionChannelDescription"
        }),
        field("salesOrganization", "Sales Org", "combo", {
          required: true, entity: "SalesOrg", key: "salesOrgCode", text: "salesOrgName"
        }),
        field("cepDE", "CEP (DE)", "checkbox")
      );
    }
    const modificationFields = categoryCode === "TRADING"
      ? tradingModificationFields
      : materialModificationFields;
    const existingFields = [categoryCode === "TRADING" ? tradingChangeType : changeType]
      .concat(modificationFields.slice(0, 2));
    appendMissingFields(existingFields, optionalMaterialFields(base));
    appendMissingFields(existingFields, modificationFields.slice(2));
    materialDefinitions[categoryCode + ":MAT_EXISTING"] = existingFields;
    materialDefinitions[categoryCode + ":MAT_NEW_REF"] = appendMissingFields(
      referenceFields,
      optionalMaterialFields(base)
    );
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
        entity: "ExtensionMaterialGroup", key: "extensionMaterialGroupCode", text: "extensionMaterialGroupDescription",
        secondaryText: "extensionMaterialGroupCode"
      }),
      field("division", "Division", "combo", { entity: "Divisions", key: "divisionCode", text: "divisionName" }),
      field("deliveringPlant_code", "Delivering Plant", "combo", {
        entity: "Plant", key: "plantCode", text: "plantName"
      }),
      field("taxClass", "Tax Class", "input"),
      field("accountAssignmentGroup", "Account Assignment Group", "combo", { entity: "AccountAssignments" }),
      field("productHierarchy", "Product Hierarchy", "combo", {
        entity: "ProductHierarchy",
        key: "productHierarchyCode", text: "productHierarchyDescription", secondaryText: "productHierarchyCode"
      }),
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
      field("referenceServiceCode", "Reference Service Code", "valueHelp", {
        required: true,
        entity: "ServiceCodes", key: "serviceCode", text: "serviceCode", secondaryText: "serviceDescription",
        placeholder: "Existing service code to copy from"
      }),
      // Category, Unit of Measure and Group are inherited from the reference service code.
      ...serviceNewBase.map(function (definition) {
        return ["serviceCategory", "unitOfMeasure_code", "serviceGroup_code"].indexOf(definition.name) >= 0
          ? Object.assign({}, definition, { required: false })
          : definition;
      })
    ],
    SVC_EXISTING: [
      field("referenceServiceCode", "Existing Service Code", "valueHelp", {
        required: true,
        entity: "ServiceCodes", key: "serviceCode", text: "serviceCode", secondaryText: "serviceDescription"
      }),
      field("serviceDescription", "Requested Description", "input", {
        maxLength: 40,
        placeholder: "Maximum 40 characters"
      }),
      Object.assign({}, uom, { required: false }),
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
      field("siteName", "Site Name", "input", {
        required: true,
        placeholder: "Filled from the selected Site ID (editable)"
      }),
      plant,
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
      field("commissionedDate", "Commissioned Date", "date", { required: true }),
      field("remarks", "Remarks", "textarea"),
      field("supportingAttachment", "Supporting Attachment", "file")
    ],
    EQP_EXISTING: [
      field("existingEquipmentCode", "Existing Equipment Code", "input", {
        required: true,
        maxLength: 80,
        placeholder: "Enter the existing equipment code"
      }),
      field("siteId", "Site ID", "combo", {
        required: true,
        entity: "Sites", key: "siteId", text: "siteId", secondaryText: "siteName",
        autoFills: { field: "siteName", from: "siteName" }
      }),
      field("siteName", "Site Name", "input", {
        required: true,
        placeholder: "Filled from the selected Site ID (editable)"
      }),
      plant,
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
      field("existingFunctionalLocation", "Existing Functional Location", "input", {
        maxLength: 80,
        placeholder: "Enter the existing functional location"
      }),
      // One approver per request (Selected Approval is routed to it), so in Multiple Line mode it
      // stays in the details form instead of becoming a line-item column.
      field("approver_ID", "Approver", "combo", {
        required: true,
        headerOnly: true,
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
      field("activityRequired", "Activity Required", "checkbox"),
      field("projectName", "Project Name", "input", { required: true }),
      // Vendor, Scope, Division, Project Type and AR come from the PCC masters (Admin console);
      // the server builds Project ID / Category / Description from them (see previewProjectCode).
      field("vendorPcc", "Vendor", "combo", {
        required: true, entity: "VendorsPcc", key: "vendor", text: "vendor", secondaryText: "vendorLetter", codeField: "vendorLetter"
      }),
      // Spec 8: Scope applies to engineering requests only.
      field("scope", "Scope", "combo", {
        required: true,
        entity: "ScopePcc", key: "scope", text: "scope", secondaryText: "scope",
        visibleWhen: { field: "requestedByArea", equals: "ENGINEERING" }
      }),
      field("entityCode", "Entity", "combo", {
        required: true, entity: "Entity", key: "code", text: "description", secondaryText: "code"
      }),
      field("division", "Division", "combo", {
        required: true, entity: "DivisionsPcc", key: "division", text: "division", secondaryText: "divisionLetter", codeField: "divisionLetter"
      }),
      field("projectTypePcc", "Project Type", "combo", {
        required: true, entity: "ProjectTypePcc", key: "projectType", text: "projectType", secondaryText: "projectType"
      }),
      field("arReference", "AR", "combo", {
        required: true, entity: "ArPcc", key: "ar", text: "ar", secondaryText: "highLevelPc"
      }),
      field("siteId", "Site ID", "combo", {
        required: true,
        entity: "Sites", key: "siteId", text: "siteId", secondaryText: "siteName",
        autoFills: { field: "siteName", from: "siteName" }
      }),
      field("siteName", "Site Name", "input", {
        required: true,
        placeholder: "Filled from the selected Site ID (editable)"
      }),
      field("projectCategory", "Project Category", "readonly", {
        placeholder: "Generated: High Level PC / Scope / Project Type"
      }),
      field("projectId", "Project ID", "readonly", {
        placeholder: "Generated: Division letter / Year / No. / Vendor letter"
      }),
      field("projectDescription", "Project Description", "readonly", {
        placeholder: "Generated: Site ID_Site Name_Project ID"
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
      field("siteName", "Site Name", "input", {
        required: true,
        placeholder: "Filled from the selected Site ID (editable)",
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
      // Set by the process variant (the server enforces it too), so it is shown, not chosen.
      field("materialType", "Material Type", "select", {
        required: true,
        readOnly: true,
        defaultValue: "DIRECT",
        options: [
          { key: "WAREHOUSE", text: "Warehouse" },
          { key: "DIRECT", text: "Direct Delivery" }
        ]
      }),
      field("poNumber", "PO Number", "valueHelp", {
        entity: "PoNumbers", key: "poNumber", text: "poNumber"
      }),
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
      // Set by the process variant (the server enforces it too), so it is shown, not chosen.
      field("materialType", "Material Type", "select", {
        required: true,
        readOnly: true,
        defaultValue: "WAREHOUSE",
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
      // The SCM step is routed to the SCM SPOC; the user to be notified also gets the completion
      // e-mail (srv _notifyRequestOutcome).
      field("scmSpocUserId", "User ID - SCM SPOC", "combo", {
        required: true,
        entity: "Users", key: "email", text: "displayName", secondaryText: "email"
      }),
      field("notifyUserEmail", "User to be notified", "combo", {
        entity: "Users", key: "email", text: "displayName", secondaryText: "email"
      }),
      field("approvalDocumentsAttachment", "Approval Documents Attachment", "file", { required: true }),
      field("otherComments", "Other Comments", "textarea")
      // Contract count, SCM SPOC, target value and the SAP header terms are captured per row
      // in the Header Creation and Contract Creation Details tables (see headerTableColumns).
    ],
    // Contract Modification, Multiple layout: only Contract Number, Contract Revoked, SCM Assign
    // User and the amendment documents are mandatory; no line items (variantsWithoutLineItems).
    CONTRACT_MOD: [
      field("transactionType", "Contract Action", "select", {
        section: HEADER_CHANGE,
        options: [
          { key: "HEADER_CHANGE", text: "Contract Header Change" },
          { key: "AMENDMENT", text: "Contract Amendment" }
        ]
      }),
      field("selectionMode", "Selection", "select", {
        section: HEADER_CHANGE,
        options: [
          { key: "SINGLE", text: "Single" },
          { key: "MULTIPLE", text: "Multiple" }
        ]
      }),
      field("contractNumber", "Contract Number", "input", { section: HEADER_CHANGE, required: true }),
      field("contractRevoked", "Contract Revoked", "select", { section: HEADER_CHANGE, required: true, options: YES_NO }),
      field("scmAssignUser", "SCM Assign User", "combo", {
        section: HEADER_CHANGE,
        required: true,
        entity: "Users", key: "email", text: "displayName", secondaryText: "email"
      }),
      field("category_code", "Contract Category", "combo", {
        section: HEADER_CHANGE,
        entity: "ContractCategories"
      }),
      field("approvalReference", "Approval Reference", "input", { section: HEADER_CHANGE }),
      field("remarks", "Remarks", "textarea", { section: HEADER_CHANGE }),
      field("approvalDocumentsAttachment", "Approval Documents Attachment", "file", { section: HEADER_CHANGE, required: true }),
      field("otherSupportingDocumentsAttachment", "Other Supporting Documents", "file", { section: HEADER_CHANGE }),
      field("otherComments", "Other Comments", "textarea", { section: HEADER_CHANGE }),
      field("contractCount", "Contract Count", "number", { section: HEADER_CHANGE }),
      field("scmSpocUserId", "User ID - SCM SPOC", "input", { section: HEADER_CHANGE }),
      field("totalTargetValue", "Total Target Value (Contract Ceiling)", "number", { section: HEADER_CHANGE }),
      field("sapVendorCode", "SAP Header - Vendor Code", "input", { section: HEADER_CHANGE }),
      field("sapSourcingEventNo", "SAP Header - Sourcing Event No.", "input", { section: HEADER_CHANGE }),
      field("sapPoHeaderText", "SAP Header - PO Header Text", "textarea", { section: HEADER_CHANGE }),
      field("sapPaymentTerms", "SAP Header - Payment Terms", "input", { section: HEADER_CHANGE }),
      field("sapWarranty", "SAP Header - Warranty", "textarea", { section: HEADER_CHANGE }),
      field("sapPenalties", "SAP Header - Penalties for Breach of Contract (LD / Service Credits)", "textarea", { section: HEADER_CHANGE }),
      field("sapTermsOfDelivery", "SAP Header - Terms of Delivery / Delivery SLA", "textarea", { section: HEADER_CHANGE }),
      field("sapGuarantees", "SAP Header - Guarantees / Performance Bond", "textarea", { section: HEADER_CHANGE }),
      field("sapOtherCommercialTerms", "SAP Header - Any Other Commercial Terms for PO", "textarea", { section: HEADER_CHANGE }),
      field("amendmentDocumentsAttachment", "Contract Amendment Documents", "file", {
        section: "Contract Amendment",
        required: true
      }),
      field("amendmentComments", "Comments", "textarea", { section: "Contract Amendment" })
    ],
    // Contract Modification with Single Line Items (getFields lineMode "SINGLE_LINE").
    // Fields carry a section; the Yes drivers of the Details section also open the change
    // tables defined in conditionalGrids.
    CONTRACT_MOD_SINGLE: [
      field("contractNumber", "Contract Number", "input", { section: "Header Change", required: true }),
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

      field("amendmentContractNumber", "Contract Number", "input", { section: "Details", required: true }),
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
      field("approvalDocumentsAttachment", "Approval Attachments", "file", { section: "Details", required: true }),
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
    // Filled from the Process Variant (Opex / Capex FM / Capex IM) and read-only.
    field("procurementCategory_code", "Procurement Category", "combo", {
      required: true,
      entity: "ProcurementCategories",
      readOnly: true,
      fromVariant: true
    }),
    field("division", "Division", "combo", { entity: "Divisions", key: "divisionCode", text: "divisionName" }),
    field("specialPersonArea", "Special Person Area", "select", {
      options: ["FTK", "ENGINEERING", "IT", "DBS", "MARKETING", "FOC", "DNS"].map(function (key) {
        return { key, text: key };
      })
    }),
    // Mandatory for Capex purchases only.
    field("arNumber", "AR Number", "input", {
      requiredWhen: { field: "procurementCategory_code", in: ["CAPEX_IM", "CAPEX_FM"] }
    }),
    // WBS Element, Cost Center, Budget Code and Campaign / Location Code are captured per line
    // item (itemColumns.PURCHASE_ORDER). Tax stays here because it drives PO Value (With Taxes).
    field("documentType", "Document Type", "combo", { entity: "DocumentTypes", key: "documentTypeCode", text: "documentTypeDescription" }),
    field("taxApplicable", "Tax Applicable", "checkbox"),
    field("applicableTax", "Applicable Tax", "combo", {
      required: true,
      entity: "ApplicableTaxes", key: "taxCode", text: "taxDescription", secondaryText: "taxCode",
      visibleWhen: { field: "taxApplicable", equals: true }
    }),
    field("clearanceChargeApplicable", "Clearance Charge Applicable in LKR", "checkbox"),
    field("clearanceCharge", "Clearance Charge", "number", {
      required: true,
      visibleWhen: { field: "clearanceChargeApplicable", equals: true }
    }),
    field("materialImported", "Material Imported", "checkbox"),
    field("sesRequired", "Create SES Successor", "checkbox"),
    field("paymentRun", "Payment Run", "checkbox", { onSelect: "onPaymentRunSelect" }),
    field("poHeaderText", "PO Header Text", "textarea", { required: true }),
    field("WorkHUBID", "WorkHub ID", "input"),
    field("WorkHubAppID", "WorkHub Application ID", "input"),
    field("procurementDescription", "Procurement Description", "textarea", {
      required: true
    }),
    // Mandatory: the (mandatory) Vendor Code is filled from it.
    field("vendor_ID", "Vendor Name", "combo", {
      required: true,
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
    // Currency, Plant and Account Assignment are captured once per PO; Site ID stays per line
    // item (itemColumns.PURCHASE_ORDER).
    field("currency_code", "Currency", "combo", { required: true, entity: "Currencies" }),
    field("plant_code", "Plant", "combo", {
      required: true,
      entity: "Plant", key: "plantCode", text: "plantName", secondaryText: "plantCode"
    }),
    field("accountAssignment", "Account Assignment", "combo", { required: true, entity: "AccountAssignments" }),
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
    // The requester's e-mail first (pre-filled on the create page); the + button adds up to 4 more,
    // 5 in all (stored "a@x.com; b@y.com").
    field("approvedPoRecipientEmail", "Approved PO Recipient Email", "emailList", {
      required: true,
      maxEmails: 5
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
    field("supportiveDocumentAttachment", "Supporting Document", "file")
  ];
  poFields.push(...requesterFields);
  definitions.PO_CAPEX_IM = poFields;
  definitions.PO_CAPEX_FM = poFields;
  definitions.PO_OPEX = poFields;

  const sesFields = [
    field("purchaseOrderNo", "Purchase Order Number", "valueHelp", {
      required: true,
      entity: "PoNumbers", key: "poNumber", text: "poNumber"
    }),
    field("existingSesNo", "Existing SES Number", "input"),
    field("loaApprover_ID", "LOA Approver", "combo", {
      required: true,
      entity: "Users",
      key: "ID",
      text: "displayName",
      secondaryText: "email"
    }),
    field("flowmateSesRequest", "Payment Run", "checkbox", { onSelect: "onFlowmateServiceEntrySheetSelect" }),
    // Mandatory in both variants: on the form (Single Line) and in each Header Creation row (Multiple).
    field("remarks", "Remarks", "textarea", { required: true }),
    field("sesPaymentOption", "SES / Payment Option", "select", {
      required: true,
      options: [
        { key: "SES_REQUIRED", text: "SES Required" },
        { key: "PAYMENT_REQUIRED", text: "Payment Required" },
        { key: "PAYMENT_REQUIRED_GRN_PO", text: "Payment Required for GRN PO" }
      ]
    }),
    field("sesRecipientEmail", "SES Recipient Email", "input", { required: true }),
    field("specialPersonArea", "Special Area", "select", {
      options: [
        { key: "DBS", text: "DBS" },
        { key: "MARKETING", text: "Marketing" }
      ]
    }),
    field("invoiceBoqAttachment", "Invoice / BoQ / PI / Quotation Attachment", "file", { required: true }),
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
  // Single Line Items only: Type of Transaction, and for a tax based one the Invoice Date and
  // Service Obtained Date (at most 30 days apart, see sesDateProblem), placed before Remarks.
  const sesTaxFields = [
    field("taxTransactionType", "Type of Transaction", "select", {
      required: true,
      options: [
        { key: "TAX_BASED", text: "Tax based" },
        { key: "NON_TAX_BASED", text: "Non tax based" }
      ]
    }),
    field("invoiceDate", "Invoice Date", "date", {
      required: true,
      visibleWhen: { field: "taxTransactionType", equals: "TAX_BASED" }
    }),
    field("serviceObtainedDate", "Service Obtained Date", "date", {
      required: true,
      visibleWhen: { field: "taxTransactionType", equals: "TAX_BASED" }
    })
  ];
  const withSesTaxFields = function (fields) {
    const at = fields.findIndex(function (f) { return f.name === "remarks"; });
    return fields.slice(0, at).concat(sesTaxFields, fields.slice(at));
  };
  Object.keys(sesVariantFields).forEach(function (variant) {
    definitions[variant + "_SINGLE"] = withSesTaxFields(sesVariantFields[variant]);
    definitions[variant] = sesVariantFields[variant]
      .filter(function (f) { return sesFormFieldNames.has(f.name); });
    sesHeaderRowFields[variant] = sesVariantFields[variant]
      .filter(function (f) { return !sesFormFieldNames.has(f.name); });
  });

  const column = (name, label, type, extra) => Object.assign({ name, label, type: type || "input" }, extra || {});

  const COLUMN_KEYS = [
    "name", "label", "type", "required", "requiredWhen", "entity", "key", "text", "secondaryText",
    "options", "maxLength", "autoFills", "placeholder", "codeField"
  ];

  const isHeaderOnlyField = (field, drivers) =>
    field.type === "file" || (!!field.visibleWhen && !field.lineItem) || field.source === "request"
      || !!field.headerOnly || drivers.has(field.name);

  const fieldToColumn = (field) => {
    const col = {};
    COLUMN_KEYS.forEach(function (prop) {
      if (field[prop] !== undefined) {
        col[prop] = field[prop];
      }
    });
    if (field.lineItem && field.visibleWhen) {
      col.visibleWhen = field.visibleWhen;
    }
    return col;
  };

  // Variants whose Multiple Line table holds only these fields (with per-column overrides);
  // every other field stays in the details form above the table.
  const lineItemFields = {
    PROJECT_NEW_MOD: {
      projectName: {},
      siteId: {},
      siteName: {},
      // Generated per row from the row's site and the request's shared Project ID.
      projectDescription: { type: "readonly", required: false, placeholder: "Generated: Site ID_Site Name_Project ID" }
    },
    // Each line names its project, whatever the Object Type (Single shows it for Activity only).
    PROJECT_FL_ACTIVITY: {
      // Column-level visibleWhen: Project Code only for Activity requests, the site columns only
      // for Function Location requests (as in Single).
      projectId: { required: true, visibleWhen: { field: "transactionType", equals: "ACTIVITY" } },
      siteId: { visibleWhen: { field: "transactionType", equals: "FUNCTION_LOCATION" } },
      siteName: { visibleWhen: { field: "transactionType", equals: "FUNCTION_LOCATION" } },
      remarks: {}
    }
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
      column("campaignLocationCode", "Campaign / Location Code", "combo", {
        entity: "Sites", key: "siteId", text: "siteName", secondaryText: "siteId"
      }),
      column("siteId", "Site ID Available", "combo", { entity: "Sites", key: "siteId", text: "siteId", secondaryText: "siteName" }),
      column("itemCategory", "Item Category", "combo", { required: true, entity: "ItemCategories" }),
      column("materialGroup", "Material Group", "combo", {
        required: true, entity: "MatGroup", key: "matGroupCode", text: "matGroupDescription", secondaryText: "matGroupCode"
      })
    ],
    // Shown for Single and Multiple Line Items alike (see alwaysHasItems).
    SERVICE_ENTRY_SHEET: [
      column("itemNo", "ID", "readonly"),
      // Mandatory. Only a PO's SES Successor pop-up leaves PO Number open: the server fills it
      // from the PO (see RequestCreate._openSesDialog).
      column("poNumber", "PO Number", "valueHelp", {
        required: true,
        entity: "PoNumbers", key: "poNumber", text: "poNumber"
      }),
      column("poLineItemNo", "PO Line Item Number", "input", { required: true }),
      column("value", "SES Amount", "number", { required: true }),
      column("quantity", "Quantity", "number")
    ],
    MATERIAL_RESERVATION: [
      column("itemNo", "ID", "readonly"),
      column("siteId", "Site ID", "combo", {
        required: true,
        entity: "Sites", key: "siteId", text: "siteId", secondaryText: "siteName",
        autoFills: { field: "siteName", from: "siteName" }
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
      // Entered by the user: the ID of the Header Creation row this line item belongs to (one
      // header row can have several line items). itemNo stays the internal running number.
      column("headerRowNo", "ID", "number", { required: true }),
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
      Object.assign({}, contractColumn.wbsElement, { label: "Work Breakdown Structure Element (WBS Element)" })
      // User ID - SCM SPOC is captured once, in the Details section (definitions.CONTRACT_NEW).
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
  // Variants whose form has no line-item table even in Multiple mode (older requests that do
  // have items still show them, since itemColumns stay defined).
  const variantsWithoutLineItems = new Set(["CONTRACT_MOD"]);

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
      const lineFields = lineItemFields[variantCode];
      if (lineFields) {
        return fields.filter(function (field) {
          return !!lineFields[field.name];
        }).map(function (field) {
          return Object.assign(fieldToColumn(field), lineFields[field.name]);
        });
      }
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
    capturesLineItems: function (variantCode) {
      return !variantsWithoutLineItems.has(variantCode);
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
      // The Procurement Category comes from the Process Variant, the same for every row.
      const excluded = ["sesRequired", "paymentRequestRequired", "remarks", "procurementCategory_code"];
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
          // A rule on another PO field reads that field from the same row of the table.
          if (definition.requiredWhen && poFields.some(function (other) { return other.name === definition.requiredWhen.field; })) {
            col.requiredWhen = Object.assign({}, definition.requiredWhen, { row: true });
          }
          // A table cell cannot hold the + rows of an e-mail list: one text cell, ";"-separated.
          if (definition.type === "emailList") {
            col.type = "input";
            col.maxEmails = definition.maxEmails;
            col.placeholder = definition.maxEmails
              ? `Up to ${definition.maxEmails} e-mails, separated by ;`
              : "Separate multiple e-mails with ;";
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
    // Read-only line-item tables (Overview, task page): the item columns plus the values the
    // approvers enter per line. Editing tables keep using getItemColumns.
    getItemDisplayColumns: function (requestTypeCode, variantCode, categoryCode) {
      const columns = this.getItemColumns(requestTypeCode, variantCode, categoryCode);
      // New SES: the S/4 Data Validation approver records the SES Number per line item.
      if (requestTypeCode === "SERVICE_ENTRY_SHEET") {
        return variantCode === "SES_NEW" ? columns.concat([column("sesNumber", "SES Number")]) : columns;
      }
      // The S/4 Data Validation approver records the Equipment Code per line (New only; Existing
      // already names its code in Existing Equipment Code).
      if (requestTypeCode === "EQUIPMENT_CODE") {
        return variantCode === "EQP_EXISTING"
          ? columns
          : columns.concat([column("equipmentCode", "Equipment Code")]);
      }
      // The S/4 approver records the Material Reservation Number per line.
      if (requestTypeCode === "MATERIAL_RESERVATION") {
        return columns.concat([column("reservationNumber", "Material Reservation Number")]);
      }
      // ... and the Project Code, or the Function Location / Activity (per Object Type).
      if (requestTypeCode === "PROJECT_CODE") {
        return columns.concat(variantCode === "PROJECT_FL_ACTIVITY"
          ? [
            column("functionLocation", "Function Location", "input", {
              visibleWhen: { field: "transactionType", equals: "FUNCTION_LOCATION" }
            }),
            column("activityNumber", "Activity", "input", {
              visibleWhen: { field: "transactionType", equals: "ACTIVITY" }
            })
          ]
          : [column("projectCode", "Project Code")]);
      }
      let approverColumns;
      if (requestTypeCode === "SERVICE_CODE") {
        const serviceCodeColumn = column("serviceCode", "Service Code");
        // New and New with Reference record the G/L Account and Valuation Class.
        approverColumns = variantCode === "SVC_NEW" || variantCode === "SVC_NEW_REF"
          ? [column("glAccount", "G/L Account"), column("valuationClass_code", "Valuation Class"), serviceCodeColumn]
          : [serviceCodeColumn];
      } else if (requestTypeCode === "MATERIAL_CODE") {
        const materialCodeColumn = column("materialCode", "Material Code");
        // New and New with Reference have the G/L Account Enrichment and Valuation Class steps.
        approverColumns = variantCode === "MAT_NEW" || variantCode === "MAT_NEW_REF"
          ? [column("glAccount", "G/L Account"), column("valuationClass_code", "Valuation Class"), materialCodeColumn]
          : [materialCodeColumn];
      } else {
        return columns;
      }
      const existing = new Set(columns.map(function (col) { return col.name; }));
      return columns.concat(approverColumns.filter(function (col) { return !existing.has(col.name); }));
    },
    // Request types whose line items table may stay empty (a row that is entered is still checked).
    lineItemsOptional: function (requestTypeCode) {
      return requestTypeCode === "PURCHASE_ORDER";
    },
    alwaysHasItems: function (requestTypeCode) {
      return requestTypeCode === "PURCHASE_ORDER" || requestTypeCode === "SERVICE_ENTRY_SHEET";
    },
    // New Contract: every line item's ID must name an existing Header Creation row, and every
    // header row needs at least one line item. Returns the first problem as text, or null.
    contractItemHeaderProblem: function (items, headerCount) {
      const rows = items || [];
      for (let index = 0; index < rows.length; index++) {
        const headerNo = Number(rows[index].headerRowNo);
        if (!Number.isInteger(headerNo) || headerNo < 1 || headerNo > headerCount) {
          return `Contract Creation Details - Row ${index + 1}: ID must match a Header Creation row (1-${headerCount}).`;
        }
      }
      for (let headerNo = 1; headerNo <= headerCount; headerNo++) {
        if (!rows.some(function (row) { return Number(row.headerRowNo) === headerNo; })) {
          return `Header Creation - Row ${headerNo} has no line items.`;
        }
      }
      return null;
    },
    // Service Entry Sheet, tax based: the Invoice Date and Service Obtained Date may be at most 30
    // days apart (either order). Returns the warning, or null. Mirrors sesDateProblem in srv/flowmate-ca.js.
    // A Purchase Order's Procurement Category is its Process Variant: PO_OPEX -> OPEX,
    // PO_CAPEX_FM -> CAPEX_FM, PO_CAPEX_IM -> CAPEX_IM; null for anything else.
    procurementCategoryForVariant: function (variantCode) {
      return /^PO_/.test(variantCode || "") ? variantCode.slice(3) : null;
    },
    // Attachments tab: the group a file is listed under, from the category it was uploaded with.
    // A form file field's category is its name in capitals (taxInvoiceAttachment ->
    // TAX_INVOICE_ATTACHMENT; SES_... for a PO's SES Successor). Returns { order, label }: form
    // fields in form order first, then Supporting Documents, then the other kinds of upload.
    attachmentGroup: function (category, variantCode, categoryCode) {
      const code = String(category || "SUPPORTING_DOCUMENT").toUpperCase();
      const words = function (text) {
        return text.toLowerCase().split("_").filter(Boolean).map(function (word) {
          return word.charAt(0).toUpperCase() + word.slice(1);
        }).join(" ");
      };
      const fixed = {
        SUPPORTING_DOCUMENT: "Supporting Documents",
        PAYMENT_RUN: "Payment Run",
        FLOWMATE_SES: "Flowmate Service Entry Sheet"
      };
      const successor = code.indexOf("SES_") === 0 && variantCode !== "SES_NEW" && variantCode !== "SES_MOD";
      const own = successor ? code.slice(4) : code;
      if (fixed[own]) {
        const order = own === "SUPPORTING_DOCUMENT" ? 1000 : 2000;
        return successor
          ? { order: order + 500, label: `SES Successor - ${fixed[own]}` }
          : { order: order, label: fixed[own] };
      }
      // The form fields of the request (both line modes), or of the SES Successor form.
      const fields = successor
        ? this.getFields("SES_NEW", undefined, "SINGLE_LINE")
        : this.getFields(variantCode, categoryCode, "SINGLE_LINE").concat(this.getFields(variantCode, categoryCode));
      const index = fields.findIndex(function (field) {
        return field.name.replace(/([A-Z])/g, "_$1").toUpperCase() === own;
      });
      const label = index >= 0 ? fields[index].label : words(own);
      return successor
        ? { order: 1500 + Math.max(index, 0), label: `SES Successor - ${label}` }
        : { order: index >= 0 ? index : 2500, label: label };
    },
    // Attachments of form fields hold one current file each: within a field's group the newest is
    // current and every earlier one gets replacedAt = when the next newer file was uploaded.
    // attachments carry groupOrder / groupLabel (attachmentGroup); Supporting Documents and the
    // other kinds of upload (order 1000 and above, SES Successor documents) are never replaced.
    markReplacedAttachments: function (attachments) {
      const byField = {};
      (attachments || []).forEach(function (attachment) {
        const order = attachment.groupOrder;
        const fieldGroup = order < 1000 || (order >= 1500 && order < 2000);
        if (fieldGroup) {
          (byField[attachment.groupLabel] = byField[attachment.groupLabel] || []).push(attachment);
        }
      });
      Object.keys(byField).forEach(function (label) {
        const files = byField[label].slice().sort(function (left, right) {
          return Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0);
        });
        files.forEach(function (attachment, index) {
          attachment.replacedAt = index ? files[index - 1].createdAt : null;
        });
      });
      return attachments;
    },
    sesDateProblem: function (details) {
      const source = details || {};
      // Single Line Items only: a Multiple Line SES (with Header Creation rows) has no Type of Transaction.
      if ((source.headers || []).length || source.taxTransactionType !== "TAX_BASED" || !source.invoiceDate || !source.serviceObtainedDate) {
        return null;
      }
      const day = function (value) { return Date.parse(String(value).slice(0, 10) + "T00:00:00Z"); };
      const invoice = day(source.invoiceDate);
      const service = day(source.serviceObtainedDate);
      if (Number.isNaN(invoice) || Number.isNaN(service)) {
        return null;
      }
      return Math.abs(invoice - service) / 86400000 > 30
        ? "The difference between the Invoice Date and the Service Obtained Date is more than 30 days, so you cannot proceed with the creation of this request."
        : null;
    },
    getHeaderTableColumns: function (variantCode) {
      return headerTableColumns[variantCode] || [];
    },
    // Read-only header tables (Overview, task page): the header columns plus the Contract Number
    // the S/4 Data Validation approver records per row (New Contract).
    getHeaderDisplayColumns: function (variantCode) {
      const columns = this.getHeaderTableColumns(variantCode);
      // ... and the SES Number recorded per Header Creation row of a New SES.
      const recorded = { CONTRACT_NEW: column("contractNumber", "Contract Number"), SES_NEW: column("sesNumber", "SES Number") }[variantCode];
      return recorded && columns.length ? columns.concat([recorded]) : columns;
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
      const lineFields = lineItemFields[variantCode];
      if (lineFields) {
        return fields.filter(function (field) {
          return !lineFields[field.name];
        });
      }
      const drivers = visibilityDrivers(fields);
      return fields.filter(function (field) {
        return isHeaderOnlyField(field, drivers);
      });
    }
  };
});
