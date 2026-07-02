# HV1.2 Legacy Cleanup Prompt

Use this prompt for a cleanup-only Codex task.

## Cleanup Prompt

```txt
Complete cleanup only for legacy folder `lwt-v4-5-6-clean-start/`.

Read first:
- AGENTS.md
- docs/codex/CODEX_BRAIN_INDEX.md
- docs/hv1.2/HV1_2_REPO_INTERFERENCE_AUDIT.md
- docs/hv1.2/HV1_2_LEGACY_CLEANUP_DECISIONS.md

Scope:
- Work only on `lwt-v4-5-6-clean-start/`.
- Do not edit `supplier-ops-agent/`.
- Do not edit `render.yaml`.
- Do not edit Hydrogen implementation files.
- Do not edit HV1.2 docs except to update cleanup status if needed.

Before changes:
1. List the files under `lwt-v4-5-6-clean-start/`.
2. Confirm no active HV1.2 docs reference it as source of truth.
3. Confirm the task is isolated.

After changes:
1. Report files affected.
2. Report commands run.
3. Confirm `supplier-ops-agent/` and `render.yaml` were not changed.
4. Confirm no homepage implementation changed.
```

## Important

If Codex cannot safely process a whole folder, it should create a file list and ask for the preferred cleanup method rather than partially changing files.
