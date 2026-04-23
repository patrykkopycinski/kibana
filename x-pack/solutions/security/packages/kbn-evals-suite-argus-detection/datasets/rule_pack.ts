/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';

/**
 * A candidate detection rule evaluated by the ARGUS Detection Eval Vertical.
 *
 * We deliberately express each rule as a raw Elasticsearch query instead of a
 * Security Solution rule type. This keeps the evaluator:
 *   - Deterministic (no dependency on Detection Engine scheduling).
 *   - Portable (the eval can run against .soc-eval-corpus-* without creating
 *     rules or alerts).
 *   - Testable (the matcher is a pure function of query + corpus).
 *
 * The Integration phase of M2.1 (issue-in-progress) will add a second path
 * that translates Security Solution rules to these queries so
 * .soc-recommendations entries can be graded end-to-end.
 */
export interface CandidateRule {
  rule_id: string;
  rule_version: string;
  name: string;
  description: string;
  query: QueryDslQueryContainer;
}

/**
 * Seed Mythos-era rule pack. Paired with the variant bank under
 * soc-simulation/scripts/argus-variant-bank/ — each variant's
 * `_argus.expected_rule_ids` names one of these rules.
 */
export const MYTHOS_DETECTION_RULES: readonly CandidateRule[] = [
  {
    rule_id: 'mythos.cred-dumping.lsass',
    rule_version: '1',
    name: 'Mythos — LSASS Credential Dumping',
    description:
      'Matches process starts for known lsass-dump tooling (procdump, rundll32+comsvcs MiniDump).',
    query: {
      bool: {
        must: [{ terms: { 'process.name': ['procdump.exe', 'rundll32.exe', 'powershell.exe'] } }],
        should: [
          { wildcard: { 'process.command_line.keyword': '*lsass*' } },
          { wildcard: { 'process.command_line.keyword': '*comsvcs.dll*MiniDump*' } },
          { wildcard: { 'process.command_line.keyword': '*MiniDump*' } },
        ],
        minimum_should_match: 1,
      },
    },
  },
  {
    rule_id: 'mythos.powershell.iex-downloader',
    rule_version: '1',
    name: 'Mythos — PowerShell IEX Downloader',
    description: 'PowerShell process invoking IEX/Invoke-Expression against a remote URL.',
    query: {
      bool: {
        must: [{ terms: { 'process.name': ['powershell.exe', 'pwsh.exe'] } }],
        should: [
          { wildcard: { 'process.command_line.keyword': '*IEX*DownloadString*' } },
          { wildcard: { 'process.command_line.keyword': '*Invoke-Expression*Invoke-RestMethod*' } },
          { wildcard: { 'process.command_line.keyword': '*IEX*Invoke-RestMethod*' } },
        ],
        minimum_should_match: 1,
      },
    },
  },
  {
    rule_id: 'mythos.powershell.encoded-cmd',
    rule_version: '1',
    name: 'Mythos — PowerShell Encoded Command',
    description: 'PowerShell process started with -EncodedCommand / -enc / -e <base64>.',
    query: {
      bool: {
        must: [{ terms: { 'process.name': ['powershell.exe', 'pwsh.exe'] } }],
        should: [
          { wildcard: { 'process.command_line.keyword': '*-enc *' } },
          { wildcard: { 'process.command_line.keyword': '*-EncodedCommand*' } },
          { wildcard: { 'process.command_line.keyword': '*-e *' } },
        ],
        minimum_should_match: 1,
      },
    },
  },
  {
    rule_id: 'mythos.dns.c2-tool',
    rule_version: '1',
    name: 'Mythos — DNS C2 via Tool Invocation',
    description:
      'nslookup/dig invocation with a deeply subdomained destination suggestive of DNS beaconing.',
    query: {
      bool: {
        must: [{ terms: { 'process.name': ['nslookup.exe', 'dig'] } }],
        should: [
          { wildcard: { 'process.command_line.keyword': '*beacon*' } },
          { wildcard: { 'process.command_line.keyword': '*c2*' } },
          { wildcard: { 'destination.domain': '*beacon*' } },
          { wildcard: { 'destination.domain': '*c2*' } },
        ],
        minimum_should_match: 1,
      },
    },
  },
];

export const MYTHOS_RULE_IDS: readonly string[] = MYTHOS_DETECTION_RULES.map((r) => r.rule_id);
