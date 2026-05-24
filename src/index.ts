import { createRuntime } from "./runtime.ts";
import { startServer } from "./server/server.ts";
import { startWeeklyScheduler } from "./worker/scheduler.ts";

const runtime = await createRuntime();
startServer(runtime.serverContext, {
  port: runtime.config.port,
  host: runtime.config.host,
});
startWeeklyScheduler(() => runtime.runNow(false), runtime.config.weeklySyncIntervalMs);

console.log(`Supplier Ops Agent listening on http://${runtime.config.host}:${runtime.config.port}`);

