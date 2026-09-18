/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Helpers for counting narrative claims in an Agent Builder converse response
 * without counting substring hits inside tool outputs (ES|QL result payloads
 * can contain hundreds of incidental matches).
 */

interface ResponseStepLike {
  type?: string;
  output?: unknown;
  message?: unknown;
}

interface ResponseLike {
  steps?: ResponseStepLike[];
  output?: unknown;
  message?: unknown;
}

function textFromUnknown(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const content = (value as { content?: unknown }).content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((part) =>
          part && typeof part === 'object' ? String((part as { text?: unknown }).text ?? '') : ''
        )
        .join('\n');
    }
  }
  return '';
}

/**
 * Extracts only the model's own message text from a converse response:
 * assistant narrative steps and the final output — never tool outputs.
 */
export function getNarrativeText(response: ResponseLike): string {
  const parts: string[] = [];
  for (const step of response.steps ?? []) {
    // Assistant-authored steps only; tool result steps carry raw payloads.
    if (step.type === 'llm' || step.type === 'agent_message' || step.type === 'output_text') {
      parts.push(textFromUnknown(step.output) + textFromUnknown(step.message));
    }
  }
  parts.push(textFromUnknown(response.output) + textFromUnknown(response.message));
  return parts.join('\n');
}

/**
 * Splits narrative text into claim units: lines, then sentences within a line.
 * A heading on its own line is one unit; a bulleted finding is one unit.
 */
function claimUnits(text: string): string[] {
  return text
    .split(/\r?\n/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((unit) => unit.trim())
    .filter((unit) => unit.length > 0);
}

/**
 * Counts distinct claims rather than distinct word forms.
 *
 * Deduplicating matches by lexical form measures the model's vocabulary, not
 * the events it reported: three stages each reported "corroborated" in their
 * own bullet score 1, while a single claim phrased "corroborated …
 * corroborating … corroboration" scores 3. So each claim unit (line or
 * sentence) is counted once, with the matched verb form replaced by
 * `canonical` — that collapses one claim's vocabulary while keeping separate
 * claims separate.
 *
 * @param pattern claim pattern, e.g. the corroboration verb forms
 * @param canonical replacement for every match, e.g. the base verb
 */
export function countDistinctClaimUnits(text: string, pattern: RegExp, canonical: string): number {
  const matcher = new RegExp(pattern.source, pattern.flags.replace(/g/g, ''));
  const replacer = new RegExp(pattern.source, `${pattern.flags.replace(/g/g, '')}g`);

  const claims = claimUnits(text)
    .filter((unit) => matcher.test(unit))
    .map((unit) => unit.replace(replacer, canonical).toLowerCase().replace(/\s+/g, ' '));

  return new Set(claims).size;
}
