#!/usr/bin/env node

const cds = require("@sap/cds");
const { randomUUID } = require("node:crypto");

const DEFAULT_COUNT = 10000;
const DEFAULT_BATCH_SIZE = 1000;
const PROCESS_TYPES = [
  "PURCHASE_REQUEST",
  "DOCUMENT_REVIEW",
  "ACCESS_REQUEST",
  "EXCEPTION_REQUEST"
];
const STATUSES = [
  "SUBMITTED",
  "IN_PROGRESS",
  "SENT_BACK",
  "DRAFT"
];
const PRIORITIES = [
  "Low",
  "Medium",
  "High",
  "Critical"
];
const USERS = [
  {
    ID: "10000000-0000-4000-8000-000000000001",
    name: "Alex Johnson",
    department: "Operations"
  },
  {
    ID: "10000000-0000-4000-8000-000000000002",
    name: "Priya Sharma",
    department: "Finance"
  },
  {
    ID: "10000000-0000-4000-8000-000000000003",
    name: "Daniel Kim",
    department: "Procurement"
  },
  {
    ID: "10000000-0000-4000-8000-000000000004",
    name: "Maya Perera",
    department: "Human Resources"
  },
  {
    ID: "10000000-0000-4000-8000-000000000005",
    name: "Sophia Fernando",
    department: "IT Security"
  },
  {
    ID: "10000000-0000-4000-8000-000000000006",
    name: "Emma Silva",
    department: "Document Control"
  }
];

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (!arg.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2);
    const next = argv[i + 1];

    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }

  return args;
}

function pick(values, index) {
  return values[index % values.length];
}

function buildReference(runId, number) {
  const compactRunId = runId.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase() || "TEST";
  return `LT${compactRunId}-${String(number).padStart(7, "0")}`;
}

function buildRow(runId, number, reservePercent) {
  const requester = pick(USERS, number);
  const processor = pick(USERS, number + 2);
  const status = pick(STATUSES, number);
  const priority = pick(PRIORITIES, number);
  const processType = pick(PROCESS_TYPES, number);
  const createdAt = new Date(Date.UTC(2026, number % 12, (number % 27) + 1, number % 24, number % 60, number % 60)).toISOString();
  const dueDate = new Date(Date.UTC(2026, (number + 1) % 12, ((number + 7) % 27) + 1)).toISOString().slice(0, 10);
  const shouldReserve = reservePercent > 0 && number % 100 < reservePercent;
  const reservedUser = shouldReserve ? processor : null;

  return {
    ID: randomUUID(),
    createdAt,
    createdBy: "load-test-seed",
    modifiedAt: createdAt,
    modifiedBy: "load-test-seed",
    referenceNumber: buildReference(runId, number),
    processType_code: processType,
    requesterUser_ID: requester.ID,
    processorUser_ID: processor.ID,
    reservedByUser_ID: reservedUser?.ID || null,
    title: `[LOADTEST:${runId}] Request ${String(number).padStart(7, "0")}`,
    description: `Synthetic load-test request generated for run ${runId}.`,
    requester: requester.name,
    processor: processor.name,
    reservedBy: reservedUser?.name || null,
    reservedAt: reservedUser ? createdAt : null,
    department: requester.department,
    status_code: status,
    priority,
    currentStep: (number % 5) + 1,
    dueDate,
    completedAt: null
  };
}

async function deleteRun(db, runId) {
  console.log(`Deleting ProcessRequests for load-test run ${runId}...`);
  const result = await db.run(
    DELETE.from("flowmate.db.ProcessRequests").where({ title: { like: `[LOADTEST:${runId}]%` } })
  );

  console.log(`Delete completed. Result: ${JSON.stringify(result)}`);
}

async function seedRun(db, options) {
  const startedAt = Date.now();
  let inserted = 0;

  console.log(`Seeding ${options.count.toLocaleString()} ProcessRequests into ${options.target}.`);
  console.log(`Run ID: ${options.runId}`);
  console.log(`Batch size: ${options.batchSize.toLocaleString()}`);
  console.log(`Reserved distribution: ${options.reservePercent}%`);

  for (let start = 1; start <= options.count; start += options.batchSize) {
    const end = Math.min(start + options.batchSize - 1, options.count);
    const rows = [];

    for (let number = start; number <= end; number += 1) {
      rows.push(buildRow(options.runId, number, options.reservePercent));
    }

    await db.run(INSERT.into("flowmate.db.ProcessRequests").entries(rows));
    inserted += rows.length;

    if (inserted % (options.batchSize * 10) === 0 || inserted === options.count) {
      const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(`Inserted ${inserted.toLocaleString()} / ${options.count.toLocaleString()} rows in ${elapsedSeconds}s`);
    }
  }

  console.log(`Seed completed. Inserted ${inserted.toLocaleString()} rows for run ${options.runId}.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runId = String(args.runId || `run${Date.now().toString(36)}`);
  const count = Number(args.count || DEFAULT_COUNT);
  const batchSize = Number(args.batchSize || DEFAULT_BATCH_SIZE);
  const reservePercent = Number(args.reservePercent || 0);
  const target = process.env.NODE_ENV || process.env.CDS_ENV || "default";

  if (!Number.isInteger(count) || count < 1) {
    throw new Error("--count must be a positive integer");
  }

  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 5000) {
    throw new Error("--batchSize must be an integer between 1 and 5000");
  }

  if (!Number.isInteger(reservePercent) || reservePercent < 0 || reservePercent > 100) {
    throw new Error("--reservePercent must be an integer between 0 and 100");
  }

  const db = await cds.connect.to("db");

  if (args.delete) {
    await deleteRun(db, runId);
  } else {
    await seedRun(db, {
      runId,
      count,
      batchSize,
      reservePercent,
      target
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cds.disconnect();
  });
