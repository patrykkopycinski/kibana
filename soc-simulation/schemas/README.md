# Argus structured-output schemas

These JSON Schemas (draft-2020-12) are the **contract** between Argus agents
and the deterministic code that applies their decisions.

Why they exist:

- LLM free-text output drifts every model release. Parsing it with regex has
  caused roughly 70 % of Argus's apply-time failures.
- Tool calls on every major provider (OpenAI, Anthropic, Bedrock) already
  enforce arguments against a JSON Schema. Shipping these schemas and asking
  agents to emit them via a tool call is portable, strict, and free.

How they are used (Elastic-native; no external code):

1. Every Argus agent is given the relevant schema inline in its `instructions`
   and is told to emit a single JSON object shaped like it. This is the
   contract — no regex, no free-text scraping.
2. The `soc-recommendation-applier` and `soc-autonomous-applier` workflows
   read the structured `details.*` fields directly from `.soc-recommendations`
   documents and call the matching Kibana API (`kibana.request` step) to
   execute the decision.
3. Shape assertions are enforced by the writer workflows: the `ai.agent` step
   returns the object, and the `elasticsearch.index` step is guarded by
   `condition` steps that check required top-level fields (`rec_id`, `type`,
   `status`, `confidence`, `details`). Malformed agent output is written to
   `.soc-dead-letter` instead of `.soc-recommendations`.
4. Any schema change is a breaking change. Bump `schema_version` (top-level
   field, keyword-indexed), keep the old schema, and teach the applier
   workflow to branch on the version.

Files:

| Schema | Purpose |
|---|---|
| `recommendation.schema.json` | Envelope schema — every Argus recommendation must validate against this. Uses a `type`-discriminated union. |
| `triage_verdict.schema.json` | Per-alert triage decision (disposition, confidence, techniques, reasoning, next_step). |
| `rule_patch.schema.json` | Incremental change to an existing detection rule (threshold bump, query rewrite, disable). |
| `rule_creation.schema.json` | New detection rule proposal (starts DISABLED in shadow mode). |
| `rule_exception.schema.json` | Add/remove an exception on an existing rule. |
| `capability_gap.schema.json` | Meta-agent finding: missing skill / agent / workflow. |
| `mutation_intent.schema.json` | Internal schema for autonomous mutations (go through governance rails). |
| `pattern_finding.schema.json` | Supporting evidence for pattern-based claims: sample size, aggregation, confidence. |

These schema files are reference artefacts — they are bundled with the repo
so operators and reviewers can see the contract, and they are embedded inline
into agent `instructions` at setup time (see `agents/soc-*.json`). No Python
validator, no external runtime: every check that needs to run in production
runs as a workflow `condition` step or as Elasticsearch query-level guardrails.
