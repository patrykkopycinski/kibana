/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Pairwise routing-boundary dataset for the endpoint-forensic-analysis collision eval.
 *
 * `endpoint-forensic-analysis` is shipped dark behind
 * `xpack.securitySolution.enableExperimental=[endpointForensicAnalysisSkill]`. Enabling it adds a
 * fourth DFIR-shaped skill to a catalog that already carries three skills whose descriptions
 * disambiguate against each other in prose only, and Agent Builder routing is additive-only: no
 * skill can remove a competitor from the catalog. A collision therefore only shows up behaviourally.
 *
 * Every example sits on a named pairwise boundary and declares which skill OWNS the request:
 *  - `sibling-owns`    - the request belongs to the sibling; loading endpoint-forensic-analysis is the
 *                        collision (misroute). `expectedSkill` is the sibling, so `ExpectedSkillInvocation`
 *                        scores 0 on any misroute; which skill was actually loaded is read off
 *                        `loadedNames` in the evaluator metadata.
 *  - `az-owns`         - the request belongs to endpoint-forensic-analysis; a sibling winning it is the
 *                        reverse collision.
 *  - `az-must-not-load` - endpoint-forensic-analysis must not load at all (capabilities the skill
 *                        explicitly disclaims with no replacement skill).
 *
 * `siblingSkill` names the specific sibling a misroute would most plausibly go to, so a per-pair
 * matrix can be built from `loadedNames` without re-deriving intent from the prompt.
 */

export type CollisionDirection = 'sibling-owns' | 'az-owns' | 'az-must-not-load';
export type SkillId =
  | 'endpoint-forensic-analysis'
  | 'threat-hunting'
  | 'alert-analysis'
  | 'elastic-defend-configuration-troubleshooting';

export interface CollisionExample {
  id: string;
  question: string;
  expected: string;
  metadata: {
    exampleId: string;
    pair: string;
    direction: CollisionDirection;
    siblingSkill?: SkillId;
    expectedSkill?: SkillId;
    shouldNotActivateSkill?: SkillId;
    boundary: string;
  };
}

const AZ = 'endpoint-forensic-analysis' as const;
const HUNT = 'threat-hunting' as const;
const ALERTS = 'alert-analysis' as const;
const TROUBLE = 'elastic-defend-configuration-troubleshooting' as const;

export const COLLISION_EXAMPLES: CollisionExample[] = [
  // ---------------------------------------------------------------- pair: vs threat-hunting
  {
    id: 'hunt_fleet_lateral_no_host',
    question:
      'Hunt for lateral movement across my whole environment over the last 7 days. I do not care about any single host — I want to know which lateral-movement techniques are showing up fleet-wide and how often.',
    expected:
      'Routes to threat-hunting and runs a fleet-wide hunt (ES|QL over the whole environment). It must not scope the hunt to a single host, and it must not produce a host-scoped forensic reconstruction.',
    metadata: {
      exampleId: 'hunt_fleet_lateral_no_host',
      pair: 'az-vs-threat-hunting',
      direction: 'sibling-owns',
      siblingSkill: AZ,
      expectedSkill: HUNT,
      boundary: 'lateral movement, but fleet-wide and host-agnostic',
    },
  },
  {
    id: 'hunt_fleet_lateral_named_hosts_adversarial',
    question:
      'Which hosts have lateral-movement indicators this week? To be clear I am NOT asking about one incident: win-dc-01 and lon-app-07 are just the two hosts I happen to remember, I want the pattern across the fleet.',
    expected:
      'Routes to threat-hunting: the analyst explicitly asks for a fleet-wide pattern, so naming two hosts in passing must not pull the request into a host-scoped forensic reconstruction.',
    metadata: {
      exampleId: 'hunt_fleet_lateral_named_hosts_adversarial',
      pair: 'az-vs-threat-hunting',
      direction: 'sibling-owns',
      siblingSkill: AZ,
      expectedSkill: HUNT,
      boundary: 'hosts named in passing while the request stays fleet-wide (adversarial)',
    },
  },
  {
    id: 'az_lateral_chain_named_hosts',
    question:
      'Reconstruct how the attacker moved between win-dc-01, lon-app-07 and fin-db-02 last Tuesday, in order, with the evidence for each hop.',
    expected:
      'Routes to endpoint-forensic-analysis: an incident-scoped lateral-movement chain between named hosts is exactly the host-scoped forensic reconstruction, not a fleet-wide hunt.',
    metadata: {
      exampleId: 'az_lateral_chain_named_hosts',
      pair: 'az-vs-threat-hunting',
      direction: 'az-owns',
      siblingSkill: HUNT,
      expectedSkill: AZ,
      boundary: 'lateral movement between named hosts, incident-scoped',
    },
  },
  {
    id: 'az_patient_zero',
    question: 'Which host was patient zero for the outbreak that hit us on Sunday?',
    expected:
      'Routes to endpoint-forensic-analysis and performs patient-zero identification across the enrolled hosts involved, rather than a fleet-wide technique hunt.',
    metadata: {
      exampleId: 'az_patient_zero',
      pair: 'az-vs-threat-hunting',
      direction: 'az-owns',
      siblingSkill: HUNT,
      expectedSkill: AZ,
      boundary: 'patient zero: incident-scoped, host-centric',
    },
  },

  // ---------------------------------------------------------------- pair: vs alert-analysis
  {
    id: 'alerts_triage_by_id',
    question:
      'Alert d8f21c40-6b1e-11f0-9a3f-0e5b1f7a2c11 just fired — is this a true positive or a false positive?',
    expected:
      'Routes to alert-analysis: triage of a specific alert by its ID is alert-analysis, not forensic reconstruction and not forensic timeline building.',
    metadata: {
      exampleId: 'alerts_triage_by_id',
      pair: 'az-vs-alert-analysis',
      direction: 'sibling-owns',
      siblingSkill: AZ,
      expectedSkill: ALERTS,
      boundary: 'alert triage by alert ID',
    },
  },
  {
    id: 'alerts_priority_inventory',
    question:
      'What are my highest-severity detection alerts in the last 24 hours, and which ones involve the finance entities?',
    expected:
      'Routes to alert-analysis: counting, prioritising and listing detection alerts is alert queue work, not host forensics.',
    metadata: {
      exampleId: 'alerts_priority_inventory',
      pair: 'az-vs-alert-analysis',
      direction: 'sibling-owns',
      siblingSkill: AZ,
      expectedSkill: ALERTS,
      boundary: 'alert inventory/prioritisation, no host named',
    },
  },
  {
    id: 'az_timeline_from_alert_symptom',
    question:
      "We were paged overnight about an intrusion on fin-db-02. Build me the attack timeline on that host from the first suspicious process through to the last action, with timestamps.",
    expected:
      'Routes to endpoint-forensic-analysis: the request is a host-scoped attack timeline. It must not be answered as alert listing/triage (no alert ID is given) and must not be answered as a fleet-wide hunt.',
    metadata: {
      exampleId: 'az_timeline_from_alert_symptom',
      pair: 'az-vs-alert-analysis',
      direction: 'az-owns',
      siblingSkill: ALERTS,
      expectedSkill: AZ,
      boundary: 'host timeline stemming from an alert symptom, no alert ID given',
    },
  },
  {
    id: 'az_persistence_enum',
    question:
      'Enumerate the persistence mechanisms installed on lon-app-07 during the incident — services, scheduled tasks, autoruns, that kind of thing.',
    expected:
      'Routes to endpoint-forensic-analysis: persistence enumeration on a named host during an incident.',
    metadata: {
      exampleId: 'az_persistence_enum',
      pair: 'az-vs-alert-analysis',
      direction: 'az-owns',
      siblingSkill: ALERTS,
      expectedSkill: AZ,
      boundary: 'persistence enumeration on a named host',
    },
  },

  // -------------------------------------------- pair: vs elastic-defend-configuration-troubleshooting
  {
    id: 'trouble_av_conflict_named_host',
    question:
      'win-dc-01 keeps reporting a conflicting third-party antivirus even though we uninstalled it — is this a Defend incompatibility or a policy mistake?',
    expected:
      'Routes to elastic-defend-configuration-troubleshooting: an incompatible-software / policy-configuration question about a named host is explicitly not forensics, even though a host is named.',
    metadata: {
      exampleId: 'trouble_av_conflict_named_host',
      pair: 'az-vs-defend-config-troubleshooting',
      direction: 'sibling-owns',
      siblingSkill: AZ,
      expectedSkill: TROUBLE,
      boundary: 'AV conflict on a named host (names a host but is config, not forensics)',
    },
  },
  {
    id: 'trouble_missed_checkins',
    question:
      'lon-app-07 has not checked in for two days and its Defend integration shows as unhealthy. Why is it failing to enrol?',
    expected:
      'Routes to elastic-defend-configuration-troubleshooting: endpoint health / missed check-ins / enrolment failure on a named host.',
    metadata: {
      exampleId: 'trouble_missed_checkins',
      pair: 'az-vs-defend-config-troubleshooting',
      direction: 'sibling-owns',
      siblingSkill: AZ,
      expectedSkill: TROUBLE,
      boundary: 'endpoint health / missed check-ins on a named host',
    },
  },
  {
    id: 'trouble_high_cpu',
    question:
      'The Elastic Defend agent on fin-db-02 is eating 40% CPU and hurting the database. How do I troubleshoot the resource usage?',
    expected:
      'Routes to elastic-defend-configuration-troubleshooting: performance/resource troubleshooting of the Defend agent on a named host.',
    metadata: {
      exampleId: 'trouble_high_cpu',
      pair: 'az-vs-defend-config-troubleshooting',
      direction: 'sibling-owns',
      siblingSkill: AZ,
      expectedSkill: TROUBLE,
      boundary: 'Defend agent resource troubleshooting on a named host',
    },
  },

  // --------------------------------------------------- az-must-not-load (disclaimed capabilities)
  {
    id: 'az_deny_host_isolation',
    question: 'Isolate win-dc-01 from the network right now.',
    expected:
      'Does not load endpoint-forensic-analysis: the skill is read-only and explicitly disclaims host isolation and other response actions. The analyst is directed to Endpoint response actions in Security instead of a forensic reconstruction.',
    metadata: {
      exampleId: 'az_deny_host_isolation',
      pair: 'az-disclaimed',
      direction: 'az-must-not-load',
      shouldNotActivateSkill: AZ,
      boundary: 'host isolation (write action the skill disclaims)',
    },
  },
  {
    id: 'az_deny_file_retrieve',
    question: 'Pull the file /tmp/stage2.bin off lon-app-07 so I can upload it to VirusTotal.',
    expected:
      'Does not load endpoint-forensic-analysis: file retrieval is a response action the skill explicitly disclaims; the analyst is directed to Endpoint response actions in Security.',
    metadata: {
      exampleId: 'az_deny_file_retrieve',
      pair: 'az-disclaimed',
      direction: 'az-must-not-load',
      shouldNotActivateSkill: AZ,
      boundary: 'file retrieval (write action the skill disclaims)',
    },
  },
];

/**
 * Optional `EVAL_EXAMPLES=<id1>,<id2>` filter, matching the convention used by the other
 * agent-builder datasets so a targeted rerun measures the same examples in both A/B arms.
 */
export const filterCollisionExamples = (
  examples: CollisionExample[],
  rawSelection = process.env.EVAL_EXAMPLES
): CollisionExample[] => {
  const selection = (rawSelection ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (selection.length === 0) return examples;

  const wanted = new Set(selection);
  const matched = examples.filter((example) => wanted.has(example.metadata.exampleId));
  const missing = selection.filter((id) => !examples.some((e) => e.metadata.exampleId === id));
  if (missing.length > 0) {
    throw new Error(`EVAL_EXAMPLES names unknown example ids: ${missing.join(', ')}`);
  }
  return matched;
};
