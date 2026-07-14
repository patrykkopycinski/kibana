# Proposal / Evidence — unknowns flush (spike implementation)

**Date:** 2026-07-14  
**Module:** `server/common/contracts/ratification_packet.ts`  
**API:** `GET /api/daybreak/ratification-packet`  
**Export:** `scripts/export_ratification_packet.mjs` → `data/ratification-packet/`

Golden examples are **not hand-authored JSON** — they are built at runtime from:

| Example | Builder source |
| --- | --- |
| FPR proposal + alert evidence | `daybreak-golden-benign-vuln-scanner` → `buildProposalFromWorkerRun` + `buildEvidencePackageFromEnrichedAlert` |
| AD proposal + tool evidence | `attack_discovery_dataset` `ad-useful-continuation` → `mapAttackDiscoveryToProposal` |
| Approved variant | `buildGoldenApprovedProposal` over FPR base |

## Regenerate

```bash
# from Kibana repo root (daybreak-spike worktree)
yarn jest --config x-pack/solutions/security/plugins/daybreak/jest.config.js \
  --testPathPattern=ratification_packet --maxWorkers=4 --workerIdleMemoryLimit=512MB

node x-pack/solutions/security/plugins/daybreak/scripts/export_ratification_packet.mjs
```

## Spike vs CWL stub

`buildRatificationPacket()` includes `cwlStubPairs` — each pair is
`mapProposalToCwlStub(spikeProposal)` from `watch_floor_contract.ts`.

Unmapped fields: `UNMAPPED_SPIKE_PROPOSAL_FIELDS` in `ratification_packet.ts`.

## Unknowns flush matrices

- `FIELD_DECISIONS` — 8 platform field decisions (FD-01…FD-08)
- `UNKNOWNS_MATRIX` — 6 org/platform unknowns (U-PLATFORM-01…U-NIGHTSHIFT-01)

Both are exported to JSON by the export script and served live via the API route.

## CI

`ci_run_daybreak_gates.sh` runs `ratification_packet` jest + export after schema export.

## Related

- `docs/watch-floor-contract-ratification.md` — CWL mapping summary
- `docs/evidence-package-schema.md` — evidence field glossary
- project-daybreak `proposal-evidence-unknowns-flush.md` — review agenda for #17942
