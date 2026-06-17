# QA Checklist — V4.5.6 Interlock Proof

## Required screenshots

Capture:

- 390
- 749
- 750
- 989
- 990
- 1024
- 1440

## Desktop acceptance

At 1440:

- Hero and Story slices stack with no visual gap.
- The seam line aligns exactly.
- The navy/cream/gold wave continues like a puzzle piece.
- There is no gray shelf.
- There is no hard horizontal border.
- Dawn spacing or section padding does not introduce a gap.

At 1024:

- Same checks as 1440.
- Minor scale differences are acceptable only if the seam remains continuous.

## Breakpoint checks

At 749, 750, 989, and 990:

- Confirm whether exact seam math survives Dawn breakpoint behavior.
- Report if separate tablet slices are needed.

## Mobile checks

At 390:

- Report whether the desktop slices still align.
- If mobile crops break the seam, do not hack it.
- Recommend a separate mobile master/slice export if needed.

## Reject conditions

Reject if:

- There is a visible gap between slices.
- Dawn wrapper/padding creates a seam.
- Background-size cover is used for desktop seam proof.
- Text/cards/buttons are baked into image assets.
- The real About page is modified.
- The proof touches unrelated theme files.
