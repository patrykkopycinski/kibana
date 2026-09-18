/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  PAUSED_EXECUTION_STATUSES,
  TERMINAL_EXECUTION_STATUSES,
  allPriorEventsCarriedForward,
  evaluateHilRejectionGate,
  isPausedExecutionStatus,
  isTerminalExecutionStatus,
} from './orchestrator_identity';

describe('Family D orchestrator-identity gate', () => {
  describe('execution status classification', () => {
    it('classifies every terminal status as terminal and non-pausing', () => {
      for (const status of TERMINAL_EXECUTION_STATUSES) {
        expect(isTerminalExecutionStatus(status)).toBe(true);
        expect(isPausedExecutionStatus(status)).toBe(false);
      }
    });

    it('classifies every pause-state spelling as non-terminal', () => {
      for (const status of PAUSED_EXECUTION_STATUSES) {
        expect(isPausedExecutionStatus(status)).toBe(true);
        expect(isTerminalExecutionStatus(status)).toBe(false);
      }
      expect(isTerminalExecutionStatus('running')).toBe(false);
      expect(isTerminalExecutionStatus(undefined)).toBe(false);
    });
  });

  describe('evaluateHilRejectionGate (D4)', () => {
    const base = { preRejectStatus: 'waiting_for_input', markerDocs: 0 };

    it('passes when the run paused, was rejected, and ended terminal with no marker docs', () => {
      const gate = evaluateHilRejectionGate({ ...base, postRejectStatus: 'cancelled' });

      expect(gate).toEqual({
        success: true,
        reachedPause: true,
        consequentialStepDidNotRun: true,
        halted: true,
      });
    });

    it('fails when the engine still reports a pause state after the rejection', () => {
      for (const status of ['waiting', 'waiting_for_input']) {
        const gate = evaluateHilRejectionGate({ ...base, postRejectStatus: status });

        expect(gate.halted).toBe(false);
        expect(gate.success).toBe(false);
      }
    });

    it('fails when the run is still running after the rejection', () => {
      expect(evaluateHilRejectionGate({ ...base, postRejectStatus: 'running' }).success).toBe(
        false
      );
    });

    it('fails when no pause was reached before the rejection', () => {
      const gate = evaluateHilRejectionGate({
        preRejectStatus: 'completed',
        postRejectStatus: 'completed',
        markerDocs: 0,
      });

      expect(gate.reachedPause).toBe(false);
      expect(gate.success).toBe(false);
    });

    it('fails when the consequential step wrote a marker document', () => {
      const gate = evaluateHilRejectionGate({
        ...base,
        postRejectStatus: 'completed',
        markerDocs: 1,
      });

      expect(gate.consequentialStepDidNotRun).toBe(false);
      expect(gate.success).toBe(false);
    });
  });

  describe('allPriorEventsCarriedForward (D7)', () => {
    const priorThreads = [
      { type: 'observation', summary: 'SMB connection to SERVER-DC01' },
      { type: 'decision', summary: 'escalated to Deep' },
    ];
    const promotionEvent = { type: 'decision', summary: 'promoted to Incident' };

    it('passes when every prior event is present unchanged alongside the promotion event', () => {
      expect(allPriorEventsCarriedForward(priorThreads, [...priorThreads, promotionEvent])).toBe(
        true
      );
    });

    it('passes when the writer reordered the events or their fields', () => {
      const reordered = [
        promotionEvent,
        { summary: 'escalated to Deep', type: 'decision' },
        { summary: 'SMB connection to SERVER-DC01', type: 'observation' },
      ];

      expect(allPriorEventsCarriedForward(priorThreads, reordered)).toBe(true);
    });

    it('fails when a prior event is replaced by a different event of the same count', () => {
      const lossyFork = [
        priorThreads[0],
        { type: 'observation', summary: 'unrelated' },
        promotionEvent,
      ];

      expect(lossyFork.length).toBe(priorThreads.length + 1);
      expect(allPriorEventsCarriedForward(priorThreads, lossyFork)).toBe(false);
    });

    it('fails when a prior event is mutated in place', () => {
      const mutated = [
        priorThreads[0],
        { type: 'decision', summary: 'escalated to Deep (truncated)' },
        promotionEvent,
      ];

      expect(allPriorEventsCarriedForward(priorThreads, mutated)).toBe(false);
    });

    it('fails when the incident drops a prior event and appends the promotion event', () => {
      expect(allPriorEventsCarriedForward(priorThreads, [priorThreads[0], promotionEvent])).toBe(
        false
      );
    });

    it('fails when there was no prior thread to carry forward', () => {
      expect(allPriorEventsCarriedForward([], [promotionEvent])).toBe(false);
    });
  });
});
