# Epic 17090 — Custom Rule Creation Skill Audit

> **Status:** completed 2026-05-05.
> **Tracked by:** B15 in `conformance-matrix.md` §10.
> **Source epic:** [`elastic/security-team#17090`](https://github.com/elastic/security-team/issues/17090) (Phase 1, item 0 — _Audit: Existing Skill Assessment (prerequisite)_).
> **Audited by:** AutoDEX worktree (autonomous review of source).

This document satisfies the prerequisite audit task that the epic body
requires before any sub-skill (Alerting v2 / RnA support, MITRE Milestone 2
mapping, rule editing from chat) can begin. It answers the six questions
the epic enumerates and proposes a concrete next-step plan that aligns with
the AutoDEX vision (Path A as the canonical synthesis path) while staying
inside the epic's scope.

---

## 1. Scope

The "existing rule creation skill" today consists of **two registered
skills** plus the underlying `security.create_detection_rule` builtin
tool — F-012 in the conformance matrix already noted that there are two
partial entry points, not one:

| Surface | Code | Role | Path |
|---|---|---|---|
| `detection-rule-edit` | `agent_builder/skills/detection_rule_edit/index.ts` | Chat-first **create + edit** entry point. Freeform LLM, attachment-driven. | F-011 (freeform path, no rigor). |
| `argus.assess_cve` | `agent_builder/skills/argus_playbooks/assess_cve_skill.ts` | CVE-triggered **create**. Now (post-B1.d) routes through Path A. | Path A (rigorous: Pareto frontier + variant validation + golden-set blocklist + envelope-shaped mutation intent). |
| `security.create_detection_rule` (tool) | `agent_builder/tools/create_detection_rule_tool.ts` | The actual rule-builder. Wraps the LangGraph below. | Called by `detection-rule-edit` only. |
| LangGraph builder (5 nodes) | `lib/detection_engine/ai_rule_creation/agent/build_agent_graph.ts` | The pipeline that turns a `user_query` into a finished rule attachment. | Inline; not exposed as discrete tools. |

Auxiliary tools the `detection-rule-edit` skill is explicitly told to use:
`security_labs_search`, `platformCoreTools.generateEsql`,
`platformCoreTools.productDocumentation`, plus the agent-builder
core attachment primitives (`attachment_read`, `attachment_update`).

The `security.create_detection_rule` tool is gated by the
`aiRuleCreationEnabled` experimental feature flag (see
`create_detection_rule_tool.ts:52-58`).

---

## 2. The six audit questions

### Q1 — What rule types does it currently support? What's missing?

**Supported today:** **ES|QL only**. The pipeline is hard-coded:

- The skill content explicitly says: _"This covers the rule type ES|QL.
  Do not create a rule with a rule type other than ES|QL. Only create
  ES|QL rules."_ (`detection_rule_edit/index.ts:37`).
- `generateEsqlQueryNode` always sets `language: 'esql'` and `type: 'esql'`
  on the rule state (`generate_esql_query.ts:103-106`). There is no branch
  for any other rule type.

**Missing:** every other Detection Engine rule type — `query`
(KQL/Lucene), `eql`, `threshold`, `threat_match`, `new_terms`,
`machine_learning`. **Alerting v2 / RnA** is not represented at all (no
node, no tool, no skill content).

**Recommendation (epic alignment):** the AutoDEX vision biases toward
ES|QL because Path A's variant generation is ES|QL-friendly and the
analytics SDE reads the same store. Keep ES|QL as the primary path and
gate non-ES|QL types behind a follow-up sub-skill (epic 17090 sub-skill
"Custom rule creation for Alerting v2 (RnA)") — do not silently expand
the LangGraph today. The order in §4 below makes this concrete.

### Q2 — What context does it resolve today?

| Context the epic asks about | Resolved? | How | Gap |
|---|---|---|---|
| **Index patterns / fields** | ✅ | `generateEsql` (in `@kbn/agent-builder-genai-utils`) calls into `esClient` for field discovery and ES|QL syntax validation. | Field discovery is **trapped inside `generateEsql`** — there is no `get_index_fields` tool that other skills (e.g. tuning, lifecycle) can call without re-running query generation. |
| **MITRE ATT&CK** | ✅ (output) / ❌ (tool) | `addMitreMappingsNode` statically imports the canonical MITRE tables from `common/detection_engine/mitre/mitre_tactics_techniques` and validates the LLM's tactic/technique/sub-technique picks against them (`add_mitre_mappings.ts:44-133`). Output is grounded in real IDs. | No `get_mitre_techniques` tool. Other skills (rule tuning, coverage analysis, prebuilt-rule lifecycle) cannot reuse this without re-importing the same library. The static-import approach also makes MITRE updates require a Kibana redeploy. |
| **Tag harvesting** | ✅ (creation only) | `getTagsNode` calls `getPrebuiltRulesTags(savedObjectsClient)` + `getCustomRulesTags(rulesClient)` and asks the LLM to pick relevant tags from the union. | Tag harvesting is **not** exposed as a tool either. And the same code paths (prebuilt + custom rules) are exactly what a `list_rules` deduplication tool would call — they exist but are unreachable from outside this graph. |
| **Deduplication / overlap with existing rules** | ❌ | The skill content claims dedup via `list_rules` (epic body row "Existing rules (for deduplication)" → `list_rules` tool), but the actual skill has no such tool wired in and the LangGraph never asks "is there already a rule that does this?". `getTagsNode` reads existing rules **only** to extract tag names. | This is the largest single gap relative to the epic body. A user can ask "create a rule that detects T1059.001 PowerShell" and get a brand-new rule even if six near-duplicates already exist. |
| **Alert volume baseline** | ❌ | Not consulted at all. | Epic body lists `aggregate_alerts` and `get_alert_volume_baseline` as required tools; neither exists. The `argus.run_backtest` tool partially overlaps for the CVE-driven path but is not on the chat path. |
| **User intent** | ✅ | The whole graph runs off `state.userQuery` (the natural-language `user_query` schema input). | None — but see Q5 on freeform reliability. |

### Q3 — What tools does it call, and are they reusable across other skills?

**Tools the skill exposes via `getRegistryTools()`:**

```ts
[
  SECURITY_CREATE_DETECTION_RULE_TOOL_ID,          // builtin — the LangGraph wrapper
  SECURITY_LABS_SEARCH_TOOL_ID,                    // reusable
  platformCoreTools.generateEsql,                  // reusable, sits in @kbn/agent-builder-genai-utils
  platformCoreTools.productDocumentation,          // reusable
]
```

**Tools the LangGraph itself calls internally** (NOT exposed):

| Internal call | Reusable as a tool? | Notes |
|---|---|---|
| `generateEsql({ nlQuery, additionalInstructions, executeQuery: false, … })` | ✅ already a platform-core tool | Used both inside and exposed at the registry. |
| `rulesClient.find` (in `getCustomRulesTags`) | ❌ inline | Could be a `list_rules` tool. |
| `savedObjectsClient` lookup of prebuilt rules (in `getPrebuiltRulesTags`) | ❌ inline | Could fold into the same `list_rules` tool. |
| Static import of `mitre_tactics_techniques` | ❌ static | Could be a `get_mitre_techniques` tool with `version` parameter. |
| LLM call: rule name + description (`createRuleNameAndDescriptionNode`) | partial | Could be a `propose_rule_name_and_description` tool, though arguably this is the agent's job to do directly via chat rather than a tool round-trip. |
| LLM call: schedule selection (`addScheduleNode`) | partial | Could be a `propose_rule_schedule` tool that takes the rule type + query and returns a recommended interval/from. |
| LLM call: MITRE selection (`addMitreMappingsNode`) | ❌ would need a `get_mitre_techniques` tool first to be model-agnostic. |

**Tools the epic body lists that do not exist anywhere in the codebase
today** (skill-specific or otherwise):

- `preview_rule` ❌
- `validate_rule_syntax` ❌
- `aggregate_alerts` ❌
- `aggregate_alerts_for_rule` ❌
- `get_alert_volume_baseline` ❌
- `preview_exception` ❌
- `add_exception` ❌
- `get_index_fields` ❌ (effectively done inside `generateEsql` but not addressable)
- `get_mitre_techniques` ❌
- `list_rules` ❌

(The Rule Tuning epic 17091 lists most of the same set as `false_positive_reduction` / `alert_volume_optimization` skill prerequisites — see B7. Building these tools once, here, unblocks 17091 as a near-trivial add.)

### Q4 — How does it currently surface output?

**Form-driven via the Rule Attachment.** The flow:

1. User asks "create a rule that detects X" in chat.
2. `security.create_detection_rule` runs the LangGraph end-to-end and
   produces a finished rule object.
3. The tool calls `attachments.add({ id: SECURITY_RULE_ATTACHMENT_ID, type:
   SecurityAgentBuilderAttachments.rule, data: { text: JSON.stringify(rule),
   attachmentLabel: rule.name } })` (`create_detection_rule_tool.ts:127-145`).
4. The skill content then forces the agent to render
   `<render_attachment id="…" version="…" />` inline. The user reviews
   the rule via the Security Solution attachment UI (the rendering
   widget owns all field-level UX — severity dropdowns, MITRE tag
   pills, schedule controls, etc.).
5. For edits, the skill instructs the LLM to `attachment_read` →
   parse JSON → modify → re-stringify → `attachment_update`.

So:

- **Not freeform** (no plain-text rule definitions).
- **Not pure structured-schema** (the rule is rendered through an
  attachment widget, not surfaced as a typed JSON object the chat UI
  inspects).
- **Form-driven via attachment**, with the conversation as the
  scaffolding around the form.

This works for one-shot creation but has two consequences:

1. **The rule lives inside the attachment's `text` field as
   stringified JSON.** Every edit is a parse → mutate → stringify
   loop driven by the LLM. There is no per-field tool — `attachment_update`
   takes the whole stringified blob. F-011 risks every edit (the
   LLM can accidentally drop fields).
2. **The conversational entry has no preview-before-create surface**
   the way the epic specifies. The rule is _created_, then the user
   reviews. There's no "show me the rule definition first, ask me to
   approve, then commit." The attachment renders post-creation.

### Q5 — Where does it break or produce unreliable results?

| Failure mode | Cause | Severity |
|---|---|---|
| **Rule has no real-world support** (F-011) | The LangGraph relies on `generateEsql` for query syntax + on the LLM for MITRE/tags/schedule, then writes the rule. There is **no precision/recall check, no variant validation, no golden-set blocklist, no FP-rate gate** — Path A's gates are exclusive to the CVE entry point today. | **High.** A user can create a rule that fires on benign data and only finds out post-deploy. |
| **Near-duplicate rules** | No `list_rules` dedup check (Q2). | High. |
| **Edits silently drop fields** | The "stringify the whole rule" pattern in `detection-rule-edit/index.ts:78-85` puts the burden on the LLM to keep every field. Any field the LLM omits from its mental model is lost. | High for fields the LLM doesn't know about (custom action items, RBAC scoping, exception lists). |
| **MITRE sub-techniques silently dropped** | `formatMitreMapping` in `add_mitre_mappings.ts:80-110` filters sub-techniques that don't belong to the picked technique without surfacing the drop. The user gets a less-specific mapping with no warning. | Medium. |
| **Unsupported rule type silently produces ES|QL** | Skill content forbids non-ES|QL but `security.create_detection_rule` will still answer if asked for an EQL or threshold rule — it will just produce an ES|QL rule with the same intent. | Medium (UX surprise). |
| **Tag selection only sees existing tags** | If the user wants a brand-new tag, the LLM either invents one (silently — `getTagsNode` filters to `availableTags.includes(tag)` so it gets dropped) or settles for an irrelevant existing tag. | Low. |
| **Failure of an inner node ends the whole graph** | `shouldContinue` returns `'end'` on any error (`build_agent_graph.ts:105-110`). So a transient `generateEsql` failure terminates the rule before name/description/MITRE/schedule are populated. | Low — the user sees an error, not a partial rule. But there's no retry beyond `generateEsql`'s own `maxRetries: 3`. |
| **No connector → silent unavailability** | Tool reports `status: 'unavailable'` (`create_detection_rule_tool.ts:51-65`) but only when the experimental flag is off. With the flag on but no default model, the tool returns the connector error mid-handler, not at availability check time. | Low — but observable to the user as a runtime error rather than a graceful fallback. |

The largest reliability gap is the **first row**: chat-driven rule
creation today lacks any Path A-style gate. F-011 is the matrix
shorthand for this.

### Q6 — What would need to change for a chat-first conversational flow?

The epic already names the goal: a conversation must carry all
necessary context without a UI scaffold. Today the attachment widget
is half of the UX. To make chat first-class:

1. **Decompose the LangGraph into reusable tools** (Q3 list).
   Building these once unblocks 17090, 17091, 17092, 17093 — all four
   later epics ask for some subset. Concretely:
   - `security.list_rules` — wraps `getCustomRulesTags` + prebuilt look-up.
   - `security.get_index_fields` — extracts the field-discovery from `generateEsql`.
   - `security.get_mitre_techniques` — exposes the static MITRE lib.
   - `security.preview_rule` — runs the LangGraph but does NOT add the attachment, returning a structured rule object the agent can present in chat for approval.
   - `security.validate_rule_syntax` — calls into ES|QL parser + Detection Engine schema validators.
   - `security.aggregate_alerts_for_rule` + `security.get_alert_volume_baseline` — back the tuning skill (B7) and the volume gate.
   - `security.preview_exception` + `security.add_exception` — back the tuning skill again.
2. **Funnel chat-driven creates through Path A** (the same path
   `argusAssessCveSkill` now uses post-B1.d). Concretely: the
   `detection-rule-edit` skill should call
   `argus.synthesize_rule_candidate` with `origin: 'manual'` (or a new
   `origin: 'chat'`) for any greenfield create operation, so the rule
   inherits Pareto frontier evaluation + variant validation + golden-set
   blocklist + envelope-shaped mutation intent. The current
   `security.create_detection_rule` becomes the **fallback** for the
   tiny set of cases where Path A cannot apply (e.g. user provides a
   raw ES|QL query and explicitly opts out of synthesis). This closes
   F-011 for the chat path.
3. **Add a real preview-before-create step.** With `security.preview_rule`
   in place, the skill content changes from "create then render
   attachment" to "preview → user approves → call
   `attachment.add` (or skip attachment entirely and write the
   mutation intent through Path A's gates)".
4. **Replace the stringified-JSON edit model.** Once tools exist for
   each rule field family (severity/risk_score, threat[], schedule,
   query, index, tags), edits become per-field tool calls instead of
   round-trip parse/stringify. This eliminates the silent-field-drop
   failure mode.
5. **Surface unsupported rule types explicitly.** When the user
   asks for an EQL/threshold/threat_match/new_terms/ML rule, the
   skill should tell them so and either offer the closest ES|QL
   equivalent or hand off to the appropriate sub-skill (Alerting v2 / RnA
   or "rule type expansion" follow-up).
6. **Make MITRE sub-technique drops loud, not silent.** When
   `formatMitreMapping` filters out a sub-technique because it
   doesn't belong to the parent technique, surface that to the
   conversation as a clarifying question.
7. **Decide on Alerting v2 / RnA timing.** Per the epic body, this
   is a post-audit decision. Recommendation: schedule it after the
   tool decomposition (step 1) and Path A funnel (step 2) — Alerting v2
   support is far cheaper to add when each rule field has its own
   tool than when the whole thing is a 5-node LangGraph.

---

## 3. How this aligns with B7 (Rule Tuning) and B8 (Prebuilt Rule Lifecycle)

The tools enumerated in §Q6 step 1 are mostly the same set
epic 17091 (Rule Tuning, B7) and epic 17093 (Prebuilt Rule Lifecycle,
B8) require. Building them under epic 17090 (post-audit) is the
right move because:

- B7 needs: `aggregate_alerts_for_rule`, `get_alert_volume_baseline`,
  `preview_exception`, `add_exception`. All four are listed above.
- B8 needs: `list_rules`, `get_index_fields`, `get_mitre_techniques`,
  `preview_rule`, `validate_rule_syntax`. All five are listed above.
- The Path A funnel (§Q6 step 2) is also what B7 needs to honor
  the trust-policy gates when an automatic tuning suggestion ships
  a mutation intent.

So the audit naturally gates **all three** chat-skill epics: 17090
funnels through Path A and gets the new tool decomposition; 17091
and 17093 build on those tools.

---

## 4. Concrete next-step plan (post-audit)

Treat the audit findings as a four-step ramp inside the AutoDEX
worktree. Each step is independently shippable and the order is
deps-respecting.

| Step | What | Closes | Why this order |
|---|---|---|---|
| **17090.1** | Extract `security.list_rules`, `security.get_index_fields`, `security.get_mitre_techniques` as standalone tools. Wire them into `getDetectionRuleEditSkill().getRegistryTools()`. | F-012 partial; B8 prerequisite. | Cheapest. Pure refactor of code that already exists inside the LangGraph. |
| **17090.2** | Add `security.preview_rule` (no-attachment variant of `create_detection_rule`) + `security.validate_rule_syntax`. Update `detectionRuleEdit` skill content to preview-before-create. | F-011 partial. | Builds on 17090.1's tool plumbing. Lays the contract for B7/B8 preview UX. |
| **17090.3** | Funnel `detectionRuleEdit` create-path through `argus.synthesize_rule_candidate` (Path A) with `origin: 'manual'`. Keep `security.create_detection_rule` as the fallback. | **F-011 (chat path).** | Path A already exists post-B1.d. The plumbing is one tool call swap + skill content edit. The CVE entry point already proves the pattern works. |
| **17090.4** | Add `security.aggregate_alerts_for_rule`, `security.get_alert_volume_baseline`, `security.preview_exception`, `security.add_exception`. These are the B7 prerequisites that also benefit creation (alert-volume sanity check before commit). | B7 prereqs. | Last because it's net-new tool surface (rest of the steps are reuse / reroute). |

Step 17090.4 produces the toolset epic 17091 (Rule Tuning) needs;
B7 then becomes "compose the tools into a tuning skill" rather
than "build everything from scratch".

After all four steps, F-012 fully resolves (both 17090 entry points
go through Path A) and F-011 closes for the chat path. The freeform
"create a rule" loop becomes a structured tool-driven flow with the
same rigor the autonomous synthesis driver already enforces.

---

## 5. Audit hygiene

This audit was performed in-tree from the source code as it stood at
worktree HEAD on 2026-05-05. The Phase 1 shared spreadsheet referenced
in the epic body
([link](https://docs.google.com/spreadsheets/d/1xkDrM0uVehGmldRey06po6j3xzfjz36N5lxd9hX5hpA/edit?usp=sharing))
should be cross-checked by the epic owners before sub-skills begin —
specifically the "tool reuse" column should be reconciled against §Q3
above. If a tool already exists under a different name, fold it
into 17090.1 instead of creating a duplicate.

---

## 6. Sign-off conditions for B15

B15 closes when:

- [x] Source-code reading complete for `detection-rule-edit`,
  `argus.assess_cve`, `security.create_detection_rule`, and the
  underlying LangGraph (5 nodes).
- [x] All six audit questions answered with file/line citations.
- [x] Concrete next-step plan documented (§4) and aligned with B7/B8
  prerequisites.
- [x] Conformance matrix B15 row updated to "resolved" with link to
  this doc.

Once the matrix is updated, B15 is closed and B7 can begin (epic body
order: 17090 audit first, then 17091).
