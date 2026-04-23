#!/usr/bin/env bash
# Fetches CISA KEV catalog and bulk-indexes normalized rows into .soc-cve-advisories.
set -euo pipefail

ES_URL="${ES_URL:-http://localhost:9200}"
KIBANA_URL="${KIBANA_URL:-http://localhost:15601}"
ES_USER="${ES_USER:-elastic}"
ES_PASS="${ES_PASS:-${ELASTIC_PASSWORD:-changeme}}"

if [[ -z "${ES_URL}" ]] || [[ -z "${KIBANA_URL}" ]]; then
  echo "ERROR: ES_URL and KIBANA_URL must be non-empty (defaults: http://localhost:9200, http://localhost:15601)" >&2
  exit 1
fi

KEV_URL="https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
TMP_JSON="$(mktemp)"
BULK_OUT="$(mktemp)"
trap 'rm -f "${TMP_JSON}" "${BULK_OUT}"' EXIT

echo "Fetching CISA KEV catalog..."
curl -sfL "${KEV_URL}" -o "${TMP_JSON}"

python3 - "${TMP_JSON}" "${BULK_OUT}" <<'PY'
import json, sys, datetime as dt

src_path, out_path = sys.argv[1], sys.argv[2]
with open(src_path) as f:
    data = json.load(f)

vulns = data.get("vulnerabilities") or data.get("CVE_Items") or []
if not isinstance(vulns, list):
    vulns = []

lines = []
now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def parse_date(s):
    if not s:
        return None
    s = str(s).strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y"):
        try:
            d = dt.datetime.strptime(s, fmt).replace(tzinfo=dt.timezone.utc)
            return d.strftime("%Y-%m-%dT%H:%M:%SZ")
        except ValueError:
            continue
    return None

for v in vulns:
    cve = str(v.get("cveID") or v.get("id") or "").strip()
    if not cve:
        continue
    vendor = (v.get("vendorProject") or v.get("vendor") or "").strip()
    product = (v.get("product") or "").strip()
    short_desc = (v.get("shortDescription") or v.get("description") or "").strip()
    title = f"{vendor} {product} vulnerability".strip()
    if not title:
        title = f"{cve} vulnerability"

    kr = v.get("knownRansomwareCampaignUse")
    if isinstance(kr, str):
        sev = "critical" if kr.strip().lower() == "yes" else "high"
    elif kr is True:
        sev = "critical"
    else:
        sev = "high"

    date_added = parse_date(v.get("dateAdded"))
    due_date = parse_date(v.get("dueDate"))

    advisory_id = f"kev-{cve}"
    doc = {
        "@timestamp": date_added or now,
        "advisory_id": advisory_id,
        "title": title,
        "summary": short_desc,
        "severity": sev,
        "source": "cisa_kev",
        "status": "ingested",
        "cve_id": cve,
        "vendor": vendor,
        "product": product,
        "date_added": date_added,
        "due_date": due_date,
        "mitre_techniques": [],
        "kev": {
            "date_added": date_added,
            "due_date": due_date,
            "known_ransomware_use": (str(kr).lower() == "yes") if kr is not None else False,
            "vendor_project": vendor or None,
            "product": product or None,
            "notes": v.get("notes"),
            "required_action": v.get("requiredAction"),
        },
    }
    lines.append(json.dumps({"index": {"_index": ".soc-cve-advisories", "_id": advisory_id}}))
    lines.append(json.dumps(doc))

with open(out_path, "w") as out:
    out.write("\n".join(lines))
    if lines:
        out.write("\n")
PY

if [[ ! -s "${BULK_OUT}" ]]; then
  echo "No KEV advisory rows were produced (empty bulk body)."
  exit 0
fi

DOCS="$(( $(grep -c '^{"index"' "${BULK_OUT}" || true) ))"
echo "Bulk indexing ${DOCS} KEV advisory document(s) into .soc-cve-advisories ..."

curl -sf -u "${ES_USER}:${ES_PASS}" \
  -X POST \
  -H "Content-Type: application/x-ndjson" \
  "${ES_URL}/_bulk?refresh=wait_for" \
  --data-binary "@${BULK_OUT}" > /dev/null

echo "Processed ${DOCS} KEV advisories."
