sap.ui.define([], function () {
  "use strict";

  // Builds the History tab's Versions table. Each version is { rows: [{ key, label, value }] }
  // (formatted values, "" when empty). Returns one row per field, in first-seen order, with a
  // cell per version: version 1 shows every value ("—" when empty); a later version shows a
  // value only where it differs from the version before it, and is blank where unchanged.
  const EMPTY = "—";

  const cellText = function (current, previous) {
    if (current === previous || (previous === undefined && current === "")) {
      return null;
    }
    if (current === undefined) {
      return "(removed)";
    }
    return current === "" ? "(cleared)" : current;
  };

  return {
    build: function (versions) {
      const order = [];
      const labels = new Map();
      const values = (versions || []).map(function (version) {
        const byKey = new Map();
        (version.rows || []).forEach(function (row) {
          if (!labels.has(row.key)) {
            labels.set(row.key, row.label);
            order.push(row.key);
          }
          byKey.set(row.key, row.value === null || row.value === undefined ? "" : String(row.value));
        });
        return byKey;
      });
      const rows = order.map(function (key) {
        return {
          key: key,
          label: labels.get(key),
          cells: values.map(function (byKey, index) {
            if (index === 0) {
              return { text: byKey.get(key) || EMPTY, changed: false };
            }
            const text = cellText(byKey.get(key), values[index - 1].get(key));
            return { text: text || "", changed: text !== null };
          })
        };
      });
      return {
        rows: rows,
        changedCounts: values.map(function (_byKey, index) {
          return rows.filter(function (row) { return row.cells[index].changed; }).length;
        })
      };
    },

    // One page of the Versions table: a version (previousRows) and the one after it (currentRows).
    // Form fields are all listed; line item and header row fields only where they changed between
    // the two (including lines added or removed), so unchanged lines stay out of the way.
    pair: function (previousRows, currentRows) {
      const table = this.build([{ rows: previousRows }, { rows: currentRows }]);
      return {
        rows: table.rows.filter(function (row) {
          return !/^(line|header):/.test(row.key) || row.cells[1].changed;
        }),
        changedCount: table.changedCounts[1]
      };
    }
  };
});
