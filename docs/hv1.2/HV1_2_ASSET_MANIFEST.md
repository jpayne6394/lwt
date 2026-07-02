# HV1.2 Asset Manifest

This manifest tells Codex what assets should exist before a final visual implementation is claimed complete.

## Source Target

Expected target image:

`docs/hv1.2/source/homepage-target.png`

If this is missing, Codex should say the exact target image is not available in the repo.

## Recommended Asset Folders

```txt
public/hv1.2/
  backgrounds/
  motifs/
  icons/
  screenshots/
```

## Background Assets Needed

Desktop:

- hero background
- About / practitioner transition background
- light product field background
- dark featured band background
- insights / lower page background
- footer dark background

Mobile:

- hero background
- About / practitioner transition background
- product field background
- dark featured band background
- footer background

## Motif Assets Needed

- subtle molecule/node motif
- orbit/radar ring motif
- warm gold signal filament motif
- subtle helix accent
- section seam or wave accent

## Asset Rules

- Use versioned paths under `public/hv1.2`.
- Keep live content separate from background art.
- Use web-friendly formats such as WebP, PNG, or SVG depending on the asset.
- Use descriptive file names.
- Do not overwrite older approved assets without a clear version note.

## Missing Asset Report Format

When assets are missing, Codex should report:

```md
## Missing HV1.2 Assets

- Asset:
- Needed for section:
- Current fallback:
- Risk to visual match:
```
