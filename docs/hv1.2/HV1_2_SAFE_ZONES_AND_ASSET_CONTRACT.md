# HV1.2 Safe Zones and Asset Contract

Codex must use this contract when implementing the homepage art system.

## Purpose

Safe zones convert the approved visual composition into a front-end contract. They tell code where live HTML content may sit without colliding with decorative art.

## Required Safe-Zone Fields

Each section should eventually have a documented entry with:

```txt
sectionId:
zone:
desktopAsset:
mobileAsset:
desktopAspectRatio:
mobileAspectRatio:
desktopContentBounds:
mobileContentBounds:
headlineBounds:
bodyBounds:
ctaGroupBounds:
cardRailBounds:
motifNoGoZones:
sectionMinHeight:
sectionPreferredHeight:
allowedCropBehavior:
mobileCropNotes:
seamNotes:
assetStatus:
```

## Content Density Inputs Needed

Before final design export, confirm:

- hero headline word range
- hero body word range
- hero CTA count
- quick link count
- practitioner card count
- goal tile count
- product count per rail
- featured product band content length
- article card count
- final booking CTA length
- footer column count

If these are unknown, Codex should not claim safe-zone finality.

## Locked vs Editable

Locked in design/code:

- background art
- section order
- asset mapping
- crop rules
- safe-zone coordinates
- visual density
- seam behavior

Editable in Shopify/Admin or local fallback:

- copy
- CTA labels and URLs
- selected products or collections
- practitioner records
- article selections
- merchant-managed images where explicitly modeled

## Asset Folder Target

Preferred runtime folder:

```txt
public/hv1.2/home/
```

If the existing repo already uses another HV1 public path, Codex must report the current convention and avoid breaking working paths.

## Naming Pattern

Use boring names that Codex and humans can verify:

```txt
hv1-2-home-zone-a-hero-bg-desktop-v01.webp
hv1-2-home-zone-a-hero-bg-mobile-v01.webp
hv1-2-home-zone-b-practitioner-bg-desktop-v01.webp
hv1-2-home-zone-c-feature-band-bg-desktop-v01.webp
hv1-2-home-zone-d-footer-bg-mobile-v01.webp
hv1-2-home-shared-orbit-rings-v01.svg
```

## Format Guidance

- Use AVIF or WebP for broad atmospheric background plates when quality is acceptable.
- Use PNG for alpha-sensitive overlays or fragile glow/line detail.
- Use SVG for simple vector motifs such as rings, nodes, linework, and icons.
- Use Shopify image components or Shopify image URLs only for Shopify-managed product, article, collection, or file-reference media.

## Missing Asset Rule

If a required asset does not exist, Codex must report:

```md
## Missing HV1.2 Asset

- Asset:
- Needed for:
- Current blocker:
- Fallback allowed: yes/no
- Risk to visual match:
```

## First Target Assets

Minimum useful set before art-system implementation:

- hero desktop background
- hero mobile background
- Zone B about/practitioner transition background
- Zone C light product field background
- Zone C dark featured band background
- Zone D insights/footer close background
- shared orbit/molecule/signal overlay motifs if used
