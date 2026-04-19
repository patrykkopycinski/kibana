# M2.3 — Day 1 Checklist

**Milestone:** Mythos-era exploit-probability enrichment  
**Spec:** [`../issues/m2-3-exploit-probability.md`](../issues/m2-3-exploit-probability.md) · [`../scaffolds/m2-3-field-contract.md`](../scaffolds/m2-3-field-contract.md)  
**Pair owner:** Simulation (Pair B) secondary, after M2.4 primary lands.  
**Target Day-1 outcome:** field contract added to vulnerability enrichment pipeline; values mocked.

## Before you touch code

- [ ] Read the field contract in the scaffold.
- [ ] Inventory the existing vulnerability-enrichment code paths in Security Solution (search for `vulnerability_enrichment` or `exploit_probability` — start from wherever CVE enrichment is already joined to the alert/asset data model).
- [ ] Confirm you have a test alert with a CVE reference available on the staged cluster.

## Files to create / touch

```
x-pack/solutions/security/plugins/security_solution/server/lib/argus/
  exploit_probability/
    schema.ts                      # Zod schema matching scaffold §2
    scorer.ts                      # stub returning fixed 0.5
    scorer.test.ts
    index.ts
x-pack/solutions/security/plugins/security_solution/common/argus/
  exploit_probability_fields.ts    # exported field-name constants + TS types
```

Touch (minimally):

- The existing vulnerability-enrichment handler — add an `argus.exploit_probability` field to the written doc, value from `scorer()`. Guard behind a feature flag (see below).

## Feature flag

Add under existing experimental features config:

```ts
// x-pack/solutions/security/plugins/security_solution/common/experimental_features.ts
argusExploitProbabilityEnabled: false,
```

All new code paths must check this flag and no-op when off. This is how the
milestone lands safely on `main` ahead of the eval integration.

## First-commit skeleton (copy-paste)

`schema.ts`:

```ts
import { z } from '@kbn/zod';

export const exploitProbability = z.object({
  score: z.number().min(0).max(1),
  tier: z.enum(['low', 'medium', 'high', 'critical']),
  signals: z.object({
    cve_published_at: z.string().optional(),
    poc_observed: z.boolean().default(false),
    exploit_availability: z.number().min(0).max(1).default(0),
    actor_interest: z.number().min(0).max(1).default(0),
    patch_window_days: z.number().int().nonnegative().optional(),
  }),
  snapshot_id: z.string(),
  computed_at: z.string(),
});

export type ExploitProbability = z.infer<typeof exploitProbability>;
```

`scorer.ts` (day-1 mock):

```ts
import type { ExploitProbability } from './schema';

export function computeExploitProbability(
  cveId: string,
  now = new Date()
): ExploitProbability {
  return {
    score: 0.5,
    tier: 'medium',
    signals: {
      poc_observed: false,
      exploit_availability: 0,
      actor_interest: 0,
    },
    snapshot_id: `argus-ep-${cveId}-${now.toISOString()}`,
    computed_at: now.toISOString(),
  };
}
```

## Validate before pushing

```bash
node scripts/eslint --fix $(git diff --name-only HEAD)
node_modules/typescript/bin/tsc -b x-pack/solutions/security/plugins/security_solution/tsconfig.type_check.json --pretty
node scripts/jest x-pack/solutions/security/plugins/security_solution/server/lib/argus/exploit_probability/
```

## You are not stuck if…

- The existing enrichment pipeline isn't obvious — enrich a **new** Argus-namespaced field rather than editing the legacy one. Consolidation is a follow-up.
- You have no intel feed yet — M2.3 is allowed to compute against CVSS + CVE-publish-date signals alone on day 1; Glasswing ingestion (Phase 3) fills in the rest.
- Feature flag doesn't exist — create it in the first commit; that **is** the shippable day-1 artifact.

## Day-2 next steps

1. Replace the fixed `0.5` with a real scorer driven by CVE + published-at + (future) intel feed.
2. Wire the M2.1 evaluator to emit an `exploit_probability` delta into `.soc-detection-eval-runs`.
3. Consume the score in the trust-tier threshold logic (`phase-3/trust-thresholds.md`).
