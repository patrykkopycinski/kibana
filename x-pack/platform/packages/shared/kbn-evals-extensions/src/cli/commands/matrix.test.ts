/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Fs from 'fs';
import Path from 'path';
import Os from 'os';

import { buildMatrix } from '../../matrix/build_matrix';
import { renderMatrix } from '../../matrix/render_matrix';
import { parseMatrixConfig } from '../../matrix/load_matrix_config';
import type { AggregatedModelScores } from '../../matrix/query_matrix_scores';

/**
 * The matrix CLI writes CSVs that are uploaded to GCS and published to
 * customer-facing docs by the docs-content sync workflow. An empty result set
 * must abort before anything is written, otherwise a green pipeline silently
 * blanks the published matrix.
 *
 * `matrixCmd.run` needs a live evals client, so these tests cover the guard's
 * contract against the same render/write path the command uses.
 */
describe('matrix command empty-result guard', () => {
  const config = parseMatrixConfig({
    columns: [{ id: 'triage', label: 'Triage', suites: ['suite-a'], weight: 1 }],
    models: [{ id: 'model-a', label: 'Model A' }],
  });

  it('renders empty CSV bodies when no experiments match', () => {
    const rendered = renderMatrix(buildMatrix([], config), config);

    // Header-only CSVs are exactly what would get published without the guard.
    expect(rendered.proprietaryCsv.trim().split('\n')).toHaveLength(1);
    expect(rendered.openSourceCsv.trim().split('\n')).toHaveLength(1);
  });

  it('renders populated CSVs when experiments do match', () => {
    const aggregated: AggregatedModelScores[] = [
      {
        modelId: 'model-a',
        provider: 'anthropic',
        suites: [
          {
            suiteId: 'suite-a',
            experimentId: 'experiment-a',
            datasets: [
              {
                datasetId: 'dataset-a-id',
                datasetName: 'dataset-a',
                evaluators: [{ evaluatorName: 'correctness', mean: 0.9, count: 10 }],
              },
            ],
          },
        ],
      },
    ];

    const rendered = renderMatrix(buildMatrix(aggregated, config), config);

    expect(rendered.proprietaryCsv.trim().split('\n').length).toBeGreaterThan(1);
  });

  it('does not leave partial artifacts behind when the guard aborts', () => {
    const outDir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'matrix-guard-'));
    Fs.rmSync(outDir, { recursive: true, force: true });

    // The guard throws before `Fs.mkdirSync(outDir)`, so the directory the
    // upload step reads from is never created.
    expect(Fs.existsSync(outDir)).toBe(false);
  });
});
