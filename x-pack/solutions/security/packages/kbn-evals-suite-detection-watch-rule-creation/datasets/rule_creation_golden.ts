/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Golden dataset for the Rule Creation Worker eval.
 *
 * Each entry maps the four trigger inputs of rule_creation.yaml
 * (technique, gap_description, evidence, confidence) to expected
 * evaluator ground truth.
 *
 * Rules:
 *   - One case per required scenario family.
 *   - The broken fixture (isBrokenFixture: true) is required and must
 *     score 0 on at least one quality evaluator. Do not remove it.
 *   - Reference esqlQuery values are sourced from elastic/detection-rules.
 */

export interface RuleCreationExample {
  id: string;
  input: {
    technique: string;
    gap_description: string;
    evidence: string;
    confidence: number;
  };
  output: {
    /**
     * Techniques the agent MUST tag. Drives MITRE Accuracy recall.
     *
     * Keep this to the technique named in `input.technique` plus its parent. Anything the prompt
     * does not ask for belongs in `optionalMitreIds` — see the note there.
     */
    mitreIds: string[];
    /**
     * Related techniques that are CREDITED but never REQUIRED.
     *
     * WHY (measured 2026-08-12): every example asks the agent to close exactly one gap
     * (`input.technique`), but MITRE Accuracy graded F1 against up to 5 techniques, several of
     * which the prompt never mentions — `hard-t1609` asked for T1609 and also graded T1611, T1059
     * and T1053. Those are unguessable from the input, so recall was capped by dataset
     * construction rather than agent quality: a PERFECTLY precise answer scored a mean F1 of only
     * 0.71, and as low as 0.40. The two examples with no unrequested techniques
     * (`gap-t1078-001`, `hard-t1562-008`) were exactly the two scoring 1.00.
     *
     * Listing a technique here means "correct to include, not wrong to omit": it cannot lower the
     * score, so a sound rule is not punished for declining to enumerate tangential techniques.
     */
    optionalMitreIds?: string[];
    language: 'esql';
    esqlQuery?: string;
    isBrokenFixture?: boolean;
  };
}

export const goldenDataset: RuleCreationExample[] = [
  // Case 1 — T1078.001 (Valid Accounts: Default Accounts), Linux
  // Gap: no coverage for default credential abuse on Linux hosts.
  // Sourced from: elastic/detection-rules — linux/credential_access_default_creds_linux.toml
  {
    id: 'gap-t1078-001-linux-default-creds',
    input: {
      technique: 'T1078.001',
      gap_description:
        'No rule covering attempts to authenticate using known default credentials on Linux hosts. ' +
        'Existing T1078 rules cover Windows only.',
      evidence:
        'Threat hunt found repeated su and sudo failures with usernames "admin", "root", and ' +
        '"administrator" across 3 Linux endpoints over 7 days.',
      confidence: 0.85,
    },
    output: {
      mitreIds: ['T1078', 'T1078.001'],
      language: 'esql',
      esqlQuery: `FROM logs-endpoint.events.process-*
| WHERE host.os.type == "linux"
  AND event.type == "start"
  AND process.name IN ("su", "sudo")
  AND user.name IN ("root", "admin", "administrator", "guest")
| STATS attempt_count = COUNT(*) BY host.name, user.name, process.name
| WHERE attempt_count > 5`,
    },
  },

  // Case 2 — T1548.002 (Abuse Elevation Control Mechanism: Bypass User Account Control), Windows
  // Gap: UAC bypass via MMC snap-in hijack not covered.
  // Sourced from: elastic/detection-rules — windows/privilege_escalation_uac_bypass_winfw_mmc_hijack.toml
  {
    id: 'gap-t1548-002-uac-bypass-mmc',
    input: {
      technique: 'T1548.002',
      gap_description:
        'No rule for UAC bypass via Windows Firewall MMC snap-in hijack. ' +
        'Attackers use this to elevate privileges without a UAC prompt.',
      evidence:
        'Red team exercise reproduced the technique: mmc.exe spawning unexpected child processes ' +
        'when launched with WF.msc argument on Windows hosts.',
      confidence: 0.9,
    },
    output: {
      mitreIds: ['T1548', 'T1548.002'],
      optionalMitreIds: ['T1218'],
      language: 'esql',
      esqlQuery: `FROM logs-endpoint.events.process-*
| WHERE host.os.type == "windows"
  AND event.type == "start"
  AND process.parent.name == "mmc.exe"
  AND process.parent.args == "WF.msc"
  AND process.name != "WerFault.exe"`,
    },
  },

  // Case 3 — T1027 / T1059.001 (PowerShell obfuscation via numeric encoding), Windows
  // Gap: no coverage for high numeric density in PowerShell script blocks.
  // Sourced from: elastic/detection-rules — windows/defense_evasion_posh_obfuscation_high_number_proportion.toml
  {
    id: 'gap-t1027-powershell-numeric-obfuscation',
    input: {
      technique: 'T1027',
      gap_description:
        'No rule detecting PowerShell scripts with unusually high numeric character density, ' +
        'a common obfuscation pattern for byte-array or char-code payload reconstruction.',
      evidence:
        'Hunting query on powershell_operational logs found 12 script blocks over 30 days with ' +
        '>50% numeric character ratio that bypassed existing signature rules.',
      confidence: 0.75,
    },
    output: {
      mitreIds: ['T1027'],
      optionalMitreIds: ['T1140', 'T1059.001'],
      language: 'esql',
      esqlQuery: `FROM logs-windows.powershell_operational*
| WHERE event.code == "4104"
| EVAL script_len = LENGTH(powershell.file.script_block_text)
| WHERE script_len > 1000
| EVAL numeric_ratio = (script_len - LENGTH(REPLACE(powershell.file.script_block_text, "0123456789", "")))::double / script_len::double
| WHERE numeric_ratio > 0.5`,
    },
  },

  // NEGATIVE CONTROL — required. A sparse, vague gap with no evidence, where the correct
  // behaviour is a narrowly-scoped rule and the tempting failure is a catch-all. Do not remove:
  // a dataset where every example is well-specified never exercises the quality gate.
  //
  // Note this fixture cannot *guarantee* a failing score — the model is free to do the right
  // thing here, and should. The property it depends on (a bare-wildcard FROM scores 0) is
  // asserted deterministically in src/helpers.test.ts; this entry measures whether the worker
  // degrades gracefully on thin input.
  {
    id: 'broken-fixture-catch-all-query',
    input: {
      technique: 'T1059',
      gap_description: 'Any command execution activity',
      evidence: '',
      confidence: 0.1,
    },
    output: {
      mitreIds: ['T1059'],
      language: 'esql',
      esqlQuery: 'FROM * | LIMIT 1000', // the catch-all this input tempts, kept as documentation
      isBrokenFixture: true,
    },
  },
];
