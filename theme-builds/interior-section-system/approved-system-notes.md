# Approved Interior System Notes

These notes consolidate the approved visual language and component systems for the `lwt-int-v1` Shopify section build.

## Theme Direction

Working theme direction: `LWT Final Theme v5.4 - Warm Signal-Tech Wellness`.

The visual identity should feel like a premium wellness platform where practitioners, technology, and curated products work together.

The site must communicate:

- advanced guided wellness
- trusted practitioner support
- modern but gentle technology
- curated premium products
- a calm, capable, trustworthy brand presence

Emotional mix:

- 40% premium clinical trust
- 25% warmth and comfort
- 20% signal-tech / biofeedback sophistication
- 15% commerce polish

Design translation:

- deep navy shells for authority and signal-tech atmosphere
- cream / soft stone content zones for warmth and readability
- gold / copper accent for CTAs and premium emphasis
- soft organic imagery to balance the technical feel
- restrained motion language implied through arcs, wave lines, orbit rings, and dot constellations

## Relationship To Homepage

The homepage is the visual parent system. Interior pages must feel like they belong to it.

Do not modify the homepage itself as part of this project. Do not copy homepage code blindly. Use the homepage as a style benchmark only.

Interior pages should inherit the homepage language through:

- rounded framed shells
- elegant typography hierarchy
- trust strips
- CTA banners
- soft wave transitions
- dark/cream alternation
- curated product section rhythm

## Approved Visual Language

Core elements:

- Dark hero shells on About, Services, Technology, Contact, Shop, Product, and Brands.
- Warm cream content bodies for reading and commerce areas.
- Gold/copper emphasis for primary CTAs.
- Rounded containers that feel soft, premium, and controlled.
- Signal-tech graphics: arcs, dots, soft lines, orbital glows, biofeedback motifs, and subtle constellations.
- Warm human imagery that feels calm and credible.

Density rule: polished and structured, not overstuffed. Use enough detail to feel premium, but avoid clutter.

## Interior Hero System

Purpose: create a repeatable hero pattern that adapts across About, Services, Technology, Contact, Shop, Product, and Brands.

Core structure:

- dark shell background
- constrained content container
- two-zone split: copy zone + visual zone
- bottom wave or soft transition into cream field
- signal-tech atmospheric graphics

Copy zone contents:

- eyebrow / breadcrumb or section label
- H1
- support paragraph
- primary CTA
- secondary CTA or link
- optional quick value icons / micro points

Visual zone contents vary by page:

- practitioner scene
- product cluster
- single device
- envelope/contact illustration
- product hero
- brand/professional portrait

Ratio guidance:

- Desktop copy zone about 42%, visual zone about 58%.
- Tablet/mobile may stack or adapt the split.
- Decorative art must never crush the copy area.

Bottom transition: use a soft wave, curved edge, or gentle separator instead of a harsh straight cut.

## Wave Transition System

Purpose: bridge dark hero shells into cream content areas.

Look:

- soft, premium, flowing
- signal-inspired, not beachy or whimsical
- cream transition may have subtle gold line accents

Implementation options:

- CSS pseudo-element with SVG mask/background
- reusable asset wrapper
- section-specific background image

Rule: transitions must not create large dead space or visible pixelation.

## Signal Background System

Purpose: provide subtle signal-tech ambient language across the interior experience.

Motifs:

- orbital rings
- molecule/dot networks
- fine flowing lines
- soft radial glow points
- minimal schematic / biofeedback hints

Placement rules:

- keep behind or around content, not over it
- emphasize edges and corners
- respect readability
- vary density so every page is not identical

Performance rule: build as lightly as possible. Multiple layered effects must not cause lag or visual clutter.

## Proof / Trust Strip System

Purpose: reassure users with fast, scannable trust statements.

Typical content types:

- years of experience
- practitioner-led care
- non-invasive guidance
- secure checkout
- science-backed products
- curated quality
- ongoing support

Layout guidance:

- compact horizontal strip on desktop
- stack or wrap responsibly on mobile
- consistent icon sizing
- avoid novelty icons

Placement options:

- directly after hero
- near bottom before CTA
- under commerce sections

## Consult CTA System

Purpose: create a strong repeated conversion module across interior pages.

Core pattern:

- dark navy shell
- concise headline
- short supporting copy
- one strong primary button
- one optional secondary button or supporting link
- light signal graphics and/or small emblem treatment

Placement:

- final CTA band on most pages
- mid-page only when relevant

Tone: confident, inviting, and action-oriented, not generic salesy ecommerce.

## Product Card System

Purpose: maintain a refined product-card experience across shop landing, collections, related products, and supporting rows.

Required content hierarchy:

1. badge, optional
2. product image
3. brand
4. product title
5. support subtitle or short descriptor
6. price / compare-at if needed
7. rating count if available
8. add-to-cart button
9. optional view details link

Visual guidance:

- clean cream card surface
- rounded corners
- clear image area
- disciplined metadata spacing
- consistent CTA placement

Card consistency rule: individual cards should not become wildly different heights unless the product template forces it.

## Practitioner Card System

Purpose: represent practitioners as expert, approachable, and central to the brand.

Card contents:

- portrait
- name
- role / positioning
- short descriptor
- best-for bullets or focus areas
- profile / book CTA

Visual guidance:

- warm and credible portrait treatment
- readable contrast
- premium card shell
- avoid stiff directory-list styling

## Brand Card System

Purpose: present brands as curated partners, not just logos floating on a page.

Card guidance:

- clear logo presentation
- consistent spacing and radius
- subtle border or surface depth
- arrow affordance or browse cue if appropriate

Browse grid behavior:

- cards align cleanly in a grid
- alpha filters and search sit above the grid cleanly

## FAQ System

Purpose: give users concise clarity without page bloat.

Rules:

- clean accordion styling
- readable touch targets
- concise question labels
- hide unnecessary clutter
- support a `View all FAQs` link when relevant

Styling:

- FAQ rows match radius and border language
- avoid default/plain browser-looking accordions

## Implementation Boundary

Use these notes to build new `lwt-int-v1` sections and supporting styles. Do not modify homepage as part of this project. Do not bake live/translatable copy into background images. Do not push `config/settings_data.json` or broad Shopify theme changes without explicit approval.
