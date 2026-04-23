/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildActivityFeed, hitToEvent } from './activity_feed_builder';
import type { RawActivityHit } from './activity_feed_builder';

const telemetryHit: RawActivityHit = {
  layer: 'telemetry',
  index: '.ds-logs-endpoint.events.process-default',
  doc_id: 'ev-process-abc',
  source: {
    '@timestamp': '2026-03-14T12:00:00.000Z',
    actor_id: 'elastic-agent:endpoint-27',
    actor_trust_tier: 'trusted',
    pressure: 'moderate',
    process: { name: 'powershell -> rundll32 -> msiexec' },
    alert_id: 'alert-abc',
  },
};

const detectionHit: RawActivityHit = {
  layer: 'detection',
  index: '.soc-recommendations',
  doc_id: 'expprob-abc',
  source: {
    '@timestamp': '2026-03-14T12:00:04.200Z',
    actor_id: 'exploit-probability',
    actor_trust_tier: 'system',
    pressure: 'high',
    exploit_probability: 0.83,
    rationale: 'weighted CVSS + KEV + exposure',
    alert_id: 'alert-abc',
  },
};

const mutationHit: RawActivityHit = {
  layer: 'mutation',
  index: '.soc-mutation-intents',
  doc_id: 'mut-intent-42',
  source: {
    '@timestamp': '2026-03-14T12:00:05.500Z',
    actor_id: 'm2.5-default',
    status: 'queued_for_eval',
    rule_id: 'rule-soc-1024',
    mutation_intent_id: 'mut-intent-42',
    alert_id: 'alert-abc',
    run_id: 'run-7a3',
  },
};

const governanceHit: RawActivityHit = {
  layer: 'governance',
  index: '.soc-actor-trust-tiers',
  doc_id: 'trust-ext-001',
  source: {
    '@timestamp': '2026-03-14T13:00:01.000Z',
    actor_id: 'external-observer',
    tier: 'probationary',
    reason: 'injection flag raised',
    pressure: 'LOW',
  },
};

describe('buildActivityFeed', () => {
  it('maps raw hits to canonical events and sorts newest first', () => {
    const result = buildActivityFeed({
      hits: [telemetryHit, governanceHit, mutationHit, detectionHit],
    });

    expect(result.events.map((e) => e.id)).toEqual([
      '.soc-actor-trust-tiers:trust-ext-001',
      '.soc-mutation-intents:mut-intent-42',
      '.soc-recommendations:expprob-abc',
      '.ds-logs-endpoint.events.process-default:ev-process-abc',
    ]);
    expect(result.truncated).toBe(false);
  });

  it('normalises pressure to lowercase and drops unknown values', () => {
    const { events } = buildActivityFeed({ hits: [governanceHit] });
    expect(events[0].pressure).toBe('low');

    const { events: events2 } = buildActivityFeed({
      hits: [
        {
          ...governanceHit,
          doc_id: 'trust-ext-002',
          source: { ...governanceHit.source, pressure: 'banana' },
        },
      ],
    });
    expect(events2[0].pressure).toBeUndefined();
  });

  it('counts events per-layer before filters are applied', () => {
    const { counts_by_layer: counts, events } = buildActivityFeed({
      hits: [telemetryHit, detectionHit, mutationHit, governanceHit],
      filters: { layers: ['mutation'] },
    });
    expect(counts).toEqual({
      telemetry: 1,
      detection: 1,
      mutation: 1,
      response: 0,
      governance: 1,
    });
    expect(events.length).toBe(1);
    expect(events[0].layer).toBe('mutation');
  });

  it('dedupes hits that appear under more than one fan-out query', () => {
    const { events } = buildActivityFeed({
      hits: [mutationHit, mutationHit],
    });
    expect(events.length).toBe(1);
  });

  it('truncates to the limit and flags truncated=true', () => {
    const hits = Array.from({ length: 12 }).map<RawActivityHit>((_, i) => ({
      layer: 'mutation',
      index: '.soc-mutation-intents',
      doc_id: `mut-${i}`,
      source: {
        '@timestamp': `2026-03-14T12:00:${String(i).padStart(2, '0')}.000Z`,
        actor_id: 'm2.5-default',
        status: 'queued',
        rule_id: `rule-${i}`,
      },
    }));
    const { events, truncated } = buildActivityFeed({ hits, limit: 5 });
    expect(events.length).toBe(5);
    expect(truncated).toBe(true);
  });

  it('skips hits without a @timestamp', () => {
    const bad: RawActivityHit = {
      ...mutationHit,
      source: { ...mutationHit.source, '@timestamp': '   ' },
    };
    const { events } = buildActivityFeed({ hits: [bad] });
    expect(events.length).toBe(0);
  });
});

describe('hitToEvent per-layer title synthesis', () => {
  it('detection: surfaces exploit probability', () => {
    const ev = hitToEvent(detectionHit);
    expect(ev?.title).toBe('Exploit probability 0.83');
  });

  it('mutation: prefers explicit status over a default', () => {
    const ev = hitToEvent(mutationHit);
    expect(ev?.title).toBe('Mutation intent queued_for_eval');
  });

  it('governance: trust-tier rows use the tier name as the title', () => {
    const ev = hitToEvent(governanceHit);
    expect(ev?.title).toBe('Trust tier set to probationary');
  });

  it('defers to explicit title when the doc carries one', () => {
    const ev = hitToEvent({
      ...mutationHit,
      source: { ...mutationHit.source, title: 'Custom title wins', subtitle: 'and sub' },
    });
    expect(ev?.title).toBe('Custom title wins');
    expect(ev?.subtitle).toBe('and sub');
  });

  it('response: alert-sweeper verdicts show disposition, not "Response action — unknown"', () => {
    const ev = hitToEvent({
      layer: 'response',
      index: '.soc-outcomes',
      doc_id: 'sweep-verdict-1',
      source: {
        '@timestamp': '2026-04-22T13:29:09.200Z',
        pipeline: 'soc-alert-sweeper',
        stage: 'per_alert_verdict',
        classification: 'SUSPICIOUS',
        disposition: 'INCONCLUSIVE',
        verdict: 'inconclusive',
        rule_id: 'unknown',
        rule_name: 'unknown',
        alert_id: 'alert-abc',
      },
    });
    expect(ev?.title).toBe('Alert triage verdict: suspicious');
    expect(ev?.subtitle).toBe('INCONCLUSIVE · alert-abc');
  });

  it('response: drops placeholder "unknown" rule_id from subtitle', () => {
    const ev = hitToEvent({
      layer: 'response',
      index: '.soc-outcomes',
      doc_id: 'resp-1',
      source: {
        '@timestamp': '2026-04-22T13:29:09.200Z',
        action: 'rolled_back',
        rule_id: 'unknown',
      },
    });
    expect(ev?.title).toBe('Response action: rolled_back');
    expect(ev?.subtitle).toBeUndefined();
  });
});
