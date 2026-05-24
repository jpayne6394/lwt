import { createRuntime } from "./runtime.ts";

const runtime = await createRuntime();
const dryRun = process.argv.includes("--dry-run");
await runtime.runNow(dryRun);
console.log(`Supplier sync complete (${dryRun ? "dry run" : "write mode"})`);

