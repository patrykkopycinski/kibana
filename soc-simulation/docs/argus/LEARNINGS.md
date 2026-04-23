# Learnings from Building ARGUS

> Captured 2026-04-23 — institutional knowledge from the full ARGUS build cycle.

---

## 1. "Agent-first" doesn't work — Data-first does

The earliest iteration ("AutoSOC") tried to build a single monolithic agent that would do everything: triage alerts, write rules, evaluate detections, respond to threats. It collapsed under its own context window.

**What worked:** Inverting the architecture. Elasticsearch indices (`.soc-*`) became the shared state, and agents became narrow specialists that read from and write to those indices. The "agent mesh" pattern — where each workflow invokes a single-purpose agent with a focused prompt — is dramatically more reliable than one god-agent. Each agent gets a small, well-defined slice of context and produces a typed output.

**Lesson:** In autonomous systems, **data flow is the architecture**. The agents are replaceable; the index schema is not.

---

## 2. Workflow YAML validation is the hardest part of Kibana Workflows

We spent more time debugging workflow YAML validation failures than writing the actual logic. Key gotchas discovered:

| Pattern | Breaks? | Fix |
|---------|---------|-----|
| `if: "steps.x.output != 'pass'"` | Yes | Use positive KQL: `if: "steps.x.output: fail"` |
| Dynamic Liquid inside `elasticsearch.request` body | Sometimes | Keep queries simple; complex query injection via Liquid is unreliable |
| Deeply nested `foreach` with `if` on child steps | Sometimes | Move conditionals to separate top-level steps or compute verdict in a `console` step first |
| `on_failure` blocks | Yes | Not supported in the current workflow engine |
| `json_parse` Liquid filter | Yes | Not available; work around with agent output contracts |
| Multi-line `description` with special chars | Sometimes | Use YAML `>` folded scalar and keep it simple |
| `wildcard` query in `elasticsearch.search` | Sometimes | Depends on engine version; `exists` and `term` are safest |

**Lesson:** Treat workflow YAML as a constrained DSL, not as "anything that parses as YAML works." Validate iteratively — build the simplest possible workflow first, confirm it's `valid: true`, then add complexity one step at a time. Never add 5 features in one edit.

---

## 3. Elasticsearch field mappings are invisible until they explode

The most insidious bug in the entire build: text fields that look fine for storage but fail catastrophically on aggregation. When `.soc-recommendations` had `trust_gate_decision` as a `text` field, every governance dashboard and every workflow trying to aggregate by gate decision would fail with `Fielddata is disabled on text fields`.

This is a **P0 in any autonomous system** because the governance loop itself breaks — you can't measure what you can't aggregate.

**Fix:** Index templates with keyword-first dynamic mappings (`strings_as_keyword`), installed before any data hits the indices. We now have 13 composable templates covering all `.soc-*` patterns.

**Lesson:** Define index templates **before writing a single document**. Don't rely on Elasticsearch auto-mapping. In an autonomous system, the data schema IS the contract between components.

---

## 4. The "last mile" of autonomy is governance, not capability

ARGUS could synthesize detection rules from CVE advisories very early. The capability was there by Phase 2. But making that capability **safe to run unsupervised** took 3x longer than building the capability itself.

The governance stack we built:
- Kill switch (global autonomy halt)
- Trust tiers (per-agent reputation)
- Budget/cooldown gates (rate limiting)
- Backtest gate (historical projection)
- Shadow execution (dry-run validation)
- Ownership check (prevent modifying non-ARGUS artifacts)
- Loop detection (prevent cascading mutations)
- Envelope validation (schema conformance)
- Dead letter + recovery (stalled document handling)
- Post-deploy accuracy (closed-loop FP measurement)
- Canary graduation (healthy deployment verification)

That's 11 governance mechanisms for 1 autonomous action (rule mutation). Each exists because we discovered a failure mode during testing.

**Lesson:** If you're building an autonomous system and your governance code isn't at least 3x your capability code, you haven't found enough failure modes yet.

---

## 5. Handoff points are where autonomous loops die

The ARGUS loop is: Advisory → Synthesis → Mutation Intent → Backtest → Shadow → Trust Gate → Apply → Observe → Graduate/Rollback.

Every `→` is a handoff where a document must exist in one index, be picked up by a different workflow, and produce an output in another index. When we ran the full loop end-to-end for the first time, it stalled at 3 different points:

1. Recommendations stuck at `pending` because nothing stamped `shadow_gate`
2. Shadow gate passed but no `trust_gate_decision` was written (keyword mapping issue)
3. Applied outcomes never got `canary_graduated` because that workflow didn't exist yet

**Lesson:** Map every handoff point as a directed graph. For each edge, verify: (a) a workflow exists that reads the source, (b) a workflow exists that writes the target, (c) the field types match, (d) the status transitions are exhaustive (no dead ends). We built the liveness watchdog specifically to detect stalled handoffs.

---

## 6. No benchmark exists for what ARGUS does

When we tried to score ARGUS against industry benchmarks:
- **SOC-Bench** measures incident response (ransomware IR). ARGUS does detection engineering.
- **CTI-REALM** measures rule generation quality. ARGUS does that but also deploys, monitors, and self-heals.
- **SANS SOC Survey** measures operational metrics. Useful but doesn't capture autonomy.
- **Microsoft Agentic SOC** is a strategic framework, not a test suite.

None of them evaluates the closed-loop cycle. We had to define our own 100-point benchmark across 5 dimensions.

**Lesson:** When building in a new category, you must define the evaluation framework yourself. If you wait for the industry to benchmark you, you'll be measured on someone else's criteria that don't capture your value.

---

## 7. Demo-grade vs production-grade is a spectrum, not a binary

Early on, we scripted the demo with CLI tools (`run_e2e_demo.sh`, `seed_argus_demo.sh`). This worked for presentations but proved nothing about autonomous operation. The transition to "actually runs on its own" required:

1. Converting CLI-triggered steps into scheduled workflows
2. Adding heartbeat instrumentation to every workflow
3. Building the watchdog layer (liveness, lifecycle, accuracy)
4. Fixing data handoffs that CLI scripts had papered over
5. Adding index templates that CLI scripts didn't need

The gap between "demo works when I press buttons" and "system operates unsupervised" is at least 60% of the total effort.

**Lesson:** Design for autonomy from Day 1. If the demo requires manual steps, those are gaps in the autonomous loop that will cost 3x to close later.

---

## 8. Model tiering matters but connector-level routing is the right abstraction

Every `ai.agent` step in every workflow used `connector-id: opus`. Running 56 workflows on Opus is expensive and slow. But hardcoding `connector-id: sonnet` or `connector-id: haiku` in YAML would break any deployment with a single connector.

**Solution:** Keep `connector-id: opus` everywhere. Route at the Kibana Connectors layer — rename the connector, not the workflow. Document the intended tier in the registry so operators know what to downgrade.

**Lesson:** In multi-model systems, the model choice is an operational decision, not a code decision. Keep the abstraction at the infrastructure layer, not in the workflow definition.

---

## 9. The workflow registry is the source of truth, not the Kibana UI

Kibana's workflow management UI shows what's deployed, but it doesn't show what *should* be deployed. The `_registry.json` manifest captures intended state: which workflows are canonical, what their model tier is, what connectors they need, and who owns them.

When we cleaned up deprecated workflows, the registry was the authority. Without it, we would have had to reverse-engineer intent from 76 deployed workflows.

**Lesson:** Every autonomous system needs a declarative manifest of intended state, separate from the runtime state. This is the Kubernetes lesson applied to workflow orchestration.

---

## 10. The Elastic Stack is an underappreciated agent runtime

ARGUS runs entirely on the Elastic Stack: Elasticsearch as shared state, Kibana Workflows as orchestration, Agent Builder agents as reasoning, Fleet as telemetry collection. No external agent framework (LangGraph, CrewAI, AutoGen) was needed.

What makes this work:
- Elasticsearch's near-real-time indexing gives sub-second handoffs between workflows
- Workflow scheduled triggers replace cron jobs
- Agent Builder's tool surface (detection rules, cases, alerts) is already wired in
- The OTLP-compatible reasoning trace gives observability for free
- Kibana's API surface makes governance gates (kill switch, budget) trivial

**Lesson:** Sometimes the best agent framework is the data platform you already have. The integration cost of an external framework often exceeds the cost of building simple orchestration on your existing stack.

---

## 11. Skills and workflow steps beat custom agents

Early ARGUS iterations created 9 custom agents (triage, detection engineering, signal quality, meta-planner, applier, etc.) with large system prompts and specific tool allowlists. Each agent needed:
- A JSON definition file deployed via Agent Builder API
- Trust tier bootstrapping
- Workflow steps referencing it by `agent-id`
- Maintenance when tools or prompts changed

The zero-agent refactor showed that **4 of 6 original agent roles were purely mechanical** — they ran ES queries, counted hits, and returned structured results. Custom workflow steps (`security.backtestRule`, `security.shadowExecuteRule`, `security.syncDetectionCorpus`, `security.buildAlertEntityGraph`) replaced them with zero LLM cost, typed schemas, and scoped ES clients.

The remaining 2 roles that genuinely need LLM reasoning (rule synthesis, mutation planning) became **skills** — portable knowledge modules that any agent can use. Workflow `ai.agent` steps run without `agent-id`, using the default Elastic Security AI Assistant with all registered skills automatically available.

**Key insight**: Custom agents are worth creating only when you need (a) a persistent conversation with memory, (b) specialized tool allowlists for security isolation, or (c) per-agent model routing. For single-turn workflow-invoked LLM calls, skills + default agent + inline prompts are simpler, cheaper, and easier to maintain.

---

## 12. Ruthless simplification reveals the essential architecture

The consolidation pass was not a polish pass — it was a **compression** of the system until only the load-bearing parts remained.

**Scale of the cut:** We started from roughly **53 workflows**, **43 index templates**, and **9 custom Agent Builder agents**. The end state landed near **~35 workflows**, **~35 templates**, and **0 dedicated ARGUS agents** — the same outcomes are carried by workflows, custom Elasticsearch-backed steps, skills on the default assistant, and inline prompts where reasoning is unavoidable.

**The keep/kill heuristic:** If a workflow step can be expressed as **an Elasticsearch query plus a threshold or aggregation**, it does not need an LLM. That single rule retired most of the “agent mesh” and moved cost out of token spend and into deterministic, auditable execution. The LLM budget is reserved for synthesis, planning, and narrative — not for counting documents.

**Parameterized playbooks:** One **parameterized playbook runner** replaced four near-duplicate, copy-pasted workflows. Operators pass intent (profile, actor, data source, CVE) instead of maintaining parallel YAML trees that only differ by constants.

**Unified eval ledger:** A single **eval runs** index and write path replaced four parallel run ledgers that had drifted in field names and lifecycle. One place to query “what did we score, when, and against what corpus” restores observability and dashboard truth.

**What ARGUS is now:** **Workflows** own orchestration and scheduling; **custom steps** own mechanical operations (backtest, shadow execute, corpus sync, alert graphs); **skills** encode reusable LLM knowledge and procedures; **inline prompts** on `ai.agent` steps hold the small amount of reasoning that must stay co-located with a branch. There is no separate “agent fleet” to deploy, tier, and patch — only platform primitives.

**Cost signal:** In practice this restructuring cut on the order of **60–70% of LLM cost per ARGUS cycle**, not by cheaper models alone but by **not calling a model** where the stack already had the answer in indices.

---

## Summary: What would we do differently?

1. **Start with index templates, not agents.** Define the data model first.
2. **Build the governance loop before the capability loop.** Trust gates, backtest, rollback — these should exist before the first autonomous action.
3. **Instrument every workflow from Day 1.** Heartbeats, audit trail, reasoning trace — not as afterthoughts.
4. **Define your own benchmark early.** Don't wait until you need to prove value.
5. **Design handoffs explicitly.** Every status transition, every index hop, every field dependency — map them as a directed graph.
6. **Keep the demo autonomous.** If you need a CLI script to make the demo work, you have a gap.
7. **Prefer skills over custom agents for workflow-invoked LLM tasks.** Default assistant + skills beats per-role Agent Builder deployments when the call is single-turn and orchestrated by workflows.
