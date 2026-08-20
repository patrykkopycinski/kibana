/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export declare const LlmCriteriaEvaluationPrompt: import('@kbn/inference-common').Prompt<
  {
    input: string;
    output: string;
    metadata?: string | undefined;
    criteria: string[];
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
        readonly function: 'score';
      };
      readonly tools: {
        readonly score: {
          readonly description: 'Return PASS, FAIL, or N/A for every evaluation criterion.';
          readonly schema: {
            readonly type: 'object';
            readonly properties: {
              readonly criteria: {
                readonly type: 'array';
                readonly items: {
                  readonly type: 'object';
                  readonly properties: {
                    readonly id: {
                      readonly type: 'string';
                      readonly description: 'The unique identifier of the criterion.';
                    };
                    readonly reason: {
                      readonly type: 'string';
                      readonly description: 'Briefly explain the reasoning behind your judgement';
                    };
                    readonly result: {
                      readonly type: 'string';
                      readonly description: 'Outcome of evaluating the criterion.';
                      readonly enum: ['PASS', 'FAIL', 'N/A'];
                    };
                  };
                  readonly required: ['id', 'result'];
                };
                readonly description: 'A verdict for every criterion.';
              };
            };
            readonly required: ['criteria'];
          };
        };
      };
    }
  ]
>;
