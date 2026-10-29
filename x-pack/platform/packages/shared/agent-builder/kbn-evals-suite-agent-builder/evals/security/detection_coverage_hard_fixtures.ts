/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Discriminating gap dataset for the `detection-coverage` skill (#19982, I7).
 *
 * Separate from `COVERAGE_FIXTURE_RULES` (Scenario 1): every seeded rule here is named
 * with the `az-hard-` prefix, so the two sets cannot collide and Scenario 1 baselines stay put.
 *
 * Verdict derivation (static, from the seed set below — see `deriveVerdictFromSeed`):
 * - `covered_enabled`  — an enabled seeded rule carries the gap's exact tag (`az-hard-<ID>`).
 * - `covered_disabled` — the same exact rule exists but is disabled.
 * - `prebuilt_available` / `no_coverage` — no exact seeded rule. These two are NOT
 *   separable from the seed alone: `prebuilt_available` depends on whether the installable
 *   catalog ships a matching rule. That split is unverified here and is checked by the live run.
 *
 * Hard negatives are TAGS on cases (`traps`), never new verdict labels:
 * - `near_miss`            — an enabled rule covering an adjacent behaviour (seeded as `az-hard-near-<ID>`).
 * - `decoy_name`           — an enabled rule named `az-hard-decoy-<ID>` with a different description and a network-only query.
 * - `disabled_or_partial`  — the only exact match is disabled, or it covers one sub-behaviour only.
 * - `duplicate_create_trap`— an existing exact rule makes "create a new rule" the wrong route (#20039 shape). Tag only; no extra seed.
 */

import type { KbnClient } from '@kbn/test';
import type { ToolingLog } from '@kbn/tooling-log';

export type CoverageVerdict =
  | 'covered_enabled'
  | 'covered_disabled'
  | 'prebuilt_available'
  | 'no_coverage';

export type CoverageHardNegativeTrap =
  | 'near_miss'
  | 'decoy_name'
  | 'disabled_or_partial'
  | 'duplicate_create_trap';

export interface CoverageGapCase {
  id: string;
  attackTechnique: string;
  gap: string;
  expectedVerdict: CoverageVerdict;
  traps: readonly CoverageHardNegativeTrap[];
}

export const HARD_RULE_PREFIX = 'az-hard-';

export const COVERAGE_GAP_CASES: readonly CoverageGapCase[] = [
  { id: 'S1-POWERSHELL', attackTechnique: 'T1059.001', gap: 'PowerShell encoded commands on Windows endpoints are not detected.', expectedVerdict: 'covered_enabled', traps: ['duplicate_create_trap'] },
  { id: 'S1-SMB', attackTechnique: 'T1021.002', gap: 'Lateral movement over SMB admin shares between Windows hosts.', expectedVerdict: 'covered_disabled', traps: ['disabled_or_partial'] },
  { id: 'S1-OFFICE', attackTechnique: 'T1059.003', gap: 'Word or Excel spawning cmd.exe is not detected.', expectedVerdict: 'covered_enabled', traps: ['near_miss'] },
  { id: 'S1-KUBECTL-PROD', attackTechnique: 'T1609', gap: 'Interactive kubectl exec into pods in production namespaces.', expectedVerdict: 'prebuilt_available', traps: ['near_miss', 'disabled_or_partial'] },
  { id: 'G01', attackTechnique: 'T1003.001', gap: 'LSASS memory read by a non-system process.', expectedVerdict: 'covered_enabled', traps: ['duplicate_create_trap'] },
  { id: 'G02', attackTechnique: 'T1218.011', gap: 'rundll32 loading a DLL from a user-writable path.', expectedVerdict: 'covered_enabled', traps: ['decoy_name'] },
  { id: 'G03', attackTechnique: 'T1047', gap: 'WMI process creation from a remote host.', expectedVerdict: 'covered_enabled', traps: ['duplicate_create_trap'] },
  { id: 'G04', attackTechnique: 'T1555.003', gap: 'Browser credential store read by a non-browser process.', expectedVerdict: 'covered_enabled', traps: ['near_miss'] },
  { id: 'G05', attackTechnique: 'T1490', gap: 'Shadow copy deletion with vssadmin on Windows.', expectedVerdict: 'covered_enabled', traps: ['duplicate_create_trap'] },
  { id: 'G06', attackTechnique: 'T1562.001', gap: 'Endpoint protection service stopped from the command line.', expectedVerdict: 'covered_enabled', traps: ['decoy_name'] },
  { id: 'G07', attackTechnique: 'T1053.005', gap: 'Scheduled task created on a remote Windows host.', expectedVerdict: 'covered_enabled', traps: ['duplicate_create_trap'] },
  { id: 'G08', attackTechnique: 'T1136.001', gap: 'Local user account created outside an approved change window.', expectedVerdict: 'covered_enabled', traps: ['near_miss'] },
  { id: 'G09', attackTechnique: 'T1078.004', gap: 'Cloud console login from a new country for a privileged account.', expectedVerdict: 'covered_enabled', traps: ['duplicate_create_trap'] },
  { id: 'G10', attackTechnique: 'T1548.002', gap: 'UAC bypass through fodhelper.exe registry hijack.', expectedVerdict: 'covered_enabled', traps: ['decoy_name'] },
  { id: 'G11', attackTechnique: 'T1566.001', gap: 'Macro-enabled Office attachment launching a script host.', expectedVerdict: 'covered_enabled', traps: ['near_miss'] },
  { id: 'G12', attackTechnique: 'T1546.003', gap: 'WMI event subscription persistence created on a host.', expectedVerdict: 'covered_enabled', traps: ['duplicate_create_trap'] },
  { id: 'G13', attackTechnique: 'T1070.001', gap: 'Windows event log cleared with wevtutil.', expectedVerdict: 'covered_enabled', traps: ['decoy_name'] },
  { id: 'G14', attackTechnique: 'T1112', gap: 'Run key registry value added under HKCU Run.', expectedVerdict: 'covered_enabled', traps: ['near_miss'] },
  { id: 'G15', attackTechnique: 'T1197', gap: 'BITS job created to download a remote payload.', expectedVerdict: 'covered_enabled', traps: ['duplicate_create_trap'] },
  { id: 'G16', attackTechnique: 'T1055.012', gap: 'Process hollowing into a suspended svchost child process.', expectedVerdict: 'covered_disabled', traps: ['disabled_or_partial'] },
  { id: 'G17', attackTechnique: 'T1204.002', gap: 'User-opened executable from an email archive in Downloads.', expectedVerdict: 'covered_disabled', traps: ['disabled_or_partial'] },
  { id: 'G18', attackTechnique: 'T1021.001', gap: 'Remote Desktop logons from unusual source addresses.', expectedVerdict: 'covered_disabled', traps: ['disabled_or_partial', 'near_miss'] },
  { id: 'G19', attackTechnique: 'T1110.003', gap: 'Password spraying against cloud identity accounts.', expectedVerdict: 'covered_disabled', traps: ['disabled_or_partial'] },
  { id: 'G20', attackTechnique: 'T1219', gap: 'Remote access tool installed and run from a user profile.', expectedVerdict: 'covered_disabled', traps: ['decoy_name', 'disabled_or_partial'] },
  { id: 'G21', attackTechnique: 'T1569.002', gap: 'Service created by a non-admin account on a domain controller.', expectedVerdict: 'covered_disabled', traps: ['disabled_or_partial'] },
  { id: 'G22', attackTechnique: 'T1484.001', gap: 'Group policy object modified outside the change window.', expectedVerdict: 'covered_disabled', traps: ['disabled_or_partial'] },
  { id: 'G23', attackTechnique: 'T1620', gap: 'Reflective loading of a payload into memory without a file write.', expectedVerdict: 'covered_disabled', traps: ['near_miss', 'disabled_or_partial'] },
  { id: 'G24', attackTechnique: 'T1574.002', gap: 'DLL side-loading through a signed binary from a temp folder.', expectedVerdict: 'covered_disabled', traps: ['disabled_or_partial'] },
  { id: 'G25', attackTechnique: 'T1056.001', gap: 'Keylogging via a low-level keyboard hook from an unknown process.', expectedVerdict: 'covered_disabled', traps: ['disabled_or_partial'] },
  { id: 'G26', attackTechnique: 'T1572', gap: 'DNS tunnelling with long TXT answers to one domain.', expectedVerdict: 'covered_disabled', traps: ['decoy_name', 'disabled_or_partial'] },
  { id: 'G27', attackTechnique: 'T1202', gap: 'Indirect command execution through forfiles.', expectedVerdict: 'covered_disabled', traps: ['disabled_or_partial'] },
  { id: 'G28', attackTechnique: 'T1005', gap: 'Bulk read of files from a user home share by one process.', expectedVerdict: 'covered_disabled', traps: ['disabled_or_partial'] },
  { id: 'G29', attackTechnique: 'T1562.004', gap: 'Host firewall rule disabled from the command line.', expectedVerdict: 'covered_disabled', traps: ['disabled_or_partial', 'near_miss'] },
  { id: 'G30', attackTechnique: 'T1036.005', gap: 'Executable renamed to match a system binary name in a user folder.', expectedVerdict: 'covered_disabled', traps: ['decoy_name', 'disabled_or_partial'] },
  { id: 'G31', attackTechnique: 'T1190', gap: 'Exploitation of a public web application server with a webshell dropped.', expectedVerdict: 'prebuilt_available', traps: ['near_miss'] },
  { id: 'G32', attackTechnique: 'T1195.002', gap: 'Compromised software update package executed on endpoints.', expectedVerdict: 'prebuilt_available', traps: [] },
  { id: 'G33', attackTechnique: 'T1552.005', gap: 'Cloud instance metadata service queried from an unexpected process.', expectedVerdict: 'prebuilt_available', traps: ['decoy_name'] },
  { id: 'G34', attackTechnique: 'T1578.002', gap: 'Cloud compute instance created in an unused region by a new role.', expectedVerdict: 'prebuilt_available', traps: [] },
  { id: 'G35', attackTechnique: 'T1613', gap: 'Container and cluster API enumeration from a workload service account.', expectedVerdict: 'prebuilt_available', traps: ['near_miss'] },
  { id: 'G36', attackTechnique: 'T1537', gap: 'Data copied to an external cloud storage bucket in another account.', expectedVerdict: 'prebuilt_available', traps: [] },
  { id: 'G37', attackTechnique: 'T1619', gap: 'Cloud storage bucket listing from an unrecognised IP address.', expectedVerdict: 'prebuilt_available', traps: ['decoy_name'] },
  { id: 'G38', attackTechnique: 'T1098.001', gap: 'Access key added to an existing cloud user by a different principal.', expectedVerdict: 'prebuilt_available', traps: [] },
  { id: 'G39', attackTechnique: 'T1586', gap: 'Linux cron job added to run a downloaded script every minute.', expectedVerdict: 'prebuilt_available', traps: ['near_miss'] },
  { id: 'G40', attackTechnique: 'T1611', gap: 'Container escape through a privileged pod mounting the host root.', expectedVerdict: 'prebuilt_available', traps: [] },
  { id: 'G41', attackTechnique: 'T1608.001', gap: 'Script uploaded to a public paste site from an internal host.', expectedVerdict: 'prebuilt_available', traps: ['decoy_name'] },
  { id: 'G42', attackTechnique: 'T1529', gap: 'Linux host shutdown or reboot issued by a service account.', expectedVerdict: 'prebuilt_available', traps: [] },
  { id: 'G43', attackTechnique: 'T1600', gap: 'Network device configuration weakened on a switch by a non-network user.', expectedVerdict: 'prebuilt_available', traps: ['near_miss'] },
  { id: 'G44', attackTechnique: 'T1606.002', gap: 'Forged SAML token used to access a federated application.', expectedVerdict: 'prebuilt_available', traps: [] },
  { id: 'G45', attackTechnique: 'T1621', gap: 'Multi-factor approval prompts sent repeatedly to one user.', expectedVerdict: 'prebuilt_available', traps: ['decoy_name'] },
  { id: 'G46', attackTechnique: 'T1027.013', gap: 'Encrypted and password-protected archive dropped by a macOS app bundle.', expectedVerdict: 'no_coverage', traps: ['near_miss'] },
  { id: 'G47', attackTechnique: 'T1497.001', gap: 'Sandbox checks run from a Linux interpreter on an engineering host.', expectedVerdict: 'no_coverage', traps: [] },
  { id: 'G48', attackTechnique: 'T1600.002', gap: 'Firmware image on an industrial controller reflashed outside maintenance.', expectedVerdict: 'no_coverage', traps: [] },
  { id: 'G49', attackTechnique: 'T1199', gap: 'Trusted partner VPN session used outside its contracted hours.', expectedVerdict: 'no_coverage', traps: ['near_miss', 'disabled_or_partial'] },
  { id: 'G50', attackTechnique: 'T1207', gap: 'Rogue domain controller registered through DCShadow replication.', expectedVerdict: 'no_coverage', traps: ['decoy_name'] },
  { id: 'G51', attackTechnique: 'T1542.003', gap: 'Bootkit written to a boot sector on a Linux host.', expectedVerdict: 'no_coverage', traps: ['near_miss'] },
  { id: 'G52', attackTechnique: 'T1200', gap: 'Hardware implant detected as an unexpected USB network device.', expectedVerdict: 'no_coverage', traps: ['decoy_name'] },
  { id: 'G53', attackTechnique: 'T1080', gap: 'Shared network drive modified by a process on a kiosk terminal.', expectedVerdict: 'no_coverage', traps: [] },
  { id: 'G54', attackTechnique: 'T1659', gap: 'Enterprise profile sideloaded on a mobile device without MDM.', expectedVerdict: 'no_coverage', traps: ['near_miss', 'disabled_or_partial'] },
  { id: 'G55', attackTechnique: 'T1582', gap: 'Smart badge reader configuration changed through the vendor console.', expectedVerdict: 'no_coverage', traps: [] },
  { id: 'G56', attackTechnique: 'T1633.001', gap: 'Virtualization evasion check on a Windows host with a hypervisor flag set.', expectedVerdict: 'no_coverage', traps: ['decoy_name'] },
  { id: 'G57', attackTechnique: 'T1652', gap: 'Device driver list enumerated by a non-driver process on a payment terminal.', expectedVerdict: 'no_coverage', traps: [] },
  { id: 'G58', attackTechnique: 'T1685', gap: 'Printer spooler plugin loaded from a network path on a print server.', expectedVerdict: 'no_coverage', traps: ['near_miss'] },
  { id: 'G59', attackTechnique: 'T1520', gap: 'Cloud audit logging disabled for one region only.', expectedVerdict: 'no_coverage', traps: ['disabled_or_partial', 'decoy_name'] },
  { id: 'G60', attackTechnique: 'T1695', gap: 'Container image pulled from an unapproved registry mirror on a build runner.', expectedVerdict: 'no_coverage', traps: ['near_miss', 'duplicate_create_trap'] },
];

export interface HardSeedRule {
  name: string;
  caseId: string;
  kind: 'exact' | 'near_miss' | 'decoy';
  enabled: boolean;
  description: string;
  query: string;
  technique: string;
}

/**
 * Seed set. One exact rule per covered case (enabled for `covered_enabled`, disabled for
 * `covered_disabled`), plus a near-miss or decoy rule where a case carries that trap.
 * Queries are exact per rule, keyed on the case id so each rule is distinguishable.
 */
export const HARD_COVERAGE_FIXTURE_RULES: readonly HardSeedRule[] = COVERAGE_GAP_CASES.flatMap(
  (c): HardSeedRule[] => {
    const rules: HardSeedRule[] = [];
    if (c.expectedVerdict === 'covered_enabled' || c.expectedVerdict === 'covered_disabled') {
      rules.push({
        name: `${HARD_RULE_PREFIX}${c.id}`,
        caseId: c.id,
        kind: 'exact',
        enabled: c.expectedVerdict === 'covered_enabled',
        description: c.gap,
        query: `az_hard.case:"${c.id}" and threat.technique.id:"${c.attackTechnique}"`,
        technique: c.attackTechnique,
      });
    }
    if (c.traps.includes('near_miss')) {
      rules.push({
        name: `${HARD_RULE_PREFIX}near-${c.id}`,
        caseId: c.id,
        kind: 'near_miss',
        enabled: true,
        description: `Adjacent behaviour only (near miss for: ${c.gap})`,
        query: `az_hard.near:"${c.id}" and event.category:"file"`,
        technique: c.attackTechnique,
      });
    }
    if (c.traps.includes('decoy_name')) {
      rules.push({
        name: `${HARD_RULE_PREFIX}decoy-${c.id}`,
        caseId: c.id,
        kind: 'decoy',
        enabled: true,
        description: `Name echoes the gap but the query covers network traffic only`,
        query: `az_hard.decoy:"${c.id}" and event.category:"network"`,
        technique: 'T1499',
      });
    }
    return rules;
  }
);

/**
 * Static verdict derivation from the seed set alone. Returns `needs_catalog` where the seed
 * cannot decide (prebuilt vs no_coverage), so the check below only asserts what it can.
 */
export const deriveVerdictFromSeed = (
  c: CoverageGapCase
): CoverageVerdict | 'needs_catalog' => {
  const exact = HARD_COVERAGE_FIXTURE_RULES.find(
    (r) => r.caseId === c.id && r.kind === 'exact'
  );
  if (!exact) return 'needs_catalog';
  return exact.enabled ? 'covered_enabled' : 'covered_disabled';
};

const DETECTION_RULES_URL = '/api/detection_engine/rules';
const DETECTION_API_VERSION = '2023-10-31';

const buildHardRuleBody = (rule: HardSeedRule): Record<string, unknown> => ({
  name: rule.name,
  description: rule.description,
  query: rule.query,
  index: ['logs-endpoint.events.*'],
  type: 'query',
  language: 'kuery',
  enabled: rule.enabled,
  severity: 'medium',
  risk_score: 50,
  tags: ['MITRE', `Technique: ${rule.technique}`, 'az-hard-coverage'],
  interval: '5m',
  from: 'now-6m',
  to: 'now',
  author: [],
  false_positives: [],
  references: [],
  actions: [],
  threat: [
    {
      framework: 'MITRE ATT&CK',
      tactic: {
        id: 'TA0002',
        name: 'Execution',
        reference: 'https://attack.mitre.org/tactics/TA0002/',
      },
      technique: [
        {
          id: rule.technique,
          name: rule.technique,
          reference: `https://attack.mitre.org/techniques/${rule.technique}/`,
        },
      ],
    },
  ],
});

/**
 * Seeds HARD_COVERAGE_FIXTURE_RULES only. Only `az-hard-` named rules are deleted, so
 * Scenario 1 fixtures in the same space are never touched.
 */
export async function seedHardCoverageFixtures({
  kbnClient,
  log,
}: {
  kbnClient: KbnClient;
  log: ToolingLog;
}): Promise<{ cleanup: () => Promise<void> }> {
  const headers = { 'elastic-api-version': DETECTION_API_VERSION };
  const deleteHardRules = async () => {
    const { data } = await kbnClient.request({
      path: `${DETECTION_RULES_URL}/_find?per_page=10000`,
      method: 'GET',
      headers,
    });
    const stale = (data?.data ?? []).filter((r) => r.name.startsWith(HARD_RULE_PREFIX));
    for (const rule of stale) {
      await kbnClient.request({
        path: `${DETECTION_RULES_URL}?id=${rule.id}`,
        method: 'DELETE',
        headers,
      });
    }
    if (stale.length) {
      log.info(`[detection-coverage hard] removed ${stale.length} leftover hard fixture rule(s)`);
    }
  };

  await deleteHardRules();
  for (const rule of HARD_COVERAGE_FIXTURE_RULES) {
    await kbnClient.request({
      path: DETECTION_RULES_URL,
      method: 'POST',
      headers,
      body: buildHardRuleBody(rule),
    });
  }
  log.info(`[detection-coverage hard] seeded ${HARD_COVERAGE_FIXTURE_RULES.length} hard fixture rules`);
  return { cleanup: deleteHardRules };
}
