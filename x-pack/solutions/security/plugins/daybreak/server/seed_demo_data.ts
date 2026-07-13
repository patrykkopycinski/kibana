/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger, ElasticsearchClient } from '@kbn/core/server';
import { createEvidenceClient } from './client/evidence/client';
import { createInvestigationClient } from './client/investigations/client';
import { createProposalClient, type ProposalClient } from './client/proposals/client';
import { createWatchClient, type WatchClient } from './client/watch/client';
import { createWorkflowClient, type WorkflowClient } from './client/workflow/client';
import { buildInvestigationFromProposal } from './common/schemas/investigation_builder';

export interface SeedDemoDataResult {
  proposals: number;
  watches: number;
  workflows: number;
  evidence: number;
  investigations: number;
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
  const evidenceClient = createEvidenceClient({ space, logger, esClient });
  const investigationClient = createInvestigationClient({ space, logger, esClient });
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
    recommendation: 'Isolate host FIN-WS-04 and reset compromised credentials.',
    evidenceRefs: ['demo-evidence-1'],
    expectedImpact: 'Prevents further lateral movement in the environment.',
    riskCaveats: ['Confirm host is not a jump server before isolation.'],
    hypothesis: 'An attacker is using stolen credentials to move laterally via RDP.',
    requiredApproverCount: 2,
  });

  await proposalClient.update(proposalA.id, {
    status: 'approved',
    approvals: [
      {
        actor: 'operator-1',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        reason: 'Initial evidence supports the hypothesis.',
      },
      {
        actor: 'operator-2',
        timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        reason: 'Second approval — credentials confirmed compromised.',
      },
    ],
    decision: {
      type: 'approve',
      actor: 'operator-2',
      reason: 'Two-person approval complete.',
      timestamp: new Date().toISOString(),
    },
    decisionHistory: [
      {
        fromStatus: 'new',
        toStatus: 'approved',
        actor: 'operator-2',
        reason: 'Two-person approval complete.',
        timestamp: new Date().toISOString(),
      },
    ],
  });

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

  await proposalClient.update('demo-proposal-3', {
    status: 'modified',
    decision: {
      type: 'modify',
      actor: 'operator-1',
      reason: 'Modified to require step-up rather than block.',
      timestamp: new Date().toISOString(),
    },
    decisionHistory: [
      {
        fromStatus: 'new',
        toStatus: 'modified',
        actor: 'operator-1',
        reason: 'Modified to require step-up rather than block.',
        timestamp: new Date().toISOString(),
      },
    ],
  });

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

  await proposalClient.update('demo-proposal-4', {
    status: 'dismissed',
    decision: {
      type: 'dismiss',
      actor: 'operator-1',
      reason: 'Confirmed scanner traffic; no tunneling.',
      timestamp: new Date().toISOString(),
    },
    decisionHistory: [
      {
        fromStatus: 'new',
        toStatus: 'dismissed',
        actor: 'operator-1',
        reason: 'Confirmed scanner traffic; no tunneling.',
        timestamp: new Date().toISOString(),
      },
    ],
  });

  await proposalClient.create({
    id: 'demo-proposal-5',
    title: 'Potential insider threat: mass download',
    sourceWatch: 'demo-watch-2',
    capability: 'prevention',
    severity: 'critical',
    confidence: 0.88,
    status: 'new',
    owner: 'insider-risk',
    recommendation: 'Escalate to HR and legal; scope host FIN-WS-09 for forensic review.',
    evidenceRefs: ['demo-evidence-6'],
    expectedImpact: 'Triggers formal insider-risk review process.',
    hypothesis: 'An employee may be exfiltrating sensitive customer data.',
    requiredApproverCount: 2,
  });

  await proposalClient.update('demo-proposal-5', {
    status: 'escalated',
    decision: {
      type: 'escalate',
      actor: 'operator-1',
      reason: 'Volume and timing warrant formal review.',
      timestamp: new Date().toISOString(),
    },
    decisionHistory: [
      {
        fromStatus: 'new',
        toStatus: 'escalated',
        actor: 'operator-1',
        reason: 'Volume and timing warrant formal review.',
        timestamp: new Date().toISOString(),
      },
    ],
  });

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

  await proposalClient.update('demo-proposal-6', {
    status: 'deferred',
    decision: {
      type: 'defer',
      actor: 'operator-1',
      reason: 'Low risk and routine; defer to review cycle.',
      timestamp: new Date().toISOString(),
    },
    decisionHistory: [
      {
        fromStatus: 'new',
        toStatus: 'deferred',
        actor: 'operator-1',
        reason: 'Low risk and routine; defer to review cycle.',
        timestamp: new Date().toISOString(),
      },
    ],
  });

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

  const evidenceSeeds = [
    {
      id: 'demo-evidence-1',
      summary: 'RDP logon from unusual subnet to finance workstation FIN-WS-04.',
    },
    {
      id: 'demo-evidence-2',
      summary: 'Encoded PowerShell cradle downloaded from external CDN.',
    },
    {
      id: 'demo-evidence-3',
      summary: 'Parent process spawned suspicious child with network callback.',
    },
    {
      id: 'demo-evidence-4',
      summary: 'Okta sign-in from new geography with impossible travel signal.',
    },
    {
      id: 'demo-evidence-5',
      summary: 'High-volume DNS queries to rare NXDOMAIN suffix.',
    },
    {
      id: 'demo-evidence-6',
      summary: 'Bulk file download from FIN-WS-09 exceeding user baseline.',
    },
    {
      id: 'demo-evidence-7',
      summary: 'Cloud IAM role assignment outside normal change window.',
    },
  ] as const;

  for (const evidence of evidenceSeeds) {
    await evidenceClient.create({
      id: evidence.id,
      kind: 'alert',
      summary: evidence.summary,
      provenance: 'capability',
      confidence: 0.85,
      stance: 'for',
      sensitivityLabel: 'internal',
      sourceRef: evidence.id,
    });
  }

  const approvedProposalA = await proposalClient.get('demo-proposal-1');
  await investigationClient.create(
    buildInvestigationFromProposal({
      investigationId: 'investigation-demo-proposal-1',
      proposal: approvedProposalA,
    })
  );

  const escalatedProposal5 = await proposalClient.get('demo-proposal-5');
  await investigationClient.create(
    buildInvestigationFromProposal({
      investigationId: 'investigation-demo-proposal-5',
      proposal: escalatedProposal5,
    })
  );

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
    evidence: evidenceSeeds.length,
    investigations: 2,
  };
};
