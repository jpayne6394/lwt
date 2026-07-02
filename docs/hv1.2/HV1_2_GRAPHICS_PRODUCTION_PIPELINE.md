# HV1.2 Graphics Production Pipeline

Codex and collaborators should use this file before any homepage visual implementation.

## Core Production Rule

Do not start by coding a normal stacked homepage and decorating sections. HV1.2 starts with approved art direction, then controlled assets, then Hydrogen implementation.

## Working Pipeline

1. Build a reference board for palette, line behavior, glow restraint, biotech motifs, premium dark/light transitions, and commerce-safe quiet space.
2. Generate motif ingredients only: orbit fields, molecule networks, signal filaments, subtle helix accents, gold/amber line systems, glow plates, and seam studies.
3. Approve motifs by functional role: hero anchor, perimeter accent, seam bridge, quiet-field texture, feature-band energy, footer close.
4. Rebuild or clean approved motifs in Photoshop and Illustrator so they become controlled production assets.
5. Compose zone masters.
6. Create desktop and mobile variants intentionally; do not rely on scaled desktop crops.
7. Map safe zones for copy, CTAs, practitioner cards, product rails, goal tiles, blog cards, and footer content.
8. Export section or zone slices with stable filenames.
9. Package assets under versioned paths and document them in the manifest.
10. Give Codex a constrained implementation prompt.

## Zone Masters

Use four masters unless the approved design requires a documented exception.

- Zone A: header, announcement support, hero, quick links.
- Zone B: About, practitioner trust, booking/consult transition.
- Zone C: shop by goal, product rails, dark featured product band, recovery back to light commerce.
- Zone D: wellness insights, small booking CTA, footer close.

## Tool Roles

- Figma: orchestration, section guides, safe-zone annotations, slices, design handoff.
- Photoshop: final raster composition, glows, gradients, masks, atmosphere, texture plates.
- Illustrator: orbit rings, radar arcs, molecule networks, helix fragments, vector overlays.
- AI image tools: motif and texture exploration only.
- Codex: repo implementation only.

## First Production Files

Expected source file family:

```txt
HV1_Graphics_Master.fig
HV1_ZoneA.psd
HV1_ZoneB.psd
HV1_ZoneC.psd
HV1_ZoneD.psd
HV1_Overlays.ai
HV1_Safe_Zones.pdf or markdown/json equivalent
HV1_Asset_Manifest.json
```

## First Motif Families To Generate

Start with only these three before expanding:

1. Hero dark family.
2. Light commerce family.
3. Dark-to-light seam family.

These determine the page language. Do not generate every section at once.

## First Safe Zones To Map

Map these before any final implementation:

1. Hero copy and CTA zone.
2. Practitioner card zone.
3. Product rail card zone.
4. Dark featured band product and copy zones.

## Implementation Handoff Rule

Codex should not invent, recolor, crop, or approximate missing production art. If an asset or safe-zone map is missing, Codex must report the gap and stop at audit or structure work.
