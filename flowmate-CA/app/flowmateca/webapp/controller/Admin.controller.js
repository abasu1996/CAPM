sap.ui.define([
  "flowmateca/controller/BaseController",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox"
], function (BaseController, JSONModel, MessageBox) {
  "use strict";

  return BaseController.extend("flowmateca.controller.Admin", {
    onInit: function () {
      this.getView().setModel(new JSONModel({
        steps: [],
        requestTypes: [],
        variants: [],
        users: [],
        teams: [],
        teamMembers: [],
        teamTree: [],
        vendors: [],
        sites: [],
        materials: [],
        wbs: [],
        documentTypes: [],
        purchasingOrganizations: [],
        companyCodes: [],
        purchasingGroups: [],
        currencies: [],
        paymentTerms: [],
        SystemContractBasePO: [],
        divisions: [],
        procurementCategories: [],
        applicableTaxes: [],
        plant: [],
        itemCategories: [],
        accountAssignment: [],
        serviceCategories: [],
        unitsOfMeasure: [],
        serviceGroups: [],
        valuationClasses: [],
        entities: [],
        projects: [],
        matGroups: [],
        extensionMaterialGroups: [],
        profitCenters: [],
        mrpTypes: [],
        availabilityChecks: [],
        serialNumberProfiles: [],
        distributionChannels: [],
        storageLocations: [],
        salesOrgs: [],
        incoterms: [],
        contractTypes: [],
        costCenters: [],
      }), "admin");
      this.getView().setModel(new JSONModel({}), "newItem");
      this.getRouter().getRoute("admin").attachPatternMatched(this.onRefresh, this);
    },

    onRefresh: async function () {
      this.setBusy(true);
      try {
        const [steps, requestTypes, variants, users, teams, teamMembers, vendors, sites, materials, wbs, documentTypes, companyCodes, purchasingGroups, divisions, applicableTaxes, plant, serviceGroups, valuationClasses, storageLocations, salesOrgs, incoterms, costCenters] = await Promise.all([
          this.requestMaster("WorkflowStepConfigs?$expand=requestType,requestVariant&$orderby=requestType_code,requestVariant_code,stepNo"),
          this.requestMaster("RequestTypes?$orderby=sortOrder"),
          this.requestMaster("RequestVariants?$expand=requestType&$orderby=requestType_code,sortOrder"),
          this.requestMaster("Users?$expand=manager&$orderby=displayName"),
          this.requestMaster("Teams?$orderby=name"),
          this.requestMaster("TeamMembers?$expand=user,team"),
          this.requestMaster("Vendors?$orderby=vendorName"),
          this.requestMaster("Sites?$orderby=siteName"),
          this.requestMaster("Materials?$orderby=materialDescription"),
          this.requestMaster("Wbs?$orderby=wbsDescription"),
          this.requestMaster("DocumentTypes?$orderby=documentTypeCode"),
          this.requestMaster("CompanyCodes?$orderby=companyCode"),
          this.requestMaster("PurchasingGroups?$orderby=purchasingGroupCode"),
          this.requestMaster("Divisions?$orderby=divisionCode"),
          this.requestMaster("ApplicableTaxes?$orderby=taxCode"),
          this.requestMaster("Plant?$orderby=plantCode"),
          this.requestMaster("ServiceGroups?$orderby=servicegroupCode"),
          this.requestMaster("ValuationClass?$orderby=valuationclassCode"),
          this.requestMaster("StorageLocation?$orderby=storageLocationCode"),
          this.requestMaster("SalesOrg?$orderby=salesOrgCode"),
          this.requestMaster("Incoterms?$orderby=incotermsCode"),
        this.requestMaster("CostCenter?$orderby=costCenterCode")
        ]);
        const model = this.getView().getModel("admin");
        model.setProperty("/steps", steps.value || []);
        model.setProperty("/requestTypes", requestTypes.value || []);
        model.setProperty("/variants", variants.value || []);
        model.setProperty("/users", users.value || []);
        model.setProperty("/teams", teams.value || []);
        model.setProperty("/teamMembers", teamMembers.value || []);
        model.setProperty("/vendors", vendors.value || []);
        model.setProperty("/sites", sites.value || []);
        model.setProperty("/materials", materials.value || []);
        model.setProperty("/wbs", wbs.value || []);
        model.setProperty("/documentTypes", documentTypes.value || []);
        model.setProperty("/companyCodes", companyCodes.value || []);
        model.setProperty("/purchasingGroups", purchasingGroups.value || []);
        model.setProperty("/divisions", divisions.value || []);
        model.setProperty("/applicableTaxes", applicableTaxes.value || []);
        model.setProperty("/plant", plant.value || []);
        model.setProperty("/serviceGroups",serviceGroups.value || []);
        model.setProperty("/valuationClasses", valuationClasses.value || []);
        model.setProperty("/storageLocations", storageLocations.value || []);
        model.setProperty("/salesOrgs", salesOrgs.value || []);
        model.setProperty("/incoterms",incoterms.value || []);
        model.setProperty("/costCenters", costCenters.value || []);
          // Purchasing Organizations are local to Flowmate CA
        const purchasingOrganizations =
            await this.requestCA(
                "PurchasingOrganizations?$orderby=code"
            );

        const currencies = await this.requestCA("Currencies?$orderby=code");
        model.setProperty("/purchasingOrganizations", purchasingOrganizations.value || []);
        model.setProperty("/currencies", currencies.value || []);
        const paymentTerms = await this.requestCA("PaymentTerms?$orderby=code");
        model.setProperty("/paymentTerms", paymentTerms.value || []);
        const systemContractBasePO = await this.requestCA("SystemContractBasePO?$orderby=code");
        model.setProperty("/systemContractBasePO", systemContractBasePO.value || []);
        const procurementCategories = await this.requestCA("ProcurementCategories?$orderby=code");
        model.setProperty("/procurementCategories", procurementCategories.value || []);
        const itemCategories = await this.requestCA("ItemCategories?$orderby=code");
        model.setProperty("/itemCategories", itemCategories.value || []);
        const accountAssignment = await this.requestCA("AccountAssignments?$orderby=code");
        model.setProperty("/accountAssignments", accountAssignment.value || []);
        const serviceCategories = await this.requestCA("ServiceCategories?$orderby=code");
        model.setProperty("/serviceCategories", serviceCategories.value || []);
        const unitsOfMeasure = await this.requestCA("UnitsOfMeasure?$orderby=code");
        model.setProperty("/unitsOfMeasure", unitsOfMeasure.value || []);
        const entities = await this.requestCA("Entity?$orderby=code");
        model.setProperty("/entities",entities.value || []);
        const projects = await this.requestCA("Projects?$orderby=projectID");
        model.setProperty("/projects",projects.value || []);
        const matGroups = await this.requestCA("MatGroup?$orderby=matGroupCode");
        model.setProperty("/matGroups", matGroups.value || []);
        const extensionMaterialGroups = await this.requestCA("ExtensionMaterialGroup?$orderby=extensionMaterialGroupCode");
        model.setProperty("/extensionMaterialGroups", extensionMaterialGroups.value || []);
        const profitCenters = await this.requestCA("ProfitCenter?$orderby=profitCenterCode");
        model.setProperty("/profitCenters", profitCenters.value || []);
        const mrpTypes = await this.requestCA("MRPType?$orderby=mrpTypeCode");
        model.setProperty("/mrpTypes",mrpTypes.value || []);
        const availabilityChecks = await this.requestCA("AvailabilityCheck?$orderby=availabilityCheckCode");
        model.setProperty("/availabilityChecks",availabilityChecks.value || []);
        const serialNumberProfiles = await this.requestCA("SerialNumberProfile?$orderby=serialNumberProfileCode");
        model.setProperty("/serialNumberProfiles", serialNumberProfiles.value || []);
        const distributionChannels = await this.requestCA("DistributionChannel?$orderby=distributionChannelCode");
        model.setProperty("/distributionChannels", distributionChannels.value || []);
        const contractTypes = await this.requestCA("ContractType?$orderby=contractTypeCode");
        model.setProperty("/contractTypes",contractTypes.value || []);
        model.setProperty("/teamTree", this._teamTree(teams.value || [], teamMembers.value || []));
      } catch (error) {
        this.showError(error);
      } finally {
        this.setBusy(false);
      }
    },



    requestCA: async function (path, options = {}) {

    const response = await fetch(
        "/odata/v4/flowmate-ca/" + path,
        {
            method: options.method || "GET",

            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {})
            },

            body: options.body
                ? JSON.stringify(options.body)
                : undefined
        }
    );

    if (!response.ok) {

        const errorText = await response.text();

        throw new Error(
            `CA service request failed (${response.status}): ${errorText}`
        );
    }

    if (response.status === 204) {
        return null;
    }

    return response.json();
},

    _teamTree: function (teams, memberships) {
      return teams.map(function (team) {
        return {
          title: team.name,
          icon: "sap-icon://group",
          children: memberships
            .filter(function (membership) {
              return membership.team_ID === team.ID;
            })
            .map(function (membership) {
              return {
                title: `${membership.user?.displayName || "Unknown user"} (${membership.user?.email || ""})`,
                icon: "sap-icon://person-placeholder"
              };
            })
        };
      });
    },

    onAddStep: function () {
      this._openAddDialog("step", "Add Workflow Step");
    },

    onAddVariant: function () {
      this._openAddDialog("variant", "Add Process Variant");
    },

    onAddUser: function () {
      this._openAddDialog("user", "Add User");
    },

    onAddTeam: function () {
      this._openAddDialog("team", "Add Team");
    },

    onAddVendor: function () {
      this._openAddDialog("vendor", "Add Vendor");
    },

    onAddSite: function(){
      this._openAddDialog("site", "Add Site");
    },

    onAddMaterial: function(){
      this._openAddDialog("material", "Add Material");
    },

    onAddWBS: function(){
      this._openAddDialog("wbs", "Add WBS");
    },

    onAddDocumentType: function () {
    this._openAddDialog("documentType", "Add Document Type");
    },

    onAddPurchasingOrganization: function () {
    this._openAddDialog("purchasingOrganization", "Add Purchasing Organization");
    },

    onAddCompanyCode: function () {
    this._openAddDialog("companyCode", "Add Company Code");
    },
    onAddPurchasingGroup: function () {
    this._openAddDialog("purchasingGroup", "Add Purchasing Group");
    },
    onAddCurrency: function () {
    this._openAddDialog("currency", "Add Currency");
    },
    onAddPaymentTerm: function () {
    this._openAddDialog("paymentTerm", "Add Payment Term");
    },

    onAddSystemContractBasePO: function () {
    this._openAddDialog("systemContractBasePO", "Add System Contract Base PO");
    },

    onAddDivision: function () {
      this._openAddDialog("division", "Add Division");
    },

    onAddProcurementCategory: function () {
      this._openAddDialog("procurementCategory", "Add Procurement Category");
    },

    onAddApplicableTax: function () {
      this._openAddDialog("applicableTax", "Add Applicable Tax");
    },

    onAddPlant: function () {
      this._openAddDialog("plant", "Add Plant");
    },

    onAddItemCategory: function () {
      this._openAddDialog("itemCategory", "Add Item Category");
    },

    onAddAccountAssignment: function () {
      this._openAddDialog("accountAssignment", "Add Account Assignment");
    },

    onAddServiceCategories : function () {
      this._openAddDialog("serviceCategory", "Add Service Category")
    },

    onAddUnitOfMeasure: function () {
    this._openAddDialog( "unitOfMeasure", "Add Unit of Measure");
    },

    onAddServiceGroup: function () {
    this._openAddDialog("serviceGroup", "Add Service Group");
    },
    onAddValuationClass: function () {
      this._openAddDialog("valuationClass","Add Valuation Class");
},

onAddEntity: function () {
    this._openAddDialog(
        "entity",
        "Add Entity"
    );
},

onAddProject: function () {
    this._openAddDialog(
        "project",
        "Add Project"
    );
},
onAddMatGroup: function () {
    this._openAddDialog(
        "matGroup",
        "Add Material Group"
    );
},

onAddExtensionMaterialGroup: function () {
    this._openAddDialog(
        "extensionMaterialGroup",
        "Add Extension Material Group"
    );
},
onAddProfitCenter: function () {
    this._openAddDialog(
        "profitCenter",
        "Add Profit Center"
    );
},
onAddMRPType: function () {
    this._openAddDialog(
        "mrpType",
        "Add MRP Type"
    );
},
onAddAvailabilityCheck: function () {
    this._openAddDialog(
        "availabilityCheck",
        "Add Availability Check"
    );
},
onAddSerialNumberProfile: function () {
    this._openAddDialog(
        "serialNumberProfile",
        "Add Serial Number Profile"
    );
},

onAddDistributionChannel: function () {
    this._openAddDialog(
        "distributionChannel",
        "Add Distribution Channel"
    );
},
onAddStorageLocation: function () {
    this._openAddDialog("storageLocation", "Add Storage Location"
);
},
onAddSalesOrg: function () {
    this._openAddDialog(
        "salesOrg",
        "Add Sales Org"
    );
},
onAddIncoterm: function () {
    this._openAddDialog(
        "incoterm",
        "Add Incoterm"
    );
},

onAddContractType: function () {
    this._openAddDialog(
        "contractType",
        "Add Contract Type"
    );
},
onAddCostCenter: function () {
    this._openAddDialog("costCenter", "Add Cost Center");
},

    _openAddDialog: function (type, title) {
      this.getView().getModel("newItem").setData({
        type,
        title,
        isStep: type === "step",
        isVariant: type === "variant",
        isUser: type === "user",
        isTeam: type === "team",
        isVendor: type === "vendor",
        isSite: type === "site",
        isMaterial: type === "material",
        isWBS: type === "wbs",
        isDocumentType: type === "documentType",
        isPurchasingOrganization: type === "purchasingOrganization",
        isCompanyCode: type === "companyCode",
        isPurchasingGroup: type === "purchasingGroup",
        isPaymentTerm: type === "paymentTerm",
        isSystemContractBasePO: type === "systemContractBasePO",
        isCurrency: type === "currency",
        isAccountAssignment: type === "accountAssignment",
        isProcurementCategory: type === "procurementCategory",
        isDivision: type === "division",
        isApplicableTax: type === "applicableTax",
        isPlant: type === "plant",
        isItemCategory: type === "itemCategory",
        isServiceCategory: type === "serviceCategory",
        isUnitOfMeasure: type === "unitOfMeasure",
        isServiceGroup: type === "serviceGroup",
        isValuationClass: type === "valuationClass",
        isEntity: type === "entity",
        isProject: type === "project",
        isMatGroup: type === "matGroup",
        isExtensionMaterialGroup: type === "extensionMaterialGroup",
        isProfitCenter: type === "profitCenter",
        isMRPType: type === "mrpType",
        isAvailabilityCheck: type === "availabilityCheck",
        isSerialNumberProfile: type === "serialNumberProfile",
        isDistributionChannel: type === "distributionChannel",
        isStorageLocation: type === "storageLocation",
        isSalesOrg: type === "salesOrg",
        isIncoterm: type === "incoterm",
        isContractType: type === "contractType",
        isCostCenter: type === "costCenter",
        requestTypeCode: "",
        requestVariantCode: "",
        variants: [],
        stepNo: 1,
        name: "",
        description: "",
        code: "",
        email: "",
        managerId: "",
        teamId: "",
        taskName: "",
        purchasingOrgCode: "",
        purchasingOrgName: "",
        currencyCode: "",
        currencyName: "",
        paymentTermCode: "",
        paymentTermName: "",
        systemContractBasePOCode: "",
        systemContractBasePOName: "",
        procurementCategoryCode: "",
        procurementCategoryName: "",
        itemCategoryCode: "",
        itemCategoryName: "",
        accountAssignmentCode: "",
        accountAssignmentDescription: "",
        serviceCategoryCode: "",
        serviceCategoryDescription: "",
        unitOfMeasureCode: "",
        unitOfMeasureName: "",
        unitOfMeasureDescription: "",
        entityCode: "",
        entityDescription: "",
        projectID: "",
        projectCategory: "",
        projectDescription: "",
        matGroupCode: "",
        matGroupDescription: "",
        extensionMaterialGroupCode: "",
        extensionMaterialGroupDescription: "",
        profitCenterCode: "",
        profitCenterDescription: "",
        mrpTypeCode: "",
        mrpTypeDescription: "",
        availabilityCheckCode: "",
        availabilityCheckDescription: "",
        serialNumberProfileCode: "",
        serialNumberProfileDescription: "",
        distributionChannelCode: "",
        distributionChannelDescription: "",
        contractTypeCode: "",
        contractTypeDescription: "",

      });
      this.byId("addConfigDialog").open();
    },

    onNewStepTypeChange: function () {
      const model = this.getView().getModel("newItem");
      const code = model.getProperty("/requestTypeCode");
      const variants = this.getView().getModel("admin").getProperty("/variants") || [];
      model.setProperty("/variants", variants.filter(function (variant) {
        return variant.requestType_code === code;
      }));
      model.setProperty("/requestVariantCode", "");
    },

    onCreateConfigItem: async function () {
      const item = this.getView().getModel("newItem").getData();
      try {
        if (item.type === "step") {
          if (!item.requestTypeCode || !item.requestVariantCode || !item.name) {
            throw new Error("Request type, variant and step name are required.");
          }
          await this.requestMaster("WorkflowStepConfigs", {
            method: "POST",
            body: {
              requestType_code: item.requestTypeCode,
              requestVariant_code: item.requestVariantCode,
              stepNo: Number(item.stepNo),
              stepName: item.name,
              activityDescription: item.description,
              processorTeam_ID: item.teamId || null,
              taskName: item.taskName || item.name,
              isMandatory: true,
              isApproval: false,
              slaDays: 2,
              isActive: true
            }
          });
        } else if (item.type === "variant") {
          if (!item.requestTypeCode || !item.code || !item.name) {
            throw new Error("Request type, variant code and name are required.");
          }
          await this.requestMaster("RequestVariants", {
            method: "POST",
            body: {
              code: item.code,
              name: item.name,
              description: item.description,
              requestType_code: item.requestTypeCode,
              isActive: true,
              sortOrder: 100
            }
          });
        } else if (item.type === "user") {
          if (!item.name || !item.email) {
            throw new Error("Display name and email are required.");
          }
          await this.requestMaster("Users", {
            method: "POST",
            body: {
              displayName: item.name,
              email: item.email,
              userPrincipalName: item.email,
              manager_ID: item.managerId || null,
              isActive: true
            }
          });
        } else if (item.type === "team") {
          if (!item.code || !item.name) {
            throw new Error("Team code and name are required.");
          }
          await this.requestMaster("Teams", {
            method: "POST",
            body: {
              teamCode: item.code,
              name: item.name,
              description: item.description,
              isActive: true
            }
          });
        } else if (item.type === "vendor") {
          if (!item.code || !item.name) {
            throw new Error("Vendor code and name are required.");
          }
          await this.requestMaster("Vendors", {
            method: "POST",
            body: {
              vendorCode: item.code,
              vendorName: item.name,
              vendorEmail: item.email,
              isActive: true
            }
          });
        } else if (item.type === "site") {
          if (!item.siteId || !item.siteName) {
            throw new Error("Site ID and Site Name are required.");
          }
          await this.requestMaster("Sites", {
            method: "POST",
            body: {
              siteId: item.siteId,
              siteName: item.siteName,
              isActive: true
            }
          });
        } else if (item.type === "material") {
          if (!item.materialCode || !item.materialDescription) {
            throw new Error("Material Code and Material Description are required.");
          }
          await this.requestMaster("Materials", {
            method: "POST",
            body: {
              materialCode: item.materialCode,
              materialDescription: item.materialDescription,
              isActive: true
            }
          });
        } else if (item.type === "wbs") {
          if (!item.wbsCode || !item.wbsDescription) {
            throw new Error("WBS Code and WBS Description are required.");
          }
          await this.requestMaster("Wbs", {
            method: "POST",
            body: {
              wbsCode: item.wbsCode,
              wbsDescription: item.wbsDescription,
              isActive: true
            }
          });
        } else if (item.type === "documentType") {

    if (!item.documentTypeCode || !item.documentTypeDescription) {
        throw new Error(
            "Document Type Code and Document Type Description are required."
        );
    }

    await this.requestMaster("DocumentTypes", {
        method: "POST",
        body: {
            documentTypeCode: item.documentTypeCode,
            documentTypeDescription: item.documentTypeDescription,
            isActive: true
        }
    });
}  else if (item.type === "companyCode") {
          if (!item.companyCode || !item.companyName) {
            throw new Error("Company Code and Company Name are required.");
          }
          await this.requestMaster("CompanyCodes", {
            method: "POST",
            body: {
              companyCode: item.companyCode,
              companyName: item.companyName,
              isActive: true
            }
          });
        } else if (item.type === "purchasingGroup") {
          if (!item.purchasingGroupCode || !item.purchasingGroupName) {
            throw new Error("Purchasing Group Code and Purchasing Group Name are required.");
          }
          await this.requestMaster("PurchasingGroups", {
            method: "POST",
            body: {
              purchasingGroupCode: item.purchasingGroupCode,
              purchasingGroupName: item.purchasingGroupName,
              isActive: true
            }
          });
        }


else if (item.type === "purchasingOrganization") {

    const code = item.purchasingOrgCode?.trim();
    const name = item.purchasingOrgName?.trim();

    if (!code || !name) {
        throw new Error(
            "Purchasing Organization Code and Purchasing Organization Name are required."
        );
    }

    await this.requestCA(
        "PurchasingOrganizations",
        {
            method: "POST",
            body: {
                code: code,
                name: name,
                isActive: true
            }
        }
    );
        }

    else if (item.type === "currency") {

    const code = item.currencyCode?.trim();
    const name = item.currencyName?.trim();

    if (!code || !name) {
        throw new Error(
            "Currency Code and Currency Name are required."
        );
    }

    await this.requestCA(
        "Currencies",
        {
            method: "POST",
            body: {
                code: code,
                name: name,
                isActive: true
            }
        }
    );
        }  else if (item.type === "paymentTerm") {

    const code = item.paymentTermCode?.trim();
    const name = item.paymentTermName?.trim();

    if (!code || !name) {
        throw new Error(
            "Payment Term Code and Payment Term Name are required."
        );
    }

    await this.requestCA(
        "PaymentTerms",
        {
            method: "POST",
            body: {
                code: code,
                name: name,
                isActive: true
            }
        }
    );
        }


         else if (item.type === "systemContractBasePO") {

    const code = item.systemContractBasePOCode?.trim();
    const name = item.systemContractBasePOName?.trim();

    if (!code || !name) {
        throw new Error(
            "System Contract Base PO Code and System Contract Base PO Name are required."
        );
    }

    await this.requestCA(
        "SystemContractBasePO",
        {
            method: "POST",
            body: {
                code: code,
                name: name,
                isActive: true
            }
        }
    );
        } else if (item.type === "division") {
          if (!item.divisionCode || !item.divisionName) {
            throw new Error("Division Code and Division Name are required.");
          }
          await this.requestMaster("Divisions", {
            method: "POST",
            body: {
              divisionCode: item.divisionCode,
              divisionName: item.divisionName,
              isActive: true
            }
          });
        }
        else if (item.type === "procurementCategory") {

    const code = item.procurementCategoryCode?.trim();
    const name = item.procurementCategoryName?.trim();

    if (!code || !name) {
        throw new Error(
            "Procurement Category Code and Procurement Category Name are required."
        );
    }

    await this.requestCA(
        "ProcurementCategories",
        {
            method: "POST",
            body: {
                code: code,
                name: name,
                isActive: true
            }
        }
    );
        } else if (item.type === "applicableTax") {
          if (!item.taxCode || !item.taxDescription) {
            throw new Error("Tax Code and Tax Description are required.");
          }
          await this.requestMaster("ApplicableTaxes", {
            method: "POST",
            body: {
              taxCode: item.taxCode,
              taxDescription: item.taxDescription,
              isActive: true
            }
          });
        } else if (item.type === "plant") {
          if (!item.plantCode || !item.plantName) {
            throw new Error("Plant Code and Plant Name are required.");
          }
          await this.requestMaster("Plant", {
            method: "POST",
            body: {
              plantCode: item.plantCode,
              plantName: item.plantName,
              isActive: true
            }
          });
        }
        else if (item.type === "itemCategory") {

    const code = item.itemCategoryCode?.trim();
    const name = item.itemCategoryName?.trim();

    if (!code || !name) {
        throw new Error(
            "Item Category Code and Item Category Name are required."
        );
    }

    await this.requestCA(
        "ItemCategories",
        {
            method: "POST",
            body: {
                code: code,
                name: name,
                isActive: true
            }
        }
    );
        } else if (item.type === "accountAssignment") {

    const code = item.accountAssignmentCode?.trim();
    const description = item.accountAssignmentDescription?.trim();

    if (!code || !description) {
        throw new Error(
            "Account Assignment Code and Account Assignment Description are required."
        );
    }

    await this.requestCA(
        "AccountAssignments",
        {
            method: "POST",
            body: {
                code: code,
                name: description,
                description: description,
                isActive: true
            }
        }
    );
        }  else if (item.type === "serviceCategory") {

    const code = item.serviceCategoryCode?.trim();
    const description = item.serviceCategoryDescription?.trim();

    if (!code || !description) {
        throw new Error(
            "Service Category Code and Service Category Description are required."
        );
    }

    await this.requestCA(
        "ServiceCategories",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: {
                code: code,
                name: description,
                description: description,
                isActive: true
            }
        }
    );
}else if (item.type === "unitOfMeasure") {

    const code = item.unitOfMeasureCode?.trim();
    const name = item.unitOfMeasureName?.trim();
    const description = item.unitOfMeasureDescription?.trim();

    if (!code || !name) {
        throw new Error(
            "Unit of Measure Code and Unit of Measure Name are required."
        );
    }

    await this.requestCA(
        "UnitsOfMeasure",
        {
            method: "POST",
            body: {
                code: code,
                name: name,
                description: description || null,
                isActive: true,
                sortOrder: 100
            }
        }
    );
} else if (item.type === "serviceGroup") {

    const code = item.serviceGroupCode?.trim();
    const description =
        item.serviceGroupDescription?.trim();

    if (!code || !description) {
        throw new Error(
            "Service Group Code and Service Group Description are required."
        );
    }

    await this.requestMaster(
        "ServiceGroups",
        {
            method: "POST",
            body: {
                servicegroupCode: code,
                servicegroupDescription: description,
                isActive: true
            }
        }
    );
} else if (item.type === "valuationClass") {

    const code = item.valuationClassCode?.trim();
    const description =
        item.valuationClassDescription?.trim();

    if (!code || !description) {
        throw new Error(
            "Valuation Class Code and Valuation Class Description are required."
        );
    }

    await this.requestMaster(
        "ValuationClass",
        {
            method: "POST",
            body: {
                valuationclassCode: code,
                valuationclassDescription: description,
                isActive: true
            }
        }
    );
} else if (item.type === "entity") {

    const code = item.entityCode?.trim();
    const description = item.entityDescription?.trim();

    if (!code || !description) {
        throw new Error(
            "Entity Code and Entity Description are required."
        );
    }

    await this.requestCA(
        "Entity",
        {
            method: "POST",
            body: {
                code: code,
                description: description,
                isActive: true
            }
        }
    );
} else if (item.type === "project") {

    const projectID = item.projectID?.trim();
    const projectCategory = item.projectCategory?.trim();
    const projectDescription =
        item.projectDescription?.trim();

    if (!projectID || !projectCategory) {
        throw new Error(
            "Project ID and Project Category are required."
        );
    }

    await this.requestCA(
        "Projects",
        {
            method: "POST",
            body: {
                projectID: projectID,
                projectCategory: projectCategory,
                projectDescription:
                    projectDescription || null,
                isActive: true
            }
        }
    );
} else if (item.type === "matGroup") {

    const code = item.matGroupCode?.trim();
    const description =
        item.matGroupDescription?.trim();

    if (!code || !description) {
        throw new Error(
            "Material Group Code and Material Group Description are required."
        );
    }

    await this.requestCA(
        "MatGroup",
        {
            method: "POST",
            body: {
                matGroupCode: code,
                matGroupDescription: description,
                isActive: true
            }
        }
    );
} else if (item.type === "extensionMaterialGroup") {

    const code =
        item.extensionMaterialGroupCode?.trim();

    const description =
        item.extensionMaterialGroupDescription?.trim();

    if (!code || !description) {
        throw new Error(
            "Extension Material Group Code and Extension Material Group Description are required."
        );
    }

    await this.requestCA(
        "ExtensionMaterialGroup",
        {
            method: "POST",
            body: {
                extensionMaterialGroupCode: code,
                extensionMaterialGroupDescription: description,
                isActive: true
            }
        }
    );
} else if (item.type === "profitCenter") {

    const code = item.profitCenterCode?.trim();
    const description =
        item.profitCenterDescription?.trim();

    if (!code || !description) {
        throw new Error(
            "Profit Center Code and Profit Center Description are required."
        );
    }

    await this.requestCA(
        "ProfitCenter",
        {
            method: "POST",
            body: {
                profitCenterCode: code,
                profitCenterDescription: description,
                isActive: true
            }
        }
    );
}
else if (item.type === "mrpType") {

    const code = item.mrpTypeCode?.trim();
    const description = item.mrpTypeDescription?.trim();

    if (!code || !description) {
        throw new Error(
            "MRP Type Code and MRP Type Description are required."
        );
    }

    await this.requestCA(
        "MRPType",
        {
            method: "POST",
            body: {
                mrpTypeCode: code,
                mrpTypeDescription: description,
                isActive: true
            }
        }
    );
  }else if (item.type === "availabilityCheck") {

    const code = item.availabilityCheckCode?.trim();
    const description =
        item.availabilityCheckDescription?.trim();

    if (!code || !description) {
        throw new Error(
            "Availability Check Code and Availability Check Description are required."
        );
    }

    await this.requestCA(
        "AvailabilityCheck",
        {
            method: "POST",
            body: {
                availabilityCheckCode: code,
                availabilityCheckDescription: description,
                isActive: true
            }
        }
    );
}else if (item.type === "serialNumberProfile") {

    const code = item.serialNumberProfileCode?.trim();
    const description =
        item.serialNumberProfileDescription?.trim();

    if (!code || !description) {
        throw new Error(
            "Serial Number Profile Code and Serial Number Profile Description are required."
        );
    }

    await this.requestCA(
        "SerialNumberProfile",
        {
            method: "POST",
            body: {
                serialNumberProfileCode: code,
                serialNumberProfileDescription: description,
                isActive: true
            }
        }
    );
}else if (item.type === "distributionChannel") {

    const code = item.distributionChannelCode?.trim();
    const description =
        item.distributionChannelDescription?.trim();

    if (!code || !description) {
        throw new Error(
            "Distribution Channel Code and Distribution Channel Description are required."
        );
    }

    await this.requestCA(
        "DistributionChannel",
        {
            method: "POST",
            body: {
                distributionChannelCode: code,
                distributionChannelDescription: description,
                isActive: true
            }
        }
    );
}else if (item.type === "storageLocation") {

    const code = item.storageLocationCode?.trim();
    const name = item.storageLocationName?.trim();

    if (!code || !name) {
        throw new Error(
            "Storage Location Code and Storage Location Name are required."
        );
    }

    await this.requestMaster(
        "StorageLocation",
        {
            method: "POST",
            body: {
                storageLocationCode: code,
                storageLocationName: name,
                isActive: true
            }
        }
    );
}else if (item.type === "salesOrg") {

    const code = item.salesOrgCode?.trim();
    const name = item.salesOrgName?.trim();

    if (!code || !name) {
        throw new Error(
            "Sales Org Code and Sales Org Name are required."
        );
    }

    await this.requestMaster(
        "SalesOrg",
        {
            method: "POST",
            body: {
                salesOrgCode: code,
                salesOrgName: name,
                isActive: true
            }
        }
    );
}else if (item.type === "incoterm") {

    const code = item.incotermsCode?.trim();
    const description = item.incotermsDescription?.trim();

    if (!code || !description) {
        throw new Error(
            "Incoterms Code and Incoterms Description are required."
        );
    }

    await this.requestMaster(
        "Incoterms",
        {
            method: "POST",
            body: {
                incotermsCode: code,
                incotermsDescription: description,
                isActive: true
            }
        }
    );
} else if (item.type === "contractType") {

    const code = item.contractTypeCode?.trim();
    const description =
        item.contractTypeDescription?.trim();

    if (!code || !description) {
        throw new Error(
            "Contract Type Code and Contract Type Description are required."
        );
    }

    await this.requestCA(
        "ContractType",
        {
            method: "POST",
            body: {
                contractTypeCode: code,
                contractTypeDescription: description,
                isActive: true
            }
        }
    );
} else if (item.type === "costCenter") {

    const code = item.costCenterCode?.trim();
    const name = item.costCenterName?.trim();

    if (!code || !name) {
        throw new Error(
            "Cost Center Code and Cost Center Name are required."
        );
    }

    await this.requestMaster("CostCenter", {
        method: "POST",
        body: {
            costCenterCode: code,
            costCenterName: name,
            isActive: true
        }
    });
}


        this.byId("addConfigDialog").close();
        this.showSuccess("Configuration created");
        await this.onRefresh();
      } catch (error) {
        this.showError(error);
      }
    },

    onCloseConfigDialog: function () {
      this.byId("addConfigDialog").close();
},


    _patch: async function (entity, key, data, stringKey) {

    try {

        const formattedKey = stringKey
            ? `'${encodeURIComponent(key)}'`
            : key;

        await this.requestMaster(
            `${entity}(${formattedKey})`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "If-Match": "*"
                },
                body: data
            }
        );

        this.showSuccess("Changes saved");

        await this.onRefresh();

    } catch (error) {

        this.showError(error);

    }
},

    onSaveStep: function (event) {
      const row = event.getSource().getBindingContext("admin").getObject();
      return this._patch("WorkflowStepConfigs", row.ID, {
        stepNo: Number(row.stepNo),
        stepName: row.stepName,
        activityDescription: row.activityDescription,
        processorTeam_ID: row.processorTeam_ID || null,
        isMandatory: row.isMandatory,
        slaDays: Number(row.slaDays),
        isActive: row.isActive
      }, false);
    },

    onDeleteStep: function (event) {
      return this._delete("WorkflowStepConfigs", event.getSource().getBindingContext("admin").getObject());
    },

    onSaveVariant: function (event) {
      const row = event.getSource().getBindingContext("admin").getObject();
      return this._patch("RequestVariants", row.code, {
        name: row.name,
        description: row.description,
        isActive: row.isActive
      }, true);
    },

    onDeleteVariant: function (event) {
      return this._delete("RequestVariants", event.getSource().getBindingContext("admin").getObject(), true);
    },

    onSaveUser: function (event) {
      const row = event.getSource().getBindingContext("admin").getObject();
      return this._patch("Users", row.ID, {
        displayName: row.displayName,
        email: row.email,
        userPrincipalName: row.userPrincipalName || row.email,
        manager_ID: row.manager_ID || null,
        isActive: row.isActive
      });
    },

    onDeleteUser: function (event) {
      return this._delete("Users", event.getSource().getBindingContext("admin").getObject());
    },

    onSaveTeam: function (event) {
      const row = event.getSource().getBindingContext("admin").getObject();
      return this._patch("Teams", row.ID, {
        name: row.name,
        description: row.description,
        isActive: row.isActive
      });
    },

    onDeleteTeam: function (event) {
      return this._delete("Teams", event.getSource().getBindingContext("admin").getObject());
    },

    onSaveVendor: function (event) {
      const row = event.getSource().getBindingContext("admin").getObject();
      return this._patch("Vendors", row.ID, {
        vendorName: row.vendorName,
        vendorEmail: row.vendorEmail,
        isActive: row.isActive
      });
    },

    onDeleteVendor: function (event) {
      return this._delete("Vendors", event.getSource().getBindingContext("admin").getObject());
    },

    onSaveSite: function (event) {
      const row = event.getSource().getBindingContext("admin").getObject();
      return this._patch("Sites", row.ID, {
        siteId: row.siteId,
        siteName: row.siteName,
        isActive: row.isActive
      });
    },


onDeleteSite: function (event) {
      return this._delete("Sites", event.getSource().getBindingContext("admin").getObject());
    },

onSaveMaterial: function (event) {
      const row = event.getSource().getBindingContext("admin").getObject();
      return this._patch("Materials", row.ID, {
        materialCode: row.materialCode,
        materialDescription: row.materialDescription,
        isActive: row.isActive
      });
    },


onDeleteMaterial: function (event) {
      return this._delete("Materials", event.getSource().getBindingContext("admin").getObject());
    },

onSaveWBS: function (event) {
      const row = event.getSource().getBindingContext("admin").getObject();
      return this._patch("Wbs", row.ID, {
        wbsCode: row.wbsCode,
        wbsDescription: row.wbsDescription,
        isActive: row.isActive
      });
    },

    onSaveDocumentType: function (event) {
    const row = event
        .getSource()
        .getBindingContext("admin")
        .getObject();

    return this._patch("DocumentTypes", row.ID, {
        documentTypeCode: row.documentTypeCode,
        documentTypeDescription: row.documentTypeDescription,
        isActive: row.isActive
    });
},

onDeleteDocumentType: function (event) {
    return this._delete( "DocumentTypes", event.getSource().getBindingContext("admin").getObject());
},

onDeleteWBS: function (event) {
      return this._delete("Wbs", event.getSource().getBindingContext("admin").getObject());
    },


onSaveCompanyCode: function (event) {
    const row = event
        .getSource()
        .getBindingContext("admin")
        .getObject();
        return this._patch("CompanyCodes", row.ID, {
        companyCode: row.companyCode,
        companyName: row.companyName,
        isActive: row.isActive
    });
},
onDeleteCompanyCode: function (event) {

    const row = event
        .getSource()
        .getBindingContext("admin")
        .getObject();
        return this._delete(
        "CompanyCodes",
        row
    );
},

    onSavePurchasingGroup: function (event) {
    const row = event
        .getSource()
        .getBindingContext("admin")
        .getObject();
  return this._patch("PurchasingGroups", row.ID, {
        purchasingGroupCode: row.purchasingGroupCode,
        purchasingGroupName: row.purchasingGroupName,
        isActive: row.isActive
    });
},

    onDeletePurchasingGroup: function (event) {
      return this._delete( "PurchasingGroups", event.getSource().getBindingContext("admin").getObject());

    },

    onSavePurchasingOrganization: async function (event) {

    const row = event
        .getSource()
        .getBindingContext("admin")
        .getObject();

    try {

        await this.requestCA(
            `PurchasingOrganizations('${encodeURIComponent(row.code)}')`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "If-Match": "*"
                },
                body: {
                    code: row.code,
                    name: row.name,
                    description: row.description,
                    isActive: row.isActive,
                    sortOrder: row.sortOrder
                }
            }
        );

        this.showSuccess("Changes saved");

        await this.onRefresh();

    } catch (error) {

        this.showError(error);

    }
},
    onDeletePurchasingOrganization: async function (event) {

    const row = event
        .getSource()
        .getBindingContext("admin")
        .getObject();

    const confirmed = await new Promise(function (resolve) {

        MessageBox.confirm(
            "Delete this Purchasing Organization?",
            {
                onClose: function (action) {
                    resolve(
                        action === MessageBox.Action.OK
                    );
                }
            }
        );

    });

    if (!confirmed) {
        return;
    }

    try {

        await this.requestCA(
            `PurchasingOrganizations('${encodeURIComponent(row.code)}')`,
            {
                method: "DELETE",
                headers: {
                    "If-Match": "*"
                }
            }
        );

        this.showSuccess(
            "Purchasing Organization deleted"
        );

        await this.onRefresh();

    } catch (error) {

        this.showError(error);

    }
},

 onSaveCurrency: async function (event) {

    const row = event
        .getSource()
        .getBindingContext("admin")
        .getObject();

    try {

        await this.requestCA(
            `Currencies('${encodeURIComponent(row.code)}')`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "If-Match": "*"
                },
                body: {
                    code: row.code,
                    name: row.name,
                    description: row.description,
                    isActive: row.isActive,
                    sortOrder: row.sortOrder
                }
            }
        );

        this.showSuccess("Changes saved");

        await this.onRefresh();

    } catch (error) {

        this.showError(error);

    }
},

    onDeleteCurrency: async function (event) {

    const row = event
        .getSource()
        .getBindingContext("admin")
        .getObject();

    const confirmed = await new Promise(function (resolve) {

        MessageBox.confirm(
            "Delete this Currency?",
            {
                onClose: function (action) {
                    resolve(
                        action === MessageBox.Action.OK
                    );
                }
            }
        );

    });

    if (!confirmed) {
        return;
    }

    try {

        await this.requestCA(
            `Currencies('${encodeURIComponent(row.code)}')`,
            {
                method: "DELETE",
                headers: {
                    "If-Match": "*"
                }
            }
        );

        this.showSuccess(
            "Currency deleted"
        );

        await this.onRefresh();

    } catch (error) {

        this.showError(error);

    }
},

onSavePaymentTerm: async function (event) {

    const row = event
        .getSource()
        .getBindingContext("admin")
        .getObject();

    try {

        await this.requestCA(
            `PaymentTerms('${encodeURIComponent(row.code)}')`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "If-Match": "*"
                },
                body: {
                    code: row.code,
                    name: row.name,
                    description: row.description,
                    isActive: row.isActive,
                    sortOrder: row.sortOrder
                }
            }
        );

        this.showSuccess("Changes saved");

        await this.onRefresh();

    } catch (error) {

        this.showError(error);

    }
},

onDeletePaymentTerm: async function (event) {

    const row = event
        .getSource()
        .getBindingContext("admin")
        .getObject();

    const confirmed = await new Promise(function (resolve) {

        MessageBox.confirm(
            "Delete this Payment Term?",
            {
                onClose: function (action) {
                    resolve(
                        action === MessageBox.Action.OK
                    );
                }
            }
        );

    });

    if (!confirmed) {
        return;
    }

    try {

        await this.requestCA(
            `PaymentTerms('${encodeURIComponent(row.code)}')`,
            {
                method: "DELETE",
                headers: {
                    "If-Match": "*"
                }
            }
        );

        this.showSuccess(
            "Payment Term deleted"
        );

        await this.onRefresh();

    } catch (error) {

        this.showError(error);

    }
},


onSaveSystemContractBasePO: async function (event) {

    const row = event
        .getSource()
        .getBindingContext("admin")
        .getObject();

    try {

        await this.requestCA(
            `SystemContractBasePOs('${encodeURIComponent(row.code)}')`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "If-Match": "*"
                },
                body: {
                    code: row.code,
                    name: row.name,
                    description: row.description,
                    isActive: row.isActive,
                    sortOrder: row.sortOrder
                }
            }
        );

        this.showSuccess("Changes saved");

        await this.onRefresh();

    } catch (error) {

        this.showError(error);

    }
},

    onDeleteSystemContractBasePO: async function (event) {

    const row = event
        .getSource()
        .getBindingContext("admin")
        .getObject();

    const confirmed = await new Promise(function (resolve) {

        MessageBox.confirm(
            "Delete this System Contract Base PO?",
            {
                onClose: function (action) {
                    resolve(
                        action === MessageBox.Action.OK
                    );
                }
            }
        );

    });

    if (!confirmed) {
        return;
    }

    try {

        await this.requestCA(
            `SystemContractBasePOs('${encodeURIComponent(row.code)}')`,
            {
                method: "DELETE",
                headers: {
                    "If-Match": "*"
                }
            }
        );

        this.showSuccess(
            "System Contract Base PO deleted"
        );

        await this.onRefresh();

    } catch (error) {

        this.showError(error);

    }
},

onSaveDivision: function (event) {
      const row = event.getSource().getBindingContext("admin").getObject();
      return this._patch("Divisions", row.ID, {
        divisionCode: row.divisionCode,
        divisionName: row.divisionName,
        isActive: row.isActive
      });
    },


onDeleteDivision: function (event) {
      return this._delete("Divisions", event.getSource().getBindingContext("admin").getObject());
    },

 onSaveProcurementCategory: async function (event) {

    const row = event
        .getSource()
        .getBindingContext("admin")
        .getObject();

    try {

        await this.requestCA(
            `ProcurementCategories('${encodeURIComponent(row.code)}')`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "If-Match": "*"
                },
                body: {
                    code: row.code,
                    name: row.name,
                    description: row.description,
                    isActive: row.isActive,
                    sortOrder: row.sortOrder
                }
            }
        );

        this.showSuccess("Changes saved");

        await this.onRefresh();

    } catch (error) {

        this.showError(error);

    }
},
    onDeleteProcurementCategory: async function (event) {

    const row = event
        .getSource()
        .getBindingContext("admin")
        .getObject();

    const confirmed = await new Promise(function (resolve) {

        MessageBox.confirm(
            "Delete this Procurement Category?",
            {
                onClose: function (action) {
                    resolve(
                        action === MessageBox.Action.OK
                    );
                }
            }
        );

    });

    if (!confirmed) {
        return;
    }

    try {

        await this.requestCA(
            `ProcurementCategories('${encodeURIComponent(row.code)}')`,
            {
                method: "DELETE",
                headers: {
                    "If-Match": "*"
                }
            }
        );

        this.showSuccess(
            "Procurement Category deleted"
        );

        await this.onRefresh();

    } catch (error) {

        this.showError(error);

    }
},

onSaveApplicableTax: function (event) {
      const row = event.getSource().getBindingContext("admin").getObject();
      return this._patch("ApplicableTaxes", row.ID, {
        taxCode: row.taxCode,
        taxDescription: row.taxDescription,
        isActive: row.isActive
      });
    },


onDeleteApplicableTax: function (event) {
      return this._delete("ApplicableTaxes", event.getSource().getBindingContext("admin").getObject());
    },

onSavePlant: function (event) {
      const row = event.getSource().getBindingContext("admin").getObject();
      return this._patch("Plant", row.ID, {
        plantCode: row.plantCode,
        plantName: row.plantName,
        isActive: row.isActive
      });
    },


onDeletePlant: function (event) {
      return this._delete("Plant", event.getSource().getBindingContext("admin").getObject());
    },


onSaveItemCategory: async function (event) {

    const row = event
        .getSource()
        .getBindingContext("admin")
        .getObject();

    try {

        if (!row.code) {
            throw new Error("Item Category Code is missing.");
        }

        await this.requestCA(
            `ItemCategories('${encodeURIComponent(row.code)}')`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "If-Match": "*"
                },
                body: {
                    name: row.name,
                    isActive: row.isActive
                }
            }
        );

        this.showSuccess("Item Category changes saved");

        await this.onRefresh();

    } catch (error) {

        this.showError(error);

    }
},


onDeleteItemCategory: async function (event) {

    const row = event
        .getSource()
        .getBindingContext("admin")
        .getObject();

    if (!row.code) {
        this.showError("Item Category Code is missing.");
        return;
    }

    const confirmed = await new Promise(function (resolve) {

        MessageBox.confirm(
            "Delete this Item Category?",
            {
                onClose: function (action) {
                    resolve(
                        action === MessageBox.Action.OK
                    );
                }
            }
        );

    });

    if (!confirmed) {
        return;
    }

    try {

        await this.requestCA(
            `ItemCategories('${encodeURIComponent(row.code)}')`,
            {
                method: "DELETE",
                headers: {
                    "If-Match": "*"
                }
            }
        );

        this.showSuccess(
            "Item Category deleted"
        );

        await this.onRefresh();

    } catch (error) {

        this.showError(error);

    }
},

onSaveAccountAssignment: async function (event) {

    const row = event
        .getSource()
        .getBindingContext("admin")
        .getObject();

    try {

        await this.requestCA(
            `AccountAssignments('${encodeURIComponent(row.code)}')`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "If-Match": "*"
                },
                body: {
                    code: row.code,
                    description: row.description,
                    isActive: row.isActive,
                }
            }
        );

        this.showSuccess("Changes saved");

        await this.onRefresh();

    } catch (error) {

        this.showError(error);

    }
},

    onDeleteAccountAssignment: async function (event) {

    const row = event
        .getSource()
        .getBindingContext("admin")
        .getObject();

    const confirmed = await new Promise(function (resolve) {

        MessageBox.confirm(
            "Delete this Account Assignment?",
            {
                onClose: function (action) {
                    resolve(
                        action === MessageBox.Action.OK
                    );
                }
            }
        );

    });

    if (!confirmed) {
        return;
    }

    try {

        await this.requestCA(
            `AccountAssignments('${encodeURIComponent(row.code)}')`,
            {
                method: "DELETE",
                headers: {
                    "If-Match": "*"
                }
            }
        );

        this.showSuccess(
            "Account Assignment deleted"
        );

        await this.onRefresh();

    } catch (error) {

        this.showError(error);

    }
},


onSaveServiceCategories: async function (event) {

    const row = event
        .getSource()
        .getBindingContext("admin")
        .getObject();

    try {

        await this.requestCA(
            `ServiceCategories('${encodeURIComponent(row.code)}')`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "If-Match": "*"
                },
                body: {
                    code: row.code,
                    name: row.name || row.description,
                    description: row.description,
                    isActive: row.isActive,
                }
            }
        );

        this.showSuccess("Changes saved");

        await this.onRefresh();

    } catch (error) {

        this.showError(error);

    }
},

    onDeleteServiceCategories: async function (event) {

    const row = event
        .getSource()
        .getBindingContext("admin")
        .getObject();

    const confirmed = await new Promise(function (resolve) {

        MessageBox.confirm(
            "Delete this Service Category?",
            {
                onClose: function (action) {
                    resolve(
                        action === MessageBox.Action.OK
                    );
                }
            }
        );

    });

    if (!confirmed) {
        return;
    }

    try {

        await this.requestCA(
            `ServiceCategories('${encodeURIComponent(row.code)}')`,
            {
                method: "DELETE",
                headers: {
                    "If-Match": "*"
                }
            }
        );

        this.showSuccess(
            "Service Category is deleted"
        );

        await this.onRefresh();

    } catch (error) {

        this.showError(error);

    }
},
onSaveUnitOfMeasure: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("admin");

    const item = context.getObject();

    try {

        await this.requestCA(
            `UnitsOfMeasure('${item.code}')`,
            {
                method: "PATCH",
                body: {
                    name: item.name,
                    description: item.description,
                    isActive: item.isActive,
                    sortOrder: item.sortOrder
                }
            }
        );

        sap.m.MessageToast.show(
            "Unit of Measure updated successfully."
        );

        await this.onRefresh();

    } catch (error) {

        this.showError(error);

    }
},

onDeleteUnitOfMeasure: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("admin");

    const item = context.getObject();

    MessageBox.confirm(
        `Are you sure you want to delete Unit of Measure "${item.code}"?`,
        {
            title: "Delete Unit of Measure",

            onClose: async function (action) {

                if (action !== MessageBox.Action.OK) {
                    return;
                }

                try {

                    await this.requestCA(
                        `UnitsOfMeasure('${item.code}')`,
                        {
                            method: "DELETE"
                        }
                    );

                    MessageBox.success(
                        "Unit of Measure deleted successfully."
                    );

                    await this.onRefresh();

                } catch (error) {

                    this.showError(error);

                }

            }.bind(this)
        }
    );
},

onSaveServiceGroup: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("admin");

    const item = context.getObject();

    try {

        await this.requestMaster(
            `ServiceGroups('${item.ID}')`,
            {
                method: "PATCH",
                body: {
                    servicegroupDescription:
                        item.servicegroupDescription,
                    isActive: item.isActive
                }
            }
        );

        sap.m.MessageToast.show(
            "Service Group updated successfully."
        );

        await this.onRefresh();

    } catch (error) {

        this.showError(error);

    }
},

onDeleteServiceGroup: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("admin");

    const item = context.getObject();

    MessageBox.confirm(
        `Are you sure you want to delete Service Group "${item.servicegroupCode}"?`,
        {
            title: "Delete Service Group",

            onClose: async function (action) {

                if (action !== MessageBox.Action.OK) {
                    return;
                }

                try {

                    await this.requestMaster(
                        `ServiceGroups('${item.ID}')`,
                        {
                            method: "DELETE"
                        }
                    );

                    MessageBox.success(
                        "Service Group deleted successfully."
                    );

                    await this.onRefresh();

                } catch (error) {

                    this.showError(error);

                }

            }.bind(this)
        }
    );
},
onSaveValuationClass: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("admin");

    const item = context.getObject();

    try {

        await this.requestMaster(
            `ValuationClass('${item.ID}')`,
            {
                method: "PATCH",
                body: {
                    valuationclassDescription:
                        item.valuationclassDescription,
                    isActive: item.isActive
                }
            }
        );

        sap.m.MessageToast.show(
            "Valuation Class updated successfully."
        );

        await this.onRefresh();

    } catch (error) {

        this.showError(error);

    }
},
onDeleteValuationClass: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("admin");

    const item = context.getObject();

    MessageBox.confirm(
        `Are you sure you want to delete Valuation Class "${item.valuationclassCode}"?`,
        {
            title: "Delete Valuation Class",

            onClose: async function (action) {

                if (action !== MessageBox.Action.OK) {
                    return;
                }

                try {

                    await this.requestMaster(
                        `ValuationClass('${item.ID}')`,
                        {
                            method: "DELETE"
                        }
                    );

                    MessageBox.success(
                        "Valuation Class deleted successfully."
                    );

                    await this.onRefresh();

                } catch (error) {

                    this.showError(error);

                }

            }.bind(this)
        }
    );
},

onSaveEntity: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("admin");

    const item = context.getObject();

    try {

        await this.requestCA(
            `Entity('${item.ID}')`,
            {
                method: "PATCH",
                body: {
                    description: item.description,
                    isActive: item.isActive
                }
            }
        );

        sap.m.MessageToast.show(
            "Entity updated successfully."
        );

        await this.onRefresh();

    } catch (error) {

        this.showError(error);

    }
},

onDeleteEntity: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("admin");

    const item = context.getObject();

    MessageBox.confirm(
        `Are you sure you want to delete Entity "${item.code}"?`,
        {
            title: "Delete Entity",

            onClose: async function (action) {

                if (action !== MessageBox.Action.OK) {
                    return;
                }

                try {

                    await this.requestCA(
                        `Entity('${item.ID}')`,
                        {
                            method: "DELETE"
                        }
                    );

                    MessageBox.success(
                        "Entity deleted successfully."
                    );

                    await this.onRefresh();

                } catch (error) {

                    this.showError(error);

                }

            }.bind(this)
        }
    );
},
onSaveProject: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("admin");

    const item = context.getObject();

    try {

        await this.requestCA(
            `Projects('${item.ID}')`,
            {
                method: "PATCH",
                body: {
                    projectCategory:
                        item.projectCategory,
                    projectDescription:
                        item.projectDescription,
                    isActive:
                        item.isActive
                }
            }
        );

        sap.m.MessageToast.show(
            "Project updated successfully."
        );

        await this.onRefresh();

    } catch (error) {

        this.showError(error);

    }
},
onDeleteProject: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("admin");

    const item = context.getObject();

    MessageBox.confirm(
        `Are you sure you want to delete Project "${item.projectID}"?`,
        {
            title: "Delete Project",

            onClose: async function (action) {

                if (action !== MessageBox.Action.OK) {
                    return;
                }

                try {

                    await this.requestCA(
                        `Projects('${item.ID}')`,
                        {
                            method: "DELETE"
                        }
                    );

                    MessageBox.success(
                        "Project deleted successfully."
                    );

                    await this.onRefresh();

                } catch (error) {

                    this.showError(error);

                }

            }.bind(this)
        }
    );
},

onSaveMatGroup: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("admin");

    const item = context.getObject();

    try {

        await this.requestCA(
            `MatGroup('${item.ID}')`,
            {
                method: "PATCH",
                body: {
                    matGroupDescription:
                        item.matGroupDescription,
                    isActive:
                        item.isActive
                }
            }
        );

        sap.m.MessageToast.show(
            "Material Group updated successfully."
        );

        await this.onRefresh();

    } catch (error) {

        this.showError(error);

    }
},

onDeleteMatGroup: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("admin");

    const item = context.getObject();

    MessageBox.confirm(
        `Are you sure you want to delete Material Group "${item.matGroupCode}"?`,
        {
            title: "Delete Material Group",

            onClose: async function (action) {

                if (action !== MessageBox.Action.OK) {
                    return;
                }

                try {

                    await this.requestCA(
                        `MatGroup('${item.ID}')`,
                        {
                            method: "DELETE"
                        }
                    );

                    MessageBox.success(
                        "Material Group deleted successfully."
                    );

                    await this.onRefresh();

                } catch (error) {

                    this.showError(error);

                }

            }.bind(this)
        }
    );
},
onSaveExtensionMaterialGroup: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("admin");

    const item = context.getObject();

    try {

        await this.requestCA(
            `ExtensionMaterialGroup('${item.ID}')`,
            {
                method: "PATCH",
                body: {
                    extensionMaterialGroupDescription:
                        item.extensionMaterialGroupDescription,
                    isActive: item.isActive
                }
            }
        );

        sap.m.MessageToast.show(
            "Extension Material Group updated successfully."
        );

        await this.onRefresh();

    } catch (error) {

        this.showError(error);

    }
},
onDeleteExtensionMaterialGroup: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("admin");

    const item = context.getObject();

    MessageBox.confirm(
        `Are you sure you want to delete Extension Material Group "${item.extensionMaterialGroupCode}"?`,
        {
            title: "Delete Extension Material Group",

            onClose: async function (action) {

                if (action !== MessageBox.Action.OK) {
                    return;
                }

                try {

                    await this.requestCA(
                        `ExtensionMaterialGroup('${item.ID}')`,
                        {
                            method: "DELETE"
                        }
                    );

                    MessageBox.success(
                        "Extension Material Group deleted successfully."
                    );

                    await this.onRefresh();

                } catch (error) {

                    this.showError(error);

                }

            }.bind(this)
        }
    );
},
onSaveProfitCenter: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("admin");

    const item = context.getObject();

    try {

        await this.requestCA(
            `ProfitCenter('${item.ID}')`,
            {
                method: "PATCH",
                body: {
                    profitCenterDescription:
                        item.profitCenterDescription,
                    isActive:
                        item.isActive
                }
            }
        );

        sap.m.MessageToast.show(
            "Profit Center updated successfully."
        );

        await this.onRefresh();

    } catch (error) {

        this.showError(error);

    }
},
onDeleteProfitCenter: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("admin");

    const item = context.getObject();

    MessageBox.confirm(
        `Are you sure you want to delete Profit Center "${item.profitCenterCode}"?`,
        {
            title: "Delete Profit Center",

            onClose: async function (action) {

                if (action !== MessageBox.Action.OK) {
                    return;
                }

                try {

                    await this.requestCA(
                        `ProfitCenter('${item.ID}')`,
                        {
                            method: "DELETE"
                        }
                    );

                    MessageBox.success(
                        "Profit Center deleted successfully."
                    );

                    await this.onRefresh();

                } catch (error) {

                    this.showError(error);

                }

            }.bind(this)
        }
    );
},
onSaveMRPType: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("admin");

    const item = context.getObject();

    try {

        await this.requestCA(
            `MRPType('${item.ID}')`,
            {
                method: "PATCH",
                body: {
                    mrpTypeDescription:
                        item.mrpTypeDescription,
                    isActive: item.isActive
                }
            }
        );

        sap.m.MessageToast.show(
            "MRP Type updated successfully."
        );

        await this.onRefresh();

    } catch (error) {
        this.showError(error);
    }
},
onDeleteMRPType: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("admin");

    const item = context.getObject();

    MessageBox.confirm(
        `Are you sure you want to delete MRP Type "${item.mrpTypeCode}"?`,
        {
            title: "Delete MRP Type",

            onClose: async function (action) {

                if (action !== MessageBox.Action.OK) {
                    return;
                }

                try {

                    await this.requestCA(
                        `MRPType('${item.ID}')`,
                        {
                            method: "DELETE"
                        }
                    );

                    MessageBox.success(
                        "MRP Type deleted successfully."
                    );

                    await this.onRefresh();

                } catch (error) {
                    this.showError(error);
                }

            }.bind(this)
        }
    );
},
onSaveAvailabilityCheck: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("admin");

    const item = context.getObject();

    try {

        await this.requestCA(
            `AvailabilityCheck('${item.ID}')`,
            {
                method: "PATCH",
                body: {
                    availabilityCheckDescription:
                        item.availabilityCheckDescription,
                    isActive: item.isActive
                }
            }
        );

        sap.m.MessageToast.show(
            "Availability Check updated successfully."
        );

        await this.onRefresh();

    } catch (error) {
        this.showError(error);
    }
},
onDeleteAvailabilityCheck: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("admin");

    const item = context.getObject();

    MessageBox.confirm(
        `Are you sure you want to delete Availability Check "${item.availabilityCheckCode}"?`,
        {
            title: "Delete Availability Check",

            onClose: async function (action) {

                if (action !== MessageBox.Action.OK) {
                    return;
                }

                try {

                    await this.requestCA(
                        `AvailabilityCheck('${item.ID}')`,
                        {
                            method: "DELETE"
                        }
                    );

                    MessageBox.success(
                        "Availability Check deleted successfully."
                    );

                    await this.onRefresh();

                } catch (error) {
                    this.showError(error);
                }

            }.bind(this)
        }
    );
},
onSaveSerialNumberProfile: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("admin");

    const item = context.getObject();

    try {

        await this.requestCA(
            `SerialNumberProfile('${item.ID}')`,
            {
                method: "PATCH",
                body: {
                    serialNumberProfileDescription:
                        item.serialNumberProfileDescription,
                    isActive: item.isActive
                }
            }
        );

        sap.m.MessageToast.show(
            "Serial Number Profile updated successfully."
        );

        await this.onRefresh();

    } catch (error) {
        this.showError(error);
    }
},
onDeleteSerialNumberProfile: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("admin");

    const item = context.getObject();

    MessageBox.confirm(
        `Are you sure you want to delete Serial Number Profile "${item.serialNumberProfileCode}"?`,
        {
            title: "Delete Serial Number Profile",

            onClose: async function (action) {

                if (action !== MessageBox.Action.OK) {
                    return;
                }

                try {

                    await this.requestCA(
                        `SerialNumberProfile('${item.ID}')`,
                        {
                            method: "DELETE"
                        }
                    );

                    MessageBox.success(
                        "Serial Number Profile deleted successfully."
                    );

                    await this.onRefresh();

                } catch (error) {
                    this.showError(error);
                }

            }.bind(this)
        }
    );
},
onSaveDistributionChannel: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("admin");

    const item = context.getObject();

    try {

        await this.requestCA(
            `DistributionChannel('${item.ID}')`,
            {
                method: "PATCH",
                body: {
                    distributionChannelDescription:
                        item.distributionChannelDescription,
                    isActive: item.isActive
                }
            }
        );

        sap.m.MessageToast.show(
            "Distribution Channel updated successfully."
        );

        await this.onRefresh();

    } catch (error) {
        this.showError(error);
    }
},
onDeleteDistributionChannel: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("admin");

    const item = context.getObject();

    MessageBox.confirm(
        `Are you sure you want to delete Distribution Channel "${item.distributionChannelCode}"?`,
        {
            title: "Delete Distribution Channel",

            onClose: async function (action) {

                if (action !== MessageBox.Action.OK) {
                    return;
                }

                try {

                    await this.requestCA(
                        `DistributionChannel('${item.ID}')`,
                        {
                            method: "DELETE"
                        }
                    );

                    MessageBox.success(
                        "Distribution Channel deleted successfully."
                    );

                    await this.onRefresh();

                } catch (error) {
                    this.showError(error);
                }

            }.bind(this)
        }
    );
},
onSaveStorageLocation: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("admin");

    const item = context.getObject();

    try {

        await this.requestMaster(
            `StorageLocation('${item.ID}')`,
            {
                method: "PATCH",
                body: {
                    storageLocationName:
                        item.storageLocationName,
                    isActive: item.isActive
                }
            }
        );

        sap.m.MessageToast.show(
            "Storage Location updated successfully."
        );

        await this.onRefresh();

    } catch (error) {
        this.showError(error);
    }
},
onDeleteStorageLocation: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("admin");

    const item = context.getObject();

    MessageBox.confirm(
        `Are you sure you want to delete Storage Location "${item.storageLocationCode}"?`,
        {
            title: "Delete Storage Location",

            onClose: async function (action) {

                if (action !== MessageBox.Action.OK) {
                    return;
                }

                try {

                    await this.requestMaster(
                        `StorageLocation('${item.ID}')`,
                        {
                            method: "DELETE"
                        }
                    );

                    MessageBox.success(
                        "Storage Location deleted successfully."
                    );

                    await this.onRefresh();

                } catch (error) {
                    this.showError(error);
                }

            }.bind(this)
        }
    );
},
onSaveSalesOrg: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("admin");

    const item = context.getObject();

    try {

        await this.requestMaster(
            `SalesOrg('${item.ID}')`,
            {
                method: "PATCH",
                body: {
                    salesOrgName: item.salesOrgName,
                    isActive: item.isActive
                }
            }
        );

        sap.m.MessageToast.show(
            "Sales Org updated successfully."
        );

        await this.onRefresh();

    } catch (error) {
        this.showError(error);
    }
},
onDeleteSalesOrg: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("admin");

    const item = context.getObject();

    MessageBox.confirm(
        `Are you sure you want to delete Sales Org "${item.salesOrgCode}"?`,
        {
            title: "Delete Sales Org",

            onClose: async function (action) {

                if (action !== MessageBox.Action.OK) {
                    return;
                }

                try {

                    await this.requestMaster(
                        `SalesOrg('${item.ID}')`,
                        {
                            method: "DELETE"
                        }
                    );

                    MessageBox.success(
                        "Sales Org deleted successfully."
                    );

                    await this.onRefresh();

                } catch (error) {
                    this.showError(error);
                }

            }.bind(this)
        }
    );
},
onSaveIncoterm: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("admin");

    const item = context.getObject();

    try {

        await this.requestMaster(
            `Incoterms('${item.ID}')`,
            {
                method: "PATCH",
                body: {
                    incotermsDescription:
                        item.incotermsDescription,
                    isActive: item.isActive
                }
            }
        );

        sap.m.MessageToast.show(
            "Incoterm updated successfully."
        );

        await this.onRefresh();

    } catch (error) {
        this.showError(error);
    }
},
onDeleteIncoterm: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("admin");

    const item = context.getObject();

    MessageBox.confirm(
        `Are you sure you want to delete Incoterm "${item.incotermsCode}"?`,
        {
            title: "Delete Incoterm",

            onClose: async function (action) {

                if (action !== MessageBox.Action.OK) {
                    return;
                }

                try {

                    await this.requestMaster(
                        `Incoterms('${item.ID}')`,
                        {
                            method: "DELETE"
                        }
                    );

                    MessageBox.success(
                        "Incoterm deleted successfully."
                    );

                    await this.onRefresh();

                } catch (error) {
                    this.showError(error);
                }

            }.bind(this)
        }
    );
},
onSaveContractType: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("admin");

    const item = context.getObject();

    try {

        await this.requestCA(
            `ContractType('${item.ID}')`,
            {
                method: "PATCH",
                body: {
                    contractTypeDescription:
                        item.contractTypeDescription,
                    isActive:
                        item.isActive
                }
            }
        );

        sap.m.MessageToast.show(
            "Contract Type updated successfully."
        );

        await this.onRefresh();

    } catch (error) {

        this.showError(error);

    }
},
onDeleteContractType: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("admin");

    const item = context.getObject();

    MessageBox.confirm(
        `Are you sure you want to delete Contract Type "${item.contractTypeCode}"?`,
        {
            title: "Delete Contract Type",

            onClose: async function (action) {

                if (action !== MessageBox.Action.OK) {
                    return;
                }

                try {

                    await this.requestCA(
                        `ContractType('${item.ID}')`,
                        {
                            method: "DELETE"
                        }
                    );

                    MessageBox.success(
                        "Contract Type deleted successfully."
                    );

                    await this.onRefresh();

                } catch (error) {

                    this.showError(error);

                }

            }.bind(this)
        }
    );
},
onSaveCostCenter: async function (oEvent) {

    const item = oEvent
        .getSource()
        .getBindingContext("admin")
        .getObject();

    try {

        await this.requestMaster(
            `CostCenter('${item.ID}')`,
            {
                method: "PATCH",
                body: {
                    costCenterName: item.costCenterName,
                    isActive: item.isActive
                }
            }
        );

        MessageToast.show("Cost Center updated successfully.");

    } catch (error) {

        MessageBox.error(
            error.message || "Failed to update Cost Center."
        );

    }
},

onDeleteCostCenter: async function (oEvent) {

    const item = oEvent
        .getSource()
        .getBindingContext("admin")
        .getObject();

    try {

        await this.requestMaster(
            `CostCenter('${item.ID}')`,
            {
                method: "DELETE"
            }
        );

        MessageToast.show("Cost Center deleted successfully.");

        await this.onRefresh();

    } catch (error) {

        MessageBox.error(
            error.message || "Failed to delete Cost Center."
        );

    }
},



    _delete: async function (entity, row, stringKey) {
      const confirmed = await new Promise(function (resolve) {
        MessageBox.confirm("Delete this entry?", {
          onClose: function (action) {
            resolve(action === MessageBox.Action.OK);
          }
        });
      });
      if (!confirmed) {
        return;
      }
      try {
        const key = stringKey ? `'${encodeURIComponent(row.code)}'` : row.ID;
        await this.requestMaster(`${entity}(${key})`, {
          method: "DELETE",
          headers: {
            "If-Match": "*"
          }
        });
        this.showSuccess("Entry deleted");
        await this.onRefresh();
      } catch (error) {
        this.showError(error);
      }
    },



//     onAddSite: function () {
//     var oNewItemModel = this.getView().getModel("newItem");

//     oNewItemModel.setData({
//         type: "site",
//         title: "Add Site",

//         isStep: false,
//         isVariant: false,
//         isUser: false,
//         isTeam: false,
//         isVendor: false,
//         isSite: true,


//         siteId: "",
//         siteName: ""
//     });

//     this.byId("addConfigDialog").open();
// },



// onAddMaterial: function () {
//     var oNewItemModel = this.getView().getModel("newItem");

//     oNewItemModel.setData({
//         type: "material",
//         title: "Add Material",

//         isStep: false,
//         isVariant: false,
//         isUser: false,
//         isTeam: false,
//         isVendor: false,
//         isSite: false,
//         isMaterial: true,

//         materialCode: "",
//         materialDescription: ""
//     });

//     this.byId("addConfigDialog").open();
// },



  });
});
