# AutoSOC Model Tiering

AutoSOC workflows span a wide range of reasoning complexity, from strategic
architectural planning to high-volume alert summarization. Running every
step on Opus is both wasteful and slow. This document describes the tiering
convention used across AutoSOC workflows and how to roll it out without
changing any YAML.

## Tiers

| Tier       | Typical model   | When to use                                                           | Example workflows                                                   |
|------------|-----------------|-----------------------------------------------------------------------|---------------------------------------------------------------------|
| `planner`  | Claude Opus     | Strategic reasoning, multi-hop causal analysis, architecture review.  | `soc-meta`, `soc-arch-reviewer`, `soc-gap-analyzer`, `soc-deteng`   |
| `analyst`  | Claude Sonnet   | Routine, schema-driven analysis with a well-defined output contract.  | `soc-triage`, `soc-alert-sweeper`, `soc-autonomous-applier`, `soc-watchdog`, `soc-response`, `soc-proactive-hunter`, `soc-recommendation-applier`, `soc-regression-gate` |
| `bulk`     | Claude Haiku    | High-volume summarization, narrative writing, stale-detection polling.| `soc-shift-handover`, `soc-forensic-summarizer`, `soc-regression-harvester`, `soc-difficulty-controller`, `soc-trust-scorer` |
| `none`     | —               | Workflow has no LLM steps (pure Elastic / Kibana orchestration).      | `soc-caldera-dispatcher`, `soc-caldera-poller`, `soc-case-creation`, `soc-recovery`, `soc-registry-retro-tag`, `soc-skill-metrics-roller` |

The tier for every workflow is declared in
`soc-simulation/workflows/_registry.json` under the `model_tier` key and is
mirrored into `.soc-workflow-registry` by `setup.sh`. A JSON schema in
`soc-simulation/schemas/workflow_registry.schema.json` validates the enum.

## Why connector-id stays `opus` in every workflow YAML

Changing `connector-id:` across ~15 workflow files would break every
existing deployment where operators only have a single `opus` connector
configured. Instead, AutoSOC standardizes on ONE connector id (`opus`)
and exposes the tiering choice at the Kibana Connectors layer:

1. Create three Generative-AI connectors in Kibana:
   - `opus` → your canonical Opus model (e.g. `claude-opus-4`). Required.
   - `sonnet` → Sonnet (e.g. `claude-sonnet-4`). Optional for analyst tier.
   - `haiku` → Haiku (e.g. `claude-haiku-3-5`). Optional for bulk tier.
2. If you want tiering, edit the workflow YAML in-place for the steps you
   want to downgrade. The recommended edits are already scoped by
   `model_tier` in the registry — a simple grep tells you exactly which
   files are candidates for which model.
3. If you don't want tiering, leave every workflow on `opus`. Nothing
   breaks, and the registry still accurately reports the intended tier so
   the System Health tab can surface an "over-spend" signal.

## Cost impact (rough, per 1k runs)

| Tier       | Model   | Approx $/run (assumes 2k in / 800 out tokens) |
|------------|---------|------------------------------------------------|
| `planner`  | Opus    | ~$0.085                                        |
| `analyst`  | Sonnet  | ~$0.018                                        |
| `bulk`     | Haiku   | ~$0.0024                                       |

A fully-tiered deployment cuts the LLM bill ~4–8× versus running every
workflow on Opus while preserving planner quality on the few workflows
that actually benefit from Opus-level reasoning.

## Rolling out tiering safely

- Start with `bulk` — the highest-volume workflows (shift-handover,
  forensic-summarizer) are the safest to downgrade and yield the biggest
  savings first.
- Move to `analyst` once you have trust metrics stable for a week on the
  bulk tier.
- Keep `planner` on Opus until you have a regression suite wide enough to
  detect degradation on strategic reasoning.

## Related rails

- The `soc-watchdog` workflow already trips the global kill-switch on
  budget breach; that budget is model-agnostic.
- The `soc-trust-scorer` outputs per-artifact trust and can be used as a
  signal for a future "auto-downgrade" policy ("if trust ≥ 0.9, downgrade
  tier by one").
