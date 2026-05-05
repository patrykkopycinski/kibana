/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Example usage patterns for CobaltStrike beacon configuration queries
 * These examples demonstrate common ARGUS analytics pipeline integration scenarios
 */

import type { Client } from '@elastic/elasticsearch';
import {
  buildBeaconConfigQuery,
  buildBeaconClusteringByPublicKeyQuery,
  buildBeaconClusteringByLicenseQuery,
  buildMalleableProfileQuery,
  buildThreatIntelLookupQuery,
  buildBeaconTimelineQuery,
  type CobaltStrikeCTIDocument,
  type BeaconClusterBucket,
} from './cobalt_strike_beacon_query';

/**
 * Example 1: Daily CTI Enrichment Sync
 * Workflow: soc-argus-intel-adapter-analytics
 *
 * Queries for new high-confidence CobaltStrike beacons and writes C2 indicators
 * to the .soc-cve-advisories index for detection generation.
 */
export const dailyCTIEnrichmentSync = async (
  analyticsClient: Client,
  argusClient: Client
) => {
  // Query for beacons discovered in the last 24 hours with high confidence
  const query = buildBeaconConfigQuery({
    minConfidence: 90,
    dateRange: {
      gte: 'now-24h',
    },
    size: 1000,
  });

  const response = await analyticsClient.search<CobaltStrikeCTIDocument>({
    index: 'ia-cti_enrichment',
    body: query,
  });

  const advisories = response.hits.hits.map((hit) => {
    const config = hit._source?.cobalt_strike_config;
    if (!config) return null;

    return {
      '@timestamp': new Date().toISOString(),
      advisory_id: `cs-beacon-${hit._source?.file_hash_sha256?.substring(0, 12)}`,
      advisory_type: 'c2_infrastructure',
      source: 'ia-cti_enrichment',
      confidence: hit._source?.confidence_score ?? 0,
      indicators: [
        {
          type: 'domain',
          value: config.server.hostname,
          metadata: {
            port: config.server.port,
            protocol: config.beacontype.join(','),
          },
        },
      ],
      beacon_metadata: {
        hash: hit._source?.file_hash_sha256,
        license_id: config.license_id,
        version: hit._source?.cobalt_strike_version,
        sleep_time_ms: config.sleeptime,
        jitter_percent: config.jitter,
      },
      detection_suggestions: [
        `network where destination.domain == "${config.server.hostname}" and destination.port == ${config.server.port}`,
      ],
    };
  }).filter(Boolean);

  // Bulk write to advisory index
  if (advisories.length > 0) {
    await argusClient.bulk({
      body: advisories.flatMap((advisory) => [
        { index: { _index: '.soc-cve-advisories' } },
        advisory,
      ]),
    });
  }

  return {
    processedBeacons: response.hits.hits.length,
    advisoriesCreated: advisories.length,
  };
};

/**
 * Example 2: Team Server Infrastructure Clustering
 * Workflow: soc-argus-cluster-production-alerts
 *
 * Identifies beacons sharing the same Team Server (via public key) to
 * attribute multiple campaigns to a single threat actor infrastructure.
 */
export const clusterByTeamServer = async (analyticsClient: Client) => {
  const query = buildBeaconClusteringByPublicKeyQuery(100, 5);

  const response = await analyticsClient.search({
    index: 'ia-cti_enrichment',
    body: query,
  });

  const clusters = response.aggregations?.team_servers.buckets as BeaconClusterBucket[];

  return clusters.map((cluster) => ({
    teamServerPublicKey: cluster.key.substring(0, 64) + '...', // Truncate for readability
    totalBeacons: cluster.doc_count,
    uniqueC2Servers: cluster.unique_servers?.value ?? 0,
    uniqueHashes: cluster.unique_hashes?.value ?? 0,
    representativeSamples: cluster.representative_sample?.hits.hits.map((hit) => ({
      hash: hit._source.file_hash_sha256,
      hostname: hit._source.cobalt_strike_config?.server.hostname,
      version: hit._source.cobalt_strike_version,
      timestamp: hit._source['@timestamp'],
    })) ?? [],
    threatLevel: cluster.doc_count > 10 ? 'high' : cluster.doc_count > 5 ? 'medium' : 'low',
  }));
};

/**
 * Example 3: License-Based Campaign Attribution
 * Workflow: Analyst investigation
 *
 * Clusters beacons by Cobalt Strike license ID to identify persistent
 * threat actors using the same (often cracked/leaked) license.
 */
export const clusterByLicense = async (analyticsClient: Client) => {
  const query = buildBeaconClusteringByLicenseQuery(100, 3);

  const response = await analyticsClient.search({
    index: 'ia-cti_enrichment',
    body: query,
  });

  const clusters = response.aggregations?.licenses.buckets;

  return clusters?.map((cluster: any) => ({
    licenseId: cluster.key,
    totalBeacons: cluster.doc_count,
    uniqueTeamServers: cluster.unique_publickeys?.value ?? 0,
    uniqueC2Servers: cluster.unique_servers?.value ?? 0,
    versions: cluster.versions.buckets.map((v: any) => ({
      version: v.key,
      count: v.doc_count,
    })),
    campaignSpan: {
      earliest: cluster.representative_sample.hits.hits[cluster.representative_sample.hits.hits.length - 1]?._source['@timestamp'],
      latest: cluster.representative_sample.hits.hits[0]?._source['@timestamp'],
    },
    persistenceThreat: cluster.doc_count > 20 && cluster.unique_publickeys.value > 2,
  }));
};

/**
 * Example 4: Malleable C2 Profile Extraction
 * Workflow: Detection engineering tradecraft analysis
 *
 * Extracts unique malleable C2 profiles for fingerprinting threat actor
 * communication patterns and creating behavioral detection rules.
 */
export const extractMalleableProfiles = async (analyticsClient: Client) => {
  const query = buildMalleableProfileQuery(50);

  const response = await analyticsClient.search({
    index: 'ia-cti_enrichment',
    body: query,
  });

  const profiles = response.aggregations?.http_get_uris.buckets;

  return profiles?.map((profile: any) => ({
    httpGetUri: profile.key,
    beaconCount: profile.doc_count,
    httpPostUris: profile.http_post_uris.buckets.map((b: any) => b.key),
    userAgents: profile.user_agents.buckets.map((b: any) => b.key),
    sampleConfig: profile.sample_configs.hits.hits[0]?._source.cobalt_strike_config,
    detectionRule: {
      description: `Detects CobaltStrike beacon using malleable profile: ${profile.key}`,
      query: `network where http.request.uri == "${profile.key}" and http.request.method == "GET"`,
    },
  }));
};

/**
 * Example 5: IOC Enrichment Lookup
 * Workflow: Real-time alert enrichment
 *
 * When an endpoint alert triggers on a suspicious file hash, enriches
 * the alert with CobaltStrike beacon metadata if available.
 */
export const enrichAlertWithBeaconMetadata = async (
  analyticsClient: Client,
  fileHash: string
) => {
  const query = buildThreatIntelLookupQuery(fileHash, 'hash');

  const response = await analyticsClient.search<CobaltStrikeCTIDocument>({
    index: 'ia-cti_enrichment',
    body: query,
  });

  if (response.hits.hits.length === 0) {
    return null;
  }

  const beacon = response.hits.hits[0]._source;
  const config = beacon?.cobalt_strike_config;

  return {
    isCobaltStrikeBeacon: true,
    beaconMetadata: {
      version: beacon?.cobalt_strike_version,
      licenseId: config?.license_id,
      c2Server: {
        hostname: config?.server.hostname,
        port: config?.server.port,
        protocol: config?.beacontype.join(','),
      },
      behavioralConfig: {
        sleepTimeMs: config?.sleeptime,
        jitterPercent: config?.jitter,
      },
      firstSeen: beacon?.first_seen,
      lastSeen: beacon?.last_seen,
      confidenceScore: beacon?.confidence_score,
      campaigns: beacon?.campaign_ids,
    },
    threatContext: {
      description: `CobaltStrike ${beacon?.cobalt_strike_version} beacon communicating with ${config?.server.hostname}:${config?.server.port}`,
      severity: beacon?.confidence_score && beacon.confidence_score > 90 ? 'critical' : 'high',
      recommendedActions: [
        'Isolate affected endpoint immediately',
        `Block C2 communication to ${config?.server.hostname}`,
        'Review network logs for additional beacons with same Team Server public key',
        'Search for other endpoints with same license ID',
      ],
    },
  };
};

/**
 * Example 6: Campaign Timeline Analysis
 * Workflow: Threat intelligence reporting
 *
 * Generates time-series data for beacon deployment trends to identify
 * campaign surges and operational patterns.
 */
export const analyzeBeaconTimeline = async (
  analyticsClient: Client,
  startDate: string,
  endDate: string
) => {
  const query = buildBeaconTimelineQuery('1w', {
    gte: startDate,
    lte: endDate,
  });

  const response = await analyticsClient.search({
    index: 'ia-cti_enrichment',
    body: query,
  });

  const timeline = response.aggregations?.beacon_timeline.buckets;

  return timeline?.map((bucket: any) => ({
    week: bucket.key_as_string,
    metrics: {
      uniqueBeacons: bucket.unique_beacons.value,
      uniqueServers: bucket.unique_servers.value,
      beaconTypeDistribution: bucket.beacon_types.buckets.map((t: any) => ({
        type: t.key,
        count: t.doc_count,
      })),
    },
    trend: {
      // Simple trend detection (would be more sophisticated in production)
      isSpike: bucket.unique_beacons.value > 50,
      alertLevel: bucket.unique_beacons.value > 100 ? 'critical' : bucket.unique_beacons.value > 50 ? 'high' : 'normal',
    },
  }));
};

/**
 * Example 7: Multi-Indicator Correlation
 * Workflow: Advanced threat hunting
 *
 * Correlates multiple IOCs (hostname + port + license ID) to identify
 * high-confidence threat actor infrastructure.
 */
export const correlateMultipleIndicators = async (
  analyticsClient: Client,
  hostname: string,
  port: number,
  licenseId: number
) => {
  const query = buildBeaconConfigQuery({
    serverHostnamePattern: hostname,
    serverPorts: port,
    licenseId,
    minConfidence: 85,
  });

  const response = await analyticsClient.search<CobaltStrikeCTIDocument>({
    index: 'ia-cti_enrichment',
    body: query,
  });

  const matches = response.hits.hits;

  if (matches.length === 0) {
    return null;
  }

  // Extract unique Team Server public keys
  const uniquePublicKeys = new Set(
    matches.map((hit) => hit._source?.cobalt_strike_config?.server.publickey).filter(Boolean)
  );

  // Extract unique beacon hashes
  const uniqueHashes = new Set(
    matches.map((hit) => hit._source?.file_hash_sha256).filter(Boolean)
  );

  return {
    correlationStrength: matches.length > 10 ? 'strong' : matches.length > 5 ? 'moderate' : 'weak',
    matchCount: matches.length,
    infrastructure: {
      hostname,
      port,
      licenseId,
      teamServers: uniquePublicKeys.size,
      beaconVariants: uniqueHashes.size,
    },
    campaigns: [...new Set(matches.flatMap((hit) => hit._source?.campaign_ids || []))],
    threatActorAttributes: {
      isPersistent: matches.length > 15,
      isMultiCampaign: uniquePublicKeys.size > 1,
      operationalSecurity: uniquePublicKeys.size === 1 ? 'high' : 'moderate',
    },
    detectionPriority: matches.length > 10 ? 'immediate' : 'standard',
  };
};

/**
 * Example 8: Variant Bank Enrichment
 * Workflow: soc-argus-analytics-sync-quarterly
 *
 * Integrates beacon configuration data into ARGUS variant bank for
 * production-grounded evaluation.
 */
export const enrichVariantBank = async (
  analyticsClient: Client,
  argusClient: Client,
  technique: string
) => {
  // Query for beacons associated with a specific MITRE technique
  const query = buildBeaconConfigQuery({
    minConfidence: 85,
    size: 100,
  });

  const response = await analyticsClient.search<CobaltStrikeCTIDocument>({
    index: 'ia-cti_enrichment',
    body: query,
  });

  // Convert beacon configs to ARGUS variant bank format
  const variants = response.hits.hits.map((hit) => {
    const config = hit._source?.cobalt_strike_config;
    return {
      variant_id: `cs-beacon-${hit._source?.file_hash_sha256?.substring(0, 12)}`,
      technique,
      variant_type: 'evasion_permutation',
      behavioral_signature: {
        command_pattern: [],
        network_indicators: [
          {
            hostname: config?.server.hostname,
            port: config?.server.port,
            protocol: config?.beacontype.join(','),
          },
        ],
      },
      representative_samples: [
        {
          // Convert to ECS event format
          '@timestamp': hit._source?.['@timestamp'],
          file: {
            hash: {
              sha256: hit._source?.file_hash_sha256,
            },
          },
          threat: {
            indicator: {
              domain: config?.server.hostname,
              port: config?.server.port,
            },
            software: {
              name: 'CobaltStrike',
              version: hit._source?.cobalt_strike_version,
            },
          },
        },
      ],
      provenance: {
        source: 'ia-cti_enrichment',
        analyst_approved_by: 'automated',
        approved_date: new Date().toISOString(),
        approval_rationale: `High-confidence CobaltStrike beacon (score: ${hit._source?.confidence_score})`,
      },
      metadata: {
        created_at: new Date().toISOString(),
        quarterly_refresh: '2026-Q2',
      },
    };
  });

  // Write to variant bank
  if (variants.length > 0) {
    await argusClient.bulk({
      body: variants.flatMap((variant) => [
        { index: { _index: '.soc-eval-corpus-variants' } },
        variant,
      ]),
    });
  }

  return {
    variantsCreated: variants.length,
    technique,
  };
};
