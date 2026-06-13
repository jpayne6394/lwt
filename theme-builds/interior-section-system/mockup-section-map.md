# Mockup To Section Map

Source mockups were reviewed locally from `C:/Users/Justin/OneDrive/Desktop/James River Supply Co/interior 5.6 mockups/`. Do not upload the image files to this public repository unless the repo is made private or explicit approval is given.

## Shared Visual System

- Palette: deep navy, warm cream, gold accents, white/cream cards, subtle blue clinical shadows.
- Typography: large serif headings, compact sans body and UI labels.
- Motifs: gold signal waves, hex/node networks, orbital rings, line icons, soft botanical/product photography.
- Layout: compact interior sections with controlled wrappers, not stretched homepage-scale bands.
- Content model: background art supports the section; all readable content, links, forms, product data, filters, and buttons remain code-native.

## Reusable Section Families

### 1. `lwt-int-hero-v1`

Used by: About, Contact, Brands, Shopping landing, ZYTO, Product grid, Services, Product page top support area.

Purpose: Compact interior hero with dark navy atmosphere, optional background/foreground media, heading, copy, CTAs, and optional proof items.

Key rules:
- Content shell sits above a decorative background wrapper.
- Media/image focal point has explicit position and mobile behavior.
- Desktop padding: 56-72px, except product pages where native product section owns vertical rhythm.
- Mobile padding: 40-52px.
- Do not bake heading or CTA text into hero image.

### 2. `lwt-int-card-grid-v1`

Used by: Contact help cards, service plan cards, brand cards, support cards, FAQ/utility cards.

Purpose: Compact cards with icon, heading, body, link/button, optional badges, and optional dark/cream variants.

Key rules:
- Cards must support 2, 3, or 4 columns desktop and stacked mobile.
- Icons are code-native SVG/inline icon slots or Shopify images, not hardcoded into background art.
- Use stable min heights only where needed; content drives height within compact limits.

### 3. `lwt-int-proof-strip-v1`

Used by: About stats row, product grid trust strip, product page shipping/guarantee strip, brands trust strip, footer-adjacent proof rows.

Purpose: A compact proof/trust band with 3-5 items, icons, labels, and short copy.

Key rules:
- Dark and cream variants.
- Must wrap cleanly on mobile.
- Use real text for proof labels, not raster labels.

### 4. `lwt-int-split-v1`

Used by: About story, ZYTO remote setup, ZYTO dashboard/info, product page tech/catalog promos.

Purpose: Two-column content/media module with optional background art and compact card framing.

Key rules:
- Content and media columns have explicit gaps.
- Background media is decorative; section image is optional content media.
- Mobile stacks with media after copy unless the mockup requires otherwise.

### 5. `lwt-int-process-v1`

Used by: About model, Services how it works, ZYTO consult process.

Purpose: Horizontal step/timeline module with icons, labels, and short body copy.

Key rules:
- Desktop supports 4-5 steps.
- Mobile can become stacked cards or horizontal scroll depending on content length.
- Decorative connector line must not determine section height.

### 6. `lwt-int-cta-v1`

Used by: About final CTA, Contact next-step banner, Brands consult CTA, Services next-step CTA, Product page final CTA.

Purpose: Compact conversion band with title, body, one or two CTAs, optional icon/emblem, and decorative background.

Key rules:
- Do not make CTA bands taller than needed.
- CTAs must remain code-native links.
- Mobile layout puts text before buttons and preserves safe contrast.

### 7. Commerce-Native Wrappers

Used by: Shopping landing, product grid, product page.

Purpose: Style around existing Shopify product, collection, filter, sort, pagination, product form, variant, selling plan, cart, and checkout behavior.

Key rules:
- Do not replace native filters, sort, pagination, product form, media gallery, variant pickers, quantity, add-to-cart, buy-now, or checkout behavior with custom static sections.
- New sections can frame page intros, goal bars, product rails, trust rows, and CTAs.
- Product cards may use a shared snippet/style layer, but data stays Shopify-native.

## Page Blueprints

### About

- Hero: `lwt-int-hero-v1` with practitioner consult image and gold wave background.
- Story/history: `lwt-int-split-v1` with compact timeline and rounded media.
- Proof row: `lwt-int-proof-strip-v1` with 4 stats.
- Practitioners: card grid or dedicated practitioner variant of `lwt-int-card-grid-v1`.
- Model/process: `lwt-int-process-v1` with 4 pillars.
- Feature promos: two `lwt-int-split-v1` cards or a compact promo grid.
- Final CTA: `lwt-int-cta-v1`.

### Contact

- Hero: `lwt-int-hero-v1` with envelope/contact motif.
- Help choices: `lwt-int-card-grid-v1` with 4 cards.
- Form/contact info: keep Shopify/contact form native inside a compact wrapper; add contact info side card and map placeholder/media.
- FAQ: native collapsible rows or `lwt-int-card-grid-v1` accordion variant.
- Phone CTA and next-step CTA: `lwt-int-cta-v1`.

### Brands

- Hero: `lwt-int-hero-v1` with practitioner/lab image and standard card overlay.
- Featured brands: compact logo rail section.
- Browse brands: new brand grid section only if brand data is stable; otherwise use Shopify collections/vendors where possible.
- Why these brands: `lwt-int-proof-strip-v1` plus compact icon cards.
- Consult CTA: `lwt-int-cta-v1`.

### Shopping Landing

- Hero: `lwt-int-hero-v1` with product still life.
- Goal/category bar: compact code-native link rail.
- Practitioner picks, best sellers, new arrivals: Shopify collection product rails, not static product cards.
- Product type/solution promos: compact card grid with image slots.
- Newsletter: compact dark CTA with input.

### ZYTO

- Hero: `lwt-int-hero-v1` with device image and technology proof items.
- What is ZYTO: `lwt-int-split-v1` plus proof strip.
- Process: `lwt-int-process-v1` with 5 steps.
- Remote setup and initial consult: `lwt-int-split-v1` cards.
- Practitioner interpretation: `lwt-int-proof-strip-v1`/card row.
- Beyond ZYTO: compact support cards.
- Important note: slim notice band.
- Final CTA: `lwt-int-cta-v1`.

### Product Grid / Collection

- Collection hero: `lwt-int-hero-v1` or collection-header variant.
- Goal rail: compact link rail above native product grid.
- Native collection grid and filters stay intact.
- Trust strip and final CTA: `lwt-int-proof-strip-v1`, `lwt-int-cta-v1`.

### Services

- Hero: `lwt-int-hero-v1` with consult image.
- Service options: `lwt-int-card-grid-v1` with pricing/feature variant.
- Practitioner chooser: practitioner card grid plus guide CTA card.
- Included/powered-by-ZYTO: split/proof modules.
- How it works: `lwt-int-process-v1`.
- Product support rail: Shopify product rail.
- FAQ and final CTA.

### Product Page

- Native product media/form remains the core product section.
- Add dark background wrapper styling around native product form only if it does not break media, variants, selling plans, or checkout.
- Shipping/trust row: `lwt-int-proof-strip-v1`.
- Accordions: native product info/metafield rows.
- Pairs well/related products: Shopify product recommendations or collection rails.
- Promo cards and final CTA: `lwt-int-split-v1`, `lwt-int-cta-v1`.

## Implementation Guardrails

- Start with reusable section CSS and 5-6 flexible sections rather than one file per mockup block.
- Assign templates only after the section files validate.
- Keep old V5.3/V5.4 files untouched until the new path is verified.
- Do not push `config/settings_data.json`.
- Do not broad-push to Shopify; use explicit paths and `--nodelete`.
