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

import type { AttackDiscoveryDatasetExample } from '@kbn/evals-suite-attack-discovery/src/types';
import {
  CHRYSALIS_EPISODE_WINDOWS,
  CHRYSALIS_REFERENCE_CHAINS,
  CHRYSALIS_CORPUS_WINDOW,
} from './chrysalis_reference';

/**
 * generateApi examples for the Chrysalis kill-chains suite.
 *
 * UNSIGNED REFERENCE — INTERNAL ONLY.
 *
 * Eight per-episode examples (each with its own start/end window so the
 * `_generate` call sees exactly that episode's alerts) plus one full-corpus
 * example over the whole 95-alert window. No `bundledAlerts` padding and no
 * mixed input modes: every example is `generateApi`.
 *
 * Windows derive from the live GCS snapshot's day-based episode remap
 * (episode N -> 2026-03-(18+N)); see chrysalis_reference.ts.
 */
export const buildChrysalisGenerateApiExamples = (
  connectorId: string
): {
  perEpisode: AttackDiscoveryDatasetExample[];
  fullCorpus: AttackDiscoveryDatasetExample;
} => {
  const chainsForEpisode = (episode: number) =>
    CHRYSALIS_REFERENCE_CHAINS.filter((c) => c.episode === episode);

  const toDiscoveries = (episode: number) =>
    chainsForEpisode(episode).map((c) => ({
      title: c.title,
      summaryMarkdown: c.summaryMarkdown,
      detailsMarkdown: c.summaryMarkdown,
      alertIds: [...c.alertIds],
      mitreAttackTactics: [...c.mitreAttackTactics],
    }));

  const perEpisode = CHRYSALIS_EPISODE_WINDOWS.map(({ episode, start, end }) => ({
    input: {
      mode: 'generateApi' as const,
      connectorId,
      alertsIndexPattern: '.alerts-security.alerts-default',
      size: 100,
      start,
      end,
    },
    output: { attackDiscoveries: toDiscoveries(episode) },
    metadata: {
      Title: `Chrysalis kill-chains episode ${episode} (generateApi, unsigned reference)`,
      episode,
      reference_status: 'unsigned',
    },
  }));

  const fullCorpus = {
    input: {
      mode: 'generateApi' as const,
      connectorId,
      alertsIndexPattern: '.alerts-security.alerts-default',
      size: 100,
      ...CHRYSALIS_CORPUS_WINDOW,
    },
    output: {
      attackDiscoveries: CHRYSALIS_REFERENCE_CHAINS.map((c) => ({
        title: c.title,
        summaryMarkdown: c.summaryMarkdown,
        detailsMarkdown: c.summaryMarkdown,
        alertIds: [...c.alertIds],
        mitreAttackTactics: [...c.mitreAttackTactics],
      })),
    },
    metadata: {
      Title: 'Chrysalis kill-chains full corpus 95 alerts (generateApi, unsigned reference)',
      episode: 'all',
      reference_status: 'unsigned',
    },
  };

  return { perEpisode, fullCorpus };
};
