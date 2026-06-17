# Final Graphics Spec

## Goal

Build a final interlocking graphics system for the LWT V4.5.6 About experience that supports the locked mockup structure. The graphics must feel like one coordinated page composition, not a stack of unrelated section wallpapers.

This is a specification package only. It does not generate final assets and does not wire anything into Shopify.

## Locked Structure

The mockup is the source of truth. The page order is locked:

1. Hero
2. Story
3. Coded Trust proof bar
4. Practitioners
5. Living Well Today Model
6. Technology + Catalog feature cards
7. Final CTA
8. Footer

The graphics support that structure. They must not reshape, replace, or reinterpret it.

## Visual Direction

The final page should use one major navy, cream, and gold motion gesture at the Hero to Story transition. That gesture is the primary visual signature. Do not repeat giant waves in every section.

Light sections should stay clean, structured, and readable. Their graphics should use faint navy or blue-gray linework, stronger gold linework where emphasis is needed, and subtle olive or bronze accents. Background art should live in edges, seams, corners, and open fields, while content zones stay calm.

The Technology card may contain the full-body bio-signal human graphic. That figure belongs inside the coded Technology card composition, not as a general page background motif.

## Interlocking Slice Method

The graphics system uses exported background slices from master canvases:

- one desktop/tablet master canvas at `1440px` width
- one mobile master canvas at `390px` or `430px` width

Each section receives its own slice. Adjacent slices are exported from shared geometry so the bottom of one slice matches the top of the next. Slices must stack with no gap, border, overlay, or fade when rendered at the matching width.

For desktop/tablet seams where exact alignment matters, render slices with:

```css
background-size: 100% auto;
background-position: top center;
background-repeat: no-repeat;
```

Do not use `background-size: cover` for exact seam proofs or approved final seam rendering.

## Background Art Vs Coded UI

Background art may include:

- swoops, seams, and soft fields
- diagnostic orbit lines
- molecular lattice hints
- faint botanical or vitality linework
- subtle data rails
- edge/corner texture
- internal non-text feature-card illustration art

Coded UI must remain real HTML/Liquid/CSS and must not be baked into PNGs:

- headings and body copy
- buttons and links
- cards and card borders
- trust proof stats or labels
- practitioner cards
- model rail and model steps
- product/catalog cards
- final CTA copy and buttons
- footer content

## Final Asset Requirements

The final system needs:

- desktop master canvas reference
- desktop section slices
- mobile master canvas reference
- mobile section slices
- seam guide references for desktop and mobile
- safe-zone overlays for desktop and mobile
- export manifest with exact dimensions after art production

Every exported slice should be traceable to the master canvas, the section it supports, the coded content that sits above it, and the seam rules that govern its top and bottom edges.
