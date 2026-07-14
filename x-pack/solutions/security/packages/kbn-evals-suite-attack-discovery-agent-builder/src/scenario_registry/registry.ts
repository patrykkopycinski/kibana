/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  AD2_CLEAN_SCENARIO_KEYS,
  AD2_CLEAN_SCENARIOS,
  type Ad2CleanScenarioKey,
} from './clean_scenarios';
import {
  buildBackgroundNoiseAlerts,
  buildLoudClusterAlerts,
  getBackgroundNoiseAlertIds,
} from './background_noise';
import {
  AD2_FULL_ONLY_SCENARIO_KEYS,
  AD2_FULL_ONLY_SCENARIOS,
  type Ad2FullOnlyScenarioKey,
} from './full_scenarios';
import { AD2_SCENARIO_ID_PREFIX } from './constants';
import { buildScenarioDocuments } from './build_documents';
import type { Ad2ScenarioDefinition, Ad2SeedPlan, Ad2SeedProfile } from './types';

export const AD2_FULL_SCENARIO_KEYS = [
  ...AD2_CLEAN_SCENARIO_KEYS,
  ...AD2_FULL_ONLY_SCENARIO_KEYS,
] as const;

export type Ad2FullScenarioKey = (typeof AD2_FULL_SCENARIO_KEYS)[number];

export const listAd2ScenarioKeys = (profile: Ad2SeedProfile = 'clean'): readonly string[] => {
  if (profile === 'clean') {
    return AD2_CLEAN_SCENARIO_KEYS;
  }
  return AD2_FULL_SCENARIO_KEYS;
};

export const getAd2Scenario = (
  scenarioKey: string,
  profile: Ad2SeedProfile = 'clean'
): Ad2ScenarioDefinition | undefined => {
  if (scenarioKey in AD2_CLEAN_SCENARIOS) {
    return AD2_CLEAN_SCENARIOS[scenarioKey as Ad2CleanScenarioKey];
  }
  if (profile === 'full' && scenarioKey in AD2_FULL_ONLY_SCENARIOS) {
    return AD2_FULL_ONLY_SCENARIOS[scenarioKey as Ad2FullOnlyScenarioKey];
  }
  return undefined;
};

export const buildAd2SeedPlan = ({
  profile = 'clean',
  scenarioKey,
  baseTime = new Date(),
}: {
  profile?: Ad2SeedProfile;
  scenarioKey?: string;
  baseTime?: Date;
} = {}): Ad2SeedPlan => {
  const scenarioKeys = scenarioKey ? [scenarioKey] : listAd2ScenarioKeys(profile);
  const alerts = [];
  const rawEvents = [];

  for (const key of scenarioKeys) {
    const scenario = getAd2Scenario(key, profile);
    if (!scenario) {
      throw new Error(`Unknown AD2 scenario key "${key}" for profile "${profile}"`);
    }
    const built = buildScenarioDocuments(scenario, baseTime);
    alerts.push(...built.alerts);
    rawEvents.push(...built.rawEvents);
  }

  let noiseAlertIds: readonly string[] = [];
  if (profile === 'full' && !scenarioKey) {
    const backgroundAlerts = buildBackgroundNoiseAlerts(baseTime);
    const loudClusterAlerts = buildLoudClusterAlerts(baseTime);
    alerts.push(...backgroundAlerts, ...loudClusterAlerts);
    noiseAlertIds = [...backgroundAlerts, ...loudClusterAlerts].map((alert) => alert.id);
  }

  return { profile, scenarioKeys, alerts, rawEvents, noiseAlertIds };
};

export const getAd2ScenarioAlertIds = (scenarioKey: string): readonly string[] => {
  const scenario = getAd2Scenario(scenarioKey, 'full');
  if (!scenario) {
    return [];
  }
  return scenario.steps.map(
    (_, index) => `${AD2_SCENARIO_ID_PREFIX}${scenarioKey}-alert-${index + 1}`
  );
};
