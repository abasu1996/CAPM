const fs = require("fs");

function writeJsonReport(report, configuration, stream = process.stdout) {
  const content = `${JSON.stringify(report, null, 2)}\n`;
  if (configuration.output) fs.writeFileSync(configuration.output, content);
  else stream.write(content);
}

module.exports = { writeJsonReport };
