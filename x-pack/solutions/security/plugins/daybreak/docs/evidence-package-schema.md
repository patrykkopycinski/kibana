# Evidence package schema (Gap #2 — closed)

**Schema version:** `1.0.0-spike` (`DAYBREAK_EVIDENCE_SCHEMA_VERSION`)  
**Canonical types:** `server/common/schemas/evidence_package.ts`  
**ES index shape:** `server/client/evidence/storage.ts` (`EvidenceProperties`)

## EvidencePackage fields

| Field | Type | Role |
|---|---|---|
| `id` | string | Stable evidence id |
| `schemaVersion` | string | Spike schema version |
| `kind` | alert \| tool \| … | Evidence classification |
| `summary` | string | Human-readable stance summary |
| `provenance` | capability \| tool \| … | How evidence was produced |
| `confidence` | number | 0–1 weight |
| `stance` | for \| against \| neutral | Triage direction |
| `stanceSignals` | array | Enrich-phase weighted signals |
| `alertId` | string? | Linked alert |
| `tactics` | string[]? | MITRE tactics |

## Builders

- `buildEvidencePackageFromEnrichedAlert()` — Enrich phase → package
- `toEvidenceProperties()` — package → ES document

## Verification

```bash
yarn jest --config x-pack/solutions/security/plugins/daybreak/jest.config.js   --testPathPattern="evidence_package.test" --maxWorkers=4 --workerIdleMemoryLimit=512MB
```
