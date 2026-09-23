const fs = require("fs");
const path = require("path");

function csvStemToEntityName(filename) {
  const stem = filename.replace(/\.csv$/i, "");
  const separator = stem.indexOf("-");
  if (separator < 1 || separator === stem.length - 1) return null;
  return `${stem.slice(0, separator)}.${stem.slice(separator + 1)}`;
}

function discoverCsvFiles(configuration, model) {
  const discovered = [];
  const errors = [];

  for (const relativeFolder of configuration.folders) {
    const directory = path.resolve(configuration.projectDirectory, relativeFolder);
    if (!fs.existsSync(directory)) continue;

    for (const filename of fs.readdirSync(directory).filter(name => name.endsWith(".csv")).sort()) {
      const entityName = csvStemToEntityName(filename);
      if (!entityName) {
        errors.push({ type: "INVALID_FILENAME", filename, message: "Filename does not follow <namespace>-<entity>.csv" });
        continue;
      }
      const definition = model.definitions[entityName];
      if (!definition) {
        errors.push({ type: "UNKNOWN_ENTITY", filename, entity: entityName, message: "No matching CDS entity was found" });
        continue;
      }
      if (configuration.excludeEntities.includes(entityName)) continue;
      if (configuration.selectedEntity && configuration.selectedEntity !== entityName) continue;
      if (definition.query || definition.projection) {
        errors.push({ type: "NON_PERSISTED_ENTITY", filename, entity: entityName, message: "CSV resolves to a view or projection, not a base table" });
        continue;
      }
      discovered.push({ entityName, filename, absolutePath: path.join(directory, filename), definition });
    }
  }
  return { discovered, errors };
}

module.exports = { discoverCsvFiles, csvStemToEntityName };
