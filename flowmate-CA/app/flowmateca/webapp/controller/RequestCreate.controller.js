sap.ui.define([
  "flowmateca/controller/BaseController",
  "flowmateca/model/FormDefinitions",
  "sap/ui/model/json/JSONModel",
  "sap/ui/layout/form/SimpleForm",
  "sap/m/Label",
  "sap/m/Input",
  "sap/m/TextArea",
  "sap/m/DatePicker",
  "sap/m/CheckBox",
  "sap/m/ComboBox",
  "sap/ui/core/Item",
  "sap/ui/core/ListItem",
  "sap/m/MessageBox"
], function (
  BaseController,
  FormDefinitions,
  JSONModel,
  SimpleForm,
  Label,
  Input,
  TextArea,
  DatePicker,
  CheckBox,
  ComboBox,
  Item,
  ListItem,
  MessageBox
) {
  "use strict";

  return BaseController.extend("flowmateca.controller.RequestCreate", {
    onInit: function () {
      this.getView().setModel(new JSONModel(this._emptyForm()), "form");
      this.getView().setModel(new JSONModel({
        requestTypes: [],
        variants: [],
        filteredVariants: [],
        priorities: [],
        myRequests: []
      }), "catalog");
      this.getView().setModel(new JSONModel({ items: [] }), "files");
      this.getRouter().getRoute("requestCreate").attachPatternMatched(this._onRouteMatched, this);
    },

    _emptyForm: function () {
      return {
        requestTypeCode: "",
        requestVariantCode: "",
        title: "",
        description: "",
        priorityCode: "MEDIUM",
        dueDate: "",
        predecessorId: "",
        detailSectionTitle: "Process Details",
        details: {}
      };
    },

    _onRouteMatched: async function (event) {
      this.getView().getModel("form").setData(this._emptyForm());
      this.getView().getModel("files").setData({ items: [] });
      this._selectedFiles = [];
      await this._loadCatalog();
      const query = event.getParameter("arguments")["?query"] || {};
      if (query.requestType) {
        this.getView().getModel("form").setProperty("/requestTypeCode", query.requestType);
        this._filterVariants(query.requestType);
      }
      this._renderDynamicForm();
    },

    _loadCatalog: async function () {
      this.setBusy(true);
      try {
        const [types, variants, priorities, requests] = await Promise.all([
          this.request("RequestTypes?$filter=isActive eq true&$orderby=sortOrder"),
          this.request("RequestVariants?$filter=isActive eq true&$orderby=sortOrder"),
          this.request("Priorities?$filter=isActive eq true&$orderby=sortOrder"),
          this.request("MyRequests?$select=ID,referenceNumber,title&$orderby=createdAt desc&$top=100")
        ]);
        const catalog = this.getView().getModel("catalog");
        catalog.setProperty("/requestTypes", types.value || []);
        catalog.setProperty("/variants", variants.value || []);
        catalog.setProperty("/priorities", priorities.value || []);
        catalog.setProperty("/myRequests", requests.value || []);
      } catch (error) {
        this.showError(error);
      } finally {
        this.setBusy(false);
      }
    },

    onRequestTypeChange: function () {
      const typeCode = this.getView().getModel("form").getProperty("/requestTypeCode");
      this.getView().getModel("form").setProperty("/requestVariantCode", "");
      this.getView().getModel("form").setProperty("/details", {});
      this._filterVariants(typeCode);
      this._renderDynamicForm();
    },

    _filterVariants: function (typeCode) {
      const catalog = this.getView().getModel("catalog");
      const variants = catalog.getProperty("/variants") || [];
      catalog.setProperty("/filteredVariants", variants.filter(function (variant) {
        return variant.requestType_code === typeCode;
      }));
    },

    onRequestVariantChange: async function () {
      this.getView().getModel("form").setProperty("/details", {});
      await this._renderDynamicForm();
    },

    _renderDynamicForm: async function () {
      const host = this.byId("dynamicFormHost");
      host.destroyItems();
      this._fieldControls = [];
      const formModel = this.getView().getModel("form");
      const variantCode = formModel.getProperty("/requestVariantCode");
      const fields = FormDefinitions.getFields(variantCode);
      const variant = (this.getView().getModel("catalog").getProperty("/variants") || [])
        .find(function (entry) {
          return entry.code === variantCode;
        });
      formModel.setProperty("/detailSectionTitle", variant ? `${variant.name} Details` : "Process Details");

      if (!fields.length) {
        return;
      }

      await this._loadFieldCatalogs(fields);
      const simpleForm = new SimpleForm({
        editable: true,
        layout: "ColumnLayout",
        columnsXL: 3,
        columnsL: 3,
        columnsM: 2,
        labelSpanXL: 12,
        labelSpanL: 12,
        labelSpanM: 12
      });
      fields.forEach(function (definition) {
        const label = new Label({
          text: definition.label,
          required: definition.required
        });
        const control = this._createFieldControl(definition);
        simpleForm.addContent(label);
        simpleForm.addContent(control);
        this._fieldControls.push({
          definition,
          control
        });
      }.bind(this));
      host.addItem(simpleForm);
    },

    _loadFieldCatalogs: async function (fields) {
      const entities = Array.from(new Set(fields.filter(function (definition) {
        return definition.entity;
      }).map(function (definition) {
        return definition.entity;
      })));
      const catalog = this.getView().getModel("catalog");
      await Promise.all(entities.map(async function (entity) {
        if (catalog.getProperty(`/${entity}`)) {
          return;
        }
        const orderBy = entity === "Users" || entity === "Vendors" ? "" : "&$orderby=sortOrder";
        const result = await this.request(`${entity}?$filter=isActive eq true${orderBy}`);
        catalog.setProperty(`/${entity}`, result.value || []);
      }.bind(this)));
    },

    _createFieldControl: function (definition) {
      const path = `form>/details/${definition.name}`;
      let control;
      if (definition.type === "textarea") {
        control = new TextArea({
          rows: 3,
          width: "100%",
          placeholder: definition.placeholder || ""
        }).bindValue(path);
      } else if (definition.type === "date") {
        control = new DatePicker({
          valueFormat: "yyyy-MM-dd",
          displayFormat: "medium"
        }).bindValue(path);
      } else if (definition.type === "checkbox") {
        control = new CheckBox().bindSelected(path);
      } else if (definition.type === "select") {
        control = new ComboBox({
          width: "100%",
          placeholder: definition.placeholder || ""
        }).bindSelectedKey(path);
        (definition.options || []).forEach(function (option) {
          control.addItem(new Item({
            key: option.key,
            text: option.text
          }));
        });
      } else if (definition.type === "combo") {
        const key = definition.key || "code";
        const text = definition.text || "name";
        const secondaryText = definition.secondaryText || "code";
        control = new ComboBox({
          width: "100%",
          showSecondaryValues: true,
          filterSecondaryValues: true,
          placeholder: definition.placeholder || `Search ${definition.label}`
        }).bindSelectedKey(path);
        control.bindItems({
          path: `catalog>/${definition.entity}`,
          template: new ListItem({
            key: `{catalog>${key}}`,
            text: `{catalog>${text}}`,
            additionalText: `{catalog>${secondaryText}}`
          })
        });
      } else {
        control = new Input({
          type: definition.type === "number" ? "Number" : "Text",
          maxLength: definition.maxLength || 0,
          placeholder: definition.placeholder || ""
        }).bindValue(path);
      }
      return control;
    },

    onFilesSelected: function (event) {
      const files = Array.from(event.getParameter("files") || []);
      this._selectedFiles = files;
      this.getView().getModel("files").setProperty("/items", files.map(function (file) {
        return {
          name: file.name,
          sizeText: `${(file.size / 1024 / 1024).toFixed(2)} MB`
        };
      }));
    },

    onSubmit: async function () {
      const form = this.getView().getModel("form").getData();
      if (!form.requestTypeCode || !form.requestVariantCode || !form.title.trim()) {
        MessageBox.warning("Request type, process variant and title are required.");
        return;
      }
      const missing = (this._fieldControls || []).find(function (entry) {
        if (!entry.definition.required) {
          return false;
        }
        const value = form.details[entry.definition.name];
        return value === undefined || value === null || value === "";
      });
      if (missing) {
        MessageBox.warning(`${missing.definition.label} is required.`);
        missing.control.focus();
        return;
      }

      this.setBusy(true);
      try {
        const request = await this.request("createRequest", {
          method: "POST",
          body: {
            input: {
              requestTypeCode: form.requestTypeCode,
              requestVariantCode: form.requestVariantCode,
              title: form.title.trim(),
              description: form.description,
              priorityCode: form.priorityCode,
              dueDate: form.dueDate || null,
              predecessorId: form.predecessorId || null,
              details: JSON.stringify(form.details || {})
            }
          }
        });
        this.showSuccess(`Request ${request.referenceNumber} created`);
        const files = this._selectedFiles || [];
        if (files.length) {
          this._uploadFilesInBackground(request.ID, files);
        }
        this.navTo("requestDetail", {
          requestId: request.ID
        }, true);
      } catch (error) {
        this.showError(error);
      } finally {
        this.setBusy(false);
      }
    },

    _uploadFilesInBackground: async function (requestId, files) {
      const results = await Promise.allSettled(files.map(async function (file) {
        const attachment = await this.request("Attachments", {
          method: "POST",
          body: {
            request_ID: requestId,
            filename: file.name,
            mediaType: file.type || "application/octet-stream",
            size: file.size,
            category: "SUPPORTING_DOCUMENT"
          }
        });
        const token = await this._csrfToken();
        const response = await fetch(`odata/v4/flowmate-ca/Attachments(${attachment.ID})/content`, {
          method: "PUT",
          headers: {
            "X-CSRF-Token": token,
            "Content-Type": file.type || "application/octet-stream"
          },
          body: file
        });
        if (!response.ok) {
          throw new Error(`Upload failed for ${file.name}`);
        }
      }.bind(this)));
      const failed = results.filter(function (result) {
        return result.status === "rejected";
      });
      if (failed.length) {
        MessageBox.warning(`${failed.length} attachment(s) could not be uploaded. Open the request and try again.`);
      } else {
        this.showSuccess("Supporting documents uploaded");
      }
    },

    onCancel: function () {
      window.history.length > 1 ? window.history.back() : this.navTo("dashboard", {}, true);
    }
  });
});
