/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  DETONATE_VERDICTS,
  DETONATE_WORKERS,
  DETONATE_WORKER_LABELS,
  detonationConfidence,
  detonationStep,
} from '.';
import type { DetonateWorkerName } from '.';

describe('detonationStep', () => {
  it('labels every worker in plain words and keeps the raw name beside it', () => {
    expect(DETONATE_WORKERS.map((worker) => DETONATE_WORKER_LABELS[worker])).toEqual([
      'Preparing the sample',
      'Running in the sandbox',
      'Stopping the sandbox',
      'Writing the summary',
    ]);
    expect(
      detonationStep({
        last_worker_name: 'detonate.workers.stop_vm',
        last_worker_status: 'started',
      })
    ).toEqual({
      step: 3,
      of: 4,
      label: 'Stopping the sandbox',
      worker: 'detonate.workers.stop_vm',
    });
  });

  it('falls back to the raw name for a worker the prototype does not know', () => {
    const worker = 'detonate.workers.future_worker' as DetonateWorkerName;

    expect(detonationStep({ last_worker_name: worker, last_worker_status: 'started' })).toEqual({
      step: 0,
      of: 4,
      label: worker,
      worker,
    });
  });
});

describe('detonationConfidence', () => {
  it('maps each verdict to a fixed confidence', () => {
    expect(Object.fromEntries(DETONATE_VERDICTS.map((v) => [v, detonationConfidence(v)]))).toEqual({
      malicious: 'high',
      quiet: 'medium',
      inconclusive: 'low',
    });
  });
});
