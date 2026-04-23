# Argus E2E Gap Closure — Tasks

## Infrastructure (prerequisite)
- [x] Create OpenSpec change
- [ ] W4: Audit shadow executor annotate_rec_pass step
- [ ] W4: Audit applier fetch_ready_intents query index
- [ ] W4: Fix status handoff if index mismatch found
- [ ] W4: Verify trust_gate_decision field alignment

## Core Workflows
- [ ] W1: Create soc-argus-alert-to-hypothesis.yaml
- [ ] W1: Test W1 on live cluster with manual trigger
- [ ] W2: Add fetch_unsynthesized step to E2D reconciler
- [ ] W2: Add ai.agent synthesis step to E2D reconciler
- [ ] W2: Add annotate_advisory step after synthesis
- [ ] W3: Add run_draft_query_against_corpus step
- [ ] W3: Add compute_real_scores + write_eval_run steps
- [ ] W3: Test W2+W3 on live cluster

## Sprint Integration
- [ ] W7: Create soc-argus-coverage-initializer.yaml
- [ ] W7: Test prebuilt rule discovery against installed integrations
- [ ] W5: Create soc-argus-rule-health-monitor.yaml
- [ ] W5: Add FP exception generation via ai.agent step
- [ ] W5: Add rollback fallback path
- [ ] W5: Test W5 on live cluster

## Observability
- [ ] W6: Add reasoning traces to W1
- [ ] W6: Add reasoning traces to W2/W3 E2D reconciler
- [ ] W6: Add reasoning traces to W5
- [ ] W6: Add reasoning traces to W7
- [ ] W6: Add decision graph edges for E2D path

## Integration
- [ ] Update run_e2e_demo.sh to poll for workflow artifacts
- [ ] Remove scripted emit_e2d_chain from demo script
- [ ] Validate full E2E in browser
- [ ] Take screenshots as proof
