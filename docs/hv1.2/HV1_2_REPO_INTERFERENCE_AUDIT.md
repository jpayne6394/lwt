# HV1.2 Repo Interference Audit

This file records repo areas that may confuse Codex during HV1.2 work.

## Known Potential Interference

### 1. `lwt-v4-5-6-clean-start/`

Status: legacy / likely unrelated to HV1.2 Hydrogen homepage.

Why it can interfere:

- It contains older V4/V5 clean-start documents.
- It contains old Codex task prompts.
- It contains older QA and asset-placement instructions.
- It appears related to earlier wrapper/interlock/theme work, not the HV1.2 Hydrogen homepage source lock.

Codex rule:

```txt
For HV1.2 work, do not use files under lwt-v4-5-6-clean-start/ as source of truth unless the assigned issue explicitly says to inspect legacy context.
```

### 2. `supplier-ops-agent/`

Status: separate Shopify supplier operations app / not homepage.

Why it can interfere:

- It has its own `package.json` and Node scripts.
- It has its own Shopify Admin/API logic.
- It has tests, Render config, worker code, and supplier automation docs.
- Codex may confuse this with the Hydrogen storefront if it scans package scripts carelessly.

Codex rule:

```txt
For HV1.2 homepage work, do not edit supplier-ops-agent/ and do not use its package.json scripts as storefront verification commands.
```

### 3. Root `render.yaml`

Status: likely supplier-ops deployment config.

Why it can interfere:

- It points Render to `supplier-ops-agent` as `rootDir`.
- It is not an Oxygen/Hydrogen deployment config.
- It should not be used for HV1.2 homepage preview/deploy decisions.

Codex rule:

```txt
For HV1.2 homepage work, ignore root render.yaml unless the task is explicitly about supplier ops deployment.
```

### 4. Old PR #1 supplier-ops work

Status: merged but unrelated to HV1.2 homepage.

Why it can interfere:

- The PR added a supplier ops app and deployment setup.
- It references Shopify Admin API permissions, Render, worker scripts, supplier sync, and environment credentials.
- Those are operational admin-app concerns, not storefront homepage concerns.

Codex rule:

```txt
For HV1.2 homepage work, do not follow PR #1 as a storefront pattern.
```

## Safe Source Areas For HV1.2

Codex should prefer these paths:

```txt
AGENTS.md
docs/codex/
docs/hv1.2/
.github/ISSUE_TEMPLATE/hv1_2_task.md
.github/pull_request_template.md
```

After the repo audit identifies actual Hydrogen storefront files, those paths should be added here.

## Required Audit Ticket

Create or use a specific ticket before deleting, moving, or archiving legacy materials. Do not delete old folders without an explicit cleanup ticket and user approval.

## Recommended Cleanup Options

Do not delete immediately. First choose one:

```txt
Option A: leave legacy folders but add ignore rules in docs and AGENTS.md
Option B: move old docs into archive/legacy/
Option C: delete only after confirming they are not needed
```

For now, use Option A.
