const path = require("path");

function parseArguments(args) {
  const options = { format: "console", output: null, entity: null, warnOnly: false };
  const valueOptions = new Set(["--format", "--out", "--entity"]);

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (valueOptions.has(argument) && !args[index + 1]) {
      throw new Error(`${argument} requires a value`);
    }
    switch (argument) {
      case "--format": options.format = args[++index]; break;
      case "--out": options.output = args[++index]; break;
      case "--entity": options.entity = args[++index]; break;
      case "--warn-only": options.warnOnly = true; break;
      case "--help":
      case "-h": options.help = true; break;
      default: throw new Error(`Unknown option: ${argument}`);
    }
  }

  if (!["console", "json", "markdown"].includes(options.format)) {
    throw new Error(`Unsupported report format: ${options.format}`);
  }
  return options;
}

function loadConfiguration(cds, projectDirectory, cliOptions) {
  const configured = cds.env.dataDrift || {};
  return {
    projectDirectory,
    folders: configured.folders || ["db/data"],
    dbService: configured.dbService || "db",
    ignoreManagedColumns: configured.ignoreManagedColumns !== false,
    ignoreColumns: configured.ignoreColumns || [],
    excludeEntities: configured.excludeEntities || [],
    entities: configured.entities || {},
    maxRowsPerEntity: configured.maxRowsPerEntity || 100000,
    maxReportedRows: configured.maxReportedRows || 100,
    emptyStringEqualsNull: configured.emptyStringEqualsNull !== false,
    trimStrings: configured.trimStrings === true,
    format: cliOptions.format,
    output: cliOptions.output ? path.resolve(projectDirectory, cliOptions.output) : null,
    selectedEntity: cliOptions.entity,
    warnOnly: cliOptions.warnOnly
  };
}

function printHelp() {
  console.log(`Usage: cds-data-drift [options]

Read-only comparison of CAP db/data CSV files with the configured database.

Options:
  --entity <name>       Compare only one fully-qualified CDS entity
  --format <format>     console, json, or markdown (default: console)
  --out <filename>      Write JSON or Markdown output to a file
  --warn-only           Report drift but return exit code 0
  --help, -h            Display this help

Exit codes:
  0  synchronized, or --warn-only
  1  drift or validation mismatch detected
  2  configuration, connection, or execution failure`);
}

module.exports = { parseArguments, loadConfiguration, printHelp };
