## Attack Discovery eval suite (`attack-discovery`)

This package provides a Kibana eval suite for **Attack Discovery** using the `@kbn/evals` framework (Playwright + Scout).

It's designed to:
- run dataset-driven evals with data sourced from the **golden cluster** (managed datasets API)
- exercise multiple input modes (bundled alerts, search alerts via API, graph state)
- score outputs with a legacy rubric (LLM-as-judge) plus deterministic sanity checks

### Suite ID

- **`attack-discovery`**

Registered in `.buildkite/pipelines/evals/evals.suites.json`.

---

## What this suite evaluates

The core task is: **generate Attack Discoveries** from alert context.

Outputs are scored by:
- **`AttackDiscoveryBasic`** (`CODE`): ensures the output is present and shaped correctly
- **`AttackDiscoveryRubric`** (`LLM`): legacy rubric-based correctness judgement (Y/N mapped to score 1/0)
- **`Criteria`** (`LLM`): per-example criteria judgement, when the example has criteria

### Task failures

A run that never received a model response is tagged `errorKind: 'infrastructure'` on the task
output. The quality evaluators (`AttackDiscoveryBasic`, `AttackDiscoveryRubric`, `Criteria`) score
such a run `score: null` (N/A, label `task_error`, with the first error as the explanation), so it
is excluded from means instead of counting as a wrong answer. Trace-based neutral metrics (token
and latency evaluators) are not gated on the marker and may still record values for a run that has
a `traceId`.

Infrastructure failures:

- One status rule covers `inferenceClient.chatComplete`, the `searchAlerts` Elasticsearch fetch and
  the `generateApi` anonymization-fields lookup, `_generate` and poll requests. The HTTP status is
  read from `status`, `statusCode` or `meta.statusCode` (values below 100, such as the `0`
  Elasticsearch sets on connection errors, are not a status). It is infrastructure for `401`, `403`,
  `404`, `408`, `429`, `502`, `503` or `504`. With no HTTP status it is infrastructure only for a
  transport error (connection reset/refused/timeout/DNS codes or `fetch failed`, found anywhere in
  the `cause` chain), an `AbortError`, or an Elasticsearch client `ConnectionError`, `TimeoutError`,
  `NoLivingConnectionsError` or `RequestAbortedError`. Any other status-less error (for example a
  `TypeError` from a harness bug) scores `0`.
- `searchAlerts` mode: the alert search retries `408`/`429`/`502`/`503`/`504` and status-less errors
  twice, rethrows any other HTTP status at once, and rethrows the final error after the retries
  (there is no empty-alert fallback). The rule above then decides: an ES `503` or a connection
  failure is infrastructure, while a deterministic harness/dataset error such as an ES `400` for a
  malformed `filter` or `alertsIndexPattern` scores `0`. An ES `404` here is also scored `0`: it
  is `index_not_found_exception` for an `alertsIndexPattern` that does not exist, a dataset error
  (`chatComplete` and `generateApi` keep treating `404` as infrastructure).
- `generateApi` mode:
  - the anonymization-fields lookup that runs before `_generate` is rejected with an infrastructure
    status or a transport error (`_generate` is then not called); a `400` or other unlisted status
    scores `0`. A successful lookup that returns an empty list is a misconfiguration and scores
    `0`;
  - the `_generate` request returns no `execution_uuid` (the stack produced no generation), or it
    is rejected with an infrastructure status or a transport error; a `400` or other unlisted
    status scores `0`;
  - a poll is rejected with an infrastructure status or a transport error, or gets `404` after the
    grace window; a poll `400` or other unlisted status scores `0`;
  - a retryable poll status (`429`/`5xx`) failed on at least 24 consecutive polls when the poll
    deadline is reached. The bound is counted in polls, not seconds: each failed poll also spends
    the HTTP handler's own retries, so it spans well over the 120s grace window. A shorter run of
    failed polls at the end leaves the timeout a model outcome;
  - the generation ends `canceled` or `dismissed` (nobody cancels in an eval, so the harness or the
    stack stopped it).

Everything else is a model failure and keeps scoring `0`: rejections with any other status
(including `400` provider refusals / content filters and `500` token-limit or context-length
errors), empty or unparseable completions (`Failed to parse insights ... after 3 attempts`),
`invalid_shape`, a generation that reported `failed`, and a poll deadline reached while the
generation is still reporting a non-terminal status. That includes a poll that returns 2xx without
`generation.status`: the client treats it as non-terminal and keeps polling until the deadline,
then reports `timed_out` unmarked. A task error without the marker is never treated as N/A.

A client socket timeout or gateway `504` on `chatComplete` is N/A; the generate-API poll deadline
(while the generation is still running) is the only timeout that scores `0`.

Harness misconfiguration (`Missing input`, a missing `generateApiClient` in `generateApi` mode, an
unreadable prompt file) is deliberately not tagged: it keeps scoring `0` so a broken setup fails
loudly instead of hiding as N/A.

A model whose runs all failed on infrastructure has no scored examples, so its count is `0` (the
CLI table shows `-`).

---

## Dataset sourcing

The dataset is **not checked into the repository** to avoid polluting OSS training data.
It is managed via the Evals dataset API on the golden cluster: https://kbn-evals-serverless-ed035a.kb.us-central1.gcp.elastic.cloud/

### Default (CI / golden cluster)

By default, the suite uses `trustUpstreamDataset: true` and resolves the dataset
by name from the golden cluster. The name defaults to `attack_discovery: bundled alerts (jsonl)`
and can be overridden with `ATTACK_DISCOVERY_DATASET_NAME`.

This requires `EVAL_KBN_URL` and `EVAL_KBN_API_KEY` to be set
(automatically configured in CI via the vault config, or locally via `local_ci_env.sh`).

### Local JSONL override

For local development, you can bypass the golden cluster and load directly from a
local JSONL file:

```bash
ATTACK_DISCOVERY_DATASET_JSONL_PATH=data/eval_dataset_attack_discovery_all_scenarios.jsonl \
  node scripts/evals run --suite attack-discovery ...
```

Place the JSONL in the `data/` directory (it is gitignored).

### Uploading the dataset to the golden cluster

Use the provided upload script. Set the required env vars from your config (or export them via your preferred method):

```bash
EVAL_KBN_URL=https://kbn-evals-serverless-ed035a.kb.us-central1.gcp.elastic.cloud \
EVAL_KBN_API_KEY=<your-api-key> \
  node x-pack/solutions/security/packages/kbn-evals-suite-attack-discovery/scripts/upload_dataset.js [path/to/file.jsonl]
```

If no path is given, it defaults to `data/eval_dataset_attack_discovery_all_scenarios.jsonl`.
The API key is the same one generated by `node scripts/evals init config`.

---

## Input modes

The suite supports an input union `AttackDiscoveryTaskInput` (`src/types.ts`):

### 1) `bundledAlerts` (primary / golden cluster dataset)

Use this when your dataset already contains anonymized alert context.

- **Dataset name**: `attack_discovery: bundled alerts (jsonl)`
- **Loader (local fallback)**: `src/dataset/load_attack_discovery_jsonl.ts`

Each example is mapped to:
- `input.mode = "bundledAlerts"`
- `input.anonymizedAlerts[]` (objects with `pageContent` + `metadata`)
- `output.attackDiscoveries[]` (expected results)

### 2) `searchAlerts` (API-backed)

This mode triggers Attack Discovery via the existing **public API**:
- `POST /api/attack_discovery/_generate`
- polls `GET /api/attack_discovery/generations/{execution_uuid}` until completion

Implementation lives in `src/clients/attack_discovery_client.ts`.

#### Snapshot-based alert data

To provide realistic alert data for the `searchAlerts` path, this suite supports
restoring an Elasticsearch snapshot from GCS before running:

```bash
node scripts/evals run --suite attack-discovery --grep "searchAlerts"
```

Defaults are pinned in code for repeatability:
- bucket: `security-ai-datasets`
- base path: `attack-discovery/oh-my-malware/2026-03-26`
- snapshot: `alerts-snapshot`

Override as needed:

```bash
ATTACK_DISCOVERY_ALERTS_SNAPSHOT_BUCKET=security-ai-datasets \
ATTACK_DISCOVERY_ALERTS_SNAPSHOT_BASE_PATH=attack-discovery/oh-my-malware/2026-03-26 \
ATTACK_DISCOVERY_ALERTS_SNAPSHOT_NAME=alerts-snapshot \
  node scripts/evals run --suite attack-discovery --grep "searchAlerts"
```

The restore uses the shared `GCS_CREDENTIALS` service account (automatically set via the vault config when using `node scripts/evals`).
See `@kbn/security-evals-alerts-snapshot` (`x-pack/solutions/security/packages/kbn-security-evals-alerts-snapshot/src/restore.ts`).

#### Dataset registry (Dataplex)

To make this snapshot discoverable via the Snapshot Dataset Management best practices, register it in Dataplex using the checked-in aspects file:

- `x-pack/platform/packages/shared/kbn-evals/snapshots/dataplex/security_ai/attack_discovery_oh_my_malware_2026_03_26.yaml`

Example:

```bash
gcloud dataplex entries create attack-discovery-oh-my-malware-2026-03-26 \
  --location=us-central1 \
  --project=elastic-observability \
  --entry-group=snapshot-datasets \
  --entry-type=projects/elastic-observability/locations/global/entryTypes/es-snapshot \
  --fully-qualified-name="custom:es-snapshots.security-ai-datasets.attack-discovery.oh-my-malware.2026-03-26" \
  --entry-source-resource="gs://security-ai-datasets/attack-discovery/oh-my-malware/2026-03-26" \
  --entry-source-display-name="Attack Discovery: oh-my-malware (2026-03-26)" \
  --entry-source-description="Attack Discovery alert snapshot for searchAlerts eval runs" \
  --entry-source-update-time="2026-03-26T00:00:00Z" \
  --aspects=x-pack/platform/packages/shared/kbn-evals/snapshots/dataplex/security_ai/attack_discovery_oh_my_malware_2026_03_26.yaml
```

### 3) `graphState` (prompt-input stub)

This mode accepts partial "graph-state-like" inputs and applies helpful defaults.
It's intended as an extension point for future parity with deeper legacy graph-state evaluation.

---

## How to run locally

### 0) Bootstrap

From repo root:

```bash
nvm use
pnpm kbn bootstrap
```

### 1) Set up local config (one-time)

```bash
node scripts/evals init config
```

### 2) Start the local eval stack (Scout)

```bash
nvm use && node scripts/evals scout
```

### 3) Run the suite (golden cluster dataset)

```bash
nvm use && node scripts/evals run --suite attack-discovery --model sonnet-3-7 --judge sonnet-3-7
```

### 4) Run with local JSONL override

```bash
nvm use && ATTACK_DISCOVERY_DATASET_JSONL_PATH=x-pack/solutions/security/packages/kbn-evals-suite-attack-discovery/data/eval_dataset_attack_discovery_all_scenarios.jsonl \
  node scripts/evals run --suite attack-discovery \
  --model sonnet-3-7 --judge sonnet-3-7
```

### 5) Fast smoke: run exactly one record

For fast local sanity checks with a local JSONL:

- `ATTACK_DISCOVERY_DATASET_LIMIT=1`: load only 1 JSONL record
- `ATTACK_DISCOVERY_DATASET_OFFSET=<n>`: skip the first `n` records (0-based)
- `ATTACK_DISCOVERY_EVAL_CONCURRENCY=1`: run the executor with concurrency 1

Example:

```bash
nvm use && ATTACK_DISCOVERY_DATASET_JSONL_PATH=data/eval_dataset_attack_discovery_all_scenarios.jsonl \
  ATTACK_DISCOVERY_DATASET_LIMIT=1 ATTACK_DISCOVERY_DATASET_OFFSET=4 ATTACK_DISCOVERY_EVAL_CONCURRENCY=1 \
  node scripts/evals run --suite attack-discovery \
  --model sonnet-3-7 --judge sonnet-3-7
```

---

## Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `ATTACK_DISCOVERY_DATASET_NAME` | Dataset name to resolve from golden cluster | `attack_discovery: bundled alerts (jsonl)` |
| `ATTACK_DISCOVERY_DATASET_JSONL_PATH` | When set, load dataset from this local JSONL path instead of the golden cluster | (unset) |
| `ATTACK_DISCOVERY_DATASET_LIMIT` | Max examples to load from JSONL | (all) |
| `ATTACK_DISCOVERY_DATASET_OFFSET` | Skip first N examples in JSONL | 0 |
| `ATTACK_DISCOVERY_EVAL_CONCURRENCY` | Concurrency for executor `runExperiment` | 5 |
| `ATTACK_DISCOVERY_ALERTS_SNAPSHOT_DISABLE` | Disable snapshot restore for `searchAlerts` smoke | (unset) |
| `ATTACK_DISCOVERY_ALERTS_SNAPSHOT_BUCKET` | GCS bucket for alert snapshot restore | `security-ai-datasets` |
| `ATTACK_DISCOVERY_ALERTS_SNAPSHOT_BASE_PATH` | GCS base path within the bucket | `attack-discovery/oh-my-malware/2026-03-26` |
| `ATTACK_DISCOVERY_ALERTS_SNAPSHOT_NAME` | Specific snapshot name (defaults to pinned) | `alerts-snapshot` |
| `EVAL_KBN_URL` | Golden cluster Kibana URL for dataset ops | (from vault config) |
| `EVAL_KBN_API_KEY` | API key for golden cluster Kibana | (from vault config) |

---

## Connector notes / troubleshooting

This suite uses `/internal/inference/prompt` for prompt-based generation and the rubric judge.
In some environments, **`.inference` connectors are not supported** by that endpoint. If you see:

- `Connector '...' of type '.inference' not recognized as a supported connector`

Use a connector that works with the inference prompt endpoint (e.g. `sonnet-3-7`).

If using Azure `.gen-ai` connectors and you see provider errors like `DeploymentNotFound`,
the configured deployment may not exist (or may not be reachable from your environment).

---

## Package notes

This suite is **Node-only** (Playwright eval suite), so `.oxlint/import_plugin.mts` disables
`import/no-nodejs-modules` inside this package.
