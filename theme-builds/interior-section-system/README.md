# Living Well Today Interior Section System

This area is the clean workspace for the next Living Well Today Shopify section build.

Branch: `codex/interior-section-system`

## Purpose

Build a fresh interior-page section system from the provided mockups while avoiding the old V4/V5/V5.3/V5.4 drift. The supplied mockups are the visual source for background wrapper crops, while page content remains native Shopify/Liquid content.

## Build Approach

- Create new Shopify sections with a new namespace instead of editing the old `lwt-*` pile.
- Use supplied mockup-derived background wrapper assets for atmosphere and image treatments.
- Keep all real page content code-native inside the content area: headings, copy, buttons, links, product cards, forms, collection data, and article data.
- Make the section rhythm compact and premium, not huge stretched bands.
- Validate desktop and mobile screenshots before pushing any Shopify theme changes.

## Working Folders

- `mockup-intake.md`: what to capture from each mockup before coding.
- `section-rules.md`: coding, spacing, translation, and Shopify schema rules.
- `section-manifest.json`: planned section namespace and initial section inventory.
- `theme/`: scoped Shopify theme files for the new `lwt-int-v1` interior system.

## Current Status

Initial `lwt-int-v1` preview build is implemented under `theme/`. It includes six new sections, a shared background wrapper snippet, mockup-derived PNG crops, and a validation script.

Verified locally on `/pages/about-us?view=lwt-int-preview`:

- six new sections render
- each section uses a supplied background asset or configured background image
- generated signal/wave fallback is not rendered
- no placeholder media panels render
- dark-section headings stay readable over the supplied art
- hero `Explore products` link navigates to `/collections/all`
