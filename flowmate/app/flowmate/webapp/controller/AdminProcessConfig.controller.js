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

        _codeListPath(sEntitySet, sCode) {
            return `/${sEntitySet}('${String(sCode).replace(/'/g, "''")}')`;
        },

        _optionalNumber(vValue) {
            return vValue === "" || vValue === null || vValue === undefined ? null : Number(vValue);
        },

        _refreshTable(sTableId) {
            this.byId(sTableId).getBinding("items")?.refresh();
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
