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
        PaymentCategories: { tableId: "paymentCategoriesTable", titleKey: "paymentCategoriesConfigTitle" },
        FtkEntities: { tableId: "ftkEntitiesTable", titleKey: "ftkEntitiesConfigTitle" },
        Priorities: { tableId: "prioritiesTable", titleKey: "prioritiesConfigTitle" },
        ProcessStatus: { tableId: "processStatusTable", titleKey: "processStatusesConfigTitle" },
        TaskStatus: { tableId: "taskStatusTable", titleKey: "taskStatusesConfigTitle" },
        RequestDropDown: { tableId: "requestDropDownTable", titleKey: "requestDropdownConfigTitle" },
        Roles: { tableId: "rolesTable", titleKey: "rolesConfigTitle" }
    };

    return BaseController.extend("flowmate.controller.AdminProcessConfig", {
        onInit() {
            this.getView().setModel(new JSONModel(this._emptyCodeList()), "configEdit");
            this.getView().setModel(new JSONModel(this._emptyProcessStep()), "stepEdit");
            this.getView().setModel(new JSONModel(this._emptySubType()), "subTypeEdit");
            this.getView().setModel(new JSONModel(this._emptyVendor()), "vendorEdit");
            this.getView().setModel(new JSONModel(this._emptyLoaApproval()), "loaApprovalEdit");
            this.getView().setModel(new JSONModel(this._emptyWorkingCalendar()), "calendarEdit");
            this.getView().setModel(new JSONModel(this._emptyHoliday()), "holidayEdit");
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
                        new Filter("subProcessType_code", FilterOperator.Contains, sQuery),
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

        onSearchVendors(oEvent) {
            this._filterTable(oEvent, "vendorsTable", [
                "vendorCode",
                "vendorName",
                "vendorEmail"
            ]);
        },

        onSearchLoa(oEvent) {
            this._filterTable(oEvent, "loaApprovalTable", [
                "operator_code",
                "roleCode"
            ]);
        },

        onSearchEmailNotifications(oEvent) {
            this._filterTable(oEvent, "emailNotificationLogTable", [
                "referenceNumber",
                "toRecipients",
                "subject",
                "status",
                "interfaceSystem",
                "errorMessage"
            ]);
        },

        onRefreshEmailNotifications() {
            this._refreshTable("emailNotificationLogTable");
        },

        onAddWorkingCalendar() {
            const oEntry = this._emptyWorkingCalendar();
            oEntry.dialogTitle = this.getText("addWorkingCalendarButton");
            this.getView().getModel("calendarEdit").setData(oEntry);
            this.byId("workingCalendarDialog").open();
        },

        async onEditWorkingCalendar(oEvent) {
            const oEntry = oEvent.getSource().getBindingContext().getObject();
            this.showBusy();
            try {
                const aSavedDays = await this._readList("/WorkingCalendarDays", {
                    filters: [new Filter("calendar_ID", FilterOperator.EQ, oEntry.ID)]
                });
                const aDefaults = this._defaultCalendarDays();
                const aDays = aDefaults.map((oDefault) => {
                    const oSaved = aSavedDays.find((oDay) => Number(oDay.dayOfWeek) === oDefault.dayOfWeek);
                    return oSaved ? {
                        ...oDefault,
                        ...oSaved,
                        startTime: this._normalizeTime(oSaved.startTime),
                        endTime: this._normalizeTime(oSaved.endTime)
                    } : oDefault;
                });
                this.getView().getModel("calendarEdit").setData({
                    ...oEntry,
                    isEdit: true,
                    dialogTitle: this.getText("editWorkingCalendarButton"),
                    days: aDays
                });
                this.byId("workingCalendarDialog").open();
            } catch (oError) {
                MessageBox.error(this._getErrorMessage(oError, "workingCalendarLoadErrorMessage"));
            } finally {
                this.hideBusy();
            }
        },

        onCloseWorkingCalendarDialog() {
            this.byId("workingCalendarDialog").close();
        },

        async onSaveWorkingCalendar() {
            const oEntry = this.getView().getModel("calendarEdit").getData();
            if (!String(oEntry.code || "").trim() || !String(oEntry.name || "").trim() || !String(oEntry.timeZone || "").trim()) {
                MessageBox.warning(this.getText("workingCalendarRequiredMessage"));
                return;
            }
            const oInvalidDay = oEntry.days.find((oDay) => oDay.isWorkingDay
                && (!oDay.startTime || !oDay.endTime || oDay.startTime >= oDay.endTime));
            if (oInvalidDay) {
                MessageBox.warning(this.getText("workingCalendarHoursInvalidMessage", [oInvalidDay.dayName]));
                return;
            }

            this.showBusy();
            try {
                const oPayload = {
                    code: String(oEntry.code).trim().toUpperCase(),
                    name: String(oEntry.name).trim(),
                    timeZone: String(oEntry.timeZone).trim(),
                    isDefault: Boolean(oEntry.isDefault),
                    isActive: Boolean(oEntry.isActive)
                };
                let sCalendarId = oEntry.ID;
                if (oEntry.isEdit) {
                    await this.updateEntry(`/WorkingCalendars(guid'${sCalendarId}')`, oPayload);
                } else {
                    const oCreated = await this.createEntry("/WorkingCalendars", oPayload);
                    sCalendarId = oCreated.ID;
                }
                await Promise.all(oEntry.days.map((oDay) => {
                    const oDayPayload = {
                        calendar_ID: sCalendarId,
                        dayOfWeek: Number(oDay.dayOfWeek),
                        isWorkingDay: Boolean(oDay.isWorkingDay),
                        startTime: oDay.isWorkingDay ? this._toODataTime(oDay.startTime) : null,
                        endTime: oDay.isWorkingDay ? this._toODataTime(oDay.endTime) : null
                    };
                    return oDay.ID
                        ? this.updateEntry(`/WorkingCalendarDays(guid'${oDay.ID}')`, oDayPayload)
                        : this.createEntry("/WorkingCalendarDays", oDayPayload);
                }));
                await this._recalculateCalendarSla(sCalendarId);
                MessageToast.show(this.getText(oEntry.isEdit ? "workingCalendarUpdatedMessage" : "workingCalendarCreatedMessage"));
                this._refreshTable("workingCalendarsTable");
                this.onCloseWorkingCalendarDialog();
            } catch (oError) {
                MessageBox.error(this._getErrorMessage(oError, "workingCalendarSaveErrorMessage"));
            } finally {
                this.hideBusy();
            }
        },

        async onDeleteSelectedWorkingCalendars() {
            await this._deleteSelectedByKey({
                tableId: "workingCalendarsTable",
                path: (sId) => `/WorkingCalendars(guid'${sId}')`,
                keyProperty: "ID",
                confirmKey: "deleteWorkingCalendarsConfirmMessage",
                successKey: "workingCalendarsDeletedMessage",
                errorKey: "workingCalendarDeleteErrorMessage"
            });
        },

        onAddHoliday() {
            const oEntry = this._emptyHoliday();
            oEntry.dialogTitle = this.getText("addHolidayButton");
            this.getView().getModel("holidayEdit").setData(oEntry);
            this.byId("holidayDialog").open();
        },

        onEditHoliday(oEvent) {
            const oEntry = oEvent.getSource().getBindingContext().getObject();
            this.getView().getModel("holidayEdit").setData({
                ...oEntry,
                startTime: this._normalizeTime(oEntry.startTime),
                endTime: this._normalizeTime(oEntry.endTime),
                isEdit: true,
                dialogTitle: this.getText("editHolidayButton")
            });
            this.byId("holidayDialog").open();
        },

        onCloseHolidayDialog() {
            this.byId("holidayDialog").close();
        },

        async onSaveHoliday() {
            const oEntry = this.getView().getModel("holidayEdit").getData();
            if (!oEntry.calendar_ID || !oEntry.holidayDate || !String(oEntry.name || "").trim()) {
                MessageBox.warning(this.getText("holidayRequiredMessage"));
                return;
            }
            if (oEntry.isWorkingDay && (!oEntry.startTime || !oEntry.endTime || oEntry.startTime >= oEntry.endTime)) {
                MessageBox.warning(this.getText("holidayHoursInvalidMessage"));
                return;
            }
            await this._saveConfigEntity({
                isEdit: oEntry.isEdit,
                createPath: "/WorkingCalendarHolidays",
                updatePath: `/WorkingCalendarHolidays(guid'${oEntry.ID}')`,
                payload: {
                    calendar_ID: oEntry.calendar_ID,
                    holidayDate: oEntry.holidayDate,
                    name: String(oEntry.name).trim(),
                    isWorkingDay: Boolean(oEntry.isWorkingDay),
                    startTime: oEntry.isWorkingDay ? this._toODataTime(oEntry.startTime) : null,
                    endTime: oEntry.isWorkingDay ? this._toODataTime(oEntry.endTime) : null,
                    isActive: Boolean(oEntry.isActive),
                    notes: oEntry.notes
                },
                successCreateKey: "holidayCreatedMessage",
                successUpdateKey: "holidayUpdatedMessage",
                errorKey: "holidaySaveErrorMessage",
                tableId: "workingCalendarHolidaysTable",
                afterSave: () => this._recalculateCalendarSla(oEntry.calendar_ID),
                close: () => this.onCloseHolidayDialog()
            });
        },

        async onDeleteSelectedHolidays() {
            await this._deleteSelectedByKey({
                tableId: "workingCalendarHolidaysTable",
                path: (sId) => `/WorkingCalendarHolidays(guid'${sId}')`,
                keyProperty: "ID",
                confirmKey: "deleteHolidaysConfirmMessage",
                successKey: "holidaysDeletedMessage",
                errorKey: "holidayDeleteErrorMessage",
                afterDelete: (aContexts) => Promise.all([...new Set(aContexts.map((oContext) => oContext.getProperty("calendar_ID")).filter(Boolean))]
                    .map((sCalendarId) => this._recalculateCalendarSla(sCalendarId)))
            });
        },

        async _recalculateCalendarSla(sCalendarId) {
            if (!sCalendarId) return;
            await this.callAction("recalculateOpenSlaDeadlines", { calendarId: sCalendarId });
        },

        onAddLoaApproval() {
            const oEntry = this._emptyLoaApproval();

            oEntry.dialogTitle = this.getText("addLoaApprovalButton");
            this.getView().getModel("loaApprovalEdit").setData(oEntry);
            this.byId("loaApprovalDialog").open();
        },

        onEditLoaApproval(oEvent) {
            const oEntry = oEvent.getSource().getBindingContext().getObject();

            this.getView().getModel("loaApprovalEdit").setData({
                ...oEntry,
                isEdit: true,
                dialogTitle: this.getText("editLoaApprovalButton")
            });
            this.byId("loaApprovalDialog").open();
        },

        onCloseLoaApprovalDialog() {
            this.byId("loaApprovalDialog").close();
        },

        async onSaveLoaApproval() {
            const oEntry = this.getView().getModel("loaApprovalEdit").getData();
            const fAmount = Number(oEntry.amount);
            const sOperator = String(oEntry.operator_code || "").trim();
            const sRoleCode = String(oEntry.roleCode || "").trim();

            if (oEntry.amount === "" || !Number.isFinite(fAmount) || !sOperator || !sRoleCode) {
                MessageBox.warning(this.getText("loaApprovalRequiredMessage"));
                return;
            }

            await this._saveConfigEntity({
                isEdit: oEntry.isEdit,
                createPath: "/LoaApproval",
                updatePath: `/LoaApproval(guid'${oEntry.ID}')`,
                payload: {
                    amount: fAmount,
                    operator_code: sOperator,
                    roleCode: sRoleCode
                },
                successCreateKey: "loaApprovalCreatedMessage",
                successUpdateKey: "loaApprovalUpdatedMessage",
                errorKey: "loaApprovalSaveErrorMessage",
                tableId: "loaApprovalTable",
                close: () => this.onCloseLoaApprovalDialog()
            });
        },

        async onDeleteSelectedLoaApprovals() {
            await this._deleteSelectedByKey({
                tableId: "loaApprovalTable",
                path: (sId) => `/LoaApproval(guid'${sId}')`,
                keyProperty: "ID",
                confirmKey: "deleteSelectedLoaApprovalsConfirmMessage",
                successKey: "selectedLoaApprovalsDeletedMessage",
                errorKey: "loaApprovalDeleteErrorMessage"
            });
        },

        onAddVendor() {
            const oEntry = this._emptyVendor();

            oEntry.dialogTitle = this.getText("addVendorButton");
            this.getView().getModel("vendorEdit").setData(oEntry);
            this.byId("vendorDialog").open();
        },

        onEditVendor(oEvent) {
            const oEntry = oEvent.getSource().getBindingContext().getObject();

            this.getView().getModel("vendorEdit").setData({
                ...oEntry,
                isEdit: true,
                dialogTitle: this.getText("editVendorButton")
            });
            this.byId("vendorDialog").open();
        },

        onCloseVendorDialog() {
            this.byId("vendorDialog").close();
        },

        async onSaveVendor() {
            const oEntry = this.getView().getModel("vendorEdit").getData();
            const sVendorCode = String(oEntry.vendorCode || "").trim();
            const sVendorName = String(oEntry.vendorName || "").trim();
            const sVendorEmail = String(oEntry.vendorEmail || "").trim();

            if (!sVendorCode || !sVendorName) {
                MessageBox.warning(this.getText("vendorRequiredMessage"));
                return;
            }

            if (sVendorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sVendorEmail)) {
                MessageBox.warning(this.getText("vendorEmailInvalidMessage"));
                return;
            }

            await this._saveConfigEntity({
                isEdit: oEntry.isEdit,
                createPath: "/Vendors",
                updatePath: `/Vendors(guid'${oEntry.ID}')`,
                payload: {
                    vendorCode: sVendorCode,
                    vendorName: sVendorName,
                    vendorEmail: sVendorEmail || null
                },
                successCreateKey: "vendorCreatedMessage",
                successUpdateKey: "vendorUpdatedMessage",
                errorKey: "vendorSaveErrorMessage",
                tableId: "vendorsTable",
                close: () => this.onCloseVendorDialog()
            });
        },

        async onDeleteSelectedVendors() {
            await this._deleteSelectedByKey({
                tableId: "vendorsTable",
                path: (sId) => `/Vendors(guid'${sId}')`,
                keyProperty: "ID",
                confirmKey: "deleteSelectedVendorsConfirmMessage",
                successKey: "selectedVendorsDeletedMessage",
                errorKey: "vendorDeleteErrorMessage"
            });
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

            if (!oEntry.subProcessType_code || !oEntry.stepNo || !oEntry.stepName) {
                MessageBox.warning(this.getText("processStepRequiredMessage"));
                return;
            }

            const oPayload = {
                subProcessType_code: oEntry.subProcessType_code,
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
                workingCalendar_ID: oEntry.workingCalendar_ID || null,
                loaApprovalApplicable: Boolean(oEntry.loaApprovalApplicable),
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
                subProcessType_code: "",
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
                workingCalendar_ID: "",
                loaApprovalApplicable: false,
                processOwner: "",
                activityDescription: "",
                sapTCode: ""
            };
        },

        _emptyWorkingCalendar() {
            return {
                dialogTitle: "",
                isEdit: false,
                ID: "",
                code: "",
                name: "",
                timeZone: "Asia/Colombo",
                isDefault: false,
                isActive: true,
                days: this._defaultCalendarDays()
            };
        },

        _defaultCalendarDays() {
            return [
                "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
            ].map((sDayName, iIndex) => ({
                ID: "",
                dayOfWeek: iIndex + 1,
                dayName: sDayName,
                isWorkingDay: iIndex < 5,
                startTime: "09:00:00",
                endTime: "18:00:00"
            }));
        },

        _emptyHoliday() {
            return {
                dialogTitle: "",
                isEdit: false,
                ID: "",
                calendar_ID: "",
                holidayDate: "",
                name: "",
                isWorkingDay: false,
                startTime: "09:00:00",
                endTime: "18:00:00",
                isActive: true,
                notes: ""
            };
        },

        _normalizeTime(vTime) {
            if (vTime && typeof vTime === "object" && Number.isFinite(vTime.ms)) {
                const iTotalSeconds = Math.floor(vTime.ms / 1000);
                return `${String(Math.floor(iTotalSeconds / 3600)).padStart(2, "0")}:${String(Math.floor((iTotalSeconds % 3600) / 60)).padStart(2, "0")}:${String(iTotalSeconds % 60).padStart(2, "0")}`;
            }
            const sTime = String(vTime || "");
            const oDurationMatch = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(sTime);
            if (oDurationMatch) {
                return `${String(oDurationMatch[1] || 0).padStart(2, "0")}:${String(oDurationMatch[2] || 0).padStart(2, "0")}:${String(oDurationMatch[3] || 0).padStart(2, "0")}`;
            }
            return sTime.slice(0, 8);
        },

        _toODataTime(vTime) {
            const [iHours, iMinutes, iSeconds = 0] = String(vTime || "00:00:00").split(":").map(Number);
            return {
                __edmType: "Edm.Time",
                ms: (((iHours * 60) + iMinutes) * 60 + iSeconds) * 1000
            };
        },

        _emptyVendor() {
            return {
                dialogTitle: "",
                isEdit: false,
                ID: "",
                vendorCode: "",
                vendorName: "",
                vendorEmail: ""
            };
        },

        _emptyLoaApproval() {
            return {
                dialogTitle: "",
                isEdit: false,
                ID: "",
                amount: "",
                operator_code: "",
                roleCode: ""
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
                    filters: aProperties.map((sProperty) => new Filter({
                        path: sProperty,
                        operator: FilterOperator.Contains,
                        value1: sQuery,
                        caseSensitive: false
                    })),
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

                if (oOptions.afterSave) {
                    await oOptions.afterSave();
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
            const aContexts = oTable.getSelectedContexts();
            const aKeys = aContexts.map((oContext) => oContext.getProperty(oOptions.keyProperty));

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
                if (oOptions.afterDelete) {
                    await oOptions.afterDelete(aContexts);
                }
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
            return this.getErrorMessage(oError, this.getText(sFallbackKey));
        }
    });
});
