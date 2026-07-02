# HV1.2 Supplier Agent Hold

This file records the current decision for `supplier-ops-agent/` and root `render.yaml`.

## Decision

Do not clean up `supplier-ops-agent/` yet.

The user says this is an old agent and a new one has been built, but the new agent location has not been confirmed inside this repository context.

## Hold Scope

Hold these paths:

```txt
supplier-ops-agent/
render.yaml
```

## HV1.2 Rule

For HV1.2 homepage work:

```txt
Do not inspect, edit, or use supplier-ops-agent/ unless the assigned issue explicitly requires supplier-agent audit work.
Do not use root render.yaml as Hydrogen/Oxygen deployment guidance.
```

## Before Future Cleanup

Before any future cleanup of supplier-agent files, confirm:

```txt
1. New agent repo/path/name.
2. Whether current supplier-ops-agent/ has been migrated.
3. Whether root render.yaml still points to any active deployment.
4. Whether any secrets or environment examples need to be preserved.
5. Whether Render service still depends on this repo path.
```
