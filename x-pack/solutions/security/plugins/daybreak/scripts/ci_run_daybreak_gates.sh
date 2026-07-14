#!/usr/bin/env bash
# Gap #8 + full MVP primitive gates — local + Buildkite entrypoint.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../../../../.." && pwd)"
cd "$ROOT"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1090
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 2>/dev/null || true

echo "[ci-gates] Jest — daybreak CI gate parity + eval suites"
yarn jest --config x-pack/solutions/security/plugins/daybreak/jest.config.js \
  --testPathPattern="server/evals/(daybreak_ci_gate|alert_analysis_eval|l4_round_trip)" \
  --maxWorkers=4 --workerIdleMemoryLimit=512MB

echo "[ci-gates] Jest — full MVP primitives (Action Result, SKI/hunt, SSE finding types)"
yarn jest --config x-pack/solutions/security/plugins/daybreak/jest.config.js \
  --testPathPattern="(action_result_builder|hunt_adapter|sse_builder|proposals_from_hunt|attack_discovery_adapter|investigation_builder)" \
  --maxWorkers=4 --workerIdleMemoryLimit=512MB

echo "[ci-gates] Jest — full MVP capability offline gate (AD, hunt, investigation, SSE datasets)"
yarn jest --config x-pack/solutions/security/plugins/daybreak/jest.config.js \
  --testPathPattern="server/evals/full_mvp_capability_gate" \
  --maxWorkers=4 --workerIdleMemoryLimit=512MB

echo "[ci-gates] Spike schema export (#17942 ratification artifact)"
node x-pack/solutions/security/plugins/daybreak/scripts/export_spike_schemas.mjs

echo "[ci-gates] Ratification packet export (#17942 proposal/evidence flush)"
yarn jest --config x-pack/solutions/security/plugins/daybreak/jest.config.js \
  --testPathPattern="ratification_packet" \
  --maxWorkers=4 --workerIdleMemoryLimit=512MB
node x-pack/solutions/security/plugins/daybreak/scripts/export_ratification_packet.mjs

echo "[ci-gates] Offline eval report artifact"
node x-pack/solutions/security/plugins/daybreak/scripts/daybreak_eval_gate.mjs

echo "[ci-gates] PASS"
