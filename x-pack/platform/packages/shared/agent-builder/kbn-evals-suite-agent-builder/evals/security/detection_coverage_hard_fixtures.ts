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
 *   unrelated behaviour under a technique from the diversified decoy pool (discovery,
 *   collection, C2, credential access — see `DECOY_SEED`).
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
    attackTechnique: 'T1039',
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
    attackTechnique: 'T1053.003',
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
    attackTechnique: 'T1567.002',
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
    gap: 'Network device SSH cipher policy weakened to legacy algorithms on a switch by a non-network user.',
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
    gap: 'Hardware encryption module on an industrial controller disabled outside maintenance.',
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
    gap: 'Login page content replaced by an injected overlay on enrolled mobile devices.',
    expectedVerdict: 'no_coverage',
    traps: ['near_miss', 'disabled_or_partial'],
  },
  {
    id: 'G55',
    attackTechnique: 'T1582',
    gap: 'Administrative SMS commands sent to the badge reader fleet by an unknown sender.',
    expectedVerdict: 'no_coverage',
    traps: [],
  },
  {
    id: 'G56',
    attackTechnique: 'T1497.001',
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
    attackTechnique: 'T1574.001',
    gap: 'Printer spooler plugin loaded from a network path on a print server.',
    expectedVerdict: 'no_coverage',
    traps: ['near_miss'],
  },
  {
    id: 'G59',
    attackTechnique: 'T1562.008',
    gap: 'Cloud audit logging disabled for one region only.',
    expectedVerdict: 'no_coverage',
    traps: ['disabled_or_partial', 'decoy_name'],
  },
  {
    id: 'G60',
    attackTechnique: 'T1195.002',
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
 * - `T1562`, `T1562.001`, `T1562.004`, `T1562.008`, `T1574.002`, `T1070.001` — revoked or absent
 *   from the generated file in v19.2; values match the v19.2 artifact's revoked entries.
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
  T1039: { name: 'Data from Network Shared Drive', tactics: ['TA0009'] },
  T1047: { name: 'Windows Management Instrumentation', tactics: ['TA0002'] },
  T1053: { name: 'Scheduled Task/Job', tactics: ['TA0002', 'TA0003', 'TA0004'] },
  'T1053.003': { name: 'Cron', tactics: ['TA0002', 'TA0003', 'TA0004'] },
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
  T1552: { name: 'Unsecured Credentials', tactics: ['TA0006'] },
  'T1552.005': { name: 'Cloud Instance Metadata API', tactics: ['TA0006'] },
  T1555: { name: 'Credentials from Password Stores', tactics: ['TA0006'] },
  'T1555.003': { name: 'Credentials from Web Browsers', tactics: ['TA0006'] },
  T1562: { name: 'Impair Defenses', tactics: ['TA0005'] },
  'T1562.001': { name: 'Disable or Modify Tools', tactics: ['TA0005'] },
  'T1562.004': { name: 'Disable or Modify System Firewall', tactics: ['TA0005'] },
  'T1562.008': { name: 'Disable or Modify Cloud Logs', tactics: ['TA0005'] },
  T1566: { name: 'Phishing', tactics: ['TA0001'] },
  'T1566.001': { name: 'Spearphishing Attachment', tactics: ['TA0001'] },
  'T1566.002': { name: 'Spearphishing Link', tactics: ['TA0001'] },
  'T1567.002': { name: 'Exfiltration to Cloud Storage', tactics: ['TA0010'] },
  T1569: { name: 'System Services', tactics: ['TA0002'] },
  'T1569.002': { name: 'Service Execution', tactics: ['TA0002'] },
  T1572: { name: 'Protocol Tunneling', tactics: ['TA0011'] },
  T1574: { name: 'Hijack Execution Flow', tactics: ['TA0002', 'TA0005'] },
  'T1574.001': { name: 'DLL', tactics: ['TA0002', 'TA0005'] },
  'T1574.002': { name: 'DLL Side-Loading', tactics: ['TA0002', 'TA0005'] },
  T1578: { name: 'Modify Cloud Compute Infrastructure', tactics: ['TA0112'] },
  'T1578.002': { name: 'Create Cloud Instance', tactics: ['TA0112'] },
  T1600: { name: 'Weaken Encryption', tactics: ['TA0112'] },
  'T1600.002': { name: 'Disable Crypto Hardware', tactics: ['TA0112'] },
  T1606: { name: 'Forge Web Credentials', tactics: ['TA0006'] },
  'T1606.002': { name: 'SAML Tokens', tactics: ['TA0006'] },
  T1609: { name: 'Container Administration Command', tactics: ['TA0002'] },
  T1611: { name: 'Escape to Host', tactics: ['TA0004'] },
  T1613: { name: 'Container and Resource Discovery', tactics: ['TA0007'] },
  T1619: { name: 'Cloud Storage Object Discovery', tactics: ['TA0007'] },
  T1620: { name: 'Reflective Code Loading', tactics: ['TA0005'] },
  T1621: { name: 'Multi-Factor Authentication Request Generation', tactics: ['TA0006'] },
  T1652: { name: 'Device Driver Discovery', tactics: ['TA0007'] },
  T1659: { name: 'Content Injection', tactics: ['TA0001', 'TA0011'] },
  // Decoy-only techniques below: diversified per P2-3 so no surface signal separates decoys.
  'T1056.002': { name: 'GUI Input Capture', tactics: ['TA0009', 'TA0006'] },
  T1018: { name: 'Remote System Discovery', tactics: ['TA0007'] },
  T1046: { name: 'Network Service Discovery', tactics: ['TA0007'] },
  'T1070.004': { name: 'File Deletion', tactics: ['TA0005'] },
  'T1071.001': { name: 'Web Protocols', tactics: ['TA0011'] },
  'T1071.004': { name: 'DNS', tactics: ['TA0011'] },
  'T1074.001': { name: 'Local Data Staging', tactics: ['TA0009'] },
  T1083: { name: 'File and Directory Discovery', tactics: ['TA0007'] },
  'T1090.003': { name: 'Multi-hop Proxy', tactics: ['TA0011'] },
  T1135: { name: 'Network Share Discovery', tactics: ['TA0007'] },
  'T1518.001': { name: 'Security Software Discovery', tactics: ['TA0007'] },
  'T1557.002': { name: 'ARP Cache Poisoning', tactics: ['TA0006', 'TA0009'] },
  'T1568.002': { name: 'Domain Generation Algorithms', tactics: ['TA0011'] },
};

/**
 * Human-authored seed content per case. Exact rules paraphrase the gap and detect it with a
 * realistic query; near-miss rules cover an adjacent behaviour in the same technique family,
 * described in the same assertive register as exact rules;
 * decoy rules echo one distinctive gap keyword in the name but describe and detect an
 * unrelated behaviour. Decoys are tagged with a technique from the diversified decoy pool.
 * Names never encode the rule kind or the case id.
 */
interface SeedContent {
  name: string;
  description: string;
  query: string;
}

const EXACT_SEED: Readonly<Record<string, SeedContent>> = {
  'S1-POWERSHELL': {
    name: 'Obfuscated PowerShell Interpreter Launched from the Command Line',
    description:
      'Identifies powershell.exe started with base64-encoded command-line arguments that hide malicious script content at invocation time.',
    query:
      'process.name:"powershell.exe" and process.command_line:(*-encodedcommand* or *-enc *) and not user.name:(*svc-* or *health*)',
  },
  'S1-SMB': {
    name: 'Remote File Operations on Hidden Windows Administrative Shares',
    description:
      'Detects file writes and executions against hidden C$ or ADMIN$ administrative shares by a session that originated from another host on the network.',
    query:
      'event.category:"file" and file.path:(*"\\\\C$\\\\"* or *"\\\\ADMIN$\\\\"*) and process.name:"System" and process.command_line:*net*',
  },
  'S1-OFFICE': {
    name: 'Office Application Spawning a Command Shell Child Process',
    description:
      'Flags WINWORD.EXE, EXCEL.EXE or POWERPNT.EXE creating a cmd.exe child, a classic macro-dropchain pattern, not the document-compatibility scanner.',
    query:
      'event.category:"process" and process.parent.name:(WINWORD.EXE or EXCEL.EXE or POWERPNT.EXE) and process.name:(cmd.exe or *powershell*)',
  },
  G01: {
    name: 'Credential Dumping Tool Opening a Handle to LSASS',
    description:
      'Alerts when a process other than known system binaries opens a handle to LSASS process memory for credential extraction.',
    query:
      'process.name:(*psexec* or *procdump* or *rundll32*) and process.code_signature.trusted:false and process.command_line:*lsass*',
  },
  G02: {
    name: 'DLL Execution by Rundll32 from User Profile',
    description:
      'Detects rundll32.exe loading a dynamic-link library from a user-writable directory rather than an approved system path.',
    query:
      'process.name:"rundll32.exe" and dll.path:(*\\Users\\* or *\\AppData\\*) and not dll.path:(*\\System32\\* or *\\SysWOW64\\* or *\\WinSxS\\*)',
  },
  G03: {
    name: 'WMI Remote Process Creation from an External Host',
    description:
      'Identifies processes started through WMI from a machine other than the endpoint raising the event, a remote-execution path.',
    query:
      'event.category:"process" and process.name:"WmiPrvSE.exe" and process.parent.name:"WmiPrvSE.exe" and user.id:S-1-5-*-500 and host.os.type:windows',
  },
  G04: {
    name: 'Non-Browser Process Reading the Browser Credential Database',
    description:
      'Alerts when an executable outside the browser family reads the login-data stores kept by Chrome, Edge or Firefox.',
    query:
      'event.category:"file" and file.name:(Login*Data or logins.json or key4.db or *passwords*) and not process.name:(chrome*.exe or msedge.exe or firefox.exe)',
  },
  G05: {
    name: 'Volume Shadow Copy Removal by the VSSAdmin Utility',
    description:
      'Detects vssadmin.exe delete shadows use, which destroys all volume restore points ahead of ransomware deployment on the host.',
    query:
      'process.name:"vssadmin.exe" and process.command_line:(*delete* and *shadows*) and not user.name:("backup-svc" or *vault*)',
  },
  G06: {
    name: 'Security Agent Service Termination by Command Line',
    description:
      'Flags net stop or sc stop commands aimed at the endpoint protection service from an interactive shell, which is not the maintenance account pattern.',
    query:
      'process.name:(net.exe or sc.exe) and process.command_line:(*stop* and (*MsMpEng* or *Sense* or *SepMasterService*))',
  },
  G07: {
    name: 'Scheduled Task Creation over a Remote Management Channel',
    description:
      'Identifies schtasks.exe runs that register a scheduled task against a different host name than the one reporting the event, a remote-creation signal.',
    query:
      'process.name:"schtasks.exe" and process.command_line:(*create* and */s *) and not process.command_line:*%COMPUTERNAME%*',
  },
  G08: {
    name: 'Interactive Local Account Creation Outside the Change Window',
    description:
      'Detects new local user accounts added by net.exe or useradd, interactive or scripted, outside the approved change window.',
    query:
      'process.name:(net.exe or useradd) and process.command_line:(*user* and *add*) and not user.name:(*ansible* or *puppet*)',
  },
  G09: {
    name: 'Privileged Cloud Console Sign-In from Unapproved Country',
    description: 'Alerts when an admin signs into the cloud console from an unapproved country.',
    query:
      'event.dataset:("aws.cloudtrail" or "gcloud.audit") and event.action:"ConsoleLogin" and user.name:(*admin* or *root*) and not source.ip:(10.0.0.0/8 or 172.16.0.0/12 or 192.168.0.0/16) and not source.geo.country_iso_code:(US or PL)',
  },
  G10: {
    name: 'UAC Bypass via Fodhelper Registry Key Manipulation',
    description: 'Detects writes under ms-settings followed by fodhelper.exe execution.',
    query:
      'registry.path:"HKCU\\Software\\Classes\\ms-settings\\shell\\open\\command\\*" and process.name:"fodhelper.exe"',
  },
  G11: {
    name: 'Office Macro Launching Script Interpreter Child',
    description:
      'Flags macro-enabled documents whose process tree leads to wscript.exe, cscript.exe or mshta.exe, the classic macro-to-script chain.',
    query:
      'process.parent.name:(WINWORD.EXE or EXCEL.EXE) and process.name:(wscript.exe or cscript*.exe or mshta.exe)',
  },
  G12: {
    name: 'WMI Event Subscription Persistence Registered on the Host',
    description: 'Identifies creation of permanent WMI event consumers used to survive reboots.',
    query:
      'event.category:"process" and process.command_line:(*__EventFilter* or *CommandLineEventConsumer* or *__FilterToConsumerBinding*)',
  },
  G13: {
    name: 'Windows Event Log Cleared',
    description:
      'Detects wevtutil.exe or Clear-EventLog invocations that wipe one or more event channels, which destroys forensic evidence, on a managed Windows host.',
    query:
      'process.name:"wevtutil.exe" and process.command_line:(*clear-log* or *cl *) and not process.parent.name:(*setup* or *installer*)',
  },
  G14: {
    name: 'Autorun Value Written Under a Run Key',
    description:
      'Alerts on registry value additions to the per-user Run key, which execute stored payloads at each interactive user logon.',
    query:
      'event.category:"registry" and registry.path:"HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\*" and event.action:"creation"',
  },
  G15: {
    name: 'BITS Transfer Job for Remote Payload Retrieval',
    description:
      'Detects bitsadmin.exe jobs that download content from a remote URI, a trusted staging primitive, excluding the update service account.',
    query:
      'process.name:"bitsadmin.exe" and process.command_line:(*transfer* and (http://* or https://*)) and not user.name:("patch-svc" or *svc-*)',
  },
  G16: {
    name: 'SVCHost Hollowing by Image Replacement',
    description:
      'Identifies svchost.exe child processes created in a suspended state, later resumed from a modified in-memory image.',
    query:
      'event.category:"process" and event.action:"start" and process.parent.name:(cmd.exe or powershell*.exe) and process.name:(svchost.exe or *svchost*) and process.code_signature.trusted:false',
  },
  G17: {
    name: 'Executable Run from Downloads of Mail Origin',
    description:
      'Flags processes launched from the Downloads directory whose parent was the mail client, an archive utility, or a browser download flow.',
    query:
      'process.executable:(*\\Downloads\\*.exe) and process.parent.name:(outlook.exe or 7zFM.exe or winrar.exe) and not process.name:(*updater* or *uninstall* or *crashpad*)',
  },
  G18: {
    name: 'Inbound RDP Logon from a Rare External Network',
    description:
      'Detects Remote Desktop authentications sourced from networks or addresses never seen connecting to the host before.',
    query:
      'event.category:"network" and network.protocol:"rdp" and event.action:"logon" and event.outcome:"success" and not source.ip:(10.0.0.0/8 or 172.16.0.0/12 or 192.168.0.0/16)',
  },
  G19: {
    name: 'Password Guessing Against Identity Provider',
    description:
      'Alerts on many failed authentications for distinct usernames from one source against the cloud identity platform.',
    query:
      'event.dataset:"identity.authentication" and event.action:"logon" and event.outcome:"failure" and user.name:* and not source.ip:(10.0.0.0/8 or 172.16.0.0/12 or 192.168.0.0/16) and not user.name:(svc-* or *scan*)',
  },
  G20: {
    name: 'Consumer Remote Administration Utility in a User Profile',
    description:
      'Detects known remote-support binaries executing from per-user directories rather than Program Files installation locations.',
    query:
      'process.executable:(*\\AppData\\* or *\\Users\\*) and process.name:(teamviewer.exe or anydesk.exe or *vnc*.exe or gotohttp.exe) and not host.name:(*kiosk* or *lab*)',
  },
  G21: {
    name: 'Service Installed by an Unprivileged Account on a DC',
    description:
      'Flags service creation events on domain controllers where the requesting account lacks administrative group membership in the domain.',
    query:
      'winlog.channel:"Security" and event.code:"7045" and winlog.event_data.SubjectUserName:* and not user.group:"Domain Admins" and host.name:(dc-* or *-dc*)',
  },
  G22: {
    name: 'Group Policy Object Edited Outside Maintenance Window',
    description:
      'Detects GPO edits performed outside the scheduled change window by consoles other than the approved management workstation.',
    query:
      'event.dataset:"ad.audit" and event.action:(group-policy-modify or *gpo*) and not source.host:("dc-mgmt-*" or *change-window*)',
  },
  G23: {
    name: 'Reflective Module Injection Without Backing Image',
    description:
      'Identifies allocation of executable private memory followed by a remote thread start with no backing image present on disk.',
    query:
      'event.category:"process" and process.name:(rundll32.exe or regsvr32.exe) and process.code_signature.trusted:true and process.args:*dll* and not dll.path:*',
  },
  G24: {
    name: 'Signed Binary Loading a DLL from the Temp Directory',
    description:
      'Detects trusted applications loading libraries out of temporary folders, indicating side-loading of a planted module.',
    query:
      'event.category:"process" and process.code_signature.trusted:true and dll.path:(*\\Temp\\* or *\\tmp\\*) and not process.name:(installer*.exe or setup*.exe)',
  },
  G25: {
    name: 'Unknown Process Installing Low-Level Keyboard Hook',
    description:
      'Alerts when a process, without a code-signing chain, registers a low-level keyboard hook via the SetWindowsHookEx API, which captures keystrokes.',
    query:
      'event.category:"process" and process.name:(*.exe) and process.code_signature.trusted:false and winlog.event_data.TargetCommandLine:*SetWindowsHookEx* and not process.name:(explorer.exe or teams.exe)',
  },
  G26: {
    name: 'Encrypted DNS Payload Pattern in TXT',
    description:
      'Detects unusually long TXT record answers concentrated on a single resolver domain, a signature of DNS-based covert channels.',
    query:
      'event.category:"network" and network.protocol:"dns" and dns.type:TXT and dns.response_text:* and network.community_id:* and network.bytes > 300',
  },
  G27: {
    name: 'Indirect Command Execution via Forfiles',
    description:
      'Flags forfiles.exe use with a /c command line, which shells out through cmd.exe and bypasses parent filtering.',
    query: 'process.name:"forfiles.exe" and process.command_line:(*/c * and *cmd.exe*)',
  },
  G28: {
    name: 'High-Volume File Reads on User Home Share',
    description:
      'Detects one process reading thousands of files under SMB home directories in a short window, consistent with bulk staging.',
    query:
      'event.category:"file" and event.action:(open or read) and file.path:*\\\\homes\\\\* and process.name:(robocopy.exe or 7z.exe or rar.exe or tar)',
  },
  G29: {
    name: 'Local Firewall Disabled from an Interactive Shell Session',
    description:
      'Alerts on netsh advfirewall set-allprofiles state off executed from an interactive shell, disabling the local host firewall entirely.',
    query: 'process.name:"netsh.exe" and process.command_line:(*advfirewall* and *off*)',
  },
  G30: {
    name: 'Masqueraded System Binary Launched from User Directory',
    description:
      'Detects executables named after system binaries launching from user-writable paths outside System32, a name-mimicry pattern.',
    query:
      'event.category:"process" and process.name:(svchost.exe or lsass.exe or csrss.exe) and process.executable:(*\\Users\\*) and not process.executable:(*\\System32\\* or *\\SysWOW64\\*)',
  },
};

const NEAR_MISS_SEED: Readonly<Record<string, SeedContent>> = {
  'S1-OFFICE': {
    name: 'Command Shell Launched from the Windows Explorer Shell',
    description:
      'Identifies cmd.exe launched from the interactive Windows shell of a logged-on user on a corporate workstation or server.',
    query: 'process.parent.name:"explorer.exe" and process.name:(cmd.exe or *.scr or *console*)',
  },
  'S1-KUBECTL-PROD': {
    name: 'Kubernetes Object Listing Commands Run by Cluster Operators',
    description:
      'Detects read-only kubectl get and describe commands issued against cluster resources by routine platform operator accounts.',
    query:
      'event.dataset:"kubernetes.audit" and event.action:(get or list) and user.username:("platform-ops" or *sre*) and object:*',
  },
  G04: {
    name: 'Browser History Database Access by Forensic Tooling Suite',
    description:
      'Alerts on reads of Chrome and Firefox browsing history files, performed by the standard forensic collection agent suite.',
    query:
      'event.category:"file" and file.name:("History" or "places.sqlite" or *cookies*) and process.name:(*forensic* or kape.exe) and not user.name:(*incident*)',
  },
  G08: {
    name: 'Privileged Local Group Membership Change Event',
    description:
      'Identifies additions of existing domain user accounts into local administrator groups on member servers and workstations.',
    query:
      'winlog.channel:"Security" and event.code:"4732" and group.name:(Administrators or *Admins or *operators)',
  },
  G11: {
    name: 'Macro-Enabled Attachment Saved from Mail Stream',
    description:
      'Flags macro-enabled .docm and .xlsm attachments written by the desktop mail client into the local user profile directory.',
    query:
      'event.category:"file" and process.name:(outlook.exe or thunderbird.exe or *mail*) and file.extension:(docm or xlsm or *macro*)',
  },
  G14: {
    name: 'System-Wide Windows Autorun Service Key Modification Under HKLM',
    description:
      'Detects changes to the machine-level Run services key under HKLM, the system-wide autorun location for third-party services.',
    query:
      'event.category:"registry" and registry.path:(HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunServices\\* or *RunServicesOnce\\*) and not process.name:"trusted-installer.exe"',
  },
  G18: {
    name: 'Outbound Remote Desktop Client Launch by User',
    description:
      'Flags users starting the outbound RDP client (mstsc.exe) on managed endpoints for interactive session initiation to remote hosts.',
    query:
      'event.category:"process" and process.name:(mstsc.exe or *rdp*) and user.domain:(CORP or *local)',
  },
  G23: {
    name: 'Unsigned DLL Loaded into a Trusted Process',
    description:
      'Detects file-backed loading of unsigned dynamic-link libraries into signed production processes across the managed fleet.',
    query:
      'event.category:"process" and process.name:(*signed* or *.exe) and process.code_signature.trusted:true and dll.code_signature.trusted:false and dll.path:(*.dll or *.ocx)',
  },
  G29: {
    name: 'New Permissive Inbound Firewall Rule Created Locally by Admin',
    description:
      'Alerts on netsh advfirewall rule additions that allow all inbound traffic on managed Windows endpoints and member servers.',
    query: 'process.name:"netsh.exe" and process.command_line:(*rule* and *add* and *any*)',
  },
  G31: {
    name: 'Automated Scanner Fingerprint Against the Public Web Tier',
    description:
      'Alerts on known automated scanner user agents, probing the public-facing web tier for exposed management endpoints.',
    query:
      'event.category:"network" and user_agent.original:(sqlmap or nikto or nmap-engine or masscan/1* or zgrab) and destination.port:(80 or 443)',
  },
  G35: {
    name: 'Docker Host Socket Volume Mounted Inside a Running Container',
    description:
      'Flags containers that mount the host docker.sock volume at runtime, exposing the underlying container engine control socket.',
    query:
      'event.dataset:"container.runtime" and event.action:"start" and container.mounts:(/var/run/*.sock or *docker.sock*)',
  },
  G39: {
    name: 'Cron Definition Files Managed by the Package Manager',
    description:
      'Detects cron definition files installed or removed by the system package manager during software changes on Linux servers.',
    query:
      'event.category:"file" and file.path:(/etc/cron.d/* or /etc/cron.daily/* or /var/spool/cron/*) and process.name:(dpkg or rpm or yum or apt)',
  },
  G43: {
    name: 'Insecure Default SNMP Community String Configured on Network Device',
    description:
      'Alerts on network devices still configured with the default public SNMP community string on the management segment.',
    query:
      'event.dataset:"network.config" and event.action:(snmp-config or *community*) and snmp.community:("public" or "default" or *read* or *private*)',
  },
  G46: {
    name: 'User-Initiated Encrypted Archive Creation at Desktop',
    description:
      'Flags password-protected archives created interactively by the standard desktop archive utility on managed macOS workstations.',
    query:
      'process.parent.name:"Finder" and process.name:(*Archive* or *zip*) and file.extension:(zip or 7z) and file.encrypted:true',
  },
  G49: {
    name: 'Partner Tunnel with Expired Device Certificate',
    description:
      'Alerts on third-party VPN sessions negotiated with expired device certificates on the corporate partner tunnel estate.',
    query:
      'event.dataset:"vpn.session" and user.group:(partner-* or "contractors" or *vendor*) and tls.client.not_after < now and not network.name:(*mgmt* or *backup*)',
  },
  G51: {
    name: 'Bootloader Configuration Edited by Admin Toolkit',
    description:
      'Detects GRUB bootloader configuration changes made by approved administration tooling on production servers in the estate, outside reboots.',
    query:
      'event.category:"file" and file.path:(/boot/grub/* or /etc/default/grub or *grub.cfg*) and process.parent.name:(sudo or su or *shell)',
  },
  G54: {
    name: 'MDM Profile Rapidly Installed and Removed',
    description:
      'Identifies device management profiles installed and deleted, within minutes of each other, on enrolled mobile handsets.',
    query:
      'event.dataset:"ios.audit" and event.action:(profile-* or *mdm* or "install") and mdm.enrolled:true and event.duration < 5m and not host.name:(*kiosk* or *stage*)',
  },
  G58: {
    name: 'Print Driver Package Update from Vendor Portal',
    description:
      'Identifies driver packages pulled from the hardware vendor update site into the local driver store on managed print servers.',
    query:
      'process.name:(pnputil.exe or PrintBrm.exe) and file.path:(*spool* or *DriverStore*) and source.domain:(*hp.com* or *xerox.com* or *sharp*)',
  },
  G60: {
    name: 'Container Registry Host Pulling an Unsigned Base Image',
    description:
      'Flags pulls of untagged base images from the corporate container registry by nodes outside the approved CI build pool.',
    query:
      'event.dataset:"container.runtime" and event.action:"pull" and container.image.registry:(registry.corp.io or *.corp.*) and not container.image.tag:* and not host.labels:"ci-runner"',
  },
};

/**
 * Decoy seed content plus the real ATT&CK technique each decoy rule is tagged with.
 * Techniques and query domains are deliberately spread across the matrix (discovery,
 * collection, C2, credential access, file/process/registry/cloud-audit telemetry) so no
 * single technique id or event.category value dominates the decoy population. Each decoy
 * still echoes one distinctive gap keyword in its name and detects behaviour unrelated to
 * any case gap in the dataset.
 */
interface DecoySeed extends SeedContent {
  technique: string;
}

const DECOY_SEED: Readonly<Record<string, DecoySeed>> = {
  G02: {
    name: 'DLL Dependency Enumeration by Setup Binary',
    description:
      'Flags setup and installer binaries enumerating the DLL exports of system libraries during routine software installation.',
    query:
      'event.category:"process" and process.name:(setup*.exe or install*.exe) and process.code_signature.trusted:true and event.action:"load"',
    technique: 'T1083',
  },
  G06: {
    name: 'Endpoint Protection Process Enumeration by Fleet Inventory',
    description:
      'Flags routine inventory scans listing the endpoint security agent processes and installed services across the fleet estate.',
    query:
      'event.category:"process" and process.name:(tasklist.exe or ps) and process.command_line:(*MsMpEng* or *Sense*)',
    technique: 'T1518.001',
  },
  G10: {
    name: 'Fodhelper Registry Command Infrastructure DNS Contact',
    description:
      'Identifies DNS lookups of domains observed in fodhelper-themed social engineering lures against managed fleet endpoints.',
    query: 'event.category:"network" and dns.question.name:(*fodhelper* or *uac-bypass*)',
    technique: 'T1568.002',
  },
  G13: {
    name: 'Event Log Archive File Staged in Temp Directory',
    description:
      'Flags Windows event log archive files, written into temporary working folders, by the local log collection tooling on endpoints.',
    query:
      'event.category:"file" and file.extension:evtx and file.path:(*\\Temp\\* or */tmp/* or *\\tmp\\*) and not process.name:(*archiver* or *collector*)',
    technique: 'T1074.001',
  },
  G20: {
    name: 'Remote Support Tool Update Check Web Traffic',
    description:
      'Identifies periodic update check and telemetry sessions from consumer remote-access utilities running on endpoints.',
    query:
      'event.category:"network" and user_agent.original:(*teamviewer* or *anydesk*) and destination.port:(80 or 443)',
    technique: 'T1071.001',
  },
  G26: {
    name: 'DNS Zone Transfer Request to Authoritative NS',
    description:
      'Alerts on AXFR full-zone transfer requests sent by ordinary client subnets to internal authoritative name servers.',
    query:
      'event.category:"network" and network.protocol:"dns" and dns.question.type:"AXFR" and source.ip:(10.0.0.0/8 or 172.16.0.0/12 or 192.168.0.0/16) and destination.port:53 and not dns.question.name:(*arpa or *internal*)',
    technique: 'T1071.004',
  },
  G30: {
    name: 'Masqueraded Binary Name in Process Inventory',
    description:
      'Detects scheduled inventory reports of processes whose image name, mimicking system binaries, appear on unmanaged endpoint hosts.',
    query:
      'event.category:"process" and process.name:(taskhostw.exe or conhost.exe or dpi.exe) and not host.labels:"managed"',
    technique: 'T1036',
  },
  G33: {
    name: 'Metadata Gateway Error Responses from Startup Scripts',
    description:
      'Alerts on elevated rates of 4xx error responses returned by the configuration API gateway to boot-time scripts at scale.',
    query:
      'event.category:"network" and destination.domain:(api.*.internal or conf-gateway.*) and http.response.status_code:[400 TO 499] and source.process.name:(cloud-init or startup-script)',
    technique: 'T1046',
  },
  G37: {
    name: 'Bucket Inventory Synchronization Job',
    description:
      'Alerts on scheduled inventory and billing listing jobs run against cloud platform APIs from the billing pipeline.',
    query:
      'event.dataset:("aws.cloudtrail" or "gcloud.audit") and event.action:("ListRoles" or "GetAccountSummary") and user.name:(*billing* or *inventory*)',
    technique: 'T1135',
  },
  G41: {
    name: 'Script Host Interpreter Started by Build Agent',
    description:
      'Alerts on wscript.exe or cscript.exe interpreter processes whose parent is a build tool or package manager binary.',
    query:
      'event.category:"process" and process.name:(wscript.exe or cscript.exe or *script*.exe) and process.parent.name:(node.exe or msbuild.exe or npm.exe)',
    technique: 'T1059',
  },
  G45: {
    name: 'MFA Approval Vendor Update and Telemetry Web Sessions',
    description:
      'Detects software update and telemetry sessions from the multi-factor authentication vendor portal to managed handsets.',
    query:
      'event.category:"network" and user_agent.original:*mfa-vendor* and url.path:(/update or /telemetry) and destination.port:443',
    technique: 'T1071.001',
  },
  G50: {
    name: 'Domain Controller Replication Tool Run on Member Server',
    description:
      'Detects repadmin.exe executed interactively on member servers and other managed hosts that are not domain controllers.',
    query:
      'event.category:"process" and process.name:"repadmin.exe" and not host.type:"domain_controller"',
    technique: 'T1018',
  },
  G52: {
    name: 'USB Tethered Adapter Broadcast Traffic',
    description:
      'Alerts on ARP broadcast storms sourced from virtual tunnel adapter interfaces on access switches in the branch network.',
    query:
      'event.category:"network" and network.name:(*IPsec* or *utun*) and event.action:"arp-broadcast" and network.packets > 1000',
    technique: 'T1557.002',
  },
  G56: {
    name: 'Hypervisor Vendor License Server Contact',
    description:
      'Identifies license-management daemons on virtualization hosts periodically contacting the vendor licensing portal.',
    query:
      'event.category:"network" and process.name:(vmadpd or vpxa) and destination.domain:(licenses.* or *licensing*) and destination.port:443',
    technique: 'T1018',
  },
  G59: {
    name: 'Cloud Audit Log Shipper Ingest Failure',
    description:
      'Detects failed sessions from downstream log collectors to the SIEM ingest port, indicating persistent, overnight log delivery problems.',
    query:
      'destination.port:9243 and event.outcome:"failure" and process.name:(*filebeat* or *auditbeat*)',
    technique: 'T1070.004',
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
        technique: seed.technique,
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
    const { data } = await kbnClient.request<{ data?: Array<{ id: string; name: string }> }>({
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
