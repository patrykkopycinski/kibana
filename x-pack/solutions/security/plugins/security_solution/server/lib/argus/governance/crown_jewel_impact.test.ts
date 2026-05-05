/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SocCrownJewelDocument } from '../synthesis/contracts';
import { evaluateCrownJewelImpact } from './crown_jewel_impact';

const mkAsset = (overrides: Partial<SocCrownJewelDocument>): SocCrownJewelDocument => ({
  '@timestamp': '2026-05-05T00:00:00Z',
  asset_id: overrides.asset_id ?? 'cj-test',
  asset_type: overrides.asset_type ?? 'host',
  name: overrides.name ?? 'test-asset',
  tier: overrides.tier ?? 'silver',
  owner: overrides.owner ?? 'platform-team',
  match_patterns: overrides.match_patterns ?? [{ kind: 'host_name', values: ['host-a'] }],
  gate_active: overrides.gate_active ?? true,
  ...overrides,
});

describe('evaluateCrownJewelImpact (B5)', () => {
  describe('no match', () => {
    it('returns proceed with max_tier=none when no asset matches', () => {
      const result = evaluateCrownJewelImpact({ host_names: ['unrelated-host'] }, [
        mkAsset({ match_patterns: [{ kind: 'host_name', values: ['host-a'] }] }),
      ]);
      expect(result.recommended_action).toBe('proceed');
      expect(result.max_tier).toBe('none');
      expect(result.affected_count).toBe(0);
      expect(result.crown_match).toBe(false);
    });

    it('returns proceed when the targets are empty', () => {
      const result = evaluateCrownJewelImpact({}, [
        mkAsset({ match_patterns: [{ kind: 'host_name', values: ['host-a'] }] }),
      ]);
      expect(result.recommended_action).toBe('proceed');
      expect(result.max_tier).toBe('none');
    });

    it('skips assets with empty match_patterns gracefully', () => {
      const result = evaluateCrownJewelImpact({ host_names: ['host-a'] }, [
        mkAsset({ match_patterns: [] }),
      ]);
      expect(result.affected_count).toBe(0);
    });
  });

  describe('match by kind', () => {
    it('matches host_name (terms, default)', () => {
      const result = evaluateCrownJewelImpact({ host_names: ['db-prod-1'] }, [
        mkAsset({
          asset_id: 'cj-prod-db',
          tier: 'gold',
          match_patterns: [{ kind: 'host_name', values: ['db-prod-1', 'db-prod-2'] }],
        }),
      ]);
      expect(result.recommended_action).toBe('pending_review');
      expect(result.max_tier).toBe('gold');
      expect(result.affected[0]).toMatchObject({
        asset_id: 'cj-prod-db',
        matched_kind: 'host_name',
        matched_value: 'db-prod-1',
      });
    });

    it('matches host_name with wildcard mode', () => {
      const result = evaluateCrownJewelImpact({ host_names: ['payment-gateway-7'] }, [
        mkAsset({
          tier: 'platinum',
          match_patterns: [
            { kind: 'host_name', values: ['payment-gateway-*'], match_mode: 'wildcard' },
          ],
        }),
      ]);
      expect(result.recommended_action).toBe('pending_review');
      expect(result.max_tier).toBe('platinum');
    });

    it('matches user_id', () => {
      const result = evaluateCrownJewelImpact({ user_ids: ['svc.payments.app'] }, [
        mkAsset({
          asset_type: 'user',
          tier: 'gold',
          match_patterns: [{ kind: 'user_id', values: ['svc.payments.app'] }],
        }),
      ]);
      expect(result.affected_count).toBe(1);
      expect(result.affected[0].matched_kind).toBe('user_id');
    });

    it('matches index_pattern via wildcard', () => {
      const result = evaluateCrownJewelImpact({ index_patterns: ['logs-finance-*'] }, [
        mkAsset({
          asset_type: 'data_store',
          tier: 'platinum',
          match_patterns: [
            { kind: 'index_pattern', values: ['logs-finance-*'], match_mode: 'wildcard' },
          ],
        }),
      ]);
      expect(result.recommended_action).toBe('pending_review');
    });

    it('matches host_ip_range with CIDR', () => {
      const result = evaluateCrownJewelImpact({ host_ips: ['10.0.42.7'] }, [
        mkAsset({
          tier: 'crown',
          match_patterns: [{ kind: 'host_ip_range', values: ['10.0.42.0/24'] }],
        }),
      ]);
      expect(result.recommended_action).toBe('pending_review');
      expect(result.max_tier).toBe('crown');
      expect(result.crown_match).toBe(true);
      expect(result.affected[0].matched_kind).toBe('host_ip_range');
    });

    it('CIDR /32 only matches the exact IP', () => {
      const jewels = [
        mkAsset({
          tier: 'gold',
          match_patterns: [{ kind: 'host_ip_range', values: ['192.168.1.42/32'] }],
        }),
      ];
      expect(evaluateCrownJewelImpact({ host_ips: ['192.168.1.42'] }, jewels).affected_count).toBe(
        1
      );
      expect(evaluateCrownJewelImpact({ host_ips: ['192.168.1.43'] }, jewels).affected_count).toBe(
        0
      );
    });

    it('CIDR /0 matches any IP', () => {
      const result = evaluateCrownJewelImpact({ host_ips: ['1.2.3.4'] }, [
        mkAsset({
          match_patterns: [{ kind: 'host_ip_range', values: ['0.0.0.0/0'] }],
        }),
      ]);
      expect(result.affected_count).toBe(1);
    });

    it('rejects malformed CIDRs silently (no throw, no match)', () => {
      const result = evaluateCrownJewelImpact({ host_ips: ['10.0.42.7'] }, [
        mkAsset({
          match_patterns: [
            { kind: 'host_ip_range', values: ['this-is-not-a-cidr'] },
            { kind: 'host_ip_range', values: ['10.0.42.0/99'] },
          ],
        }),
      ]);
      expect(result.affected_count).toBe(0);
    });

    it('matches tag', () => {
      const result = evaluateCrownJewelImpact({ tags: ['environment:prod', 'tier:1'] }, [
        mkAsset({
          tier: 'gold',
          match_patterns: [{ kind: 'tag', values: ['tier:1'] }],
        }),
      ]);
      expect(result.recommended_action).toBe('pending_review');
    });
  });

  describe('escalation matrix', () => {
    const platinumAsset = mkAsset({
      asset_id: 'cj-platinum',
      tier: 'platinum',
      match_patterns: [{ kind: 'host_name', values: ['host-platinum'] }],
    });
    const goldAsset = mkAsset({
      asset_id: 'cj-gold',
      tier: 'gold',
      match_patterns: [{ kind: 'host_name', values: ['host-gold'] }],
    });
    const silverAsset = mkAsset({
      asset_id: 'cj-silver',
      tier: 'silver',
      match_patterns: [{ kind: 'host_name', values: ['host-silver'] }],
    });
    const crownAsset = mkAsset({
      asset_id: 'cj-crown',
      tier: 'crown',
      match_patterns: [{ kind: 'host_name', values: ['host-crown'] }],
    });

    it('reports the highest tier among multiple matches', () => {
      const result = evaluateCrownJewelImpact({ host_names: ['host-silver', 'host-platinum'] }, [
        silverAsset,
        platinumAsset,
      ]);
      expect(result.affected_count).toBe(2);
      expect(result.max_tier).toBe('platinum');
    });

    it('escalates on a single crown asset', () => {
      const result = evaluateCrownJewelImpact({ host_names: ['host-crown'] }, [crownAsset]);
      expect(result.crown_match).toBe(true);
      expect(result.recommended_action).toBe('pending_review');
      expect(result.reason).toContain('CROWN match');
    });

    it('escalates on gold even without silver match', () => {
      const result = evaluateCrownJewelImpact({ host_names: ['host-gold'] }, [goldAsset]);
      expect(result.recommended_action).toBe('pending_review');
      expect(result.max_tier).toBe('gold');
    });

    it('escalates on silver when gate_active=true (default)', () => {
      const result = evaluateCrownJewelImpact({ host_names: ['host-silver'] }, [silverAsset]);
      expect(result.recommended_action).toBe('pending_review');
    });

    it('does NOT escalate when matched silver has gate_active=false', () => {
      const result = evaluateCrownJewelImpact({ host_names: ['host-silver'] }, [
        { ...silverAsset, gate_active: false },
      ]);
      expect(result.affected_count).toBe(1);
      expect(result.recommended_action).toBe('proceed');
      expect(result.reason).toContain('no asset has gate_active=true');
    });

    it('escalates if at least one of multiple silver assets is active', () => {
      const inactive = { ...silverAsset, asset_id: 'cj-silver-x', gate_active: false };
      const active = { ...silverAsset, asset_id: 'cj-silver-y', gate_active: true };
      const result = evaluateCrownJewelImpact({ host_names: ['host-silver'] }, [inactive, active]);
      expect(result.recommended_action).toBe('pending_review');
    });

    it('escalates on gold even if all silvers have gate_active=false', () => {
      const result = evaluateCrownJewelImpact({ host_names: ['host-silver', 'host-gold'] }, [
        { ...silverAsset, gate_active: false },
        goldAsset,
      ]);
      expect(result.recommended_action).toBe('pending_review');
      expect(result.max_tier).toBe('gold');
    });
  });

  describe('reason string', () => {
    it('always populates a non-empty reason', () => {
      const empty = evaluateCrownJewelImpact({}, []);
      expect(empty.reason).toBeTruthy();
      expect(empty.reason).toContain('No crown-jewel assets matched');

      const matched = evaluateCrownJewelImpact({ host_names: ['host-a'] }, [
        mkAsset({ tier: 'gold' }),
      ]);
      expect(matched.reason).toBeTruthy();
      expect(matched.reason).toContain('max_tier=gold');
    });
  });
});
