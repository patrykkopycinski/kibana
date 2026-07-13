/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttackDiscoveryAlertSummary } from '../common/schemas/attack_discovery_adapter';

/**
 * Scenario families for the Attack Discovery output integration profile
 * (project-daybreak capability-evaluation-profiles.md).
 *
 * Each row is a minimal AD-shaped input the spike adapter can map to a
 * Proposal or a no-op/monitor-only outcome.
 */
export interface AttackDiscoveryScenario {
  id: string;
  description: string;
  ad: AttackDiscoveryAlertSummary;
}

export const ATTACK_DISCOVERY_SCENARIOS: AttackDiscoveryScenario[] = [
  {
    id: 'ad-useful-continuation',
    description: 'High-confidence AD finding with related alerts and tactics — should become an investigation Proposal.',
    ad: {
      id: 'ad-001',
      title: 'Suspicious lateral movement via RDP',
      description: 'Attack Discovery correlated RDP logins and rare service execution on domain controllers.',
      severity: 'high',
      confidence: 0.88,
      tactics: ['lateral-movement', 'privilege-escalation'],
      relatedAlertIds: ['alert-rdp-001', 'alert-svc-002'],
      triageStatus: 'open',
    },
  },
  {
    id: 'ad-monitor-only',
    description: 'Low-confidence, low-severity pattern with no related alerts — should route to monitor-only/no-op.',
    ad: {
      id: 'ad-002',
      title: 'Benign PowerShell scriptlet observed',
      description: 'Common admin script seen in only one host; no corroborating alerts.',
      severity: 'low',
      confidence: 0.35,
      tactics: [],
      relatedAlertIds: [],
      triageStatus: 'open',
      monitorOnly: true,
    },
  },
  {
    id: 'ad-duplicate-low-value',
    description: 'Finding already handled in another investigation — should be dismissed as duplicate.',
    ad: {
      id: 'ad-003',
      title: 'Duplicate Mimikatz alert cluster',
      description: 'Same cluster as investigation INV-2026-0007.',
      severity: 'high',
      confidence: 0.92,
      tactics: ['credential-access'],
      relatedAlertIds: ['alert-mimikatz-001'],
      triageStatus: 'open',
      duplicateOf: 'ad-001',
    },
  },
  {
    id: 'ad-missing-evidence',
    description: 'High-severity claim but no related alerts or entities — should be blocked for missing evidence.',
    ad: {
      id: 'ad-004',
      title: 'Potential supply-chain compromise',
      description: 'Attack Discovery flagged a software update anomaly, but no endpoint or network evidence is available.',
      severity: 'critical',
      confidence: 0.6,
      tactics: ['initial-access'],
      relatedAlertIds: [],
      triageStatus: 'open',
      missingEvidence: true,
    },
  },
  {
    id: 'ad-contradictory-evidence',
    description: 'New evidence contradicts the AD conclusion — should request more evidence before action.',
    ad: {
      id: 'ad-005',
      title: 'Suspected data exfiltration',
      description: 'Volume spike detected, but proxy logs show no external upload and asset owner confirmed scheduled backup.',
      severity: 'medium',
      confidence: 0.55,
      tactics: ['exfiltration'],
      relatedAlertIds: ['alert-volume-003', 'alert-proxy-004'],
      triageStatus: 'open',
      contradicts: ['proxy-logs', 'asset-owner-context'],
    },
  },
];
