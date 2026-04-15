#!/usr/bin/env bash
# soc-simulation/infra/gce/endpoint_vm_setup.sh
# Provision GCE endpoint VMs for SOC simulation.
# Usage: ./endpoint_vm_setup.sh
#
# Reads from .env (or env vars):
#   GCP_PROJECT, GCP_ZONE, STACK_VERSION, FLEET_URL, FLEET_ENROLLMENT_TOKEN,
#   CALDERA_URL, CALDERA_CONTACT_HTTP

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../../.env"

if [[ -f "$ENV_FILE" ]]; then
  set -a; source "$ENV_FILE"; set +a
fi

GCP_PROJECT="${GCP_PROJECT:?Set GCP_PROJECT in .env}"
GCP_ZONE="${GCP_ZONE:-us-central1-a}"
STACK_VERSION="${STACK_VERSION:-9.4.0-SNAPSHOT}"
MACHINE_TYPE="${GCP_MACHINE_TYPE:-e2-small}"

# Fleet enrollment (must be set — get from Kibana Fleet UI or API)
FLEET_URL="${FLEET_URL:?Set FLEET_URL in .env (e.g. https://fleet-server:8220)}"
FLEET_ENROLLMENT_TOKEN="${FLEET_ENROLLMENT_TOKEN:?Set FLEET_ENROLLMENT_TOKEN in .env}"

# Caldera (for Sandcat agent)
CALDERA_URL="${CALDERA_URL:-http://localhost:18888}"

VMS=("soc-linux-ws-1" "soc-linux-ws-2" "soc-linux-sv-1")

echo "=== SOC Endpoint VM Setup ==="
echo "Project: $GCP_PROJECT"
echo "Zone:    $GCP_ZONE"
echo "VMs:     ${VMS[*]}"
echo ""

for VM_NAME in "${VMS[@]}"; do
  echo "--- Creating $VM_NAME ---"

  # Create VM
  gcloud compute instances create "$VM_NAME" \
    --project="$GCP_PROJECT" \
    --zone="$GCP_ZONE" \
    --machine-type="$MACHINE_TYPE" \
    --image-family=ubuntu-2204-lts \
    --image-project=ubuntu-os-cloud \
    --boot-disk-size=20GB \
    --tags=soc-simulation \
    --metadata=startup-script="$(cat <<STARTUP
#!/bin/bash
set -euo pipefail

# Log all output
exec > /var/log/soc-setup.log 2>&1

echo "=== SOC Endpoint Setup for $VM_NAME ==="

# Install Elastic Agent
echo "Installing Elastic Agent ${STACK_VERSION}..."
cd /tmp
curl -L -O "https://artifacts.elastic.co/downloads/beats/elastic-agent/elastic-agent-${STACK_VERSION}-linux-x86_64.tar.gz"
tar xzf "elastic-agent-${STACK_VERSION}-linux-x86_64.tar.gz"
cd "elastic-agent-${STACK_VERSION}-linux-x86_64"

./elastic-agent install -f \
  --url="${FLEET_URL}" \
  --enrollment-token="${FLEET_ENROLLMENT_TOKEN}" \
  --insecure

echo "Elastic Agent installed and enrolled."

# Install Sandcat (Caldera agent)
echo "Installing Sandcat agent..."
cd /tmp
SANDCAT_URL="${CALDERA_URL}/file/download"
curl -sf -o sandcat "\${SANDCAT_URL}" \
  -H "platform: linux" \
  -H "file: sandcat.go" \
  -H "server: ${CALDERA_URL}" || {
  echo "Warning: Could not download Sandcat from ${CALDERA_URL}. Caldera may not be reachable yet."
  echo "You can manually install Sandcat later."
  exit 0
}

chmod +x sandcat
nohup ./sandcat -server "${CALDERA_URL}" -group all-endpoints -v > /var/log/sandcat.log 2>&1 &

echo "Sandcat agent started (group: all-endpoints)."
echo "=== Setup complete ==="
STARTUP
)"

  echo "  $VM_NAME created. Setup running via startup script."
  echo "  Check: gcloud compute ssh $VM_NAME --zone=$GCP_ZONE -- 'cat /var/log/soc-setup.log'"
  echo ""
done

echo "=== All VMs created ==="
echo ""
echo "Next steps:"
echo "  1. Check Fleet UI for enrolled agents: \$KIBANA_URL/app/fleet/agents"
echo "  2. Check Caldera for Sandcat agents: \$CALDERA_URL (or curl \$CALDERA_URL/api/v2/agents)"
echo "  3. Verify telemetry is flowing: check logs-endpoint.events.* indices in ES"
