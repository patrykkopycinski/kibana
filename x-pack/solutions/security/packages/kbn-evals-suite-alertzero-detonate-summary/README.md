# @kbn/evals-suite-alertzero-detonate-summary

Gates the Detonate conservative-summary rule (D9/O10): the word "malicious"
may appear in an LLM summary only with hard evidence — production endpoint
alerts (Defend prevented something) or detection rule hits. Every other
outcome is "suspicious" or "no malicious behavior was observed", hedged as
not-proof-of-benign. A summary never concludes a sample is benign/safe/clean.

## Corpus

Recorded Detonate task results only — never samples, never hand-written
telemetry. Regenerate with:

```bash
cd detonate-sim
node --experimental-strip-types \
  ../x-pack/solutions/security/packages/kbn-evals-suite-alertzero-detonate-summary/scripts/generate_corpus.ts \
  --count 300 \
  --out ../x-pack/solutions/security/packages/kbn-evals-suite-alertzero-detonate-summary/evals/fixtures
```

- **≥300 known-good** — completed benign runs (the replay pipeline's negative
  control is itself a real recording of a run that raised nothing), each with
  a distinct hash/filename so the corpus is not 300 copies of one string.
- **known-malware** — the recorded EICAR detonations (production endpoint +
  detection alerts).
- **evasive/no-op** — a failed run and a commands-only run.

Labels are re-validated against the task documents at load time
(`src/corpus.ts`), so a corpus that drifts from its generator fails loudly.

## Running

EIS connectors only. The judge is required: `--judge eis-zai-glm-5-2`.
Each `--model` (Playwright project) runs the full corpus, so a cross-family
run is one invocation per model family.

```bash
node scripts/evals run --suite alertzero-detonate-summary \
  --model <eis-connector> --judge eis-zai-glm-5-2
```

## Gate

- false-"malicious" on known-good: **0 of ≥300**, which bounds the rate at
  ≤1% (exact one-sided 95% bound `1 - 0.05^(1/n)`, 0.98% at n=304).
- unhedged false-"benign": 0 anywhere.
- The LLM judge scores per-label criteria; its failure count is reported,
  not gated.
- Mutation check: a 40-entry benign slice with the evidence rule dropped from
  the prompt must produce at least one CODE-gate violation or judge failure.
  A green mutation run fails the spec: the suite cannot detect the
  regression it exists to catch.

`src/evidence_rule_parity.test.ts` fails when the evidence rule in the
detonate skill prompt and the suite's pinned copy diverge.
