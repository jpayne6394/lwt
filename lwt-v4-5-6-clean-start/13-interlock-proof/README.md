# LWT V4.5.6 Interlock Proof

Purpose: quick Shopify/Dawn proof of the interlocking section-slice theory.

This package tests whether two separate section assets exported from one master canvas can stack in Shopify as one continuous visual flow.

## Concept

- Not one full-page image.
- Not unrelated section backgrounds.
- Two separate section slices generated from one master canvas.
- The section seam is part of the art.
- The hero and story slices should align exactly when stacked at the same width.

## Expected assets

The proof needs these PNG files:

- `lwt-v456-interlock-proof-master-canvas.png`
- `lwt-v456-interlock-proof-hero-slice.png`
- `lwt-v456-interlock-proof-story-slice.png`
- `lwt-v456-interlock-proof-seam-guide.png`

The assets are in the local ZIP package:

`LWT_V4_5_6_INTERLOCK_PROOF_ASSETS.zip`

## Test rule

Desktop proof should use:

```css
background-size: 100% auto;
background-position: top center;
background-repeat: no-repeat;
```

Do not use `background-size: cover` for the desktop seam proof, because this test is checking exact shared seam geometry.

## Slice dimensions

- Hero slice: 1440 x 720
- Story slice: 1440 x 780

## Scope

This is a temporary proof package only. Do not modify the real About page from this folder.
