#!/usr/bin/env bash
# soc-simulation/infra/gce/caldera_vm_setup.sh
# Provision a GCE VM for Caldera + Bridge (cloud mode).
# Usage: ./caldera_vm_setup.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../../.env"

if [[ -f "$ENV_FILE" ]]; then
  set -a; source "$ENV_FILE"; set +a
fi

GCP_PROJECT="${GCP_PROJECT:?Set GCP_PROJECT in .env}"
GCP_ZONE="${GCP_ZONE:-us-central1-a}"
MACHINE_TYPE="${GCP_MACHINE_TYPE:-e2-medium}"
VM_NAME="soc-caldera"

# Cloud ES URL for the bridge
ES_URL="${ES_URL:?Set ES_URL in .env for cloud mode}"
ES_USER="${ES_USER:-elastic}"
ES_PASS="${ES_PASS:?Set ES_PASS in .env}"
CALDERA_API_KEY="${CALDERA_API_KEY:-ADMIN123}"

echo "=== SOC Caldera VM Setup (Cloud Mode) ==="
echo "Project:  $GCP_PROJECT"
echo "Zone:     $GCP_ZONE"
echo "VM:       $VM_NAME"
echo "ES URL:   $ES_URL"
echo ""

gcloud compute instances create "$VM_NAME" \
  --project="$GCP_PROJECT" \
  --zone="$GCP_ZONE" \
  --machine-type="$MACHINE_TYPE" \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB \
  --tags=soc-simulation,caldera \
  --metadata=startup-script="$(cat <<'STARTUP'
#!/bin/bash
set -euo pipefail
exec > /var/log/caldera-setup.log 2>&1

echo "=== Caldera VM Setup ==="

# Install Docker
echo "Installing Docker..."
apt-get update
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "Docker installed."
echo "To start Caldera, copy docker-compose.yml and run:"
echo "  docker compose up -d caldera"
echo "(attack dispatch + polling is now driven by soc_caldera_dispatcher and"
echo " soc_caldera_poller workflows in the Kibana stack — no Python sidecars needed)"
echo "=== Setup complete ==="
STARTUP
)"

echo ""
echo "$VM_NAME created."
echo ""
echo "Next steps:"
echo "  1. SSH in: gcloud compute ssh $VM_NAME --zone=$GCP_ZONE"
echo "  2. Copy soc-simulation/ to the VM"
echo "  3. Create .env.cloud with ES_URL, ES_USER, ES_PASS, CALDERA_API_KEY"
echo "  4. Run: docker compose up -d caldera"
echo "  5. Note the VM's internal IP for endpoint Sandcat configuration"
