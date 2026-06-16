# LWT V4.5.6 QA Checklist

## Required screenshots

For each implemented section and final page review, capture:

- 390
- 749
- 750
- 989
- 990
- 1024
- 1440

## Per-section visual checks

- Correct wrapper asset is used.
- Section looks distinct from the other sections.
- Light-section graphics remain visible.
- Content is readable without killing the art.
- Background position/crop is intentional at mobile, tablet, and desktop.
- Top/bottom seams feel connected to adjacent sections.
- Section keeps its assigned mood.

## Failure conditions

Reject if:

- wrapper repeats another section visually
- light graphics vanish in browser
- content sits on a high-noise hotspot
- important motif is cropped badly
- section feels like default Dawn with a background slapped on
- broad global CSS was changed
- old V5.5 files were created
- homepage/header/footer/cart/product files were touched without approval

## Required Codex report

Codex must report:

- files changed
- wrapper asset used
- background-size / background-position desktop, tablet, mobile
- overlay added, if any
- screenshots returned
- known issues or compromises
- confirmation no forbidden files were touched
