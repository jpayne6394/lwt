# LWT April V4.5.6 — Wrapper Translation Guide

## Purpose

This is the clean-start guide for replacing the repeating About-page wrappers with a diversified section-level wrapper/background art system.

## Core decision

Continue using wrappers, but only as **section-level atmospheric background assets**.

Do not use:
- one giant full-page bitmap as layout
- repeated same-style wrappers across every section
- wrapper art that contains text, cards, CTAs, products, or layout-critical elements

Use:
- distinct section backgrounds
- shared visual family
- measured top/bottom seam logic
- real Liquid/HTML content above the art
- section-by-section implementation and approval

## Section order

1. Hero
2. Story
3. Trust Band
4. Practitioners
5. Model
6. Technology Teaser
7. Catalog Teaser
8. Final CTA

## Global Codex rules

- This is April V4.5.6. Do not create V5.5 files.
- Keep this isolated from old wrapper experiments.
- Do not touch homepage, header, announcement bar, footer, product templates, cart, or global CSS during clean-start work.
- Build the actual premium frontend experience, not generic Dawn sections.
- Dawn is not the visual reference.
- Shopify/Liquid remains the runtime.
- Wrappers are background art only. Content stays real Liquid/HTML.
- All background images need explicit `background-size`, `background-position`, `background-repeat: no-repeat`, and breakpoint rules.
- Light-section graphics must remain visible in the final browser build and must not be washed out by opaque overlays.

## Layer contract

Each section should be layered as:

1. section background color
2. wrapper background image
3. optional overlay gradient or veil
4. content container
5. cards, buttons, images, chips, and CTAs

## QA widths

Screenshots required at:

- 390
- 749
- 750
- 989
- 990
- 1024
- 1440

## Failure conditions

Reject the section if:

- wrapper looks like another section’s wrapper
- light-section graphics vanish
- content sits on a high-noise hotspot
- important motif is cropped badly
- section feels like Dawn with a background slapped on
- section loses premium/custom/frontend feel

## Required Codex report

For each implemented section, report:

- section name
- files changed
- wrapper asset used
- desktop/tablet/mobile background sizing and position
- overlays added
- screenshots returned
- known issues or compromises
