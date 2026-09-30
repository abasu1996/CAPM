const fs = require("fs");
const path = require("path");

const target = path.resolve(process.argv[2] || "gen/db");
const removable = new Set([".csv", ".hdbtabledata"]);
let removed = 0;

const clean = (directory) => {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      clean(filename);
      if (fs.readdirSync(filename).length === 0) fs.rmdirSync(filename);
    } else if (removable.has(path.extname(entry.name))) {
      fs.unlinkSync(filename);
      removed += 1;
    }
  }
};

clean(target);

const leftovers = [];
const verify = (directory) => {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) verify(filename);
    else if (removable.has(path.extname(entry.name))) leftovers.push(filename);
  }
};
verify(target);

if (leftovers.length) {
  throw new Error(`Deployable seed artifacts remain:\n${leftovers.join("\n")}`);
}
console.log(`Removed ${removed} CSV/.hdbtabledata artifacts from ${target}`);
