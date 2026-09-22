# HV1.2 Legacy Isolation Manifest

This file isolates old GitHub material that may confuse the active HV1.2 professional homepage build.

Isolation means **reference-only / do-not-use**, not deletion.

## Active Rule

For the active `/hv1-home` professional homepage implementation, Codex must ignore legacy materials unless the assigned task explicitly says to inspect legacy context.

## Current Active Source

```txt
docs/hv1.2/HV1_2_PROFESSIONAL_HOME_CURRENT_LOCK.md
AGENTS.md
Current Figma professional homepage layout/spec
Current Codex implementation task
```

## Legacy / Quarantined Repo Areas

### 1. `lwt-v4-5-6-clean-start/`

Status: quarantined legacy.

Reason:

- Older V4/V5 clean-start material.
- Contains older Codex prompts, wrapper/interlock tasks, QA docs, and asset-placement instructions.
- Can confuse the current HV1.2 professional Hydrogen homepage approach.

Rule:

```txt
Do not use lwt-v4-5-6-clean-start/ as source of truth for HV1.2 professional homepage work.
Do not edit it during homepage implementation.
Clean it only in a dedicated cleanup-only PR.
```

### 2. `supplier-ops-agent/`

Status: quarantined non-homepage app.

Reason:

- Separate supplier operations / admin automation app.
- Has its own package scripts, tests, worker logic, deployment concerns, and Shopify Admin/API logic.
- Not a storefront homepage implementation source.

Rule:

```txt
Do not edit supplier-ops-agent/ for HV1.2 homepage work.
Do not use its package scripts as storefront verification commands.
```

### 3. `render.yaml`

Status: quarantined deployment config.

Reason:

- Appears tied to supplier-ops-agent deployment.
- Not an Oxygen/Hydrogen homepage deployment config.

Rule:

```txt
Do not edit render.yaml for HV1.2 homepage work.
Do not use render.yaml for Hydrogen/Oxygen preview decisions.
```

### 4. Old HV1.2 graphics/interlock docs

Status: reference-only legacy unless explicitly reactivated.

These files may contain useful historical notes, but they are not active instructions for the current professional homepage approach:

```txt
docs/hv1.2/HV1_2_ASSET_MANIFEST.md
docs/hv1.2/HV1_2_APPROVED_LOCKED_REFERENCE.md
docs/hv1.2/HV1_2_FIGMA_CODEX_PLUGIN_WORKFLOW.md
docs/hv1.2/HV1_2_GRAPHICS_PRODUCTION_PIPELINE.md
docs/hv1.2/HV1_2_HYDROGEN_IMPLEMENTATION_LOCK.md
docs/hv1.2/HV1_2_NO_FIGMA_WORKFLOW.md
docs/hv1.2/HV1_2_SAFE_ZONES_AND_ASSET_CONTRACT.md
docs/hv1.2/HV1_2_SECTION_MAP.md
docs/hv1.2/HV1_2_VISUAL_RULES.md
```

Rule:

```txt
Do not use older graphics-pack, interlocking, wave seam, Figma-slice, full-page-art, or asset-slice instructions for the current professional `/hv1-home` build.
```

### 5. Old cleanup/audit docs

Status: reference-only.

```txt
docs/hv1.2/HV1_2_LEGACY_CLEANUP_DECISIONS.md
docs/hv1.2/HV1_2_LEGACY_CLEANUP_PROMPT.md
docs/hv1.2/HV1_2_REPO_INTERFERENCE_AUDIT.md
```

Rule:

```txt
Use these only to understand why old material was quarantined.
Do not let them override the current professional homepage lock.
```

## Approved Current Work Lane

For current implementation, Codex may work only in these areas unless a task explicitly expands scope:

```txt
app/routes/hv1-home.tsx
app/components/home/Hv12HomePreviewPage.jsx
app/styles/hv1-home-manifest.css
app/data/hv1HomeContent.ts
app/data/hv1-launch-products.ts
app/lib/homepage/normalize-homepage.js
docs/hv1-homepage/**
```

## Required Branch Discipline

Use a clean branch for the active work:

```txt
hv1.2-professional-isolation
```

Do not mix cleanup-only changes with homepage implementation changes unless the user explicitly approves that combined PR.

## Final Isolation Rule

No old GitHub file should be deleted blindly. Old materials are isolated by:

```txt
1. branch discipline
2. AGENTS.md source-priority update
3. this manifest
4. current-lock doc
5. Codex prompt guardrails
```

Deletion or physical archive moves can happen later in a dedicated cleanup PR after the professional homepage preview is stable.
