# HV1.2 Hydrogen Implementation Lock

This file converts the research into implementation rules for Codex.

## Diagnosis

The repeated failure mode is building the homepage as generic stacked React sections with decorative backgrounds. HV1.2 must instead be implemented as art-directed bands and live content overlays.

## Architecture Rule

Use one primary homepage route and a normalized homepage data object.

Recommended shape:

```txt
app/
  components/home/
    HomePage.tsx
    ArtDirectedBand.tsx
    HeroOverlay.tsx
    ProductRail.tsx
    PractitionerGrid.tsx
    ConsultCtaBand.tsx
  lib/homepage/
    normalize-homepage.ts
    homepage-fallback.ts
    breakpoints.ts
    safezones.ts
  routes/
    ($locale)._index.tsx or the existing homepage route
public/hv1/
  home/
    hero/
    zones/
    sections/
    overlays/
```

Codex must adapt to the actual existing repo structure after audit, but this is the preferred direction.

## Data Rule

The homepage loader should gather homepage composition data once and return a flattened DTO that components can render without ad hoc extra homepage queries.

Use Shopify data this way:

- product rails: Storefront API product or collection data
- collection navigation: Storefront API collection data or approved handles
- practitioner cards: Shopify metaobjects or documented fallback
- homepage copy and CTA labels: Shopify metaobjects or documented fallback
- blog/insights: Shopify article data if available, otherwise documented fallback

## Locked In Code

Keep these locked in code or versioned config:

- section order
- breakpoints
- safe-zone coordinates
- max text widths
- overlay stacking
- card grid rules
- animation rules
- background art filenames
- crop behavior
- asset-to-section mapping

## Editable In Shopify Admin

Allow these to be editable when data wiring is ready:

- text
- URLs
- CTA labels
- practitioner entries
- selected collections
- selected products
- article selections
- practitioner portraits or merchant-managed images when appropriate

## Asset Placement

Locked HV1.2 homepage art belongs under versioned public paths, preferably:

```txt
public/hv1.2/home/
```

Existing project conventions may use `public/hv1/`; Codex should audit first and report the chosen path before implementation.

Use standard `picture` and `img` patterns for static art-directed assets. Use Hydrogen image tooling for Shopify-managed product, collection, article, or file-reference images.

## Hero Rule

The hero is likely the critical first visual. It should use in-markup art direction where possible, not a late-discovered generic CSS background. It needs explicit desktop/mobile sources, stable dimensions or aspect ratio, and a safe overlay zone.

## Section Band Rule

Transition bands, product fields, practitioner fields, and footer art can use CSS backgrounds or layered decorative images when they are not content-bearing, but each must have a known section role and safe-zone behavior.

## Oxygen Approval Rule

Oxygen preview is the approval surface. Codex may prepare preview-ready code and report preview/deploy commands, but must not publish production unless explicitly instructed.

## Verification Rule

Before saying done, Codex should report:

- route status
- files changed
- assets used
- data sources used
- fallback behavior
- desktop and mobile checks
- missing assets
- commands run
- whether the result is audit-only, preview-ready, blocked, or needs visual QA
