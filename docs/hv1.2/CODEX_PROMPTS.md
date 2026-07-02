# HV1.2 Codex Prompts

Use these prompts from Codex when working on the HV1.2 homepage.

## Pass 1 — Audit Only

```txt
Read AGENTS.md, docs/codex, and docs/hv1.2.

Audit the existing Hydrogen repo for the HV1.2 homepage build.

Do not edit files yet.

Return:
1. current route and component structure relevant to the homepage
2. files that should change
3. files that should not change
4. missing assets needed to match docs/hv1.2/source/homepage-target.png
5. section-by-section implementation plan
6. verification commands available from package.json
7. risks that could block the visual match
```

## Pass 2 — Homepage Structure

```txt
Implement only the HV1.2 homepage structure and design tokens.

Use docs/hv1.2 as the source of truth.

Build the homepage as live Hydrogen/React components with this order:
- announcement/header
- hero slideshow/banner
- quick links
- About Living Well Today
- practitioners + booking CTA
- shop by goal
- product rail one
- dark featured product band
- product rail two
- wellness insights
- small booking CTA
- footer close

Do not perfect final graphics yet.

Done when the route renders, section order is correct, desktop and mobile do not break, and available checks pass.
```

## Pass 3 — Art System

```txt
Implement the HV1.2 art-directed background system.

Use live content over background assets.

Required look:
- deep navy hero/header/footer areas
- cream/off-white content fields
- warm gold/amber signal lines
- molecule, node, orbit, radar, and helix accents
- controlled glow
- one cohesive flowing page
- cream/gold transition around About and practitioner area
- dark featured product band connected visually to product rows

Use assets only from versioned HV1.2 asset folders.
If an asset is missing, document the gap instead of claiming final visual match.
```

## Pass 4 — Shopify Data

```txt
Wire HV1.2 homepage data using existing Hydrogen patterns.

Homepage needs:
- product rail one
- product rail two
- shop by goal links
- featured product band
- wellness insight cards if article data exists

Use real Shopify data where available and document fallback behavior.
Do not disturb unrelated store routes.

Return:
- queries changed
- fallback behavior
- files changed
- commands run
```

## Pass 5 — QA

```txt
Run a visual and technical QA pass for HV1.2.

Check:
- route loads
- desktop layout
- mobile layout
- section order
- missing assets
- data fallbacks
- build/lint/type commands available in package.json

Return a pass/fail table against docs/hv1.2.
```
