sap.ui.define([
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator"
], function (Filter, FilterOperator) {
  "use strict";

  return {
    build: function ({ status, requestType, startDate, endDate, search }) {
      const filters = [];
      if (status) filters.push(new Filter("status_code", FilterOperator.EQ, status));
      if (requestType) filters.push(new Filter("requestType_code", FilterOperator.EQ, requestType));

      // Interpret selected days in the browser's local timezone, then send UTC
      // instants. An exclusive next-day boundary includes the entire end date
      // and also works across daylight-saving changes.
      const start = startDate && new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      const end = endDate && new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
      if (start && end && start > end) throw new Error("invalidCreationRange");
      if (start) filters.push(new Filter("createdAt", FilterOperator.GE, start.toISOString()));
      if (end) {
        end.setDate(end.getDate() + 1);
        filters.push(new Filter("createdAt", FilterOperator.LT, end.toISOString()));
      }

      const term = String(search || "").trim();
      if (term) {
        filters.push(new Filter({
          filters: ["referenceNumber", "title", "requesterName"].map((field) =>
            new Filter(field, FilterOperator.Contains, term)),
          and: false
        }));
      }
      return filters;
    }
  };
});
