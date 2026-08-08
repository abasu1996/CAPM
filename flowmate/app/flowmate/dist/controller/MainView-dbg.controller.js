sap.ui.define([
    "flowmate/controller/BaseController",
    "sap/ui/model/json/JSONModel"
], (BaseController, JSONModel) => {
    "use strict";

    return BaseController.extend("flowmate.controller.MainView", {
        onInit() {
            this.getView().setModel(new JSONModel({
                reservedRequestsCount: 0,
                reservedRequestsState: "Loading",
                unreservedRequestsCount: 0,
                unreservedRequestsState: "Loading",
                tasksCount: 0,
                tasksState: "Loading",
                teamTasksCount: 0,
                teamTasksState: "Loading"
            }), "dashboard");
            this.getRouter().getRoute("RouteDashboard").attachPatternMatched(this.onRouteMatched, this);
        },

        onRouteMatched() {
            this.setOneColumnLayout();
            this._loadDashboardCounts();
        },

        onOpenReservedRequests() {
            this.navTo("RouteMyRequests", {
                "?query": {
                    reserved: "true"
                }
            });
        },

        onOpenUnreservedRequests() {
            this.navTo("RouteMyRequests", {
                "?query": {
                    unreserved: "true"
                }
            });
        },

        onOpenTasks() {
            this.navTo("RouteMyTasks");
        },

        onOpenTeamTasks() {
            this.navTo("RouteMyTasks", {
                "?query": {
                    team: "true"
                }
            });
        },

        onOpenReports() {
            this.navTo("RouteReports");
        },

        onCreateRequest() {
            this.navTo("RouteRequestCreate");
        },

        onOpenConfig() {
            this.navTo("RouteAdminProcessConfig");
        },

        onOpenDelegations() {
            this.navTo("RouteDelegations");
        },

        _loadDashboardCounts() {
            const oDashboardModel = this.getView().getModel("dashboard");

            oDashboardModel.setProperty("/reservedRequestsState", "Loading");
            oDashboardModel.setProperty("/unreservedRequestsState", "Loading");
            oDashboardModel.setProperty("/tasksState", "Loading");
            oDashboardModel.setProperty("/teamTasksState", "Loading");

            this._readReservationCounts()
                .then((oCounts) => {
                    oDashboardModel.setProperty("/reservedRequestsCount", oCounts.reservedRequests);
                    oDashboardModel.setProperty("/unreservedRequestsCount", oCounts.unreservedRequests);
                    oDashboardModel.setProperty("/reservedRequestsState", "Loaded");
                    oDashboardModel.setProperty("/unreservedRequestsState", "Loaded");
                })
                .catch(() => {
                    oDashboardModel.setProperty("/reservedRequestsState", "Failed");
                    oDashboardModel.setProperty("/unreservedRequestsState", "Failed");
                });

            this._readMyTaskCount()
                .then((iCount) => {
                    oDashboardModel.setProperty("/tasksCount", iCount);
                    oDashboardModel.setProperty("/tasksState", "Loaded");
                })
                .catch(() => {
                    oDashboardModel.setProperty("/tasksState", "Failed");
                });

            this._readMyTeamTaskCount()
                .then((iCount) => {
                    oDashboardModel.setProperty("/teamTasksCount", iCount);
                    oDashboardModel.setProperty("/teamTasksState", "Loaded");
                })
                .catch(() => {
                    oDashboardModel.setProperty("/teamTasksState", "Failed");
                });
        },

        _readCount(sPath, sFilter) {
            const oModel = this.getModel();

            return new Promise((resolve, reject) => {
                oModel.read(`${sPath}/$count`, {
                    urlParameters: sFilter ? { "$filter": sFilter } : undefined,
                    success: (sCount) => resolve(Number(sCount)),
                    error: reject
                });
            });
        },

        _readReservationCounts() {
            return this._fetchJsonWithTimeout(
                this.getServiceV4Url("getRequestReservationCounts()"),
                "Reservation counts could not be loaded"
            );
        },

        _readMyTaskCount() {
            return this._fetchJsonWithTimeout(
                this.getServiceV4Url("getMyTaskCount()"),
                "Task count could not be loaded"
            ).then((vResult) => Number(vResult?.value ?? vResult ?? 0));
        },

        _readMyTeamTaskCount() {
            return this._fetchJsonWithTimeout(
                this.getServiceV4Url("getMyTeamTaskCount()"),
                "Team task count could not be loaded"
            ).then((vResult) => Number(vResult?.value ?? vResult ?? 0));
        },

        _fetchJsonWithTimeout(sUrl, sErrorMessage) {
            const oAbortController = new AbortController();
            const iTimeout = setTimeout(() => oAbortController.abort(), 15000);

            return fetch(sUrl, {
                credentials: "same-origin",
                headers: {
                    "Accept": "application/json"
                },
                signal: oAbortController.signal
            }).then((oResponse) => {
                if (!oResponse.ok) {
                    throw new Error(sErrorMessage);
                }

                return oResponse.json();
            }).finally(() => {
                clearTimeout(iTimeout);
            });
        }
    });
});
