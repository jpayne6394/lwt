# Codex Operating Brain — Living Well Today / LWT

Codex must read this file before implementing, editing, debugging, refactoring, or preparing pull requests in this repository.

## Role Split

- GPT / ChatGPT is the creative director, product architect, source reviewer, and QA judge.
- Figma is the current professional homepage layout/design source of truth.
- GitHub is the code source of truth.
- Codex is the repository implementer.
- Codex must not invent product strategy, redesign approved visuals, create fake art, or silently replace missing assets with generic code effects.

## Current Priority

Primary active track: **HV1.2 Professional Shopify Hydrogen/Oxygen homepage**.

HV1.2 now means a fresh, clean, professional `/hv1-home` implementation based on the current Figma/spec direction, live Hydrogen/CSS, and live Shopify Storefront API product data.

This current track supersedes the older interlocking graphics / wave seam / full-page background art experiments for active implementation.

## Required HV1.2 Guardrail Files

For current HV1.2 professional homepage work, Codex must use these first:

```txt
docs/hv1.2/HV1_2_PROFESSIONAL_HOME_CURRENT_LOCK.md
docs/hv1.2/HV1_2_LEGACY_ISOLATION_MANIFEST.md
docs/hv1.2/HV1_2_ANTI_DRIFT_GUARDRAILS.md
docs/hv1.2/HV1_2_CODEX_PROMPT_LIBRARY.md
docs/hv1.2/HV1_2_PR_GATE_CHECKLIST.md
docs/hv1.2/HV1_2_REPO_INTERFERENCE_AUDIT.md
```

If older HV1.2 documents conflict with `HV1_2_PROFESSIONAL_HOME_CURRENT_LOCK.md`, the current-lock file wins.

## HV1.2 Ignore / Caution Areas

For HV1.2 professional homepage work, do not use these as source of truth unless the assigned issue explicitly says so:

```txt
lwt-v4-5-6-clean-start/
supplier-ops-agent/
render.yaml
```

These are legacy or separate operational materials and may confuse Codex during Hydrogen homepage work.

## Quarantined Legacy Instructions

For the active `/hv1-home` professional build, Codex must not follow older instructions involving:

```txt
interlocking background graphics
wave seam system
full-page background art
Figma export slices as runtime assets
V01 graphics pack
V02 graphics pack
baked full-page mockups
black seam patches
node 18:120 runtime usage
CSS/SVG fake biotech doodles
generated replacement art
fake UI
fake products
fake portraits
hard-coded product titles/prices/images
```

Old documents may remain in the repository for history, but they are not active source of truth unless the user explicitly reactivates them.

## Active HV1.2 Implementation Scope

Allowed implementation paths for the professional homepage task:

```txt
app/routes/hv1-home.tsx
app/components/home/Hv12HomePreviewPage.jsx
app/styles/hv1-home-manifest.css
app/data/hv1HomeContent.ts
app/data/hv1-launch-products.ts
app/lib/homepage/normalize-homepage.js
docs/hv1-homepage/**
```

Avoid unless absolutely required:

```txt
app/root.jsx
app/routes/_index.jsx
global Header/Footer/PageLayout
```

Do not touch:

```txt
Dawn/theme files
supplier-ops-agent/**
render.yaml
unrelated routes/components/styles
```

## Non-Negotiable Rules

1. Read the relevant `/docs` brain files before changing code.
2. Audit first. Do not start implementation before identifying the route, components, data loaders, assets, and likely risks.
3. Do not redesign approved visual direction.
4. Do not use a full-page screenshot as the live website.
5. Do not bake real text, navigation, buttons, product cards, practitioner cards, reviews, prices, or Shopify UI into background images.
6. Use live React/Hydrogen components and scoped CSS for the professional homepage.
7. Use Shopify product/collection/article data where available instead of fake commerce data.
8. Report missing assets instead of inventing generic CSS doodles, fake SVG motifs, fake portraits, or placeholder visuals.
9. Do not publish production or change live storefront settings unless explicitly instructed.
10. Preserve existing working routes and behavior unless the task explicitly says to change them.
11. Never commit secrets, tokens, `.env` values, Shopify private keys, preview auth secrets, or customer data.

## Default Work Mode

For any non-trivial task, use this pass order:

1. **Audit only** — read files, inspect repo, return plan, do not edit.
2. **Small implementation pass** — change the minimum files needed.
3. **Verification pass** — run available commands, inspect output, screenshot if possible.
4. **QA report** — list pass/fail against the source docs.
5. **Fix pass** — only fix verified gaps.

## Required Before Claiming Done

- List files changed.
- List commands run and results.
- State whether the result is production-ready, preview-only, or blocked.
- State any missing assets, missing Shopify data, or open visual mismatches.
- For HV1.2 professional homepage work, compare desktop and mobile against the current Figma/spec and `HV1_2_PROFESSIONAL_HOME_CURRENT_LOCK.md`.
- Confirm old graphics/interlocking/Figma-slice dependencies were not used.
- Confirm Dawn/theme files were not touched.
- Confirm no publish occurred.

## Project Tone

Living Well Today should feel premium, warm, clinical-but-human, luxury wellness, biotech signal, commerce-friendly, and trustworthy. Avoid cold sci-fi, generic SaaS templates, cluttered stock-medical design, overdone decorative noise, and fragile graphics dependencies.
