# HV1.2 Approved Locked Visual Reference

This file records the instruction from the approved HV1.2 production handoff PDF.

## Locked Reference Rule

The HV1.2 approved homepage reference is locked as the visual direction.

The reference bitmap is **not** final runtime art.

Codex must not treat the bitmap as a one-piece website screenshot to ship. It must use the handoff frames, safe-zone layers, no-go regions, and export layers for implementation.

## Implementation Meaning

Codex must:

- preserve the approved visual direction
- use live HTML/React content for text, buttons, navigation, cards, products, and footer content
- use approved background slices and export layers for art
- respect live HTML safe zones
- avoid graphic no-go regions
- stop and report missing handoff frames or assets instead of inventing replacements

## Required Source Placement

The approved visual reference or handoff files should be placed in:

```txt
docs/hv1.2/source/
```

The target reference image expected by existing HV1.2 docs is:

```txt
docs/hv1.2/source/homepage-target.png
```

## Figma Installer Note

`FigmaSetup.exe` is a local installer, not a project source file. It should not be committed to the repository.
