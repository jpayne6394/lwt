# Codex Operating Brain — Living Well Today / LWT

Codex must read this file before implementing, editing, debugging, refactoring, or preparing pull requests in this repository.

## Role Split

- GPT / ChatGPT is the creative director, product architect, source reviewer, and QA judge.
- Codex is the repository implementer.
- Codex should not invent product strategy, redesign approved visuals, or silently replace missing assets with generic code effects.

## Current Priority

Primary active track: **HV1.2 Shopify Hydrogen/Oxygen homepage**.

HV1.2 means a fresh, clean homepage graphics and implementation handoff for the Living Well Today Hydrogen proof-of-concept storefront.

## Required HV1.2 Guardrail Files

For HV1.2 work, Codex must use:

```txt
docs/codex/CODEX_BRAIN_INDEX.md
docs/hv1.2/HV1_2_ANTI_DRIFT_GUARDRAILS.md
docs/hv1.2/HV1_2_CODEX_PROMPT_LIBRARY.md
docs/hv1.2/HV1_2_PR_GATE_CHECKLIST.md
```

## Non-Negotiable Rules

1. Read the relevant `/docs` brain files before changing code.
2. Audit first. Do not start implementation before identifying the route, components, data loaders, assets, and likely risks.
3. Do not redesign approved visual direction.
4. Do not use a full-page screenshot as the live website.
5. Do not bake real text, navigation, buttons, product cards, practitioner cards, reviews, prices, or Shopify UI into background images.
6. Use live React/Hydrogen components over approved background assets.
7. Use Shopify product/collection/article data where available instead of fake commerce data.
8. Report missing assets instead of inventing generic CSS doodles, fake SVG motifs, or placeholder visuals.
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
- For HV1.2 visual work, compare desktop and mobile against `/docs/hv1.2` requirements.

## Project Tone

Living Well Today should feel premium, warm, clinical-but-human, luxury wellness, biotech signal, commerce-friendly, and trustworthy. Avoid cold sci-fi, generic SaaS templates, cluttered stock-medical design, or overdone decorative noise.
