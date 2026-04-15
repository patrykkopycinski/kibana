#!/usr/bin/env bash
# soc-simulation/infra/caldera/entrypoint.sh
set -euo pipefail

CALDERA_DIR="/opt/caldera"
CONF_DIR="${CALDERA_DIR}/conf"

DEFAULT_CFG="${CONF_DIR}/default.yml"
LOCAL_CFG="${CONF_DIR}/local.yml"
MERGED_CFG="${CONF_DIR}/merged.yml"

if [[ -f "${LOCAL_CFG}" ]]; then
  export DEFAULT_CFG LOCAL_CFG MERGED_CFG
  python - <<'PY'
import os
import yaml

default_path = os.environ["DEFAULT_CFG"]
local_path = os.environ["LOCAL_CFG"]
merged_path = os.environ["MERGED_CFG"]

with open(default_path, "r", encoding="utf-8") as f:
    base = yaml.safe_load(f) or {}

with open(local_path, "r", encoding="utf-8") as f:
    local = yaml.safe_load(f) or {}

for k, v in local.items():
    if k == "plugins":
        continue
    base[k] = v

plugins_dir = "/opt/caldera/plugins"
available = []
try:
    for name in sorted(os.listdir(plugins_dir)):
        if name.startswith("."):
            continue
        path = os.path.join(plugins_dir, name)
        if not os.path.isdir(path):
            continue
        if os.path.isfile(os.path.join(path, "hook.py")):
            available.append(name)
except FileNotFoundError:
    pass

default_order = list(base.get("plugins") or [])
ordered = [p for p in default_order if p in available] + [
    p for p in available if p not in default_order
]

local_plugins = list(local.get("plugins") or [])
for p in local_plugins:
    if p not in ordered:
        ordered.append(p)

base["plugins"] = ordered

with open(merged_path, "w", encoding="utf-8") as f:
    yaml.safe_dump(base, f, sort_keys=False)

print(f"Wrote merged config: {merged_path}")
PY
else
  MERGED_CFG="${DEFAULT_CFG}"
fi

exec python server.py --insecure --build
