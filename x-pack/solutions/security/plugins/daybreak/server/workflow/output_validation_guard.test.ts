/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { validateReasonOutput, WorkflowHaltError } from './output_validation_guard';

const VALID_OUTPUT = {
  message: 'Triage complete',
  structured_output: {
    verdict: 'true_positive',
    confidence: 0.92,
    rationale: 'The alert matches known C2 beaconing patterns.',
  },
};

describe('validateReasonOutput (FR-015, FR-016)', () => {
  describe('valid input', () => {
    it('returns the validated structured output when all fields are present', () => {
      const result = validateReasonOutput(VALID_OUTPUT);

      expect(result).toEqual({
        verdict: 'true_positive',
        confidence: 0.92,
        rationale: 'The alert matches known C2 beaconing patterns.',
      });
    });

    it('ignores extra fields on the output envelope and structured_output', () => {
      const result = validateReasonOutput({
        ...VALID_OUTPUT,
        conversation_id: 'conv-1',
        metadata: { usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
        structured_output: {
          ...VALID_OUTPUT.structured_output,
          extra: 'ignored',
        },
      });

      expect(result).toEqual(VALID_OUTPUT.structured_output);
    });
  });

  describe('throws WorkflowHaltError on null/undefined output', () => {
    it('throws when output is null', () => {
      expect(() => validateReasonOutput(null)).toThrow(WorkflowHaltError);
    });

    it('throws when output is undefined', () => {
      expect(() => validateReasonOutput(undefined)).toThrow(WorkflowHaltError);
    });
  });

  describe('throws WorkflowHaltError on non-object output', () => {
    it('throws when output is a string', () => {
      expect(() => validateReasonOutput('not an object')).toThrow(WorkflowHaltError);
    });

    it('throws when output is a number', () => {
      expect(() => validateReasonOutput(42)).toThrow(WorkflowHaltError);
    });
  });

  describe('throws WorkflowHaltError on missing structured_output (FR-016)', () => {
    it('throws when structured_output is absent', () => {
      expect(() => validateReasonOutput({ message: 'no structured output' })).toThrow(
        WorkflowHaltError
      );
    });

    it('throws when structured_output is null', () => {
      expect(() => validateReasonOutput({ message: '', structured_output: null })).toThrow(
        WorkflowHaltError
      );
    });

    it('throws when structured_output is an empty object', () => {
      expect(() => validateReasonOutput({ structured_output: {} })).toThrow(WorkflowHaltError);
    });

    it('throws when structured_output is an array (malformed)', () => {
      expect(() => validateReasonOutput({ structured_output: [{ verdict: 'x' }] })).toThrow(
        WorkflowHaltError
      );
    });
  });

  describe('throws WorkflowHaltError on malformed verdict (FR-016)', () => {
    it('throws when verdict is missing', () => {
      expect(() =>
        validateReasonOutput({
          structured_output: { confidence: 0.5, rationale: 'some rationale' },
        })
      ).toThrow(WorkflowHaltError);
    });

    it('throws when verdict is an empty string', () => {
      expect(() =>
        validateReasonOutput({
          structured_output: { verdict: '', confidence: 0.5, rationale: 'r' },
        })
      ).toThrow(WorkflowHaltError);
    });

    it('throws when verdict is whitespace-only', () => {
      expect(() =>
        validateReasonOutput({
          structured_output: { verdict: '   ', confidence: 0.5, rationale: 'r' },
        })
      ).toThrow(WorkflowHaltError);
    });

    it('throws when verdict is a non-string', () => {
      expect(() =>
        validateReasonOutput({
          structured_output: { verdict: 123, confidence: 0.5, rationale: 'r' },
        })
      ).toThrow(WorkflowHaltError);
    });
  });

  describe('throws WorkflowHaltError on malformed confidence (FR-016)', () => {
    it('throws when confidence is missing', () => {
      expect(() =>
        validateReasonOutput({
          structured_output: { verdict: 'v', rationale: 'r' },
        })
      ).toThrow(WorkflowHaltError);
    });

    it('throws when confidence is NaN', () => {
      expect(() =>
        validateReasonOutput({
          structured_output: { verdict: 'v', confidence: NaN, rationale: 'r' },
        })
      ).toThrow(WorkflowHaltError);
    });

    it('throws when confidence is Infinity', () => {
      expect(() =>
        validateReasonOutput({
          structured_output: { verdict: 'v', confidence: Infinity, rationale: 'r' },
        })
      ).toThrow(WorkflowHaltError);
    });

    it('throws when confidence is a non-number', () => {
      expect(() =>
        validateReasonOutput({
          structured_output: { verdict: 'v', confidence: 'high', rationale: 'r' },
        })
      ).toThrow(WorkflowHaltError);
    });
  });

  describe('throws WorkflowHaltError on malformed rationale (FR-016)', () => {
    it('throws when rationale is missing', () => {
      expect(() =>
        validateReasonOutput({
          structured_output: { verdict: 'v', confidence: 0.5 },
        })
      ).toThrow(WorkflowHaltError);
    });

    it('throws when rationale is an empty string', () => {
      expect(() =>
        validateReasonOutput({
          structured_output: { verdict: 'v', confidence: 0.5, rationale: '' },
        })
      ).toThrow(WorkflowHaltError);
    });

    it('throws when rationale is whitespace-only', () => {
      expect(() =>
        validateReasonOutput({
          structured_output: { verdict: 'v', confidence: 0.5, rationale: '  ' },
        })
      ).toThrow(WorkflowHaltError);
    });

    it('throws when rationale is a non-string', () => {
      expect(() =>
        validateReasonOutput({
          structured_output: { verdict: 'v', confidence: 0.5, rationale: null },
        })
      ).toThrow(WorkflowHaltError);
    });
  });

  describe('error messages are descriptive', () => {
    it('mentions the structured_output absence in the error message', () => {
      expect(() => validateReasonOutput({ message: 'no output' })).toThrow(/no structured_output/);
    });

    it('mentions the missing verdict in the error message', () => {
      expect(() =>
        validateReasonOutput({ structured_output: { confidence: 0.5, rationale: 'r' } })
      ).toThrow(/verdict/);
    });
  });
});
