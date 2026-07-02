# HV1.2 Research Source Index

This index records the uploaded research reports that inform the HV1.2 Codex brain files.

## Primary Source Reports

### 1. Living Well Today HV1 Homepage Graphics Pack Production Plan

Use as the main source for the production pipeline.

Key decisions:
- HV1 is an internal LWT Hydrogen proof-of-concept name, not a public design system.
- Build zone masters first.
- Export art-directed desktop and mobile slices.
- Document safe zones.
- Give Codex a locked implementation brief.
- Use AI for motif ingredients, not finished pages.

### 2. Shopify Hydrogen Art Directed Storefront Implementation Plan for Living Well Today HV1

Use as the main source for Hydrogen implementation architecture.

Key decisions:
- The homepage must not become generic stacked React sections with decorative backgrounds.
- Use locked art bands with HTML content zones.
- Use a single homepage route and normalized loader DTO.
- Put locked static art in `public/hv1/`.
- Use Shopify Admin for text, links, selected products/collections, and repeatable cards.
- Keep positioning, safe zones, asset filenames, and section order locked in code.
- Use Oxygen preview as the approval mechanism.

### 3. Professional Graphics Pack Workflow for a Shopify Hydrogen Homepage

Use as the main source for design-tool workflow.

Key decisions:
- Figma orchestrates layout, slices, safe-zone annotations, and handoff.
- Photoshop owns final raster master composition.
- Illustrator owns reusable vector motifs.
- AI is constrained to supporting source material and motif exploration.
- Create one desktop master and one mobile master, then slice.

### 4. HV1 Homepage Graphics Pack Research Brief

Use as the main source for scope and brief framing.

Key decisions:
- Homepage graphics pack only comes first.
- The target is a premium Shopify Hydrogen storefront with luxury biotech signal art, warm wellness tone, and conversion-focused commerce sections.
- Lock the homepage order before implementation.
- Track content-density needs before final art.
- Separate locked background art from Shopify-editable content.

### 5. HV1 Graphics Pack Specification for Deterministic Codex Implementation

Use as the later-stage source for asset governance and validation.

Key decisions:
- Do not ask Codex to infer HV1.
- Use a locked asset contract.
- Use manifests, schemas, hashes, and validation once production assets exist.
- Treat this as stage-two governance after the visual production pack exists.

## Research Priority Order

1. First priority: production graphics pack and art-directed homepage implementation.
2. Second priority: Hydrogen/Oxygen architecture and Shopify data wiring.
3. Third priority: deterministic asset governance, CI, hashing, and broader platform packaging.

## Codex Use

Codex should read this index, then read the specific operating files under `/docs/hv1.2` rather than trying to infer instructions from raw research reports.
