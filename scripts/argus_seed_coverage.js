#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Seed the Tier 1 coverage indices:
 *
 *   .soc-detection-corpus   — community / Argus / Elastic authored detections
 *   .soc-threat-profiles    — named MITRE technique bundles (e.g. "Ransomware")
 *   .soc-threat-actors      — curated actor set with technique + software lists
 *
 * Idempotent: every doc uses a deterministic _id, so running twice produces
 * the same index state. Safe to call before `live_argus_demo.sh` so the
 * heatmap and actor drill-downs render populated immediately.
 *
 * Usage:
 *   ES_URL=http://localhost:19200 ES_AUTH=elastic:changeme \
 *     node scripts/argus_seed_coverage.js
 */

const DEFAULT_ES_URL = 'http://localhost:19200';
const DEFAULT_ES_AUTH = 'elastic:changeme';

const ES_URL = process.env.ES_URL || DEFAULT_ES_URL;
const ES_AUTH = process.env.ES_AUTH || DEFAULT_ES_AUTH;

const INDEX_CORPUS = '.soc-detection-corpus';
const INDEX_PROFILES = '.soc-threat-profiles';
const INDEX_ACTORS = '.soc-threat-actors';

const CORPUS_DOCS = [
  // SigmaHQ — broad community coverage, lots of overlap with Argus on
  // execution / persistence. Rules picked to create a realistic delta:
  // community covers some techniques Argus doesn't (T1562.001, T1490,
  // T1555, T1110) which shows up as red cells in the heatmap.
  { id: 'sigma-proc-susp-powershell', rule_id: 'sigma-proc-susp-powershell', source: 'sigma', mitre_technique: ['T1059.001'] },
  { id: 'sigma-proc-cmd-exec', rule_id: 'sigma-proc-cmd-exec', source: 'sigma', mitre_technique: ['T1059.003'] },
  { id: 'sigma-persist-scheduled-task', rule_id: 'sigma-persist-scheduled-task', source: 'sigma', mitre_technique: ['T1053.005'] },
  { id: 'sigma-persist-run-keys', rule_id: 'sigma-persist-run-keys', source: 'sigma', mitre_technique: ['T1547.001'] },
  { id: 'sigma-persist-svc', rule_id: 'sigma-persist-svc', source: 'sigma', mitre_technique: ['T1543.003'] },
  { id: 'sigma-defense-disable-tools', rule_id: 'sigma-defense-disable-tools', source: 'sigma', mitre_technique: ['T1562.001'] },
  { id: 'sigma-cred-lsass', rule_id: 'sigma-cred-lsass', source: 'sigma', mitre_technique: ['T1003.001'] },
  { id: 'sigma-cred-brute-force', rule_id: 'sigma-cred-brute-force', source: 'sigma', mitre_technique: ['T1110'] },
  { id: 'sigma-cred-pwd-stores', rule_id: 'sigma-cred-pwd-stores', source: 'sigma', mitre_technique: ['T1555'] },
  { id: 'sigma-disco-system-info', rule_id: 'sigma-disco-system-info', source: 'sigma', mitre_technique: ['T1082'] },
  { id: 'sigma-disco-account', rule_id: 'sigma-disco-account', source: 'sigma', mitre_technique: ['T1087'] },
  { id: 'sigma-lateral-rdp', rule_id: 'sigma-lateral-rdp', source: 'sigma', mitre_technique: ['T1021.001'] },
  { id: 'sigma-impact-encrypt', rule_id: 'sigma-impact-encrypt', source: 'sigma', mitre_technique: ['T1486'] },
  { id: 'sigma-impact-inhibit-recovery', rule_id: 'sigma-impact-inhibit-recovery', source: 'sigma', mitre_technique: ['T1490'] },
  { id: 'sigma-c2-web-protocols', rule_id: 'sigma-c2-web-protocols', source: 'sigma', mitre_technique: ['T1071.001'] },
  { id: 'sigma-c2-dns', rule_id: 'sigma-c2-dns', source: 'sigma', mitre_technique: ['T1071.004'] },

  // Splunk ESCU — skewed toward Windows privilege escalation.
  { id: 'escu-privesc-uac-bypass', rule_id: 'escu-privesc-uac-bypass', source: 'splunk-escu', mitre_technique: ['T1548.002'] },
  { id: 'escu-defense-file-deletion', rule_id: 'escu-defense-file-deletion', source: 'splunk-escu', mitre_technique: ['T1070.004'] },
  { id: 'escu-privesc-exploit', rule_id: 'escu-privesc-exploit', source: 'splunk-escu', mitre_technique: ['T1068'] },
  { id: 'escu-defense-masquerading', rule_id: 'escu-defense-masquerading', source: 'splunk-escu', mitre_technique: ['T1036'] },

  // Elastic prebuilt — reinforces execution + initial access.
  { id: 'elastic-ia-valid-accounts', rule_id: 'elastic-ia-valid-accounts', source: 'elastic-prebuilt', mitre_technique: ['T1078'] },
  { id: 'elastic-ia-exploit-pub', rule_id: 'elastic-ia-exploit-pub', source: 'elastic-prebuilt', mitre_technique: ['T1190'] },
  { id: 'elastic-ia-phishing', rule_id: 'elastic-ia-phishing', source: 'elastic-prebuilt', mitre_technique: ['T1566'] },
  { id: 'elastic-exec-user', rule_id: 'elastic-exec-user', source: 'elastic-prebuilt', mitre_technique: ['T1204'] },
  { id: 'elastic-defense-obfuscation', rule_id: 'elastic-defense-obfuscation', source: 'elastic-prebuilt', mitre_technique: ['T1027'] },
  { id: 'elastic-collection-local', rule_id: 'elastic-collection-local', source: 'elastic-prebuilt', mitre_technique: ['T1005'] },
  { id: 'elastic-exfil-c2', rule_id: 'elastic-exfil-c2', source: 'elastic-prebuilt', mitre_technique: ['T1041'] },

  // Red Canary — narrow but deep in lateral + collection.
  { id: 'redcanary-lateral-smb', rule_id: 'redcanary-lateral-smb', source: 'red-canary', mitre_technique: ['T1021.002'] },
  { id: 'redcanary-collect-archive', rule_id: 'redcanary-collect-archive', source: 'red-canary', mitre_technique: ['T1560'] },
  { id: 'redcanary-c2-ingress', rule_id: 'redcanary-c2-ingress', source: 'red-canary', mitre_technique: ['T1105'] },
];

const PROFILE_DOCS = [
  {
    id: 'profile-ransomware',
    profile_id: 'profile-ransomware',
    name: 'Ransomware',
    description: 'Techniques consistently observed across modern ransomware intrusions (Conti, BlackCat, LockBit lineage).',
    technique_ids: [
      'T1078', 'T1566', 'T1059.001', 'T1059.003', 'T1053.005',
      'T1547.001', 'T1543.003', 'T1562.001', 'T1003.001', 'T1021.001',
      'T1021.002', 'T1486', 'T1490',
    ],
    actor_ids: ['G0035', 'G0140'],
    origin: 'builtin',
  },
  {
    id: 'profile-ics-opportunistic',
    profile_id: 'profile-ics-opportunistic',
    name: 'Opportunistic IT-to-OT',
    description: 'Commodity IT-side techniques that historically precede incidents touching operational-technology networks.',
    technique_ids: [
      'T1190', 'T1078', 'T1059.001', 'T1547.001', 'T1003.001',
      'T1110', 'T1071.001', 'T1071.004', 'T1105',
    ],
    actor_ids: ['G0035'],
    origin: 'builtin',
  },
  {
    id: 'profile-living-off-the-land',
    profile_id: 'profile-living-off-the-land',
    name: 'Living off the Land',
    description: 'Signed-binary-heavy intrusions that avoid custom malware — PowerShell, WMI, scheduled tasks, native tooling.',
    technique_ids: [
      'T1059.001', 'T1059.003', 'T1053.005', 'T1027', 'T1036',
      'T1082', 'T1087', 'T1021.001', 'T1021.002',
    ],
    actor_ids: ['G0016'],
    origin: 'builtin',
  },
];

// Curated subset, not the whole STIX catalogue — just enough for the
// actor drill-down to feel real. Ids match MITRE ATT&CK group ids so
// operators recognise them.
const ACTOR_DOCS = [
  {
    id: 'G0035',
    actor_id: 'G0035',
    actor_name: 'Dragonfly',
    aliases: ['Energetic Bear', 'Crouching Yeti', 'TG-4192'],
    techniques: ['T1078', 'T1190', 'T1566', 'T1059.001', 'T1547.001', 'T1003.001', 'T1110', 'T1071.001'],
    software: ['Havex', 'Trojan.Karagany'],
    first_seen: '2010-01-01T00:00:00Z',
    last_seen: '2023-11-01T00:00:00Z',
    references: ['https://attack.mitre.org/groups/G0035/'],
  },
  {
    id: 'G0140',
    actor_id: 'G0140',
    actor_name: 'LAPSUS$',
    aliases: ['DEV-0537'],
    techniques: ['T1078', 'T1566', 'T1059.001', 'T1003.001', 'T1555', 'T1486', 'T1490', 'T1021.001'],
    software: [],
    first_seen: '2021-12-01T00:00:00Z',
    last_seen: '2023-03-01T00:00:00Z',
    references: ['https://attack.mitre.org/groups/G0140/'],
  },
  {
    id: 'G0016',
    actor_id: 'G0016',
    actor_name: 'APT29',
    aliases: ['CozyBear', 'Nobelium'],
    techniques: ['T1078', 'T1566', 'T1059.001', 'T1053.005', 'T1547.001', 'T1027', 'T1036', 'T1082', 'T1021.001', 'T1071.001'],
    software: ['CozyDuke', 'MiniDuke', 'SeaDuke', 'WellMess'],
    first_seen: '2008-01-01T00:00:00Z',
    last_seen: '2024-05-01T00:00:00Z',
    references: ['https://attack.mitre.org/groups/G0016/'],
  },
];

const basicAuth = 'Basic ' + Buffer.from(ES_AUTH).toString('base64');

const esRequest = async (method, path, body) => {
  const url = `${ES_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: basicAuth,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status} ${res.statusText}: ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
};

const ensureIndex = async (indexName) => {
  const existsRes = await fetch(`${ES_URL}/${indexName}`, {
    method: 'HEAD',
    headers: { Authorization: basicAuth },
  });
  if (existsRes.status === 200) return;
  // Shape the mappings conservatively — we rely on `.keyword` subfields in
  // the route queries, so explicit mapping beats dynamic mapping's default
  // `text` + `.keyword` pairing.
  await esRequest('PUT', `/${indexName}`, {
    mappings: {
      properties: {
        rule_id: { type: 'keyword' },
        source: { type: 'keyword' },
        mitre_technique: { type: 'keyword' },
        profile_id: { type: 'keyword' },
        name: { type: 'keyword' },
        description: { type: 'text' },
        technique_ids: { type: 'keyword' },
        actor_ids: { type: 'keyword' },
        origin: { type: 'keyword' },
        actor_id: { type: 'keyword' },
        actor_name: { type: 'keyword' },
        aliases: { type: 'keyword' },
        techniques: { type: 'keyword' },
        software: { type: 'keyword' },
        first_seen: { type: 'date' },
        last_seen: { type: 'date' },
        references: { type: 'keyword' },
      },
    },
  });
};

const bulkIndex = async (indexName, docs) => {
  const lines = [];
  for (const doc of docs) {
    const { id, ...rest } = doc;
    lines.push(JSON.stringify({ index: { _index: indexName, _id: id } }));
    lines.push(JSON.stringify(rest));
  }
  const body = lines.join('\n') + '\n';
  const res = await fetch(`${ES_URL}/_bulk?refresh=wait_for`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-ndjson',
      Authorization: basicAuth,
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`bulk index ${indexName} failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  if (json.errors) {
    const failed = json.items.filter((i) => {
      const op = Object.values(i)[0];
      return op && op.error;
    });
    throw new Error(
      `bulk ${indexName} had ${failed.length} failures: ${JSON.stringify(failed.slice(0, 3))}`
    );
  }
};

const main = async () => {
  console.log(`[argus_seed_coverage] ES_URL=${ES_URL}`);
  for (const index of [INDEX_CORPUS, INDEX_PROFILES, INDEX_ACTORS]) {
    await ensureIndex(index);
  }
  await bulkIndex(INDEX_CORPUS, CORPUS_DOCS);
  console.log(`  ${INDEX_CORPUS}: ${CORPUS_DOCS.length} docs upserted`);
  await bulkIndex(INDEX_PROFILES, PROFILE_DOCS);
  console.log(`  ${INDEX_PROFILES}: ${PROFILE_DOCS.length} docs upserted`);
  await bulkIndex(INDEX_ACTORS, ACTOR_DOCS);
  console.log(`  ${INDEX_ACTORS}: ${ACTOR_DOCS.length} docs upserted`);
  console.log('[argus_seed_coverage] done');
};

main().catch((err) => {
  console.error('[argus_seed_coverage] fatal:', err.message);
  process.exit(1);
});
