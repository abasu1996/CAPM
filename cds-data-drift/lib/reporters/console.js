const keyText = key => Object.entries(key).map(([name, value]) => `${name}=${JSON.stringify(value)}`).join(", ");
const limited = (items, maximum) => items.slice(0, maximum);

function writeConsoleReport(report, configuration, stream = process.stdout) {
  const lines = [
    "",
    "CAP Seed Data Drift Report",
    `Project: ${report.project}`,
    `Database service: ${report.databaseService}`,
    ""
  ];

  for (const entity of report.entities) {
    lines.push(`${entity.synchronized ? "✓" : "⚠"} ${entity.entity}`);
    lines.push(`  CSV rows: ${entity.counts.csv}`);
    lines.push(`  Database rows: ${entity.counts.database}`);
    if (entity.synchronized) {
      lines.push("  Status: synchronized", "");
      continue;
    }
    if (entity.localOnly.length) {
      lines.push(`  LOCAL_ONLY: ${entity.localOnly.length}`);
      limited(entity.localOnly, configuration.maxReportedRows).forEach(item => lines.push(`    + ${keyText(item.key)}`));
    }
    if (entity.databaseOnly.length) {
      lines.push(`  DATABASE_ONLY: ${entity.databaseOnly.length}`);
      limited(entity.databaseOnly, configuration.maxReportedRows).forEach(item => lines.push(`    - ${keyText(item.key)}`));
    }
    if (entity.changed.length) {
      lines.push(`  CHANGED: ${entity.changed.length}`);
      for (const item of limited(entity.changed, configuration.maxReportedRows)) {
        lines.push(`    ~ ${keyText(item.key)}`);
        item.changes.forEach(change => lines.push(
          `      ${change.column}: DATABASE=${JSON.stringify(change.database)}, CSV=${JSON.stringify(change.csv)}`
        ));
      }
    }
    if (entity.duplicates.length) {
      lines.push(`  DUPLICATES: ${entity.duplicates.length}`);
      limited(entity.duplicates, configuration.maxReportedRows).forEach(item => lines.push(
        `    ! ${item.source}: ${keyText(item.key)}`
      ));
    }
    lines.push("");
  }

  if (report.validationErrors.length) {
    lines.push("Validation errors");
    report.validationErrors.forEach(error => lines.push(
      `  ✗ ${error.filename || error.entity || "project"}: ${error.message}`
    ));
    lines.push("");
  }
  lines.push(
    "Summary",
    `  Checked: ${report.summary.checked}`,
    `  Synchronized: ${report.summary.synchronized}`,
    `  With drift: ${report.summary.withDrift}`,
    `  Invalid: ${report.summary.invalid}`,
    "",
    "No CSV or database data was modified.",
    ""
  );
  stream.write(lines.join("\n"));
}

module.exports = { writeConsoleReport };
