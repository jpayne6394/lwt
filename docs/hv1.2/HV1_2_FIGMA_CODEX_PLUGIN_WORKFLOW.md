# HV1.2 Figma + Codex Plugin Workflow

This file explains how Codex should use the Figma plugin for the HV1.2 homepage.

## Active Figma File

The active handoff file is:

```txt
https://www.figma.com/design/6MHyPTYEcPuhjRUbszNcnT/Living-Well-Today-HV1.2-Homepage-Production-Handoff
```

Expected local contract pages:

```txt
00 Approved Visual Reference
01 Desktop Master
02 Mobile Master
03 Desktop Export Slices
04 Mobile Export Slices
05 Safe Zones
06 Codex Handoff
```

## Deprecated / Empty Figma File

Do not use this file for HV1.2 implementation unless it is manually repaired:

```txt
https://www.figma.com/design/rMyO7aTz65TweOKflzmgZf
```

Codex audit reported this file as empty from connector inspection: page `0:1`, 0x0 canvas, 1x1 screenshot.

## What Figma Is For

Figma is the design handoff surface. It is not the production website and not the source of Shopify data.

Use Figma for:

- approved visual reference
- desktop safe zones
- mobile safe zones
- graphic restricted zones
- section/export slice names
- visual QA reference
- design-to-code inspection

## What GitHub / Repo Docs Are For

GitHub/repo docs remain the source of truth for implementation rules, Codex guardrails, asset paths, Hydrogen code, and final exported runtime assets.

Codex must read repo docs before reading Figma.

## Codex Order of Operations

1. Read `/AGENTS.md`.
2. Read `/docs/codex/CODEX_BRAIN_INDEX.md`.
3. Read all listed HV1.2 docs.
4. Open/inspect the active Figma handoff file with the Figma plugin.
5. Identify pages, node IDs, frames, safe zones, restricted graphic zones, and export slice names.
6. Do not implement yet.
7. Return an audit report with missing assets and implementation plan.

## Figma Plugin Is Not Permission To Drift

Even with the Figma plugin, Codex must not:

- redesign the page
- invent final art
- use the reference bitmap as the live site
- guess hidden mobile crops
- ignore safe-zone boundaries
- ignore restricted graphic zones
- fake product data
- overwrite Shopify/Hydrogen behavior unrelated to the homepage

## Figma Plugin Audit Prompt

Use this prompt in Codex:

```txt
Read AGENTS.md, docs/codex/CODEX_BRAIN_INDEX.md, and all HV1.2 docs listed there.

Then inspect this active Figma file with the Figma plugin:
https://www.figma.com/design/6MHyPTYEcPuhjRUbszNcnT/Living-Well-Today-HV1.2-Homepage-Production-Handoff

Do not edit code yet.

Return:
1. Figma pages and node IDs found
2. approved reference status
3. desktop safe zones found
4. mobile safe zones found
5. restricted graphic zones found
6. export slice names found
7. missing Figma handoff pieces
8. current Hydrogen homepage route/component/data structure
9. implementation plan by pass
10. verification commands from package.json
```

## Implementation Rule

Codex may use Figma measurements and screenshots to guide implementation, but final code must use live Hydrogen/React components, Shopify data, and approved exported runtime assets from the repo.
