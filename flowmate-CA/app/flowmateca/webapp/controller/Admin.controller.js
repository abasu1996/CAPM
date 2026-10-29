sap.ui.define([
  "flowmateca/controller/BaseController",
  "flowmateca/model/ListModel",
  "sap/m/MessageBox",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/model/FilterType"
], function (BaseController, ListModel, MessageBox, Filter, FilterOperator, FilterType) {
  "use strict";

  // Simple masters with one Admin tab each (the Project Code Creation (PCC) tables and Product
  // Hierarchy), all handled by the onAddPcc / onSavePcc / onDeletePcc handlers below. The tab's
  // buttons carry app:pcc="<key>".
  const PCC_MASTERS = [
    {
      key: "ar", entity: "ArPcc", title: "AR for PCC",
      columns: [
        { name: "srNo", label: "ID" },
        { name: "portfolio", label: "Portfolio" },
        { name: "ar", label: "AR" },
        { name: "division", label: "Division" },
        { name: "lastFourDigits", label: "Last Four Digits" },
        { name: "year", label: "Year" },
        { name: "highLevelPc", label: "High Level PC" }
      ]
    },
    {
      key: "vendors", entity: "VendorsPcc", title: "Vendors for PCC",
      columns: [
        { name: "srNo", label: "ID" },
        { name: "vendor", label: "Vendor" },
        { name: "vendorLetter", label: "Vendor Letter" }
      ]
    },
    {
      key: "divisions", entity: "DivisionsPcc", title: "Divisions for PCC",
      columns: [
        { name: "srNo", label: "ID" },
        { name: "division", label: "Division" },
        { name: "divisionLetter", label: "Division Letter" }
      ]
    },
    {
      key: "scope", entity: "ScopePcc", title: "Scope for PCC",
      columns: [{ name: "scope", label: "Scope" }]
    },
    {
      key: "projectType", entity: "ProjectTypePcc", title: "Project Type for PCC",
      columns: [{ name: "projectType", label: "Project Type" }]
    },
    {
      key: "productHierarchy", entity: "ProductHierarchy", title: "Product Hierarchy",
      columns: [
        { name: "productHierarchyCode", label: "Product Hierarchy Code" },
        { name: "productHierarchyDescription", label: "Description" }
      ]
    },
    {
      key: "materialType", entity: "MaterialType", title: "Material Type",
      columns: [
        { name: "materialTypeCode", label: "Material Type Code" },
        { name: "materialTypeDescription", label: "Description" }
      ]
    },
    {
      key: "taxClass", entity: "TaxClass", title: "Tax Class",
      columns: [
        { name: "taxClassCode", label: "Tax Class Code" },
        { name: "taxClassDescription", label: "Description" }
      ]
    }
  ];

  return BaseController.extend("flowmateca.controller.Admin", {
    onInit: function () {
      this.getView().setModel(new ListModel({
        steps: [],
        requestTypes: [],
        variants: [],
        users: [],
        teams: [],
        teamMembers: [],
        teamTree: [],
        requesterTeams: [],
        requesterTeamMembers: [],
        requesterTeamTree: [],
        sites: [],
        serviceCodes: [],
        poNumbers: [],
        documentTypes: [],
        purchasingOrganizations: [],
        companyCodes: [],
        purchasingGroups: [],
        currencies: [],
        paymentTerms: [],
        systemContractBasePO: [],
        divisions: [],
        procurementCategories: [],
        applicableTaxes: [],
        plant: [],
        itemCategories: [],
        accountAssignments: [],
        serviceCategories: [],
        unitsOfMeasure: [],
        serviceGroups: [],
        valuationClasses: [],
        valuationClassesScc: [],
        entities: [],
        projects: [],
        matGroups: [],
        extensionMaterialGroups: [],
        profitCenters: [],
        mrpTypes: [],
        availabilityChecks: [],
        serialNumberProfiles: [],
        distributionChannels: [],
        arReferences: [],
        storageLocations: [],
        salesOrgs: [],
        incoterms: [],
        contractTypes: [],
        costCenters: [],
        budgetCodes: [],
        pcc: {}
      }), "admin");
      this.getView().setModel(new ListModel({}), "newItem");
      this.getView().setModel(new ListModel({}), "editStep");
      this.getView().setModel(new ListModel({ members: [], availableUsers: [], selectedUserIds: [] }), "teamManage");
      this.getRouter().getRoute("admin").attachPatternMatched(this.onRefresh, this);
    },

    onRefresh: async function () {
      this.setBusy(true);
      try {
        await this._loadAdminLists();
        this._refreshPagedTables();
      } catch (error) {
        this.showError(error);
      } finally {
        this.setBusy(false);
      }
    },

    // Only the lists the drop-downs, the team trees and the Manage Team dialog use; the tables
    // read their own rows page by page from the "master" model.
    _loadAdminLists: async function () {
      const [requestTypes, variants, users, teams, teamMembers, requesterTeams, requesterTeamMembers] = await Promise.all([
        this.requestMasterAll("RequestTypes?$orderby=sortOrder"),
        this.requestMasterAll("RequestVariants?$expand=requestType&$orderby=requestType_code,sortOrder"),
        this.requestMasterAll("Users?$expand=manager&$orderby=displayName"),
        this.requestMasterAll("Teams?$orderby=name"),
        this.requestMasterAll("TeamMembers?$expand=user,team&$orderby=ID"),
        this.requestMasterAll("RequesterTeams?$orderby=name"),
        this.requestMasterAll("RequesterTeamMembers?$expand=user,team&$orderby=ID")
      ]);
      const model = this.getView().getModel("admin");
      model.setProperty("/requestTypes", requestTypes.value || []);
      model.setProperty("/variants", variants.value || []);
      model.setProperty("/users", users.value || []);
      model.setProperty("/teams", teams.value || []);
      model.setProperty("/teamMembers", teamMembers.value || []);
      model.setProperty("/requesterTeams", requesterTeams.value || []);
      model.setProperty("/requesterTeamMembers", requesterTeamMembers.value || []);
      model.setProperty("/teamTree", this._teamTree(teams.value || [], teamMembers.value || []));
      model.setProperty("/requesterTeamTree", this._teamTree(requesterTeams.value || [], requesterTeamMembers.value || []));
    },

    // Every Admin table is read page by page from its OData entity through the "master" model,
    // like Vendors. A refresh would throw away unsaved edits, so it waits until they are saved.
    _refreshPagedTables: function () {
      this.getView().findAggregatedObjects(true, function (control) {
        return control.isA("sap.m.Table") && control.getBinding("items")?.getModel() === this.getView().getModel("master");
      }.bind(this)).forEach(function (table) {
        const binding = table.getBinding("items");
        if (!binding.hasPendingChanges()) {
          binding.refresh();
        }
      });
    },

    // Each table holds its edits in its own update group ($$updateGroupId in the view) until Save
    // sends them, as Vendors does. Saving users, teams or variants also reloads the drop-down lists.
    onSaveAdminRow: async function (event) {
      const binding = event.getSource().getBindingContext("master").getBinding();
      const group = binding.getUpdateGroupId();
      const model = binding.getModel();
      try {
        await model.submitBatch(group);
        if (model.hasPendingChanges(group)) {
          throw new Error("The changes could not be saved. Check the values and try again.");
        }
        this.showSuccess("Changes saved");
        if (["/Users", "/Teams", "/RequesterTeams", "/RequestVariants"].includes(binding.getPath())) {
          await this._loadAdminLists();
        }
      } catch (error) {
        this.showError(error);
      }
    },

    onMaterialSearch: function (event) {
      const query = (event.getParameter("query") || "").trim();
      const filter = query ? new Filter({
        filters: ["materialCode", "materialDescription"].map(function (path) {
          return new Filter({ path, operator: FilterOperator.Contains, value1: query, caseSensitive: false });
        }),
        and: false
      }) : [];
      this.byId("materialTable").getBinding("items").filter(filter, FilterType.Application);
    },

    // Search box of a paged Admin table: app:table names the table, app:fields its text columns.
    onAdminTableSearch: function (event) {
      const source = event.getSource();
      const query = (event.getParameter("query") || "").trim();
      const fields = String(source.data("fields") || "").split(",").filter(Boolean);
      const filter = query && fields.length ? new Filter({
        filters: fields.map(function (path) {
          return new Filter({ path, operator: FilterOperator.Contains, value1: query, caseSensitive: false });
        }),
        and: false
      }) : [];
      this.byId(source.data("table")).getBinding("items").filter(filter, FilterType.Application);
    },

    onVendorSearch: function (event) {
      const query = (event.getParameter("query") || "").trim();
      const filter = query ? new Filter({
        filters: ["vendorCode", "vendorName", "vendorEmail"].map(function (path) {
          return new Filter({ path, operator: FilterOperator.Contains, value1: query, caseSensitive: false });
        }),
        and: false
      }) : [];
      this.byId("vendorTable").getBinding("items").filter(filter, FilterType.Application);
    },

    onWbsSearch: function (event) {
      const query = (event.getParameter("query") || "").trim();
      const filter = query ? new Filter({
        filters: ["wbsCode", "WBSID", "ProjectID", "Plant", "CompanyCode", "wbsDescription"].map(function (path) {
          return new Filter({ path, operator: FilterOperator.Contains, value1: query, caseSensitive: false });
        }),
        and: false
      }) : [];
      this.byId("wbsTable").getBinding("items").filter(filter, FilterType.Application);
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

    onAddRequesterTeam: function () {
      this._openAddDialog("requesterTeam", "Add Requester Team");
    },

    // ---- Manage Team: add users to a team / remove them (TeamMembers or RequesterTeamMembers
    // in flowmate-common); one dialog serves both tabs ----
    onManageTeam: function (event) {
      this._openTeamManage(event, { teams: "/teams", members: "/teamMembers", entity: "TeamMembers", label: "Team" });
    },

    onManageRequesterTeam: function (event) {
      this._openTeamManage(event, {
        teams: "/requesterTeams",
        members: "/requesterTeamMembers",
        entity: "RequesterTeamMembers",
        label: "Requester Team"
      });
    },

    _openTeamManage: function (event, source) {
      this._teamManageSource = source;
      this._managedTeamId = event.getSource().getBindingContext("master").getObject().ID;
      this._fillTeamManage();
      this.byId("manageTeamDialog").open();
    },

    // Dialog data from what onRefresh already loaded: the team's members, and the active users
    // who are not members yet.
    _fillTeamManage: function () {
      const admin = this.getView().getModel("admin");
      const source = this._teamManageSource;
      const team = (admin.getProperty(source.teams) || []).find(function (entry) {
        return entry.ID === this._managedTeamId;
      }.bind(this)) || {};
      const members = (admin.getProperty(source.members) || [])
        .filter(function (membership) {
          return membership.team_ID === team.ID;
        })
        .map(function (membership) {
          return {
            ID: membership.ID,
            userId: membership.user_ID,
            name: membership.user?.displayName || membership.displayName || "Unknown user",
            email: membership.user?.email || membership.email || ""
          };
        })
        .sort(function (left, right) {
          return left.name.localeCompare(right.name);
        });
      const memberIds = new Set(members.map(function (member) { return member.userId; }));
      const availableUsers = (admin.getProperty("/users") || []).filter(function (user) {
        return user.isActive !== false && !memberIds.has(user.ID);
      });
      this.getView().getModel("teamManage").setData({
        title: `Manage ${source.label} – ${team.name || ""} (${team.teamCode || ""})`,
        teamName: team.name,
        members,
        availableUsers,
        selectedUserIds: []
      });
    },

    onAddTeamMembers: async function () {
      const manage = this.getView().getModel("teamManage");
      const userIds = manage.getProperty("/selectedUserIds") || [];
      if (!userIds.length) {
        MessageBox.warning("Select at least one user to add.");
        return;
      }
      this.setBusy(true);
      try {
        for (const userId of userIds) {
          await this.requestMaster(this._teamManageSource.entity, {
            method: "POST",
            body: { team_ID: this._managedTeamId, user_ID: userId, isActive: true }
          });
        }
        this.showSuccess(`${userIds.length} user(s) added to ${manage.getProperty("/teamName")}`);
      } catch (error) {
        this.showError(error);
      } finally {
        await this.onRefresh();
        this._fillTeamManage();
        this.setBusy(false);
      }
    },

    onRemoveTeamMember: function (event) {
      const member = event.getSource().getBindingContext("teamManage").getObject();
      const teamName = this.getView().getModel("teamManage").getProperty("/teamName");
      MessageBox.confirm(`Remove ${member.name} from ${teamName}?`, {
        title: "Remove Team Member",
        onClose: async function (action) {
          if (action !== MessageBox.Action.OK) {
            return;
          }
          this.setBusy(true);
          try {
            await this.requestMaster(`${this._teamManageSource.entity}(${member.ID})`, { method: "DELETE" });
            this.showSuccess(`${member.name} removed from ${teamName}`);
          } catch (error) {
            this.showError(error);
          } finally {
            await this.onRefresh();
            this._fillTeamManage();
            this.setBusy(false);
          }
        }.bind(this)
      });
    },

    onCloseManageTeam: function () {
      this.byId("manageTeamDialog").close();
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

    onAddServiceCode: function () {
      this._openAddDialog("serviceCode", "Add Service Code");
    },

    onAddPoNumber: function () {
      this._openAddDialog("poNumber", "Add PO Number");
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
      this._openAddDialog("valuationClass","Add Valuation Class (MCC)");
},
    onAddValuationClassScc: function () {
      this._openAddDialog("valuationClassScc", "Add Valuation Class (SCC)");
},
    // Valuation Class has two masters: MCC (Material Code creation) and SCC (Service Code
    // creation). Both tabs share the save and delete handlers; the row's path picks the entity.
    _valuationClassEntity: function (context) {
      return context.getPath().indexOf("/valuationClassesScc/") === 0 ? "ValuationClassScc" : "ValuationClass";
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
onAddArReference: function () {
    this._openAddDialog(
        "arReference",
        "Add AR Reference"
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
onAddBudgetCode: function () {
    this._openAddDialog("budgetCode", "Add Budget Code");
},

    _pccMaster: function (source) {
      const key = source.data("pcc");
      return PCC_MASTERS.find(function (master) { return master.key === key; });
    },

    // Rows sorted by the user's ID column numerically where there is one ("2" before "10").
    onAddPcc: function (oEvent) {
      const master = this._pccMaster(oEvent.getSource());
      this._openAddDialog("pcc", `Add ${master.title}`);
      const model = this.getView().getModel("newItem");
      model.setProperty("/isPcc", true);
      model.setProperty("/pccKey", master.key);
      model.setProperty("/pccFields", master.columns.map(function (column) {
        return Object.assign({ value: "" }, column);
      }));
    },

    onDeletePcc: function (oEvent) {
      const master = this._pccMaster(oEvent.getSource());
      const item = oEvent.getSource().getBindingContext("master").getObject();
      MessageBox.confirm(`Are you sure you want to delete "${item[master.columns[master.columns.length > 1 ? 1 : 0].name]}" from ${master.title}?`, {
        title: `Delete from ${master.title}`,
        onClose: async function (action) {
          if (action !== MessageBox.Action.OK) {
            return;
          }
          try {
            await this.requestMaster(`${master.entity}(${item.ID})`, { method: "DELETE" });
            this.showSuccess(`${master.title} entry deleted successfully.`);
            await this.onRefresh();
          } catch (error) {
            this.showError(error);
          }
        }.bind(this)
      });
    },

    _openAddDialog: function (type, title) {
      this.getView().getModel("newItem").setData({
        type,
        title,
        isStep: type === "step",
        isVariant: type === "variant",
        isUser: type === "user",
        isTeam: type === "team" || type === "requesterTeam",
        isVendor: type === "vendor",
        isSite: type === "site",
        isMaterial: type === "material",
        isServiceCode: type === "serviceCode",
        isPoNumber: type === "poNumber",
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
        isValuationClass: type === "valuationClass" || type === "valuationClassScc",
        isEntity: type === "entity",
        isProject: type === "project",
        isMatGroup: type === "matGroup",
        isExtensionMaterialGroup: type === "extensionMaterialGroup",
        isProfitCenter: type === "profitCenter",
        isMRPType: type === "mrpType",
        isAvailabilityCheck: type === "availabilityCheck",
        isSerialNumberProfile: type === "serialNumberProfile",
        isDistributionChannel: type === "distributionChannel",
        isArReference: type === "arReference",
        isStorageLocation: type === "storageLocation",
        isSalesOrg: type === "salesOrg",
        isIncoterm: type === "incoterm",
        isContractType: type === "contractType",
        isCostCenter: type === "costCenter",
        isBudgetCode: type === "budgetCode",
        requestTypeCode: "",
        requestVariantCode: "",
        variants: [],
        stepNo: 1,
        slaDays: 2,
        name: "",
        description: "",
        code: "",
        email: "",
        AccountGroup: "",
        managerId: "",
        teamId: "",
        taskName: "",
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
        wbsCode: "",
        wbsDescription: "",
        WBSID: "",
        Plant: "",
        ProjectID: "",
        CompanyCode: "",
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
        arReferenceCode: "",
        arReferenceDescription: "",
        contractTypeCode: "",
        contractTypeDescription: "",
        budgetCode: "",
        budgetCodeDescription: "",
        taxRate: "",

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
              slaDays: Number(item.slaDays),
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
        } else if (item.type === "team" || item.type === "requesterTeam") {
          if (!item.code || !item.name) {
            throw new Error("Team code and name are required.");
          }
          await this.requestMaster(item.type === "requesterTeam" ? "RequesterTeams" : "Teams", {
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
              AccountGroup: item.AccountGroup || null,
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
        } else if (item.type === "serviceCode") {
          if (!item.serviceCode) {
            throw new Error("Service Code is required.");
          }
          await this.requestMaster("ServiceCodes", {
            method: "POST",
            body: {
              serviceCode: item.serviceCode,
              serviceDescription: item.serviceDescription || null,
              isActive: true
            }
          });
        } else if (item.type === "poNumber") {
          if (!item.poNumber) {
            throw new Error("PO Number is required.");
          }
          await this.requestMaster("PoNumbers", {
            method: "POST",
            body: {
              poNumber: item.poNumber,
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
              Plant: item.Plant || null,
              ProjectID: item.ProjectID || null,
              WBSID: item.WBSID || null,
              CompanyCode: item.CompanyCode || null,
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

    if (!item.purchasingOrganizationCode || !item.purchasingOrganizationName) {
        throw new Error(
            "Purchasing Organization Code and Purchasing Organization Name are required."
        );
    }

    await this.requestMaster(
        "PurchasingOrganizations",
        {
            method: "POST",
            body: {
                 purchasingOrganizationCode:
                item.purchasingOrganizationCode,
            purchasingOrganizationName:
                item.purchasingOrganizationName,
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

    await this.requestMaster(
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

    await this.requestMaster(
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

    await this.requestMaster(
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

    await this.requestMaster(
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
              taxRate: Number(item.taxRate) || 0,
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

    await this.requestMaster(
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

    await this.requestMaster(
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

    await this.requestMaster(
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

    await this.requestMaster(
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
} else if (item.type === "valuationClass" || item.type === "valuationClassScc") {

    const code = item.valuationClassCode?.trim();
    const description =
        item.valuationClassDescription?.trim();

    if (!code || !description) {
        throw new Error(
            "Valuation Class Code and Valuation Class Description are required."
        );
    }

    await this.requestMaster(
        item.type === "valuationClassScc" ? "ValuationClassScc" : "ValuationClass",
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

    await this.requestMaster(
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

    await this.requestMaster(
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

    await this.requestMaster(
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

    await this.requestMaster(
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

    await this.requestMaster(
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

    await this.requestMaster(
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

    await this.requestMaster(
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

    await this.requestMaster(
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

    await this.requestMaster(
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
}else if (item.type === "arReference") {

    const code = item.arReferenceCode?.trim();
    const description =
        item.arReferenceDescription?.trim();

    if (!code || !description) {
        throw new Error(
            "AR Reference Code and AR Reference Description are required."
        );
    }

    await this.requestMaster(
        "ArReferences",
        {
            method: "POST",
            body: {
                arReferenceCode: code,
                arReferenceDescription: description,
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

    await this.requestMaster(
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
} else if (item.type === "budgetCode") {

    const code = item.budgetCode?.trim();
    const description = item.budgetCodeDescription?.trim();

    if (!code || !description) {
        throw new Error(
            "Budget Code and Budget Code Description are required."
        );
    }

    await this.requestMaster("BudgetCode", {
        method: "POST",
        body: {
            budgetCode: code,
            budgetCodeDescription: description,
            isActive: true
        }
    });
} else if (item.type === "pcc") {
    const master = PCC_MASTERS.find(function (entry) { return entry.key === item.pccKey; });
    const body = { isActive: true };
    (item.pccFields || []).forEach(function (field) {
        body[field.name] = String(field.value || "").trim();
    });
    const missing = (item.pccFields || []).find(function (field) { return !body[field.name]; });
    if (missing) {
        throw new Error(`${missing.label} is required.`);
    }
    await this.requestMaster(master.entity, { method: "POST", body: body });
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

    // Edit pop-up for one step: works on a copy of the row, so Cancel leaves the table unchanged.
    onEditStep: function (event) {
      const row = event.getSource().getBindingContext("master").getObject();
      this.getView().getModel("editStep").setData({
        ID: row.ID,
        requestTypeName: row.requestType?.name || row.requestType_code || "",
        requestVariantName: row.requestVariant?.name || row.requestVariant_code || "",
        stepNo: Number(row.stepNo),
        stepName: row.stepName || "",
        activityDescription: row.activityDescription || "",
        processorTeam_ID: row.processorTeam_ID || "",
        taskName: row.taskName || "",
        isMandatory: row.isMandatory !== false,
        slaDays: Number(row.slaDays) || 1,
        isActive: row.isActive !== false
      });
      this.byId("editStepDialog").open();
    },

    onSaveEditStep: async function () {
      const step = this.getView().getModel("editStep").getData();
      const stepName = String(step.stepName || "").trim();
      if (!stepName || !Number(step.stepNo)) {
        MessageBox.warning("Step Number and Step Name are required.");
        return;
      }
      this.byId("editStepDialog").close();
      await this._patch("WorkflowStepConfigs", step.ID, {
        stepNo: Number(step.stepNo),
        stepName: stepName,
        activityDescription: step.activityDescription,
        processorTeam_ID: step.processorTeam_ID || null,
        taskName: String(step.taskName || "").trim() || stepName,
        isMandatory: step.isMandatory,
        slaDays: Number(step.slaDays),
        isActive: step.isActive
      }, false);
    },

    onCancelEditStep: function () {
      this.byId("editStepDialog").close();
    },

    onDeleteStep: function (event) {
      return this._delete("WorkflowStepConfigs", event.getSource().getBindingContext("master").getObject());
    },

    onDeleteVariant: function (event) {
      return this._delete("RequestVariants", event.getSource().getBindingContext("master").getObject(), true);
    },

    onDeleteUser: function (event) {
      return this._delete("Users", event.getSource().getBindingContext("master").getObject());
    },

    onDeleteTeam: function (event) {
      return this._delete("Teams", event.getSource().getBindingContext("master").getObject());
    },

    onDeleteRequesterTeam: function (event) {
      return this._delete("RequesterTeams", event.getSource().getBindingContext("master").getObject());
    },

    // Edits to the listed vendors are held in the "vendorEdits" group until Save sends them.
    onSaveVendor: async function () {
      const model = this.getView().getModel("master");
      try {
        await model.submitBatch("vendorEdits");
        if (model.hasPendingChanges("vendorEdits")) {
          throw new Error("The vendor changes could not be saved. Check the values and try again.");
        }
        this.showSuccess("Changes saved");
      } catch (error) {
        this.showError(error);
      }
    },

    onDeleteVendor: function (event) {
      return this._delete("Vendors", event.getSource().getBindingContext("master").getObject());
    },

onDeleteSite: function (event) {
      return this._delete("Sites", event.getSource().getBindingContext("master").getObject());
    },

    // Edits to the listed materials are held in the "materialEdits" group until Save sends them.
    onSaveMaterial: async function () {
      const model = this.getView().getModel("master");
      try {
        await model.submitBatch("materialEdits");
        if (model.hasPendingChanges("materialEdits")) {
          throw new Error("The material changes could not be saved. Check the values and try again.");
        }
        this.showSuccess("Changes saved");
      } catch (error) {
        this.showError(error);
      }
    },

    onDeleteMaterial: function (event) {
      return this._delete("Materials", event.getSource().getBindingContext("master").getObject());
    },

    onDeleteServiceCode: function (event) {
      return this._delete("ServiceCodes", event.getSource().getBindingContext("master").getObject());
    },

    onDeletePoNumber: function (event) {
      return this._delete("PoNumbers", event.getSource().getBindingContext("master").getObject());
    },

    // WBS is a large master, so edits use the OData model's deferred update group just like
    // Vendors and Materials. This avoids copying (and truncating) the table into a JSON model.
    onSaveWBS: async function () {
      const model = this.getView().getModel("master");
      try {
        await model.submitBatch("wbsEdits");
        if (model.hasPendingChanges("wbsEdits")) {
          throw new Error("The WBS changes could not be saved. Check the values and try again.");
        }
        this.showSuccess("Changes saved");
      } catch (error) {
        this.showError(error);
      }
    },

onDeleteDocumentType: function (event) {
    return this._delete( "DocumentTypes", event.getSource().getBindingContext("master").getObject());
},

    onDeleteWBS: function (event) {
      return this._delete("Wbs", event.getSource().getBindingContext("master").getObject());
    },


onDeleteCompanyCode: function (event) {

    const row = event
        .getSource()
        .getBindingContext("master")
        .getObject();
        return this._delete(
        "CompanyCodes",
        row
    );
},

    onDeletePurchasingGroup: function (event) {
      return this._delete( "PurchasingGroups", event.getSource().getBindingContext("master").getObject());

    },

onDeletePurchasingOrganization: function (event) {
      return this._delete("PurchasingOrganizations", event.getSource().getBindingContext("master").getObject());
    },

    onDeleteCurrency: async function (event) {

    const row = event
        .getSource()
        .getBindingContext("master")
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

        await this.requestMaster(
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

onDeletePaymentTerm: async function (event) {

    const row = event
        .getSource()
        .getBindingContext("master")
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

        await this.requestMaster(
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


    onDeleteSystemContractBasePO: async function (event) {

    const row = event
        .getSource()
        .getBindingContext("master")
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

        await this.requestMaster(
            `SystemContractBasePO('${encodeURIComponent(row.code)}')`,
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

onDeleteDivision: function (event) {
      return this._delete("Divisions", event.getSource().getBindingContext("master").getObject());
    },

    onDeleteProcurementCategory: async function (event) {

    const row = event
        .getSource()
        .getBindingContext("master")
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

        await this.requestMaster(
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

onDeleteApplicableTax: function (event) {
      return this._delete("ApplicableTaxes", event.getSource().getBindingContext("master").getObject());
    },

onDeletePlant: function (event) {
      return this._delete("Plant", event.getSource().getBindingContext("master").getObject());
    },


onDeleteItemCategory: async function (event) {

    const row = event
        .getSource()
        .getBindingContext("master")
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

        await this.requestMaster(
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

    onDeleteAccountAssignment: async function (event) {

    const row = event
        .getSource()
        .getBindingContext("master")
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

        await this.requestMaster(
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


    onDeleteServiceCategories: async function (event) {

    const row = event
        .getSource()
        .getBindingContext("master")
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

        await this.requestMaster(
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
onDeleteUnitOfMeasure: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("master");

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

                    await this.requestMaster(
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

onDeleteServiceGroup: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("master");

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
                        `ServiceGroups(${item.ID})`,
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
onDeleteValuationClass: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("master");

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
                        `${this._valuationClassEntity(context)}(${item.ID})`,
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

onDeleteEntity: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("master");

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

                    await this.requestMaster(
                        `Entity(${item.ID})`,
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
onDeleteProject: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("master");

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

                    await this.requestMaster(
                        `Projects(${item.ID})`,
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

onDeleteMatGroup: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("master");

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

                    await this.requestMaster(
                        `MatGroup(${item.ID})`,
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
onDeleteExtensionMaterialGroup: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("master");

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

                    await this.requestMaster(
                        `ExtensionMaterialGroup(${item.ID})`,
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
onDeleteProfitCenter: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("master");

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

                    await this.requestMaster(
                        `ProfitCenter(${item.ID})`,
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
onDeleteMRPType: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("master");

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

                    await this.requestMaster(
                        `MRPType(${item.ID})`,
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
onDeleteAvailabilityCheck: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("master");

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

                    await this.requestMaster(
                        `AvailabilityCheck(${item.ID})`,
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
onDeleteSerialNumberProfile: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("master");

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

                    await this.requestMaster(
                        `SerialNumberProfile(${item.ID})`,
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
onDeleteDistributionChannel: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("master");

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

                    await this.requestMaster(
                        `DistributionChannel(${item.ID})`,
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
onDeleteArReference: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("master");

    const item = context.getObject();

    MessageBox.confirm(
        `Are you sure you want to delete AR Reference "${item.arReferenceCode}"?`,
        {
            title: "Delete AR Reference",

            onClose: async function (action) {

                if (action !== MessageBox.Action.OK) {
                    return;
                }

                try {

                    await this.requestMaster(
                        `ArReferences(${item.ID})`,
                        {
                            method: "DELETE"
                        }
                    );

                    MessageBox.success(
                        "AR Reference deleted successfully."
                    );

                    await this.onRefresh();

                } catch (error) {
                    this.showError(error);
                }

            }.bind(this)
        }
    );
},
onDeleteStorageLocation: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("master");

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
                        `StorageLocation(${item.ID})`,
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
onDeleteSalesOrg: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("master");

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
                        `SalesOrg(${item.ID})`,
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
onDeleteIncoterm: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("master");

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
                        `Incoterms(${item.ID})`,
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
onDeleteContractType: async function (oEvent) {

    const context = oEvent
        .getSource()
        .getBindingContext("master");

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

                    await this.requestMaster(
                        `ContractType(${item.ID})`,
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
onDeleteBudgetCode: async function (oEvent) {
    const item = oEvent.getSource().getBindingContext("master").getObject();
    MessageBox.confirm(
        `Are you sure you want to delete Budget Code "${item.budgetCode}"?`,
        {
            title: "Delete Budget Code",
            onClose: async function (action) {
                if (action !== MessageBox.Action.OK) {
                    return;
                }
                try {
                    await this.requestMaster(`BudgetCode(${item.ID})`, { method: "DELETE" });
                    MessageBox.success("Budget Code deleted successfully.");
                    await this.onRefresh();
                } catch (error) {
                    this.showError(error);
                }
            }.bind(this)
        }
    );
},
onDeleteCostCenter: async function (oEvent) {

    const item = oEvent
        .getSource()
        .getBindingContext("master")
        .getObject();

    try {

        await this.requestMaster(
            `CostCenter(${item.ID})`,
            {
                method: "DELETE"
            }
        );

        sap.m.MessageToast.show("Cost Center deleted successfully.");

        await this.onRefresh();

    } catch (error) {

        MessageBox.error(
            error.message || "Failed to delete Cost Center."
        );

    }
},

onDeleteBudgetCode: async function (oEvent) {
    const item = oEvent.getSource().getBindingContext("master").getObject();
    try {
        await this.requestMaster(`BudgetCode(${item.ID})`, { method: "DELETE" });
        this.showSuccess("Budget Code deleted successfully.");
        await this.onRefresh();
    } catch (error) {
        this.showError(error);
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
