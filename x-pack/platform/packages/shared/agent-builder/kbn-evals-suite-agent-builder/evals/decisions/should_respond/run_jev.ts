/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  SHOULD_RESPOND_QUESTION,
  shouldRespondQuestions,
} from '@kbn/agent-builder-plugin/server/services/execution/auto_trigger/build_trigger_decision_input';
import type { JevClient, JevQuestion } from '../lib/jev_client';
import { createEisTransport, createJevClient, jevCostUsd, jevState } from '../lib/jev_client';
import { loadShouldRespondExamples } from './dataset';
import type { ArmPrediction, ReportItem } from './report';
import { buildShouldRespondReport, renderShouldRespondMarkdown } from './report';

/**
 * Runs the Jev arm of the should_respond eval directly against TypeSafe's API, plus the
 * always/never constants. No Kibana stack is needed. The fast-model arm runs through the
 * evals spec instead, because it needs an EIS connector.
 *
 *   JEV_ENABLED=1 JEV_ENABLED_PATHS=AB-SHOULD-RESPOND JEV_CAPTURE_DIR=<outside repo> \
 *   TYPESAFE_API_KEY=... SHOULD_RESPOND_OUT=<dir> node scripts/run_should_respond_jev.js
 */

export const SHOULD_RESPOND_PATH_ID = 'AB-SHOULD-RESPOND';

/** The plugin's predicate question in Jev's wire format (predicate -> noul). */
export const toJevQuestions = (): Record<string, JevQuestion> =>
  Object.fromEntries(
    Object.entries(shouldRespondQuestions).map(([name, question]) => {
      if (question.type !== 'predicate') {
        throw new Error(`[${name}] is a ${question.type} question; this eval expects a predicate`);
      }
      return [name, { type: 'noul', instructions: question.instructions }];
    })
  );

/**
 * Ablation arm: asks Jev to predict whether a human will answer the message, which is
 * what the IRC-derived labels measure, rather than whether the message is directed at
 * the agent (the production question).
 */
export const HUMAN_WILL_ANSWER_INSTRUCTIONS =
  'This is a shared conversation between people and an AI agent. Predict whether a person other than the author will answer the new message, judging from who is present, whether someone is already engaged with the author, and how the conversation is flowing. Answer true when a person is likely to reply to the author. Answer false when the message is likely to go unanswered by people.';

/** Ablation arm: the compound product decision, matching the IRC-derived labels. */
export const COMPOUND_INSTRUCTIONS =
  'This is a shared conversation between people and an AI agent. Decide whether the AI agent should respond to the new message. Answer true when the message asks for help or information that no person in the conversation is likely to provide, so the agent is the best respondent. Answer false when a person is already answering the author, or when the message does not ask the agent for anything.';

export const runJevArm = async (
  client: JevClient,
  examples: ReturnType<typeof loadShouldRespondExamples>,
  questions: Record<string, JevQuestion> = toJevQuestions()
): Promise<ArmPrediction[]> => {
  return Promise.all(
    examples.map(async ({ input, metadata }) => {
      const result = await client.ask(input.state, questions, metadata.id);
      const answer = result.answers[SHOULD_RESPOND_QUESTION];
      if (answer.type !== 'noul') throw new Error(`[${metadata.id}] expected a noul answer`);
      return {
        id: metadata.id,
        probability: answer.noul,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        latencyMs: result.latencyMs,
        costUsd: jevCostUsd(result.inputTokens),
        servedModel: result.model,
      };
    })
  );
};

const constantArm = (items: readonly ReportItem[], probability: number): ArmPrediction[] =>
  items.map(({ id }) => ({
    id,
    probability,
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
    costUsd: 0,
  }));

export const main = async (env: NodeJS.ProcessEnv = process.env): Promise<void> => {
  const { enabled, reason } = jevState(SHOULD_RESPOND_PATH_ID, env);
  if (!enabled) {
    throw new Error(`Jev is off (${reason}); refusing to run. No request was made.`);
  }
  const outDir = env.SHOULD_RESPOND_OUT;
  if (!outDir) throw new Error('SHOULD_RESPOND_OUT is required');

  const examples = loadShouldRespondExamples();
  const items: ReportItem[] = examples.map(({ output, metadata }) => ({
    id: metadata.id,
    label: output.shouldRespond,
    split: metadata.split,
    ambiguous: metadata.ambiguous,
  }));

  /**
   * Production question plus ablation arms, one batched request per item per arm. When
   * `JEV_EIS_URL` is set, the production question also runs through the plugin's EIS route
   * (`POST /_inference/decision/<id>`) so direct-API and production-path scores can differ
   * only by route. The EIS auth header comes from the caller's env, never this file.
   */
  const questionSets: Array<{ key: string; questions: Record<string, JevQuestion> }> = [
    { key: 'jev (production shouldRespondQuestions)', questions: toJevQuestions() },
    {
      key: 'jev (human-will-answer framing)',
      questions: {
        [SHOULD_RESPOND_QUESTION]: {
          type: 'noul',
          instructions: HUMAN_WILL_ANSWER_INSTRUCTIONS,
        },
      },
    },
    {
      key: 'jev (compound product framing)',
      questions: {
        [SHOULD_RESPOND_QUESTION]: {
          type: 'noul',
          instructions: COMPOUND_INSTRUCTIONS,
        },
      },
    },
  ];

  const eisUrl = env.JEV_EIS_URL;
  const eisAuth = env.JEV_EIS_AUTH_HEADER;
  const directClient = createJevClient({ pathId: SHOULD_RESPOND_PATH_ID, env });
  const eisConfigured = Boolean(eisUrl && eisAuth);
  // The direct API needs its own credential; an EIS-only run (no personal key) skips the
  // direct arms instead of failing, but with neither route configured the run fails closed.
  const directArms = env.TYPESAFE_API_KEY
    ? questionSets.map(({ key, questions }) => ({ key, questions, client: directClient }))
    : [];
  if (directArms.length === 0 && !eisConfigured) {
    throw new Error(
      'No Jev route is configured: set TYPESAFE_API_KEY for the direct API, or JEV_EIS_URL ' +
        'and JEV_EIS_AUTH_HEADER for the EIS decision route. No request was made.'
    );
  }

  const started = new Date();
  const armPredictions: Record<string, ArmPrediction[]> = {
    'always-respond': constantArm(items, 1),
    'never-respond': constantArm(items, 0),
  };
  for (const { key, questions, client } of directArms) {
    armPredictions[key] = await runJevArm(client, examples, questions);
  }
  if (eisConfigured) {
    const eisClient = createJevClient({
      pathId: SHOULD_RESPOND_PATH_ID,
      env,
      model: env.JEV_EIS_INFERENCE_ID ?? '.typesafe-jev-1.13_decision',
      transport: createEisTransport({
        url: eisUrl as string,
        inferenceId: env.JEV_EIS_INFERENCE_ID ?? '.typesafe-jev-1.13_decision',
        authHeaders: { Authorization: eisAuth as string },
      }),
    });
    armPredictions['jev via EIS (production route)'] = await runJevArm(
      eisClient,
      examples,
      toJevQuestions()
    );
  }
  const report = buildShouldRespondReport(items, armPredictions);
  // Constant arms never made a request; only arms that actually called a model report one.
  const servedModels = [
    ...new Set(
      Object.values(armPredictions)
        .flatMap((predictions) => predictions.map((p) => p.servedModel))
        .filter((m): m is string => Boolean(m))
    ),
  ];

  fs.mkdirSync(outDir, { recursive: true });
  const stamp = started.toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(
    path.join(outDir, `should_respond_predictions_${stamp}.json`),
    JSON.stringify({ items, armPredictions }, null, 2)
  );
  fs.writeFileSync(
    path.join(outDir, `should_respond_report_${stamp}.json`),
    JSON.stringify(report, null, 2)
  );
  const markdown = renderShouldRespondMarkdown(report, {
    title: `Agent Builder auto-trigger: should_respond (Jev${
      eisConfigured ? ', EIS production route' : ' direct API'
    })`,
    provenance: [
      `run started ${started.toISOString()}, ${examples.length} items, 1 repetition`,
      `served ${servedModels.join(', ')}${
        directArms.length > 0
          ? `, via TypeSafe direct API${
              eisConfigured ? ' plus the EIS decision inference route' : ''
            }`
          : ', via the EIS decision inference route (direct arms skipped: no separate credential)'
      }`,
      'input built by the production buildTriggerDecisionInput; the Jev arms that ran share it: ' +
        'the production shouldRespondQuestions, a human-will-answer framing, and a compound ' +
        'product framing',
      `dataset: ${
        env.SHOULD_RESPOND_DATASET
          ? `external [${env.SHOULD_RESPOND_DATASET}] (unauthored)`
          : 'built-in synthetic'
      }; noise band for Jev run-to-run is about +/-0.05, re-run before trusting small deltas`,
    ],
  });
  fs.writeFileSync(path.join(outDir, `should_respond_report_${stamp}.md`), markdown);
  process.stdout.write(`${markdown}\n`);
};
