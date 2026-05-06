/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { transformError } from '@kbn/securitysolution-es-utils';
import { buildSiemResponse } from '@kbn/lists-plugin/server/routes/utils';
import type { ElasticsearchClient } from '@kbn/core/server';

import {
  ARGUS_PLAYBOOK_TAG,
  PLAYBOOKS_INDEX_ROUTE,
  type ArgusPlaybook,
  type ArgusPlaybookIndexResponse,
  type ArgusPlaybookUserIntent,
} from '@kbn/argus-console-common';

import {
  ARGUS_ASSESS_CVE_SKILL_ID,
  ARGUS_ASSESS_READINESS_SKILL_ID,
  ARGUS_EMULATE_ACTOR_SKILL_ID,
  ARGUS_FIND_DATASOURCE_GAPS_SKILL_ID,
  ARGUS_REVIEW_RULE_QUALITY_SKILL_ID,
  ARGUS_RUN_PURPLE_TEAM_SKILL_ID,
} from '../../../agent_builder/skills/argus_playbooks/constants';

import type { ArgusRoutesDeps } from '../types';

const WORKFLOW_REGISTRY_INDEX = '.soc-workflow-registry';

/**
 * Skills are registered server-side via `defineSkillType`, but that type does
 * not expose a `tags` field today. We keep the canonical list hardcoded here
 * so the live discovery route returns skills with the same metadata operators
 * see in Agent Builder chat. If a skill is added/removed the list must be
 * updated in lock-step; the skill ids are constants so the compiler will
 * complain if one is deleted.
 *
 * `origin` maps to the `argus.origin` tag style used elsewhere in the UI so
 * the Playbooks table shows a consistent badge across workflows and skills.
 */
const ARGUS_PLAYBOOK_SKILLS: readonly ArgusPlaybook[] = [
  {
    id: ARGUS_ASSESS_READINESS_SKILL_ID,
    kind: 'skill',
    name: 'Assess readiness',
    description:
      'Quick readiness read for a named threat profile. Summarises gaps and offers to file gap_analysis intents.',
    origin: 'gap_analysis',
    user_intent: 'readiness_assessment',
  },
  {
    id: ARGUS_EMULATE_ACTOR_SKILL_ID,
    kind: 'skill',
    name: 'Emulate actor',
    description:
      'Actor-focused coverage review. Correlates MITRE techniques against recent telemetry and optionally opens a case.',
    canonical_of: 'soc_argus_playbook_runner',
    user_intent: 'actor_escalation',
  },
  {
    id: ARGUS_RUN_PURPLE_TEAM_SKILL_ID,
    kind: 'skill',
    name: 'Run purple team',
    description:
      'Multi-step, write-heavy purple-team exercise. Summarises coverage, backtests rules, files gap intents, and opens a case.',
    user_intent: 'purple_team',
  },
  {
    id: ARGUS_ASSESS_CVE_SKILL_ID,
    kind: 'skill',
    name: 'Assess CVE',
    description:
      'Check whether a specific CVE is on ARGUS’s radar, has coverage, and optionally trigger the Exploit→Detection pipeline.',
    origin: 'cti_ingest',
    canonical_of: 'soc_argus_exploit_to_detection',
    user_intent: 'new_cve',
  },
  {
    id: ARGUS_FIND_DATASOURCE_GAPS_SKILL_ID,
    kind: 'skill',
    name: 'Find datasource gaps',
    description:
      'Surface detection gaps grouped by data source. Calls out single-source dependencies and offers to file intents.',
    origin: 'gap_analysis',
    user_intent: 'datasource_gap',
  },
  {
    id: ARGUS_REVIEW_RULE_QUALITY_SKILL_ID,
    kind: 'skill',
    name: 'Review rule quality',
    description:
      'Read-only: recent backtest metrics, governance decisions, and trajectory for a specific rule. Never writes.',
    user_intent: 'rule_review',
  },
];

/**
 * Human-readable name map for workflow ids. The registry stores a
 * machine-friendly `workflow_id` and a `summary` paragraph; we map the id to
 * a short display name rendered in the Playbooks table header column. Any
 * workflow id not in this map falls back to `workflow_id` verbatim so the
 * list still works for workflows added after this map was last edited.
 */
const WORKFLOW_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  soc_argus_playbook_runner: 'ARGUS playbook runner',
  soc_argus_exploit_to_detection: 'Exploit → Detection reconciler',
  soc_gap_analyzer: 'Gap analyzer',
  soc_argus_drift_monitor: 'Drift monitor',
  soc_argus_redundancy_scanner: 'Redundancy scanner',
  soc_proactive_hunter: 'Proactive hunter',
  soc_argus_frontier_simulator: 'Frontier simulator',
  soc_argus_arm_mythos_preset: 'Arm Mythos preset',
  soc_demo_1_runner: 'Demo · Same-day CVE → Detection',
  soc_demo_2_runner: 'Demo · Polymorphic variant swarm',
  soc_deteng: 'Detection engineering',
  soc_arch_reviewer: 'Architecture reviewer',
  soc_kev_ingest: 'KEV advisory ingest',
};

/**
 * Map a workflow id to an `argus.origin`-style badge value where the tag is
 * meaningful. Not every workflow has a clean origin; those return undefined.
 */
const WORKFLOW_ORIGIN_BADGES: Readonly<Record<string, string>> = {
  soc_argus_exploit_to_detection: 'cti_ingest',
  soc_gap_analyzer: 'gap_analysis',
  soc_argus_redundancy_scanner: 'consolidation',
  soc_kev_ingest: 'cti_ingest',
};

/**
 * Map a workflow id to its canonical user-intent grouping key. The Console
 * uses this to collapse entries that serve the same user goal (a skill
 * wrapper + its canonical workflow, or two related workflows) into a
 * single row.
 */
const WORKFLOW_USER_INTENTS: Readonly<Record<string, ArgusPlaybookUserIntent>> = {
  soc_argus_exploit_to_detection: 'new_cve',
  soc_gap_analyzer: 'coverage_gap',
  soc_argus_redundancy_scanner: 'redundancy_scan',
  soc_argus_drift_monitor: 'drift_monitor',
};

interface RawWorkflowRegistryDoc {
  workflow_id?: string;
  summary?: string;
  tags?: readonly string[];
  last_seeded_at?: string;
  /**
   * Saved-object `_id` of the matching workflow in the Kibana Workflows
   * Management storage index (typically `workflow-<uuid>`). Populated by
   * `soc-simulation/scripts/resolve_workflow_ids.sh` after workflows are
   * bulk-imported; absent until the resolver runs. Carried through to the
   * ARGUS Playbooks tab so the "Run" action can deep-link to the correct
   * `/app/workflows/<id>` URL instead of the slug (which 404s).
   */
  kibana_workflow_id?: string;
}

const fetchRegistryPlaybooks = async (
  esClient: ElasticsearchClient
): Promise<{ entries: ArgusPlaybook[]; registryLastSeededAt: string | null }> => {
  const res = await esClient.search<RawWorkflowRegistryDoc>({
    index: WORKFLOW_REGISTRY_INDEX,
    ignore_unavailable: true,
    size: 200,
    _source: ['workflow_id', 'summary', 'tags', 'last_seeded_at', 'kibana_workflow_id'],
    track_total_hits: false,
    sort: [{ 'workflow_id.keyword': { order: 'asc', unmapped_type: 'keyword' } }],
    query: {
      bool: {
        filter: [{ term: { tags: ARGUS_PLAYBOOK_TAG } }],
      },
    },
  });

  const entries: ArgusPlaybook[] = [];
  let latestSeededAt: string | null = null;

  for (const hit of res.hits.hits) {
    const src = hit._source;
    if (src && typeof src.workflow_id === 'string' && src.workflow_id.length > 0) {
      const id = src.workflow_id;
      const description = typeof src.summary === 'string' ? src.summary : '';
      const name = WORKFLOW_DISPLAY_NAMES[id] ?? id;
      const origin = WORKFLOW_ORIGIN_BADGES[id];
      const userIntent = WORKFLOW_USER_INTENTS[id];
      const kibanaWorkflowId =
        typeof src.kibana_workflow_id === 'string' && src.kibana_workflow_id.length > 0
          ? src.kibana_workflow_id
          : undefined;
      entries.push({
        id,
        kind: 'workflow',
        name,
        description,
        ...(origin ? { origin } : {}),
        ...(userIntent ? { user_intent: userIntent } : {}),
        ...(kibanaWorkflowId ? { kibana_workflow_id: kibanaWorkflowId } : {}),
      });
      if (typeof src.last_seeded_at === 'string') {
        if (!latestSeededAt || src.last_seeded_at > latestSeededAt) {
          latestSeededAt = src.last_seeded_at;
        }
      }
    }
  }

  return { entries, registryLastSeededAt: latestSeededAt };
};

export const registerPlaybooksIndexRoute = ({ router, logger }: ArgusRoutesDeps) => {
  router.versioned
    .get({
      access: 'internal',
      path: PLAYBOOKS_INDEX_ROUTE,
      security: { authz: { requiredPrivileges: ['securitySolution'] } },
    })
    .addVersion({ version: '1', validate: false }, async (context, _request, response) => {
      const siemResponse = buildSiemResponse(response);
      try {
        const core = await context.core;
        const esClient = core.elasticsearch.client.asCurrentUser;
        const { entries: workflowEntries, registryLastSeededAt } = await fetchRegistryPlaybooks(
          esClient
        );
        const body: ArgusPlaybookIndexResponse = {
          entries: [...workflowEntries, ...ARGUS_PLAYBOOK_SKILLS],
          registry_last_seeded_at: registryLastSeededAt,
        };
        return response.ok({ body });
      } catch (err) {
        const error = transformError(err);
        logger.error(`ARGUS playbooks index route failed: ${error.message}`);
        return siemResponse.error({ statusCode: error.statusCode, body: error.message });
      }
    });
};
