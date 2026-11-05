/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  ExecutionTerminatedEvent,
  TimelineEvent,
  UserMessageEvent,
} from '@kbn/agent-builder-common';
import { EventActorType, TimelineEventType } from '@kbn/agent-builder-common';
import { buildTriggerDecisionInput } from '@kbn/agent-builder-plugin/server/services/execution/auto_trigger/build_trigger_decision_input';
import { seededShuffle } from '../lib/seeded_random';

/** Synthetic shared-conversation turns. Contains no customer or production data. */
export type AgentKey = 'obs' | 'sec' | 'search' | 'default';

export interface ShouldRespondItem {
  id: string;
  category: string;
  agent: AgentKey;
  /** `[author, text]`; author `AGENT` is a reply from the agent under test. */
  history: Array<[string, string]>;
  author: string;
  text: string;
  hasAttachments?: boolean;
  label: boolean;
  /** Reasonable annotators could disagree; reported separately, excluded from headline. */
  ambiguous?: boolean;
}

export type Split = 'train' | 'test';

export interface ShouldRespondExample {
  input: { state: string };
  output: { shouldRespond: boolean };
  metadata: { id: string; category: string; agent: AgentKey; ambiguous: boolean; split: Split };
}

export const AGENT_PROFILES: Record<AgentKey, { name: string; description: string }> = {
  obs: {
    name: 'Observability Assistant',
    description: 'Investigates service health, logs, metrics, traces and SLOs',
  },
  sec: {
    name: 'Security Analyst',
    description: 'Triages security alerts, detection rules, entity risk and cases',
  },
  search: {
    name: 'Search Helper',
    description: 'Helps build and tune search relevance, mappings, analyzers and queries',
  },
  default: {
    name: 'Elastic AI Agent',
    description: 'General assistant for questions about data in Elasticsearch and Kibana',
  },
};

export const AGENT_AUTHOR = 'AGENT';
export const SPLIT_SEED = 20261105;
export const TEST_FRACTION = 0.4;
const DATASET_FILES = ['positives.json', 'negatives.json', 'borderline.json'];

export const loadShouldRespondItems = (
  dir = path.join(__dirname, 'dataset')
): ShouldRespondItem[] => {
  const items = DATASET_FILES.flatMap(
    (file) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')) as ShouldRespondItem[]
  );
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) throw new Error(`duplicate dataset id [${item.id}]`);
    if (!(item.agent in AGENT_PROFILES))
      throw new Error(`[${item.id}] unknown agent [${item.agent}]`);
    if (typeof item.label !== 'boolean') throw new Error(`[${item.id}] label must be boolean`);
    seen.add(item.id);
  }
  return items;
};

/**
 * Stratified by category + label so both splits see every kind of turn. Within each stratum
 * the order comes from a fixed seed, so the split never changes unless the data does.
 */
export const assignSplits = (
  items: readonly ShouldRespondItem[],
  { seed = SPLIT_SEED, testFraction = TEST_FRACTION } = {}
): Map<string, Split> => {
  const strata = new Map<string, ShouldRespondItem[]>();
  for (const item of [...items].sort((a, b) => a.id.localeCompare(b.id))) {
    const key = `${item.category}|${item.label}`;
    strata.set(key, [...(strata.get(key) ?? []), item]);
  }
  const splits = new Map<string, Split>();
  [...strata.keys()].sort().forEach((key, index) => {
    const shuffled = seededShuffle(strata.get(key) ?? [], seed + index);
    const testCount = Math.round(shuffled.length * testFraction);
    shuffled.forEach((item, position) =>
      splits.set(item.id, position < testCount ? 'test' : 'train')
    );
  });
  return splits;
};

const toEvents = (item: ShouldRespondItem): TimelineEvent[] =>
  item.history.map(([author, text], index): TimelineEvent => {
    const base = { id: `${item.id}-e${index}`, created_at: new Date(index * 60_000).toISOString() };
    if (author === AGENT_AUTHOR) {
      const reply: ExecutionTerminatedEvent = {
        ...base,
        actor: { type: EventActorType.agent, id: `agent-${item.agent}` },
        type: TimelineEventType.executionTerminated,
        execution_id: `${item.id}-x${index}`,
        data: {
          outcome: { type: 'responded', response: { message: text } },
          model_usage: { connector_id: 'eval', llm_calls: 1, input_tokens: 0, output_tokens: 0 },
          time_to_first_token: 0,
          time_to_last_token: 0,
        },
      };
      return reply;
    }
    const message: UserMessageEvent = {
      ...base,
      actor: { type: EventActorType.user, id: author, full_name: author },
      type: TimelineEventType.userMessage,
      data: { message: text },
    };
    return message;
  });

/** The exact text the plugin hands a decision model for this turn. */
export const toDecisionState = (item: ShouldRespondItem): string =>
  buildTriggerDecisionInput({
    events: toEvents(item),
    agent: AGENT_PROFILES[item.agent],
    message: {
      text: item.text,
      hasAttachments: item.hasAttachments ?? false,
      authorName: item.author,
    },
  });

export const loadShouldRespondExamples = (): ShouldRespondExample[] => {
  const items = loadShouldRespondItems();
  const splits = assignSplits(items);
  return items.map((item) => ({
    input: { state: toDecisionState(item) },
    output: { shouldRespond: item.label },
    metadata: {
      id: item.id,
      category: item.category,
      agent: item.agent,
      ambiguous: item.ambiguous ?? false,
      split: splits.get(item.id) ?? 'train',
    },
  }));
};
