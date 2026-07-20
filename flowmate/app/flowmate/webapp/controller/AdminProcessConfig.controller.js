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
                        new Filter("processorTeamName", FilterOperator.Contains, sQuery),
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
                processorTeam_ID: oEntry.processorTeam_ID || null,
                processorTeamName: oEntry.processorTeamName || null,
                role: oEntry.role,
                slaDays: this._optionalNumber(oEntry.slaDays)
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

        onStepTeamValueHelpRequest() {
            this.byId("processStepTeamValueHelpDialog").open();
        },

        onStepTeamSuggestionSelected(oEvent) {
            const oContext = this._getSuggestionContext(oEvent);

            if (!oContext) {
                return;
            }

            const oModel = this.getView().getModel("stepEdit");
            oModel.setProperty("/processorTeam_ID", oContext.getProperty("ID"));
            oModel.setProperty("/processorTeamName", oContext.getProperty("name"));
        },

        onStepTeamLiveChange() {
            this.getView().getModel("stepEdit").setProperty("/processorTeam_ID", "");
        },

        onStepTeamValueHelpSearch(oEvent) {
            const sQuery = oEvent.getParameter("value") || "";
            const oBinding = oEvent.getSource().getBinding("items");

            if (!sQuery) {
                oBinding.filter([]);
                return;
            }

            oBinding.filter([
                new Filter({
                    filters: [
                        new Filter("teamCode", FilterOperator.Contains, sQuery),
                        new Filter("name", FilterOperator.Contains, sQuery),
                        new Filter("description", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                })
            ]);
        },

        onStepTeamValueHelpConfirm(oEvent) {
            const oContext = oEvent.getParameter("selectedItem")?.getBindingContext();

            if (!oContext) {
                return;
            }

            const oModel = this.getView().getModel("stepEdit");
            oModel.setProperty("/processorTeam_ID", oContext.getProperty("ID"));
            oModel.setProperty("/processorTeamName", oContext.getProperty("name"));
            this.onStepTeamValueHelpClose(oEvent);
        },

        onStepTeamValueHelpClose(oEvent) {
            oEvent.getSource().getBinding("items")?.filter([]);
        },

        onClearStepProcessorTeam() {
            const oModel = this.getView().getModel("stepEdit");
            oModel.setProperty("/processorTeam_ID", "");
            oModel.setProperty("/processorTeamName", "");
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
                processorTeam_ID: "",
                processorTeamName: "",
                role: "",
                slaDays: ""
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

        _codeListPath(sEntitySet, sCode) {
            return `/${sEntitySet}('${String(sCode).replace(/'/g, "''")}')`;
        },

        _optionalNumber(vValue) {
            return vValue === "" || vValue === null || vValue === undefined ? null : Number(vValue);
        },

        _refreshTable(sTableId) {
            this.byId(sTableId).getBinding("items")?.refresh();
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
