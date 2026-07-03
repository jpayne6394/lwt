# HV1.2 Codex Prompt Library

Use these prompts instead of vague instructions like `make the homepage match the image`.

## Active Figma Handoff File

Use this active Figma file:

```txt
https://www.figma.com/design/6MHyPTYEcPuhjRUbszNcnT/Living-Well-Today-HV1.2-Homepage-Production-Handoff
```

Do not use the older empty file unless it is explicitly repaired:

```txt
https://www.figma.com/design/rMyO7aTz65TweOKflzmgZf
```

## Prompt 1 — Full Audit Only

```txt
Read AGENTS.md, docs/codex/CODEX_BRAIN_INDEX.md, and all HV1.2 docs listed there.

Read issue #43 for execution order.

Inspect the current repo and the active Figma handoff file:
https://www.figma.com/design/6MHyPTYEcPuhjRUbszNcnT/Living-Well-Today-HV1.2-Homepage-Production-Handoff

Do not edit files.
Do not implement.
Do not create assets.

Return:
1. sources read
2. Figma pages and node IDs found
3. approved reference status
4. safe-zone status
5. asset status
6. homepage route/component/data structure
7. exact files likely to change later
8. exact files not to touch
9. package scripts and verification commands
10. blockers and next ticket
```

## Prompt 2 — Source Lock Only

```txt
Complete issue #31 only.

Place the approved HV1.2 homepage reference in the required source location.
Do not edit implementation code.
Do not slice assets.
Do not claim final runtime art.

Report:
- Figma placement status
- repo source path status
- whether docs/hv1.2/source/homepage-target.png exists
- remaining source-lock blockers
```

## Prompt 3 — Safe-Zone Contract Only

```txt
Complete issue #33 only.

Read the active Figma handoff and local JSON contracts if present:
- app/lib/homepage/safe-zones.json
- app/lib/homepage/figma-handoff-contract.json

Create/update these files:
- docs/hv1.2/source/safe-zones-desktop.md
- docs/hv1.2/source/safe-zones-mobile.md
- docs/hv1.2/source/graphic-restricted-zones.md
- docs/hv1.2/source/export-map.md

Do not edit implementation code.
Do not invent measurements.
If a coordinate or node is missing, mark it BLOCKED and explain what is missing.

Return a section-by-section readiness table for all 12 homepage sections, including announcement/header support even if local JSON contracts only list 11 sections.
```

## Prompt 4 — Asset Gap Only

```txt
Complete issue #34 only.

Audit approved runtime assets and update:
- docs/hv1.2/HV1_2_ASSET_MANIFEST.md
- docs/hv1.2/source/asset-gap-report.md

Check local runtime manifests if present:
- app/lib/homepage/homepage-art-manifest.json
- app/lib/homepage/runtime-asset-map.json
- public/hv1/home/

Do not create fake assets.
Do not place experiments in public/hv1.2/home.
Do not edit implementation code.

Every required asset must have status: exists, missing, blocked, not needed, or exists-but-not-wired.
```

## Prompt 5 — Hydrogen Repo Audit Only

```txt
Complete issue #35 only.

Audit the repo for homepage route, loaders, components, styles, data queries, public asset paths, and package scripts.
Do not edit files.
Do not install packages.
Do not deploy.
Do not print environment variable values.

Return the exact audit template from issue #35.
```

## Prompt 6 — Structure Only

```txt
Complete issue #36 only.

Implement only the HV1.2 homepage skeleton and locked section order.
No final art.
No fake final product data.
No screenshot-as-page.

Use live Hydrogen/React components for every section.
Report missing assets as blockers, not as solved.
Run the available verification command from package.json.
```

## Prompt 7 — Zone A Only

```txt
Complete issue #37 only.

Implement Zone A only:
- announcement/header support
- hero slideshow/banner
- quick links

The hero must keep live HTML text and CTA buttons.
Do not put the large gold wave in the hero.
Do not lazy-load the first above-fold hero visual.
Use approved assets if available; otherwise report missing assets.
Do not edit other zones.
```

## Prompt 8 — Zone B Only

```txt
Complete issue #38 only.

Implement Zone B only:
- About Living Well Today
- practitioner cards
- booking/consult CTA

Keep cards and CTA live HTML/React.
Use the large gold wave/interlock only around this transition if approved assets exist.
Do not edit commerce rails or hero.
```

## Prompt 9 — Zone C Only

```txt
Complete issue #39 and account for issue #44.

Implement Zone C only:
- Shop by Goal
- product rail one
- enlarged dark featured product band
- product rail two

Use real Shopify product/collection data where available.
Keep product titles, prices, images, reviews, CTA text, and benefit labels live.
Make the featured band larger and more pronounced per issue #44.
Do not bake product cards into images.
```

## Prompt 10 — Zone D Only

```txt
Complete issue #40 only.

Implement Zone D only:
- Wellness Insights
- small booking CTA
- footer close

Use Shopify article data if available; otherwise documented fallback.
Keep footer links, legal text, and newsletter form live HTML/React.
Do not edit product rails or hero.
```

## Prompt 11 — Data Wiring Only

```txt
Complete issue #41 only.

Wire homepage data sources and fallback DTO.
Keep section order, asset paths, crop rules, safe zones, and layout math locked in code.
Do not expose positioning controls to Shopify Admin.
Do not hard-code final product prices.
Document every section's data source in docs/hv1.2/source/homepage-data-contract.md.
```

## Prompt 12 — Visual Correction Only

```txt
Complete issue #44 only.

Update docs/Figma handoff to account for:
1. more warm biotech/signal graphics in cream/light sections
2. larger, more pronounced dark featured product band

Do not implement code unless the issue specifically requests it.
Do not add random CSS graphics.
Protect product/practitioner/blog text areas.
Return exactly which assets and safe zones must change.
```

## Prompt 13 — QA Only

```txt
Complete issue #42 only.

Run QA against the HV1.2 docs.
Capture/check 390, 430, 768, 1024, 1280, and 1440 widths if tooling allows.
Run available build/lint/type/test commands.
Provide a pass/fail table.
Do not hide failures.
Do not publish production.
Do not claim exact match if assets, safe zones, source lock, or issue #44 are incomplete.
```

## Prompt 14 — Debugging Only

```txt
Debug only the reported failure.

Read AGENTS.md and CODEX_BRAIN_INDEX.md first.
Identify expected behavior, actual behavior, likely cause, minimal patch, and verification command.
Patch only the failure.
Do not redesign.
Do not refactor unrelated code.
Do not make visual improvements while debugging.
```

## Prompt 15 — PR Self-Review

```txt
Before opening or updating a PR, compare the work against:
- AGENTS.md
- docs/codex/CODEX_PR_CHECKLIST.md
- docs/hv1.2/HV1_2_ANTI_DRIFT_GUARDRAILS.md
- the assigned GitHub issue

Return:
1. assigned issue number
2. files changed
3. commands run
4. scope check
5. source docs read
6. unresolved blockers
7. whether the PR is audit-only, structure-only, preview-ready, or blocked
```

## Prompt 16 — Local Source Sync Only

```txt
Copy/sync the HV1.2 source docs into the active Hydrogen repo if they are missing locally.

Required local paths:
- AGENTS.md
- docs/codex/CODEX_BRAIN_INDEX.md
- docs/hv1.2/HV1_2_CODEX_PROMPT_LIBRARY.md
- docs/hv1.2/HV1_2_FIGMA_CODEX_PLUGIN_WORKFLOW.md
- docs/hv1.2/HV1_2_ANTI_DRIFT_GUARDRAILS.md

Do not implement homepage code.
Do not alter app/components or app/routes.
Report exactly which docs were copied and which were already present.
```
