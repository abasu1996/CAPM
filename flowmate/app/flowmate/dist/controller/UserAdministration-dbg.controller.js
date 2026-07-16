sap.ui.define([
    "flowmate/controller/BaseController",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "sap/ui/model/json/JSONModel"
], (BaseController, MessageBox, MessageToast, Filter, FilterOperator, Sorter, JSONModel) => {
    "use strict";

    return BaseController.extend("flowmate.controller.UserAdministration", {
        onInit() {
            this.getView().setModel(new JSONModel(this._emptyUser()), "userEdit");
            this.getView().setModel(new JSONModel(this._emptyTeam()), "teamEdit");
            this.getView().setModel(new JSONModel({
                teamId: "",
                teamName: "",
                members: []
            }), "teamMembers");
            this.getView().setModel(new JSONModel({
                nodes: []
            }), "orgTree");
            this.getView().setModel(new JSONModel({
                isEdit: false,
                canMaintainUsers: false
            }), "userAdmin");
            this.getRouter().getRoute("RouteUserAdministration").attachPatternMatched(this.onRouteMatched, this);
        },

        async onRouteMatched() {
            if (!await this.requireAdministrator()) {
                return;
            }

            this.setOneColumnLayout();

            try {
                const oCapabilities = await this.callAction("getUserAdministrationCapabilities");
                this.getView().getModel("userAdmin").setProperty("/canMaintainUsers", oCapabilities.canMaintainUsers);
            } catch (oError) {
                this.getView().getModel("userAdmin").setProperty("/canMaintainUsers", false);
            }

            await this._loadOrgTree();
        },

        onSearch(oEvent) {
            const sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
            const oBinding = this.byId("usersTable").getBinding("items");

            if (!sQuery) {
                oBinding.filter([]);
                return;
            }

            oBinding.filter([
                new Filter({
                    filters: [
                        new Filter("referenceNumber", FilterOperator.Contains, sQuery),
                        new Filter("displayName", FilterOperator.Contains, sQuery),
                        new Filter("email", FilterOperator.Contains, sQuery),
                        new Filter("userPrincipalName", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                })
            ]);
        },

        onSearchTeams(oEvent) {
            const sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
            this._applyOrgTreeFilter(sQuery);
        },

        onOpenCreateDialog() {
            this.getView().getModel("userEdit").setData(this._emptyUser());
            this.getView().getModel("userAdmin").setProperty("/isEdit", false);
            this.byId("userDialog").open();
        },

        async onOpenEditDialog(oEvent) {
            const oUser = oEvent.getSource().getBindingContext().getObject();
            const oEditUser = {
                ...this._emptyUser(),
                ...oUser,
                managerName: oUser.manager?.displayName || ""
            };

            this.showBusy();

            try {
                const aMemberships = await this._readEntries("/TeamMembers", {
                    filters: [new Filter("user_ID", FilterOperator.EQ, oUser.ID)]
                });
                const oMembership = aMemberships[0];

                if (oMembership) {
                    const oTeam = this._aTeams?.find((oCandidate) => oCandidate.ID === oMembership.team_ID);
                    oEditUser.team_ID = oMembership.team_ID;
                    oEditUser.teamName = oTeam?.name || oTeam?.teamCode || "";
                }

                oEditUser.teamIds = aMemberships.map((oMembershipItem) => oMembershipItem.team_ID);
            } catch (oError) {
                MessageToast.show(this._getErrorMessage(oError));
            } finally {
                this.hideBusy();
            }

            this.getView().getModel("userEdit").setData(oEditUser);
            this.getView().getModel("userAdmin").setProperty("/isEdit", true);
            this.byId("userDialog").open();
        },

        onCloseDialog() {
            this.byId("userDialog").close();
        },

        async onSaveUser() {
            const oUser = this.getView().getModel("userEdit").getData();
            const bIsEdit = this.getView().getModel("userAdmin").getProperty("/isEdit");

            if (!oUser.displayName || !oUser.email || !oUser.userPrincipalName) {
                MessageBox.warning(this.getText("userRequiredMessage"));
                return;
            }

            this.showBusy();

            try {
                const oPayload = {
                    azureObjectId: oUser.azureObjectId,
                    userPrincipalName: oUser.userPrincipalName,
                    displayName: oUser.displayName,
                    email: oUser.email,
                    manager_ID: oUser.manager_ID || null,
                    isActive: oUser.isActive
                };

                const aTeamIds = [...new Set([
                    ...(bIsEdit ? oUser.teamIds || [] : []),
                    oUser.team_ID
                ].filter(Boolean))];
                const oSavedUser = await this.callAction("createUserWithTeams", {
                    userId: bIsEdit ? oUser.ID : null,
                    azureObjectId: oPayload.azureObjectId || null,
                    userPrincipalName: oPayload.userPrincipalName,
                    displayName: oPayload.displayName,
                    email: oPayload.email,
                    managerId: oPayload.manager_ID,
                    teamIds: aTeamIds,
                    isActive: oPayload.isActive
                });

                MessageToast.show(this.getText(bIsEdit ? "userUpdatedMessage" : "userCreatedMessage"));
                this._refreshItemsBinding("usersTable");
                await this._loadOrgTree();
                this.onCloseDialog();
            } catch (oError) {
                MessageBox.error(this._getErrorMessage(oError));
            } finally {
                this.hideBusy();
            }
        },

        onOpenUserTeamValueHelpRequest() {
            this.byId("userTeamValueHelpDialog").open();
        },

        onUserTeamValueHelpSearch(oEvent) {
            this._filterTeams(oEvent.getSource(), oEvent.getParameter("value") || "");
        },

        onUserTeamValueHelpConfirm(oEvent) {
            const oContext = oEvent.getParameter("selectedItem")?.getBindingContext();

            if (oContext) {
                const oModel = this.getView().getModel("userEdit");
                oModel.setProperty("/team_ID", oContext.getProperty("ID"));
                oModel.setProperty("/teamName", oContext.getProperty("name") || oContext.getProperty("teamCode"));
            }

            this.onUserTeamValueHelpClose(oEvent);
        },

        onUserTeamValueHelpClose(oEvent) {
            oEvent.getSource().getBinding("items")?.filter([]);
        },

        onClearUserTeam() {
            const oModel = this.getView().getModel("userEdit");
            oModel.setProperty("/team_ID", "");
            oModel.setProperty("/teamName", "");
        },

        onOpenManagerValueHelpRequest() {
            this._filterManagerUsers(this.byId("managerValueHelpDialog"), "");
            this.byId("managerValueHelpDialog").open();
        },

        onManagerValueHelpSearch(oEvent) {
            this._filterManagerUsers(oEvent.getSource(), oEvent.getParameter("value") || "");
        },

        onManagerValueHelpConfirm(oEvent) {
            const oContext = oEvent.getParameter("selectedItem")?.getBindingContext();

            if (oContext) {
                const oModel = this.getView().getModel("userEdit");
                oModel.setProperty("/manager_ID", oContext.getProperty("ID"));
                oModel.setProperty("/managerName", oContext.getProperty("displayName"));
            }

            this.onManagerValueHelpClose(oEvent);
        },

        onManagerValueHelpClose(oEvent) {
            oEvent.getSource().getBinding("items")?.filter([]);
        },

        onClearManager() {
            const oModel = this.getView().getModel("userEdit");
            oModel.setProperty("/manager_ID", "");
            oModel.setProperty("/managerName", "");
        },

        onOpenCreateTeamDialog() {
            this.getView().getModel("teamEdit").setData(this._emptyTeam());
            this.byId("teamDialog").open();
        },

        onOpenEditTeamDialog(oEvent) {
            const oTeam = this._teamFromEvent(oEvent);

            if (!oTeam) {
                return;
            }

            this.getView().getModel("teamEdit").setData({ ...oTeam, isEdit: true });
            this.byId("teamDialog").open();
        },

        onCloseTeamDialog() {
            this.byId("teamDialog").close();
        },

        async onSaveTeam() {
            const oTeam = this.getView().getModel("teamEdit").getData();

            if (!oTeam.teamCode || !oTeam.name) {
                MessageBox.warning(this.getText("teamRequiredMessage"));
                return;
            }

            const oPayload = {
                teamCode: oTeam.teamCode,
                name: oTeam.name,
                description: oTeam.description,
                isActive: oTeam.isActive
            };

            this.showBusy();

            try {
                if (oTeam.isEdit) {
                    await this.updateEntry(`/Teams(guid'${oTeam.ID}')`, oPayload);
                    MessageToast.show(this.getText("teamUpdatedMessage"));
                } else {
                    await this.createEntry("/Teams", oPayload);
                    MessageToast.show(this.getText("teamCreatedMessage"));
                }

                await this._loadOrgTree();
                this.onCloseTeamDialog();
            } catch (oError) {
                MessageBox.error(this._getErrorMessage(oError));
            } finally {
                this.hideBusy();
            }
        },

        async onOpenTeamMembersDialog(oEvent) {
            const oTeam = this._teamFromEvent(oEvent);

            if (!oTeam) {
                return;
            }

            this.getView().getModel("teamMembers").setData({
                teamId: oTeam.ID,
                teamName: oTeam.name,
                members: []
            });
            this.byId("teamMembersDialog").open();
            this.showBusy();

            try {
                await this._loadTeamMembers(oTeam.ID);
            } catch (oError) {
                MessageBox.error(this._getErrorMessage(oError));
            } finally {
                this.hideBusy();
            }
        },

        async onCloseTeamMembersDialog() {
            this.byId("teamMembersDialog").close();
            await this._loadOrgTree();
        },

        onOpenTeamMemberUserValueHelp() {
            this.byId("teamMemberUserValueHelpDialog").open();
        },

        onTeamMemberUserValueHelpSearch(oEvent) {
            this._filterUsers(oEvent.getSource(), oEvent.getParameter("value") || "");
        },

        onTeamMemberUserValueHelpConfirm(oEvent) {
            const oContext = oEvent.getParameter("selectedItem")?.getBindingContext();
            const sTeamId = this.getView().getModel("teamMembers").getProperty("/teamId");

            if (!oContext || !sTeamId) {
                return;
            }

            const bAdded = this._addTeamMemberDraft({
                user_ID: oContext.getProperty("ID"),
                displayName: oContext.getProperty("displayName"),
                email: oContext.getProperty("email"),
                isActive: oContext.getProperty("isActive")
            });

            if (bAdded) {
                MessageToast.show(this.getText("teamMemberStagedMessage"));
            }

            this.onTeamMemberUserValueHelpClose(oEvent);
        },

        onTeamMemberUserValueHelpClose(oEvent) {
            oEvent.getSource().getBinding("items")?.filter([]);
        },

        onDeleteSelectedTeamMembers() {
            const oTable = this.byId("teamMembersTable");
            const aSelectedPaths = oTable.getSelectedContexts("teamMembers").map((oContext) => oContext.getPath());

            if (!aSelectedPaths.length) {
                MessageToast.show(this.getText("selectItemsToDeleteMessage"));
                return;
            }

            const oModel = this.getView().getModel("teamMembers");
            const aMembers = [...(oModel.getProperty("/members") || [])];
            const aSelectedIndexes = aSelectedPaths
                .map((sPath) => Number(sPath.split("/").pop()))
                .filter(Number.isInteger);
            const aRemainingMembers = aMembers.filter((oMember, iIndex) => !aSelectedIndexes.includes(iIndex));

            oModel.setProperty("/members", aRemainingMembers);
            oTable.removeSelections(true);
            MessageToast.show(this.getText("teamMembersRemovedFromDraftMessage", [aSelectedIndexes.length]));
        },

        async onSaveTeamMembers() {
            const oModel = this.getView().getModel("teamMembers");
            const sTeamId = oModel.getProperty("/teamId");
            const aCurrentMembers = oModel.getProperty("/members") || [];
            const aOriginalMembers = this._aOriginalTeamMembers || [];
            const mOriginalByUserId = new Map(aOriginalMembers.map((oMember) => [oMember.user_ID, oMember]));
            const mCurrentByUserId = new Map(aCurrentMembers.map((oMember) => [oMember.user_ID, oMember]));
            const aMembersToCreate = aCurrentMembers.filter((oMember) =>
                oMember.user_ID && !mOriginalByUserId.has(oMember.user_ID)
            );
            const aMembersToDelete = aOriginalMembers.filter((oMember) =>
                oMember.ID && !mCurrentByUserId.has(oMember.user_ID)
            );

            if (!sTeamId) {
                return;
            }

            this.showBusy();

            try {
                await Promise.all([
                    ...aMembersToCreate.map((oMember) => this.createEntry("/TeamMembers", {
                        team_ID: sTeamId,
                        user_ID: oMember.user_ID
                    })),
                    ...aMembersToDelete.map((oMember) => this.removeEntry(`/TeamMembers(guid'${oMember.ID}')`))
                ]);
                MessageToast.show(this.getText("teamMembersSavedMessage"));
                this.byId("teamMembersTable").removeSelections(true);
                await this._refreshTeamMembersTable();
                await this._loadOrgTree();
            } catch (oError) {
                MessageBox.error(this._getErrorMessage(oError));
            } finally {
                this.hideBusy();
            }
        },

        formatActiveState(bActive) {
            return bActive ? "Success" : "None";
        },

        formatActiveText(bActive) {
            return this.getText(bActive ? "activeStatus" : "inactiveStatus");
        },

        formatOrgTreeStatusVisible(sType) {
            return sType === "team";
        },

        formatOrgTreeMemberCount(iCount) {
            return this.getText("teamMemberCountText", [iCount || 0]);
        },

        _emptyUser() {
            return {
                azureObjectId: "",
                userPrincipalName: "",
                displayName: "",
                email: "",
                manager_ID: "",
                managerName: "",
                team_ID: "",
                teamName: "",
                teamIds: [],
                isActive: true
            };
        },

        _emptyTeam() {
            return {
                ID: "",
                teamCode: "",
                name: "",
                description: "",
                isActive: true,
                isEdit: false
            };
        },

        async _loadOrgTree() {
            const [aTeams, aMembers] = await Promise.all([
                this._readEntries("/Teams", { sorters: [new Sorter("name", false)] }),
                this._readEntries("/TeamMembers", { sorters: [new Sorter("displayName", false)] })
            ]);
            const mMembersByTeam = aMembers.reduce((mResult, oMember) => {
                mResult[oMember.team_ID] ??= [];
                mResult[oMember.team_ID].push(oMember);
                return mResult;
            }, {});

            this._aTeams = aTeams;
            this._aTeamMembers = aMembers;
            this._aOrgTreeNodes = aTeams.map((oTeam) => {
                const aTeamMembers = mMembersByTeam[oTeam.ID] || [];

                return {
                    type: "team",
                    id: oTeam.ID,
                    title: oTeam.name || oTeam.teamCode,
                    subtitle: oTeam.description || oTeam.teamCode,
                    teamCode: oTeam.teamCode,
                    memberCount: aTeamMembers.length,
                    statusText: this.formatActiveText(oTeam.isActive),
                    statusState: this.formatActiveState(oTeam.isActive),
                    icon: "sap-icon://group",
                    nodes: aTeamMembers.map((oMember) => ({
                        type: "user",
                        id: oMember.ID,
                        userId: oMember.user_ID,
                        title: oMember.displayName || oMember.email,
                        subtitle: oMember.email,
                        icon: "sap-icon://employee",
                        nodes: []
                    }))
                };
            });

            this._applyOrgTreeFilter("");
        },

        _applyOrgTreeFilter(sQuery) {
            const sNormalizedQuery = String(sQuery || "").trim().toLowerCase();
            const aNodes = this._aOrgTreeNodes || [];

            if (!sNormalizedQuery) {
                this.getView().getModel("orgTree").setProperty("/nodes", aNodes);
                return;
            }

            const aFilteredNodes = aNodes
                .map((oTeam) => {
                    const bTeamMatches = [oTeam.title, oTeam.subtitle, oTeam.teamCode]
                        .some((sValue) => String(sValue || "").toLowerCase().includes(sNormalizedQuery));
                    const aMatchingMembers = (oTeam.nodes || []).filter((oMember) =>
                        [oMember.title, oMember.subtitle].some((sValue) =>
                            String(sValue || "").toLowerCase().includes(sNormalizedQuery)
                        )
                    );

                    if (!bTeamMatches && !aMatchingMembers.length) {
                        return null;
                    }

                    return {
                        ...oTeam,
                        nodes: bTeamMatches ? oTeam.nodes : aMatchingMembers
                    };
                })
                .filter(Boolean);

            this.getView().getModel("orgTree").setProperty("/nodes", aFilteredNodes);
            this.byId("teamsTree")?.expandToLevel(1);
        },

        _teamFromEvent(oEvent) {
            const oOrgContext = oEvent.getSource().getBindingContext("orgTree");

            if (oOrgContext) {
                const oNode = oOrgContext.getObject();
                const sTeamId = oNode.type === "team" ? oNode.id : null;
                return this._aTeams?.find((oTeam) => oTeam.ID === sTeamId);
            }

            return oEvent.getSource().getBindingContext()?.getObject();
        },

        async _loadTeamMembers(sTeamId) {
            const aMembers = await this._readEntries("/TeamMembers", {
                filters: [new Filter("team_ID", FilterOperator.EQ, sTeamId)],
                sorters: [new Sorter("displayName", false)]
            });

            this._aOriginalTeamMembers = aMembers.map((oMember) => ({ ...oMember }));
            this.getView().getModel("teamMembers").setProperty("/members", aMembers);
        },

        async _refreshTeamMembersTable() {
            const sTeamId = this.getView().getModel("teamMembers").getProperty("/teamId");

            if (sTeamId) {
                await this._loadTeamMembers(sTeamId);
            }
        },

        _refreshItemsBinding(sTableId, fnFallback) {
            const oBinding = this.byId(sTableId)?.getBinding("items");

            if (oBinding) {
                oBinding.refresh();
                return;
            }

            fnFallback?.();
        },

        _addTeamMemberDraft(oUser) {
            const oModel = this.getView().getModel("teamMembers");
            const aMembers = [...(oModel.getProperty("/members") || [])];

            if (aMembers.some((oMember) => oMember.user_ID === oUser.user_ID)) {
                MessageToast.show(this.getText("teamMemberAlreadyInListMessage"));
                return false;
            }

            aMembers.push({
                ID: "",
                user_ID: oUser.user_ID,
                displayName: oUser.displayName,
                email: oUser.email,
                isActive: oUser.isActive !== false
            });
            oModel.setProperty("/members", aMembers);
            return true;
        },

        async _ensureTeamMembership(sTeamId, sUserId) {
            if (!sTeamId || !sUserId) {
                return;
            }

            const aExisting = await this._readEntries("/TeamMembers", {
                filters: [
                    new Filter("team_ID", FilterOperator.EQ, sTeamId),
                    new Filter("user_ID", FilterOperator.EQ, sUserId)
                ]
            });

            if (aExisting.length) {
                return;
            }

            await this.createEntry("/TeamMembers", {
                team_ID: sTeamId,
                user_ID: sUserId
            });
        },

        _filterUsers(oDialog, sQuery) {
            const oBinding = oDialog.getBinding("items");

            if (!sQuery) {
                oBinding.filter([]);
                return;
            }

            oBinding.filter([
                new Filter({
                    filters: [
                        new Filter("displayName", FilterOperator.Contains, sQuery),
                        new Filter("email", FilterOperator.Contains, sQuery),
                        new Filter("userPrincipalName", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                })
            ]);
        },

        _filterManagerUsers(oDialog, sQuery) {
            const oBinding = oDialog.getBinding("items");
            const sCurrentUserId = this.getView().getModel("userEdit").getProperty("/ID");
            const aFilters = [new Filter("isActive", FilterOperator.EQ, true)];

            if (sCurrentUserId) {
                aFilters.push(new Filter("ID", FilterOperator.NE, sCurrentUserId));
            }

            if (sQuery) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("displayName", FilterOperator.Contains, sQuery),
                        new Filter("email", FilterOperator.Contains, sQuery),
                        new Filter("userPrincipalName", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                }));
            }

            oBinding.filter(aFilters);
        },

        _filterTeams(oDialog, sQuery) {
            const oBinding = oDialog.getBinding("items");

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

        _readEntries(sPath, oParameters = {}) {
            return new Promise((resolve, reject) => {
                this.getModel().read(sPath, {
                    ...oParameters,
                    success: (oData) => resolve(oData?.results || []),
                    error: reject
                });
            });
        },

        _getErrorMessage(oError) {
            try {
                return JSON.parse(oError.responseText).error.message.value || this.getText("userSaveErrorMessage");
            } catch (oParseError) {
                return oError.message || this.getText("userSaveErrorMessage");
            }
        }
    });
});
