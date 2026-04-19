# M2.2 — Day 1 Checklist

**Milestone:** Exploit-to-Detection Synthesis  
**Spec:** [`../issues/m2-2-exploit-to-detection.md`](../issues/m2-2-exploit-to-detection.md) · [`../scaffolds/m2-2-exploit-to-detection-tool.md`](../scaffolds/m2-2-exploit-to-detection-tool.md)  
**Pair owner:** Eval (Pair A, after M2.1 contract is frozen)  
**Target Day-1 outcome:** tool is registered, emits a dry-run `mutation_intent`, no eval yet (mocked).

## Before you touch code

- [ ] M2.1 evaluator **contract** is merged (the interface, not the body).
- [ ] Read the issue body and the tool contract in the scaffold.
- [ ] Confirm `kibana#258362` (DetEng skill) is resolvable — if not, work against a vendored fork under `x-pack/.../argus/_vendor/deteng-skill/` and remove the pin in a follow-up PR.

## Files to create

```
x-pack/solutions/security/plugins/security_solution/server/lib/argus/
  synthesis/
    synthesize_rule_from_exploit.tool.ts          # Agent Builder tool contract
    synthesize_rule_from_exploit.tool.test.ts     # dry-run only
    variant_generator.ts                           # stub that emits 1 variant for day 1
    variant_generator.test.ts
    index.ts
scripts/argus/
  m2-2-demo.ts                                    # end-to-end dry-run script (one CVE → one mutation_intent)
```

## First-commit skeleton (copy-paste)

`synthesize_rule_from_exploit.tool.ts`:

```ts
import { z } from '@kbn/zod';
import type { AgentBuilderTool } from '@kbn/agent-builder';

export const exploitPayload = z.object({
  cve_id: z.string().regex(/^CVE-\d{4}-\d+$/),
  advisory_url: z.string().url().optional(),
  poc_snippet: z.string().optional(),
  exploit_description: z.string().optional(),
});

export const synthesisResult = z.object({
  draft_rule: z.object({
    rule_id: z.string(),
    query_language: z.enum(['eql', 'esql', 'kql']),
    query: z.string(),
    justification: z.string(),
  }),
  variant_corpus_id: z.string(),
  mutation_intent_id: z.string(),
});

export const synthesizeRuleFromExploit: AgentBuilderTool<
  z.infer<typeof exploitPayload>,
  z.infer<typeof synthesisResult>
> = {
  id: 'security.detection.synthesize_rule_from_exploit',
  description:
    'Given a CVE + exploit context, synthesise a draft detection rule, emit a variant corpus, and register a mutation_intent for the applier/gate cascade.',
  inputSchema: exploitPayload,
  outputSchema: synthesisResult,
  async execute() {
    throw new Error('NotImplemented: M2.2 day 1 skeleton');
  },
};
```

Register it in `server/plugin.ts`:

```ts
plugins.agentBuilder?.registerTool(synthesizeRuleFromExploit);
```

## Validate before pushing

```bash
node scripts/eslint --fix $(git diff --name-only HEAD)
node_modules/typescript/bin/tsc -b x-pack/solutions/security/plugins/security_solution/tsconfig.type_check.json --pretty
node scripts/jest x-pack/solutions/security/plugins/security_solution/server/lib/argus/synthesis/
```

## You are not stuck if…

- The DetEng skill surface isn't wired yet — register the tool standalone; skill binding lands in the second commit.
- You can't produce 20 variants on day 1 — emit a single variant that matches the scaffolded `expected_fires` map; variant volume is a quality goal, not a gating one on day 1.
- The `mutation_intent` write target `.soc-recommendations` doesn't exist — set `refresh: 'wait_for'` and let the setup script handle index creation.

## Day-2 next steps

1. Implement `variant_generator` against at least one mutation axis (`command_args`).
2. Land the DetEng skill binding so `exploit_payload` inputs route to this tool.
3. Teach the applier to accept `argus.origin = exploit_to_detection` and route through the M2.1 eval gate.
4. Run `scripts/argus/m2-2-demo.ts` end-to-end for the Scenario 1 CVE.
