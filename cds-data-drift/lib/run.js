const { parseArguments, loadConfiguration, printHelp } = require("./configuration");
const { discoverCsvFiles } = require("./discover-csv");
const { loadCsv, validateCsvColumns } = require("./load-csv");
const { determineKeys, determineComparedColumns, compareEntity } = require("./compare");
const { loadDatabaseRows } = require("./load-database");
const { writeConsoleReport } = require("./reporters/console");
const { writeJsonReport } = require("./reporters/json");
const { writeMarkdownReport } = require("./reporters/markdown");

async function run({ cds, projectDirectory, arguments: args }) {
  const cliOptions = parseArguments(args);
  if (cliOptions.help) {
    printHelp();
    return { hasDrift: false };
  }
  await cds.plugins;
  const configuration = loadConfiguration(cds, projectDirectory, cliOptions);
  const model = cds.linked(await cds.load("*"));
  const discovery = discoverCsvFiles(configuration, model);
  const validationErrors = [...discovery.errors];
  const results = [];
  let db;

  try {
    db = await cds.connect.to(configuration.dbService);
    for (const csvDefinition of discovery.discovered) {
      let csv;
      try {
        csv = loadCsv(csvDefinition);
        const columnErrors = validateCsvColumns(csvDefinition.entityName, csvDefinition.definition, csv.headers, model);
        if (columnErrors.length) {
          validationErrors.push(...columnErrors);
          continue;
        }
        const keys = determineKeys(csvDefinition.entityName, csvDefinition.definition, configuration);
        const columns = determineComparedColumns(csv.headers, keys, configuration, csvDefinition.entityName);
        const databaseRows = await loadDatabaseRows({
          cds,
          db,
          entityName: csvDefinition.entityName,
          columns,
          maximumRows: configuration.maxRowsPerEntity
        });
        results.push(compareEntity({
          entityName: csvDefinition.entityName,
          definition: csvDefinition.definition,
          headers: csv.headers,
          csvRows: csv.records,
          databaseRows,
          configuration,
          model
        }));
      } catch (error) {
        validationErrors.push({
          type: "ENTITY_COMPARISON_FAILED",
          filename: csvDefinition.filename,
          entity: csvDefinition.entityName,
          message: error.message || String(error)
        });
      }
    }
  } finally {
    if (db && typeof db.disconnect === "function") await db.disconnect();
  }

  if (configuration.selectedEntity && !discovery.discovered.length) {
    validationErrors.push({
      type: "SELECTED_ENTITY_NOT_FOUND",
      entity: configuration.selectedEntity,
      message: "No matching db/data CSV was found for the selected entity"
    });
  }
  const report = {
    generatedAt: new Date().toISOString(),
    project: projectDirectory,
    databaseService: configuration.dbService,
    entities: results,
    validationErrors,
    summary: {
      checked: results.length,
      synchronized: results.filter(item => item.synchronized).length,
      withDrift: results.filter(item => !item.synchronized).length,
      invalid: validationErrors.length
    }
  };
  if (configuration.format === "json") writeJsonReport(report, configuration);
  else if (configuration.format === "markdown") writeMarkdownReport(report, configuration);
  else writeConsoleReport(report, configuration);

  const detected = report.summary.withDrift > 0 || report.summary.invalid > 0;
  return { report, hasDrift: configuration.warnOnly ? false : detected };
}

module.exports = { run };
