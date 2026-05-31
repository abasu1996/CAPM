sap.ui.define([
    "flowmate/controller/BaseController",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], (BaseController, Filter, FilterOperator, JSONModel, MessageBox, MessageToast) => {
    "use strict";

    const CODE_LISTS = {
        ProcessTypes: { tableId: "processTypesTable", titleKey: "processTypesConfigTitle" },
        ProcessStatus: { tableId: "processStatusTable", titleKey: "processStatusesConfigTitle" },
        TaskStatus: { tableId: "taskStatusTable", titleKey: "taskStatusesConfigTitle" },
        RequestDropDown: { tableId: "requestDropDownTable", titleKey: "requestDropdownConfigTitle" }
    };

    return BaseController.extend("flowmate.controller.AdminProcessConfig", {
        onInit() {
            this.getView().setModel(new JSONModel(this._emptyCodeList()), "configEdit");
            this.getView().setModel(new JSONModel(this._emptyProcessStep()), "stepEdit");
            this.getView().setModel(new JSONModel(this._emptySubType()), "subTypeEdit");
            this.getView().setModel(new JSONModel(this._emptyFieldCatalog()), "fieldCatalogEdit");
            this.getView().setModel(new JSONModel(this._emptyFieldMapping()), "fieldMappingEdit");
            this.getView().setModel(new JSONModel(this._emptyFieldOption()), "fieldOptionEdit");
            this.getRouter().getRoute("RouteAdminProcessConfig").attachPatternMatched(this.onRouteMatched, this);
        },

        async onRouteMatched() {
            if (!await this.requireAdministrator()) {
                return;
            }

            this.setOneColumnLayout();
        },

        onSearchProcessSteps(oEvent) {
            const sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
            const oBinding = this.byId("configTable").getBinding("items");

            if (!sQuery) {
                oBinding.filter([]);
                return;
            }

            oBinding.filter([
                new Filter({
                    filters: [
                        new Filter("referenceNumber", FilterOperator.Contains, sQuery),
                        new Filter("processType_code", FilterOperator.Contains, sQuery),
                        new Filter("stepName", FilterOperator.Contains, sQuery),
                        new Filter("role", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                })
            ]);
        },

        onSearchCodeList(oEvent) {
            const sEntitySet = oEvent.getSource().data("entitySet");
            const sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
            const oBinding = this.byId(CODE_LISTS[sEntitySet].tableId).getBinding("items");

            if (!sQuery) {
                oBinding.filter([]);
                return;
            }

            oBinding.filter([
                new Filter({
                    filters: [
                        new Filter("code", FilterOperator.Contains, sQuery),
                        new Filter("name", FilterOperator.Contains, sQuery),
                        new Filter("descr", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                })
            ]);
        },

        onSearchSubTypes(oEvent) {
            this._filterTable(oEvent, "processSubTypesTable", [
                "code",
                "name",
                "descr",
                "processType_code",
                "processOwner",
                "activityDescription",
                "sapTCode"
            ]);
        },

        onSearchFieldCatalog(oEvent) {
            this._filterTable(oEvent, "fieldCatalogTable", [
                "fieldName",
                "label",
                "dataType",
                "defaultValue",
                "placeholder",
                "inputHint"
            ]);
        },

        onSearchFieldMappings(oEvent) {
            this._filterTable(oEvent, "fieldMappingsTable", [
                "processType_code",
                "processSubType_code",
                "field_fieldName",
                "fieldLabel",
                "sourceColumn",
                "section"
            ]);
        },

        onSearchFieldOptions(oEvent) {
            this._filterTable(oEvent, "fieldOptionsTable", [
                "field_fieldName",
                "code",
                "text"
            ]);
        },

        onAddCodeList(oEvent) {
            const sEntitySet = oEvent.getSource().data("entitySet");
            const oEntry = this._emptyCodeList();

            oEntry.entitySet = sEntitySet;
            oEntry.dialogTitle = `${this.getText("addConfigValueButton")} - ${this.getText(CODE_LISTS[sEntitySet].titleKey)}`;
            this.getView().getModel("configEdit").setData(oEntry);
            this.byId("codeListDialog").open();
        },

        onEditCodeList(oEvent) {
            const sEntitySet = oEvent.getSource().data("entitySet");
            const oEntry = oEvent.getSource().getBindingContext().getObject();

            this.getView().getModel("configEdit").setData({
                ...oEntry,
                entitySet: sEntitySet,
                isEdit: true,
                dialogTitle: `${this.getText("editConfigValueButton")} - ${this.getText(CODE_LISTS[sEntitySet].titleKey)}`
            });
            this.byId("codeListDialog").open();
        },

        onCloseCodeListDialog() {
            this.byId("codeListDialog").close();
        },

        async onSaveCodeList() {
            const oEntry = this.getView().getModel("configEdit").getData();

            if (!oEntry.code || !oEntry.name || !oEntry.descr) {
                MessageBox.warning(this.getText("configValueRequiredMessage"));
                return;
            }

            const oPayload = {
                code: oEntry.code,
                name: oEntry.name,
                descr: oEntry.descr
            };

            if (oEntry.entitySet === "RequestDropDown") {
                oPayload.description = oEntry.descr;
            }

            this.showBusy();

            try {
                if (oEntry.isEdit) {
                    await this.updateEntry(this._codeListPath(oEntry.entitySet, oEntry.code), oPayload);
                    MessageToast.show(this.getText("configValueUpdatedMessage"));
                } else {
                    await this.createEntry(`/${oEntry.entitySet}`, oPayload);
                    MessageToast.show(this.getText("configValueCreatedMessage"));
                }

                this._refreshTable(CODE_LISTS[oEntry.entitySet].tableId);
                this.onCloseCodeListDialog();
            } catch (oError) {
                MessageBox.error(this._getErrorMessage(oError, "configValueSaveErrorMessage"));
            } finally {
                this.hideBusy();
            }
        },

        async onDeleteSelectedCodeList(oEvent) {
            const sEntitySet = oEvent.getSource().data("entitySet");
            const oTable = this.byId(CODE_LISTS[sEntitySet].tableId);
            const aCodes = oTable.getSelectedContexts().map((oContext) => oContext.getProperty("code"));

            if (!aCodes.length) {
                MessageToast.show(this.getText("selectItemsToDeleteMessage"));
                return;
            }

            const bConfirmed = await this._confirmDelete("deleteSelectedConfigValuesConfirmMessage", [aCodes.length]);

            if (!bConfirmed) {
                return;
            }

            this.showBusy();

            try {
                await Promise.all(aCodes.map((sCode) => this.removeEntry(this._codeListPath(sEntitySet, sCode))));
                MessageToast.show(this.getText("selectedConfigValuesDeletedMessage", [aCodes.length]));
                oTable.removeSelections(true);
                this._refreshTable(CODE_LISTS[sEntitySet].tableId);
            } catch (oError) {
                MessageBox.error(this._getErrorMessage(oError, "configValueDeleteErrorMessage"));
            } finally {
                this.hideBusy();
            }
        },

        onAddProcessStep() {
            const oEntry = this._emptyProcessStep();

            oEntry.dialogTitle = this.getText("addProcessStepButton");
            this.getView().getModel("stepEdit").setData(oEntry);
            this.byId("processStepDialog").open();
        },

        onEditProcessStep(oEvent) {
            const oEntry = oEvent.getSource().getBindingContext().getObject();

            this.getView().getModel("stepEdit").setData({
                ...oEntry,
                isEdit: true,
                dialogTitle: this.getText("editProcessStepButton")
            });
            this.byId("processStepDialog").open();
        },

        onCloseProcessStepDialog() {
            this.byId("processStepDialog").close();
        },

        async onSaveProcessStep() {
            const oEntry = this.getView().getModel("stepEdit").getData();

            if (!oEntry.processType_code || !oEntry.stepNo || !oEntry.stepName) {
                MessageBox.warning(this.getText("processStepRequiredMessage"));
                return;
            }

            const oPayload = {
                processType_code: oEntry.processType_code,
                stepNo: Number(oEntry.stepNo),
                stepName: oEntry.stepName,
                activityDescription: oEntry.activityDescription,
                role: oEntry.role,
                isMandatory: Boolean(oEntry.isMandatory),
                slaDays: this._optionalNumber(oEntry.slaDays),
                nextOnApprove: this._optionalNumber(oEntry.nextOnApprove),
                nextOnReject: this._optionalNumber(oEntry.nextOnReject)
            };

            this.showBusy();

            try {
                if (oEntry.isEdit) {
                    await this.updateEntry(`/ProcessStepConfig(guid'${oEntry.ID}')`, oPayload);
                    MessageToast.show(this.getText("processStepUpdatedMessage"));
                } else {
                    await this.createEntry("/ProcessStepConfig", oPayload);
                    MessageToast.show(this.getText("processStepCreatedMessage"));
                }

                this._refreshTable("configTable");
                this.onCloseProcessStepDialog();
            } catch (oError) {
                MessageBox.error(this._getErrorMessage(oError, "processStepSaveErrorMessage"));
            } finally {
                this.hideBusy();
            }
        },

        async onDeleteSelectedProcessSteps() {
            const oTable = this.byId("configTable");
            const aStepIds = oTable.getSelectedContexts().map((oContext) => oContext.getProperty("ID"));

            if (!aStepIds.length) {
                MessageToast.show(this.getText("selectItemsToDeleteMessage"));
                return;
            }

            const bConfirmed = await this._confirmDelete("deleteSelectedProcessStepsConfirmMessage", [aStepIds.length]);

            if (!bConfirmed) {
                return;
            }

            this.showBusy();

            try {
                await Promise.all(aStepIds.map((sStepId) => this.removeEntry(`/ProcessStepConfig(guid'${sStepId}')`)));
                MessageToast.show(this.getText("selectedProcessStepsDeletedMessage", [aStepIds.length]));
                oTable.removeSelections(true);
                this._refreshTable("configTable");
            } catch (oError) {
                MessageBox.error(this._getErrorMessage(oError, "processStepDeleteErrorMessage"));
            } finally {
                this.hideBusy();
            }
        },

        onAddSubType() {
            const oEntry = this._emptySubType();

            oEntry.dialogTitle = this.getText("addProcessSubTypeButton");
            this.getView().getModel("subTypeEdit").setData(oEntry);
            this.byId("processSubTypeDialog").open();
        },

        onEditSubType(oEvent) {
            const oEntry = oEvent.getSource().getBindingContext().getObject();

            this.getView().getModel("subTypeEdit").setData({
                ...oEntry,
                isEdit: true,
                dialogTitle: this.getText("editProcessSubTypeButton")
            });
            this.byId("processSubTypeDialog").open();
        },

        onCloseSubTypeDialog() {
            this.byId("processSubTypeDialog").close();
        },

        async onSaveSubType() {
            const oEntry = this.getView().getModel("subTypeEdit").getData();

            if (!oEntry.code || !oEntry.name || !oEntry.processType_code) {
                MessageBox.warning(this.getText("processSubTypeRequiredMessage"));
                return;
            }

            const oPayload = {
                code: oEntry.code,
                name: oEntry.name,
                descr: oEntry.descr,
                processType_code: oEntry.processType_code,
                processOwner: oEntry.processOwner,
                activityDescription: oEntry.activityDescription,
                sapTCode: oEntry.sapTCode
            };

            await this._saveConfigEntity({
                isEdit: oEntry.isEdit,
                createPath: "/ProcessSubTypes",
                updatePath: this._codeListPath("ProcessSubTypes", oEntry.code),
                payload: oPayload,
                successCreateKey: "processSubTypeCreatedMessage",
                successUpdateKey: "processSubTypeUpdatedMessage",
                errorKey: "processSubTypeSaveErrorMessage",
                tableId: "processSubTypesTable",
                close: () => this.onCloseSubTypeDialog()
            });
        },

        async onDeleteSelectedSubTypes() {
            await this._deleteSelectedByKey({
                tableId: "processSubTypesTable",
                path: (sCode) => this._codeListPath("ProcessSubTypes", sCode),
                keyProperty: "code",
                confirmKey: "deleteSelectedProcessSubTypesConfirmMessage",
                successKey: "selectedProcessSubTypesDeletedMessage",
                errorKey: "processSubTypeDeleteErrorMessage"
            });
        },

        onAddFieldCatalog() {
            const oEntry = this._emptyFieldCatalog();

            oEntry.dialogTitle = this.getText("addFieldCatalogButton");
            this.getView().getModel("fieldCatalogEdit").setData(oEntry);
            this.byId("fieldCatalogDialog").open();
        },

        onEditFieldCatalog(oEvent) {
            const oEntry = oEvent.getSource().getBindingContext().getObject();

            this.getView().getModel("fieldCatalogEdit").setData({
                ...oEntry,
                isEdit: true,
                dialogTitle: this.getText("editFieldCatalogButton"),
                inlineOptions: []
            });
            this._loadInlineFieldOptions(oEntry.fieldName);
            this.byId("fieldCatalogDialog").open();
        },

        onCloseFieldCatalogDialog() {
            this.byId("fieldCatalogDialog").close();
        },

        async onSaveFieldCatalog() {
            const oEntry = this.getView().getModel("fieldCatalogEdit").getData();

            if (!oEntry.fieldName || !oEntry.label || !oEntry.dataType) {
                MessageBox.warning(this.getText("fieldCatalogRequiredMessage"));
                return;
            }

            const aInlineOptions = oEntry.dataType === "List"
                ? (oEntry.inlineOptions || []).filter((oOption) => oOption.code || oOption.text)
                : [];
            const oInvalidOption = aInlineOptions.find((oOption) => !oOption.code || !oOption.text);

            if (oInvalidOption) {
                MessageBox.warning(this.getText("fieldOptionInlineRequiredMessage"));
                return;
            }

            const oPayload = {
                fieldName: oEntry.fieldName,
                label: oEntry.label,
                dataType: oEntry.dataType,
                defaultValue: oEntry.defaultValue,
                placeholder: oEntry.placeholder,
                inputHint: oEntry.inputHint
            };

            this.showBusy();

            try {
                if (oEntry.isEdit) {
                    await this.updateEntry(this._fieldCatalogPath(oEntry.fieldName), oPayload);
                    MessageToast.show(this.getText("fieldCatalogUpdatedMessage"));
                } else {
                    await this.createEntry("/ProcessRequestFieldCatalog", oPayload);
                    MessageToast.show(this.getText("fieldCatalogCreatedMessage"));
                }

                await this._saveInlineFieldOptions(oEntry.fieldName, aInlineOptions);
                this._refreshTable("fieldCatalogTable");
                this._refreshTable("fieldOptionsTable");
                this.onCloseFieldCatalogDialog();
            } catch (oError) {
                MessageBox.error(this._getErrorMessage(oError, "fieldCatalogSaveErrorMessage"));
            } finally {
                this.hideBusy();
            }
        },

        onAddInlineFieldOption() {
            const oModel = this.getView().getModel("fieldCatalogEdit");
            const aOptions = oModel.getProperty("/inlineOptions") || [];

            aOptions.push({
                code: "",
                text: "",
                sequence: aOptions.length + 1,
                isActive: true
            });
            oModel.setProperty("/inlineOptions", aOptions);
        },

        onDeleteInlineFieldOption(oEvent) {
            const oModel = this.getView().getModel("fieldCatalogEdit");
            const sPath = oEvent.getSource().getBindingContext("fieldCatalogEdit").getPath();
            const iIndex = Number(sPath.split("/").pop());
            const aOptions = oModel.getProperty("/inlineOptions") || [];

            aOptions.splice(iIndex, 1);
            oModel.setProperty("/inlineOptions", aOptions.map((oOption, iOptionIndex) => ({
                ...oOption,
                sequence: oOption.sequence || iOptionIndex + 1
            })));
        },

        async onDeleteSelectedFieldCatalog() {
            await this._deleteSelectedByKey({
                tableId: "fieldCatalogTable",
                path: (sFieldName) => this._fieldCatalogPath(sFieldName),
                keyProperty: "fieldName",
                confirmKey: "deleteSelectedFieldCatalogConfirmMessage",
                successKey: "selectedFieldCatalogDeletedMessage",
                errorKey: "fieldCatalogDeleteErrorMessage"
            });
        },

        onAddFieldMapping() {
            const oEntry = this._emptyFieldMapping();

            oEntry.dialogTitle = this.getText("addFieldVisibilityButton");
            this.getView().getModel("fieldMappingEdit").setData(oEntry);
            this.byId("fieldMappingDialog").open();
        },

        onEditFieldMapping(oEvent) {
            const oEntry = oEvent.getSource().getBindingContext().getObject();

            this.getView().getModel("fieldMappingEdit").setData({
                ...oEntry,
                isEdit: true,
                dialogTitle: this.getText("editFieldVisibilityButton")
            });
            this.byId("fieldMappingDialog").open();
        },

        onCloseFieldMappingDialog() {
            this.byId("fieldMappingDialog").close();
        },

        onFieldMappingFieldChanged(oEvent) {
            const oItem = oEvent.getParameter("selectedItem");
            const oContext = oItem?.getBindingContext();
            const oEditModel = this.getView().getModel("fieldMappingEdit");

            if (oContext) {
                oEditModel.setProperty("/field_fieldName", oContext.getProperty("fieldName"));
                oEditModel.setProperty("/fieldLabel", oContext.getProperty("label"));
            }
        },

        async onSaveFieldMapping() {
            const oEditModel = this.getView().getModel("fieldMappingEdit");
            const oEntry = oEditModel.getData();

            if (!oEntry.field_fieldName) {
                const oFieldSelect = this.byId("fieldMappingFieldSelect");
                const sSelectedFieldName = oFieldSelect?.getSelectedKey();
                const oSelectedContext = oFieldSelect?.getSelectedItem()?.getBindingContext();

                if (sSelectedFieldName) {
                    oEntry.field_fieldName = sSelectedFieldName;
                    oEditModel.setProperty("/field_fieldName", sSelectedFieldName);
                }

                if (!oEntry.fieldLabel && oSelectedContext) {
                    oEntry.fieldLabel = oSelectedContext.getProperty("label");
                    oEditModel.setProperty("/fieldLabel", oEntry.fieldLabel);
                }
            }

            if (!oEntry.processType_code || !oEntry.field_fieldName || !oEntry.fieldLabel) {
                MessageBox.warning(this.getText("fieldVisibilityRequiredMessage"));
                return;
            }

            const oPayload = {
                processType_code: oEntry.processType_code,
                processSubType_code: oEntry.processSubType_code || null,
                field_fieldName: oEntry.field_fieldName,
                fieldLabel: oEntry.fieldLabel,
                sourceColumn: oEntry.sourceColumn,
                section: oEntry.section,
                sequence: this._optionalNumber(oEntry.sequence),
                isMandatory: Boolean(oEntry.isMandatory),
                isVisible: Boolean(oEntry.isVisible)
            };

            await this._saveConfigEntity({
                isEdit: oEntry.isEdit,
                createPath: "/ProcessRequestFieldMappings",
                updatePath: `/ProcessRequestFieldMappings(guid'${oEntry.ID}')`,
                payload: oPayload,
                successCreateKey: "fieldVisibilityCreatedMessage",
                successUpdateKey: "fieldVisibilityUpdatedMessage",
                errorKey: "fieldVisibilitySaveErrorMessage",
                tableId: "fieldMappingsTable",
                close: () => this.onCloseFieldMappingDialog()
            });
        },

        async onDeleteSelectedFieldMappings() {
            await this._deleteSelectedByKey({
                tableId: "fieldMappingsTable",
                path: (sId) => `/ProcessRequestFieldMappings(guid'${sId}')`,
                keyProperty: "ID",
                confirmKey: "deleteSelectedFieldVisibilityConfirmMessage",
                successKey: "selectedFieldVisibilityDeletedMessage",
                errorKey: "fieldVisibilityDeleteErrorMessage"
            });
        },

        onAddFieldOption() {
            const oEntry = this._emptyFieldOption();

            oEntry.dialogTitle = this.getText("addFieldOptionButton");
            this.getView().getModel("fieldOptionEdit").setData(oEntry);
            this.byId("fieldOptionDialog").open();
        },

        onEditFieldOption(oEvent) {
            const oEntry = oEvent.getSource().getBindingContext().getObject();

            this.getView().getModel("fieldOptionEdit").setData({
                ...oEntry,
                isEdit: true,
                dialogTitle: this.getText("editFieldOptionButton")
            });
            this.byId("fieldOptionDialog").open();
        },

        onCloseFieldOptionDialog() {
            this.byId("fieldOptionDialog").close();
        },

        async onSaveFieldOption() {
            const oEntry = this.getView().getModel("fieldOptionEdit").getData();

            if (!oEntry.field_fieldName || !oEntry.code || !oEntry.text) {
                MessageBox.warning(this.getText("fieldOptionRequiredMessage"));
                return;
            }

            const oPayload = {
                field_fieldName: oEntry.field_fieldName,
                code: oEntry.code,
                text: oEntry.text,
                sequence: this._optionalNumber(oEntry.sequence),
                isActive: Boolean(oEntry.isActive)
            };

            await this._saveConfigEntity({
                isEdit: oEntry.isEdit,
                createPath: "/ProcessRequestFieldOptions",
                updatePath: `/ProcessRequestFieldOptions(guid'${oEntry.ID}')`,
                payload: oPayload,
                successCreateKey: "fieldOptionCreatedMessage",
                successUpdateKey: "fieldOptionUpdatedMessage",
                errorKey: "fieldOptionSaveErrorMessage",
                tableId: "fieldOptionsTable",
                close: () => this.onCloseFieldOptionDialog()
            });
        },

        async onDeleteSelectedFieldOptions() {
            await this._deleteSelectedByKey({
                tableId: "fieldOptionsTable",
                path: (sId) => `/ProcessRequestFieldOptions(guid'${sId}')`,
                keyProperty: "ID",
                confirmKey: "deleteSelectedFieldOptionsConfirmMessage",
                successKey: "selectedFieldOptionsDeletedMessage",
                errorKey: "fieldOptionDeleteErrorMessage"
            });
        },

        _emptyCodeList() {
            return {
                entitySet: "",
                dialogTitle: "",
                isEdit: false,
                code: "",
                name: "",
                descr: ""
            };
        },

        _emptyProcessStep() {
            return {
                dialogTitle: "",
                isEdit: false,
                processType_code: "",
                stepNo: "",
                stepName: "",
                activityDescription: "",
                role: "",
                isMandatory: true,
                slaDays: "",
                nextOnApprove: "",
                nextOnReject: ""
            };
        },

        _emptySubType() {
            return {
                dialogTitle: "",
                isEdit: false,
                code: "",
                name: "",
                descr: "",
                processType_code: "",
                processOwner: "",
                activityDescription: "",
                sapTCode: ""
            };
        },

        _emptyFieldCatalog() {
            return {
                dialogTitle: "",
                isEdit: false,
                fieldName: "",
                label: "",
                dataType: "String",
                defaultValue: "",
                placeholder: "",
                inputHint: "",
                inlineOptions: []
            };
        },

        _emptyFieldOption() {
            return {
                dialogTitle: "",
                isEdit: false,
                field_fieldName: "",
                code: "",
                text: "",
                sequence: "",
                isActive: true
            };
        },

        _emptyFieldMapping() {
            return {
                dialogTitle: "",
                isEdit: false,
                processType_code: "",
                processSubType_code: "",
                field_fieldName: "",
                fieldLabel: "",
                sourceColumn: "",
                section: "IV_REQUEST_SUBMISSION",
                sequence: "",
                isMandatory: false,
                isVisible: true
            };
        },

        _codeListPath(sEntitySet, sCode) {
            return `/${sEntitySet}('${String(sCode).replace(/'/g, "''")}')`;
        },

        _fieldCatalogPath(sFieldName) {
            return `/ProcessRequestFieldCatalog('${String(sFieldName).replace(/'/g, "''")}')`;
        },

        _optionalNumber(vValue) {
            return vValue === "" || vValue === null || vValue === undefined ? null : Number(vValue);
        },

        _refreshTable(sTableId) {
            this.byId(sTableId).getBinding("items")?.refresh();
        },

        async _loadInlineFieldOptions(sFieldName) {
            const oModel = this.getView().getModel("fieldCatalogEdit");

            if (!sFieldName) {
                oModel.setProperty("/inlineOptions", []);
                return;
            }

            try {
                const aOptions = await this._readList("/ProcessRequestFieldOptions", {
                    filters: [new Filter("field_fieldName", FilterOperator.EQ, sFieldName)],
                    urlParameters: {
                        "$orderby": "sequence asc"
                    }
                });

                oModel.setProperty("/inlineOptions", aOptions.map((oOption) => ({
                    ID: oOption.ID,
                    code: oOption.code,
                    text: oOption.text,
                    sequence: oOption.sequence,
                    isActive: oOption.isActive
                })));
            } catch (oError) {
                oModel.setProperty("/inlineOptions", []);
            }
        },

        async _saveInlineFieldOptions(sFieldName, aOptions) {
            const aExistingOptions = await this._readList("/ProcessRequestFieldOptions", {
                filters: [new Filter("field_fieldName", FilterOperator.EQ, sFieldName)]
            });
            const aSubmittedIds = aOptions.map((oOption) => oOption.ID).filter(Boolean);
            const aRemovedOptions = aExistingOptions.filter((oOption) => !aSubmittedIds.includes(oOption.ID));

            await Promise.all(aRemovedOptions.map((oOption) =>
                this.removeEntry(`/ProcessRequestFieldOptions(guid'${oOption.ID}')`)
            ));

            await Promise.all(aOptions.map((oOption, iIndex) => {
                const oPayload = {
                    field_fieldName: sFieldName,
                    code: oOption.code,
                    text: oOption.text,
                    sequence: this._optionalNumber(oOption.sequence) || iIndex + 1,
                    isActive: Boolean(oOption.isActive)
                };

                return oOption.ID
                    ? this.updateEntry(`/ProcessRequestFieldOptions(guid'${oOption.ID}')`, oPayload)
                    : this.createEntry("/ProcessRequestFieldOptions", oPayload);
            }));
        },

        _filterTable(oEvent, sTableId, aProperties) {
            const sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
            const oBinding = this.byId(sTableId).getBinding("items");

            if (!sQuery) {
                oBinding.filter([]);
                return;
            }

            oBinding.filter([
                new Filter({
                    filters: aProperties.map((sProperty) => new Filter(sProperty, FilterOperator.Contains, sQuery)),
                    and: false
                })
            ]);
        },

        _readList(sPath, oParameters) {
            return new Promise((resolve, reject) => {
                this.getModel().read(sPath, {
                    ...(oParameters || {}),
                    success: (oData) => resolve(oData.results || []),
                    error: reject
                });
            });
        },

        async _saveConfigEntity(oOptions) {
            this.showBusy();

            try {
                if (oOptions.isEdit) {
                    await this.updateEntry(oOptions.updatePath, oOptions.payload);
                    MessageToast.show(this.getText(oOptions.successUpdateKey));
                } else {
                    await this.createEntry(oOptions.createPath, oOptions.payload);
                    MessageToast.show(this.getText(oOptions.successCreateKey));
                }

                this._refreshTable(oOptions.tableId);
                oOptions.close();
            } catch (oError) {
                MessageBox.error(this._getErrorMessage(oError, oOptions.errorKey));
            } finally {
                this.hideBusy();
            }
        },

        async _deleteSelectedByKey(oOptions) {
            const oTable = this.byId(oOptions.tableId);
            const aKeys = oTable.getSelectedContexts().map((oContext) => oContext.getProperty(oOptions.keyProperty));

            if (!aKeys.length) {
                MessageToast.show(this.getText("selectItemsToDeleteMessage"));
                return;
            }

            const bConfirmed = await this._confirmDelete(oOptions.confirmKey, [aKeys.length]);

            if (!bConfirmed) {
                return;
            }

            this.showBusy();

            try {
                await Promise.all(aKeys.map((sKey) => this.removeEntry(oOptions.path(sKey))));
                MessageToast.show(this.getText(oOptions.successKey, [aKeys.length]));
                oTable.removeSelections(true);
                this._refreshTable(oOptions.tableId);
            } catch (oError) {
                MessageBox.error(this._getErrorMessage(oError, oOptions.errorKey));
            } finally {
                this.hideBusy();
            }
        },

        _confirmDelete(sMessageKey, aArguments) {
            return new Promise((resolve) => {
                MessageBox.confirm(this.getText(sMessageKey, aArguments), {
                    actions: [MessageBox.Action.DELETE, MessageBox.Action.CANCEL],
                    emphasizedAction: MessageBox.Action.DELETE,
                    onClose: (sAction) => resolve(sAction === MessageBox.Action.DELETE)
                });
            });
        },

        _getErrorMessage(oError, sFallbackKey) {
            try {
                return JSON.parse(oError.responseText).error.message.value || this.getText(sFallbackKey);
            } catch (oParseError) {
                return oError.message || this.getText(sFallbackKey);
            }
        }
    });
});
