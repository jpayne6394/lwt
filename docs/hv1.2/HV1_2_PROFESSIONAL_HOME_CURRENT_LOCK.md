# HV1.2 Professional Homepage Current Lock

This file supersedes older HV1.2 interlocking graphics / graphics-pack instructions for the active `/hv1-home` build.

## Current Active Decision

HV1.2 is now the professional homepage approach:

```txt
Figma = design/layout source of truth
GitHub = code source of truth
Codex = implementation agent only
Hydrogen/Oxygen = preview and QA surface
```

This is **not** the old interlocking background-art workflow.

## Active Build Target

```txt
Route: /hv1-home
Scope: homepage only
Status: preview-only until user approval
Publish: forbidden
Dawn/theme edits: forbidden
```

## Active Homepage Order

```txt
1. Announcement bar
2. Header / navigation
3. Hero
4. Quick links
5. About Living Well Today
6. Practitioners / consultation
7. Shop by goal
8. Product rail 1
9. Dark featured product band
10. Product rail 2
11. Wellness insights
12. Final consultation CTA
13. Footer
```

## Active Design Approach

Use a professional live Hydrogen/CSS implementation:

- deep navy hero/header/footer
- warm cream body
- restrained gold/olive accents
- editorial serif headings
- clean sans-serif UI/body
- professional cards
- real Shopify Storefront API product data
- live HTML text, CTAs, navigation, footer, cards, product titles, product prices, product images, and product links

## Explicitly Inactive / Quarantined For This Build

Do not use these older approaches for the current `/hv1-home` implementation:

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

## Figma Rule

Figma is used for the professional layout contract, not as a runtime graphics dependency.

Figma owns:

- layout hierarchy
- section order
- component proportions
- spacing rules
- responsive behavior
- safe content zones
- design tokens
- visual reference

Figma does **not** provide runtime background slices for this build.

## GitHub / Codex Rule

Codex must implement the current Figma/spec direction in Hydrogen. It must not infer from older HV1.2 graphics documents unless the task explicitly says to inspect legacy context.

Allowed implementation paths:

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

## Required QA

Before claiming done, Codex must report:

```txt
npm run build
targeted lint for changed files
/hv1-home returns 200
screenshots at 390, 749, 750, 989, 990, 1024, 1440
preview URL
confirmation no publish occurred
confirmation Dawn/theme files were untouched
confirmation old graphics/interlocking/Figma-slice dependencies were not used
```

## Source Priority

For the active HV1.2 professional homepage build, source priority is:

```txt
1. This file
2. AGENTS.md
3. docs/hv1.2/HV1_2_LEGACY_ISOLATION_MANIFEST.md
4. Current Figma professional homepage layout/spec
5. Current Codex task prompt
```

Older HV1.2 files may remain in the repository for history, but they are not active source of truth unless explicitly promoted again.
