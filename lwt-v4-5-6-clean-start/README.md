# LWT April V4.5.6 Clean Start

This folder is an isolated planning/build area for the Living Well Today About page wrapper/background refresh.

## Purpose

This area keeps the V4.5.6 work away from older V5.5, V4.5, and wrapper-test experiments.

No active Shopify theme files should be changed from this folder until a section task is explicitly approved.

## Current strategy

- Shopify remains the runtime.
- Dawn is not the visual reference.
- The refreshed About page uses section-level background art wrappers.
- Wrappers are atmosphere only, not layout engines.
- Content remains real Liquid/HTML above the wrapper art.
- Implementation should proceed section by section.

## Folder map

```text
lwt-v4-5-6-clean-start/
  README.md
  00-strategy/
  01-source-assets/
  02-codex-tasks/
  03-qa/
```

## Guardrail

Do not touch `/assets`, `/sections`, `/templates`, homepage, header, announcement bar, footer, cart, products, or global CSS during clean-start planning.
