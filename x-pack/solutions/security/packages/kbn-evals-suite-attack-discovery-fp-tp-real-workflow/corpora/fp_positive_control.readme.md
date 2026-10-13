# fp-positive-control

Positive-control corpus for the FP verdict path. Motivation: across all 1,035
completed golden rows of `attack_discovery_fp_tp_analysis.yaml`, no fixture ever
produced the only FP-eligible shape (at least one world check `contradicts`,
none `supports`, entity store and raw events both non-empty), because every
existing FP twin keeps a malicious axis, which keeps the outcome mixed
(→ inconclusive). This corpus exists to prove the FP path is reachable end to
end.

Cases are `label=false_positive`, `label_provenance=positive-control` and are
benign on every axis by construction:

- every process event's parent is a management agent (`CcmExec.exe` or
  `mdmdaemon.exe`);
- every network destination is a vendor/management endpoint
  (`graph.microsoft.com`, `download.windowsupdate.com`);
- no malicious strings in any `message` / `command_line`;
- valid `host.name` / `user.name` so entities and events are seeded (non-zero
  hits through `buildEvidence`);
- 3–6 events inside the ±2h discovery window.

Invariants are enforced by `src/positive_control.test.ts`. Do not mutate these
cases into an adversarial shape — add to `adversarial_twins.jsonl` instead.
