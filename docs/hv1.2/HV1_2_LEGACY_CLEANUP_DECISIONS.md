# HV1.2 Legacy Cleanup Decisions

This file records cleanup decisions for repo areas that could interfere with Codex during HV1.2 work.

## Decision Log

### 1. `lwt-v4-5-6-clean-start/`

Decision: approved for cleanup.

Reason:

- Legacy V4/V5 clean-start material.
- Contains older Codex prompts, wrapper/interlock tasks, QA docs, and asset-placement instructions.
- Can confuse HV1.2 Hydrogen homepage work.
- Current HV1.2 source of truth lives in `AGENTS.md`, `docs/codex/`, `docs/hv1.2/`, GitHub issues, and the Figma handoff.

Required handling:

```txt
Clean up lwt-v4-5-6-clean-start/ in a dedicated cleanup PR or commit.
Do not mix cleanup with homepage implementation changes.
```

### 2. `supplier-ops-agent/`

Decision: hold for audit.

Reason:

- It is an old supplier operations agent.
- A newer agent reportedly exists, but the new agent location/repo/path must be confirmed first.
- It may still contain useful implementation notes, tests, deployment patterns, or migration details.

Required handling:

```txt
Audit supplier-ops-agent/ against the new agent before cleanup.
Do not use supplier-ops-agent/ for HV1.2 homepage work.
```

### 3. root `render.yaml`

Decision: hold for audit.

Reason:

- It appears tied to supplier-ops-agent deployment.
- If supplier-ops-agent is retired or moved, this file may be removable too.
- It should not be changed until the supplier-ops-agent decision is final.

Required handling:

```txt
Keep render.yaml until supplier-ops-agent is audited.
Do not use render.yaml for Hydrogen/Oxygen homepage deployment.
```

## HV1.2 Rule

For all HV1.2 homepage work, Codex must ignore legacy/ops paths unless an assigned issue explicitly requires them.
