/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export declare const LlmCoherenceEvaluationPrompt: import('@kbn/inference-common').Prompt<
  {
    conversation: string;
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
      readonly tools: {
        readonly score_coherence: {
          readonly description: 'Return coherence scores across four dimensions: topic consistency, context retention, contradiction detection, and resolution quality.';
          readonly schema: {
            readonly type: 'object';
            readonly properties: {
              readonly topic_consistency: {
                readonly type: 'number';
                readonly description: 'Score from 0 to 1 indicating how well the conversation stays on topic.';
              };
              readonly context_retention: {
                readonly type: 'number';
                readonly description: 'Score from 0 to 1 indicating how well the agent remembers and uses information from prior turns.';
              };
              readonly contradiction_score: {
                readonly type: 'number';
                readonly description: 'Score from 0 to 1 where 1 means no contradictions detected and 0 means severe contradictions.';
              };
              readonly resolution_quality: {
                readonly type: 'number';
                readonly description: "Score from 0 to 1 indicating how well the user's question is ultimately resolved.";
              };
              readonly reasoning: {
                readonly type: 'string';
                readonly description: 'Brief explanation of the scores across all dimensions.';
              };
            };
            readonly required: [
              'topic_consistency',
              'context_retention',
              'contradiction_score',
              'resolution_quality',
              'reasoning'
            ];
          };
        };
      };
    }
  ]
>;
