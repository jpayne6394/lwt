# HV1.2 Anti-Drift Guardrails

Codex must use this file before any HV1.2 audit, implementation, debugging, refactor, visual update, or QA pass.

## Core Rule

HV1.2 is not a normal page cleanup. It is a locked, art-directed Shopify Hydrogen homepage build.

Codex must implement the approved direction. Codex must not invent a new direction.

## Source Priority Order

When sources conflict, use this order:

1. User's latest explicit feedback in GitHub issues or current task.
2. `AGENTS.md`.
3. `docs/codex/CODEX_BRAIN_INDEX.md`.
4. HV1.2 GitHub docs.
5. Figma handoff safe zones and export names.
6. Existing repo code patterns.
7. Codex judgment.

Codex judgment is last, not first.

## Required Read Before Work

Before changing code, Codex must read:

```txt
AGENTS.md
docs/codex/CODEX_BRAIN_INDEX.md
docs/hv1.2/HV1_2_HOME_SOURCE_OF_TRUTH.md
docs/hv1.2/HV1_2_SECTION_MAP.md
docs/hv1.2/HV1_2_VISUAL_RULES.md
docs/hv1.2/HV1_2_ANTI_DRIFT_GUARDRAILS.md
```

For visual work, also read:

```txt
docs/hv1.2/HV1_2_SAFE_ZONES_AND_ASSET_CONTRACT.md
docs/hv1.2/HV1_2_ASSET_MANIFEST.md
docs/hv1.2/HV1_2_FIGMA_CODEX_PLUGIN_WORKFLOW.md
docs/hv1.2/source/export-map.md
docs/hv1.2/source/safe-zones-desktop.md
docs/hv1.2/source/safe-zones-mobile.md
```

If one of these files is missing, report the missing file and continue only with audit or structure work.

## Approved Visual Direction

Keep:

- deep navy hero/footer/feature moments
- cream/off-white commerce and story fields
- warm gold and amber signal graphics
- biotech/wellness motifs: orbit, radar, molecule, node, helix, filament
- luxury wellness tone
- live Shopify/Hydrogen commerce content
- cohesive page flow from top to footer

Do not drift into:

- generic SaaS landing page
- cold sci-fi dashboard
- spa stock-template look
- all-dark page
- flat white product grid
- full-page screenshot implementation
- random CSS decoration instead of approved art assets

## User Correction Lock

Latest visual correction:

```txt
1. Cream/light sections need more warm biotech/signal graphics.
2. Dark featured product band must be larger and more pronounced.
```

This correction is tracked in issue #44 and must be reflected before final visual QA passes.

## Live Content Rule

These must remain live HTML/React, not baked into images:

```txt
navigation
announcement text
headlines
paragraphs
CTA buttons
quick links
practitioner cards
product cards
product names
prices
reviews/stars
benefit labels
blog cards
footer links
newsletter form
legal text
```

## Asset Rule

Approved runtime graphics must live in versioned asset paths such as:

```txt
public/hv1.2/home/
```

Codex may use placeholders only for structure work. Placeholders must be reported as placeholders. Placeholders do not count as final visual implementation.

## Figma Rule

Figma is a handoff source, not the production site.

Codex may use Figma to inspect:

- safe zones
- restricted graphic areas
- export slice names
- visual reference
- rough coordinates

Codex must not directly translate the Figma bitmap into a flat webpage.

## Implementation Drift Tests

Before marking work complete, answer these yes/no questions:

```txt
1. Did I read the required docs?
2. Did I stay inside the assigned ticket scope?
3. Did I preserve the locked section order?
4. Did I keep content live instead of baking it into art?
5. Did I use approved assets or report missing assets?
6. Did I avoid inventing visual motifs not in the source direction?
7. Did I preserve Shopify data behavior where available?
8. Did I avoid changing unrelated routes?
9. Did I run or report available verification commands?
10. Did I state remaining blockers honestly?
```

If any answer is no, the task is not done.

## Stop Conditions

Stop and report instead of implementing if:

- approved reference image is missing
- safe-zone files are missing for a visual task
- required assets are missing for a final art task
- Figma and GitHub docs conflict
- repo route structure cannot be identified
- package scripts cannot be found
- Shopify data source is unclear and the task requires real data

## Done Report Requirement

Every HV1.2 response from Codex must include:

```md
## Summary

## Sources Read

## Files Changed

## Commands Run

## Scope Check

## Remaining Drift Risks

## Status
```

Allowed status values:

```txt
audit only
blocked
structure only
needs assets
needs safe-zone review
preview-ready
ready for review
```
