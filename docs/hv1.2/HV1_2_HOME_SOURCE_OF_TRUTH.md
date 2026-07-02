# HV1.2 Homepage Source of Truth

This file is the locked working memory for the Living Well Today HV1.2 homepage.

## What HV1.2 Means

HV1.2 is a fresh homepage-only graphics and implementation handoff for the Living Well Today Shopify Hydrogen proof-of-concept storefront.

It is not a full-site redesign, an About page package, or a generic theme cleanup.

## Primary Goal

Create a premium, conversion-focused Living Well Today homepage in Hydrogen that matches the approved art-directed direction:

- luxury biotech signal art
- warm wellness tone
- deep navy and cream/off-white structure
- warm gold and amber signal accents
- molecule, node, orbit, radar, helix, and fine filament motifs
- premium controlled glow
- live React content layered over controlled background art
- real Shopify product and collection data where available

## Target Image

The visual target should live at:

`/docs/hv1.2/source/homepage-target.png`

If this file is missing, Codex must stop and report that the target image is missing before claiming an exact visual match.

## Scope

Homepage only.

Allowed:

- homepage route/component work
- homepage styling
- homepage data loaders
- homepage assets under a versioned HV1.2 folder
- docs and QA reports

Not allowed unless explicitly requested:

- broad site redesign
- changing unrelated pages
- replacing approved visual direction
- using a screenshot as the live site

## Required Homepage Flow

1. Announcement/header support
2. Hero slideshow/banner
3. Quick links
4. About Living Well Today / company bio
5. Meet Practitioners + Book Now / consult CTA
6. Shop by Goal
7. Product collection rail
8. Dark featured product band
9. Second collection/product rail
10. Wellness Insights / blog previews
11. Small booking CTA
12. Footer close

## Core Visual Direction

The page should feel like one cohesive art-directed page, not a stack of unrelated React sections.

Use:

- deep navy fields for hero, footer, and dark feature moments
- cream/off-white fields for readable commerce and content sections
- warm gold/amber signal lines and glow
- subtle molecule/node/orbit/radar/helix accents
- controlled visual movement through background art
- live text, cards, and products over background assets

Avoid:

- cold sci-fi look
- generic SaaS gradients
- fake interface panels
- fake product cards
- fake pricing
- fake article cards
- random CSS doodles as replacement for approved art
- too much darkness across the full page
- overdone waves everywhere

## Critical Locked Detail

The large gold wave/swoop/interlock belongs around the About / Practitioner / Consult transition, not randomly in the hero.

Hero should stay premium, clean, and commerce-friendly.

## Implementation Principle

The approved design is a visual contract. Codex should implement it with live Hydrogen components and controlled assets, not reinterpret it.
