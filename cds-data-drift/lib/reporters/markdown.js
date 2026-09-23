const fs = require("fs");

const escapeCell = value => String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const code = value => `\`${String(value).replace(/`/g, "\\`")}\``;
const keyText = key => Object.entries(key).map(([name, value]) => `${code(name)}=${code(value)}`).join(", ");

function writeMarkdownReport(report, configuration, stream = process.stdout) {
  const lines = [
    "# CAP Seed Data Drift Report",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Database service: ${code(report.databaseService)}`,
    "- Mode: read-only",
    "",
    "| Entity | CSV | Database | Local only | Database only | Changed | Duplicates | Status |",
    "|---|---:|---:|---:|---:|---:|---:|---|"
  ];
  for (const entity of report.entities) {
    lines.push(
      `| ${escapeCell(entity.entity)} | ${entity.counts.csv} | ${entity.counts.database} | ` +
      `${entity.counts.localOnly} | ${entity.counts.databaseOnly} | ${entity.counts.changed} | ` +
      `${entity.counts.duplicates} | ${entity.synchronized ? "Synchronized" : "Drift"} |`
    );
  }
  for (const entity of report.entities.filter(item => !item.synchronized)) {
    lines.push("", `## ${entity.entity}`);
    if (entity.localOnly.length) {
      lines.push("", "### Local only", "");
      entity.localOnly.slice(0, configuration.maxReportedRows).forEach(item => lines.push(`- ${keyText(item.key)}`));
    }
    if (entity.databaseOnly.length) {
      lines.push("", "### Database only", "");
      entity.databaseOnly.slice(0, configuration.maxReportedRows).forEach(item => lines.push(`- ${keyText(item.key)}`));
    }
    if (entity.changed.length) {
      lines.push("", "### Changed records", "");
      for (const item of entity.changed.slice(0, configuration.maxReportedRows)) {
        lines.push(`- ${keyText(item.key)}`);
        item.changes.forEach(change => lines.push(
          `  - ${code(change.column)}: database=${code(change.database)}, CSV=${code(change.csv)}`
        ));
      }
    }
    if (entity.duplicates.length) {
      lines.push("", "### Duplicate keys", "");
      entity.duplicates.slice(0, configuration.maxReportedRows).forEach(item => lines.push(
        `- ${item.source}: ${keyText(item.key)}`
      ));
    }
  }
  if (report.validationErrors.length) {
    lines.push("", "## Validation errors", "");
    report.validationErrors.forEach(error => lines.push(`- **${error.type}**: ${escapeCell(error.message)}`));
  }
  lines.push("", "> This report is read-only. No CSV or database data was modified.", "");
  const content = lines.join("\n");
  if (configuration.output) fs.writeFileSync(configuration.output, content);
  else stream.write(content);
}

module.exports = { writeMarkdownReport };
