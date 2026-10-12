/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import Path from 'path';
import { createPlaywrightEvalsConfig } from '@kbn/evals';

/**
 * Dedicated config for the endpoint-forensic-analysis routing-collision A/B.
 *
 * It is a separate config (rather than another spec under `playwright.config.ts`) because the eval
 * needs a stack where `endpointForensicAnalysisSkill` is ENABLED: registering a skill is a runtime
 * server arg, and the `evals_agent_builder` set that the main suite uses leaves the skill dark. The
 * main config excludes this directory, because in a dark stack the skill is absent from the catalog
 * and every `az-owns` example would fail for a reason unrelated to routing.
 *
 * Both arms carry their own registry entry so the pair is labelled in the pipeline:
 *   agent-builder-collision-baseline          -> serverConfigSet evals_agent_builder
 *   agent-builder-collision-endpoint-forensic -> serverConfigSet evals_agent_builder_endpoint_forensic
 */
export default createPlaywrightEvalsConfig({
  testDir: Path.resolve(__dirname, './evals/security/endpoint_forensic_analysis_collision'),
  repetitions: 1,
  timeout: 60 * 60_000, // one spec, 13 examples - an hour is generous; raise via EVAL_REPETITIONS
  workers: 1,
});
