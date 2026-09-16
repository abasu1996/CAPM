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
  "sap/m/MessageBox",
  "sap/ui/unified/FileUploader",
  "sap/m/Table",
  "sap/m/Column",
  "sap/m/ColumnListItem",
  "sap/m/Text",
  "sap/m/Button",
  "sap/base/Log"
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
  MessageBox,
  FileUploader,
  Table,
  Column,
  ColumnListItem,
  Text,
  Button,
  Log
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
        myRequests: [],
        teams:[]
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
        requesterId: "",
        requesterName: "",
        requesterEmail: "",
        requestDateTime: new Date().toLocaleString(),

        processorTeamCode: "",
        processorTeamName: "",
        detailSectionTitle: "Process Details",
        details: {}
      };
    },

    _onRouteMatched: async function (event) {
      this.getView().getModel("form").setData(this._emptyForm());
      this.getView().getModel("files").setData({ items: [] });
      this._selectedFiles = [];
      this._dynamicFileUploads = {};
      await Promise.all([
        this._loadCatalog(),
        this._loadCurrentUser()
      ]);
      
      const query = event.getParameter("arguments")["?query"] || {};
      if (query.requestType) {
        this.getView().getModel("form").setProperty("/requestTypeCode", query.requestType);
        this._filterVariants(query.requestType);
      }
      this._renderDynamicForm();
      this._renderItemsTable();
    },
    onProcessorTeamChange: function (event) {

    const selectedItem =
        event.getParameter("selectedItem");

    if (!selectedItem) {
        return;
    }

    const team = 
    selectedItem
            .getBindingContext("catalog")
            .getObject();

    const formModel =
        this.getView().getModel("form");

    formModel.setProperty(
        "/processorTeamCode",
        team.teamCode
    );

    formModel.setProperty(
        "/processorTeamName",
        team.name
    );
},

    _loadCatalog: async function () {
      this.setBusy(true);
      try {
        const [types, variants, priorities, requests, teams] = await Promise.all([
          this.request("RequestTypes?$filter=isActive eq true&$orderby=sortOrder"),
          this.request("RequestVariants?$filter=isActive eq true&$orderby=sortOrder"),
          this.request("Priorities?$filter=isActive eq true&$orderby=sortOrder"),
          this.request("MyRequests?$select=ID,referenceNumber,title&$orderby=createdAt desc&$top=100"),
          this.request("Teams?$filter=isActive eq true&$orderby=name")
        ]);
        const catalog = this.getView().getModel("catalog");
        catalog.setProperty("/requestTypes", types.value || []);
        catalog.setProperty("/variants", variants.value || []);
        catalog.setProperty("/priorities", priorities.value || []);
        catalog.setProperty("/myRequests", requests.value || []);
        catalog.setProperty("/teams", teams.value || []);
      } catch (error) {
        this.showError(error);
      } finally {
        this.setBusy(false);
      }
    },

    _loadCurrentUser: async function () {

    try {

        const user = await this.request(
            "getCurrentUser"
        );

        const formModel =
            this.getView().getModel("form");

        formModel.setProperty(
            "/requesterId",
            user.ID
        );

        formModel.setProperty(
            "/requesterName",
            user.displayName
        );

        formModel.setProperty(
            "/requesterEmail",
            user.email
        );

    } catch (error) {

        this.showError(error);
    }
},

    onRequestTypeChange: function () {
      const typeCode = this.getView().getModel("form").getProperty("/requestTypeCode");
      this.getView().getModel("form").setProperty("/requestVariantCode", "");
      this.getView().getModel("form").setProperty("/details", {});
      this._filterVariants(typeCode);
      this._renderDynamicForm();
      this._renderItemsTable();
    },

    _filterVariants: function (typeCode) {
      const catalog = this.getView().getModel("catalog");
      const variants = catalog.getProperty("/variants") || [];
      catalog.setProperty("/filteredVariants", variants.filter(function (variant) {
        return variant.requestType_code === typeCode;
      }));
    },

    onRequestVariantChange: async function () {
      await this._renderDynamicForm();
      this._renderItemsTable();
    },

    _renderDynamicForm: async function () {
      const host = this.byId("dynamicFormHost");
      host.destroyItems();
      this._fieldControls = [];
      this._dynamicFileUploads = {};
      const formModel = this.getView().getModel("form");
      const typeCode = formModel.getProperty("/requestTypeCode");
      const fields = FormDefinitions.getFieldsByRequestType(typeCode);
      const type = (this.getView().getModel("catalog").getProperty("/requestTypes") || [])
        .find(function (entry) {
          return entry.code === typeCode;
        });
      formModel.setProperty("/detailSectionTitle", type ? `${type.name} Details` : "Process Details");

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
      // A failed pick list must degrade only its own field, not abort the render.
      await Promise.all(entities.map(async function (entity) {
        if (catalog.getProperty(`/${entity}`)) {
          return;
        }
        const orderBy = entity === "Users" || entity === "Vendors" ? "" : "&$orderby=sortOrder";
        try {
          const result = await this.request(`${entity}?$filter=isActive eq true${orderBy}`);
          catalog.setProperty(`/${entity}`, result.value || []);
        } catch (error) {
          Log.error(`Could not load the ${entity} list`, error);
          catalog.setProperty(`/${entity}`, []);
        }
      }.bind(this)));
    },

    _applyAutoFill: function (definition, selectedKey) {
      if (!definition.autoFills || !definition.entity) {
        return;
      }
      const rows = this.getView().getModel("catalog")
        .getProperty(`/${definition.entity}`) || [];
      const keyProperty = definition.key || "code";
      const match = rows.find(function (row) {
        return String(row[keyProperty]) === String(selectedKey);
      });
      this.getView().getModel("form").setProperty(
        `/details/${definition.autoFills.field}`,
        match ? (match[definition.autoFills.from] || "") : ""
      );
    },

    _createFieldControl: function (definition) {
      const dataPath = definition.source === "request"
        ? `/${definition.name}`
        : `/details/${definition.name}`;
      const path = `form>${dataPath}`;
      let control;
      if (definition.type === "readonly") {
        control = new Input({
          editable: false,
          placeholder: definition.placeholder || ""
        }).bindValue(path);
      } else if (definition.type === "textarea") {
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
        control = new CheckBox().bindProperty("selected", path);
      } else if (definition.type === "select") {
        control = new ComboBox({
          width: "100%",
          placeholder: definition.placeholder || ""
        }).bindProperty("selectedKey", path);
        (definition.options || []).forEach(function (option) {
          control.addItem(new Item({
            key: option.key,
            text: option.text
          }));
        });
      } else if (definition.type === "file") {
        const formModel = this.getView().getModel("form");
        control = new FileUploader({
          width: "100%",
          buttonText: definition.placeholder || `Select ${definition.label}`,
          change: function (event) {
            const files = event.getParameter("files");
            const file = files && files.length ? files[0] : null;
            formModel.setProperty(dataPath, file ? file.name : "");
            if (file) {
              this._dynamicFileUploads[definition.name] = file;
            } else {
              delete this._dynamicFileUploads[definition.name];
            }
          }.bind(this)
        });
      } else if (definition.type === "combo") {
        const key = definition.key || "code";
        const text = definition.text || "name";
        const secondaryText = definition.secondaryText || "code";
        control = new ComboBox({
          width: "100%",
          showSecondaryValues: true,
          filterSecondaryValues: true,
          placeholder: definition.placeholder || `Search ${definition.label}`,
          selectionChange: function (event) {
            const item = event.getParameter("selectedItem");
            this._applyAutoFill(definition, item ? item.getKey() : "");
          }.bind(this)
        }).bindProperty("selectedKey", path);
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

    _renderItemsTable: function () {
      const host = this.byId("itemsTableHost");
      if (!host) {
        return;
      }
      const formModel = this.getView().getModel("form");
      const typeCode = formModel.getProperty("/requestTypeCode");
      const columns = FormDefinitions.getItemColumns(typeCode);
      this._itemColumns = columns;

      host.destroyColumns();
      host.unbindItems();

      if (!formModel.getProperty("/details/items")) {
        formModel.setProperty("/details/items", []);
      }

      if (!columns.length) {
        return;
      }

      columns.forEach(function (col) {
        host.addColumn(new Column({
          header: new Text({ text: col.label }),
          width: col.type === "date" ? "11rem" : "12rem"
        }));
      });
      host.addColumn(new Column({ hAlign: "End", width: "3rem" }));

      host.bindItems({
        path: "form>/details/items",
        template: new ColumnListItem({
          cells: columns.map(function (col) {
            if (col.type === "date") {
              return new DatePicker({
                valueFormat: "yyyy-MM-dd",
                displayFormat: "medium",
                width: "100%"
              }).bindValue(`form>${col.name}`);
            }
            return new Input({
              type: col.type === "number" ? "Number" : "Text",
              width: "100%"
            }).bindValue(`form>${col.name}`);
          }).concat([
            new Button({
              icon: "sap-icon://delete",
              type: "Transparent",
              press: this._onRemoveItemRow.bind(this)
            })
          ])
        })
      });
    },

    onAddItemRow: function () {
      const formModel = this.getView().getModel("form");
      const items = formModel.getProperty("/details/items") || [];
      const blank = {};
      (this._itemColumns || []).forEach(function (col) {
        blank[col.name] = "";
      });
      formModel.setProperty("/details/items", items.concat([blank]));
    },

    _onRemoveItemRow: function (event) {
      const context = event.getSource().getBindingContext("form");
      const path = context.getPath();
      const index = Number(path.slice(path.lastIndexOf("/") + 1));
      const formModel = this.getView().getModel("form");
      const items = formModel.getProperty("/details/items") || [];
      formModel.setProperty("/details/items", items.filter(function (_row, rowIndex) {
        return rowIndex !== index;
      }));
    },

    onExportItemsCsv: function () {
      const columns = this._itemColumns || [];
      if (!columns.length) {
        return;
      }
      const formModel = this.getView().getModel("form");
      const typeCode = formModel.getProperty("/requestTypeCode");
      const items = formModel.getProperty("/details/items") || [];
      const rows = [columns.map(function (col) { return col.label; })];
      items.forEach(function (item) {
        rows.push(columns.map(function (col) { return item[col.name] || ""; }));
      });
      const csv = rows.map(function (row) {
        return row.map(this._csvEscape).join(",");
      }.bind(this)).join("\r\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${typeCode || "items"}_template.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    },

    _csvEscape: function (value) {
      const text = value === undefined || value === null ? "" : String(value);
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    },

    onImportItemsCsv: function (event) {
      const files = event.getParameter("files");
      if (!files || !files.length) {
        return;
      }
      const columns = this._itemColumns || [];
      const reader = new FileReader();
      reader.onload = function () {
        const rows = this._parseCsv(String(reader.result));
        if (!rows.length) {
          return;
        }
        const header = rows[0].map(function (cell) {
          return String(cell).trim().toLowerCase();
        });
        const columnByHeader = {};
        columns.forEach(function (col) {
          columnByHeader[col.label.trim().toLowerCase()] = col.name;
        });
        const items = rows.slice(1)
          .filter(function (row) {
            return row.some(function (cell) { return cell !== ""; });
          })
          .map(function (row) {
            const item = {};
            header.forEach(function (headerText, index) {
              const key = columnByHeader[headerText];
              if (key) {
                item[key] = row[index] !== undefined ? row[index] : "";
              }
            });
            return item;
          });
        this.getView().getModel("form").setProperty("/details/items", items);
        this.showSuccess(`${items.length} row(s) imported`);
      }.bind(this);
      reader.readAsText(files[0]);
      event.getSource().clear();
    },

    _parseCsv: function (text) {
      const rows = [];
      let row = [];
      let field = "";
      let inQuotes = false;
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (inQuotes) {
          if (char === '"') {
            if (text[i + 1] === '"') {
              field += '"';
              i++;
            } else {
              inQuotes = false;
            }
          } else {
            field += char;
          }
        } else if (char === '"') {
          inQuotes = true;
        } else if (char === ",") {
          row.push(field);
          field = "";
        } else if (char === "\n" || char === "\r") {
          if (char === "\r" && text[i + 1] === "\n") {
            i++;
          }
          row.push(field);
          field = "";
          if (row.length > 1 || row[0] !== "") {
            rows.push(row);
          }
          row = [];
        } else {
          field += char;
        }
      }
      if (field !== "" || row.length) {
        row.push(field);
        rows.push(row);
      }
      return rows;
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
      if (!form.requestTypeCode || !form.requestVariantCode || !form.title.trim() || !form.processorTeamCode)  {
        MessageBox.warning("Request type, process variant and title are required.");
        return;
      }
      const missing = (this._fieldControls || []).find(function (entry) {
        if (!entry.definition.required) {
          return false;
        }
        const value = entry.definition.source === "request"
          ? form[entry.definition.name]
          : form.details[entry.definition.name];
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
              processorTeamCode: form.processorTeamCode,
              details: JSON.stringify(form.details || {})
            }
          }
        });
        this.showSuccess(`Request ${request.referenceNumber} created`);
        const uploads = (this._selectedFiles || []).map(function (file) {
          return { file: file, category: "SUPPORTING_DOCUMENT" };
        });
        Object.keys(this._dynamicFileUploads || {}).forEach(function (name) {
          uploads.push({
            file: this._dynamicFileUploads[name],
            category: name.replace(/([A-Z])/g, "_$1").toUpperCase()
          });
        }.bind(this));
        if (uploads.length) {
          this._uploadFilesInBackground(request.ID, uploads);
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

    _uploadFilesInBackground: async function (requestId, uploads) {
      const results = await Promise.allSettled(uploads.map(async function (upload) {
        const file = upload.file;
        // Only elements that exist on FlowmateCAService.Attachments may be sent - CAP
        // rejects unknown properties with 400. mimeType is derived server-side from the
        // filename extension by @cap-js/attachments, so it must not be sent here.
        const attachment = await this.request("Attachments", {
          method: "POST",
          body: {
            request_ID: requestId,
            filename: file.name,
            category: upload.category || "SUPPORTING_DOCUMENT"
          }
        });
        const token = await this._csrfToken();
        const response = await fetch(this.resolveAppUri(`odata/v4/flowmate-ca/Attachments(${attachment.ID})/content`), {
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
