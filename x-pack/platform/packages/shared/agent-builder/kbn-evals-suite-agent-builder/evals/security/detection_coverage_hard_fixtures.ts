/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * contributor license agreements. Licensed under Elastic B.V. (or licensed
 * under Elastic License 2.0: the current license text can be found in the
 * license file at the top-level directory or at
 * https://github.com/elastic/kibana/blob/main/licenses/ELASTIC-LICENSE-2.0.txt).
 */

/**
 * Discriminating gap dataset for the `detection-coverage` skill (#19982, I7).
 *
 * Separate from `COVERAGE_FIXTURE_RULES` (Scenario 1): every seeded rule here is named
 * with the `az-hard-` prefix, so the two sets cannot collide and Scenario 1 baselines stay put.
 *
 * Seed integrity rules (enforced in the .test.ts):
 * - Rule names carry no case id and no kind marker (`near`, `decoy`): exact, near-miss and
 *   decoy rules are distinguishable only by reading name + description + query.
 * - Exact rules describe and detect the gap behaviour in security-engineer prose and
 *   realistic ECS/KQL — never the gap sentence verbatim, never `threat.technique` markers.
 * - Near-miss rules describe an adjacent behaviour in the same technique family that a
 *   careful analyst judges does NOT cover the gap.
 * - Decoy rules echo a distinctive gap keyword in the name but describe and detect an
 *   unrelated network-only behaviour under a different technique.
 *
 * Verdict derivation (static, from the seed set below — see `deriveVerdictFromSeed`):
 * - `covered_enabled`  — an enabled seeded rule carries the gap's exact tag (`az-hard-<ID>`).
 * - `covered_disabled` — the same exact rule exists but is disabled.
 * - `prebuilt_available` / `no_coverage` — no exact seeded rule. These two are NOT
 *   separable from the seed alone: `prebuilt_available` depends on whether the installable
 *   catalog ships a matching rule. That split is unverified here and is checked by the live run.
 *
 * Hard negatives are TAGS on cases (`traps`), never new verdict labels:
 * - `near_miss`            — an enabled rule covering an adjacent behaviour.
 * - `decoy_name`           — an enabled rule whose name echoes the gap but whose detection is unrelated.
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

/** Tactic names exported for the fixture test's comparison against the repo MITRE data. */
export const MITRE_TACTIC_NAMES: Readonly<Record<string, string>> = {
  TA0043: 'Reconnaissance',
  TA0042: 'Resource Development',
  TA0001: 'Initial Access',
  TA0002: 'Execution',
  TA0003: 'Persistence',
  TA0004: 'Privilege Escalation',
  TA0005: 'Stealth',
  TA0112: 'Defense Impairment',
  TA0006: 'Credential Access',
  TA0007: 'Discovery',
  TA0008: 'Lateral Movement',
  TA0009: 'Collection',
  TA0011: 'Command and Control',
  TA0010: 'Exfiltration',
  TA0040: 'Impact',
  TA0030: 'Defense Evasion',
  TA0034: 'Impact',
  TA0037: 'Command and Control',
  TA0107: 'Inhibit Response Function',
};

export const COVERAGE_GAP_CASES: readonly CoverageGapCase[] = [
  {
    id: 'S1-POWERSHELL',
    attackTechnique: 'T1059.001',
    gap: 'PowerShell encoded commands on Windows endpoints are not detected.',
    expectedVerdict: 'covered_enabled',
    traps: ['duplicate_create_trap'],
  },
  {
    id: 'S1-SMB',
    attackTechnique: 'T1021.002',
    gap: 'Lateral movement over SMB admin shares between Windows hosts.',
    expectedVerdict: 'covered_disabled',
    traps: ['disabled_or_partial'],
  },
  {
    id: 'S1-OFFICE',
    attackTechnique: 'T1059.003',
    gap: 'Word or Excel spawning cmd.exe is not detected.',
    expectedVerdict: 'covered_enabled',
    traps: ['near_miss'],
  },
  {
    id: 'S1-KUBECTL-PROD',
    attackTechnique: 'T1609',
    gap: 'Interactive kubectl exec into pods in production namespaces.',
    expectedVerdict: 'prebuilt_available',
    traps: ['near_miss', 'disabled_or_partial'],
  },
  {
    id: 'G01',
    attackTechnique: 'T1003.001',
    gap: 'LSASS memory read by a non-system process.',
    expectedVerdict: 'covered_enabled',
    traps: ['duplicate_create_trap'],
  },
  {
    id: 'G02',
    attackTechnique: 'T1218.011',
    gap: 'rundll32 loading a DLL from a user-writable path.',
    expectedVerdict: 'covered_enabled',
    traps: ['decoy_name'],
  },
  {
    id: 'G03',
    attackTechnique: 'T1047',
    gap: 'WMI process creation from a remote host.',
    expectedVerdict: 'covered_enabled',
    traps: ['duplicate_create_trap'],
  },
  {
    id: 'G04',
    attackTechnique: 'T1555.003',
    gap: 'Browser credential store read by a non-browser process.',
    expectedVerdict: 'covered_enabled',
    traps: ['near_miss'],
  },
  {
    id: 'G05',
    attackTechnique: 'T1490',
    gap: 'Shadow copy deletion with vssadmin on Windows.',
    expectedVerdict: 'covered_enabled',
    traps: ['duplicate_create_trap'],
  },
  {
    id: 'G06',
    attackTechnique: 'T1562.001',
    gap: 'Endpoint protection service stopped from the command line.',
    expectedVerdict: 'covered_enabled',
    traps: ['decoy_name'],
  },
  {
    id: 'G07',
    attackTechnique: 'T1053.005',
    gap: 'Scheduled task created on a remote Windows host.',
    expectedVerdict: 'covered_enabled',
    traps: ['duplicate_create_trap'],
  },
  {
    id: 'G08',
    attackTechnique: 'T1136.001',
    gap: 'Local user account created outside an approved change window.',
    expectedVerdict: 'covered_enabled',
    traps: ['near_miss'],
  },
  {
    id: 'G09',
    attackTechnique: 'T1078.004',
    gap: 'Cloud console login from a new country for a privileged account.',
    expectedVerdict: 'covered_enabled',
    traps: ['duplicate_create_trap'],
  },
  {
    id: 'G10',
    attackTechnique: 'T1548.002',
    gap: 'UAC bypass through fodhelper.exe registry hijack.',
    expectedVerdict: 'covered_enabled',
    traps: ['decoy_name'],
  },
  {
    id: 'G11',
    attackTechnique: 'T1566.001',
    gap: 'Macro-enabled Office attachment launching a script host.',
    expectedVerdict: 'covered_enabled',
    traps: ['near_miss'],
  },
  {
    id: 'G12',
    attackTechnique: 'T1546.003',
    gap: 'WMI event subscription persistence created on a host.',
    expectedVerdict: 'covered_enabled',
    traps: ['duplicate_create_trap'],
  },
  {
    id: 'G13',
    attackTechnique: 'T1070.001',
    gap: 'Windows event log cleared with wevtutil.',
    expectedVerdict: 'covered_enabled',
    traps: ['decoy_name'],
  },
  {
    id: 'G14',
    attackTechnique: 'T1112',
    gap: 'Run key registry value added under HKCU Run.',
    expectedVerdict: 'covered_enabled',
    traps: ['near_miss'],
  },
  {
    id: 'G15',
    attackTechnique: 'T1197',
    gap: 'BITS job created to download a remote payload.',
    expectedVerdict: 'covered_enabled',
    traps: ['duplicate_create_trap'],
  },
  {
    id: 'G16',
    attackTechnique: 'T1055.012',
    gap: 'Process hollowing into a suspended svchost child process.',
    expectedVerdict: 'covered_disabled',
    traps: ['disabled_or_partial'],
  },
  {
    id: 'G17',
    attackTechnique: 'T1204.002',
    gap: 'User-opened executable from an email archive in Downloads.',
    expectedVerdict: 'covered_disabled',
    traps: ['disabled_or_partial'],
  },
  {
    id: 'G18',
    attackTechnique: 'T1021.001',
    gap: 'Remote Desktop logons from unusual source addresses.',
    expectedVerdict: 'covered_disabled',
    traps: ['disabled_or_partial', 'near_miss'],
  },
  {
    id: 'G19',
    attackTechnique: 'T1110.003',
    gap: 'Password spraying against cloud identity accounts.',
    expectedVerdict: 'covered_disabled',
    traps: ['disabled_or_partial'],
  },
  {
    id: 'G20',
    attackTechnique: 'T1219',
    gap: 'Remote access tool installed and run from a user profile.',
    expectedVerdict: 'covered_disabled',
    traps: ['decoy_name', 'disabled_or_partial'],
  },
  {
    id: 'G21',
    attackTechnique: 'T1569.002',
    gap: 'Service created by a non-admin account on a domain controller.',
    expectedVerdict: 'covered_disabled',
    traps: ['disabled_or_partial'],
  },
  {
    id: 'G22',
    attackTechnique: 'T1484.001',
    gap: 'Group policy object modified outside the change window.',
    expectedVerdict: 'covered_disabled',
    traps: ['disabled_or_partial'],
  },
  {
    id: 'G23',
    attackTechnique: 'T1620',
    gap: 'Reflective loading of a payload into memory without a file write.',
    expectedVerdict: 'covered_disabled',
    traps: ['near_miss', 'disabled_or_partial'],
  },
  {
    id: 'G24',
    attackTechnique: 'T1574.002',
    gap: 'DLL side-loading through a signed binary from a temp folder.',
    expectedVerdict: 'covered_disabled',
    traps: ['disabled_or_partial'],
  },
  {
    id: 'G25',
    attackTechnique: 'T1056.001',
    gap: 'Keylogging via a low-level keyboard hook from an unknown process.',
    expectedVerdict: 'covered_disabled',
    traps: ['disabled_or_partial'],
  },
  {
    id: 'G26',
    attackTechnique: 'T1572',
    gap: 'DNS tunnelling with long TXT answers to one domain.',
    expectedVerdict: 'covered_disabled',
    traps: ['decoy_name', 'disabled_or_partial'],
  },
  {
    id: 'G27',
    attackTechnique: 'T1202',
    gap: 'Indirect command execution through forfiles.',
    expectedVerdict: 'covered_disabled',
    traps: ['disabled_or_partial'],
  },
  {
    id: 'G28',
    attackTechnique: 'T1005',
    gap: 'Bulk read of files from a user home share by one process.',
    expectedVerdict: 'covered_disabled',
    traps: ['disabled_or_partial'],
  },
  {
    id: 'G29',
    attackTechnique: 'T1562.004',
    gap: 'Host firewall rule disabled from the command line.',
    expectedVerdict: 'covered_disabled',
    traps: ['disabled_or_partial', 'near_miss'],
  },
  {
    id: 'G30',
    attackTechnique: 'T1036.005',
    gap: 'Executable renamed to match a system binary name in a user folder.',
    expectedVerdict: 'covered_disabled',
    traps: ['decoy_name', 'disabled_or_partial'],
  },
  {
    id: 'G31',
    attackTechnique: 'T1190',
    gap: 'Exploitation of a public web application server with a webshell dropped.',
    expectedVerdict: 'prebuilt_available',
    traps: ['near_miss'],
  },
  {
    id: 'G32',
    attackTechnique: 'T1195.002',
    gap: 'Compromised software update package executed on endpoints.',
    expectedVerdict: 'prebuilt_available',
    traps: [],
  },
  {
    id: 'G33',
    attackTechnique: 'T1552.005',
    gap: 'Cloud instance metadata service queried from an unexpected process.',
    expectedVerdict: 'prebuilt_available',
    traps: ['decoy_name'],
  },
  {
    id: 'G34',
    attackTechnique: 'T1578.002',
    gap: 'Cloud compute instance created in an unused region by a new role.',
    expectedVerdict: 'prebuilt_available',
    traps: [],
  },
  {
    id: 'G35',
    attackTechnique: 'T1613',
    gap: 'Container and cluster API enumeration from a workload service account.',
    expectedVerdict: 'prebuilt_available',
    traps: ['near_miss'],
  },
  {
    id: 'G36',
    attackTechnique: 'T1537',
    gap: 'Data copied to an external cloud storage bucket in another account.',
    expectedVerdict: 'prebuilt_available',
    traps: [],
  },
  {
    id: 'G37',
    attackTechnique: 'T1619',
    gap: 'Cloud storage bucket listing from an unrecognised IP address.',
    expectedVerdict: 'prebuilt_available',
    traps: ['decoy_name'],
  },
  {
    id: 'G38',
    attackTechnique: 'T1098.001',
    gap: 'Access key added to an existing cloud user by a different principal.',
    expectedVerdict: 'prebuilt_available',
    traps: [],
  },
  {
    id: 'G39',
    attackTechnique: 'T1586',
    gap: 'Linux cron job added to run a downloaded script every minute.',
    expectedVerdict: 'prebuilt_available',
    traps: ['near_miss'],
  },
  {
    id: 'G40',
    attackTechnique: 'T1611',
    gap: 'Container escape through a privileged pod mounting the host root.',
    expectedVerdict: 'prebuilt_available',
    traps: [],
  },
  {
    id: 'G41',
    attackTechnique: 'T1608.001',
    gap: 'Script uploaded to a public paste site from an internal host.',
    expectedVerdict: 'prebuilt_available',
    traps: ['decoy_name'],
  },
  {
    id: 'G42',
    attackTechnique: 'T1529',
    gap: 'Linux host shutdown or reboot issued by a service account.',
    expectedVerdict: 'prebuilt_available',
    traps: [],
  },
  {
    id: 'G43',
    attackTechnique: 'T1600',
    gap: 'Network device configuration weakened on a switch by a non-network user.',
    expectedVerdict: 'prebuilt_available',
    traps: ['near_miss'],
  },
  {
    id: 'G44',
    attackTechnique: 'T1606.002',
    gap: 'Forged SAML token used to access a federated application.',
    expectedVerdict: 'prebuilt_available',
    traps: [],
  },
  {
    id: 'G45',
    attackTechnique: 'T1621',
    gap: 'Multi-factor approval prompts sent repeatedly to one user.',
    expectedVerdict: 'prebuilt_available',
    traps: ['decoy_name'],
  },
  {
    id: 'G46',
    attackTechnique: 'T1027.013',
    gap: 'Encrypted and password-protected archive dropped by a macOS app bundle.',
    expectedVerdict: 'no_coverage',
    traps: ['near_miss'],
  },
  {
    id: 'G47',
    attackTechnique: 'T1497.001',
    gap: 'Sandbox checks run from a Linux interpreter on an engineering host.',
    expectedVerdict: 'no_coverage',
    traps: [],
  },
  {
    id: 'G48',
    attackTechnique: 'T1600.002',
    gap: 'Firmware image on an industrial controller reflashed outside maintenance.',
    expectedVerdict: 'no_coverage',
    traps: [],
  },
  {
    id: 'G49',
    attackTechnique: 'T1199',
    gap: 'Trusted partner VPN session used outside its contracted hours.',
    expectedVerdict: 'no_coverage',
    traps: ['near_miss', 'disabled_or_partial'],
  },
  {
    id: 'G50',
    attackTechnique: 'T1207',
    gap: 'Rogue domain controller registered through DCShadow replication.',
    expectedVerdict: 'no_coverage',
    traps: ['decoy_name'],
  },
  {
    id: 'G51',
    attackTechnique: 'T1542.003',
    gap: 'Bootkit written to a boot sector on a Linux host.',
    expectedVerdict: 'no_coverage',
    traps: ['near_miss'],
  },
  {
    id: 'G52',
    attackTechnique: 'T1200',
    gap: 'Hardware implant detected as an unexpected USB network device.',
    expectedVerdict: 'no_coverage',
    traps: ['decoy_name'],
  },
  {
    id: 'G53',
    attackTechnique: 'T1080',
    gap: 'Shared network drive modified by a process on a kiosk terminal.',
    expectedVerdict: 'no_coverage',
    traps: [],
  },
  {
    id: 'G54',
    attackTechnique: 'T1659',
    gap: 'Enterprise profile sideloaded on a mobile device without MDM.',
    expectedVerdict: 'no_coverage',
    traps: ['near_miss', 'disabled_or_partial'],
  },
  {
    id: 'G55',
    attackTechnique: 'T1582',
    gap: 'Smart badge reader configuration changed through the vendor console.',
    expectedVerdict: 'no_coverage',
    traps: [],
  },
  {
    id: 'G56',
    attackTechnique: 'T1633.001',
    gap: 'Virtualization evasion check on a Windows host with a hypervisor flag set.',
    expectedVerdict: 'no_coverage',
    traps: ['decoy_name'],
  },
  {
    id: 'G57',
    attackTechnique: 'T1652',
    gap: 'Device driver list enumerated by a non-driver process on a payment terminal.',
    expectedVerdict: 'no_coverage',
    traps: [],
  },
  {
    id: 'G58',
    attackTechnique: 'T1685',
    gap: 'Printer spooler plugin loaded from a network path on a print server.',
    expectedVerdict: 'no_coverage',
    traps: ['near_miss'],
  },
  {
    id: 'G59',
    attackTechnique: 'T1520',
    gap: 'Cloud audit logging disabled for one region only.',
    expectedVerdict: 'no_coverage',
    traps: ['disabled_or_partial', 'decoy_name'],
  },
  {
    id: 'G60',
    attackTechnique: 'T1695',
    gap: 'Container image pulled from an unapproved registry mirror on a build runner.',
    expectedVerdict: 'no_coverage',
    traps: ['near_miss', 'duplicate_create_trap'],
  },
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
 * MITRE ATT&CK v19.2 intelligence for the technique ids used above (techniques, their
 * parents, and the decoy technique), kept as a local table because the suites group cannot
 * import the solutions-side `mitre_tactics_techniques` module. Entries were taken from the
 * repo's MITRE data (`security_solution/common/detection_engine/mitre/mitre_tactics_techniques.ts`
 * and the `security-mitre-attack-server` v19.2 artifact). Hand-added entries not present in
 * that file:
 * - `T1562`, `T1562.001`, `T1562.004`, `T1574.002`, `T1070.001` — revoked or absent from the
 *   generated file in v19.2; values match the v19.2 artifact's revoked entries.
 * - `T1520` (revoked), `T1582`, `T1633`, `T1633.001` (mobile) and `T1695` (ICS) — outside the enterprise matrix.
 */
interface TechniqueIntel {
  name: string;
  /** Tactic ids the technique belongs to, in artifact order; seeded rules use the first. */
  tactics: readonly string[];
}

export const MITRE_TECHNIQUE_INTEL: Readonly<Record<string, TechniqueIntel>> = {
  T1003: { name: 'OS Credential Dumping', tactics: ['TA0006'] },
  'T1003.001': { name: 'LSASS Memory', tactics: ['TA0006'] },
  T1005: { name: 'Data from Local System', tactics: ['TA0009'] },
  T1021: { name: 'Remote Services', tactics: ['TA0008'] },
  'T1021.001': { name: 'Remote Desktop Protocol', tactics: ['TA0008'] },
  'T1021.002': { name: 'SMB/Windows Admin Shares', tactics: ['TA0008'] },
  T1027: { name: 'Obfuscated Files or Information', tactics: ['TA0005'] },
  'T1027.013': { name: 'Encrypted/Encoded File', tactics: ['TA0005'] },
  T1036: { name: 'Masquerading', tactics: ['TA0005'] },
  'T1036.005': { name: 'Match Legitimate Resource Name or Location', tactics: ['TA0005'] },
  T1047: { name: 'Windows Management Instrumentation', tactics: ['TA0002'] },
  T1053: { name: 'Scheduled Task/Job', tactics: ['TA0002', 'TA0003', 'TA0004'] },
  'T1053.005': { name: 'Scheduled Task', tactics: ['TA0002', 'TA0003', 'TA0004'] },
  T1055: { name: 'Process Injection', tactics: ['TA0004', 'TA0005'] },
  'T1055.012': { name: 'Process Hollowing', tactics: ['TA0004', 'TA0005'] },
  T1056: { name: 'Input Capture', tactics: ['TA0006', 'TA0009'] },
  'T1056.001': { name: 'Keylogging', tactics: ['TA0006', 'TA0009'] },
  T1059: { name: 'Command and Scripting Interpreter', tactics: ['TA0002'] },
  'T1059.001': { name: 'PowerShell', tactics: ['TA0002'] },
  'T1059.003': { name: 'Windows Command Shell', tactics: ['TA0002'] },
  T1070: { name: 'Indicator Removal', tactics: ['TA0005'] },
  'T1070.001': { name: 'Clear Windows Event Logs', tactics: ['TA0005'] },
  T1078: { name: 'Valid Accounts', tactics: ['TA0001', 'TA0003', 'TA0004', 'TA0005'] },
  'T1078.004': { name: 'Cloud Accounts', tactics: ['TA0001', 'TA0003', 'TA0004', 'TA0005'] },
  T1080: { name: 'Taint Shared Content', tactics: ['TA0008'] },
  T1098: { name: 'Account Manipulation', tactics: ['TA0003', 'TA0004'] },
  'T1098.001': { name: 'Additional Cloud Credentials', tactics: ['TA0003', 'TA0004'] },
  T1110: { name: 'Brute Force', tactics: ['TA0006'] },
  'T1110.003': { name: 'Password Spraying', tactics: ['TA0006'] },
  T1112: { name: 'Modify Registry', tactics: ['TA0003', 'TA0112'] },
  T1136: { name: 'Create Account', tactics: ['TA0003'] },
  'T1136.001': { name: 'Local Account', tactics: ['TA0003'] },
  T1190: { name: 'Exploit Public-Facing Application', tactics: ['TA0001'] },
  T1195: { name: 'Supply Chain Compromise', tactics: ['TA0001'] },
  'T1195.002': { name: 'Compromise Software Supply Chain', tactics: ['TA0001'] },
  T1197: { name: 'BITS Jobs', tactics: ['TA0002', 'TA0003', 'TA0005'] },
  T1199: { name: 'Trusted Relationship', tactics: ['TA0001'] },
  T1200: { name: 'Hardware Additions', tactics: ['TA0001'] },
  T1202: { name: 'Indirect Command Execution', tactics: ['TA0005'] },
  T1204: { name: 'User Execution', tactics: ['TA0002'] },
  'T1204.002': { name: 'Malicious File', tactics: ['TA0002'] },
  T1207: { name: 'Rogue Domain Controller', tactics: ['TA0112'] },
  T1218: { name: 'System Binary Proxy Execution', tactics: ['TA0005'] },
  'T1218.011': { name: 'Rundll32', tactics: ['TA0005'] },
  T1219: { name: 'Remote Access Tools', tactics: ['TA0011'] },
  T1484: { name: 'Domain or Tenant Policy Modification', tactics: ['TA0004', 'TA0112'] },
  'T1484.001': { name: 'Group Policy Modification', tactics: ['TA0004', 'TA0112'] },
  T1490: { name: 'Inhibit System Recovery', tactics: ['TA0040'] },
  T1497: { name: 'Virtualization/Sandbox Evasion', tactics: ['TA0005', 'TA0007'] },
  'T1497.001': { name: 'System Checks', tactics: ['TA0005', 'TA0007'] },
  T1499: { name: 'Endpoint Denial of Service', tactics: ['TA0040'] },
  T1529: { name: 'System Shutdown/Reboot', tactics: ['TA0040'] },
  T1537: { name: 'Transfer Data to Cloud Account', tactics: ['TA0010'] },
  T1542: { name: 'Pre-OS Boot', tactics: ['TA0003', 'TA0005'] },
  'T1542.003': { name: 'Bootkit', tactics: ['TA0003', 'TA0005'] },
  T1546: { name: 'Event Triggered Execution', tactics: ['TA0003', 'TA0004'] },
  'T1546.003': {
    name: 'Windows Management Instrumentation Event Subscription',
    tactics: ['TA0003', 'TA0004'],
  },
  T1548: { name: 'Abuse Elevation Control Mechanism', tactics: ['TA0004'] },
  'T1548.002': { name: 'Bypass User Account Control', tactics: ['TA0004'] },
  T1520: { name: 'Domain Generation Algorithms', tactics: ['TA0037'] },
  T1552: { name: 'Unsecured Credentials', tactics: ['TA0006'] },
  'T1552.005': { name: 'Cloud Instance Metadata API', tactics: ['TA0006'] },
  T1555: { name: 'Credentials from Password Stores', tactics: ['TA0006'] },
  'T1555.003': { name: 'Credentials from Web Browsers', tactics: ['TA0006'] },
  T1562: { name: 'Impair Defenses', tactics: ['TA0005'] },
  'T1562.001': { name: 'Disable or Modify Tools', tactics: ['TA0005'] },
  'T1562.004': { name: 'Disable or Modify System Firewall', tactics: ['TA0005'] },
  T1566: { name: 'Phishing', tactics: ['TA0001'] },
  'T1566.001': { name: 'Spearphishing Attachment', tactics: ['TA0001'] },
  T1569: { name: 'System Services', tactics: ['TA0002'] },
  'T1569.002': { name: 'Service Execution', tactics: ['TA0002'] },
  T1572: { name: 'Protocol Tunneling', tactics: ['TA0011'] },
  T1574: { name: 'Hijack Execution Flow', tactics: ['TA0002', 'TA0005'] },
  'T1574.002': { name: 'DLL Side-Loading', tactics: ['TA0002', 'TA0005'] },
  T1578: { name: 'Modify Cloud Compute Infrastructure', tactics: ['TA0112'] },
  'T1578.002': { name: 'Create Cloud Instance', tactics: ['TA0112'] },
  T1582: { name: 'SMS Control', tactics: ['TA0034'] },
  T1586: { name: 'Compromise Accounts', tactics: ['TA0042'] },
  T1600: { name: 'Weaken Encryption', tactics: ['TA0112'] },
  'T1600.002': { name: 'Disable Crypto Hardware', tactics: ['TA0112'] },
  T1606: { name: 'Forge Web Credentials', tactics: ['TA0006'] },
  'T1606.002': { name: 'SAML Tokens', tactics: ['TA0006'] },
  T1608: { name: 'Stage Capabilities', tactics: ['TA0042'] },
  'T1608.001': { name: 'Upload Malware', tactics: ['TA0042'] },
  T1609: { name: 'Container Administration Command', tactics: ['TA0002'] },
  T1611: { name: 'Escape to Host', tactics: ['TA0004'] },
  T1613: { name: 'Container and Resource Discovery', tactics: ['TA0007'] },
  T1619: { name: 'Cloud Storage Object Discovery', tactics: ['TA0007'] },
  T1620: { name: 'Reflective Code Loading', tactics: ['TA0005'] },
  T1621: { name: 'Multi-Factor Authentication Request Generation', tactics: ['TA0006'] },
  T1633: { name: 'Virtualization/Sandbox Evasion', tactics: ['TA0030'] },
  'T1633.001': { name: 'System Checks', tactics: ['TA0030'] },
  T1652: { name: 'Device Driver Discovery', tactics: ['TA0007'] },
  T1659: { name: 'Content Injection', tactics: ['TA0001', 'TA0011'] },
  T1685: { name: 'Disable or Modify Tools', tactics: ['TA0112'] },
  T1695: { name: 'Block Communications', tactics: ['TA0107'] },
};

/**
 * Human-authored seed content per case. Exact rules paraphrase the gap and detect it with a
 * realistic query; near-miss rules cover an adjacent behaviour in the same technique family;
 * decoy rules echo one distinctive gap keyword in the name but describe and detect an
 * unrelated network-only behaviour. Names never encode the rule kind or the case id.
 */
interface SeedContent {
  name: string;
  description: string;
  query: string;
}

const EXACT_SEED: Readonly<Record<string, SeedContent>> = {
  'S1-POWERSHELL': {
    name: 'Obfuscated PowerShell Interpreter Invocation',
    description:
      'Identifies powershell.exe started with base64-encoded command-line arguments, a common way to hide malicious scripts at invocation time.',
    query: 'process.name:"powershell.exe" and process.command_line:(*-encodedcommand* or *-enc *)',
  },
  'S1-SMB': {
    name: 'Remote File Operations on Administrative Shares',
    description:
      'Detects writes and executions performed against C$ or ADMIN$ shares from another host on the network.',
    query:
      'event.category:"file" and file.path:(*"\\C$\\"* or *"\\ADMIN$\\"*) and not host.name:source.host',
  },
  'S1-OFFICE': {
    name: 'Office Application Spawning Command Shell',
    description:
      'Flags WINWORD.EXE, EXCEL.EXE or POWERPNT.EXE creating a cmd.exe child, a classic macro-dropchain pattern.',
    query:
      'event.category:"process" and process.parent.name:(WINWORD.EXE or EXCEL.EXE or POWERPNT.EXE) and process.name:"cmd.exe"',
  },
  G01: {
    name: 'Credential Dumping Tool Accessing LSASS',
    description:
      'Alerts when a process other than known system binaries opens a handle to the Local Security Authority Subsystem Service memory.',
    query:
      'process.name:(*psexec* or *procdump* or *taskmgr* or *rundll32*) and process.code_signature.trusted:false and winlog.event_data:"lsass.exe"',
  },
  G02: {
    name: 'DLL Execution by Rundll32 from User Profile',
    description:
      'Detects rundll32.exe loading a dynamic-link library located under a user-writable directory rather than a system path.',
    query:
      'process.name:"rundll32.exe" and dll.path:(*\\Users\\* or *\\AppData\\*) and not dll.path:(*\\System32\\* or *\\SysWOW64\\*)',
  },
  G03: {
    name: 'WMI Remote Process Creation',
    description:
      'Identifies processes started through WMI from a machine other than the endpoint raising the event.',
    query:
      'event.category:"process" and process.name:"wmiprvse.exe" and source.domain:* and not source.domain:HOSTNAME',
  },
  G04: {
    name: 'Non-Browser Process Reading Browser Credential Database',
    description:
      'Alerts when an executable outside the browser family reads the login-data stores kept by Chrome, Edge or Firefox.',
    query:
      'event.category:"file" and file.name:("Login Data" or "logins.json" or "key4.db") and not process.name:(chrome.exe or msedge.exe or firefox.exe)',
  },
  G05: {
    name: 'Volume Shadow Copy Removal via VSSAdmin',
    description:
      'Detects use of vssadmin.exe delete shadows, which destroys restore points before ransomware deployment.',
    query: 'process.name:"vssadmin.exe" and process.command_line:(*delete* and *shadows*)',
  },
  G06: {
    name: 'Security Agent Service Termination by Command Line',
    description:
      'Flags net stop or sc stop commands aimed at the endpoint protection service from an interactive shell.',
    query:
      'process.name:(net.exe or sc.exe) and process.command_line:(*stop* and (*MsMpEng* or *Sense* or *SepMasterService*))',
  },
  G07: {
    name: 'Scheduled Task Creation over Remote Management Channel',
    description:
      'Identifies schtasks.exe runs that register a task against a different host name than the one reporting the event.',
    query:
      'process.name:"schtasks.exe" and process.command_line:(*create* and */s *) and not process.command_line:*HOSTNAME*',
  },
  G08: {
    name: 'Interactive Local Account Creation',
    description:
      'Detects new local users added by net.exe or useradd outside of the approved change window for the asset.',
    query:
      'process.name:(net.exe or useradd) and process.command_line:(*user* and *add*) and not user.name:(*ansible* or *puppet*)',
  },
  G09: {
    name: 'Privileged Cloud Console Sign-In from New Geography',
    description:
      'Alerts when an admin-role principal signs into the cloud management console from a country not previously seen for that identity.',
    query:
      'event.dataset:"cloud.audit" and event.action:"ConsoleLogin" and user.roles:*admin* and cloud.account.id:* and not geo.country_iso_code:(US or PL)',
  },
  G10: {
    name: 'UAC Bypass via Fodhelper Registry Key Manipulation',
    description:
      'Detects writes under HKCU\\Software\\Classes\\ms-settings followed by fodhelper.exe execution, a known integrity-level bypass.',
    query:
      'registry.path:"HKCU\\Software\\Classes\\ms-settings\\shell\\open\\command\\*" and process.name:"fodhelper.exe"',
  },
  G11: {
    name: 'Office Macro Launching Script Interpreter',
    description:
      'Flags macro-enabled documents whose process tree leads to wscript.exe, cscript.exe or mshta.exe.',
    query:
      'process.parent.name:(WINWORD.EXE or EXCEL.EXE) and process.name:(wscript.exe or cscript.exe or mshta.exe)',
  },
  G12: {
    name: 'WMI Event Subscription Persistence Registered',
    description:
      'Identifies creation of permanent WMI consumers (CommandLineEventConsumer bindings) used to survive reboots.',
    query:
      'event.category:"process" and process.command_line:(*__EventFilter* or *CommandLineEventConsumer* or *__FilterToConsumerBinding*)',
  },
  G13: {
    name: 'Windows Event Log Cleared by Utility',
    description:
      'Detects wevtutil.exe or Clear-EventLog invocations that wipe one or more event channels on a Windows host.',
    query: 'process.name:"wevtutil.exe" and process.command_line:(*clear-log* or *cl *)',
  },
  G14: {
    name: 'Autorun Value Written Under HKCU Run Key',
    description:
      'Alerts on registry additions to the per-user Run key, which execute payloads at each interactive logon.',
    query:
      'event.category:"registry" and registry.path:"HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\*" and event.action:"creation"',
  },
  G15: {
    name: 'BITS Transfer Job for Remote Payload Retrieval',
    description:
      'Detects bitsadmin.exe jobs that download content from a remote URI, a trusted-binary download primitive.',
    query:
      'process.name:"bitsadmin.exe" and process.command_line:(*transfer* and (http://* or https://*))',
  },
  G16: {
    name: 'Suspended SVCHost Hollowing Pattern',
    description:
      'Identifies svchost.exe children created in a suspended state and later resumed with a modified image, typical of process hollowing tooling.',
    query:
      'event.category:"process" and process.parent.name:(cmd.exe or powershell.exe) and process.name:"svchost.exe" and process.extended_attributes:"suspended"',
  },
  G17: {
    name: 'Executable Run from Downloads Folder of Mail Archive Origin',
    description:
      'Flags processes whose image path sits in the user Downloads directory and whose parent was the mail client or an archive tool.',
    query:
      'process.executable:(*\\Downloads\\*.exe) and process.parent.name:(outlook.exe or 7zFM.exe or winrar.exe)',
  },
  G18: {
    name: 'Inbound RDP Logon from Rare External Network',
    description:
      'Detects successful Remote Desktop authentications sourced from networks or addresses never seen connecting to the host before.',
    query:
      'event.category:"network" and network.protocol:"rdp" and event.action:"logon" and source.ip:(10.0.0.0/8 or 192.168.0.0/16) and event.outcome:"success" and not source.geo.country_iso_code:PL',
  },
  G19: {
    name: 'Distributed Password Guessing Against Identity Provider',
    description:
      'Alerts on many failed authentications for distinct usernames originating from one source against the cloud identity platform.',
    query:
      'event.dataset:"identity.authentication" and event.action:"login" and event.outcome:"failure" and source.ip:* and user.name:* group by source.ip',
  },
  G20: {
    name: 'Consumer Remote Administration Utility in User Profile',
    description:
      'Detects known remote-support binaries executing from per-user directories rather than Program Files.',
    query:
      'process.executable:(*\\AppData\\* or *\\Users\\*) and process.name:(teamviewer.exe or anydesk.exe or vnc.exe or gotohttp.exe)',
  },
  G21: {
    name: 'Service Installed by Unprivileged Account on Domain Controller',
    description:
      'Flags service creation events on domain controllers where the requesting account lacks administrative group membership.',
    query:
      'winlog.channel:"Security" and event.code:"7045" and host.type:"domain_controller" and not user.group:"Domain Admins"',
  },
  G22: {
    name: 'Group Policy Object Edited Outside Maintenance Window',
    description:
      'Detects GPO edit operations performed outside the scheduled change window, sourced from consoles other than the dedicated management host.',
    query:
      'event.dataset:"ad.audit" and event.action:"group-policy-modify" and not source.host:("dc-mgmt-01" or "dc-mgmt-02")',
  },
  G23: {
    name: 'Fileless Reflective Module Injection Marker',
    description:
      'Identifies allocation of executable memory followed by a thread start with no backing image on disk, consistent with reflective loading.',
    query:
      'event.category:"process" and process.name:(rundll32.exe or regsvr32.exe) and process.code_signature.trusted:true and dll.path:null and process.thread.start_function:"LoadLibraryAbsent"',
  },
  G24: {
    name: 'Signed Binary Loading DLL from Temp Directory',
    description:
      'Detects trusted applications loading libraries out of temporary folders, indicating side-loading of a planted module.',
    query:
      'event.category:"process" and process.code_signature.trusted:true and dll.path:(*\\Temp\\* or *\\tmp\\*) and not process.name:(installer*.exe or setup*.exe)',
  },
  G25: {
    name: 'Unknown Process Installing Keyboard Hook',
    description:
      'Alerts when a process without a code-signing chain registers a low-level keyboard hook via SetWindowsHookEx.',
    query:
      'event.category:"process" and process.name:(*.exe) and winlog.event_data:"SetWindowsHookEx" and process.code_signature.trusted:false and not process.name:(explorer.exe or teams.exe)',
  },
  G26: {
    name: 'Encrypted DNS Payload Pattern in TXT Records',
    description:
      'Detects unusually long TXT record answers concentrated on a single resolver domain, a signature of DNS-based covert channels.',
    query:
      'event.category:"network" and network.protocol:"dns" and dns.response_text:* and dns.answers_count:1 and network.bytes > 300',
  },
  G27: {
    name: 'Command Execution via Forfiles Utility',
    description:
      'Flags forfiles.exe invocations carrying a /c command line, which shells out through cmd.exe and bypasses parent filtering.',
    query: 'process.name:"forfiles.exe" and process.command_line:(*/c * and *cmd.exe*)',
  },
  G28: {
    name: 'High-Volume File Reads on User Home Share',
    description:
      'Detects a single process reading thousands of files under SMB home directories in a short window, consistent with staging.',
    query:
      'event.category:"file" and event.action:"read" and file.path:*\\\\homes\\\\* and file.open_count > 500 and process.name:(explorer.exe or searchprotocolhost.exe or robocopy.exe)',
  },
  G29: {
    name: 'Local Firewall Disabled from Shell',
    description:
      'Alerts on netsh advfirewall set-allprofiles state off executed from an interactive command shell.',
    query: 'process.name:"netsh.exe" and process.command_line:(*advfirewall* and *off*)',
  },
  G30: {
    name: 'Masqueraded System Binary Name in User Directory',
    description:
      'Detects executables named after operating-system binaries but launched from user-writable paths instead of System32.',
    query:
      'process.name:(svchost.exe or lsass.exe or csrss.exe) and process.executable:(*\\Users\\*) and not process.executable:(*\\System32\\* or *\\SysWOW64\\*)',
  },
};

const NEAR_MISS_SEED: Readonly<Record<string, SeedContent>> = {
  'S1-OFFICE': {
    name: 'Command Shell Launched from Explorer',
    description:
      'Detects cmd.exe started from the Windows shell by a user, covering console use on workstations.',
    query: 'process.parent.name:"explorer.exe" and process.name:"cmd.exe"',
  },
  'S1-KUBECTL-PROD': {
    name: 'Kubernetes Object Listing by Cluster Operators',
    description:
      'Covers read-only kubectl get and describe commands against cluster resources by operator accounts.',
    query:
      'event.dataset:"kubernetes.audit" and event.action:(get or list) and user.username:(*ops* or *sre*) and object:*',
  },
  G04: {
    name: 'Browser History Database Access by Forensic Tooling',
    description:
      'Detects reads of Chrome and Firefox history files by the standard forensic agent suite.',
    query:
      'event.category:"file" and file.name:("History" or "places.sqlite") and process.name:(*forensic* or kape.exe)',
  },
  G08: {
    name: 'Privileged Group Membership Change',
    description:
      'Covers additions of existing accounts into local administrator groups, not the creation of new accounts.',
    query: 'winlog.channel:"Security" and event.code:"4732" and group.name:"Administrators"',
  },
  G11: {
    name: 'Macro-Enabled Attachment Saved from Mail Stream',
    description:
      'Detects .docm and .xlsm files written by the mail client, covering the delivery stage without execution.',
    query:
      'event.category:"file" and process.name:(outlook.exe or thunderbird.exe) and file.extension:(docm or xlsm)',
  },
  G14: {
    name: 'System-Wide Autorun Service Key Modification',
    description:
      'Covers changes to the machine-level Run services key under HKLM, complementing per-user autorun monitoring.',
    query:
      'event.category:"registry" and registry.path:"HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunServices\\*"',
  },
  G18: {
    name: 'Outbound Remote Desktop Client Launch',
    description:
      'Detects users starting the RDP client (mstsc.exe) on managed endpoints, covering outbound session initiation.',
    query: 'event.category:"process" and process.name:"mstsc.exe" and user.domain:CORP',
  },
  G23: {
    name: 'Unsigned DLL Loaded into Trusted Process',
    description:
      'Covers file-backed loading of unsigned libraries into signed processes, requiring an on-disk module.',
    query:
      'event.category:"process" and process.code_signature.trusted:true and dll.code_signature.trusted:false',
  },
  G29: {
    name: 'New Permissive Firewall Rule Created',
    description:
      'Detects netsh advfirewall rule additions that allow all inbound traffic, covering rule creation rather than disabling.',
    query: 'process.name:"netsh.exe" and process.command_line:(*rule* and *add* and *any*)',
  },
  G31: {
    name: 'Automated Scanner Fingerprint Against Web Tier',
    description:
      'Covers known scanner user agents probing public endpoints, ignoring post-exploitation file writes.',
    query:
      'event.category:"network" and user_agent.original:(*sqlmap* or *nikto* or *nmap* or *masscan*) and destination.port:(80 or 443)',
  },
  G35: {
    name: 'Docker Socket Mounted Inside Container',
    description:
      'Detects containers mounting the host docker.sock, a container-layer risk distinct from cluster API enumeration.',
    query:
      'event.dataset:"container.runtime" and event.action:"start" and container.mounts:"/var/run/docker.sock"',
  },
  G39: {
    name: 'Cron Definition Managed by Package Manager',
    description:
      'Covers cron file installs and removals performed by the system package manager during software changes.',
    query:
      'event.category:"file" and file.path:(/etc/cron.d/* or /etc/cron.daily/*) and process.name:(dpkg or rpm or yum or apt)',
  },
  G43: {
    name: 'Insecure SNMP Community String Configured',
    description:
      'Detects devices set to the default public community string, an adjacent weakening of device management protocol.',
    query:
      'event.dataset:"network.config" and event.action:"snmp-config" and snmp.community:"public"',
  },
  G46: {
    name: 'User-Initiated Encrypted Archive Creation',
    description:
      'Covers password-protected archives created interactively by the desktop archive utility on macOS.',
    query:
      'process.parent.name:"Finder" and process.name:"Archive Utility" and file.extension:zip and file.encrypted:true',
  },
  G49: {
    name: 'Partner Tunnel with Expired Device Certificate',
    description:
      'Detects third-party VPN sessions negotiated with certificates past their validity window, a certificate hygiene gap.',
    query: 'event.dataset:"vpn.session" and user.group:"partner-*" and tls.client.not_after < now',
  },
  G51: {
    name: 'Bootloader Configuration Edited by Admin Toolkit',
    description:
      'Covers GRUB configuration changes made by approved administration tooling, distinct from raw boot-sector writes.',
    query:
      'event.category:"file" and file.path:(/boot/grub/* or /etc/default/grub) and process.parent.name:(sudo or su)',
  },
  G54: {
    name: 'MDM Profile Rapidly Installed and Removed',
    description:
      'Covers management profiles installed and deleted within minutes on enrolled devices, a tamper signal.',
    query:
      'event.dataset:"ios.audit" and event.action:"profile-*" and mdm.enrolled:true and event.duration < 5m',
  },
  G58: {
    name: 'Print Driver Package Update from Vendor Portal',
    description:
      'Covers driver installs pulled from the vendor update site to the local driver store on print servers.',
    query:
      'process.name:(pnputil.exe or PrintBrm.exe) and file.path:"C:\\Windows\\System32\\spool\\*" and source.domain:(*hp.com* or *xerox.com*)',
  },
  G60: {
    name: 'Registry Host Pulling Unsigned Base Image',
    description:
      'Detects pulls of untagged base images from the corporate registry by non-CI cluster nodes.',
    query:
      'event.dataset:"container.runtime" and event.action:"pull" and container.image.registry:"registry.corp.io" and container.image.tag:null and not host.labels:"ci-runner"',
  },
};

const DECOY_SEED: Readonly<Record<string, SeedContent>> = {
  G02: {
    name: 'Rundll32 Outbound Connection to Rare Destination',
    description:
      'Flags network sessions initiated by rundll32.exe towards destinations not previously contacted by the fleet.',
    query:
      'event.category:"network" and process.name:"rundll32.exe" and not destination.domain:(*.microsoft.com or *.windowsupdate.com)',
  },
  G06: {
    name: 'Endpoint Protection Agent Beacon to Unusual Network',
    description:
      'Detects outbound traffic from the security agent process to address space outside known vendor cloud ranges.',
    query:
      'process.name:"MsMpEng.exe" and event.category:"network" and not destination.domain:*.microsoft.com',
  },
  G10: {
    name: 'Fodhelper Registry Command Infrastructure DNS Contact',
    description:
      'Alerts on DNS lookups of domains observed in fodhelper-themed social engineering lures.',
    query: 'event.category:"network" and dns.question.name:(*fodhelper* or *uac-bypass*)',
  },
  G13: {
    name: 'Event Log Collector Traffic on Non-Standard Port',
    description:
      'Detects log forwarding sessions leaving the host on ports other than the approved collector port.',
    query:
      'event.category:"network" and process.name:"winlogbeat.exe" and not destination.port:5044',
  },
  G20: {
    name: 'Remote Support Tool Update Check Traffic',
    description:
      'Covers periodic update and telemetry sessions from consumer remote-access utilities.',
    query:
      'event.category:"network" and user_agent.original:(*teamviewer* or *anydesk*) and destination.port:(80 or 443)',
  },
  G26: {
    name: 'DNS Resolver Volume Spike on Single Upstream',
    description:
      'Alerts on aggregate query volume concentrated on one upstream resolver, a resolver capacity signal.',
    query:
      'event.category:"network" and network.protocol:"dns" and destination.ip:8.8.8.8 and network.packets > 10000',
  },
  G30: {
    name: 'Masqueraded Binary Name in Network Telemetry',
    description:
      'Flags sessions reported by processes whose network identity name mimics system binaries on unmanaged hosts.',
    query:
      'event.category:"network" and process.name:(svchost.exe or lsass.exe) and not host.labels:"managed"',
  },
  G33: {
    name: 'Metadata Service Reachability Probe',
    description:
      'Detects lightweight connectivity checks against the metadata endpoint used by startup scripts.',
    query: 'event.category:"network" and destination.ip:169.254.169.254 and network.bytes < 100',
  },
  G37: {
    name: 'Bucket Inventory Synchronization Traffic',
    description:
      'Covers scheduled inventory sync sessions between storage accounts over the public endpoint.',
    query:
      'event.category:"network" and source.port:443 and url.full:*inventory-sync* and event.outcome:"success"',
  },
  G41: {
    name: 'Script Host Domain Fronting Contact',
    description:
      'Alerts on TLS sessions to CDN edges whose SNI matches domains used for script hosting.',
    query:
      'event.category:"network" and tls.client.server_name:(*cdn-worker* or *script-host*) and destination.port:443',
  },
  G45: {
    name: 'MFA Gateway Approval Prompts Flood on Network Edge',
    description:
      'Detects bursts of push-notification deliveries crossing the VPN gateway to a single handset.',
    query:
      'event.category:"network" and destination.port:443 and url.path:"/push/notify" and network.packets > 500',
  },
  G50: {
    name: 'Domain Controller Directory Traffic on Unexpected Port',
    description:
      'Flags LDAP and replication-class traffic to domain controllers on ports outside the standard set.',
    query:
      'event.category:"network" and destination.domain:(DC01* or DC02*) and not destination.port:(88 or 389 or 445 or 636)',
  },
  G52: {
    name: 'USB Tethered Adapter Broadcast Traffic',
    description:
      'Detects ARP broadcast storms sourced from USB network interfaces on access switches.',
    query:
      'event.category:"network" and network.name:"USB*" and event.action:"arp-broadcast" and network.packets > 1000',
  },
  G56: {
    name: 'Hypervisor Fingerprint Domain Lookup',
    description:
      'Alerts on DNS queries for vendor domains commonly used to detect running hypervisors.',
    query:
      'event.category:"network" and dns.question.name:(*vmware* or *virtualbox*) and process.name:(curl or wget)',
  },
  G59: {
    name: 'Audit Log Shipper Ingest Failure',
    description:
      'Detects failed sessions from log collectors to the SIEM ingest port, indicating delivery problems.',
    query:
      'event.category:"network" and destination.port:9243 and event.outcome:"failure" and process.name:(*filebeat* or *auditbeat*)',
  },
};

/**
 * Seed set: 67 rules — 33 exact (24 enabled, 9 disabled), 19 near-miss, 15 decoy. One exact
 * rule per covered case (enabled for `covered_enabled`, disabled for `covered_disabled`),
 * plus a near-miss or decoy rule where the case carries that trap.
 */
export const HARD_COVERAGE_FIXTURE_RULES: readonly HardSeedRule[] = COVERAGE_GAP_CASES.flatMap(
  (c): HardSeedRule[] => {
    const rules: HardSeedRule[] = [];
    if (c.expectedVerdict === 'covered_enabled' || c.expectedVerdict === 'covered_disabled') {
      const seed = EXACT_SEED[c.id];
      rules.push({
        name: `${HARD_RULE_PREFIX}${seed.name}`,
        caseId: c.id,
        kind: 'exact',
        enabled: c.expectedVerdict === 'covered_enabled',
        description: seed.description,
        query: seed.query,
        technique: c.attackTechnique,
      });
    }
    if (c.traps.includes('near_miss')) {
      const seed = NEAR_MISS_SEED[c.id];
      rules.push({
        name: `${HARD_RULE_PREFIX}${seed.name}`,
        caseId: c.id,
        kind: 'near_miss',
        enabled: true,
        description: seed.description,
        query: seed.query,
        technique: c.attackTechnique,
      });
    }
    if (c.traps.includes('decoy_name')) {
      const seed = DECOY_SEED[c.id];
      rules.push({
        name: `${HARD_RULE_PREFIX}${seed.name}`,
        caseId: c.id,
        kind: 'decoy',
        enabled: true,
        description: seed.description,
        query: seed.query,
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
export const deriveVerdictFromSeed = (c: CoverageGapCase): CoverageVerdict | 'needs_catalog' => {
  const exact = HARD_COVERAGE_FIXTURE_RULES.find((r) => r.caseId === c.id && r.kind === 'exact');
  if (!exact) return 'needs_catalog';
  return exact.enabled ? 'covered_enabled' : 'covered_disabled';
};

const DETECTION_RULES_URL = '/api/detection_engine/rules';
const DETECTION_API_VERSION = '2023-10-31';

const SUBTECHNIQUE_ID_REGEX = /^((?:AML\.)?T\d{4})\.(\d{3})$/i;

/**
 * Real Elastic rules store the parent id in `technique[].id` and the dotted id in
 * `technique[].subtechnique[].id`. `security.find_rules` routes a dotted `mitreTechnique` to
 * `threat.technique.subtechnique.id`, so a dotted id seeded into `technique[].id` is unfindable.
 * Names come from `MITRE_TECHNIQUE_INTEL`, not the raw id.
 */
export const buildHardRuleTechnique = (techniqueId: string): Record<string, unknown> => {
  const match = SUBTECHNIQUE_ID_REGEX.exec(techniqueId);
  if (!match) {
    const intel = MITRE_TECHNIQUE_INTEL[techniqueId];
    return {
      id: techniqueId,
      name: intel?.name ?? techniqueId,
      reference: `https://attack.mitre.org/techniques/${techniqueId}/`,
    };
  }
  const [, parentId, subNumber] = match;
  return {
    id: parentId,
    name: MITRE_TECHNIQUE_INTEL[parentId]?.name ?? parentId,
    reference: `https://attack.mitre.org/techniques/${parentId}/`,
    subtechnique: [
      {
        id: techniqueId,
        name: MITRE_TECHNIQUE_INTEL[techniqueId]?.name ?? techniqueId,
        reference: `https://attack.mitre.org/techniques/${parentId}/${subNumber}/`,
      },
    ],
  };
};

/**
 * The seeded tactic is the technique's first tactic in the MITRE data — never a fixed one —
 * so the seeded threat block looks like a real rule for its technique.
 */
export const buildHardRuleThreat = (techniqueId: string): Record<string, unknown> => {
  const intel = MITRE_TECHNIQUE_INTEL[techniqueId];
  const tacticId = intel?.tactics[0] ?? 'TA0002';
  return {
    framework: 'MITRE ATT&CK',
    tactic: {
      id: tacticId,
      name: MITRE_TACTIC_NAMES[tacticId] ?? tacticId,
      reference: `https://attack.mitre.org/tactics/${tacticId}/`,
    },
    technique: [buildHardRuleTechnique(techniqueId)],
  };
};

export const buildHardRuleBody = (rule: HardSeedRule): Record<string, unknown> => ({
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
  threat: [buildHardRuleThreat(rule.technique)],
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
  log.info(
    `[detection-coverage hard] seeded ${HARD_COVERAGE_FIXTURE_RULES.length} hard fixture rules`
  );
  return { cleanup: deleteHardRules };
}
