/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger, ElasticsearchClient } from '@kbn/core/server';
import { createProposalClient, type ProposalClient } from './client/proposals/client';
import { createWatchClient, type WatchClient } from './client/watch/client';
import { createWorkflowClient, type WorkflowClient } from './client/workflow/client';

export interface SeedDemoDataResult {
  proposals: number;
  watches: number;
  workflows: number;
}

export const seedDemoData = async ({
  space,
  logger,
  esClient,
}: {
  space: string;
  logger: Logger;
  esClient: ElasticsearchClient;
}): Promise<SeedDemoDataResult> => {
  const proposalClient: ProposalClient = createProposalClient({ space, logger, esClient });
  const watchClient: WatchClient = createWatchClient({ space, logger, esClient });
  const workflowClient: WorkflowClient = createWorkflowClient({ space, logger, esClient });

  const proposalA = await proposalClient.create({
    id: 'demo-proposal-1',
    title: 'Suspicious lateral movement via RDP',
    sourceWatch: 'demo-watch-1',
    capability: 'detection',
    severity: 'high',
    confidence: 0.85,
    status: 'new',
    owner: 'security-team',
    recommendation: 'Isolate the source host and reset compromised credentials.',
    evidenceRefs: ['demo-evidence-1'],
    expectedImpact: 'Prevents further lateral movement in the environment.',
    riskCaveats: ['Confirm host is not a jump server before isolation.'],
    hypothesis: 'An attacker is using stolen credentials to move laterally via RDP.',
    requiredApproverCount: 2,
  });

  await proposalClient.transitionStatus(
    proposalA.id,
    'approved',
    'operator-1',
    'Initial evidence supports the hypothesis.',
    'approve'
  );
  await proposalClient.transitionStatus(
    proposalA.id,
    'approved',
    'operator-2',
    'Second approval — credentials confirmed compromised.',
    'approve'
  );

  await proposalClient.create({
    id: 'demo-proposal-2',
    title: 'Unusual PowerShell download cradle',
    sourceWatch: 'demo-watch-2',
    capability: 'prevention',
    severity: 'critical',
    confidence: 0.92,
    status: 'needs-evidence',
    owner: 'soc-team',
    recommendation: 'Block the outbound IP and hunt for similar cradle patterns.',
    evidenceRefs: ['demo-evidence-2', 'demo-evidence-3'],
    expectedImpact: 'Stops active malware staging from external infrastructure.',
    riskCaveats: ['Blocking the IP may disrupt legitimate update traffic.'],
    hypothesis: 'A PowerShell cradle is downloading second-stage payloads.',
    requiredApproverCount: 1,
  });

  await proposalClient.create({
    id: 'demo-proposal-3',
    title: 'Abnormal Okta login from new location',
    sourceWatch: 'demo-watch-1',
    capability: 'detection',
    severity: 'medium',
    confidence: 0.71,
    status: 'new',
    owner: 'identity-team',
    recommendation: 'Require step-up authentication for the new location.',
    evidenceRefs: ['demo-evidence-4'],
    expectedImpact: 'Reduces account takeover risk without blocking legitimate travel.',
    hypothesis: 'A user may be traveling, but the location is unverified.',
    requiredApproverCount: 1,
  });

  await proposalClient.transitionStatus(
    'demo-proposal-3',
    'modified',
    'operator-1',
    'Modified to require step-up rather than block.',
    'modify'
  );

  await proposalClient.create({
    id: 'demo-proposal-4',
    title: 'High-volume DNS tunneling beacon',
    sourceWatch: 'demo-watch-3',
    capability: 'detection',
    severity: 'high',
    confidence: 0.78,
    status: 'new',
    owner: 'security-team',
    recommendation: 'Dismiss after confirming the traffic is from a known scanner.',
    evidenceRefs: ['demo-evidence-5'],
    hypothesis: 'DNS tunneling is unlikely — volume matches scheduled scanner.',
    requiredApproverCount: 1,
  });

  await proposalClient.transitionStatus(
    'demo-proposal-4',
    'dismissed',
    'operator-1',
    'Confirmed scanner traffic; no tunneling.',
    'dismiss'
  );

  await proposalClient.create({
    id: 'demo-proposal-5',
    title: 'Potential insider threat: mass download',
    sourceWatch: 'demo-watch-2',
    capability: 'prevention',
    severity: 'critical',
    confidence: 0.88,
    status: 'new',
    owner: 'insider-risk',
    recommendation: 'Escalate to HR and legal for review.',
    evidenceRefs: ['demo-evidence-6'],
    expectedImpact: 'Triggers formal insider-risk review process.',
    hypothesis: 'An employee may be exfiltrating sensitive customer data.',
    requiredApproverCount: 2,
  });

  await proposalClient.transitionStatus(
    'demo-proposal-5',
    'escalated',
    'operator-1',
    'Volume and timing warrant formal review.',
    'escalate'
  );

  await proposalClient.create({
    id: 'demo-proposal-6',
    title: 'New cloud admin role assignment',
    sourceWatch: 'demo-watch-1',
    capability: 'detection',
    severity: 'low',
    confidence: 0.65,
    status: 'new',
    owner: 'cloud-security',
    recommendation: 'Defer until the next access review cycle.',
    evidenceRefs: ['demo-evidence-7'],
    expectedImpact: 'No immediate action; reviewed during quarterly access review.',
    hypothesis: 'Routine admin assignment, but should be reviewed in cycle.',
    requiredApproverCount: 1,
  });

  await proposalClient.transitionStatus(
    'demo-proposal-6',
    'deferred',
    'operator-1',
    'Low risk and routine; defer to review cycle.',
    'defer'
  );

  await proposalClient.create({
    id: 'demo-proposal-7',
    title: 'Ransomware precursor: shadow copy deletion',
    sourceWatch: 'demo-watch-3',
    capability: 'prevention',
    severity: 'critical',
    confidence: 0.95,
    status: 'new',
    owner: 'soc-team',
    recommendation: 'Contain the host immediately and initiate IR playbook.',
    evidenceRefs: [],
    expectedImpact: 'Prevents ransomware deployment and backup destruction.',
    hypothesis: 'Shadow copy deletion is a strong ransomware precursor.',
    requiredApproverCount: 1,
  });

  const watchA = await watchClient.create({
    id: 'demo-watch-1',
    name: 'Lateral movement watch',
    description: 'Monitors Windows event logs and EDR telemetry for lateral movement patterns.',
    surface: 'Windows event logs + EDR telemetry',
    status: 'active',
    autonomyTier: 'approval-required',
    skillIds: ['alert-analysis', 'lateral-movement-hunt'],
  });

  const watchB = await watchClient.create({
    id: 'demo-watch-2',
    name: 'PowerShell cradle watch',
    description: 'Detects obfuscated PowerShell download cradles in endpoint telemetry.',
    surface: 'EDR process + network telemetry',
    status: 'active',
    autonomyTier: 'proposed-diff',
    skillIds: ['alert-analysis', 'powershell-deobfuscation'],
  });

  const watchC = await watchClient.create({
    id: 'demo-watch-3',
    name: 'DNS anomaly watch',
    description: 'Flags high-volume DNS queries that may indicate tunneling or beaconing.',
    surface: 'Network DNS logs',
    status: 'paused',
    autonomyTier: 'auto-run',
    skillIds: ['alert-analysis', 'dns-tunneling-hunt'],
  });

  await workflowClient.create({
    id: 'demo-workflow-1',
    name: 'Auto-isolate compromised host',
    trigger: 'proposal approved with high severity',
    skillId: 'endpoint-isolation',
    outcome: 'Isolate host and notify SOC',
    watchIds: [watchA.id],
    priority: 1,
    enabled: true,
  });

  await workflowClient.create({
    id: 'demo-workflow-2',
    name: 'Step-up authentication flow',
    trigger: 'identity-risk proposal approved',
    skillId: 'identity-step-up',
    outcome: 'Enforce MFA step-up for risky location',
    watchIds: [watchB.id],
    priority: 2,
    enabled: true,
  });

  await workflowClient.create({
    id: 'demo-workflow-3',
    name: 'DNS scanner suppression',
    trigger: 'dismissed DNS proposal',
    skillId: 'alert-suppression',
    outcome: 'Suppress scanner IP from alert pipeline',
    watchIds: [watchC.id],
    priority: 3,
    enabled: false,
  });

  return {
    proposals: 7,
    watches: 3,
    workflows: 3,
  };
};
