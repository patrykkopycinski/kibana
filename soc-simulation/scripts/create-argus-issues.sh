#!/usr/bin/env bash
# create-argus-issues.sh — create one ARGUS epic + five Phase 2 sub-issues on GitHub.
#
# Idempotent-ish: skips creating an issue whose exact title already exists (open or closed)
# in the target repo. Re-running after closing an issue will *not* reopen it.
#
# Usage:
#   ./create-argus-issues.sh --repo elastic/kibana --dry-run
#   ./create-argus-issues.sh --repo elastic/kibana

set -euo pipefail

REPO=""
DRY_RUN="false"
EPIC_LABELS=("argus" "epic")
SUB_LABELS=("argus" "phase-2")

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO="$2"; shift 2 ;;
    --dry-run) DRY_RUN="true"; shift ;;
    -h|--help)
      grep '^#' "$0" | head -n 20
      exit 0
      ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$REPO" ]]; then
  echo "--repo is required (e.g. --repo elastic/kibana)" >&2
  exit 2
fi

command -v gh >/dev/null || { echo "gh CLI not found on PATH" >&2; exit 2; }

# Ensure a label exists in the target repo; create if missing. Case-insensitive
# match against existing labels so we re-use e.g. "Epic" vs "epic" without
# creating duplicates. Prints the actual label name to use.
ensure_label() {
  local wanted="$1"
  local match
  match="$(gh label list --repo "$REPO" --limit 500 --json name --jq '.[].name' 2>/dev/null \
    | awk -v w="$wanted" 'BEGIN{IGNORECASE=1} tolower($0)==tolower(w){print; exit}')"
  if [[ -n "$match" ]]; then
    echo "$match"
    return 0
  fi
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "$wanted"
    return 0
  fi
  # Create it. Tolerate failure (insufficient perms) and fall through.
  if gh label create "$wanted" --repo "$REPO" --color "ededed" \
      --description "ARGUS-related tracking label" >/dev/null 2>&1; then
    echo "$wanted"
  else
    echo "" # signal: skip this label
  fi
}

# Resolve label list into a comma-joined string, skipping any that failed to
# create.
resolve_labels() {
  local -a out=()
  local l resolved
  for l in "$@"; do
    resolved="$(ensure_label "$l")"
    [[ -n "$resolved" ]] && out+=("$resolved")
  done
  (IFS=,; echo "${out[*]}")
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_ROOT="$(cd "$SCRIPT_DIR/../docs/argus" && pwd)"

title_exists() {
  local title="$1"
  # Pull candidate titles (search is fuzzy) and match exactly in-shell.
  # Empty result -> 0; any exact match -> 1.
  local candidates
  candidates="$(gh issue list --repo "$REPO" --state all \
    --search "\"$title\" in:title" --limit 50 \
    --json title --jq '.[].title' 2>/dev/null || true)"
  if [[ -z "$candidates" ]]; then
    echo 0
    return
  fi
  if printf '%s\n' "$candidates" | grep -Fxq -- "$title"; then
    echo 1
  else
    echo 0
  fi
}

create_issue() {
  local title="$1" body_file="$2" labels="$3"

  local existing
  existing="$(title_exists "$title")"

  if [[ "$existing" == "1" ]]; then
    echo "skip (exists): $title"
    return 0
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "dry-run: would create '$title' with body $body_file (labels: ${labels:-<none>})"
    return 0
  fi

  echo "create: $title"
  if [[ -n "$labels" ]]; then
    gh issue create --repo "$REPO" --title "$title" --body-file "$body_file" --label "$labels"
  else
    gh issue create --repo "$REPO" --title "$title" --body-file "$body_file"
  fi
}

# --- Epic body is assembled inline; sub-issue bodies are the canonical markdowns.
EPIC_BODY_FILE="$(mktemp -t argus-epic.XXXXXX.md)"
trap 'rm -f "$EPIC_BODY_FILE"' EXIT

cat > "$EPIC_BODY_FILE" <<'MD'
# ARGUS — Mythos-Resilient Defender (Phase 2 Epic)

ARGUS is a Mythos-resilient defender — a self-governing SOC built on the
Elastic Stack, designed to stay sound under frontier-capability adversaries.
See the full design tree
in-repo under `soc-simulation/docs/argus/`:

- Threat model: `soc-simulation/docs/argus/threat-model.html`
- Architecture: `soc-simulation/docs/argus/architecture.html`
- Capability map: `soc-simulation/docs/argus/capability-map.md`
- Demo storyboard: `soc-simulation/docs/argus/demo-storyboard.md`
- Kickoff doc: `soc-simulation/docs/argus/KICKOFF.md`

## Phase 2 milestones tracked by this epic

- [ ] M2.1 — Detection Eval Vertical
- [ ] M2.2 — Exploit-to-Detection Synthesis
- [ ] M2.3 — Mythos-era Exploit Probability
- [ ] M2.4 — Frontier-Adversary Simulation
- [ ] M2.5 — Reasoning-Trace Governance

Each milestone has its own sub-issue; sub-issue bodies are the canonical
specification.

## Invariants

1. **Caldera generates test telemetry only.** All production-ready
   capabilities are built on the Elastic Stack.
2. **Mythos-class (L6) is always operator-armed.** Auto-escalation stops at L5;
   L6 requires an explicit arm via `soc_argus_arm_mythos_preset` and an
   `.soc-audit-trail` row per arm.

## Definition of Done

See `soc-simulation/docs/argus/KICKOFF.md` §5 for the full DoR/DoD checklist.
MD

EPIC_LABEL_STR="$(resolve_labels "${EPIC_LABELS[@]}")"
SUB_LABEL_STR="$(resolve_labels "${SUB_LABELS[@]}")"

create_issue "ARGUS — Mythos-Resilient Defender (Phase 2 Epic)" "$EPIC_BODY_FILE" "$EPIC_LABEL_STR"

# Sub-issues, order matches the dependency graph in KICKOFF.md §2.
declare -a SUB_ISSUES=(
  "ARGUS M2.1 — Detection Eval Vertical|$DOCS_ROOT/issues/m2-1-detection-eval-vertical.md"
  "ARGUS M2.2 — Exploit-to-Detection Synthesis|$DOCS_ROOT/issues/m2-2-exploit-to-detection.md"
  "ARGUS M2.3 — Mythos-era Exploit Probability|$DOCS_ROOT/issues/m2-3-exploit-probability.md"
  "ARGUS M2.4 — Frontier-Adversary Simulation|$DOCS_ROOT/issues/m2-4-frontier-simulation.md"
  "ARGUS M2.5 — Reasoning-Trace Governance|$DOCS_ROOT/issues/m2-5-reasoning-trace-governance.md"
)

for entry in "${SUB_ISSUES[@]}"; do
  title="${entry%%|*}"
  body_file="${entry##*|}"
  if [[ ! -f "$body_file" ]]; then
    echo "ERROR: missing body file $body_file" >&2
    exit 1
  fi
  create_issue "$title" "$body_file" "$SUB_LABEL_STR"
done

echo
echo "done. Re-run without --dry-run to create missing issues on $REPO."
