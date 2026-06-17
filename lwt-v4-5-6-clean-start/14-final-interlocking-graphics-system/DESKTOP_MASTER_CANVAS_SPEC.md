# Desktop Master Canvas Spec

## Canvas

Desktop master canvas width: `1440px`.

The desktop/tablet system should be painted as one coordinated vertical composition at `1440px` wide, then exported into section slices. The master canvas keeps seam geometry consistent across the full page.

## Export Method

Export each desktop section slice from the same master canvas:

- maintain exact shared seam coordinates
- include required top and bottom bleed
- keep coded content zones clean
- do not flatten text, buttons, cards, stats, product cards, model rail, or footer into the art

Each slice should retain the same `1440px` width unless a specific internal card graphic is intentionally exported at a smaller asset size.

## Section Order And Suggested Slice Heights

Suggested desktop slice heights are planning estimates. Final values should be updated after the final mockup and art are measured.

1. Hero: `720-820px`
2. Story: `820-960px`
3. Trust background support: `140-220px`
4. Practitioners: `640-780px`
5. Model: `700-840px`
6. Technology/Catalog outer background: `780-920px`
7. Final CTA: `420-560px`
8. Footer handoff: handled by coded footer or final CTA bottom bleed

Internal card graphics:

- Technology card full-body human graphic: card-specific export, not a page-wide slice
- Catalog card internal graphic: card-specific export, not a page-wide slice

## Bleed Requirements

Every section slice that touches another background slice should include enough shared visual bleed to hide browser rounding differences:

- top bleed: `24-48px` of shared context when the top seam contains art
- bottom bleed: `24-48px` of shared context when the bottom seam contains art
- hard coded bars may use smaller bleed if the surrounding background is flat or intentionally quiet

Bleed must not create visible duplicate motifs when slices stack.

## No-Gap Stacking Rules

Desktop section slices must stack with:

- no section margin
- no section padding added by the background wrapper
- no border
- no fade overlay
- no spacer element between slices
- no repeated background unless explicitly approved for a flat texture

The coded section content may have its own layout padding inside safe zones, but that padding must not create a visual gap between background slices.

## Rendering Rules

Use this rendering rule where exact seam alignment matters:

```css
background-size: 100% auto;
background-position: top center;
background-repeat: no-repeat;
```

Avoid `background-size: cover` for final interlocking desktop/tablet seams because cover scaling can crop or scale one slice differently from its neighbor.

For tablet widths, keep the same desktop/tablet slices only if the mockup remains structurally similar and the art remains legible. If the art compresses or the safe zones collapse, add tablet-specific exports instead of forcing the desktop image.
