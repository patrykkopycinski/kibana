/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// These scripts run via actions/github-script outside the Jest project, so
// they use Node's built-in runner:
//   node --test .github/scripts/reviewer_comment.test.js

const { test } = require('node:test');
const assert = require('node:assert');

const {
  REVIEWERS,
  findMentionedReviewers,
  selectActionableReviewer,
} = require('./reviewer_comment');

const select = (body, labelNames) => selectActionableReviewer({ body, labelNames });

test('every reviewer declares a distinct command, label, and lock workflow', () => {
  const entries = Object.entries(REVIEWERS);
  const unique = (key) => new Set(entries.map(([, r]) => r[key])).size;

  assert.equal(unique('command'), entries.length, 'commands must be unique');
  assert.equal(unique('label'), entries.length, 'labels must be unique');
  assert.equal(unique('workflowId'), entries.length, 'workflow ids must be unique');

  for (const [key, reviewer] of entries) {
    assert.equal(reviewer.id, key, `${key}: id must match its registry key`);
    assert.equal(reviewer.command, `@${reviewer.id}`, `${key}: command must be @<id>`);
    assert.equal(reviewer.label, `reviewer:${reviewer.id}`, `${key}: label must be reviewer:<id>`);
    assert.equal(
      reviewer.workflowId,
      `reviewer-${reviewer.id}.lock.yml`,
      `${key}: workflowId must be reviewer-<id>.lock.yml`
    );
  }
});

test('label-gated reviewers only activate when their label is present', () => {
  for (const reviewer of Object.values(REVIEWERS)) {
    if (!reviewer.requiresLabel) {
      continue;
    }

    assert.equal(
      select(reviewer.command, [reviewer.label])?.id,
      reviewer.id,
      `${reviewer.id} should activate with its own label`
    );
    assert.equal(
      select(reviewer.command, []),
      undefined,
      `${reviewer.id} must not activate without its label`
    );
    assert.equal(
      select(reviewer.command, ['reviewer:someone-else']),
      undefined,
      `${reviewer.id} must not activate on another reviewer's label`
    );
  }
});

test('pnd is registered as a label-gated reviewer', () => {
  assert.deepEqual(REVIEWERS.pnd, {
    id: 'pnd',
    command: '@pnd',
    label: 'reviewer:pnd',
    requiresLabel: true,
    workflowId: 'reviewer-pnd.lock.yml',
  });
});

test('@claude wins over a label-gated mention in the same comment', () => {
  assert.equal(select('@claude and @pnd please look', ['reviewer:pnd'])?.id, 'claude');
  assert.equal(select('@claude and @scout please look', ['reviewer:scout'])?.id, 'claude');
});

test('claude activates without any reviewer label', () => {
  assert.equal(REVIEWERS.claude.requiresLabel, false);
  assert.equal(select('@claude', [])?.id, 'claude');
});

test('a comment with no reviewer mention is not actionable', () => {
  assert.equal(select('lgtm, nice work', ['reviewer:pnd']), undefined);
  assert.deepEqual(findMentionedReviewers('lgtm'), []);
});

test('mentions are detected independently of the labels on the PR', () => {
  const mentioned = findMentionedReviewers('@pnd @scout').map((r) => r.id);
  assert.deepEqual(mentioned.sort(), ['pnd', 'scout']);
});
