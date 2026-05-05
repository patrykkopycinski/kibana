/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  buildBeaconConfigQuery,
  buildBeaconClusteringByPublicKeyQuery,
  buildBeaconClusteringByLicenseQuery,
  buildMalleableProfileQuery,
  buildThreatIntelLookupQuery,
  buildBeaconTimelineQuery,
} from './cobalt_strike_beacon_query';

describe('CobaltStrike Beacon Query Builders', () => {
  describe('buildBeaconConfigQuery', () => {
    it('should build a basic query with existence check', () => {
      const query = buildBeaconConfigQuery();

      expect(query.query.bool.must).toContainEqual({
        exists: { field: 'cobalt_strike_config' },
      });
      expect(query.size).toBe(100);
      expect(query.from).toBe(0);
    });

    it('should filter by beacon types', () => {
      const query = buildBeaconConfigQuery({
        beaconTypes: ['HTTPS', 'DNS'],
      });

      expect(query.query.bool.filter).toContainEqual({
        terms: {
          'cobalt_strike_config.beacontype': ['HTTPS', 'DNS'],
        },
      });
    });

    it('should filter by server hostname pattern', () => {
      const query = buildBeaconConfigQuery({
        serverHostnamePattern: '*.example.com',
      });

      expect(query.query.bool.filter).toContainEqual({
        wildcard: {
          'cobalt_strike_config.server.hostname': {
            value: '*.example.com',
            case_insensitive: true,
          },
        },
      });
    });

    it('should filter by exact server port', () => {
      const query = buildBeaconConfigQuery({
        serverPorts: 443,
      });

      expect(query.query.bool.filter).toContainEqual({
        term: {
          'cobalt_strike_config.server.port': 443,
        },
      });
    });

    it('should filter by server port range', () => {
      const query = buildBeaconConfigQuery({
        serverPorts: { min: 8000, max: 9000 },
      });

      expect(query.query.bool.filter).toContainEqual({
        range: {
          'cobalt_strike_config.server.port': {
            gte: 8000,
            lte: 9000,
          },
        },
      });
    });

    it('should filter by license ID', () => {
      const query = buildBeaconConfigQuery({
        licenseId: 334850267,
      });

      expect(query.query.bool.filter).toContainEqual({
        term: {
          'cobalt_strike_config.license_id': 334850267,
        },
      });
    });

    it('should filter by public key', () => {
      const publicKey = 'MIGfMA0GCSqGSIb3DQEBAQUAA4G...';
      const query = buildBeaconConfigQuery({
        publicKey,
      });

      expect(query.query.bool.filter).toContainEqual({
        term: {
          'cobalt_strike_config.server.publickey.keyword': publicKey,
        },
      });
    });

    it('should filter by Cobalt Strike version', () => {
      const query = buildBeaconConfigQuery({
        version: '4.4',
      });

      expect(query.query.bool.filter).toContainEqual({
        term: {
          'cobalt_strike_version.keyword': '4.4',
        },
      });
    });

    it('should filter by minimum confidence score', () => {
      const query = buildBeaconConfigQuery({
        minConfidence: 80,
      });

      expect(query.query.bool.filter).toContainEqual({
        range: {
          confidence_score: {
            gte: 80,
          },
        },
      });
    });

    it('should filter by date range', () => {
      const query = buildBeaconConfigQuery({
        dateRange: {
          gte: '2024-01-01',
          lte: '2024-12-31',
        },
      });

      expect(query.query.bool.filter).toContainEqual({
        range: {
          '@timestamp': {
            gte: '2024-01-01',
            lte: '2024-12-31',
          },
        },
      });
    });

    it('should support custom pagination', () => {
      const query = buildBeaconConfigQuery({
        size: 50,
        from: 100,
      });

      expect(query.size).toBe(50);
      expect(query.from).toBe(100);
    });

    it('should support custom sort', () => {
      const query = buildBeaconConfigQuery({
        sort: {
          field: 'confidence_score',
          order: 'desc',
        },
      });

      expect(query.sort).toEqual([
        {
          confidence_score: {
            order: 'desc',
          },
        },
      ]);
    });

    it('should default to timestamp descending sort', () => {
      const query = buildBeaconConfigQuery();

      expect(query.sort).toEqual([
        {
          '@timestamp': {
            order: 'desc',
          },
        },
      ]);
    });

    it('should combine multiple filters', () => {
      const query = buildBeaconConfigQuery({
        beaconTypes: ['HTTPS'],
        serverHostnamePattern: '*.cloud',
        serverPorts: 443,
        minConfidence: 90,
        dateRange: {
          gte: '2024-01-01',
        },
      });

      expect(query.query.bool.filter).toHaveLength(5);
    });
  });

  describe('buildBeaconClusteringByPublicKeyQuery', () => {
    it('should build aggregation query for Team Server clustering', () => {
      const query = buildBeaconClusteringByPublicKeyQuery();

      expect(query.query.bool.must).toContainEqual({
        exists: { field: 'cobalt_strike_config.server.publickey' },
      });
      expect(query.size).toBe(0);
      expect(query.aggs.team_servers).toBeDefined();
    });

    it('should configure bucket size and sample size', () => {
      const query = buildBeaconClusteringByPublicKeyQuery(50, 5);

      expect(query.aggs.team_servers.terms.size).toBe(50);
      expect(query.aggs.team_servers.aggs.representative_sample.top_hits.size).toBe(5);
    });

    it('should include cardinality aggregations', () => {
      const query = buildBeaconClusteringByPublicKeyQuery();

      expect(query.aggs.team_servers.aggs.unique_servers).toEqual({
        cardinality: {
          field: 'cobalt_strike_config.server.hostname.keyword',
        },
      });
      expect(query.aggs.team_servers.aggs.unique_hashes).toEqual({
        cardinality: {
          field: 'file_hash_sha256.keyword',
        },
      });
    });

    it('should include representative samples with relevant fields', () => {
      const query = buildBeaconClusteringByPublicKeyQuery();

      const sample = query.aggs.team_servers.aggs.representative_sample.top_hits;
      expect(sample._source.includes).toContain('file_hash_sha256');
      expect(sample._source.includes).toContain('cobalt_strike_config.server');
      expect(sample._source.includes).toContain('campaign_ids');
    });
  });

  describe('buildBeaconClusteringByLicenseQuery', () => {
    it('should build aggregation query for license clustering', () => {
      const query = buildBeaconClusteringByLicenseQuery();

      expect(query.query.bool.must).toContainEqual({
        exists: { field: 'cobalt_strike_config.license_id' },
      });
      expect(query.size).toBe(0);
      expect(query.aggs.licenses).toBeDefined();
    });

    it('should configure bucket size and sample size', () => {
      const query = buildBeaconClusteringByLicenseQuery(75, 4);

      expect(query.aggs.licenses.terms.size).toBe(75);
      expect(query.aggs.licenses.aggs.representative_sample.top_hits.size).toBe(4);
    });

    it('should include version sub-aggregation', () => {
      const query = buildBeaconClusteringByLicenseQuery();

      expect(query.aggs.licenses.aggs.versions).toEqual({
        terms: {
          field: 'cobalt_strike_version.keyword',
          size: 10,
        },
      });
    });

    it('should include cardinality for publickeys and servers', () => {
      const query = buildBeaconClusteringByLicenseQuery();

      expect(query.aggs.licenses.aggs.unique_publickeys).toBeDefined();
      expect(query.aggs.licenses.aggs.unique_servers).toBeDefined();
    });
  });

  describe('buildMalleableProfileQuery', () => {
    it('should build aggregation for malleable C2 profiles', () => {
      const query = buildMalleableProfileQuery();

      expect(query.query.bool.must).toContainEqual({
        exists: { field: 'cobalt_strike_config.http-get' },
      });
      expect(query.size).toBe(0);
      expect(query.aggs.http_get_uris).toBeDefined();
    });

    it('should configure max profiles', () => {
      const query = buildMalleableProfileQuery(25);

      expect(query.aggs.http_get_uris.terms.size).toBe(25);
    });

    it('should include nested aggregations for POST URIs and User-Agents', () => {
      const query = buildMalleableProfileQuery();

      expect(query.aggs.http_get_uris.aggs.http_post_uris).toBeDefined();
      expect(query.aggs.http_get_uris.aggs.user_agents).toBeDefined();
    });

    it('should include sample configs with relevant fields', () => {
      const query = buildMalleableProfileQuery();

      const samples = query.aggs.http_get_uris.aggs.sample_configs.top_hits;
      expect(samples._source.includes).toContain('cobalt_strike_config.http-get');
      expect(samples._source.includes).toContain('cobalt_strike_config.http-post');
      expect(samples._source.includes).toContain('cobalt_strike_config.dns');
    });
  });

  describe('buildThreatIntelLookupQuery', () => {
    it('should build query for hash lookup', () => {
      const hash = '697fddfc5195828777622236f2b133c0a24a6d0dc539ae7da41798c4456a3f89';
      const query = buildThreatIntelLookupQuery(hash, 'hash');

      expect(query.query.bool.should).toContainEqual({
        term: { 'file_hash_sha256.keyword': hash },
      });
      expect(query.query.bool.should).toContainEqual({
        term: { 'file_hash_md5.keyword': hash },
      });
      expect(query.query.bool.should).toContainEqual({
        term: { 'file_hash_sha1.keyword': hash },
      });
      expect(query.query.bool.minimum_should_match).toBe(1);
    });

    it('should build query for hostname lookup', () => {
      const hostname = 'clevelandclinic.cloud';
      const query = buildThreatIntelLookupQuery(hostname, 'hostname');

      expect(query.query.bool.should).toContainEqual({
        term: { 'cobalt_strike_config.server.hostname.keyword': hostname },
      });
      expect(query.query.bool.minimum_should_match).toBe(1);
    });

    it('should build query for IP lookup', () => {
      const ip = '104.197.142.19';
      const query = buildThreatIntelLookupQuery(ip, 'ip');

      expect(query.query.bool.should).toContainEqual({
        term: { 'cobalt_strike_config.server.ip.keyword': ip },
      });
      expect(query.query.bool.minimum_should_match).toBe(1);
    });

    it('should include existence check for cobalt_strike_config', () => {
      const query = buildThreatIntelLookupQuery('test', 'hash');

      expect(query.query.bool.must).toContainEqual({
        exists: { field: 'cobalt_strike_config' },
      });
    });

    it('should sort by timestamp descending', () => {
      const query = buildThreatIntelLookupQuery('test', 'hash');

      expect(query.sort).toEqual([
        {
          '@timestamp': {
            order: 'desc',
          },
        },
      ]);
    });
  });

  describe('buildBeaconTimelineQuery', () => {
    it('should build time-series aggregation', () => {
      const query = buildBeaconTimelineQuery();

      expect(query.query.bool.must).toContainEqual({
        exists: { field: 'cobalt_strike_config' },
      });
      expect(query.size).toBe(0);
      expect(query.aggs.beacon_timeline).toBeDefined();
    });

    it('should configure calendar interval', () => {
      const query = buildBeaconTimelineQuery('1w');

      expect(query.aggs.beacon_timeline.date_histogram.calendar_interval).toBe('1w');
    });

    it('should apply date range filter when provided', () => {
      const query = buildBeaconTimelineQuery('1d', {
        gte: '2024-01-01',
        lte: '2024-12-31',
      });

      expect(query.query.bool.filter).toContainEqual({
        range: {
          '@timestamp': {
            gte: '2024-01-01',
            lte: '2024-12-31',
          },
        },
      });
    });

    it('should include cardinality sub-aggregations', () => {
      const query = buildBeaconTimelineQuery();

      expect(query.aggs.beacon_timeline.aggs.unique_beacons).toEqual({
        cardinality: {
          field: 'file_hash_sha256.keyword',
        },
      });
      expect(query.aggs.beacon_timeline.aggs.unique_servers).toEqual({
        cardinality: {
          field: 'cobalt_strike_config.server.hostname.keyword',
        },
      });
    });

    it('should include beacon type distribution', () => {
      const query = buildBeaconTimelineQuery();

      expect(query.aggs.beacon_timeline.aggs.beacon_types).toEqual({
        terms: {
          field: 'cobalt_strike_config.beacontype',
          size: 10,
        },
      });
    });
  });
});
