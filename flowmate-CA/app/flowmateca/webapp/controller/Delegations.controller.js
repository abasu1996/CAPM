sap.ui.define([
  "flowmateca/controller/BaseController",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/m/MessageBox"
], function (BaseController, JSONModel, Filter, FilterOperator, MessageBox) {
  "use strict";

  return BaseController.extend("flowmateca.controller.Delegations", {
    onInit: function () {
      this.getView().setModel(new JSONModel(this._emptyDelegation()), "newDelegation");
      this.getRouter().getRoute("delegations").attachPatternMatched(this.onRefresh, this);
    },

    onRefresh: function () {
      this.byId("delegationsTable").getBinding("items")?.refresh();
    },

    onSearch: function (event) {
      const query = event.getParameter("query") || event.getParameter("newValue") || "";
      const binding = this.byId("delegationsTable").getBinding("items");
      binding.filter(query ? [new Filter({
        filters: [
          new Filter("delegator/displayName", FilterOperator.Contains, query),
          new Filter("delegator/email", FilterOperator.Contains, query),
          new Filter("delegate/displayName", FilterOperator.Contains, query),
          new Filter("delegate/email", FilterOperator.Contains, query)
        ],
        and: false
      })] : []);
    },

    onOpenCreateDialog: function () {
      this.getView().getModel("newDelegation").setData(this._emptyDelegation());
      this.byId("createDelegationDialog").open();
    },

    onCloseCreateDialog: function () {
      this.byId("createDelegationDialog").close();
    },

    onDelegatorValueHelpRequest: function () {
      this.byId("delegatorValueHelpDialog").open();
    },

    onDelegateValueHelpRequest: function () {
      this.byId("delegateValueHelpDialog").open();
    },

    onUserValueHelpSearch: function (event) {
      const query = event.getParameter("value") || "";
      const binding = event.getSource().getBinding("items");
      const filters = [new Filter("isActive", FilterOperator.EQ, true)];
      if (query) {
        filters.push(new Filter({
          filters: [
            new Filter("displayName", FilterOperator.Contains, query),
            new Filter("email", FilterOperator.Contains, query),
            new Filter("userPrincipalName", FilterOperator.Contains, query)
          ],
          and: false
        }));
      }
      binding.filter(filters);
    },

    onDelegatorValueHelpConfirm: function (event) {
      this._setSelectedUser(event, "delegator");
    },

    onDelegateValueHelpConfirm: function (event) {
      this._setSelectedUser(event, "delegate");
    },

    onUserValueHelpClose: function (event) {
      event.getSource().getBinding("items")?.filter([new Filter("isActive", FilterOperator.EQ, true)]);
    },

    onClearDelegator: function () {
      const model = this.getView().getModel("newDelegation");
      model.setProperty("/delegator_ID", "");
      model.setProperty("/delegatorName", "");
    },

    onClearDelegate: function () {
      const model = this.getView().getModel("newDelegation");
      model.setProperty("/delegate_ID", "");
      model.setProperty("/delegateName", "");
    },

    onCreateDelegation: async function () {
      const delegation = this.getView().getModel("newDelegation").getData();
      if (!delegation.delegate_ID || !delegation.startDate || !delegation.endDate ||
          (delegation.onBehalfOfUser && !delegation.delegator_ID)) {
        MessageBox.warning(this._text("delegationRequiredMessage"));
        return;
      }
      if (delegation.startDate > delegation.endDate) {
        MessageBox.warning(this._text("delegationDateErrorMessage"));
        return;
      }

      this.setBusy(true);
      try {
        await this.request("Delegations", {
          method: "POST",
          body: {
            delegator_ID: delegation.onBehalfOfUser ? delegation.delegator_ID : null,
            delegate_ID: delegation.delegate_ID,
            startDate: delegation.startDate,
            endDate: delegation.endDate,
            forwardNotifications: delegation.forwardNotifications,
            enabled: true
          }
        });
        this.onCloseCreateDialog();
        this.showSuccess(this._text("delegationCreatedMessage"));
        this.onRefresh();
      } catch (error) {
        this.showError(error);
      } finally {
        this.setBusy(false);
      }
    },

    onDeleteDelegation: function (event) {
      const context = event.getSource().getBindingContext();
      const id = context?.getProperty("ID");
      if (!id) {
        return;
      }
      MessageBox.confirm(this._text("deleteDelegationConfirmMessage"), {
        emphasizedAction: MessageBox.Action.DELETE,
        actions: [MessageBox.Action.DELETE, MessageBox.Action.CANCEL],
        onClose: async function (action) {
          if (action !== MessageBox.Action.DELETE) {
            return;
          }
          this.setBusy(true);
          try {
            await this.request(`Delegations(${id})`, { method: "DELETE" });
            this.showSuccess(this._text("delegationDeletedMessage"));
            this.onRefresh();
          } catch (error) {
            this.showError(error);
          } finally {
            this.setBusy(false);
          }
        }.bind(this)
      });
    },

    formatDelegationStatus: function (startDate, endDate, enabled) {
      const today = new Date().toISOString().slice(0, 10);
      if (!enabled) return this._text("delegationDisabledStatus");
      if (today < startDate) return this._text("delegationScheduledStatus");
      if (today > endDate) return this._text("delegationExpiredStatus");
      return this._text("delegationActiveStatus");
    },

    formatDelegationState: function (startDate, endDate, enabled) {
      const today = new Date().toISOString().slice(0, 10);
      if (!enabled || today > endDate) return "None";
      return today < startDate ? "Information" : "Success";
    },

    _setSelectedUser: function (event, role) {
      const context = event.getParameter("selectedItem")?.getBindingContext();
      if (context) {
        const model = this.getView().getModel("newDelegation");
        model.setProperty(`/${role}_ID`, context.getProperty("ID"));
        model.setProperty(`/${role}Name`, context.getProperty("displayName") || context.getProperty("email"));
      }
      this.onUserValueHelpClose(event);
    },

    _emptyDelegation: function () {
      return {
        onBehalfOfUser: false,
        delegator_ID: "",
        delegatorName: "",
        delegate_ID: "",
        delegateName: "",
        startDate: "",
        endDate: "",
        forwardNotifications: true
      };
    },

    _text: function (key) {
      return this.getOwnerComponent().getModel("i18n").getResourceBundle().getText(key);
    }
  });
});
