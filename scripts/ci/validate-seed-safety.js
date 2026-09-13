const fs = require("fs");
const path = require("path");

const repositoryRoot = path.resolve(__dirname, "../..");
const projects = ["flowmate-common", "flowmate", "flowmate-CA"];
const operationalEntity = /(?:ProcessRequests|ProcessTasks|ProcessHistory|ProcessAttachments|ProcessComments|ProcessEmail|SlaNotification|CARequests|CATasks|CAHistory|CAAttachments|CAComments|RequestStepInstances|Outbox)/i;
const applicationManagedEntity = /(?:flowmate\.common\.db-(?:Roles|Delegations)|flowmate\.db-(?:LoaApproval|WorkingCalendarHolidays))\.csv$/i;

let csvCount = 0;
for (const project of projects) {
  const dataDirectory = path.join(repositoryRoot, project, "db", "data");
  for (const filename of fs.readdirSync(dataDirectory).filter((name) => name.endsWith(".csv"))) {
    csvCount += 1;
    if (operationalEntity.test(filename)) {
      throw new Error(`Operational entity must not be deployed as seed data: ${project}/db/data/${filename}`);
    }
    if (applicationManagedEntity.test(filename)) {
      throw new Error(`Application-managed entity must not be deployed as seed data: ${project}/db/data/${filename}`);
    }
    const content = fs.readFileSync(path.join(dataDirectory, filename), "utf8");
    if (!content.trim()) throw new Error(`Empty seed file: ${project}/db/data/${filename}`);
  }
}

console.log(`Seed safety check passed for ${csvCount} CSV files`);
