# Interior Section Build Rules

## Namespace

Use a fresh namespace for this pass: `lwt-int-v1`.

Reason: the active theme already contains many old `lwt-*`, V5.3, and V5.4 records. A short new namespace makes new work searchable and prevents template drift.

## Shopify Schema Rules

- Keep schema `name` values under 25 characters.
- Prefer names like `LWT Int Hero`, `LWT Int Band`, `LWT Int Grid`, `LWT Int CTA`.
- Avoid long section names such as `LWT collection spotlights V5`; this already caused Shopify upload failures.
- Keep setting IDs short and stable.
- Do not rely on translated admin labels to carry layout intent.
- Keep visible content in settings/blocks, not embedded inside background images.

## Background Wrapper Pattern

Every designed interior section should separate decorative background from content:

1. Outer section wrapper: spacing, theme tone, and overflow control.
2. Background layer: image, gradient, pattern, or atmospheric art with explicit position, size, inset, opacity, and mobile behavior.
3. Content shell: max width, grid/flex layout, readable text, controls, links, and Shopify data.
4. Safe-zone rules: content must never sit on top of busy background art without a readable surface or controlled contrast.

## Compact Rhythm

- Desktop vertical padding target: 44-72px for most interior sections.
- Mobile vertical padding target: 34-52px.
- Avoid homepage-scale hero spacing on interior pages.
- Keep content width controlled: `min(calc(100% - 32px), 1120px)` for most sections.
- Use stable image aspect ratios so backgrounds and content do not stretch unpredictably.
- Section media should be cropped intentionally with `object-fit`, `background-size`, and explicit focal positions.

## Content Area Rules

- Real text must be HTML/Liquid, not baked into PNG/JPG mockups.
- Buttons and links must be code-native anchors or Shopify controls.
- Product, collection, blog, account, cart, search, filters, sort, variants, and checkout behavior must remain native Shopify behavior.
- Content blocks should support blank-state behavior without collapsing spacing into awkward gaps.

## Translation And Render Blockers To Avoid

- No overlong schema names.
- No missing section files referenced by JSON templates.
- No mixed V5.3/V5.4 template records in the same page unless explicitly approved.
- No broad theme push and no `config/settings_data.json` push without explicit approval.
- No static screenshot sections where translated text, links, or dynamic Shopify data need to render.
- No layout that depends on one English string length; translated/edited content must wrap cleanly.
- No background art that becomes unreadable or misaligned when content wraps.
- No oversized vertical sections that look stretched because the background image controls the layout.

## Acceptance Checks

Before a section is considered ready:

- Desktop screenshot matches the mockup direction.
- Mobile screenshot has no overflow, clipping, or unreadable text.
- Console has no relevant errors or warnings.
- Shopify theme upload accepts every section file.
- JSON templates reference only existing section types.
- Padding, margins, image placement, and content safe zones are inspected visually.
