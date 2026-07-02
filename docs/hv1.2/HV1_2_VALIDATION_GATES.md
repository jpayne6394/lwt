# HV1.2 Validation Gates

Use these gates before Codex claims implementation is done.

## Gate 1 — Source Completeness

Required before final visual work:

- approved homepage target image exists in `docs/hv1.2/source/`
- desktop and mobile source compositions or approved section assets exist
- safe-zone notes exist for content-heavy sections
- asset manifest exists or missing assets are documented

If this gate fails, Codex may do audit or structure work only.

## Gate 2 — Route and Data Audit

Codex must identify:

- homepage route
- layout components
- data loaders
- Shopify queries used by homepage
- product and collection source behavior
- fallback data behavior
- current public asset paths

## Gate 3 — Visual Structure

Before art polish, verify:

- section order matches HV1.2 docs
- desktop does not break
- mobile does not break
- text and cards remain live content
- there is no flat screenshot-as-page implementation

## Gate 4 — Art Integration

Verify:

- desktop and mobile assets are intentionally selected
- hero uses appropriate first-visual loading strategy
- below-fold decorative assets are not blocking unnecessarily
- safe zones are respected
- section seams do not hard-cut without approval
- product rails remain readable

## Gate 5 — Shopify Data

Verify:

- product rails use real Shopify data where available
- selected collections or handles are documented
- practitioner and homepage content source is documented
- fallbacks have the same shape as live data
- cart and checkout behavior are not disturbed

## Gate 6 — Preview QA

Before approval, capture or report checks for:

- 390 mobile
- 430 mobile
- 768 tablet
- 1024 tablet/desktop
- 1280 desktop
- 1440 desktop

If Playwright exists, use screenshot comparison. If not, create manual screenshots or report why screenshots could not be captured.

## Gate 7 — Performance and Layout Stability

Check:

- LCP risk for hero image
- image dimensions or aspect-ratio reservation
- layout shifts around art bands, products, portraits, and cards
- image format and file size concerns
- unnecessary above-fold lazy loading

## Gate 8 — Done Report

Every done report must include:

```md
## Summary

## Files Changed

## Assets Used

## Data Sources

## Commands Run

## Screenshots / Visual QA

## Pass-Fail Against HV1.2 Docs

## Remaining Gaps

## Production Status
```

Allowed production status values:

- audit only
- blocked by missing assets
- structure implemented
- preview-ready
- needs visual QA
- ready for review
