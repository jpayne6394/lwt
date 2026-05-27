import assert from "node:assert/strict";
import test from "node:test";

import { createActionQueueService, normalizeActionInput } from "../src/action-queue/action-queue-service.ts";
import type { ActionQueueInput } from "../src/action-queue/types.ts";
import { MemoryRepository } from "../src/storage/memory-repository.ts";

const baseInput: ActionQueueInput = {
  source_workflow: "market-radar",
  source_agent: "BI",
  action_type: "PROMOTE",
  priority: "High",
  area: "Market Signals",
  title: "Promote magnesium sleep support",
  description: "Use stocked magnesium products in the next review-first campaign.",
  reason: "Market chatter and stocked catalog context support a campaign.",
  related_product_handle: "magnesium-glycinate",
  related_product_title: "Magnesium Glycinate",
  related_vendor: "Living Well Today",
  related_collection: "Sleep Support",
  related_campaign: "Sleep support email",
  risk_level: "Low",
  owner: "LWT",
  due_date: "2026-05-30",
  confidence_score: 0.86,
  source_payload: { signal_count: 4 },
  source_reference: "market_radar_1",
};

test("action queue normalizes every recommendation into the shared schema", () => {
  const normalized = normalizeActionInput(baseInput, "2026-05-27T12:00:00.000Z");

  assert.equal(normalized.source_workflow, "market-radar");
  assert.equal(normalized.source_agent, "BI");
  assert.equal(normalized.action_type, "PROMOTE");
  assert.equal(normalized.priority, "High");
  assert.equal(normalized.area, "Market Signals");
  assert.equal(normalized.status, "new");
  assert.equal(normalized.related_product_handle, "magnesium-glycinate");
  assert.equal(normalized.confidence_score, 0.86);
  assert.ok(normalized.dedupe_key.includes("market-radar"));
  assert.equal(normalized.occurrence_count, 1);
  assert.equal(normalized.created_at, "2026-05-27T12:00:00.000Z");
  assert.equal(normalized.updated_at, "2026-05-27T12:00:00.000Z");
});

test("action queue dedupes repeated recommendations instead of creating endless tasks", async () => {
  const repository = new MemoryRepository();
  const queue = createActionQueueService(repository);

  const first = await queue.enqueue(baseInput, "2026-05-27T12:00:00.000Z");
  const second = await queue.enqueue(
    {
      ...baseInput,
      reason: "Same product and campaign came back from a later run.",
      source_payload: { signal_count: 7 },
    },
    "2026-05-27T13:00:00.000Z",
  );
  const actions = await queue.listOpen();
  const events = await queue.listEvents();

  assert.equal(first.id, second.id);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].occurrence_count, 2);
  assert.equal(actions[0].reason, "Same product and campaign came back from a later run.");
  assert.equal(actions[0].last_seen_at, "2026-05-27T13:00:00.000Z");
  assert.ok(events.some((event) => event.event_type === "created"));
  assert.ok(events.some((event) => event.event_type === "deduped"));
});

test("action queue approve, edit, reject, and complete changes are logged", async () => {
  const repository = new MemoryRepository();
  const queue = createActionQueueService(repository);
  const action = await queue.enqueue(baseInput, "2026-05-27T12:00:00.000Z");

  const approved = await queue.approve(action.id, { actor: "Justin", note: "Approved for draft work." }, "2026-05-27T12:10:00.000Z");
  assert.equal(approved.status, "approved");

  const edited = await queue.edit(
    action.id,
    {
      actor: "Justin",
      note: "Tone it down.",
      updates: {
        title: "Draft magnesium sleep support campaign",
        priority: "Medium",
        description: "Draft only; do not send.",
      },
    },
    "2026-05-27T12:20:00.000Z",
  );
  assert.equal(edited.status, "edited");
  assert.equal(edited.title, "Draft magnesium sleep support campaign");
  assert.equal(edited.priority, "Medium");

  const rejected = await queue.reject(action.id, { actor: "Justin", note: "Not this week." }, "2026-05-27T12:30:00.000Z");
  assert.equal(rejected.status, "rejected");

  const completed = await queue.complete(action.id, { actor: "Justin", note: "Logged decision." }, "2026-05-27T12:40:00.000Z");
  assert.equal(completed.status, "done");

  const events = await queue.listEvents();
  assert.deepEqual(
    events.map((event) => event.event_type).slice(0, 5),
    ["completed", "rejected", "edited", "approved", "created"],
  );
  assert.ok(events.every((event) => event.actor));
  assert.ok(events.some((event) => event.note === "Not this week."));

  const completedLog = await queue.listCompleted();
  assert.equal(completedLog.length, 1);
  assert.equal(completedLog[0].status, "done");
});

test("action queue exports safe review data without executing Shopify or email work", async () => {
  const queue = createActionQueueService(new MemoryRepository());
  await queue.enqueue(baseInput, "2026-05-27T12:00:00.000Z");

  const json = await queue.exportJson();
  const csv = await queue.exportCsv();

  assert.equal(JSON.parse(json)[0].title, "Promote magnesium sleep support");
  assert.match(csv, /Action Type,Priority,Area,Title,Status/);
  assert.match(csv, /PROMOTE,High,Market Signals,Promote magnesium sleep support,new/);
  assert.doesNotMatch(csv, /shopify mutation/i);
  assert.doesNotMatch(csv, /send email/i);
});
