import assert from "node:assert/strict";
import test from "node:test";

import { generateBlogBriefMarkdown } from "../src/agents/blogBriefAgent.ts";
import { createIntelligenceService } from "../src/agents/intelligenceService.ts";
import { renderAdminPage } from "../src/server/admin-ui.ts";
import { MemoryRepository } from "../src/storage/memory-repository.ts";
import type { ContentIdea } from "../src/agents/intelligenceTypes.ts";

const fixtureIdea: ContentIdea = {
  id: "idea_magnesium_test",
  topic: "magnesium",
  sourceSummary: "manual: magnesium",
  suggestedTitle: "How to Think About Different Forms of Magnesium",
  productTieIn: "Magnesium and mineral support products",
  complianceRisk: "Low",
  complianceReason: "No high-risk medical claims detected.",
  saferAngle: "Keep this educational and focused on practitioner-guided wellness support.",
  suggestedCta: "Explore practitioner-guided wellness support",
  status: "idea",
  createdAt: "2026-06-28T12:00:00.000Z",
};

test("content idea status can be approved and rejected without changing the idea text", async () => {
  const repository = new MemoryRepository();
  await repository.saveContentIdeas([fixtureIdea]);
  const service = createIntelligenceService({
    repository,
    sourceConfig: {},
    topics: ["magnesium"],
  });

  const approved = await service.updateContentIdeaStatus("idea_magnesium_test", "approved");
  assert.equal(approved.status, "approved");
  assert.equal(approved.suggestedTitle, fixtureIdea.suggestedTitle);

  const rejected = await service.updateContentIdeaStatus("idea_magnesium_test", "rejected");
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.topic, "magnesium");
});

test("blog brief generation creates compliance-safe markdown from a content idea", () => {
  const brief = generateBlogBriefMarkdown(fixtureIdea);

  assert.match(brief, /# How to Think About Different Forms of Magnesium/);
  assert.match(brief, /## Suggested Outline/);
  assert.match(brief, /## Compliance Risk/);
  assert.match(brief, /Low/);
  assert.match(brief, /Explore practitioner-guided wellness support/);
  assert.doesNotMatch(brief, /\bcure\b/i);
  assert.doesNotMatch(brief, /\btreat your condition\b/i);
});

test("source settings expose manual fallback copy and editable radar settings", async () => {
  const repository = new MemoryRepository();
  const service = createIntelligenceService({
    repository,
    sourceConfig: {},
    topics: ["magnesium"],
    radarSettings: {
      topicClusters: ["magnesium"],
      keywords: ["glycinate"],
      excludedTerms: ["cure"],
      subreddits: ["Supplements"],
      xQueries: ["magnesium sleep"],
      searchQueries: ["magnesium forms"],
      scanFrequencyNotes: "Weekly while using manual fallback.",
      listeningSeeds: [
        {
          topic: "magnesium",
          priority: "high",
          audienceQuestion: "Which magnesium form fits my evening routine?",
          reactionThemes: ["People compare morning feel and stomach comfort."],
          objectionThemes: ["Worried about picking the wrong form."],
          personalExperienceAngles: ["Switched forms after stomach discomfort."],
          popularStructurePatterns: ["Question hook -> comparison -> checklist -> practitioner CTA"],
          safeBlogAngles: ["Magnesium forms explained through routine questions"],
          relatedProducts: ["Magnesium Glycinate"],
          relatedCollections: ["Magnesium"],
        },
      ],
    },
  });

  const sources = await service.getSources();
  assert.equal(sources.x.message, "Not configured - using manual fallback only.");
  assert.deepEqual(sources.x.missingEnvVars, ["X_BEARER_TOKEN"]);

  const dashboard = await service.getDashboard();
  assert.deepEqual(dashboard.sourceSettings.topicClusters, ["magnesium"]);
  assert.deepEqual(dashboard.sourceSettings.excludedTerms, ["cure"]);
  assert.equal(dashboard.sourceSettings.listeningSeeds?.[0].audienceQuestion, "Which magnesium form fits my evening routine?");
  assert.equal(dashboard.sourceSettings.scanFrequencyNotes, "Weekly while using manual fallback.");

  const html = renderAdminPage({
    activePath: "/intelligence",
    suppliers: [],
    runs: [],
    changes: [],
    issues: [],
    alerts: [],
    intelligence: dashboard,
  });
  assert.match(html, /Social listening seeds/);
  assert.match(html, /magnesium/);
  assert.match(html, /Which magnesium form fits my evening routine/);
});
