# Codex Prompt — Build Temporary Shopify Interlock Proof

Use this only after the four PNG assets are present in the proof source-assets folder.

```text
Run the LWT V4.5.6 interlocking section-slice Shopify proof.

Repo:
jpayne6394/lwt

Branch:
codex/v456-interlock-proof

Proof folder:
lwt-v4-5-6-clean-start/13-interlock-proof/

Read:
- CODEX_TASK_INTERLOCK_PROOF.md
- QA_CHECKLIST_INTERLOCK_PROOF.md
- ASSET_MANIFEST_INTERLOCK_PROOF.csv

Task:
Create a temporary Shopify test page that stacks the Hero slice and Story slice from one master canvas.

Allowed temporary theme files:
- sections/lwt-v456-interlock-proof.liquid
- assets/lwt-v456-interlock-proof.css
- templates/page.lwt-v456-interlock-proof.json

Allowed temporary PNGs in theme assets:
- lwt-v456-interlock-proof-master-canvas.png
- lwt-v456-interlock-proof-hero-slice.png
- lwt-v456-interlock-proof-story-slice.png
- lwt-v456-interlock-proof-seam-guide.png

Do not modify the real About page, homepage, header, footer, cart, products, global CSS, existing V4.5.6 packages, or unrelated files.
Do not publish.
Do not create V5.5 files.

Desktop proof CSS:
- no gap between slices
- no border between slices
- no overlay or fade between slices
- background-size: 100% auto
- background-position: top center
- background-repeat: no-repeat
- Hero aspect-ratio: 1440 / 720
- Story aspect-ratio: 1440 / 780
- scoped CSS only

QA:
Capture screenshots at 390, 749, 750, 989, 990, 1024, 1440.

Report:
- files changed
- preview route
- whether seam aligns at 1440 and 1024
- whether mobile needs separate slices
- screenshots captured
- confirmation no forbidden files were touched
- recommendation A/B/C from the task file

Stop after this proof.
```
