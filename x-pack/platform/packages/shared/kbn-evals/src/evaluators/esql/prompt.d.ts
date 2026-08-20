/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export declare const EsqlEquivalencePrompt: import('@kbn/inference-common').Prompt<
  {
    ground_truth: string;
    prediction: string;
  },
  [
    {
      readonly system: {
        readonly mustache: {
          readonly template: any;
        };
      };
      readonly template: {
        readonly mustache: {
          readonly template: any;
        };
      };
      readonly toolChoice: {
        readonly function: 'evaluate';
      };
      readonly tools: {
        readonly evaluate: {
          readonly description: 'Assess the functional equivalence of the generated ES|QL query to the gold query.';
          readonly schema: {
            readonly type: 'object';
            readonly properties: {
              readonly equivalent: {
                readonly type: 'string';
                readonly enum: ['Yes', 'No'];
                readonly description: 'Whether the generated ES|QL query is functionally equivalent to the gold query.';
              };
              readonly reason: {
                readonly type: 'string';
                readonly description: 'Briefly explain the reasoning behind your judgement.';
              };
            };
            readonly required: ['equivalent', 'reason'];
          };
        };
      };
    }
  ]
>;
