# Codex Task Protocol

Use this protocol before implementing, editing, debugging, refactoring, or doing visual work.

## 1. Intake

Before editing, identify:

- user goal
- affected route(s)
- affected components
- affected data loaders/API calls
- affected assets/styles
- docs that control the task
- whether this is audit-only, implementation, debugging, or QA

## 2. Audit-Only Mode

When asked to audit, do not edit files. Return:

1. relevant files found
2. likely files to change later
3. current behavior
4. gaps against docs
5. missing assets/data
6. risks
7. proposed implementation sequence
8. verification commands from `package.json`

## 3. Implementation Mode

When implementing:

- keep changes small and reversible
- prefer existing repo patterns
- do not rewrite unrelated code
- do not change route architecture unless needed
- do not remove working fallbacks unless replacing them with verified data
- do not use fake data when real Shopify data is available
- do not commit secrets

## 4. Debugging Mode

When debugging:

1. reproduce or inspect the failure first
2. identify the smallest likely cause
3. patch only the cause
4. run the narrowest verification command first
5. run broader checks after the narrow fix passes
6. report what changed and why

Do not perform opportunistic redesigns or refactors while debugging.

## 5. Visual Work Mode

For visual work:

- read the visual source docs first
- preserve the approved direction
- use live HTML/React content over assets
- do not invent new motifs when assets are missing
- do not bake UI elements into background images
- verify desktop and mobile separately

## 6. Shopify/Hydrogen Mode

For Shopify Hydrogen work:

- keep Storefront API access in loaders or existing data patterns
- preserve cart/checkout behavior
- use product and collection handles intentionally
- document fallback behavior
- keep Oxygen preview separate from production publish

## 7. Done Report Format

Every done report must include:

```md
## Summary

## Files Changed

## Commands Run

## Verification Result

## Remaining Gaps / Risks

## Production Status
```

Production status must be one of:

- `audit only`
- `preview-ready`
- `blocked`
- `needs visual QA`
- `ready for review`
