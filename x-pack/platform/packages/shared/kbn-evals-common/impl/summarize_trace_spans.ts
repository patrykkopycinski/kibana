/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { GetTraceResponse } from './schemas';

/** One hydrated step, in span start order. */
export type TraceSummaryStep =
  | { type: 'tool'; toolId: string }
  | { type: 'reasoning'; text: string };

/** Tool trail, narration, token totals, latency and final answer of one OTel trace. */
export interface TraceSummary {
  /** Tool names in call order, from `execute_tool` spans. */
  toolIds: string[];
  /** Tool calls interleaved with the model's narration, in span start order. */
  steps: TraceSummaryStep[];
  /** Summed over `chat *` spans; undefined when no span reported usage. */
  inputTokens?: number;
  outputTokens?: number;
  /** Root span duration in ms. */
  latencyMs?: number;
  /** Text of the last subject-model `chat` span that ended with `finish_reason: stop`; never from helper models. */
  answer?: string;
  /** Number of `chat` spans whose model matches the subject model id (0 = id mismatch). */
  subjectChatSpans?: number;
}

const EXECUTE_TOOL_PREFIX = 'execute_tool ';
const CHAT_PREFIX = 'chat ';

const toNumber = (value: unknown): number | undefined => {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : undefined;
};

/** EIS score docs say `eis-<model>-<major>-<minor>`, span names `chat <model>-<major>.<minor>`. */
const canonicalModelId = (id: string): string => id.replace(/^eis-/, '').replace(/\./g, '-');

interface OutputMessage {
  finish_reason?: unknown;
  parts?: unknown;
}

/** Concatenated non-empty text parts of the messages that ended with `finishReason`; undefined for none or bad JSON. */
const textOfMessages = (raw: unknown, finishReason: string): string | undefined => {
  if (typeof raw !== 'string') return undefined;
  let messages: unknown;
  try {
    messages = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!Array.isArray(messages)) return undefined;
  const text = (messages as OutputMessage[])
    .filter(
      (message) => message && typeof message === 'object' && message.finish_reason === finishReason
    )
    .flatMap((message) => (Array.isArray(message.parts) ? message.parts : []))
    .filter(
      (part): part is { type: 'text'; content: string } =>
        Boolean(part) &&
        part.type === 'text' &&
        typeof part.content === 'string' &&
        part.content.trim().length > 0
    )
    .map((part) => part.content)
    .join('');
  return text.length > 0 ? text : undefined;
};

/** Text of a message that finished with `stop`; undefined for tool-call turns or bad JSON. */
const finalTextOf = (raw: unknown): string | undefined => textOfMessages(raw, 'stop');

/** Narration text of a message that finished with `tool_calls`; undefined if blank or bad JSON. */
const narrationOf = (raw: unknown): string | undefined => textOfMessages(raw, 'tool_calls');

/** `undefined` for a trace with no spans, so an empty trail never reads as "no tools called". */
export const summarizeTraceSpans = (
  { spans, duration_ms: durationMs }: GetTraceResponse,
  subjectModelId?: string
): TraceSummary | undefined => {
  if (spans.length === 0) {
    return undefined;
  }
  // Spans with an unparseable start time sort first, so they never win "last stop span".
  const startOf = (span: (typeof spans)[number]): number => {
    const time = Date.parse(span.start_time);
    return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
  };
  const ordered = [...spans].sort((a, b) => {
    const [startA, startB] = [startOf(a), startOf(b)];
    return startA === startB ? 0 : startA - startB;
  });

  const toolIds: string[] = [];
  const steps: TraceSummaryStep[] = [];
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let answer: string | undefined;
  let subjectChatSpans = 0;
  const subjectCanonical = subjectModelId ? canonicalModelId(subjectModelId) : undefined;
  const isSubjectSpan = (name: string): boolean =>
    subjectCanonical !== undefined &&
    name.startsWith(CHAT_PREFIX) &&
    canonicalModelId(name.slice(CHAT_PREFIX.length)) === subjectCanonical;

  for (const span of ordered) {
    if (span.name.startsWith(EXECUTE_TOOL_PREFIX)) {
      const named = span.attributes?.['gen_ai.tool.name'];
      const toolId =
        typeof named === 'string' && named.length > 0
          ? named
          : span.name.slice(EXECUTE_TOOL_PREFIX.length);
      toolIds.push(toolId);
      steps.push({ type: 'tool', toolId });
    } else if (span.name.startsWith(CHAT_PREFIX)) {
      const input = toNumber(span.attributes?.['gen_ai.usage.input_tokens']);
      const output = toNumber(span.attributes?.['gen_ai.usage.output_tokens']);
      if (input !== undefined) inputTokens = (inputTokens ?? 0) + input;
      if (output !== undefined) outputTokens = (outputTokens ?? 0) + output;
      if (isSubjectSpan(span.name)) {
        subjectChatSpans++;
        // Spans are start-ordered, so the last subject `stop` span wins.
        const text = finalTextOf(span.attributes?.['gen_ai.output.messages']);
        if (text !== undefined) answer = text;
        const narration = narrationOf(span.attributes?.['gen_ai.output.messages']);
        if (narration !== undefined) steps.push({ type: 'reasoning', text: narration });
      }
    }
  }

  // The root is the span whose parent is outside the fetched set.
  const spanIds = new Set(spans.map((span) => span.span_id));
  const roots = spans.filter((span) => !span.parent_span_id || !spanIds.has(span.parent_span_id));
  const rootDuration =
    roots.length > 0 ? Math.max(...roots.map((root) => root.duration_ms)) : undefined;

  return {
    toolIds,
    steps,
    inputTokens,
    outputTokens,
    latencyMs: rootDuration ?? durationMs,
    ...(answer !== undefined ? { answer } : {}),
    ...(subjectModelId ? { subjectChatSpans } : {}),
  };
};
