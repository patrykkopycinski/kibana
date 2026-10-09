/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
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
 * Alert ids are the live `kibana.alert.uuid` values (the `_id` of each restored
 * alert document), which is what Attack Discovery reports as `alertIds`. They
 * were mapped mechanically from the pre-freeze labels
 * (`dhrumil-insights-gold-v1-<index>-<host>`) via each alert's
 * `kibana.alert.original_event.id`; chain membership is unchanged. See
 * `chrysalis_live_corpus_fixture.ts` for the label <-> uuid <-> timestamp map.
 */

export const CHRYSALIS_REFERENCE_STATUS = 'unsigned' as const;
export const CHRYSALIS_REFERENCE_TOTAL_ALERTS = 95;

/**
 * The restored snapshot's alert timestamp range. All 95 alerts sit within a
 * ~200 ms span (2026-03-26T22:12:18.438Z .. .641Z), so windows are
 * millisecond-precision. Attack Discovery filters `@timestamp` with gte/lte, so
 * `end` is inclusive.
 */
export const CHRYSALIS_CORPUS_WINDOW = {
  start: '2026-03-26T22:12:18.438Z',
  end: '2026-03-26T22:12:18.641Z',
} as const;

export interface ChrysalisEpisodeWindow {
  readonly episode: number;
  readonly start: string;
  readonly end: string;
}

/**
 * Per-episode generateApi windows: [first alert timestamp of the episode, first
 * alert timestamp of the next episode). Because the API's `end` is inclusive,
 * `end` is the next episode's first timestamp minus 1 ms (the last episode ends
 * at the last corpus alert). Episodes are disjoint at ms precision; the
 * per-window counts (9/11/32/16/5/5/6/11) are pinned by the test against
 * `chrysalis_live_corpus_fixture.ts`. If a live run reports a different corpus
 * count for a window, STOP and re-derive — do not adjust the reference.
 */
export const CHRYSALIS_EPISODE_WINDOWS: readonly ChrysalisEpisodeWindow[] = [
  { episode: 1, start: '2026-03-26T22:12:18.438Z', end: '2026-03-26T22:12:18.452Z' },
  { episode: 2, start: '2026-03-26T22:12:18.453Z', end: '2026-03-26T22:12:18.477Z' },
  { episode: 3, start: '2026-03-26T22:12:18.478Z', end: '2026-03-26T22:12:18.519Z' },
  { episode: 4, start: '2026-03-26T22:12:18.520Z', end: '2026-03-26T22:12:18.574Z' },
  { episode: 5, start: '2026-03-26T22:12:18.575Z', end: '2026-03-26T22:12:18.587Z' },
  { episode: 6, start: '2026-03-26T22:12:18.588Z', end: '2026-03-26T22:12:18.604Z' },
  { episode: 7, start: '2026-03-26T22:12:18.605Z', end: '2026-03-26T22:12:18.611Z' },
  { episode: 8, start: '2026-03-26T22:12:18.612Z', end: '2026-03-26T22:12:18.641Z' },
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
      '281507dd9c2fce1f29261e81848251ef72e3799a50d63d76e9b9c045e526bdb2',
      'e383b7edb31c4ca28c45d1d0402d2b5a90bcd11fcfc48dc535a0b168c7742e3a',
      'e8f4c2c4575fc5101695b67806941b5ba17124193b725a684ace98725efb31da',
      'b17058df80f39220509c789094330ade365cf1d8e8e724f3d86c7e588efc335a',
      '2ae34041e345745308afcb8b595111162729e00fc20ba337d1529162f5f5ec25',
      '8bcaff723934b823597e16fb74fd49be43efdd0d21809a1c8fca3e7c2e1bee79',
      '006e82e3da09c9239f9647b6a04662ae4bbbe40201caff2d2e1a025a36cec560',
      '1d7672091ee39c93075176850a3b34b42b6e83aae679f7c45a9657f9d96d071d',
      'd09baf44a4372afa9bf200f879aae8428cb0f1878517de18e1396db982b88ee0',
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
      'ffb44388ed1b3b09ecbedaa4e5768f4fb303a4d7966d6a45943a75dd3422caf5',
      '0fccead9087ba97834e9ba86cc2f5aeddd6c90528c4072d3999641cb6d604685',
      '33bdff40ad13ed80024152c7f030f550ef028a1383338e1629b1ff4da5ac734e',
      '0c2016648d3803a77c1e68fa99f3c5aea5716d79d4170f3a8112fd1dba527c97',
      '263a93afd9552e389bafd6341db7f75b3a957c9c5fada1f164b2df4205b1ee44',
      '4a8c157b58705d96c77ded965bebf7ef2a3f7efbb7f6e09e1e5b8ae3f755b663',
      '3dcf4934fb50f7d22ccb202c4ff162e238f4567f241c6175a52460dab1b6be37',
      'da5a76f190136a92ce4bb7375581a08c4f58f9da621632754a34f9454f1529b5',
      'ce528d9988910e033dc5c8c78c60e3a7dc24225ee6bf4000e13f028fa927de79',
      '5deae72b0a294569381672509dca7d233d60e484f06b9f186f50d02ea2a55502',
      'b52a78f97fa9942fe3398d8adbe94fef1cae4f5686ab310d73c5477c1a5cb400',
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
      'bae2756472b74d0b54170b9aac22adfb7868f283b438c7287275bea70c393f47',
      '791ac41d0ef77a228670b96861011519482a544c0011656c5916def8ec002ea5',
      '5e73375a0d0359b9ee2af268cb0450b712729770da251bceaa82bce6be8d8cd0',
      'd52da23ac1cf429e4250792cf9d9a352230aed9f715aae47b9cf9d875092200f',
      '00e22abaf8bee922df417cc68477702ebccfbdb9a090d23e4092370753ec9a99',
      '93759f679be3e693d85b7a7c7e4ded2616c172d7e379b83fa39bd406340ba871',
      'd9055ed5216030e7a191dcde5a4ebe50998bfc89388222d3fc7bfb404ec225ab',
      '97eb2b76540e83715e98d099ce40608b489a1a5996a4b64f3c829016e24268a4',
      '34be800ed036cadd0b13d3c3d4d9584a9dff683efbd29a3c7393d5144a962b5d',
      'c8ab37fa54d71f22a8c9be97694eb69a3ffd1b071a1bcb2449acb83cbf99f333',
      '9f11e46d92dc436a53b986911e08ea682d5a598028b06ac0920b27954cdf7ff7',
      '3d5757dcd014be75c94953f005b50d5c6e3dd55a4006b501e8c2ba4c2175bb45',
      'f2335d88a0f91a6a852ab22fad3afde0f4af3e1da5e95920c67a9db6e2b36a7c',
      '557e8553b9dd383b4f5d8ca800bb3e328280c085a7a9262a136860ad4e154f10',
      'bfb89ed7df8ad0cc788906df2ef834e7c277c8bdf10c1131cddf5c9531d89cc1',
      '921cd1e493dc540a983d551c282a63b45007445c07bde8d7a19b877e5c419286',
      '736f0b69b63ebcb0a9285d351e97dba17921f15a18d05c8aa7414ba1cd65562b',
      'db422290747254fbd3b7af9d4ec42e2d97982563a870c691b229edf6d58f711e',
      '222401638cb42028e9073f83bc3aaebe28a2718a5ecbe328d9eb0ccd3ffb53bb',
      '42cef895fddafa77ad1afa8cac16c73b3e37f9f02c09065eb57fce074378ac68',
      'b550b69663fee5a7e2688c3b824ffd14d23c53cc1cd3efd15af78789674075b4',
      '64474641abd2487f5d3ae47ee1ad3c863782773b8d5a757b529c8490ddb8fda7',
      '5eb97337055520195c9253a55afd84651bbef986aa0e11c3711030a74b9e4a15',
      '09b2e93a8d4962249df612600e9a6a6d4909a8c8e3c1e8e3166490b37660059e',
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
      'e0b186328dae5f61003ecac25f0e2d2841c7d74589ece6e89d4717dfecb048ba',
      '5b94cbe30f6e63384eba1aa5db2acdf5d7f5c4310dfabb1b332ba93ee3b68a82',
      'e6aa509c5c30a2b24e99ae764d0346fe2a2b2d5d1369890a886bc62eb3dbca5f',
      'ec5249f34b6375331ffbb94ac437073099b2b58091a5cf9d34439017ec5ac540',
      '24db5b3e1d255b0fd25122d8de5013e3942c6b310ce7102369ce82fb6a7f9683',
      '758fd7fdb6be8ff840e5aac8849b616a32448ec571856b4ec5bf8eb16bc13b3d',
      '265bfd7cbc72a0cc67afef59c6f6f29d00f7749a3f4a127b624abf4c0f29214c',
      '75642fcb6ef44827aaf43712d6e30b7e76f943e1157f5c909ee5a5e6c644f51e',
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
      '3a49778bafa0e154b9ec8fddcabb3817b9e158381dbd71197934f1d09d0bc12b',
      'c1c991c6d07c8187df7b3d297f4bb268b86298be278001b546798c14af6e4555',
      '13fd970173a56980ed6097887719a10cfb050ae209ae5c7d3edab43a24304b51',
      'bef2d1c42d5670b444e8d247f6493c7e361fae5754ac614a077704ceb5fce7c1',
      '722af5cd5fd9408847764b03d75a1e2df59dc5a585a81634581858dbb70fc7df',
      '863e24a4a078c480a6301d688cd0c6f70ec69bcc4aeeeae4c7d1b9402a51fcfd',
      'cf7b925718272be8983c59d0cbe90b5f3e39ef7612796907d5abd6f4ddf50252',
      'e8a7abda967392a9951c6c7747a144e5cebb413109f4cebdd2be334cd012c9ef',
      'ed6c248fa85d867ba2cbd5de12880fc0ea012cf929bbeaa5c3f586f9f30b03f4',
      'fd74157d35bd96bcb1d0443c11e68806ddc693b349b4d51c4d0ce1cef623c040',
      '578d6f08cc970540c5893a3e09f766f1d2a43db1f425b776cc3cbf89797337c0',
      '82586b519033aec0427bae93244ed9e097d7727d727e9164dbeac32dec9a4067',
      '0550313b1e9c90c77ce80327d33b72355a4d5d506284536920f7646355de9ce0',
      'e73704f2f650a63cd952d41a0caeff46eae8b81682e3b0328844e070bdc18cb2',
      'cd0011244f26e45be7f963e6d0d3113496bc0a6d78001b1385c087de817376b0',
      'efd11bb5227cf8b4269fe8f6cda4e4ecd484c65beca46aca39f8cbdd4bcc31a2',
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
      'debd0b4812abce1a3bbc5caf6b4ee570d6fcbd77dfa8aa9f288c6915121012f5',
      'd9c471da8dcfb4436c005c891b50e1673b7f62cb0c1a78e329a6cf59016802c9',
      '2b4b10f8b6c7cd37e6cabd1e21e9c6979e616fbc36264cb0a25d1ed43f84541e',
      '77dcbc0ed42e769139dfb8b4730d70f4c87da726113e2b3cb1cbd8c4761b3e0f',
      '15c9023df31f5cd6a699dead7318833260ac29e9a3e407b0b62809d380ca0dba',
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
      '45a82ba338d14fb42a366226aedcc4dfeefca079cd9bc183b2b4ce6c0d54894b',
      '85495c6adcd758bfe69ca43c90e2c6f9da97b49e7281ea63bc620d943726c970',
      'b89bcf0eb0886925659e11f9107eec7ebc091d7a67e4385309a8fdf719c6da5b',
      '04a6c459ad6f9c3698386b433869e062a57cb892bd68ec38409a4f199d0e10c7',
      '9cf327e81fb357d981aaa729d31c4c84b6187354b12f6a6bb678b1172436027e',
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
      '64072d9ebfa9b5c676ada66a7840cb869f0c564af85165cf0aeb1ec4ab0fd4f5',
      'd9c05886d39ff15ba95aba48a4347327f6d65f5617bf9b19c8e02c380b392ba1',
      '71a9cf8e9fcfb2bef0d277fe2bfaf4e2c1a3d8ff6e61093949f82d18f64cf161',
      'c13438db95de7803230dc6a90e31adc1975e96a212b4d8fc9afc95db72a7c8fc',
      '8e013e6483debed0e35898db9943a8e0937aec79e924936e0a5b2338861de2e5',
      'edf7561fe0422086d02539c8f16f6695a6f36a768a3a67c12eef3daeaa9b9102',
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
      'ef30d0bd72f23fced4f1d537b5b796de393f7b7cb7abfbfdb470b20fa5d60c4c',
      '194d358d939d9fc495fa82198c61c2704cd607eacb49502eeef76710cc2ee3ff',
      'e0d36fa064549d7ed9cffe096912ed1ebe7b08b988d843684943365e44870508',
      '010cb388989b1d9474eef546a5da9955a9a689a95c2c246cbdcf4357c04080e1',
      '994afdb2d5e037c3263bd617b5d3ef6e6cd9e46a60f63f9ef0622bac4ecccf8a',
      '6398affc9cf64ed9f31d4d3a0aa6214a9abfbc197f2679f7ab4571e40ee0a3a8',
      '4558d86a6bfedddadd6e0e5d96215dcaa6fd675cd27434f5c26198838577a000',
      'c7f2981d866d8ae31a5a72bf455581fff6f40a697b1da8bec04a5720c7c3bc3d',
      'c941327e22fe374eba7eeb57e01502a6f60bfa2caf886718f053b7e9867a2bab',
      'cf16f2219a517a8f0942bb4b4b0d574f6b0ff6a467c99a2f3fc74979b8bddf0a',
      '9d8f3a566aa4190469582e0d3c9c70e2995db63826d788539159fc0fd4943e91',
    ],
  },
] as const;
