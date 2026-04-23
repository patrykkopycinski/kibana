/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Shared input/output schemas that every ARGUS skill is projected through
 * on the external surface. These are stored as JSON Schema fragments (not
 * zod) so the MCP SDK and any A2A client can consume them directly without
 * a runtime conversion.
 *
 * The scaffold defines them once here; both the MCP and A2A projections
 * reference the same constants so they can't drift apart.
 */

export const ARGUS_SKILL_INPUT_SCHEMA: Readonly<Record<string, unknown>> = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['task'],
  properties: {
    task: {
      type: 'string',
      minLength: 1,
      maxLength: 4000,
      description:
        'Free-text description of what the caller wants the ARGUS skill to do. Always interpreted as untrusted input.',
    },
    scope: {
      type: 'object',
      additionalProperties: false,
      properties: {
        tenant_id: { type: 'string' },
        space_id: { type: 'string' },
        entity_ids: {
          type: 'array',
          maxItems: 50,
          items: { type: 'string' },
        },
        time_window: {
          type: 'string',
          pattern: '^(now-)?\\d+[smhd]$',
        },
      },
    },
    propose_only: {
      type: 'boolean',
      default: false,
      description:
        'When true, any mutation_intent emitted by the skill is forced to pending_review regardless of the principal profile. How the `advisory` profile is enforced server-side.',
    },
    correlation_id: {
      type: 'string',
      description: 'Single identifier threaded across MCP/A2A → reasoning trace → recommendation.',
    },
  },
});

export const ARGUS_SKILL_OUTPUT_SCHEMA: Readonly<Record<string, unknown>> = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['skill_id', 'summary', 'structured_output', 'trace', 'mutation_intents'],
  properties: {
    skill_id: { type: 'string' },
    summary: { type: 'string' },
    structured_output: {
      type: 'object',
      additionalProperties: true,
    },
    trace: {
      type: 'object',
      additionalProperties: false,
      required: ['reasoning_trace_id', 'gen_ai_operation'],
      properties: {
        reasoning_trace_id: { type: 'string' },
        gen_ai_operation: { type: 'string' },
      },
    },
    mutation_intents: {
      type: 'array',
      default: [],
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['intent_id', 'door_class', 'blast_tier', 'status'],
        properties: {
          intent_id: { type: 'string' },
          door_class: { type: 'string', enum: ['one_way', 'two_way'] },
          blast_tier: { type: 'string', enum: ['small', 'medium', 'large', 'critical'] },
          status: {
            type: 'string',
            enum: ['proposed', 'auto_apply_ready', 'pending_review', 'applied', 'rejected'],
          },
        },
      },
    },
  },
});
