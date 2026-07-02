# HV1.2 No-Figma Workflow

This project does not require a paid Figma workflow.

Figma is useful as a design handoff canvas, but it is optional. If the user does not want to pay for design tools, Codex should use the GitHub docs, approved reference image, safe-zone markdown, and exported assets as the handoff source.

## What Replaces Figma

Use these files instead:

```txt
docs/hv1.2/source/homepage-target.png
docs/hv1.2/HV1_2_HOME_SOURCE_OF_TRUTH.md
docs/hv1.2/HV1_2_SECTION_MAP.md
docs/hv1.2/HV1_2_SAFE_ZONES_AND_ASSET_CONTRACT.md
docs/hv1.2/HV1_2_ASSET_MANIFEST.md
docs/hv1.2/HV1_2_VALIDATION_GATES.md
```

## No-Figma Handoff Pack

Minimum required handoff without Figma:

```txt
docs/hv1.2/source/homepage-target.png
docs/hv1.2/source/approved-reference-notes.md
docs/hv1.2/source/safe-zones-desktop.md
docs/hv1.2/source/safe-zones-mobile.md
docs/hv1.2/source/no-go-zones.md
docs/hv1.2/source/export-map.md
public/hv1.2/home/... approved exported runtime assets
```

## What Codex Can Do

Codex can:

- audit the existing repo
- identify homepage routes and components
- create section structure
- wire Shopify data
- build React/Hydrogen components
- implement responsive CSS
- use approved assets
- run tests and builds
- take screenshots when the environment supports it
- compare the coded page against docs and references

## What Codex Should Not Do Alone

Codex should not:

- invent the final art direction
- treat the screenshot as the final live page
- guess hidden mobile crops
- invent missing assets
- decide safe zones without a source or explicit markdown contract
- fake product data when Shopify data exists
- replace missing visuals with generic CSS decoration and call it complete

## Practical Low-Cost Path

1. Keep the approved visual reference in GitHub.
2. Use markdown safe-zone files instead of Figma annotations.
3. Use exported images or generated background slices only after approval.
4. Let Codex implement the Hydrogen page from these docs.
5. Use Oxygen preview screenshots for approval.

## Codex Rule

If Figma files are missing, Codex should not block all work. It may proceed with audit, structure, and data wiring. It must stop before claiming exact visual match if the approved assets, safe zones, or export map are missing.
