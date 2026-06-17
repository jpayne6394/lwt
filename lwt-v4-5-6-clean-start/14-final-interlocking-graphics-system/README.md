# LWT V4.5.6 Final Interlocking Graphics System

Purpose: isolated planning and specification package for the final LWT V4.5.6 About graphics system.

This folder does not contain live Shopify theme work. It defines how final art should be created, sliced, reviewed, and eventually tested before any real About page integration is considered.

## Decision From #29

Issue #29 recorded decision B:

Desktop/tablet interlocking works, but mobile needs separate mobile slice exports.

The proof showed that separate desktop/tablet section slices can align with a measured seam gap of `0px` when exported from matched geometry and rendered at the same width. At mobile width, the seam still aligned geometrically, but the desktop slices compressed into shallow bands. Mobile therefore needs its own master canvas and mobile-specific slice exports.

## Source Of Truth

The user-provided mockup is the locked structure. This package is not inventing a new layout. The graphics system exists to support the mockup structure with coordinated background art, seam handoffs, safe zones, and section-specific slices.

## Scope

Create final graphics specifications only:

- desktop/tablet interlocking section slices
- separate mobile interlocking section slices
- coordinated seam geometry
- real HTML/Liquid content above background art
- no baked text, buttons, cards, stats, product cards, model rail, or footer

## Guardrail

Do not start live theme work from this folder yet. Do not modify the real About page, publish, or touch active Shopify `/assets`, `/sections`, or `/templates` as part of this package.
