/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parse } from 'yaml';
import type { StepHandlerContext } from '@kbn/workflows-extensions/server';
import type {
  ManagedWorkflowDefinition,
  ManagedWorkflowTemplateValues,
} from '@kbn/workflows/managed';
import {
  ALERTZERO_RULE_CREATION_WORKFLOW_ID,
  ALERTZERO_WORKER_DARK_CONTINUOUS_THREAT_HUNT_WORKFLOW_ID,
  ALERTZERO_WORKER_DETECTION_RULE_CREATION_WORKFLOW_ID,
  ALERTZERO_WORKER_DETECTION_RULE_TUNING_WORKFLOW_ID,
  ALERTZERO_WORKER_FLOOR_ALERT_TRIAGE_WORKFLOW_ID,
  ALERTZERO_WORKER_FLOOR_ATTACK_DISCOVERY_WORKFLOW_ID,
  CONTEXT_ENGINE_FEEDBACK_ANALYSIS_WORKFLOW_ID,
  EXAMPLE_MANAGED_WORKFLOW_ID,
  managedWorkflowDefinitions,
  SIGNIFICANT_EVENTS_SCHEDULED_DETECTION_WORKFLOW_ID,
  SIGNIFICANT_EVENTS_SCHEDULED_REVIEW_WORKFLOW_ID,
} from '@kbn/workflows/managed';
import { DETECTION_ENGINE_RULES_URL } from '../../../../common/constants';
import {
  CreateRuleStepId,
  createRuleInputSchema,
} from '../../../../common/workflows/step_types/create_rule_step/create_rule_step_common';
import { createRuleStepDefinition } from './create_rule_step';

/**
 * Pins the *workflow-level* contract of `security.createRule`, which is the seam between the
 * managed AlertZero workflow YAML and the step implementation. Two independent facts are pinned:
 *
 * 1. `building_block_type` is not part of the contract. It used to be defaulted to `default` on
 *    created rules; that is gone on purpose (elastic/kibana#286008). What stops an LLM from
 *    reintroducing it is the `additionalProperties: false` JSON schema of the `draft_creation`
 *    `ai.agent` step in `rule_creation.yaml` — *not* the step, whose `inputSchema` still accepts
 *    the field because it merges the detection-engine `BaseOptionalFields`. Both halves are
 *    asserted here explicitly so the residual gap is documented rather than assumed away.
 * 2. Every `with:` key of a `security.createRule` step in every managed workflow definition is a
 *    parameter the step actually accepts. A rename on either side of the seam must fail here.
 */

const esqlRule = {
  type: 'esql',
  language: 'esql',
  name: 'Suspicious PowerShell Execution',
  description: 'Detects suspicious PowerShell activity',
  query: 'FROM logs-endpoint.events.process-* | WHERE process.name == "powershell.exe"',
  severity: 'high',
  risk_score: 73,
} as StepHandlerContext<typeof createRuleInputSchema>['input']['rule'];

/**
 * Mirrors `templateRepresentativeValuesById` in `managed_workflow_definitions.test.ts`. It is
 * intentionally duplicated because that map is module-private to the registry test; that test
 * already fails when a new `yamlTemplate` definition lands without values, and the
 * 'renders every managed workflow definition' test below fails the same way, so drift is loud
 * rather than silent.
 */
const templateValuesById: Record<string, ManagedWorkflowTemplateValues | undefined> = {
  [EXAMPLE_MANAGED_WORKFLOW_ID]: {
    recipient: 'World',
  },
  [CONTEXT_ENGINE_FEEDBACK_ANALYSIS_WORKFLOW_ID]: {
    aiIndexId: 'my-ai-index',
    intervalMinutes: 1440,
  },
  [ALERTZERO_WORKER_FLOOR_ALERT_TRIAGE_WORKFLOW_ID]: {
    settingsVersion: 1,
    autonomyLevel: 'manual',
  },
  [ALERTZERO_WORKER_FLOOR_ATTACK_DISCOVERY_WORKFLOW_ID]: {
    settingsVersion: 1,
    autonomyLevel: 'manual',
    scheduleInterval: '24h',
  },
  [ALERTZERO_WORKER_DARK_CONTINUOUS_THREAT_HUNT_WORKFLOW_ID]: {
    settingsVersion: 1,
    autonomyLevel: 'manual',
  },
  [ALERTZERO_WORKER_DETECTION_RULE_TUNING_WORKFLOW_ID]: {
    settingsVersion: 1,
    autonomyLevel: 'manual',
    scheduleInterval: '2h',
  },
  [ALERTZERO_WORKER_DETECTION_RULE_CREATION_WORKFLOW_ID]: {
    settingsVersion: 1,
    autonomyLevel: 'manual',
  },
  [SIGNIFICANT_EVENTS_SCHEDULED_DETECTION_WORKFLOW_ID]: {
    detectionIntervalMinutes: 30,
    detectionBucketIntervalMinutes: 1,
    detectionLookbackMinutes: 40,
    targetCoverageMinutes: 30,
  },
  [SIGNIFICANT_EVENTS_SCHEDULED_REVIEW_WORKFLOW_ID]: {
    reviewIntervalMinutes: 10,
    discoveryBatchSize: 3,
    maxReviewPasses: 3,
    flakyRuleDetectionThreshold: 10,
    flakyRuleProbeAfterMinutes: 360,
    flakyRuleExemptSeverityScore: 80,
  },
};

/** Renders a managed definition to YAML text, whether it ships a literal `yaml` or a template. */
function renderDefinition(definition: ManagedWorkflowDefinition): string {
  const { id } = definition;
  const { yaml, yamlTemplate } = definition as { yaml?: unknown; yamlTemplate?: unknown };

  if (typeof yaml === 'string') {
    return yaml;
  }

  if (typeof yamlTemplate !== 'function') {
    throw new Error(`Managed workflow '${id}' defines neither yaml nor yamlTemplate`);
  }

  const values = templateValuesById[id];
  if (!values) {
    throw new Error(
      `Missing representative template values for managed workflow '${id}'. Add an entry to ` +
        `templateValuesById here (and to templateRepresentativeValuesById in ` +
        `managed_workflow_definitions.test.ts), otherwise '${CreateRuleStepId}' usage in this ` +
        `definition would silently escape the contract test below.`
    );
  }

  return (yamlTemplate as (values: ManagedWorkflowTemplateValues) => string)(values);
}

const renderAttempts = managedWorkflowDefinitions.map((definition) => {
  try {
    return { id: definition.id, source: renderDefinition(definition), renderError: undefined };
  } catch (error) {
    return { id: definition.id, source: undefined, renderError: error };
  }
});

interface DiscoveredCreateRuleStep {
  definitionId: string;
  stepName: string;
  withKeys: string[];
}

/** Visits every object node of a parsed YAML document, at any nesting depth. */
function walkObjects(value: unknown, visit: (node: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) {
    value.forEach((item) => walkObjects(item, visit));
    return;
  }
  if (value === null || typeof value !== 'object') {
    return;
  }
  const node = value as Record<string, unknown>;
  visit(node);
  Object.values(node).forEach((child) => walkObjects(child, visit));
}

const discoveredSteps: DiscoveredCreateRuleStep[] = renderAttempts.flatMap(({ id, source }) => {
  if (source === undefined) {
    return [];
  }

  const steps: DiscoveredCreateRuleStep[] = [];
  walkObjects(parse(source), (node) => {
    if (node.type !== CreateRuleStepId) {
      return;
    }
    const withBlock = node.with;
    steps.push({
      definitionId: id,
      stepName: typeof node.name === 'string' ? node.name : '<unnamed step>',
      withKeys: Object.keys(withBlock !== null && typeof withBlock === 'object' ? withBlock : {}),
    });
  });
  return steps;
});

const ruleCreationDefinition = managedWorkflowDefinitions.find(
  ({ id }) => id === ALERTZERO_RULE_CREATION_WORKFLOW_ID
);

if (!ruleCreationDefinition) {
  throw new Error(
    `Managed workflow '${ALERTZERO_RULE_CREATION_WORKFLOW_ID}' is not registered in managedWorkflowDefinitions`
  );
}

const ruleCreationYaml = renderDefinition(ruleCreationDefinition);
const parsedRuleCreation = parse(ruleCreationYaml) as {
  steps: Array<{ name?: string; type?: string; with?: { schema?: unknown } }>;
};
const draftCreationStep = parsedRuleCreation.steps.find(({ name }) => name === 'draft_creation');

if (!draftCreationStep?.with?.schema) {
  throw new Error(
    `Expected a 'draft_creation' step with a 'with.schema' block in '${ALERTZERO_RULE_CREATION_WORKFLOW_ID}'`
  );
}

interface JsonSchemaNode {
  additionalProperties?: unknown;
  properties?: Record<string, JsonSchemaNode>;
  required?: unknown;
}

const draftCreationSchema = draftCreationStep.with.schema as JsonSchemaNode;

/** Collects every property name declared anywhere under a JSON-schema `properties` block. */
function collectPropertyNames(properties: Record<string, JsonSchemaNode> | undefined): string[] {
  if (!properties) {
    return [];
  }

  return Object.entries(properties).flatMap(([name, subSchema]) => [
    name,
    ...collectPropertyNames(subSchema?.properties),
  ]);
}

const ruleProperties = draftCreationSchema.properties?.rule?.properties;
const propertyNames = collectPropertyNames(ruleProperties);

describe('security.createRule contract', () => {
  describe('the ai.agent schema in rule_creation.yaml forbids building_block_type', () => {
    it('ships the schema on an ai.agent step, not on some other step type', () => {
      // The structural assertions below only mean "the LLM cannot emit building_block_type" while
      // the schema stays on the ai.agent step that produces the draft. Pinning the step type keeps
      // them tied to that mechanism instead of to any step that happens to carry a `schema`.
      expect(draftCreationStep?.type).toBe('ai.agent');
    });

    it('closes both the root and the nested rule object to additional properties', () => {
      expect(draftCreationSchema.additionalProperties).toBe(false);
      expect(draftCreationSchema.properties?.rule?.additionalProperties).toBe(false);
    });

    it('declares rule properties, but never building_block_type', () => {
      // Guard against a vacuous walk: the nested properties list must be non-empty and must
      // still contain the fields the draft is built from.
      expect(propertyNames.length).toBeGreaterThan(0);
      expect(propertyNames).toEqual(
        expect.arrayContaining(['name', 'description', 'query', 'language', 'type', 'severity'])
      );
      expect(propertyNames).not.toContain('building_block_type');
    });

    it('does not mention building_block_type anywhere in the rendered YAML', () => {
      // Catches a reintroduction in a shape the structural walk above would miss (prompt text,
      // a `required` entry, a differently-cased key, a sibling block).
      expect(ruleCreationYaml).not.toContain('building_block_type');
    });
  });

  describe('the createRule step itself', () => {
    it('forwards the rule verbatim, adding only enabled: false and no building_block_type', async () => {
      const createdRule = { ...esqlRule, enabled: false, id: 'rule-1', rule_id: 'rule-uuid-1' };
      const callKibanaApi = jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        body: createdRule,
      });
      const context = {
        input: { rule: esqlRule },
        contextManager: { callKibanaApi, getFakeRequest: jest.fn() },
      } as unknown as StepHandlerContext<typeof createRuleInputSchema>;

      const result = await createRuleStepDefinition.handler(context);

      expect(callKibanaApi).toHaveBeenCalledTimes(1);
      const [{ method, path, body }] = callKibanaApi.mock.calls[0];
      expect({ method, path }).toEqual({ method: 'POST', path: DETECTION_ENGINE_RULES_URL });
      expect(body).toEqual({ ...esqlRule, enabled: false });
      expect(body).not.toHaveProperty('building_block_type');
      expect(result.output).toEqual(createdRule);
    });

    it('residual gap, asserted on purpose: the step inputSchema still ACCEPTS building_block_type', () => {
      // This is the honest half of the contract. `createRuleInputSchema` wraps
      // `RuleCreateProps`, whose shared fields merge detection-engine `BaseOptionalFields`,
      // which declares `building_block_type` — so the step neither rejects nor strips it. The
      // YAML `additionalProperties: false` schema asserted above is the only thing that stops
      // an LLM from producing it. If this assertion ever flips, the step layer started
      // rejecting the field and the note above (plus this test) is obsolete: assert rejection
      // instead of acceptance.
      const result = createRuleInputSchema.safeParse({
        rule: { ...esqlRule, building_block_type: 'default' },
      });

      expect(result.success).toBe(true);
    });
  });

  describe("every managed workflow's security.createRule `with:` block", () => {
    it('renders every managed workflow definition (no definition escapes inspection)', () => {
      const unrendered = renderAttempts
        .filter(({ renderError }) => renderError !== undefined)
        .map(({ id, renderError }) => `${id}: ${(renderError as Error).message}`);

      expect(unrendered).toEqual([]);
      expect(renderAttempts.length).toBe(managedWorkflowDefinitions.length);
    });

    it('discovers at least one security.createRule step, so the seam assertions cannot pass vacuously', () => {
      expect(discoveredSteps.length).toBeGreaterThan(0);
      expect(discoveredSteps.map(({ definitionId }) => definitionId)).toContain(
        ALERTZERO_RULE_CREATION_WORKFLOW_ID
      );
    });

    it.each(
      discoveredSteps.map((step) => [`${step.definitionId} # ${step.stepName}`, step] as const)
    )('%s passes exactly the parameters the step accepts', (_label, step) => {
      expect(new Set(step.withKeys)).toEqual(new Set(Object.keys(createRuleInputSchema.shape)));
    });
  });
});
