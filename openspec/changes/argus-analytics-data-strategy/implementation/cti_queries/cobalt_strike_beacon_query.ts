/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Query logic for extracting CobaltStrike beacon configurations from the ia-cti_enrichment index
 * on the analytics cluster. This module provides typed query builders for beacon metadata including
 * server hostnames, ports, beacon types, and malleable C2 profiles.
 *
 * Reference: Based on Elastic Security Labs research on CobaltStrike beacon extraction
 * @see https://www.elastic.co/security-labs/extracting-cobalt-strike-beacon-configurations
 */

export interface CobaltStrikeBeaconConfig {
  /**
   * Beacon communication protocol type (HTTP, HTTPS, DNS, SMB, TCP)
   */
  beacontype: string[];

  /**
   * Sleep time between beacon check-ins (milliseconds)
   */
  sleeptime: number;

  /**
   * Random jitter percentage applied to sleeptime (0-100)
   */
  jitter: number;

  /**
   * Maximum size of HTTP GET requests
   */
  maxgetsize?: number;

  /**
   * Process to spawn for post-exploitation jobs
   */
  spawnto?: string;

  /**
   * Cobalt Strike license identifier (watermark)
   */
  license_id: number;

  /**
   * Kill date for beacon expiration (YYYY-MM-DD format)
   */
  kill_date?: string;

  /**
   * Team server configuration
   */
  server: {
    /**
     * C2 server hostname or domain
     */
    hostname: string;

    /**
     * C2 server port
     */
    port: number;

    /**
     * Public key used for beacon encryption (Base64-encoded RSA public key)
     */
    publickey: string;
  };

  /**
   * Process injection configuration
   */
  'process-inject'?: {
    /**
     * Memory allocator method
     */
    allocator?: string;

    /**
     * Execution methods for process injection
     */
    execute?: string[];

    /**
     * Minimum allocation size
     */
    min_alloc?: number;

    /**
     * MD5 hash of Cobalt Strike JAR file (Base64-encoded)
     */
    stub?: string;

    /**
     * Transform operations for x86 payloads
     */
    'transform-x86'?: string[];

    /**
     * Transform operations for x64 payloads
     */
    'transform-x64'?: string[];
  };

  /**
   * HTTP GET malleable C2 configuration
   */
  'http-get'?: {
    uri?: string;
    verb?: string;
    client?: {
      header?: Array<[string, string]>;
      metadata?: string[];
    };
    server?: {
      header?: Array<[string, string]>;
      output?: string[];
    };
  };

  /**
   * HTTP POST malleable C2 configuration
   */
  'http-post'?: {
    uri?: string;
    verb?: string;
    client?: {
      header?: Array<[string, string]>;
      id?: string[];
      output?: string[];
    };
    server?: {
      header?: Array<[string, string]>;
      output?: string[];
    };
  };

  /**
   * DNS malleable C2 configuration
   */
  dns?: {
    dns_idle?: string;
    dns_sleep?: number;
    maxdns?: number;
    beacon?: string;
    get_A?: string;
    get_AAAA?: string;
    get_TXT?: string;
    put_metadata?: string;
    put_output?: string;
  };
}

/**
 * Enriched CTI document structure from ia-cti_enrichment index
 */
export interface CobaltStrikeCTIDocument {
  /**
   * Document timestamp
   */
  '@timestamp': string;

  /**
   * Beacon payload SHA256 hash
   */
  file_hash_sha256?: string;

  /**
   * Beacon payload MD5 hash
   */
  file_hash_md5?: string;

  /**
   * Beacon payload SHA1 hash
   */
  file_hash_sha1?: string;

  /**
   * Cobalt Strike version detected
   */
  cobalt_strike_version?: string;

  /**
   * Extracted beacon configuration
   */
  cobalt_strike_config?: CobaltStrikeBeaconConfig;

  /**
   * Threat intelligence tags
   */
  threat_intel_tags?: string[];

  /**
   * Source of the CTI data (e.g., 'elastic_endpoint', 'external_feed')
   */
  cti_source?: string;

  /**
   * Confidence score (0-100)
   */
  confidence_score?: number;

  /**
   * First seen timestamp
   */
  first_seen?: string;

  /**
   * Last seen timestamp
   */
  last_seen?: string;

  /**
   * Related campaign identifiers
   */
  campaign_ids?: string[];
}

/**
 * Query parameters for filtering CobaltStrike beacon configurations
 */
export interface BeaconQueryParams {
  /**
   * Filter by beacon type (e.g., 'HTTPS', 'DNS')
   */
  beaconTypes?: string[];

  /**
   * Filter by server hostname pattern (supports wildcards)
   */
  serverHostnamePattern?: string;

  /**
   * Filter by server port or port range
   */
  serverPorts?: number | { min: number; max: number };

  /**
   * Filter by license ID (watermark)
   */
  licenseId?: number;

  /**
   * Filter by public key (exact match)
   */
  publicKey?: string;

  /**
   * Filter by Cobalt Strike version
   */
  version?: string;

  /**
   * Minimum confidence score threshold
   */
  minConfidence?: number;

  /**
   * Date range filter
   */
  dateRange?: {
    gte?: string;
    lte?: string;
  };

  /**
   * Maximum number of results to return
   */
  size?: number;

  /**
   * Results offset for pagination
   */
  from?: number;

  /**
   * Sort field and order
   */
  sort?: {
    field: string;
    order: 'asc' | 'desc';
  };
}

/**
 * Aggregation bucket for beacon clustering
 */
export interface BeaconClusterBucket {
  key: string;
  doc_count: number;
  unique_servers?: {
    value: number;
  };
  unique_hashes?: {
    value: number;
  };
  representative_sample?: {
    hits: {
      hits: Array<{
        _source: CobaltStrikeCTIDocument;
      }>;
    };
  };
}

/**
 * Builds an Elasticsearch query for CobaltStrike beacon configurations
 *
 * @param params - Query filter parameters
 * @returns Elasticsearch query DSL
 */
export const buildBeaconConfigQuery = (params: BeaconQueryParams = {}) => {
  const mustClauses: Array<Record<string, unknown>> = [];
  const filterClauses: Array<Record<string, unknown>> = [];

  // Filter for documents with cobalt_strike_config field
  mustClauses.push({
    exists: { field: 'cobalt_strike_config' },
  });

  // Beacon type filter
  if (params.beaconTypes && params.beaconTypes.length > 0) {
    filterClauses.push({
      terms: {
        'cobalt_strike_config.beacontype': params.beaconTypes,
      },
    });
  }

  // Server hostname pattern filter
  if (params.serverHostnamePattern) {
    filterClauses.push({
      wildcard: {
        'cobalt_strike_config.server.hostname': {
          value: params.serverHostnamePattern,
          case_insensitive: true,
        },
      },
    });
  }

  // Server port filter
  if (params.serverPorts) {
    if (typeof params.serverPorts === 'number') {
      filterClauses.push({
        term: {
          'cobalt_strike_config.server.port': params.serverPorts,
        },
      });
    } else {
      filterClauses.push({
        range: {
          'cobalt_strike_config.server.port': {
            gte: params.serverPorts.min,
            lte: params.serverPorts.max,
          },
        },
      });
    }
  }

  // License ID filter
  if (params.licenseId) {
    filterClauses.push({
      term: {
        'cobalt_strike_config.license_id': params.licenseId,
      },
    });
  }

  // Public key filter (for clustering beacons by Team Server)
  if (params.publicKey) {
    filterClauses.push({
      term: {
        'cobalt_strike_config.server.publickey.keyword': params.publicKey,
      },
    });
  }

  // Cobalt Strike version filter
  if (params.version) {
    filterClauses.push({
      term: {
        'cobalt_strike_version.keyword': params.version,
      },
    });
  }

  // Confidence score threshold
  if (params.minConfidence !== undefined) {
    filterClauses.push({
      range: {
        confidence_score: {
          gte: params.minConfidence,
        },
      },
    });
  }

  // Date range filter
  if (params.dateRange) {
    const rangeFilter: Record<string, unknown> = {};
    if (params.dateRange.gte) {
      rangeFilter.gte = params.dateRange.gte;
    }
    if (params.dateRange.lte) {
      rangeFilter.lte = params.dateRange.lte;
    }
    filterClauses.push({
      range: {
        '@timestamp': rangeFilter,
      },
    });
  }

  const query = {
    bool: {
      must: mustClauses,
      filter: filterClauses,
    },
  };

  const searchBody: Record<string, unknown> = {
    query,
    size: params.size ?? 100,
    from: params.from ?? 0,
  };

  // Sort configuration
  if (params.sort) {
    searchBody.sort = [
      {
        [params.sort.field]: {
          order: params.sort.order,
        },
      },
    ];
  } else {
    // Default sort by timestamp descending
    searchBody.sort = [
      {
        '@timestamp': {
          order: 'desc',
        },
      },
    ];
  }

  return searchBody;
};

/**
 * Builds an aggregation query to cluster beacons by Team Server public key
 * This identifies beacons that share the same Team Server, which is valuable
 * for threat actor infrastructure clustering.
 *
 * @param maxBuckets - Maximum number of Team Server clusters to return
 * @param sampleSize - Number of representative samples per cluster
 * @returns Elasticsearch aggregation DSL
 */
export const buildBeaconClusteringByPublicKeyQuery = (
  maxBuckets: number = 100,
  sampleSize: number = 3
) => {
  return {
    query: {
      bool: {
        must: [
          {
            exists: { field: 'cobalt_strike_config.server.publickey' },
          },
        ],
      },
    },
    size: 0,
    aggs: {
      team_servers: {
        terms: {
          field: 'cobalt_strike_config.server.publickey.keyword',
          size: maxBuckets,
          order: {
            _count: 'desc',
          },
        },
        aggs: {
          unique_servers: {
            cardinality: {
              field: 'cobalt_strike_config.server.hostname.keyword',
            },
          },
          unique_hashes: {
            cardinality: {
              field: 'file_hash_sha256.keyword',
            },
          },
          representative_sample: {
            top_hits: {
              size: sampleSize,
              sort: [
                {
                  '@timestamp': {
                    order: 'desc',
                  },
                },
              ],
              _source: {
                includes: [
                  'file_hash_sha256',
                  'cobalt_strike_config.server',
                  'cobalt_strike_config.beacontype',
                  'cobalt_strike_config.license_id',
                  'cobalt_strike_version',
                  'campaign_ids',
                  '@timestamp',
                ],
              },
            },
          },
        },
      },
    },
  };
};

/**
 * Builds an aggregation query to cluster beacons by license ID (watermark)
 * The license ID is unique per Cobalt Strike license and can be used to
 * attribute multiple campaigns to a single threat actor or group.
 *
 * @param maxBuckets - Maximum number of license ID clusters to return
 * @param sampleSize - Number of representative samples per cluster
 * @returns Elasticsearch aggregation DSL
 */
export const buildBeaconClusteringByLicenseQuery = (
  maxBuckets: number = 100,
  sampleSize: number = 3
) => {
  return {
    query: {
      bool: {
        must: [
          {
            exists: { field: 'cobalt_strike_config.license_id' },
          },
        ],
      },
    },
    size: 0,
    aggs: {
      licenses: {
        terms: {
          field: 'cobalt_strike_config.license_id',
          size: maxBuckets,
          order: {
            _count: 'desc',
          },
        },
        aggs: {
          unique_publickeys: {
            cardinality: {
              field: 'cobalt_strike_config.server.publickey.keyword',
            },
          },
          unique_servers: {
            cardinality: {
              field: 'cobalt_strike_config.server.hostname.keyword',
            },
          },
          versions: {
            terms: {
              field: 'cobalt_strike_version.keyword',
              size: 10,
            },
          },
          representative_sample: {
            top_hits: {
              size: sampleSize,
              sort: [
                {
                  '@timestamp': {
                    order: 'desc',
                  },
                },
              ],
              _source: {
                includes: [
                  'file_hash_sha256',
                  'cobalt_strike_config.server',
                  'cobalt_strike_config.license_id',
                  'cobalt_strike_version',
                  'campaign_ids',
                  '@timestamp',
                ],
              },
            },
          },
        },
      },
    },
  };
};

/**
 * Builds a query to extract unique malleable C2 profiles
 * Malleable C2 profiles define custom communication patterns and can be
 * fingerprinted to identify specific threat actor tradecraft.
 *
 * @param maxProfiles - Maximum number of unique profiles to return
 * @returns Elasticsearch aggregation DSL
 */
export const buildMalleableProfileQuery = (maxProfiles: number = 50) => {
  return {
    query: {
      bool: {
        must: [
          {
            exists: { field: 'cobalt_strike_config.http-get' },
          },
        ],
      },
    },
    size: 0,
    aggs: {
      http_get_uris: {
        terms: {
          field: 'cobalt_strike_config.http-get.uri.keyword',
          size: maxProfiles,
        },
        aggs: {
          http_post_uris: {
            terms: {
              field: 'cobalt_strike_config.http-post.uri.keyword',
              size: 10,
            },
          },
          user_agents: {
            terms: {
              script: {
                source: `
                  if (doc.containsKey('cobalt_strike_config.http-get.client.header')) {
                    def headers = doc['cobalt_strike_config.http-get.client.header'];
                    for (header in headers) {
                      if (header.startsWith('User-Agent:')) {
                        return header;
                      }
                    }
                  }
                  return 'unknown';
                `,
                lang: 'painless',
              },
              size: 10,
            },
          },
          sample_configs: {
            top_hits: {
              size: 2,
              _source: {
                includes: [
                  'cobalt_strike_config.http-get',
                  'cobalt_strike_config.http-post',
                  'cobalt_strike_config.dns',
                  'file_hash_sha256',
                  '@timestamp',
                ],
              },
            },
          },
        },
      },
    },
  };
};

/**
 * Builds a query for threat intelligence enrichment lookup
 * Given a hash, hostname, or IP, retrieves all associated beacon configurations
 *
 * @param indicator - The IOC to lookup (hash, hostname, or IP)
 * @param indicatorType - Type of indicator ('hash', 'hostname', 'ip')
 * @returns Elasticsearch query DSL
 */
export const buildThreatIntelLookupQuery = (
  indicator: string,
  indicatorType: 'hash' | 'hostname' | 'ip'
) => {
  const shouldClauses: Array<Record<string, unknown>> = [];

  if (indicatorType === 'hash') {
    shouldClauses.push(
      { term: { 'file_hash_sha256.keyword': indicator } },
      { term: { 'file_hash_md5.keyword': indicator } },
      { term: { 'file_hash_sha1.keyword': indicator } }
    );
  } else if (indicatorType === 'hostname') {
    shouldClauses.push({
      term: { 'cobalt_strike_config.server.hostname.keyword': indicator },
    });
  } else if (indicatorType === 'ip') {
    shouldClauses.push({
      term: { 'cobalt_strike_config.server.ip.keyword': indicator },
    });
  }

  return {
    query: {
      bool: {
        must: [
          {
            exists: { field: 'cobalt_strike_config' },
          },
        ],
        should: shouldClauses,
        minimum_should_match: 1,
      },
    },
    size: 100,
    sort: [
      {
        '@timestamp': {
          order: 'desc',
        },
      },
    ],
  };
};

/**
 * Builds a time-series aggregation for beacon activity trends
 * Useful for understanding deployment patterns and campaign timelines
 *
 * @param interval - Time bucket interval (e.g., '1d', '1w', '1M')
 * @param dateRange - Optional date range filter
 * @returns Elasticsearch aggregation DSL
 */
export const buildBeaconTimelineQuery = (
  interval: string = '1d',
  dateRange?: { gte?: string; lte?: string }
) => {
  const query: Record<string, unknown> = {
    bool: {
      must: [
        {
          exists: { field: 'cobalt_strike_config' },
        },
      ],
    },
  };

  if (dateRange) {
    const rangeFilter: Record<string, unknown> = {};
    if (dateRange.gte) rangeFilter.gte = dateRange.gte;
    if (dateRange.lte) rangeFilter.lte = dateRange.lte;

    query.bool.filter = [
      {
        range: {
          '@timestamp': rangeFilter,
        },
      },
    ];
  }

  return {
    query,
    size: 0,
    aggs: {
      beacon_timeline: {
        date_histogram: {
          field: '@timestamp',
          calendar_interval: interval,
          min_doc_count: 0,
        },
        aggs: {
          unique_beacons: {
            cardinality: {
              field: 'file_hash_sha256.keyword',
            },
          },
          unique_servers: {
            cardinality: {
              field: 'cobalt_strike_config.server.hostname.keyword',
            },
          },
          beacon_types: {
            terms: {
              field: 'cobalt_strike_config.beacontype',
              size: 10,
            },
          },
        },
      },
    },
  };
};
