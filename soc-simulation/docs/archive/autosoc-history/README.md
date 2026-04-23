# Archive — AutoSOC history (pre-ARGUS)

**These documents are historical.** They predate the consolidation of the project
under a single name and story: **ARGUS — a Mythos-resilient defender**.

They are preserved here for provenance: to show the design evolution, the
verification snapshots we captured along the way, and the original "autonomous
SOC" framing before ARGUS became the product identity.

**If you are looking for the current story, leave this directory now** and read
[`docs/argus/README.md`](../../argus/README.md) (or the repo root
[`README.md`](../../../README.md)). This archive is not kept in sync with the
live system — it will drift, and that is by design.

## Contents

| File | What it was | Superseded by |
| --- | --- | --- |
| `autonomous-soc-overview.html` | 77 KB illustrated overview of the autonomous-SOC concept, captured 2026-04-17. | [`docs/argus/threat-model.html`](../../argus/threat-model.html) + [`docs/argus/architecture.html`](../../argus/architecture.html) |
| `design-evolution.html` | 52 KB snapshot narrating the design evolution from human-driven SOC → autonomous → ARGUS. | Integrated into `docs/argus/capability-and-gap-analysis.md` |
| `autonomy-demo-runbook.md` | Operator runbook for the "autonomy-first" demo arc. | [`docs/argus/demo-runbook.md`](../../argus/demo-runbook.md) |
| `autonomous-soc-verification-2026-04-17.html` | Point-in-time verification snapshot, 2026-04-17. | Rolling verification captured under `docs/argus/proof/` |
| `autonomy-first-verification-2026-04-17.html` | Point-in-time verification snapshot, 2026-04-17. | Rolling verification captured under `docs/argus/proof/` |
| `autosoc-final-validation-2026-04-18.html` | Final validation snapshot, 2026-04-18, under the old brand. | Superseded by the ARGUS feature-completeness record in `docs/argus/proof/` |
| `AUTOSOC_FINAL_VALIDATION_2026-04-18.md` | Markdown twin of the above. | See above. |

## Why ARGUS replaced "AutoSOC"

"AutoSOC" described _what the system does_ — automate a security operations
center. **ARGUS** names _the system itself_ and anchors it to a story worth
defending: the Mythos era, when a frontier-capability adversary compresses
dwell-to-detection, explodes behavioural variants, and brings agentic reasoning
into the attack loop. ARGUS is the hundred-eyed watcher built to survive that.
One name, one story, one spec tree.
