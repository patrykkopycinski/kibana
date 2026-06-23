# Detection Emulation + Endpoint Response Actions — E2E Demo Script

Greenfield stack for demonstrating **detection emulation** (`validateRule`) and **endpoint
response actions** (`execute_command`) skills in Agent Builder.

---

## Critical: always start Kibana with `--no-base-path`

Dev Kibana assigns a random base path (e.g. `/onp`) unless disabled. Fleet enrollment
scripts, `--kibanaUrl`, and Agent Builder all assume a fixed root URL.

```bash
cd /Users/patrykkopycinski/Projects/kibana.worktrees/detection-emulation-skill
KBN_USE_RSPACK=true yarn start --no-base-path
```

- **Kibana URL:** `http://localhost:5601` (no prefix)
- **Do not** use `yarn start` without `--no-base-path` for this demo stack

---

## Quick setup (automated)

From the repo root, after Elasticsearch is running and Kibana is up with `--no-base-path`:

```bash
./context/setup_demo_env.sh all          # config + token + fleet + endpoint + status
./context/setup_demo_env.sh status       # health check only
./context/setup_demo_env.sh detect-ip    # print Fleet host IP (TCP probe + heuristics)
```

Individual steps: `write-config`, `mint-token`, `fleet`, `endpoint`. Template:
`context/kibana.dev.yml.example` → `config/kibana.dev.yml` (gitignored).

---

## Stack overview

| Component | Endpoint | Notes |
|-----------|----------|-------|
| Elasticsearch | `http://localhost:9200` | Container `detection-emulation-es`, user `elastic` / `changeme` |
| Kibana | `http://localhost:5601` | `--no-base-path` required |
| Fleet Server | `https://192.168.1.4:8220` | Docker `dev-fleet-server.8220`; LAN IP reachable from host **and** multipass |
| Endpoint VM | `patrykkopycinski-dev-default-2068` | Multipass + Elastic Defend 9.5.0-SNAPSHOT |

Do **not** reuse `benchmarker-es` on `:9223` for this demo.

---

## One-time setup

### 1. Elasticsearch

Ensure `detection-emulation-es` is running on port 9200 with security enabled.

### 2. Kibana config (`config/kibana.dev.yml`, local only — do not commit)

```yaml
elasticsearch.hosts: ['http://localhost:9200']
elasticsearch.serviceAccountToken: '<create via ES API — see below>'

# Must be reachable from host scripts AND multipass VMs (not Docker bridge 192.168.139.x)
xpack.fleet.agents.fleet_server.hosts: ['https://192.168.1.4:8220']

xpack.fleet.outputs:
  - id: fleet-default-output
    name: default
    type: elasticsearch
    is_default: true
    is_default_monitoring: true
    hosts: ['http://host.docker.internal:9200']

xpack.securitySolution.enableExperimental:
  - endpointResponseActionsSkill
  - detectionEmulationLogInjection
  - detectionEmulationRealExecution

xpack.securitySolution.detectionEmulation:
  realExecutionEnabled: true
  allowlist:
    allowAll: true
```

Create a Kibana service account token (required on current `main`; do not use `elasticsearch.username: elastic`):

```bash
curl -s -u elastic:changeme -X POST \
  'http://localhost:9200/_security/service/elastic/kibana/credential/token/kibana-demo' \
  | jq -r .value
```

### 3. Start Kibana

```bash
KBN_USE_RSPACK=true yarn start --no-base-path
```

Wait for `Kibana is now available` in the log.

### 4. Fleet Server

Use the host LAN IP so `isFleetServerRunning()` (host-side) and multipass agents (VM-side)
can both reach Fleet:

```bash
export KIBANA_LOCALHOST_REAL_IP=192.168.1.4   # en0 LAN IP on this machine

node x-pack/solutions/security/plugins/security_solution/scripts/endpoint/start_fleet_server.js \
  --elasticUrl http://host.docker.internal:9200 \
  --kibanaUrl http://127.0.0.1:5601 \
  --username elastic \
  --password changeme \
  --version 9.5.0-SNAPSHOT \
  --port 8220 \
  --force
```

Verify: `curl -sk https://192.168.1.4:8220/api/status` → `{"status":"HEALTHY"}`

### 5. Enroll Elastic Defend endpoint (multipass VM)

```bash
export KIBANA_LOCALHOST_REAL_IP=192.168.1.4

node x-pack/solutions/security/plugins/security_solution/scripts/endpoint/run_endpoint_agent.js \
  --elasticUrl http://127.0.0.1:9200 \
  --kibanaUrl http://127.0.0.1:5601 \
  --username elastic \
  --password changeme \
  --version 9.5.0-SNAPSHOT
```

Confirm in **Fleet → Agents**: endpoint host `patrykkopycinski-dev-default-2068` is **Healthy**.

Shell into VM: `multipass shell patrykkopycinski-dev-default-2068`

---

## Demo flow (Agent Builder)

Open **Agent Builder** at `http://localhost:5601` → AI Assistant / chat.

### Part A — Detection emulation (log injection, safe)

1. Pick a detection rule with MITRE tags (e.g. Windows PowerShell) from **Security → Rules**.
2. Prompt:

   ```
   Validate my PowerShell detection rule (ID: <rule-id>) using log injection mode.
   ```

3. Expect: `validateRule` tool run, confidence score, matched/unmatched signals, persisted report.

See also: `x-pack/solutions/security/plugins/security_solution/server/lib/detection_emulation/DEMO.md`

### Part B — Endpoint response actions

1. Confirm endpoint visible under **Security → Endpoints** (hostname `patrykkopycinski-dev-default-2068`).
2. Prompt:

   ```
   List available endpoints and run a safe diagnostic command on patrykkopycinski-dev-default-2068.
   ```

3. Expect: HITL confirmation for destructive/real actions; `execute_command` dispatches to enrolled agent.

### Part C — Real execution (optional, destructive)

Requires `detectionEmulationRealExecution` flag and `realExecutionEnabled: true` in config.

```
Validate rule <rule-id> with real execution against patrykkopycinski-dev-default-2068
```

Operator must approve via Agent Builder confirmation UI before live EDR actions run.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Fleet script 404 on Kibana API | Restart with `yarn start --no-base-path`; use `--kibanaUrl http://127.0.0.1:5601` |
| Multipass cannot reach Fleet | Use `192.168.1.4` (en0), not `192.168.139.x` (Docker bridge) or `192.168.252.1` (multipass gateway — host scripts cannot probe it) |
| `Invalid route options (post )` on Kibana start | Ensure `DETECTION_ENGINE_EMULATION_HALT_URL` constant exists in `common/constants.ts` |
| Endpoint metadata empty | Wait 1–2 min after enrollment; check Fleet agent status is **online** |
| Stale Fleet Server containers | `docker kill dev-fleet-server.8220` then re-run `start_fleet_server.js --force` |

---

## Teardown

```bash
multipass delete -p patrykkopycinski-dev-default-2068
docker kill dev-fleet-server.8220
# Stop Kibana (Ctrl+C in dev terminal)
# Stop detection-emulation-es container if no longer needed
```
