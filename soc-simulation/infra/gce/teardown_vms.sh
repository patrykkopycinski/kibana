#!/usr/bin/env bash
# soc-simulation/infra/gce/teardown_vms.sh
# Destroy GCE endpoint VMs for SOC simulation.
# Usage: ./teardown_vms.sh --confirm

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../../.env"
CONFIRMED=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --confirm) CONFIRMED=true; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [[ "$CONFIRMED" != "true" ]]; then
  echo "Usage: ./teardown_vms.sh --confirm"
  echo "This will DELETE all SOC simulation GCE VMs. Pass --confirm to proceed."
  exit 1
fi

if [[ -f "$ENV_FILE" ]]; then
  set -a; source "$ENV_FILE"; set +a
fi

GCP_PROJECT="${GCP_PROJECT:?Set GCP_PROJECT in .env}"
GCP_ZONE="${GCP_ZONE:-us-central1-a}"

VMS=("soc-linux-ws-1" "soc-linux-ws-2" "soc-linux-sv-1" "soc-caldera")

echo "=== SOC Endpoint VM Teardown ==="

for VM_NAME in "${VMS[@]}"; do
  echo "Deleting $VM_NAME..."
  gcloud compute instances delete "$VM_NAME" \
    --project="$GCP_PROJECT" \
    --zone="$GCP_ZONE" \
    --quiet || echo "  (not found or already deleted)"
done

echo "=== Teardown complete ==="
