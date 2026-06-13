# Background Art Contract

The `lwt-int-v1` interior system must use provided background artwork as the decorative wrapper layer. Do not recreate the approved art direction as CSS-only signal graphics.

## Intent

Interior pages should feel like one continuous art piece. Individual sections are defined by dark navy and warm cream content zones, but the signal graphics, wave lines, orbital arcs, glow points, and transitions should visually flow down the page.

## Implementation Contract

Each `lwt-int-v1` section must expose:

- `bg_image`: provided background artwork image
- `bg_position`: explicit focal position
- `bg_size`: cover, contain, full width, or full height
- `bg_opacity`: controlled opacity for readability
- `flow_position`: top, middle, bottom, continuous, or none

The shared background snippet owns the layer order:

1. section shell and color zone
2. provided background artwork
3. optional faint fallback signal layer only when needed
4. content shell above all background layers

## Rules

- Use provided background art assets for the real visual wrapper.
- Do not use full-page mockup screenshots as backgrounds if they contain baked text, cards, forms, buttons, or commerce UI.
- Do not bake translatable or editable content into background images.
- Background art must stay behind content and respect safe zones.
- Background image dimensions, crop, position, and section padding must be coordinated so the art appears to flow across adjacent sections.
- CSS-generated signal graphics are allowed only as a low-emphasis fallback or bridge, not as the primary art replacement.

## Asset Need

The current reference folder contains full-page mockups. For production implementation, provide or create background-only artwork assets/crops per page zone, without baked UI text or cards, so Shopify can render content natively over them.
