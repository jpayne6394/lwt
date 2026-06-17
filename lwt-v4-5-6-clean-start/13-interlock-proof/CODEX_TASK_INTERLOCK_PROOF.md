# Codex Task — V4.5.6 Interlock Proof in Shopify/Dawn

## Goal

Run a quick Shopify/Dawn proof of the LWT V4.5.6 interlocking section-slice theory.

This is a temporary proof. Do not modify the real About page.

## Correct repo

`jpayne6394/lwt`

## Correct folder

`lwt-v4-5-6-clean-start/13-interlock-proof/`

## Source ZIP

Use the provided local ZIP:

`LWT_V4_5_6_INTERLOCK_PROOF_ASSETS.zip`

Expected PNGs:

- `lwt-v456-interlock-proof-master-canvas.png`
- `lwt-v456-interlock-proof-hero-slice.png`
- `lwt-v456-interlock-proof-story-slice.png`
- `lwt-v456-interlock-proof-seam-guide.png`

## Theory being tested

Two separate section assets can interlock if they are exported from the same master canvas and rendered at matching width with no gap.

This test must prove whether Shopify/Dawn can render them as one continuous visual handoff.

## Temporary Shopify test files

Create only temporary proof files:

```text
sections/lwt-v456-interlock-proof.liquid
assets/lwt-v456-interlock-proof.css
templates/page.lwt-v456-interlock-proof.json
```

Copy only these temporary proof assets into Shopify `/assets`:

```text
assets/lwt-v456-interlock-proof-hero-slice.png
assets/lwt-v456-interlock-proof-story-slice.png
assets/lwt-v456-interlock-proof-master-canvas.png
assets/lwt-v456-interlock-proof-seam-guide.png
```

## Guardrails

Do not touch:

- homepage
- existing About page
- header
- announcement bar
- footer
- cart
- product templates
- global CSS
- existing active About implementation
- existing V4.5.6 isolated packages
- Belle Isle Outpost/JRS/lwt-ds work

Do not publish.
Do not claim live-ready.
Do not create V5.5 files.

## Implementation rules

1. Render two separate stacked background slices, not one full-page image.
2. Use real HTML placeholder content above the backgrounds.
3. Do not bake text/buttons/cards into the image.
4. No gap between slices.
5. No border between slices.
6. No overlay/fade between slices.
7. Do not use `background-size: cover` for this desktop proof.
8. Use `background-size: 100% auto`.
9. Use `background-position: top center`.
10. Use `background-repeat: no-repeat`.
11. Use aspect ratios matching the source slices:
    - Hero slice: `1440 / 720`
    - Story slice: `1440 / 780`
12. Remove inherited Dawn section padding/gap inside this proof only.
13. Scope all CSS under the proof section root.

## QA

Create/assign test page:

`templates/page.lwt-v456-interlock-proof.json`

Capture screenshots at:

- 390
- 749
- 750
- 989
- 990
- 1024
- 1440

## Required report

Report:

- issue worked
- files created/changed
- assets copied
- preview route/URL
- whether the seam aligns at 1440
- whether the seam aligns at 1024
- whether it breaks at mobile widths
- screenshots captured
- confirmation no forbidden files were touched
- recommendation:
  - A) interlocking slices work in Shopify and should become the graphics system
  - B) desktop works but mobile needs separate mobile slices
  - C) Shopify/Dawn constraints still interfere

Stop after this proof. Do not modify the real About page.
