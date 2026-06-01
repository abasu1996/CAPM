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
                tasksState: "Loading"
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

            Promise.allSettled([
                this._readReservationCounts(),
                this._readMyTaskCount()
            ]).then(([oReservationResult, oTasksResult]) => {
                if (oReservationResult.status === "fulfilled") {
                    oDashboardModel.setProperty("/reservedRequestsCount", oReservationResult.value.reservedRequests);
                    oDashboardModel.setProperty("/unreservedRequestsCount", oReservationResult.value.unreservedRequests);
                    oDashboardModel.setProperty("/reservedRequestsState", "Loaded");
                    oDashboardModel.setProperty("/unreservedRequestsState", "Loaded");
                } else {
                    oDashboardModel.setProperty("/reservedRequestsState", "Failed");
                    oDashboardModel.setProperty("/unreservedRequestsState", "Failed");
                }

                if (oTasksResult.status === "fulfilled") {
                    oDashboardModel.setProperty("/tasksCount", oTasksResult.value);
                    oDashboardModel.setProperty("/tasksState", "Loaded");
                } else {
                    oDashboardModel.setProperty("/tasksState", "Failed");
                }
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
            return fetch("/odata/v4/flowmate/getRequestReservationCounts()", {
                credentials: "same-origin",
                headers: {
                    "Accept": "application/json"
                }
            }).then((oResponse) => {
                if (!oResponse.ok) {
                    throw new Error("Reservation counts could not be loaded");
                }

                return oResponse.json();
            });
        },

        _readMyTaskCount() {
            return fetch("/odata/v4/flowmate/getMyTaskCount()", {
                credentials: "same-origin",
                headers: {
                    "Accept": "application/json"
                }
            }).then((oResponse) => {
                if (!oResponse.ok) {
                    throw new Error("Task count could not be loaded");
                }

                return oResponse.json();
            }).then((vResult) => Number(vResult?.value ?? vResult ?? 0));
        }
    });
});
