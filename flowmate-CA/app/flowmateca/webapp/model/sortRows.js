sap.ui.define([], function () {
  "use strict";

  // Sorts the rows of a worklist (Requests / Tasks) in the browser on the value a column shows.
  // Rows without a date always come last, whichever the direction.
  const time = function (value) {
    const parsed = value ? Date.parse(value) : NaN;
    return Number.isNaN(parsed) ? null : parsed;
  };

  // -1 / 0 / 1 for ascending (or descending) dates; null (no date) is greater than any date.
  const compareDates = function (left, right, descending) {
    const a = time(left);
    const b = time(right);
    if (a === null || b === null) {
      return a === b ? 0 : (a === null ? 1 : -1);
    }
    return descending ? b - a : a - b;
  };

  return {
    compareDates: compareDates,

    // A new array sorted on keyFn(row); ties keep the newest-created row first (stable).
    sortRows: function (rows, keyFn, descending) {
      return (rows || []).map(function (row, index) { return { row: row, index: index }; })
        .sort(function (left, right) {
          return compareDates(keyFn(left.row), keyFn(right.row), descending)
            || compareDates(left.row.createdAt, right.row.createdAt, true)
            || left.index - right.index;
        })
        .map(function (entry) { return entry.row; });
    },

    // What the Tasks SLA Due column shows: the SLA deadline, else the plain due date.
    slaDueKey: function (task) {
      return task.slaDueAt || task.dueDate || null;
    }
  };
});
