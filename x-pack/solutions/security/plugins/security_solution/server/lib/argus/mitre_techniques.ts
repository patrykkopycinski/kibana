/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TechniqueMeta } from '@kbn/argus-console-common';

/**
 * Minimal, curated subset of ATT&CK Enterprise v14 techniques used by the
 * Tier 1 coverage surface in demo mode. The real ingest replaces this with
 * the full STIX pull, but shipping a static subset lets the heatmap light up
 * immediately on a fresh install without network access or a multi-MB blob.
 *
 * Each row carries tactic + technique ids to keep the cell builder purely
 * data-driven. Keep in alphabetical order of `technique_id` so diffs are
 * obvious when the demo corpus grows.
 */
export const DEMO_ATTACK_TECHNIQUES: readonly TechniqueMeta[] = [
  { tactic_id: 'TA0001', tactic_name: 'Initial Access', technique_id: 'T1078', technique_name: 'Valid Accounts' },
  { tactic_id: 'TA0001', tactic_name: 'Initial Access', technique_id: 'T1190', technique_name: 'Exploit Public-Facing Application' },
  { tactic_id: 'TA0001', tactic_name: 'Initial Access', technique_id: 'T1566', technique_name: 'Phishing' },
  { tactic_id: 'TA0002', tactic_name: 'Execution', technique_id: 'T1059.001', technique_name: 'PowerShell' },
  { tactic_id: 'TA0002', tactic_name: 'Execution', technique_id: 'T1059.003', technique_name: 'Windows Command Shell' },
  { tactic_id: 'TA0002', tactic_name: 'Execution', technique_id: 'T1204', technique_name: 'User Execution' },
  { tactic_id: 'TA0003', tactic_name: 'Persistence', technique_id: 'T1053.005', technique_name: 'Scheduled Task' },
  { tactic_id: 'TA0003', tactic_name: 'Persistence', technique_id: 'T1547.001', technique_name: 'Registry Run Keys / Startup Folder' },
  { tactic_id: 'TA0003', tactic_name: 'Persistence', technique_id: 'T1543.003', technique_name: 'Windows Service' },
  { tactic_id: 'TA0004', tactic_name: 'Privilege Escalation', technique_id: 'T1068', technique_name: 'Exploitation for Privilege Escalation' },
  { tactic_id: 'TA0004', tactic_name: 'Privilege Escalation', technique_id: 'T1548.002', technique_name: 'Bypass User Account Control' },
  { tactic_id: 'TA0005', tactic_name: 'Defense Evasion', technique_id: 'T1027', technique_name: 'Obfuscated Files or Information' },
  { tactic_id: 'TA0005', tactic_name: 'Defense Evasion', technique_id: 'T1036', technique_name: 'Masquerading' },
  { tactic_id: 'TA0005', tactic_name: 'Defense Evasion', technique_id: 'T1070.004', technique_name: 'File Deletion' },
  { tactic_id: 'TA0005', tactic_name: 'Defense Evasion', technique_id: 'T1562.001', technique_name: 'Disable or Modify Tools' },
  { tactic_id: 'TA0006', tactic_name: 'Credential Access', technique_id: 'T1003.001', technique_name: 'LSASS Memory' },
  { tactic_id: 'TA0006', tactic_name: 'Credential Access', technique_id: 'T1110', technique_name: 'Brute Force' },
  { tactic_id: 'TA0006', tactic_name: 'Credential Access', technique_id: 'T1555', technique_name: 'Credentials from Password Stores' },
  { tactic_id: 'TA0007', tactic_name: 'Discovery', technique_id: 'T1082', technique_name: 'System Information Discovery' },
  { tactic_id: 'TA0007', tactic_name: 'Discovery', technique_id: 'T1087', technique_name: 'Account Discovery' },
  { tactic_id: 'TA0008', tactic_name: 'Lateral Movement', technique_id: 'T1021.001', technique_name: 'Remote Desktop Protocol' },
  { tactic_id: 'TA0008', tactic_name: 'Lateral Movement', technique_id: 'T1021.002', technique_name: 'SMB/Windows Admin Shares' },
  { tactic_id: 'TA0009', tactic_name: 'Collection', technique_id: 'T1005', technique_name: 'Data from Local System' },
  { tactic_id: 'TA0009', tactic_name: 'Collection', technique_id: 'T1560', technique_name: 'Archive Collected Data' },
  { tactic_id: 'TA0011', tactic_name: 'Command and Control', technique_id: 'T1071.001', technique_name: 'Web Protocols' },
  { tactic_id: 'TA0011', tactic_name: 'Command and Control', technique_id: 'T1071.004', technique_name: 'DNS' },
  { tactic_id: 'TA0011', tactic_name: 'Command and Control', technique_id: 'T1105', technique_name: 'Ingress Tool Transfer' },
  { tactic_id: 'TA0010', tactic_name: 'Exfiltration', technique_id: 'T1041', technique_name: 'Exfiltration Over C2 Channel' },
  { tactic_id: 'TA0040', tactic_name: 'Impact', technique_id: 'T1486', technique_name: 'Data Encrypted for Impact' },
  { tactic_id: 'TA0040', tactic_name: 'Impact', technique_id: 'T1490', technique_name: 'Inhibit System Recovery' },
];
