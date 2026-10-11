/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * The endpoint-analysis fixture slate — kanban t_7d35f4a9, implementing the t_6f302bf4 §5 design
 * on top of the option-B scorers shipped in t_46cb6525.
 *
 * SINGLE SOURCE OF TRUTH: `runtime.ts` (`seedAlertZeroEndpoint`) indexes exactly the events
 * declared here, and `verdict_reference.ts` derives its labels from the same declaration. That
 * makes one whole class of label defect impossible by construction: a `forbiddenIocs` entry can
 * no longer name a value the fixture itself seeds. It did on L2b (the benign fixture's own
 * command lines `WINWORD.EXE invoice.docx` / `C:\Windows\splwow64.exe 12288` were forbidden),
 * and the `endpoint_forensic.extract_iocs` tool types EVERY `process.command_line` it reads into
 * `malicious_commands` — so every analysis that echoed the tool as the skill instructs was
 * scored 0 on a label it could not satisfy. See `seededTelemetryTokens` and the
 * "forbidden values never name seeded telemetry" test in `verdict_reference.test.ts`.
 *
 * Labels are UNSIGNED: the Endpoint owner signs off before any number is treated as a standing
 * score. L2/L3 and L2b keep the exact process trees, labels and ids they had at commit
 * c21e2bc6, so their measurements stay comparable run-over-run; A–D are new and take the
 * derived-verdict estimate from 2 distinct scenarios to 6.
 *
 * E (t_6f302bf4 §5, optional) is NOT seeded: it would be a benign fixture whose only signal is a
 * narrow remote-scan detection, and the suite already has two benign arms (L2b, D) — a third
 * buys less than the wall time it costs.
 */

/** `process.name` values shared by several fixtures. */
export const EXPLORER = 'explorer.exe';

export interface EndpointFixtureEvent {
  /** `process.name` exactly as the endpoint records it. */
  image: string;
  /** `process.command_line`, verbatim — this is the string the extract_iocs tool will echo. */
  commandLine: string;
  /** `process.parent.name`; must match an earlier event's `image`, or be `explorer.exe`. */
  parent: string;
  /**
   * Minutes before the fixture's newest event. Declared events are in chronological order, so
   * this is strictly descending. The seeder turns it into `@timestamp`.
   */
  offsetMinutes: number;
  /**
   * Set on an event that is a connection rather than a process start. The seeder writes it to a
   * `logs-endpoint.events.network-*` data stream carrying `destination.*`, which is the field
   * the extract_iocs tool types into `ips`.
   */
  network?: { destinationIp: string; destinationDomain?: string };
}

export interface EndpointFixture {
  /** Fixture id: the reference id, the spec's `caseName` and the spec's `fixtureId`. */
  id: string;
  groundTruthVerdict: 'malicious' | 'benign';
  /** The telemetry the seeder indexes, in chronological order. */
  events: readonly EndpointFixtureEvent[];
  timeline: {
    required: readonly string[];
    forbidden: readonly string[];
    rationale: string;
  };
  iocs: {
    expected: Readonly<Record<string, readonly string[]>>;
    forbidden: readonly string[];
  };
}

/** The L2/L3 chain's encoded command, unchanged from the original fixture. */
export const SEEDED_COMMAND = 'powershell.exe -EncodedCommand SQBFAFgA';

/**
 * Fixture B's cradle: `-EncodedCommand` over the UTF-16LE form of the shadow-copy deletion it
 * then runs, so the encoded parent and the `vssadmin.exe` child describe ONE chain (compute with
 * `base64.b64encode(payload.encode('utf-16-le'))`, never by hand).
 */
export const C2_DESTINATION_IP = '203.0.113.47'; // RFC 5737 TEST-NET-3: never routable, seed-only.

const L2_L3: EndpointFixture = {
  id: 'L2/L3 malicious fixture',
  groundTruthVerdict: 'malicious',
  events: [
    {
      image: 'WINWORD.EXE',
      commandLine: 'WINWORD.EXE invoice.docm',
      parent: EXPLORER,
      offsetMinutes: 2,
    },
    {
      image: 'powershell.exe',
      commandLine: SEEDED_COMMAND,
      parent: 'WINWORD.EXE',
      offsetMinutes: 1,
    },
  ],
  timeline: {
    required: ['powershell.exe', 'invoice.docm'],
    forbidden: [],
    rationale:
      'the executed child process (powershell.exe) and the document that launched it (invoice.docm) are the defining evidence of the seeded chain; the base64 fragment SQBFAFgA and its decoded IEX are reported but not gated, because a correct answer may cite the decoded form only. `WINWORD.EXE invoice.docm` is NOT forbidden as an indicator: the macro-enabled lure is the initial-access step of the real chain and the suite already expects invoice.docm as a file_paths IoC, so forbidding its command line would punish a correct answer',
  },
  iocs: {
    expected: {
      malicious_commands: [SEEDED_COMMAND],
      file_paths: ['invoice.docm'],
    },
    forbidden: ['C:\\Windows\\splwow64.exe 12288', 'C:\\Windows\\splwow64.exe'],
  },
};

const L2B: EndpointFixture = {
  id: 'L2b benign fixture',
  groundTruthVerdict: 'benign',
  events: [
    {
      image: 'WINWORD.EXE',
      commandLine: 'WINWORD.EXE invoice.docx',
      parent: EXPLORER,
      offsetMinutes: 2,
    },
    {
      image: 'splwow64.exe',
      commandLine: 'C:\\Windows\\splwow64.exe 12288',
      parent: 'WINWORD.EXE',
      offsetMinutes: 1,
    },
  ],
  timeline: {
    required: [],
    forbidden: ['powershell.exe', 'invoice.docm'],
    rationale:
      'the benign fixture seeds WINWORD.EXE invoice.docx -> splwow64.exe (the 32-bit print spooler helper); citing the malicious chain (powershell.exe, invoice.docm) is a fabricated root cause, so those tokens are forbidden rather than merely unrequired',
  },
  iocs: {
    expected: {},
    forbidden: [
      'C:\\Windows\\splwow64.exe 12288',
      'C:\\Windows\\splwow64.exe',
      'splwow64.exe',
      'WINWORD.EXE invoice.docx',
      'invoice.docx',
    ],
  },
};

const A: EndpointFixture = {
  id: 'A malicious WMI process creation',
  groundTruthVerdict: 'malicious',
  events: [
    {
      image: 'WINWORD.EXE',
      commandLine: 'WINWORD.EXE q3_report.docm',
      parent: EXPLORER,
      offsetMinutes: 2,
    },
    {
      image: 'wmic.exe',
      commandLine: 'wmic.exe process call create "cmd.exe /c whoami"',
      parent: 'WINWORD.EXE',
      offsetMinutes: 1,
    },
  ],
  timeline: {
    required: ['wmic.exe', 'q3_report.docm'],
    forbidden: [],
    rationale:
      'the executed child (wmic.exe) and the document that launched it (q3_report.docm) are the defining evidence; the design intent of this fixture is that the reconstruction follows the spawned interpreter rather than stopping at the attachment, and the derived verdict is what punishes an attachment-only attribution — the coverage markers stay the same child+lure pair every malicious fixture uses so the column is comparable across the slate',
  },
  iocs: {
    expected: {
      malicious_commands: ['wmic.exe process call create'],
      file_paths: ['q3_report.docm'],
    },
    forbidden: ['C:\\Windows\\splwow64.exe 12288', 'C:\\Windows\\splwow64.exe'],
  },
};

const B: EndpointFixture = {
  id: 'B malicious shadow-copy destruction',
  groundTruthVerdict: 'malicious',
  events: [
    {
      image: 'WINWORD.EXE',
      commandLine: 'WINWORD.EXE Q3_invoice.docm',
      parent: EXPLORER,
      offsetMinutes: 4,
    },
    {
      image: 'powershell.exe',
      commandLine:
        'powershell.exe -EncodedCommand dgBzAHMAYQBkAG0AaQBuACAAZABlAGwAZQB0AGUAIABzAGgAYQBkAG8AdwBzACAALwBhAGwAbAAgAC8AcQB1AGkAZQB0AA==',
      parent: 'WINWORD.EXE',
      offsetMinutes: 3,
    },
    {
      image: 'vssadmin.exe',
      commandLine: 'vssadmin.exe delete shadows /all /quiet',
      parent: 'powershell.exe',
      offsetMinutes: 2,
    },
    {
      image: 'cmd.exe',
      commandLine:
        'cmd.exe /c echo Your files are encrypted. Pay 0.5 BTC to restore them. > C:\\README_RESTORE.txt',
      parent: 'powershell.exe',
      offsetMinutes: 1,
    },
  ],
  timeline: {
    required: ['vssadmin.exe', 'Q3_invoice.docm'],
    forbidden: [],
    rationale:
      'the destructive child (vssadmin.exe) and the document that started the chain (Q3_invoice.docm) are the defining evidence; the encoded PowerShell that links them is reported but not gated because its payload is base64 and a correct answer may cite the decoded form only',
  },
  iocs: {
    expected: {
      malicious_commands: ['vssadmin.exe delete shadows /all /quiet'],
      // The note is a FILENAME the reconstruction derives, not something the telemetry tool can
      // type: `endpoint_forensic.extract_iocs` returns only shas/ips/file_paths/malicious_commands/
      // affected_hosts, and says so — ransom notes are the agent's own addition. This is the
      // fixture's stated purpose (t_6f302bf4 §5).
      ransom_note: ['README_RESTORE.txt'],
    },
    forbidden: ['C:\\Windows\\splwow64.exe 12288', 'C:\\Windows\\splwow64.exe'],
  },
};

const C: EndpointFixture = {
  id: 'C malicious signed-binary C2',
  groundTruthVerdict: 'malicious',
  events: [
    {
      image: 'rundll32.exe',
      commandLine: 'rundll32.exe C:\\Users\\Public\\update.dll,DllMain',
      parent: EXPLORER,
      offsetMinutes: 3,
    },
    {
      image: 'rundll32.exe',
      commandLine: 'rundll32.exe C:\\Users\\Public\\update.dll,DllMain',
      parent: EXPLORER,
      offsetMinutes: 2,
      network: { destinationIp: C2_DESTINATION_IP, destinationDomain: 'update-svc.example.com' },
    },
  ],
  timeline: {
    required: ['rundll32.exe', 'update.dll'],
    forbidden: [],
    rationale:
      'the abused signed binary (rundll32.exe) and the module it loaded (update.dll) are the defining evidence; the C2 destination is gated through the `ips` IoC category rather than the timeline, because a correct reconstruction may describe the connection once (in the same event as the process start) instead of creating a second timeline entry',
  },
  iocs: {
    expected: {
      malicious_commands: ['rundll32.exe C:\\Users\\Public\\update.dll,DllMain'],
      ips: [C2_DESTINATION_IP],
      file_paths: ['update.dll'],
    },
    forbidden: ['C:\\Windows\\splwow64.exe 12288', 'C:\\Windows\\splwow64.exe'],
  },
};

const D: EndpointFixture = {
  id: 'D benign admin script housekeeping',
  groundTruthVerdict: 'benign',
  events: [
    {
      image: 'powershell.exe',
      commandLine: 'powershell.exe -File C:\\Ops\\inventory.ps1',
      parent: EXPLORER,
      offsetMinutes: 2,
    },
    {
      image: '7z.exe',
      commandLine: '7z.exe a C:\\Ops\\backup\\inventory-2026-09.zip C:\\Ops\\inventory.csv',
      parent: 'powershell.exe',
      offsetMinutes: 1,
    },
  ],
  timeline: {
    required: [],
    // Deliberately NOT forbidden: `powershell.exe` (this fixture legitimately runs it) and
    // `-EncodedCommand` (a correct negative reconstruction may say the script was not
    // obfuscated). What is forbidden is the destructive/abused binaries of the other fixtures,
    // none of which occur anywhere in this fixture's telemetry.
    forbidden: ['vssadmin.exe', 'wmic.exe', 'rundll32.exe'],
    rationale:
      'a clean host running a signed admin script and an archive step; naming vssadmin.exe, wmic.exe or rundll32.exe is a fabricated root cause, which is what keeps EvidenceCoverage from being vacuous on the benign side (a required coverage of 0 is satisfied by every possible answer)',
  },
  iocs: {
    expected: {},
    forbidden: [
      'powershell.exe -EncodedCommand SQBFAFgA',
      'vssadmin.exe delete shadows /all /quiet',
      'wmic.exe process call create "cmd.exe /c whoami"',
      'rundll32.exe C:\\Users\\Public\\update.dll,DllMain',
    ],
  },
};

export const ENDPOINT_FIXTURES: readonly EndpointFixture[] = [L2_L3, L2B, A, B, C, D];

export const fixtureById = (fixtureId: string): EndpointFixture => {
  const found = ENDPOINT_FIXTURES.find(({ id }) => id === fixtureId);
  if (!found) {
    throw new Error(
      `Unknown endpoint fixture '${fixtureId}'. Known ids: ${ENDPOINT_FIXTURES.map(
        ({ id }) => id
      ).join(' | ')}`
    );
  }
  return found;
};

export const normalizeToken = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Every token this fixture's own telemetry contains, normalized: each event's image and full
 * command line. A `forbiddenIocs` value drawn from this set is unsatisfiable for an analysis that
 * reports what the extract_iocs tool handed it, so `verdict_reference.test.ts` refuses it — and
 * `scoreIocsCorrect` uses the same set to say WHICH kind of forbidden hit fired, so a label
 * defect can never again hide inside an undifferentiated zero.
 */
export const seededTelemetryTokens = (fixture: EndpointFixture): readonly string[] =>
  fixture.events.flatMap((event) => [
    normalizeToken(event.image),
    normalizeToken(event.commandLine),
    ...(event.network
      ? [normalizeToken(event.network.destinationIp), normalizeToken(event.network.destinationDomain ?? '')].filter(
          Boolean
        )
      : []),
  ]);
