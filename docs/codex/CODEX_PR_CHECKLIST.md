# Codex PR and Done Checklist

Use this checklist before opening a PR, marking a task done, or saying a build is ready.

## Scope Control

- [ ] Read `/AGENTS.md`.
- [ ] Read the relevant `/docs` files.
- [ ] Stayed inside the requested scope.
- [ ] Avoided unrelated route, component, and style changes.
- [ ] Preserved working behavior unless the task asked to change it.
- [ ] Kept credentials and environment values out of commits.

## Implementation Quality

- [ ] Followed existing repo patterns.
- [ ] Used clear component names.
- [ ] Scoped styles so existing pages are not affected unexpectedly.
- [ ] Documented fallback behavior.
- [ ] Reported missing data or assets instead of hiding them.

## Shopify and Hydrogen Safety

- [ ] Used real Shopify data where available.
- [ ] Avoided fake commerce data when product or collection data exists.
- [ ] Documented Storefront API query changes.
- [ ] Did not publish production unless explicitly instructed.

## Visual QA

- [ ] Checked desktop.
- [ ] Checked mobile.
- [ ] Checked section order, spacing, and visual hierarchy.
- [ ] For HV1.2, compared the result against the source docs and target image requirements.

## Verification

- [ ] Inspected `package.json` scripts.
- [ ] Ran the relevant lint, type, build, or test command if available.
- [ ] Reported any failed command exactly.
- [ ] Listed remaining risks.

## Required Done Report

```md
## Summary

## Files Changed

## Commands Run

## Verification Result

## Remaining Gaps / Risks

## Production Status
```
