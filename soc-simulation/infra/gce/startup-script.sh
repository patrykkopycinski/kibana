#!/bin/bash
set -euo pipefail
exec > /var/log/soc-setup.log 2>&1

VM_NAME=$(curl -sf 'http://metadata.google.internal/computeMetadata/v1/instance/name' -H 'Metadata-Flavor: Google')
FLEET_URL=$(curl -sf 'http://metadata.google.internal/computeMetadata/v1/instance/attributes/fleet-url' -H 'Metadata-Flavor: Google')
ENROLLMENT_TOKEN=$(curl -sf 'http://metadata.google.internal/computeMetadata/v1/instance/attributes/enrollment-token' -H 'Metadata-Flavor: Google')
CALDERA_URL=$(curl -sf 'http://metadata.google.internal/computeMetadata/v1/instance/attributes/caldera-url' -H 'Metadata-Flavor: Google')
STACK_VERSION=$(curl -sf 'http://metadata.google.internal/computeMetadata/v1/instance/attributes/stack-version' -H 'Metadata-Flavor: Google')
TS_AUTHKEY=$(curl -sf 'http://metadata.google.internal/computeMetadata/v1/instance/attributes/ts-authkey' -H 'Metadata-Flavor: Google' 2>/dev/null || echo '')

echo "=== SOC Endpoint Setup for ${VM_NAME} ==="

# Install Tailscale for connectivity to local Docker services
echo "Installing Tailscale..."
curl -fsSL https://tailscale.com/install.sh -o /tmp/install-tailscale.sh
bash /tmp/install-tailscale.sh
if [ -n "${TS_AUTHKEY}" ]; then
  tailscale up --authkey="${TS_AUTHKEY}" --accept-routes
  echo "Tailscale connected."
else
  echo "No Tailscale auth key provided — skipping Tailscale setup."
fi

# Install Elastic Agent
# Use latest released version (SNAPSHOT tarballs not available at standard URL)
AGENT_VERSION="9.3.3"
echo "Installing Elastic Agent ${AGENT_VERSION}..."
cd /tmp
curl -L -O "https://artifacts.elastic.co/downloads/beats/elastic-agent/elastic-agent-${AGENT_VERSION}-linux-x86_64.tar.gz"
tar xzf "elastic-agent-${AGENT_VERSION}-linux-x86_64.tar.gz"
cd "elastic-agent-${AGENT_VERSION}-linux-x86_64"
./elastic-agent install -f --url="${FLEET_URL}" --enrollment-token="${ENROLLMENT_TOKEN}" --insecure
echo "Elastic Agent installed and enrolled."

# Install Sandcat (Caldera agent)
echo "Installing Sandcat..."
cd /tmp
curl -sf -o sandcat "${CALDERA_URL}/file/download" \
  -H "platform: linux" \
  -H "file: sandcat.go" \
  -H "server: ${CALDERA_URL}" || {
  echo "Warning: Could not download Sandcat from ${CALDERA_URL}."
  echo "Caldera may not be reachable yet. Install manually later."
  exit 0
}
chmod +x sandcat
nohup ./sandcat -server "${CALDERA_URL}" -group all-endpoints -v > /var/log/sandcat.log 2>&1 &
echo "Sandcat agent started (group: all-endpoints)."

echo "=== Setup complete ==="
