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
        vendors: []
      }), "admin");
      this.getView().setModel(new JSONModel({}), "newItem");
      this.getRouter().getRoute("admin").attachPatternMatched(this.onRefresh, this);
    },

    onRefresh: async function () {
      this.setBusy(true);
      try {
        const [steps, requestTypes, variants, users, teams, teamMembers, vendors] = await Promise.all([
          this.requestMaster("WorkflowStepConfigs?$expand=requestType,requestVariant&$orderby=requestType_code,requestVariant_code,stepNo"),
          this.requestMaster("RequestTypes?$orderby=sortOrder"),
          this.requestMaster("RequestVariants?$expand=requestType&$orderby=requestType_code,sortOrder"),
          this.requestMaster("Users?$expand=manager&$orderby=displayName"),
          this.requestMaster("Teams?$orderby=name"),
          this.requestMaster("TeamMembers?$expand=user,team"),
          this.requestMaster("Vendors?$orderby=vendorName")
        ]);
        const model = this.getView().getModel("admin");
        model.setProperty("/steps", steps.value || []);
        model.setProperty("/requestTypes", requestTypes.value || []);
        model.setProperty("/variants", variants.value || []);
        model.setProperty("/users", users.value || []);
        model.setProperty("/teams", teams.value || []);
        model.setProperty("/teamMembers", teamMembers.value || []);
        model.setProperty("/vendors", vendors.value || []);
        model.setProperty("/teamTree", this._teamTree(teams.value || [], teamMembers.value || []));
      } catch (error) {
        this.showError(error);
      } finally {
        this.setBusy(false);
      }
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

    _openAddDialog: function (type, title) {
      this.getView().getModel("newItem").setData({
        type,
        title,
        isStep: type === "step",
        isVariant: type === "variant",
        isUser: type === "user",
        isTeam: type === "team",
        isVendor: type === "vendor",
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
        taskName: ""
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
      });
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

    _patch: async function (entity, key, payload, stringKey) {
      try {
        const formattedKey = stringKey ? `'${encodeURIComponent(key)}'` : key;
        await this.requestMaster(`${entity}(${formattedKey})`, {
          method: "PATCH",
          headers: {
            "If-Match": "*"
          },
          body: payload
        });
        this.showSuccess("Changes saved");
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
    }
  });
});
