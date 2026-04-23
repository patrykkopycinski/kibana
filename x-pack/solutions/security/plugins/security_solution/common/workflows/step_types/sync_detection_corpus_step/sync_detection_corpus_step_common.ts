/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { StepCategory } from '@kbn/workflows';
import type { BaseStepDefinition } from '@kbn/workflows';
import { i18n } from '@kbn/i18n';

export const syncDetectionCorpusInputSchema = z.object({
  max_rules: z
    .number()
    .int()
    .positive()
    .max(1000)
    .default(500)
    .describe('Maximum enabled rules to read and sync in one run'),
  filter: z.string().optional().describe('Optional KQL filter applied to rule saved-object fields'),
});

export const syncDetectionCorpusOutputSchema = z.object({
  synced_count: z.number(),
  skipped_count: z.number(),
  errors: z.array(z.string()),
});

export const syncDetectionCorpusStepCommonDefinition: BaseStepDefinition<
  typeof syncDetectionCorpusInputSchema,
  typeof syncDetectionCorpusOutputSchema
> = {
  id: 'security.syncDetectionCorpus',
  label: i18n.translate('xpack.securitySolution.workflows.steps.syncDetectionCorpus.label', {
    defaultMessage: 'Sync Detection Corpus',
  }),
  description: i18n.translate(
    'xpack.securitySolution.workflows.steps.syncDetectionCorpus.description',
    {
      defaultMessage:
        'Sync enabled Security detection rules from Kibana into the .soc-detection-corpus index for ARGUS coverage workflows.',
    }
  ),
  category: StepCategory.Kibana,
  stability: 'tech_preview',
  inputSchema: syncDetectionCorpusInputSchema,
  outputSchema: syncDetectionCorpusOutputSchema,
  documentation: {
    details: i18n.translate(
      'xpack.securitySolution.workflows.steps.syncDetectionCorpus.documentation.details',
      {
        defaultMessage:
          'Queries alerting rule saved objects for enabled SIEM rule types, builds normalized corpus documents (metadata, severity, tags, MITRE threat, index patterns, source live_sync), and bulk-indexes them into .soc-detection-corpus. Skipped rows and bulk errors are reported in the output.',
      }
    ),
    examples: [
      `## Sync the live rule corpus
\`\`\`yaml
- name: sync_detection_corpus
  type: security.syncDetectionCorpus
  with:
    max_rules: 500
    filter: 'alert.name: *powershell*'
\`\`\``,
    ],
  },
};
