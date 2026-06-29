import { createRuntime } from "./runtime.ts";
import type { IntelligenceRunType } from "./agents/intelligenceTypes.ts";

const runtime = await createRuntime();
const runType = parseRunType(process.argv[2]);

if (!runType) {
  console.error("Usage: node --experimental-strip-types src/intelligence-worker.ts <inventory|daily-bi|content-radar|product-strategy|shopper-behavior>");
  process.exitCode = 1;
} else {
  await runtime.serverContext.intelligenceService?.run(runType);
  console.log(`LWT intelligence ${runType} run complete`);
}

function parseRunType(value: string | undefined): IntelligenceRunType | null {
  if (value === "inventory") return "inventory";
  if (value === "daily-bi") return "daily_bi";
  if (value === "content-radar") return "content_radar";
  if (value === "product-strategy") return "product_strategy";
  if (value === "shopper-behavior") return "shopper_behavior";
  return null;
}
