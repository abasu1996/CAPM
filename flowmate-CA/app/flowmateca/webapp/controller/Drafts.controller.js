sap.ui.define([
  "flowmateca/controller/BaseController",
  "flowmateca/model/ListModel",
  "sap/m/MessageBox"
], function (BaseController, ListModel, MessageBox) {
  "use strict";

  return BaseController.extend("flowmateca.controller.Drafts", {
    onInit: function () {
      this.getView().setModel(new ListModel({ items: [] }), "drafts");
      this.getRouter().getRoute("drafts").attachPatternMatched(this.onRefresh, this);
    },

    onRefresh: async function () {
      this.setBusy(true);
      try {
        const result = await this.request("Drafts?$select=ID,title,requestTypeCode,requestVariantCode,creatorName,modifiedAt&$orderby=modifiedAt desc");
        this.getView().getModel("drafts").setProperty("/items", result.value || []);
      } catch (error) {
        this.showError(error);
      } finally {
        this.setBusy(false);
      }
    },

    onOpen: function (event) {
      const draft = event.getParameter("listItem").getBindingContext("drafts").getObject();
      this.navTo("requestCreate", { "?query": { draftId: draft.ID } });
    },

    onCreate: function () {
      this.navTo("requestCreate");
    },

    onDelete: function (event) {
      const draft = event.getSource().getBindingContext("drafts").getObject();
      MessageBox.confirm(`Delete draft "${draft.title}"?`, {
        onClose: async function (choice) {
          if (choice !== MessageBox.Action.OK) return;
          this.setBusy(true);
          try {
            await this.request("deleteDraft", { method: "POST", body: { draftId: draft.ID } });
            await this.onRefresh();
          } catch (error) {
            this.showError(error);
          } finally {
            this.setBusy(false);
          }
        }.bind(this)
      });
    }
  });
});
