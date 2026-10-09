/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under the
 * Elastic License 2.0. Use of this file is governed by the Elastic License 2.0
 * that can be found in the licenses directory at the root of this repository.
 */

/**
 * UNSIGNED REFERENCE — INTERNAL ONLY.
 *
 * Hand-authored attack-chain reference for the Chrysalis 95-alert corpus
 * (Dhrumil's canonical `ep*alerts.ndjson` episodes, deduped to 95 alerts and
 * restored from the GCS snapshot `security-ai-datasets/attack-discovery/
 * oh-my-malware-95-deduped/2026-07-24` by the weekly persona-matrix AD suite).
 *
 * Authoring protocol (blind): every chain below was derived ONLY from the
 * committed episode alert documents (host, process ancestry, rule names,
 * command lines, registry paths) plus Dhru's episode provenance. No model
 * output from any attack-discovery run was consulted before this file was
 * frozen. `reference_status: unsigned` until expert sign-off.
 *
 * Alert ids are the deterministic ids the dedup/restore path assigns:
 * `${seedLabel}-${index}-${host}` over the deduped corpus sorted by
 * (host asc, @timestamp asc) — see `scripts/dedup_insights_alerts.mjs` in
 * @kbn/evals-suite-attack-discovery at commit 1b1006afa7bd. The assignment is
 * invariant under the live snapshot's timestamp remap (episode N -> day
 * 2026-03-(18+N)) because the remap preserves within-host order.
 */

export const CHRYSALIS_REFERENCE_STATUS = 'unsigned' as const;
export const CHRYSALIS_REFERENCE_SEED_LABEL = 'dhrumil-insights-gold-v1';
export const CHRYSALIS_REFERENCE_TOTAL_ALERTS = 95;

/** The live snapshot's alert timestamp range; window derivation below relies on it. */
export const CHRYSALIS_CORPUS_WINDOW = {
  start: '2026-03-19T00:00:00.000Z',
  end: '2026-03-27T00:00:00.000Z',
} as const;

export interface ChrysalisEpisodeWindow {
  readonly episode: number;
  readonly start: string;
  readonly end: string;
}

/**
 * Per-episode generateApi windows. The live snapshot remaps episode N onto
 * 2026-03-(18+N) (verified: corpus timestamps span 2026-03-19..26 and episodes
 * are day-disjoint), so each episode gets its own UTC day window. If a live
 * run ever reports a corpus count per window that disagrees with the episode
 * alert counts below, STOP and re-derive — do not adjust the reference.
 */
export const CHRYSALIS_EPISODE_WINDOWS: readonly ChrysalisEpisodeWindow[] = [
  { episode: 1, start: '2026-03-19T00:00:00.000Z', end: '2026-03-20T00:00:00.000Z' },
  { episode: 2, start: '2026-03-20T00:00:00.000Z', end: '2026-03-21T00:00:00.000Z' },
  { episode: 3, start: '2026-03-21T00:00:00.000Z', end: '2026-03-22T00:00:00.000Z' },
  { episode: 4, start: '2026-03-22T00:00:00.000Z', end: '2026-03-23T00:00:00.000Z' },
  { episode: 5, start: '2026-03-23T00:00:00.000Z', end: '2026-03-24T00:00:00.000Z' },
  { episode: 6, start: '2026-03-24T00:00:00.000Z', end: '2026-03-25T00:00:00.000Z' },
  { episode: 7, start: '2026-03-25T00:00:00.000Z', end: '2026-03-26T00:00:00.000Z' },
  { episode: 8, start: '2026-03-26T00:00:00.000Z', end: '2026-03-27T00:00:00.000Z' },
] as const;

export interface ChrysalisReferenceChain {
  readonly id: string;
  readonly episode: number;
  readonly host: string;
  readonly title: string;
  readonly summaryMarkdown: string;
  readonly mitreAttackTactics: readonly string[];
  readonly alertIds: readonly string[];
}

/**
 * The 9 reference chains (one per episode, two for episode 3 whose Emotet
 * activity splits into a delivery/stage-1 cluster and a payload/persistence
 * cluster with disjoint alert sets).
 */
export const CHRYSALIS_REFERENCE_CHAINS: readonly ChrysalisReferenceChain[] = [
  // Episode 1 (9 alerts) — SRVWIN01 / SRVWIN01-PRIV
  {
    id: 'ep1-excel-certutil-dropper',
    episode: 1,
    host: 'SRVWIN01',
    title:
      'Excel macro drops Q3C7N1V8.exe via certutil, persists with rundll32 and UserInitMprLogonScript',
    summaryMarkdown:
      'A malicious Excel workbook spawned certutil to decode C:\\Programdata\\B1Z8U2N9.txt into ' +
      'Q3C7N1V8.exe. The dropped payload executed from Programdata, wrote a UserInitMprLogonScript ' +
      'registry value for persistence, and launched rundll32 on cdnver.dll with unusual arguments. ' +
      'The same certutil decode chain repeated on SRVWIN01-PRIV.',
    mitreAttackTactics: ['Execution', 'Defense Evasion', 'Persistence'],
    alertIds: [
      'dhrumil-insights-gold-v1-016-SRVWIN01',
      'dhrumil-insights-gold-v1-017-SRVWIN01',
      'dhrumil-insights-gold-v1-018-SRVWIN01',
      'dhrumil-insights-gold-v1-019-SRVWIN01',
      'dhrumil-insights-gold-v1-020-SRVWIN01',
      'dhrumil-insights-gold-v1-021-SRVWIN01',
      'dhrumil-insights-gold-v1-022-SRVWIN01',
      'dhrumil-insights-gold-v1-023-SRVWIN01',
      'dhrumil-insights-gold-v1-024-SRVWIN01-PRIV',
    ],
  },
  // Episode 2 (11 alerts) — SRVWIN02 / SRVWIN02-PRIV
  {
    id: 'ep2-hash-payload-ransomware',
    episode: 2,
    host: 'SRVWIN02',
    title:
      'Hash-named executable masquerades as Defender components before Sodinokibi ransomware detection',
    summaryMarkdown:
      'A hash-named executable from the Administrator Desktop ran from explorer.exe, side-loaded ' +
      'mpsvc.dll, and executed from C:\\Windows\\MsMpEng.exe masquerading as the Defender engine. ' +
      'The same hash payload appeared via userinit on SRVWIN02-PRIV, and the chain culminated in a ' +
      'Windows.Ransomware.Sodinokibi detection on the masquerading process.',
    mitreAttackTactics: ['Execution', 'Defense Evasion', 'Impact'],
    alertIds: [
      'dhrumil-insights-gold-v1-025-SRVWIN02',
      'dhrumil-insights-gold-v1-026-SRVWIN02',
      'dhrumil-insights-gold-v1-027-SRVWIN02',
      'dhrumil-insights-gold-v1-028-SRVWIN02',
      'dhrumil-insights-gold-v1-029-SRVWIN02',
      'dhrumil-insights-gold-v1-030-SRVWIN02',
      'dhrumil-insights-gold-v1-031-SRVWIN02',
      'dhrumil-insights-gold-v1-032-SRVWIN02',
      'dhrumil-insights-gold-v1-033-SRVWIN02',
      'dhrumil-insights-gold-v1-034-SRVWIN02',
      'dhrumil-insights-gold-v1-035-SRVWIN02-PRIV',
    ],
  },
  // Episode 3 (32 alerts) — SRVWIN03 / SRVWIN03-PRIV, two clusters
  {
    id: 'ep3a-excel-regsvr32-emotet-delivery',
    episode: 3,
    host: 'SRVWIN03',
    title: 'Excel-spawned regsvr32 loads oxnv*.ooccxx and stage-1 hash DLL before Emotet payload',
    summaryMarkdown:
      'Excel spawned repeated regsvr32 executions of ..\\oxnv1-4.ooccxx (unusual arguments). A second ' +
      'stage ran a hash-named DLL bb444…​df36.dll via cmd.exe/regsvr32 on both SRVWIN03 and ' +
      'SRVWIN03-PRIV, with explorer.exe executions of the same hash payload in between.',
    mitreAttackTactics: ['Execution', 'Defense Evasion'],
    alertIds: [
      'dhrumil-insights-gold-v1-036-SRVWIN03',
      'dhrumil-insights-gold-v1-037-SRVWIN03',
      'dhrumil-insights-gold-v1-038-SRVWIN03',
      'dhrumil-insights-gold-v1-039-SRVWIN03',
      'dhrumil-insights-gold-v1-040-SRVWIN03',
      'dhrumil-insights-gold-v1-041-SRVWIN03',
      'dhrumil-insights-gold-v1-042-SRVWIN03',
      'dhrumil-insights-gold-v1-043-SRVWIN03',
      'dhrumil-insights-gold-v1-044-SRVWIN03',
      'dhrumil-insights-gold-v1-045-SRVWIN03',
      'dhrumil-insights-gold-v1-046-SRVWIN03',
      'dhrumil-insights-gold-v1-051-SRVWIN03',
      'dhrumil-insights-gold-v1-052-SRVWIN03',
      'dhrumil-insights-gold-v1-057-SRVWIN03-PRIV',
      'dhrumil-insights-gold-v1-058-SRVWIN03-PRIV',
      'dhrumil-insights-gold-v1-059-SRVWIN03-PRIV',
      'dhrumil-insights-gold-v1-060-SRVWIN03-PRIV',
      'dhrumil-insights-gold-v1-061-SRVWIN03-PRIV',
      'dhrumil-insights-gold-v1-062-SRVWIN03-PRIV',
      'dhrumil-insights-gold-v1-063-SRVWIN03-PRIV',
      'dhrumil-insights-gold-v1-064-SRVWIN03-PRIV',
      'dhrumil-insights-gold-v1-065-SRVWIN03-PRIV',
      'dhrumil-insights-gold-v1-066-SRVWIN03-PRIV',
      'dhrumil-insights-gold-v1-067-SRVWIN03-PRIV',
    ],
  },
  {
    id: 'ep3b-emotet-payload-persistence',
    episode: 3,
    host: 'SRVWIN03',
    title:
      'Emotet payloads OzwVOlaOnbXRjzj.dll / WsmpRExIFs.dll copied to System32 with Run-key persistence',
    summaryMarkdown:
      'regsvr32 children executed Windows.Trojan.Emotet payloads from System32 directories ' +
      '(TRENpvQLoAQYWTPK\\OzwVOlaOnbXRjzj.dll and RwUHliEElU\\WsmpRExIFs.dll) and wrote both payloads ' +
      'into HKLM ...\\CurrentVersion\\Run for persistence.',
    mitreAttackTactics: ['Execution', 'Persistence'],
    alertIds: [
      'dhrumil-insights-gold-v1-047-SRVWIN03',
      'dhrumil-insights-gold-v1-048-SRVWIN03',
      'dhrumil-insights-gold-v1-049-SRVWIN03',
      'dhrumil-insights-gold-v1-050-SRVWIN03',
      'dhrumil-insights-gold-v1-053-SRVWIN03',
      'dhrumil-insights-gold-v1-054-SRVWIN03',
      'dhrumil-insights-gold-v1-055-SRVWIN03',
      'dhrumil-insights-gold-v1-056-SRVWIN03',
    ],
  },
  // Episode 4 (16 alerts) — SRVWIN04 / SRVWIN04-PRIV
  {
    id: 'ep4-onenote-mshta-qbot',
    episode: 4,
    host: 'SRVWIN04',
    title:
      'OneNote attachment.hta via mshta downloads Qbot staged as 121.png, executed by rundll32 and AtBroker with Run-key persistence',
    summaryMarkdown:
      'A OneNote-exported attachment.hta was executed by mshta.exe. mshta used curl for ingress tool ' +
      'transfer of http://77.75.230.128/19825.dat saved as C:\\ProgramData\\121.png, then launched ' +
      'rundll32 on the PNG-staged DLL (unusual extension). rundll32 spawned AtBroker.exe, flagged as ' +
      'Windows.Trojan.Qbot, which persisted via a Run key (idcvmvvq) under the Administrator hive. ' +
      'The same OneNote child-process chain fired on SRVWIN04-PRIV.',
    mitreAttackTactics: ['Execution', 'Defense Evasion', 'Command And Control', 'Persistence'],
    alertIds: [
      'dhrumil-insights-gold-v1-068-SRVWIN04',
      'dhrumil-insights-gold-v1-069-SRVWIN04',
      'dhrumil-insights-gold-v1-070-SRVWIN04',
      'dhrumil-insights-gold-v1-071-SRVWIN04',
      'dhrumil-insights-gold-v1-072-SRVWIN04',
      'dhrumil-insights-gold-v1-073-SRVWIN04',
      'dhrumil-insights-gold-v1-074-SRVWIN04',
      'dhrumil-insights-gold-v1-075-SRVWIN04',
      'dhrumil-insights-gold-v1-076-SRVWIN04',
      'dhrumil-insights-gold-v1-077-SRVWIN04',
      'dhrumil-insights-gold-v1-078-SRVWIN04',
      'dhrumil-insights-gold-v1-079-SRVWIN04',
      'dhrumil-insights-gold-v1-080-SRVWIN04',
      'dhrumil-insights-gold-v1-081-SRVWIN04',
      'dhrumil-insights-gold-v1-082-SRVWIN04',
      'dhrumil-insights-gold-v1-083-SRVWIN04-PRIV',
    ],
  },
  // Episode 5 (5 alerts) — SRVNIX05 / SRVNIX05-PRIV
  {
    id: 'ep5-linux-bpfdoor',
    episode: 5,
    host: 'SRVNIX05',
    title: 'BPFDoor: unzipped payload copied to /dev/shm/kdmtmpflush and made executable',
    summaryMarkdown:
      'An interactive bash session unzipped 9415656314.zip producing a hash-named payload, which a ' +
      'sh -c chain copied to /dev/shm/kdmtmpflush with chmod 755 — the Linux.Trojan.BPFDoor pattern ' +
      'detected on every event, including the repeat unzip on SRVNIX05-PRIV.',
    mitreAttackTactics: ['Execution', 'Defense Evasion'],
    alertIds: [
      'dhrumil-insights-gold-v1-011-SRVNIX05',
      'dhrumil-insights-gold-v1-012-SRVNIX05',
      'dhrumil-insights-gold-v1-013-SRVNIX05',
      'dhrumil-insights-gold-v1-014-SRVNIX05',
      'dhrumil-insights-gold-v1-015-SRVNIX05-PRIV',
    ],
  },
  // Episode 6 (5 alerts) — SRVWIN06 / SRVWIN06-PRIV
  {
    id: 'ep6-msiexec-powershell-bumblebee',
    episode: 6,
    host: 'SRVWIN06',
    title:
      'MSI-spawned bypassed PowerShell runs chch.ps1, detected as Bumblebee with network connection',
    summaryMarkdown:
      'msiexec.exe /V spawned powershell.exe -ep bypass -file chch.ps1 from a Package Installation ' +
      'Dir temp path. The same process was detected as Windows.Trojan.Bumblebee and made a network ' +
      'connection (MsiExec service child with network). The chain repeated on SRVWIN06-PRIV.',
    mitreAttackTactics: ['Execution', 'Defense Evasion', 'Command And Control'],
    alertIds: [
      'dhrumil-insights-gold-v1-084-SRVWIN06',
      'dhrumil-insights-gold-v1-085-SRVWIN06',
      'dhrumil-insights-gold-v1-086-SRVWIN06',
      'dhrumil-insights-gold-v1-087-SRVWIN06',
      'dhrumil-insights-gold-v1-088-SRVWIN06-PRIV',
    ],
  },
  // Episode 7 (6 alerts) — SRVWIN07 / SRVWIN07-PRIV
  {
    id: 'ep7-word-vbs-scheduled-task',
    episode: 7,
    host: 'SRVWIN07',
    title:
      'Word-dropped AppPool.vbs executes via wscript, schedules itself, and runs obfuscated PowerShell',
    summaryMarkdown:
      'WINWORD.EXE wrote C:\\ProgramData\\WindowsAppPool\\AppPool.vbs and spawned wscript to execute ' +
      'it. The script launched cmd.exe to create a per-minute scheduled task re-running the same VBS, ' +
      'and executed an obfuscated PowerShell (AppPool.ps1) with -exec bypass. The same suspicious ' +
      'file creation fired on SRVWIN07-PRIV.',
    mitreAttackTactics: ['Execution', 'Persistence', 'Defense Evasion'],
    alertIds: [
      'dhrumil-insights-gold-v1-089-SRVWIN07',
      'dhrumil-insights-gold-v1-090-SRVWIN07',
      'dhrumil-insights-gold-v1-091-SRVWIN07',
      'dhrumil-insights-gold-v1-092-SRVWIN07',
      'dhrumil-insights-gold-v1-093-SRVWIN07',
      'dhrumil-insights-gold-v1-094-SRVWIN07-PRIV',
    ],
  },
  // Episode 8 (11 alerts) — SRVMAC08 / SRVMAC08-PRIV
  {
    id: 'ep8-macos-phishing-keychain',
    episode: 8,
    host: 'SRVMAC08',
    title:
      'Translocated Go app phishes credentials via osascript, chmods and runs unix1 against the login keychain',
    summaryMarkdown:
      'A translocated "My Go Application.app" (Setup.app) launched repeatedly via launchd/xpcproxy. ' +
      'It displayed an osascript credential-phishing dialog ("MacOS wants to access System Preferences"), ' +
      'chmod 777 /Users/james/unix1, executed unix1, and ran it against ' +
      '/Users/james/library/Keychains/login.keychain-db with a hardcoded password. The same app ' +
      'launches fired on SRVMAC08-PRIV.',
    mitreAttackTactics: ['Execution', 'Credential Access'],
    alertIds: [
      'dhrumil-insights-gold-v1-000-SRVMAC08',
      'dhrumil-insights-gold-v1-001-SRVMAC08',
      'dhrumil-insights-gold-v1-002-SRVMAC08',
      'dhrumil-insights-gold-v1-003-SRVMAC08',
      'dhrumil-insights-gold-v1-004-SRVMAC08',
      'dhrumil-insights-gold-v1-005-SRVMAC08',
      'dhrumil-insights-gold-v1-006-SRVMAC08',
      'dhrumil-insights-gold-v1-007-SRVMAC08',
      'dhrumil-insights-gold-v1-008-SRVMAC08-PRIV',
      'dhrumil-insights-gold-v1-009-SRVMAC08-PRIV',
      'dhrumil-insights-gold-v1-010-SRVMAC08-PRIV',
    ],
  },
] as const;
