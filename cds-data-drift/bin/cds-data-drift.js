#!/usr/bin/env node

const path = require("path");

async function main() {
  try {
    const projectDirectory = process.cwd();
    const cdsPath = require.resolve("@sap/cds", { paths: [projectDirectory] });
    const cds = require(cdsPath);
    const { run } = require("../lib/run");
    const result = await run({
      cds,
      projectDirectory: path.resolve(projectDirectory),
      arguments: process.argv.slice(2)
    });
    process.exitCode = result.hasDrift ? 1 : 0;
  } catch (error) {
    console.error("\nCAP data-drift check failed");
    console.error(error.stack || error.message || error);
    process.exitCode = 2;
  }
}

main();
