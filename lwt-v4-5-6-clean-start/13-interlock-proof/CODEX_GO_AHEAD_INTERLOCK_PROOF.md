# Codex Go-Ahead Prompt — V4.5.6 Interlock Proof

```text
Run the LWT V4.5.6 interlocking section-slice proof only.

Correct repo:
jpayne6394/lwt

Correct clean-start folder:
lwt-v4-5-6-clean-start/13-interlock-proof/

Use the provided ZIP:
LWT_V4_5_6_INTERLOCK_PROOF_ASSETS.zip

Read first:
- lwt-v4-5-6-clean-start/13-interlock-proof/README.md
- lwt-v4-5-6-clean-start/13-interlock-proof/CODEX_TASK_INTERLOCK_PROOF.md
- lwt-v4-5-6-clean-start/13-interlock-proof/ASSET_MANIFEST_INTERLOCK_PROOF.csv
- lwt-v4-5-6-clean-start/13-interlock-proof/QA_CHECKLIST_INTERLOCK_PROOF.md

Goal:
Create a temporary Shopify/Dawn proof page that stacks two separate section slices generated from one master canvas:
- Hero slice
- Story slice

This proves whether separate section assets can interlock in Shopify when the seam geometry is matched.

Create only temporary proof files:
- sections/lwt-v456-interlock-proof.liquid
- assets/lwt-v456-interlock-proof.css
- templates/page.lwt-v456-interlock-proof.json

Copy only the four proof PNGs into active Shopify /assets with names from the manifest.

Do not modify the real About page.
Do not modify homepage, header, footer, cart, products, global CSS, existing clean-start packages, or unrelated files.
Do not publish.
Do not claim live-ready.

Desktop proof rule:
Use background-size: 100% auto, not cover.
Use no gap, no border, no overlay/fade between slices.
Use aspect ratios:
- Hero: 1440 / 720
- Story: 1440 / 780

QA:
Capture screenshots at 390, 749, 750, 989, 990, 1024, 1440.

Report whether:
A) interlocking slices work in Shopify and should become the graphics system
B) desktop works but mobile needs separate mobile slices
C) Shopify/Dawn constraints still interfere

Stop after this proof.
```
