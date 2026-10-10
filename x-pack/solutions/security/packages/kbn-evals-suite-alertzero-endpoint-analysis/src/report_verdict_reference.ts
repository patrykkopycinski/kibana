/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { randomUUID } from 'crypto';

import type { EvalsExecutorClient } from '@kbn/evals';
import { DERIVED_VERDICT_RULE } from './verdict_derivation';
import { scoreVerdictReference, verdictEvaluators } from './verdict_scorers';

interface Logger {
  info: (message: string) => void;
}

/**
 * Reports the four derived-verdict scores (option B) for one analysed observation through
 * the eval executor, mirroring `reportActionSafety`: one experiment per observation, keyed
 * by a fresh observation id so duplicate executor repetitions of the same output stay
 * attributable to ONE analysis and can be collapsed rather than counted as independent.
 *
 * Never throws on a wrong answer: an accurate low score is a result, not a failure. It DOES
 * throw on a schema mismatch or an unknown/unseeded fixture, before reporting anything.
 *
 * `scoringArm` names the KI-annotation condition the observation ran under, so the leak
 * control arm can never be pooled with the measurement arm.
 */
export const reportVerdictReference = async ({
  executorClient,
  log,
  caseName,
  fixtureId,
  scoringArm,
  structuredOutput,
}: {
  executorClient: EvalsExecutorClient;
  log: Logger;
  caseName: string;
  fixtureId: string;
  scoringArm: 'measurement' | 'leak-control-inverted-reason';
  structuredOutput: unknown;
}) => {
  const scores = scoreVerdictReference(structuredOutput, fixtureId);
  log.info(
    `DerivedVerdict(option B) [${scoringArm}] ${caseName}: ${Object.entries(scores)
      .map(([name, { score, label }]) => `${name}=${score}(${label})`)
      .join(' ')}`
  );
  const observationId = randomUUID();
  await executorClient.runExperiment(
    {
      name: `alertzero-endpoint-analysis-derived-verdict: ${caseName} [${scoringArm}] (${observationId})`,
      datasets: [
        {
          name: `alertzero-endpoint-analysis-derived-verdict: ${caseName} [${scoringArm}]`,
          description: `Derived forensic verdict (option B, eval interpretation; not a worker-stated verdict). Rule: ${DERIVED_VERDICT_RULE}`,
          examples: [
            {
              input: { caseName, observationId, scoringArm },
              output: { fixtureId },
              metadata: null,
            },
          ],
        },
      ],
      task: async () => structuredOutput,
    },
    verdictEvaluators
  );
  return scores;
};
