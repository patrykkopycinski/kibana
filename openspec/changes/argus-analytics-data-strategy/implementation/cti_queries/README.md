# CobaltStrike Beacon Configuration Query Library

This library provides typed query builders for extracting and analyzing CobaltStrike beacon configurations from the `ia-cti_enrichment` index on the analytics cluster.

## Overview

CobaltStrike is a commercial penetration testing tool frequently abused by threat actors. Beacon configurations contain valuable threat intelligence including:

- **C2 Infrastructure**: Server hostnames, IP addresses, and ports
- **Team Server Attribution**: Public keys unique to each Team Server instance
- **License Watermarks**: License IDs that can tie multiple campaigns together
- **Malleable C2 Profiles**: Custom communication patterns that fingerprint threat actor tradecraft
- **Behavioral Configuration**: Sleep times, jitter, process injection techniques

This library enables the ARGUS analytics pipeline to query and cluster beacon configurations for:
1. **Threat Intelligence Advisories**: Feeding C2 indicators into `.soc-cve-advisories` for detection generation
2. **Campaign Attribution**: Clustering beacons by Team Server public key or license ID
3. **Tradecraft Analysis**: Identifying unique malleable C2 profiles
4. **Timeline Analysis**: Tracking beacon deployment trends over time

## Installation

```typescript
import {
  buildBeaconConfigQuery,
  buildBeaconClusteringByPublicKeyQuery,
  buildBeaconClusteringByLicenseQuery,
  buildMalleableProfileQuery,
  buildThreatIntelLookupQuery,
  buildBeaconTimelineQuery,
} from './cobalt_strike_beacon_query';
```

## Query Builders

### `buildBeaconConfigQuery(params?: BeaconQueryParams)`

Builds a filtered search query for beacon configurations.

**Parameters:**
- `beaconTypes`: Filter by communication protocol (e.g., `['HTTPS', 'DNS']`)
- `serverHostnamePattern`: Wildcard pattern for C2 hostnames (e.g., `'*.cloud'`)
- `serverPorts`: Single port or range (`443` or `{ min: 8000, max: 9000 }`)
- `licenseId`: Cobalt Strike license identifier (watermark)
- `publicKey`: Team Server public key for exact matching
- `version`: Cobalt Strike version (e.g., `'4.4'`)
- `minConfidence`: Minimum confidence score threshold (0-100)
- `dateRange`: Time window (`{ gte: '2024-01-01', lte: '2024-12-31' }`)
- `size`: Results limit (default: 100)
- `from`: Pagination offset (default: 0)
- `sort`: Custom sort field and order

**Example:**
```typescript
const query = buildBeaconConfigQuery({
  beaconTypes: ['HTTPS'],
  serverHostnamePattern: '*.cloud',
  minConfidence: 90,
  dateRange: {
    gte: '2024-01-01',
  },
});

const results = await esClient.search({
  index: 'ia-cti_enrichment',
  body: query,
});
```

### `buildBeaconClusteringByPublicKeyQuery(maxBuckets?, sampleSize?)`

Clusters beacons by Team Server public key. Each Team Server uses a unique RSA public key to encrypt beacon communications, making this an excellent pivot for infrastructure attribution.

**Parameters:**
- `maxBuckets`: Maximum number of Team Server clusters (default: 100)
- `sampleSize`: Representative samples per cluster (default: 3)

**Returns Aggregations:**
- `team_servers`: Buckets keyed by public key
- `unique_servers`: Cardinality of hostnames per Team Server
- `unique_hashes`: Cardinality of beacon hashes per Team Server
- `representative_sample`: Sample beacon documents

**Example:**
```typescript
const query = buildBeaconClusteringByPublicKeyQuery(50, 3);

const results = await esClient.search({
  index: 'ia-cti_enrichment',
  body: query,
});

// Access clusters
const clusters = results.aggregations.team_servers.buckets;
clusters.forEach((cluster) => {
  console.log(`Public Key: ${cluster.key}`);
  console.log(`Beacon Count: ${cluster.doc_count}`);
  console.log(`Unique Servers: ${cluster.unique_servers.value}`);
  console.log(`Unique Hashes: ${cluster.unique_hashes.value}`);
});
```

**Use Case:** Identifying that 15 different beacon samples across 8 different C2 domains all share the same Team Server public key indicates they belong to the same threat actor infrastructure.

### `buildBeaconClusteringByLicenseQuery(maxBuckets?, sampleSize?)`

Clusters beacons by Cobalt Strike license ID (watermark). The license ID is a 9-digit value unique per license and can tie multiple campaigns to a single threat actor or group.

**Parameters:**
- `maxBuckets`: Maximum number of license clusters (default: 100)
- `sampleSize`: Representative samples per cluster (default: 3)

**Returns Aggregations:**
- `licenses`: Buckets keyed by license ID
- `unique_publickeys`: Cardinality of Team Server public keys per license
- `unique_servers`: Cardinality of C2 hostnames per license
- `versions`: Distribution of Cobalt Strike versions
- `representative_sample`: Sample beacon documents

**Example:**
```typescript
const query = buildBeaconClusteringByLicenseQuery();

const results = await esClient.search({
  index: 'ia-cti_enrichment',
  body: query,
});

const licenses = results.aggregations.licenses.buckets;
licenses.forEach((license) => {
  console.log(`License ID: ${license.key}`);
  console.log(`Beacon Count: ${license.doc_count}`);
  console.log(`Team Servers: ${license.unique_publickeys.value}`);
  console.log(`Versions: ${license.versions.buckets.map((v) => v.key).join(', ')}`);
});
```

**Use Case:** A single license ID associated with 50 beacons across 3 different Team Servers suggests a persistent threat actor using the same cracked/leaked license across multiple campaigns.

### `buildMalleableProfileQuery(maxProfiles?)`

Extracts unique malleable C2 profiles. Malleable C2 profiles define custom communication patterns (HTTP URIs, headers, DNS queries) and can fingerprint specific threat actor tradecraft.

**Parameters:**
- `maxProfiles`: Maximum number of unique profiles (default: 50)

**Returns Aggregations:**
- `http_get_uris`: HTTP GET URI patterns
- `http_post_uris`: HTTP POST URI patterns (nested under GET)
- `user_agents`: User-Agent strings (nested under GET)
- `sample_configs`: Full malleable profile examples

**Example:**
```typescript
const query = buildMalleableProfileQuery(25);

const results = await esClient.search({
  index: 'ia-cti_enrichment',
  body: query,
});

const profiles = results.aggregations.http_get_uris.buckets;
profiles.forEach((profile) => {
  console.log(`GET URI: ${profile.key}`);
  console.log(`POST URIs: ${profile.http_post_uris.buckets.map((b) => b.key).join(', ')}`);
  console.log(`User-Agents: ${profile.user_agents.buckets.map((b) => b.key).join(', ')}`);
});
```

**Use Case:** Identifying that beacons consistently use `/api/v1/updates` for GET and `/api/v1/upload` for POST with a specific User-Agent pattern can be used to create a detection rule for that tradecraft signature.

### `buildThreatIntelLookupQuery(indicator, indicatorType)`

Performs threat intelligence enrichment lookup. Given an IOC (hash, hostname, or IP), retrieves all associated beacon configurations.

**Parameters:**
- `indicator`: The IOC value
- `indicatorType`: `'hash'`, `'hostname'`, or `'ip'`

**Example:**
```typescript
// Hash lookup
const hashQuery = buildThreatIntelLookupQuery(
  '697fddfc5195828777622236f2b133c0a24a6d0dc539ae7da41798c4456a3f89',
  'hash'
);

// Hostname lookup
const hostnameQuery = buildThreatIntelLookupQuery('clevelandclinic.cloud', 'hostname');

// IP lookup
const ipQuery = buildThreatIntelLookupQuery('104.197.142.19', 'ip');

const results = await esClient.search({
  index: 'ia-cti_enrichment',
  body: hashQuery,
});
```

**Use Case:** When an endpoint alert triggers on a suspicious binary, lookup the hash to retrieve associated C2 infrastructure, license IDs, and Team Server public keys for context enrichment.

### `buildBeaconTimelineQuery(interval?, dateRange?)`

Generates time-series aggregation for beacon activity trends. Useful for understanding deployment patterns and campaign timelines.

**Parameters:**
- `interval`: Calendar interval (`'1d'`, `'1w'`, `'1M'`) (default: `'1d'`)
- `dateRange`: Optional time window

**Returns Aggregations:**
- `beacon_timeline`: Date histogram buckets
- `unique_beacons`: Cardinality of beacon hashes per time bucket
- `unique_servers`: Cardinality of C2 hostnames per time bucket
- `beacon_types`: Distribution of beacon types per time bucket

**Example:**
```typescript
const query = buildBeaconTimelineQuery('1w', {
  gte: '2024-01-01',
  lte: '2024-12-31',
});

const results = await esClient.search({
  index: 'ia-cti_enrichment',
  body: query,
});

const timeline = results.aggregations.beacon_timeline.buckets;
timeline.forEach((bucket) => {
  console.log(`Week: ${bucket.key_as_string}`);
  console.log(`Unique Beacons: ${bucket.unique_beacons.value}`);
  console.log(`Unique Servers: ${bucket.unique_servers.value}`);
  console.log(`Types: ${bucket.beacon_types.buckets.map((t) => `${t.key} (${t.doc_count})`).join(', ')}`);
});
```

**Use Case:** Visualizing a spike in HTTPS beacons during Q3 2024 indicates a potential campaign surge that should be investigated.

## Data Schema

### CobaltStrikeCTIDocument

```typescript
interface CobaltStrikeCTIDocument {
  '@timestamp': string;
  file_hash_sha256?: string;
  file_hash_md5?: string;
  file_hash_sha1?: string;
  cobalt_strike_version?: string;
  cobalt_strike_config?: CobaltStrikeBeaconConfig;
  threat_intel_tags?: string[];
  cti_source?: string;
  confidence_score?: number;
  first_seen?: string;
  last_seen?: string;
  campaign_ids?: string[];
}
```

### CobaltStrikeBeaconConfig

```typescript
interface CobaltStrikeBeaconConfig {
  beacontype: string[];
  sleeptime: number;
  jitter: number;
  license_id: number;
  server: {
    hostname: string;
    port: number;
    publickey: string;
  };
  'process-inject'?: {
    allocator?: string;
    execute?: string[];
    stub?: string; // Base64-encoded MD5 of CS JAR
  };
  'http-get'?: {
    uri?: string;
    client?: { header?: Array<[string, string]> };
  };
  'http-post'?: {
    uri?: string;
    client?: { header?: Array<[string, string]> };
  };
  dns?: {
    beacon?: string;
    get_A?: string;
    get_TXT?: string;
  };
}
```

## Integration with ARGUS

### Workflow: `soc-argus-intel-adapter-analytics`

This workflow runs daily and:
1. Queries `ia-cti_enrichment` for new CobaltStrike beacons
2. Clusters beacons by Team Server and license ID
3. Extracts C2 infrastructure indicators (hostnames, IPs, ports)
4. Writes threat intelligence to `.soc-cve-advisories` index
5. Triggers detection generation for high-confidence indicators

**Example Workflow Step:**
```typescript
import { buildBeaconConfigQuery } from './cobalt_strike_beacon_query';

// Query for high-confidence beacons from the last 24 hours
const query = buildBeaconConfigQuery({
  minConfidence: 90,
  dateRange: {
    gte: 'now-24h',
  },
  size: 1000,
});

const beacons = await analyticsClient.search({
  index: 'ia-cti_enrichment',
  body: query,
});

// Extract C2 indicators
const c2Indicators = beacons.hits.hits.map((hit) => ({
  hostname: hit._source.cobalt_strike_config.server.hostname,
  port: hit._source.cobalt_strike_config.server.port,
  beaconType: hit._source.cobalt_strike_config.beacontype,
  confidence: hit._source.confidence_score,
}));

// Write to advisory index
await argusClient.bulk({
  body: c2Indicators.flatMap((indicator) => [
    { index: { _index: '.soc-cve-advisories' } },
    {
      '@timestamp': new Date().toISOString(),
      indicator_type: 'c2_infrastructure',
      indicator_value: indicator.hostname,
      source: 'ia-cti_enrichment',
      confidence: indicator.confidence,
      metadata: {
        port: indicator.port,
        beacon_type: indicator.beaconType,
      },
    },
  ]),
});
```

## Testing

Run the test suite:
```bash
npm test -- cobalt_strike_beacon_query.test.ts
```

Tests cover:
- All query builder functions
- Filter combinations
- Aggregation configurations
- Edge cases (empty results, missing fields)
- Type safety

## References

- [Elastic Security Labs: Extracting CobaltStrike Beacon Configurations](https://www.elastic.co/security-labs/extracting-cobalt-strike-beacon-configurations)
- [Elastic Security Labs: Collecting CobaltStrike Beacons](https://www.elastic.co/security-labs/collecting-cobalt-strike-beacons-with-the-elastic-stack)
- [Blackberry: Finding Beacons in the Dark](https://www.blackberry.com/us/en/forms/enterprise/ebook-beacons-in-the-dark)
- [CobaltStrike Malleable C2 Documentation](https://www.cobaltstrike.com/help-malleable-c2)
- [Cobalt Strike Configuration Extractor (CSCE)](https://github.com/strozfriedberg/cobaltstrike-config-extractor)

## License

Copyright Elasticsearch B.V. Licensed under the Elastic License 2.0.
