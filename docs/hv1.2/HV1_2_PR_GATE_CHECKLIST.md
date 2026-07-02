# HV1.2 PR Gate Checklist

Use this checklist before any HV1.2 pull request is opened, updated, or marked ready for review.

## Required PR Header

Every HV1.2 PR description must start with:

```md
Assigned issue: #__
Work type: audit / docs / structure / zone implementation / data / QA
Status: audit only / blocked / structure only / needs assets / needs safe-zone review / preview-ready / ready for review
```

## Source Read Gate

- [ ] `AGENTS.md` read.
- [ ] `docs/codex/CODEX_BRAIN_INDEX.md` read.
- [ ] Assigned GitHub issue read.
- [ ] Relevant HV1.2 docs read.
- [ ] Figma inspected when the issue requires it.

## Scope Gate

- [ ] PR changes only files allowed by the assigned issue.
- [ ] No unrelated routes changed.
- [ ] No unrelated styling changed.
- [ ] No unrelated refactors included.
- [ ] No production deploy or publish performed.

## Visual Drift Gate

- [ ] Approved reference image is not used as the runtime page.
- [ ] Live text remains live HTML/React.
- [ ] Product cards remain live components.
- [ ] Practitioner cards remain live components.
- [ ] Footer content remains live HTML/React.
- [ ] Missing assets are reported as blockers.
- [ ] Issue #44 visual correction is accounted for when relevant.

## Shopify Data Gate

- [ ] Shopify product data used where available.
- [ ] Shopify collection data used where available.
- [ ] Article/blog source documented.
- [ ] Practitioner source documented.
- [ ] Fallback data shape documented.
- [ ] Cart/checkout behavior not disturbed.

## Asset Gate

- [ ] Runtime assets use approved paths.
- [ ] Experiments are not placed in `public/hv1.2/home/` as approved assets.
- [ ] Desktop and mobile asset behavior documented.
- [ ] Hero first visual loading behavior documented when relevant.
- [ ] Image/art wrappers reserve space where relevant.

## Verification Gate

- [ ] `package.json` scripts inspected.
- [ ] Relevant verification command run.
- [ ] Failed commands reported exactly.
- [ ] Desktop behavior checked or blocker documented.
- [ ] Mobile behavior checked or blocker documented.

## Required PR Description Template

```md
## Assigned Issue
#

## Summary

## Sources Read
- [ ] AGENTS.md
- [ ] CODEX_BRAIN_INDEX.md
- [ ] Assigned issue
- [ ] HV1.2 docs
- [ ] Figma, if required

## Files Changed

## Scope Confirmation

## Assets Used / Missing

## Data Sources / Fallbacks

## Commands Run

## Screenshots / Preview

## Remaining Blockers

## Status
```

## Automatic Rejection Conditions

A PR should be rejected if it:

- uses a screenshot as the page
- hard-codes final product cards/prices instead of Shopify data where available
- ignores the assigned issue scope
- hides failed commands
- claims final visual match without source image, safe zones, asset manifest, and QA evidence
- treats random CSS decoration as approved graphics
- changes unrelated routes or cart/checkout behavior
