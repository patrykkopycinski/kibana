/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Reference content loaded alongside the detonate skill.
 *
 * Kept separate from the system instructions because it is reference material
 * the agent reads when it needs detail, not instruction it must follow on
 * every turn.
 */
export const DETONATE_PROTOTYPE_REFERENCE = `# Detonation runs

## What a run is

A detonation boots a throwaway virtual machine with Elastic Defend installed and
enrolled, fetches the sample by hash, runs it, waits, then tears the VM down and
summarises the telemetry Defend produced. The answer is behavioural: what the
sample *did* on a real endpoint, not what a reputation source says about it.

Minutes, not seconds. Submitting and polling are separate tools for that reason.

## Reading the state

A task carries a worker name and a worker status, not a "done" flag. The tools
derive three booleans from them:

- \`complete\` — the run reached its terminal worker, or failed. Stop polling.
- \`failed\` — the run ended badly: the VM never came up, the sample could not be
  fetched, the agent never enrolled. There is no behavioural verdict.
- \`quiet\` — the run finished cleanly and produced **zero** alerts.

\`progress\` reports the stage as \`step\`/\`of\` plus the worker's short name, which
is what to tell an analyst who asks how far along a run is.

## What zero alerts means

A quiet run is a result, not a failure. It means one of:

1. The sample did nothing malicious in the time it was given — though this is
   not proof the sample is harmless (no behavior was observed ≠ safe).
2. The sample detected the sandbox and declined to run.
3. Elastic Defend has a gap for this behaviour.

Report it as a finding and say which of those you can and cannot rule out.
Never report a quiet run as "the detonation did not work" — that is \`failed\`,
which is a different field.

## The three telemetry buckets

- **production endpoint alerts** — what a customer's Defend would have raised.
  This is the bucket that answers "would we have caught this".
- **diagnostic endpoint alerts** — Defend's diagnostic stream, broader and
  noisier. Useful for "did Defend see the behaviour at all", which can be yes
  when the production bucket is empty.
- **production detection alerts** — SIEM detection rules firing on the run's
  events. Grouped by rule name, with severity.

A sample with diagnostic alerts but no production alerts is a specific and
reportable finding: the behaviour was observed but not alerted on.

Endpoint alerts group by \`event.code\`; detection alerts group by rule. The two
group shapes are different and should not be conflated in an answer.

## Before submitting

Check \`list_detonations\` for the hash. A sample that has already been detonated
has a recorded result, and re-running it spends sandbox time to reproduce an
answer that already exists. Re-run only when the analyst explicitly wants a
fresh run, or when the recorded run failed.

## What this cannot do

- It cannot detonate a file the analyst has in hand — submission is by hash, and
  the service fetches the sample from its sources. A hash no source holds cannot
  be detonated; that comes back as a failed run, not a quiet one.
- It cannot cancel a run in flight.
- It does not return raw alert documents. For those, open the run in the
  Detonate page in the Security UI.
`;
