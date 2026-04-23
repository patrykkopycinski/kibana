/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Argus R14 — CISA Known Exploited Vulnerabilities (KEV) live-feed ingest.
 *
 * CISA publishes the KEV catalog as a single JSON document at
 * https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json
 * with one entry per actively-exploited CVE. This module normalises each entry
 * to a Kibana `.soc-cve-advisories` document so the Exploit-to-Detection
 * reconciler can pick it up as if a human analyst had authored it.
 *
 * Why land this as a first-class advisory type instead of a bolt-on index:
 *   1. Everything downstream of `.soc-cve-advisories` (rule synthesis, variant
 *      generation, trust-gate, shadow executor) already works on that shape.
 *      Pushing KEV into the same lane means zero new code paths for trust
 *      governance.
 *   2. The reconciler keys off `status=ingested`, so a KEV entry lands, moves
 *      to `detected` once a rule is drafted, then follows the same lifecycle.
 *   3. The CISA envelope (`date_added`, `due_date`, `known_ransomware_use`,
 *      `required_action`) is preserved verbatim under `kev.*` so dashboards
 *      can show the regulatory context without querying a second index.
 *
 * Out of scope here: ATT&CK technique mapping. CISA does not supply one, so
 * we leave `mitre_techniques` empty and rely on Argus's enrichment layer to
 * fill it in — same behaviour as a human-authored advisory without a MITRE
 * block. A KEV with no technique falls to `pending_review` in the trust gate,
 * which is the intended safe default.
 */

export interface CisaKevEntry {
  cveID: string;
  vendorProject: string;
  product: string;
  vulnerabilityName: string;
  dateAdded: string; // YYYY-MM-DD
  shortDescription: string;
  requiredAction: string;
  dueDate: string; // YYYY-MM-DD
  knownRansomwareCampaignUse?: 'Known' | 'Unknown' | string;
  notes?: string;
  cwes?: readonly string[];
}

export interface CisaKevFeed {
  title: string;
  catalogVersion: string;
  dateReleased: string;
  count: number;
  vulnerabilities: readonly CisaKevEntry[];
}

/**
 * Shape of the document we write into `.soc-cve-advisories`. Matches the index
 * template for soc-cve-advisories.json (dynamic: false). Everything else
 * (signals, mitre, variant_axes) is filled in by downstream Argus enrichment.
 */
export interface KevAdvisoryDoc {
  '@timestamp': string;
  advisory_id: string;
  cve_id: string;
  title: string;
  summary: string;
  published_at: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'ingested';
  source: 'cisa_kev';
  target_platforms: readonly string[];
  kev: {
    date_added: string;
    due_date: string;
    known_ransomware_use: boolean;
    vendor_project: string;
    product: string;
    notes?: string;
    required_action: string;
  };
}

/**
 * Heuristic severity mapping. CISA KEV does not carry CVSS, but any entry in
 * KEV is by definition actively exploited, so `high` is the floor. Entries
 * with known ransomware use escalate to `critical`. This mirrors the
 * "exploited in the wild" → "high" convention used inside `advisory_fixtures.ts`.
 */
export const inferKevSeverity = (entry: CisaKevEntry): KevAdvisoryDoc['severity'] => {
  if (entry.knownRansomwareCampaignUse === 'Known') {
    return 'critical';
  }
  return 'high';
};

/**
 * Best-effort platform inference from the vendor/product pair. Keeps the
 * downstream rule synthesizer honest — an advisory with `target_platforms: []`
 * is rejected by the validator. We default to `windows` because the majority
 * of KEV entries target Windows endpoints; when we can identify a Linux or
 * network-appliance vendor we stamp the right platform instead. Consumers
 * (e.g. the reconciler) can always override.
 */
export const inferKevPlatforms = (entry: CisaKevEntry): readonly string[] => {
  const hay = `${entry.vendorProject} ${entry.product}`.toLowerCase();
  if (/linux|red hat|ubuntu|debian|suse|centos|oracle linux/.test(hay)) {
    return ['linux'];
  }
  if (/kubernetes|containerd|openshift|gke|eks|aks/.test(hay)) {
    return ['kubernetes'];
  }
  if (/macos|apple|mac os/.test(hay)) {
    return ['macos'];
  }
  return ['windows'];
};

/** Normalise a single KEV entry into the `.soc-cve-advisories` shape. */
export const mapKevEntry = (
  entry: CisaKevEntry,
  nowIso: string = new Date().toISOString()
): KevAdvisoryDoc => {
  const cve = entry.cveID.toUpperCase();
  // advisory_id == the document _id in `.soc-cve-advisories`, so it must be
  // stable across runs. Prefix with `kev-` so it cannot collide with a
  // hand-authored advisory that happens to share a CVE id.
  const advisoryId = `kev-${cve}`;

  return {
    '@timestamp': nowIso,
    advisory_id: advisoryId,
    cve_id: cve,
    title: entry.vulnerabilityName || `${entry.vendorProject} ${entry.product} — ${cve}`,
    summary: entry.shortDescription,
    published_at: `${entry.dateAdded}T00:00:00.000Z`,
    severity: inferKevSeverity(entry),
    status: 'ingested',
    source: 'cisa_kev',
    target_platforms: inferKevPlatforms(entry),
    kev: {
      date_added: `${entry.dateAdded}T00:00:00.000Z`,
      due_date: `${entry.dueDate}T00:00:00.000Z`,
      known_ransomware_use: entry.knownRansomwareCampaignUse === 'Known',
      vendor_project: entry.vendorProject,
      product: entry.product,
      notes: entry.notes,
      required_action: entry.requiredAction,
    },
  };
};

/** Map a whole feed at once. Preserves order; safe to bulk-index in one call. */
export const mapKevFeed = (feed: CisaKevFeed, nowIso?: string): readonly KevAdvisoryDoc[] =>
  feed.vulnerabilities.map((v) => mapKevEntry(v, nowIso));
