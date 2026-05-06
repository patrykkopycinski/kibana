# ARGUS Model Tiering

ARGUS workflows span a wide range of reasoning complexity, from strategic
architectural planning to high-volume alert summarization. Running every
step on Opus is both wasteful and slow. This document describes the tiering
convention used across ARGUS workflows and how to roll it out without
changing any YAML.

## Tiers

| Tier       | Typical model   | When to use                                                           | Example workflows                                                   |
|------------|-----------------|-----------------------------------------------------------------------|---------------------------------------------------------------------|
| `planner`  | Claude Opus     | Strategic reasoning, multi-hop causal analysis, architecture review.  | `soc_meta`, `soc_arch_reviewer`, `soc_gap_analyzer`, `soc_deteng`   |
| `analyst`  | Claude Sonnet   | Routine, schema-driven analysis with a well-defined output contract.  | `soc_alert_sweeper` *(replaces removed `soc-triage`)*, `soc_autonomous_applier`, `soc_watchdog`, `soc_response`, `soc_proactive_hunter`, `soc_recommendation_applier`, `soc_regression_gate` |
| `bulk`     | Claude Haiku    | High-volume summarization, narrative writing, stale-detection polling.| `soc_shift_handover`, `soc_forensic_summarizer`, `soc_regression_harvester`, `soc_difficulty_controller`, `soc-trust-scorer` |
| `none`     | —               | Workflow has no LLM steps (pure Elastic / Kibana orchestration).      | `soc_caldera_dispatcher`, `soc_caldera_poller`, `soc_argus_case_lifecycle` *(replaces removed `soc-case-creation`)*, `soc_recovery`, `soc_registry_retro_tag`, `soc_skill_metrics_roller` |

The tier for every workflow is declared in
`soc-simulation/workflows/_registry.json` under the `model_tier` key and is
mirrored into `.soc-workflow-registry` by `setup.sh`. A JSON schema in
`soc-simulation/schemas/workflow_registry.schema.json` validates the enum.

## Why connector-id stays `opus` in every workflow YAML

Changing `connector-id:` across ~15 workflow files would break every
existing deployment where operators only have a single `opus` connector
configured. Instead, ARGUS standardizes on ONE connector id (`opus`) and
exposes the tiering choice at the Kibana Connectors layer:

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

## Quick-apply commands

To apply tiering in a single pass, replace `connector-id:` values:

```bash
# Analyst tier: routine analysis workflows → sonnet
for f in soc_alert_sweeper.yaml soc_autonomous_applier.yaml \
         soc_watchdog.yaml soc_response.yaml soc_proactive_hunter.yaml \
         soc_recommendation_applier.yaml soc_regression_gate.yaml; do
  sed -i '' 's/connector-id: opus/connector-id: sonnet/' "soc-simulation/workflows/$f"
done

# Bulk tier: high-volume summarization → haiku
for f in soc_shift_handover.yaml soc_forensic_summarizer.yaml \
         soc_regression_harvester.yaml; do
  sed -i '' 's/connector-id: opus/connector-id: haiku/' "soc-simulation/workflows/$f"
done
```

Then reinstall workflows via `setup.sh` or the Kibana workflows API.

## Related rails

- The `soc_watchdog` workflow already trips the global kill-switch on
  budget breach; that budget is model-agnostic.
- The `soc-trust-scorer` outputs per-artifact trust and can be used as a
  signal for a future "auto-downgrade" policy ("if trust ≥ 0.9, downgrade
  tier by one").
- The `soc_workflow_liveness_watchdog` monitors heartbeat freshness
  across all tiers, ensuring stale workflows are detected regardless
  of the connector used.

## Workflow-Level Model Routing

With the zero-agent architecture, model tiering happens at the workflow step level via `connector-id`:

| Workflow Step | Connector | Rationale |
|---|---|---|
| Rule synthesis (`ai.agent` in `soc_deteng.yaml`) | `opus` | Deep reasoning about attack chains and ECS field selection |
| Triage reasoning (`ai.agent` in `soc_alert_sweeper.yaml`) | `opus` | Complex classification with entity correlation |
| Mutation planning (`ai.agent` in `soc_meta.yaml`) | `opus` | Strategic planning with governance envelope construction |
| Backtesting (`security.backtestRule`) | N/A | Pure ES query — no LLM |
| Shadow execution (`security.shadowExecuteRule`) | N/A | Pure ES query — no LLM |
| Corpus sync (`security.syncDetectionCorpus`) | N/A | Pure ES query — no LLM |
| Entity graph (`security.buildAlertEntityGraph`) | N/A | Pure ES query — no LLM |

### Cost Impact

By replacing 4 agent-based steps with custom workflow steps, the LLM cost per full ARGUS cycle drops by ~60-70%. The remaining LLM calls (rule synthesis, triage, planning) stay on Opus because they genuinely require complex reasoning.
