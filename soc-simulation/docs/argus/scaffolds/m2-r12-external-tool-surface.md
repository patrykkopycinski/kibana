# M2.R12 — External Tool Surface (MCP + A2A) for ARGUS Skills

ARGUS exposes its skill surface over two open agentic protocols so third-party
agents (Claude Desktop, Cursor, Copilot, partner XDR copilots, other Elastic
products) can call ARGUS as a **governed** tool provider. Every external call
is funneled through the same door-class, blast-radius, trust-tier, adversarial,
and watchdog gates that native ARGUS actors face. Nothing about being "external"
buys an escape from governance — it only buys a new `actor_id`.

| Protocol | Role                                        | Transport                            |
| -------- | ------------------------------------------- | ------------------------------------ |
| **MCP**  | Tool-call RPC for LLM clients               | stdio (v1), streamable HTTP/SSE (v2) |
| **A2A**  | Peer-agent task handoff & long-running work | HTTP with task lifecycle events      |

Both protocols read from the same source of truth — the ARGUS skill catalog
under `soc-simulation/skills/` plus the Agent Builder tool registry exposed by
the Security Solution plugin — and project it through a **policy bundle** that
depends on the calling principal's negotiated profile.

Landing sites:

- `@kbn/argus-tool-manifest`  (new) — pure manifest + policy projection
- `@kbn/argus-mcp-server`     (new) — MCP transport, stdio default
- `@kbn/argus-a2a-server`     (new, stubbed in v1) — A2A capability card + task lifecycle
- Security Solution plugin tool registry — unchanged contract, new consumers

---

## 1. Principal model

Every external call is captured as a **registered actor** in
`.soc-actor-trust-tiers` using a namespaced `actor_id`:

| Protocol | `actor_id` format           | Example                                     |
| -------- | --------------------------- | ------------------------------------------- |
| MCP      | `mcp:<client-name>`         | `mcp:claude-desktop`, `mcp:cursor`          |
| A2A      | `a2a:<peer-agent-card-id>`  | `a2a:sentinel-copilot`, `a2a:crowdstrike-a` |

The `client-name` / `peer-agent-card-id` is **negotiated from the caller's
credentials** (API key scope for MCP, agent card for A2A). It is never trusted
from user-controlled payload fields.

New principals start in the `probationary` trust tier. They climb or fall
through the same `soc-argus-trust-tier-assessor.yaml` outcomes loop that
governs native ARGUS actors — there is no fast path for external callers.

---

## 2. Profile negotiation

Profiles are resolved at authentication time and gate the tool manifest
returned to the caller. Profiles are **additive**: an `operator` sees everything
a `read-only` principal sees plus the write surface.

| Profile      | Reads allowed | Writes allowed                     | Outputs                               |
| ------------ | ------------- | ---------------------------------- | ------------------------------------- |
| `read-only`  | yes           | no                                 | Plain data                            |
| `advisory`   | yes           | proposes only (never applies)      | `mutation_intent` draft, never applied |
| `operator`   | yes           | full surface, trust-gate enforced  | Whatever the trust gate permits       |

### Hard preconditions before ANY write profile is exposed

The MCP / A2A server refuses to enumerate the `advisory` or `operator`
tool set for a new principal **unless** all of the following are true at
the time of `list_tools`:

1. The latest row in `.soc-reasoning-eval-runs` with `suite_kind: 'adversarial'`
   has `gate_decision in ('pass', 'marginal')` AND `aggregate.min.no_secret_leakage == 1.0`.
2. The latest row in `.soc-reasoning-eval-runs` with `suite_kind: 'reasoning'`
   has `gate_decision in ('pass', 'marginal')`.
3. The calling principal is not currently flagged with `watchdog_frozen: true`
   in `.soc-actor-trust-tiers`.

If any precondition fails, the server returns only the `read-only` subset and
annotates `_meta.server_governance_hold` with the failing predicate. A
read-only principal is unaffected.

---

## 3. Tool catalog projection

Each ARGUS skill JSON under `soc-simulation/skills/` projects to **one MCP
tool descriptor** and **one entry in the A2A agent card**:

```
skill:<id>  →  MCP tool  argus.skill.<id>
            →  A2A skill <id>                                    (same key)
```

| Skill field | MCP descriptor field                  | A2A capability card field |
| ----------- | ------------------------------------- | ------------------------- |
| `id`        | `name` (`argus.skill.<id>`)           | `skill.id`                |
| `name`      | `description` (first line)            | `skill.name`              |
| `description` | `description` (full)                | `skill.description`       |
| (implicit)  | `inputSchema`   = `ARGUSSkillInput`   | `skill.input_schema`      |
| (implicit)  | `outputSchema`  = `ARGUSSkillOutput`  | `skill.output_schema`     |
| (derived)   | `annotations`                         | `skill.annotations`       |

The skill's `content` (system prompt) is **not** exposed externally.
External callers see a typed contract, not a jailbreakable prompt.

### `ARGUSSkillInput` (shared)

```ts
z.object({
  task:           z.string().min(1).max(4000),
  scope:          z.object({
    tenant_id:    z.string().optional(),
    space_id:     z.string().optional(),
    entity_ids:   z.array(z.string()).max(50).optional(),
    time_window:  z.string().regex(/^(now-)?\d+[smhd]$/).optional(),
  }).default({}),
  propose_only:   z.boolean().default(false),
  correlation_id: z.string().optional(),
});
```

### `ARGUSSkillOutput` (shared)

```ts
z.object({
  skill_id:            z.string(),
  summary:             z.string(),
  structured_output:   z.record(z.unknown()),
  trace:               z.object({
    reasoning_trace_id:  z.string(),           // -> .soc-reasoning-trace
    gen_ai_operation:    z.string(),           // OTEL gen_ai.operation.name
  }),
  mutation_intents:    z.array(z.object({
    intent_id:    z.string(),
    door_class:   z.enum(['one_way', 'two_way']),
    blast_tier:   z.enum(['small', 'medium', 'large', 'critical']),
    status:       z.enum(['proposed', 'auto_apply_ready', 'pending_review', 'applied', 'rejected']),
  })).default([]),
});
```

### Tool annotations per skill

Computed from the skill's tool_ids set:

| Annotation         | Rule                                                               |
| ------------------ | ------------------------------------------------------------------ |
| `readOnlyHint`     | `true` iff skill's tool_ids has no `rule_*`, `rec_*`, or `workflow.*` writer |
| `destructiveHint`  | `true` iff any tool in the skill deletes or disables an artifact  |
| `idempotentHint`   | `true` iff the skill is classified `read-only` or pure triage      |
| `openWorldHint`    | `true` iff the skill reads external feeds (Security Labs, KEV, CVE) |

---

## 4. Call dispatch pipeline

```
 external caller                            ARGUS governance
 ───────────────                            ────────────────
  MCP tools/call              ┌────────────────────────────┐
    or                        │                            │
  A2A tasks/send              │ 0) authenticate            │
        │                     │    → principal_profile     │
        ▼                     │                            │
 @kbn/argus-mcp-server        │ 1) manifest.projectFor(    │
  or @kbn/argus-a2a-server    │      profile, principal)   │
        │                     │    verify tool is exposed  │
        ▼                     │                            │
 @kbn/argus-tool-manifest ──► │ 2) dispatchSkillCall:      │
        │                     │    - build mutation_intent │
        │                     │    - actor_id = mcp:<c>    │
        │                     │    - correlation_id passed │
        │                     │    - propose_only applied  │
        │                     │                            │
        ▼                     │ 3) emit gen_ai.* span to   │
 Kibana internal API          │    .soc-reasoning-trace    │
 (agent builder tool call)    │                            │
        │                     │ 4) if write intent:        │
        ▼                     │    POST to                 │
 soc-argus-trust-gate         │    .soc-recommendations    │
 (2m scheduled; honors tier,  │    → soc-argus-trust-gate  │
  door_class, blast_tier)     │      decides applied or    │
        │                     │      pending_review        │
        ▼                     │                            │
 caller receives              │ 5) return ARGUSSkillOutput │
 ARGUSSkillOutput             │    with mutation_intents[] │
                              │    carrying resolved       │
                              │    status.                 │
                              └────────────────────────────┘
```

Key properties:

- **No new write paths**: the server writes `mutation_intent` the same way
  native ARGUS agents do. The trust gate is untouched and unaware of the
  caller's protocol.
- **`propose_only=true`** short-circuits to `status: 'pending_review'`
  regardless of the principal's profile. This is how `advisory` profile is
  enforced.
- **`correlation_id`** is the only identifier honored across MCP → A2A →
  `.soc-reasoning-trace` → `.soc-recommendations`. One ID threads the whole
  call for forensics.

---

## 5. Emission — reasoning trace

Every external call emits one top-level span to `.soc-reasoning-trace` with
the OTEL GenAI-1.x vocabulary we already ship (R9):

```
gen_ai.system                = 'argus'
gen_ai.operation.name        = 'argus.skill.<id>'
gen_ai.agent.id              = '<principal.actor_id>'
gen_ai.request.model         = '<profile>'
gen_ai.response.finish_reasons = ['tool_call_completed']
argus.transport              = 'mcp' | 'a2a'
argus.correlation_id         = '<correlation_id>'
argus.mutation_intents_emitted = <int>
```

This means the watchdog (R10) already sees external callers — no new plumbing.

---

## 6. Server lifecycle

### MCP server (v1 — stdio)

```
node scripts/argus_mcp_server.js \
  --kibana-url http://localhost:15601 \
  --kibana-service-account-token <token> \
  --principal mcp:local-dev \
  --profile advisory
```

- stdio transport, framed LSP-style JSON-RPC (handled by
  `@modelcontextprotocol/sdk`).
- Single-process, single-principal per run. Claude Desktop / Cursor spawn
  one process per configured server; that's the right unit of isolation.
- `--profile` is capped by what the `--kibana-service-account-token` is
  authorized for; it can downshift but never upshift.

### A2A server (v1 — stubbed)

- Generates a valid agent card at `GET /.well-known/agent.json`.
- Implements `POST /tasks/send` as "synchronous only, maps to the same
  dispatch pipeline as MCP tools/call".
- `tasks/sendSubscribe`, `tasks/cancel`, `tasks/resubscribe` return
  `NOT_IMPLEMENTED_V1` with a pointer to `docs/argus/roadmap/r12-a2a.md`.

Rationale: MCP covers ~80% of the interop value (every LLM client speaks
it). A2A gets the agent card + sync `tasks/send` so partner products can
smoke-test the surface today; streaming + cancellation land in a
follow-up commit.

---

## 7. What this scaffold does NOT change

- Skill JSONs under `soc-simulation/skills/` — same schema, no new fields.
- `mutation_intent.schema.json` — unchanged. External callers emit the same
  intent shape as native ARGUS agents.
- `soc-argus-trust-gate.yaml` — unchanged. The gate does not know or care
  that the caller came over MCP.
- Agent Builder tool registry — unchanged. We consume it; we do not redefine
  it.

The whole R12 surface is a **projection**, not a rewrite.
