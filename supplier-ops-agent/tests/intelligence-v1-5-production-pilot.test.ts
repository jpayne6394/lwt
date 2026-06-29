import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("v1.5 production pilot runbook covers Render env, schema, jobs, and guardrails", async () => {
  const [runbook, renderYaml, packageJson, schemaSql] = await Promise.all([
    readFile("docs/LWT_INTELLIGENCE_CENTER_V1_5_PRODUCTION_PILOT.md", "utf8"),
    readFile("render.yaml", "utf8"),
    readFile("package.json", "utf8"),
    readFile("src/storage/schema.sql", "utf8"),
  ]);
  const scripts = JSON.parse(packageJson).scripts as Record<string, string>;

  assert.match(renderYaml, /startCommand: npm run start/);
  assert.match(renderYaml, /healthCheckPath: \/healthz/);
  assert.match(renderYaml, /key: DATABASE_URL/);
  assert.match(renderYaml, /key: INTERNAL_DASHBOARD_AUTH_REQUIRED\s+value: "true"/);
  assert.match(renderYaml, /startCommand: npm run intelligence:inventory/);
  assert.match(renderYaml, /startCommand: npm run intelligence:daily-bi/);
  assert.match(renderYaml, /startCommand: npm run intelligence:content-radar/);
  assert.match(renderYaml, /startCommand: npm run intelligence:product-strategy/);
  assert.match(renderYaml, /startCommand: npm run intelligence:shopper-behavior/);

  for (const scriptName of [
    "intelligence:inventory",
    "intelligence:daily-bi",
    "intelligence:content-radar",
    "intelligence:product-strategy",
    "intelligence:shopper-behavior",
  ]) {
    assert.ok(scripts[scriptName], `${scriptName} script should exist`);
  }

  for (const tableName of [
    "intelligence_runs",
    "content_ideas",
    "shopper_behavior_imports",
    "shopper_search_terms",
    "shopper_recommendations",
    "action_items",
    "action_notes",
    "weekly_briefs",
  ]) {
    assert.match(schemaSql, new RegExp(`create table if not exists ${tableName}`));
  }

  for (const requiredText of [
    "Render setup checklist",
    "Required environment variables",
    "Optional environment variables",
    "Database setup and migration notes",
    "Internal auth behavior",
    "How to import reports",
    "How to add recommendations to Action Queue",
    "How to generate and export the Weekly Brief",
    "Go/no-go checklist",
    "What remains intentionally manual",
    "What is not implemented yet",
    "No Shopify theme or storefront edits",
    "No custom Shopify pixel",
    "No live GA4 or Search Console ingestion",
    "No user-level shopper tracking",
  ]) {
    assert.match(runbook, new RegExp(requiredText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
