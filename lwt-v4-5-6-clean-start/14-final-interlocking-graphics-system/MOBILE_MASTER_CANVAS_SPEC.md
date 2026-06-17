# Mobile Master Canvas Spec

## Canvas

Mobile master canvas width: `390px` or `430px`.

Use `390px` if the design is optimized around a narrow iPhone-style viewport. Use `430px` if the visual system needs a slightly wider modern-phone baseline. Once selected, keep the same width through mobile master art, mobile seam guides, and mobile slice exports.

## Why Mobile Needs Separate Slices

The #29 proof showed that desktop slices can maintain a `0px` seam gap at `390px`, but the desktop art compresses into shallow bands. That proves the seam technique works geometrically, not that the desktop assets are suitable mobile final art.

Do not simply compress desktop slices for mobile.

## Mobile Slice Method

Create mobile-specific section slices from a separate mobile master canvas:

- simplify large gestures
- increase vertical room where mobile content stacks
- preserve clean safe zones for single-column content
- move decorative detail to edges, corners, and background fields
- keep the Hero to Story gesture recognizable without overfilling the viewport

Mobile sections may be taller than their desktop counterparts because content stacks vertically.

## Mobile Section Behavior

Mobile slices should still interlock through coordinated seam geometry. The seam may be quieter than desktop, but it should not become a hard cut unless the coded mockup intentionally changes sections.

Expected mobile pattern:

- Hero and Story use a mobile-adapted major transition
- Trust bar background support is minimal because the trust bar is coded
- Practitioners and Model sections stay light and structured
- Technology/Catalog card art becomes simpler and more vertical
- Final CTA keeps open copy/button safe zones

## Mobile Safe Zones

Mobile content zones must be protected first. Background graphics should not compete with:

- stacked hero text
- right-media replacement or mobile media block
- story copy and timeline
- coded trust proof bar
- practitioner cards
- model rail or stacked model steps
- Technology and Catalog cards
- final CTA copy/buttons

## Mobile Seam Rules

Each mobile slice must define:

- top seam behavior
- bottom seam behavior
- whether a motif continues from the prior section
- whether a motif intentionally stops before coded UI
- whether extra height is required to avoid cramped art

Separate mobile slices are required whenever the desktop slice compresses, crops content-adjacent art, or pushes motifs into mobile safe zones.
