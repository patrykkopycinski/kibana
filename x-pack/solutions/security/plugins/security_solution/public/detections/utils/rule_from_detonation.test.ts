/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  buildRuleFromDetonation,
  MAX_INDICATORS_PER_TYPE,
  sanitizeDetonationIndicators,
} from './rule_from_detonation';

const sha256 = (c: string) => c.repeat(64);

describe('rule_from_detonation', () => {
  describe('buildRuleFromDetonation', () => {
    it('builds the threat query and one mapping entry per present type', () => {
      const rule = buildRuleFromDetonation([
        { type: 'domain', value: 'x.com' },
        { type: 'ip', value: '1.2.3.4' },
        { type: 'file_hash', value: sha256('a') },
        { type: 'file_hash', value: sha256('b') },
      ]);

      expect(rule?.threatQueryBar).toEqual({
        query: {
          query: `threat.indicator.file.hash.sha256 : ("${sha256('a')}" or "${sha256(
            'b'
          )}") or threat.indicator.ip : ("1.2.3.4") or threat.indicator.domain : ("x.com")`,
          language: 'kuery',
        },
        filters: [],
        saved_id: null,
      });
      expect(
        rule?.threatMapping.map(({ entries }) =>
          entries.map(({ field, type, value }) => ({ field, type, value }))
        )
      ).toEqual([
        [
          {
            field: 'file.hash.sha256',
            type: 'mapping',
            value: 'threat.indicator.file.hash.sha256',
          },
        ],
        [{ field: 'destination.ip', type: 'mapping', value: 'threat.indicator.ip' }],
        [{ field: 'dns.question.name', type: 'mapping', value: 'threat.indicator.domain' }],
        [{ field: 'destination.domain', type: 'mapping', value: 'threat.indicator.domain' }],
      ]);
    });

    it('emits one clause and mapping entry per hash algorithm', () => {
      const md5 = 'a'.repeat(32);
      const rule = buildRuleFromDetonation([
        { type: 'file_hash', value: md5 },
        { type: 'file_hash', value: sha256('a') },
      ]);

      expect(rule?.threatQueryBar.query.query).toBe(
        `threat.indicator.file.hash.md5 : ("${md5}") or threat.indicator.file.hash.sha256 : ("${sha256(
          'a'
        )}")`
      );
      expect(rule?.threatMapping.map(({ entries }) => entries[0].field).sort()).toEqual([
        'file.hash.md5',
        'file.hash.sha256',
      ]);
    });

    it('drops file hashes whose length matches no known algorithm', () => {
      expect(
        sanitizeDetonationIndicators([
          { type: 'file_hash', value: 'a'.repeat(31) },
          { type: 'file_hash', value: 'z'.repeat(64) },
          { type: 'file_hash', value: sha256('a') },
        ])
      ).toEqual([{ type: 'file_hash', value: sha256('a') }]);
      expect(buildRuleFromDetonation([{ type: 'file_hash', value: 'a'.repeat(31) }])).toBeNull();
    });

    it('omits types without values', () => {
      const rule = buildRuleFromDetonation([{ type: 'ip', value: '1.2.3.4' }]);

      expect(rule?.threatQueryBar.query.query).toBe('threat.indicator.ip : ("1.2.3.4")');
      expect(rule?.threatMapping).toHaveLength(1);
    });

    it('escapes quotes and backslashes in values', () => {
      const rule = buildRuleFromDetonation([{ type: 'domain', value: 'a"b\\c' }]);

      expect(rule?.threatQueryBar.query.query).toBe('threat.indicator.domain : ("a\\"b\\\\c")');
    });

    it('caps values per type', () => {
      const rule = buildRuleFromDetonation(
        Array.from({ length: MAX_INDICATORS_PER_TYPE + 10 }, (_, i) => ({
          type: 'ip',
          value: `10.0.0.${i}`,
        }))
      );

      expect(rule?.threatQueryBar.query.query.match(/"/g)).toHaveLength(
        MAX_INDICATORS_PER_TYPE * 2
      );
    });

    it.each([undefined, null, 'x', 5, {}, [], [{ type: 'url', value: 'x' }], [{ type: 'ip' }]])(
      'returns null for unusable input %p',
      (input) => {
        expect(buildRuleFromDetonation(input)).toBeNull();
      }
    );
  });

  describe('sanitizeDetonationIndicators', () => {
    it('drops malformed, empty and duplicate entries', () => {
      expect(
        sanitizeDetonationIndicators([
          null,
          'x',
          { type: 'ip', value: ' 1.1.1.1 ' },
          { type: 'ip', value: '1.1.1.1' },
          { type: 'ip', value: '  ' },
          { type: 'ip', value: 7 },
          { type: 'domain', value: 'a.com' },
        ])
      ).toEqual([
        { type: 'ip', value: '1.1.1.1' },
        { type: 'domain', value: 'a.com' },
      ]);
    });
  });
});
