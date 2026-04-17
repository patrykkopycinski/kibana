/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState, useCallback } from 'react';
import {
  EuiBadge,
  EuiBasicTable,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiCallOut,
  EuiCodeBlock,
  EuiConfirmModal,
  EuiDescriptionList,
  EuiFilterButton,
  EuiFilterGroup,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiHorizontalRule,
  EuiIcon,
  EuiLink,
  EuiLoadingSpinner,
  EuiPanel,
  EuiPopover,
  EuiProgress,
  EuiScreenReaderOnly,
  EuiSpacer,
  EuiStat,
  EuiTab,
  EuiTabs,
  EuiText,
  EuiTextArea,
  EuiTitle,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { SecuritySolutionPageWrapper } from '../../common/components/page_wrapper';
import { SpyRoute } from '../../common/utils/route/spy_routes';
import { SecurityPageName } from '../../app/types';
import { useKibana } from '../../common/lib/kibana';
import { useSocData } from './use_soc_data';
import type {
  SocData,
  SocKPIs,
  SystemHealth,
  TrustScore,
  TriageClassification,
  ResponseAction,
  ResponseInvestigation,
  CoverageGap,
  HealthIssue,
  EvolutionEvent,
  RuleTuning,
  AuditEntry,
  FlatRecommendation,
  OutcomeRecord,
  Recommendation,
  RecommendationStatus,
  ReasoningTraceStep,
} from './use_soc_data';

type TabId =
  | 'overview'
  | 'recommendations'
  | 'triage'
  | 'actions'
  | 'coverage'
  | 'evolution'
  | 'agents'
  | 'system_health'
  | 'audit';

const classificationColor = (
  classification?: string
): 'success' | 'warning' | 'danger' | 'default' => {
  switch (classification?.toUpperCase()) {
    case 'TRUE_POSITIVE':
      return 'danger';
    case 'FALSE_POSITIVE':
    case 'BENIGN':
      return 'success';
    case 'SUSPICIOUS':
      return 'warning';
    default:
      return 'default';
  }
};

/**
 * Derive a best-effort disposition when the triage agent only shipped the
 * simpler `classification` field. The agent's own schema lists
 * {TRUE_POSITIVE, FALSE_POSITIVE, SUSPICIOUS} for `classification` and a
 * richer set for `disposition`; SUSPICIOUS maps to INCONCLUSIVE here since
 * it signals "the agent wasn't able to decide".
 */
const dispositionFromClassification = (classification?: string): string | undefined => {
  switch (classification?.toUpperCase()) {
    case 'TRUE_POSITIVE':
      return 'TRUE_POSITIVE';
    case 'FALSE_POSITIVE':
      return 'FALSE_POSITIVE';
    case 'SUSPICIOUS':
      return 'INCONCLUSIVE';
    default:
      return undefined;
  }
};

const statusHealth = (status?: unknown): 'success' | 'warning' | 'danger' | 'subdued' => {
  // Upstream SOC indices occasionally ship non-string `status` values (numeric
  // exit codes, booleans, or nested objects). Coerce defensively so a bad
  // payload can't crash the whole tab via `EuiHealth` render.
  const normalized = typeof status === 'string' ? status.toLowerCase() : undefined;
  switch (normalized) {
    case 'healthy':
    case 'running':
    case 'completed':
    case 'active':
      return 'success';
    case 'degraded':
    case 'warning':
      return 'warning';
    case 'error':
    case 'failed':
      return 'danger';
    default:
      return 'subdued';
  }
};

const formatTimestamp = (ts?: string): string => {
  if (!ts) return '-';
  try {
    return new Date(ts).toLocaleString();
  } catch (_e) {
    return ts;
  }
};

const truncateText = (text: string | undefined, maxLen: number): string => {
  if (!text) return '-';
  return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
};

/**
 * Attempt to pretty-print a value as JSON. Handles:
 *   - already-an-object (stringify it),
 *   - stringified JSON (parse → stringify with indent),
 *   - double-escaped JSON (parse twice),
 *   - plain text (return as-is).
 * Returns [prettyString, isJson].
 */
const prettyPrintJson = (value: unknown): [string, boolean] => {
  if (value == null) return ['-', false];
  if (typeof value === 'object') {
    try {
      return [JSON.stringify(value, null, 2), true];
    } catch {
      return [String(value), false];
    }
  }
  const raw = String(value).trim();
  if (!raw) return ['-', false];
  try {
    let parsed: unknown = JSON.parse(raw);
    // Handle double-escaped strings that parse to another JSON string.
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        // nested value was a plain string — keep the first parse result
      }
    }
    return [JSON.stringify(parsed, null, 2), true];
  } catch {
    return [raw, false];
  }
};

/**
 * Compact summary line for a details cell. Strips newlines, collapses runs of
 * whitespace, and unwraps a single level of JSON-stringified content.
 */
const summarizeDetails = (raw: string | undefined, maxLen: number): string => {
  if (!raw) return '-';
  const [pretty] = prettyPrintJson(raw);
  return truncateText(pretty.replace(/\s+/g, ' ').trim(), maxLen);
};

/**
 * Cell renderer for long JSON-ish "details" fields in tables. Shows a short
 * one-line summary inline, plus a "View" icon that opens a popover with a
 * properly formatted, copyable JSON code block.
 */
const DetailsCell: React.FC<{ value: string | undefined }> = ({ value }) => {
  const [open, setOpen] = useState(false);
  const [pretty, isJson] = useMemo(() => prettyPrintJson(value), [value]);
  const summary = useMemo(() => summarizeDetails(value, 120), [value]);

  if (!value) {
    return <EuiText size="xs">{'-'}</EuiText>;
  }

  return (
    <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
      <EuiFlexItem grow={true}>
        <EuiText size="xs" color="subdued">
          {summary}
        </EuiText>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiPopover
          anchorPosition="leftCenter"
          isOpen={open}
          closePopover={() => setOpen(false)}
          panelPaddingSize="s"
          button={
            <EuiButtonIcon
              size="xs"
              color="text"
              iconType="inspect"
              aria-label={i18n.translate(
                'xpack.securitySolution.autonomousSoc.details.viewAriaLabel',
                { defaultMessage: 'View details' }
              )}
              onClick={() => setOpen((o) => !o)}
            />
          }
        >
          <div
            css={css`
              max-width: 560px;
              min-width: 320px;
            `}
          >
            <EuiCodeBlock
              language={isJson ? 'json' : 'text'}
              fontSize="s"
              paddingSize="s"
              isCopyable
              overflowHeight={360}
            >
              {pretty}
            </EuiCodeBlock>
          </div>
        </EuiPopover>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

const PAGE_TITLE = i18n.translate('xpack.securitySolution.autonomousSoc.commandCenter.title', {
  defaultMessage: 'Autonomous SOC Command Center',
});

/* ── KPI Hero Row ────────────────────────────────────────────────── */
const KPIHeroRow: React.FC<{ data: SocData }> = ({ data: { kpis } }) => {
  const { euiTheme } = useEuiTheme();

  const kpiCardCss = css`
    text-align: center;
    padding: ${euiTheme.size.l};
    min-width: 140px;
  `;

  return (
    <EuiFlexGroup gutterSize="m" wrap responsive>
      <EuiFlexItem grow={1}>
        <EuiPanel hasShadow={false} hasBorder css={kpiCardCss}>
          <EuiToolTip
            content={i18n.translate(
              'xpack.securitySolution.autonomousSoc.kpi.automationRate.tooltip',
              {
                defaultMessage:
                  'Percentage of alerts handled by AI agents (classified as false positive, benign, or suspicious) without escalation',
              }
            )}
          >
            <EuiStat
              title={`${kpis.automationRate}%`}
              description={i18n.translate(
                'xpack.securitySolution.autonomousSoc.kpi.automationRate',
                { defaultMessage: 'Automation Rate' }
              )}
              titleColor="success"
              titleSize="l"
            />
          </EuiToolTip>
          <EuiProgress value={kpis.automationRate} max={100} size="m" color="success" label="" />
        </EuiPanel>
      </EuiFlexItem>
      <EuiFlexItem grow={1}>
        <EuiPanel hasShadow={false} hasBorder css={kpiCardCss}>
          <EuiToolTip
            content={i18n.translate('xpack.securitySolution.autonomousSoc.kpi.tpRate.tooltip', {
              defaultMessage: 'Percentage of triaged alerts classified as true positives',
            })}
          >
            <EuiStat
              title={`${kpis.truePositiveRate}%`}
              description={i18n.translate('xpack.securitySolution.autonomousSoc.kpi.tpRate', {
                defaultMessage: 'True Positive Rate',
              })}
              titleColor="danger"
              titleSize="l"
            />
          </EuiToolTip>
        </EuiPanel>
      </EuiFlexItem>
      <EuiFlexItem grow={1}>
        <EuiPanel hasShadow={false} hasBorder css={kpiCardCss}>
          <EuiToolTip
            content={i18n.translate('xpack.securitySolution.autonomousSoc.kpi.fpRate.tooltip', {
              defaultMessage: 'Percentage of alerts classified as false positives / benign',
            })}
          >
            <EuiStat
              title={`${kpis.falsePositiveRate}%`}
              description={i18n.translate('xpack.securitySolution.autonomousSoc.kpi.fpRate', {
                defaultMessage: 'False Positive Rate',
              })}
              titleColor={kpis.falsePositiveRate > 30 ? 'danger' : 'success'}
              titleSize="l"
            />
          </EuiToolTip>
        </EuiPanel>
      </EuiFlexItem>
      <EuiFlexItem grow={1}>
        <EuiPanel hasShadow={false} hasBorder css={kpiCardCss}>
          <EuiToolTip
            content={i18n.translate(
              'xpack.securitySolution.autonomousSoc.kpi.avgConfidence.tooltip',
              { defaultMessage: 'Average AI confidence score across all triage classifications' }
            )}
          >
            <EuiStat
              title={kpis.avgConfidence != null ? `${kpis.avgConfidence}%` : '-'}
              description={i18n.translate(
                'xpack.securitySolution.autonomousSoc.kpi.avgConfidence',
                { defaultMessage: 'Avg Confidence' }
              )}
              titleColor="primary"
              titleSize="l"
            />
          </EuiToolTip>
        </EuiPanel>
      </EuiFlexItem>
      <EuiFlexItem grow={1}>
        <EuiPanel hasShadow={false} hasBorder css={kpiCardCss}>
          <EuiStat
            title={kpis.alertsProcessedToday}
            description={i18n.translate('xpack.securitySolution.autonomousSoc.kpi.alertsToday', {
              defaultMessage: 'Alerts Today',
            })}
            titleColor="primary"
            titleSize="l"
          />
        </EuiPanel>
      </EuiFlexItem>
      <EuiFlexItem grow={1}>
        <EuiPanel hasShadow={false} hasBorder css={kpiCardCss}>
          <EuiStat
            title={kpis.alertsProcessedTotal}
            description={i18n.translate('xpack.securitySolution.autonomousSoc.kpi.totalProcessed', {
              defaultMessage: 'Total Processed',
            })}
            titleSize="l"
          />
        </EuiPanel>
      </EuiFlexItem>
      <EuiFlexItem grow={1}>
        <EuiPanel hasShadow={false} hasBorder css={kpiCardCss}>
          <EuiStat
            title={kpis.casesCreated}
            description={i18n.translate('xpack.securitySolution.autonomousSoc.kpi.casesCreated', {
              defaultMessage: 'Cases Created',
            })}
            titleColor="accent"
            titleSize="l"
          />
        </EuiPanel>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

/* ── Activity Sparkline ──────────────────────────────────────────── */
const ActivitySparkline: React.FC<{
  data: Array<{ key_as_string: string; doc_count: number }>;
  color: string;
  title: string;
}> = ({ data: points, color, title }) => {
  const { euiTheme } = useEuiTheme();
  const maxCount = Math.max(...points.map((p) => p.doc_count), 1);

  return (
    <EuiPanel hasShadow={false} hasBorder>
      <EuiTitle size="xxs">
        <h4>{title}</h4>
      </EuiTitle>
      <EuiSpacer size="s" />
      {points.length > 0 ? (
        <div
          css={css`
            height: 60px;
            display: flex;
            align-items: flex-end;
            gap: 2px;
          `}
        >
          {points.slice(-48).map((point) => {
            const heightPct = Math.max((point.doc_count / maxCount) * 100, 3);
            return (
              <EuiToolTip
                key={point.key_as_string}
                content={`${new Date(point.key_as_string).toLocaleString()}: ${point.doc_count}`}
              >
                <div
                  role="img"
                  aria-label={i18n.translate(
                    'xpack.securitySolution.autonomousSoc.sparkline.barLabel',
                    {
                      defaultMessage: '{count} events',
                      values: { count: point.doc_count },
                    }
                  )}
                  style={{
                    flex: 1,
                    backgroundColor: color,
                    height: `${heightPct}%`,
                    minHeight: 2,
                    borderRadius: 1,
                    opacity: 0.85,
                    transition: 'height 0.3s ease',
                  }}
                />
              </EuiToolTip>
            );
          })}
        </div>
      ) : (
        <EuiText size="s" color={euiTheme.colors.textSubdued}>
          {i18n.translate('xpack.securitySolution.autonomousSoc.sparkline.awaitingData', {
            defaultMessage: 'Awaiting data...',
          })}
        </EuiText>
      )}
    </EuiPanel>
  );
};

/* ── MITRE Technique Heatmap ─────────────────────────────────────── */
const MitreTechniquePanel: React.FC<{
  techniques: Array<{ key: string; doc_count: number }>;
}> = ({ techniques }) => {
  const { euiTheme } = useEuiTheme();
  const maxCount = Math.max(...techniques.map((t) => t.doc_count), 1);

  return (
    <EuiPanel hasShadow={false} hasBorder>
      <EuiTitle size="xs">
        <h3>
          {i18n.translate('xpack.securitySolution.autonomousSoc.mitre.techniques.title', {
            defaultMessage: 'MITRE ATT&CK Techniques Detected',
          })}
        </h3>
      </EuiTitle>
      <EuiText size="xs" color="subdued">
        {i18n.translate('xpack.securitySolution.autonomousSoc.mitre.techniques.description', {
          defaultMessage:
            'Techniques identified by the AI triage agents across all classified alerts. Higher counts may indicate active campaigns.',
        })}
      </EuiText>
      <EuiSpacer size="m" />
      {techniques.length > 0 ? (
        <EuiFlexGroup wrap gutterSize="xs">
          {techniques.map((t) => {
            const intensity = t.doc_count / maxCount;
            const bg =
              intensity > 0.6
                ? euiTheme.colors.backgroundBaseDanger
                : intensity > 0.3
                ? euiTheme.colors.backgroundBaseWarning
                : euiTheme.colors.backgroundBaseSubdued;
            return (
              <EuiFlexItem key={t.key} grow={false}>
                <EuiToolTip
                  content={`${t.key}: ${t.doc_count} alert${t.doc_count !== 1 ? 's' : ''}`}
                >
                  <div
                    css={css`
                      padding: ${euiTheme.size.xs} ${euiTheme.size.s};
                      border-radius: ${euiTheme.border.radius.small};
                      background: ${bg};
                      font-size: ${euiTheme.size.m};
                      font-weight: 600;
                      white-space: nowrap;
                      cursor: default;
                      min-width: 90px;
                      text-align: center;
                    `}
                  >
                    {t.key}
                    <EuiBadge
                      color="danger"
                      css={css`
                        margin-left: ${euiTheme.size.xs};
                      `}
                    >
                      {t.doc_count}
                    </EuiBadge>
                  </div>
                </EuiToolTip>
              </EuiFlexItem>
            );
          })}
        </EuiFlexGroup>
      ) : (
        <EuiText size="s" color="subdued">
          {i18n.translate('xpack.securitySolution.autonomousSoc.mitre.techniques.noData', {
            defaultMessage: 'No MITRE techniques detected yet.',
          })}
        </EuiText>
      )}
    </EuiPanel>
  );
};

/* MitreTacticGrid removed — was a static list of all 14 ATT&CK tactics with no data.
   Actual coverage is shown by MitreTechniquePanel and CoverageGapsPanel. */

/* ── Pipeline Status Grid ────────────────────────────────────────── */
const PipelineStatusGrid: React.FC<{
  kpis: SocKPIs;
  outcomeDispositions: Array<{ key: string; doc_count: number }>;
}> = ({ kpis, outcomeDispositions }) => (
  <EuiPanel hasShadow={false} hasBorder>
    <EuiTitle size="xs">
      <h3>
        {i18n.translate('xpack.securitySolution.autonomousSoc.pipeline.status', {
          defaultMessage: 'Pipeline Status',
        })}
      </h3>
    </EuiTitle>
    <EuiSpacer size="s" />
    <EuiFlexGroup gutterSize="l">
      <EuiFlexItem>
        <EuiStat
          title={kpis.casesCreated}
          description={i18n.translate(
            'xpack.securitySolution.autonomousSoc.pipeline.casesCreated',
            {
              defaultMessage: 'Cases Created',
            }
          )}
          titleColor="primary"
          titleSize="m"
        />
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiStat
          title={kpis.alertsProcessedTotal}
          description={i18n.translate('xpack.securitySolution.autonomousSoc.pipeline.triaged', {
            defaultMessage: 'Alerts Triaged',
          })}
          titleColor="accent"
          titleSize="m"
        />
      </EuiFlexItem>
    </EuiFlexGroup>
    {outcomeDispositions.length > 0 && (
      <>
        <EuiSpacer size="m" />
        <EuiTitle size="xxs">
          <h4>
            {i18n.translate('xpack.securitySolution.autonomousSoc.pipeline.outcomes', {
              defaultMessage: 'Outcome Dispositions',
            })}
          </h4>
        </EuiTitle>
        <EuiSpacer size="xs" />
        {outcomeDispositions.map((d) => (
          <EuiFlexGroup key={d.key} gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem
              grow={false}
              css={css`
                min-width: 120px;
              `}
            >
              <EuiBadge color="hollow">{d.key}</EuiBadge>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="xs">{d.doc_count}</EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        ))}
      </>
    )}
  </EuiPanel>
);

/* ── System Health Panel ─────────────────────────────────────────── */
const SystemHealthPanel: React.FC<{ health: SystemHealth }> = ({ health }) => {
  const { euiTheme } = useEuiTheme();

  const executedCycles = health.successfulCycles + health.failedCycles;
  const hasExecutedCycles = executedCycles > 0;
  const successRateLabel = hasExecutedCycles ? `${health.pipelineSuccessRate}%` : '—';
  const successRateColor: 'success' | 'danger' | 'subdued' = hasExecutedCycles
    ? health.pipelineSuccessRate >= 80
      ? 'success'
      : 'danger'
    : 'subdued';
  const successRateDescription = hasExecutedCycles
    ? i18n.translate('xpack.securitySolution.autonomousSoc.health.successRate', {
        defaultMessage: 'Pipeline Success Rate',
      })
    : i18n.translate('xpack.securitySolution.autonomousSoc.health.successRateIdle', {
        defaultMessage: 'Pipeline Success Rate (no executed cycles yet)',
      });

  return (
    <>
      <EuiFlexGroup gutterSize="l">
        <EuiFlexItem grow={1}>
          <EuiPanel hasShadow={false} hasBorder paddingSize="l">
            <EuiStat
              title={successRateLabel}
              description={successRateDescription}
              titleColor={successRateColor}
              titleSize="l"
            />
            <EuiProgress
              value={hasExecutedCycles ? health.pipelineSuccessRate : 0}
              max={100}
              size="m"
              color={
                successRateColor === 'subdued'
                  ? 'subdued'
                  : successRateColor === 'success'
                  ? 'success'
                  : 'danger'
              }
              label=""
            />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem grow={1}>
          <EuiPanel hasShadow={false} hasBorder paddingSize="l">
            <EuiStat
              title={health.totalCycles}
              description={i18n.translate(
                'xpack.securitySolution.autonomousSoc.health.totalCycles',
                { defaultMessage: 'Total Cycles' }
              )}
              titleColor="primary"
              titleSize="l"
            />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem grow={1}>
          <EuiPanel hasShadow={false} hasBorder paddingSize="l">
            <EuiStat
              title={health.avgAlertsPerCycle}
              description={i18n.translate('xpack.securitySolution.autonomousSoc.health.avgAlerts', {
                defaultMessage: 'Avg Alerts / Executed Cycle',
              })}
              titleColor="accent"
              titleSize="l"
            />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem grow={1}>
          <EuiPanel hasShadow={false} hasBorder paddingSize="l">
            <EuiStat
              title={health.successfulCycles}
              description={i18n.translate(
                'xpack.securitySolution.autonomousSoc.health.successful',
                { defaultMessage: 'Successful' }
              )}
              titleColor="success"
              titleSize="l"
            />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem grow={1}>
          <EuiPanel hasShadow={false} hasBorder paddingSize="l">
            <EuiStat
              title={health.failedCycles}
              description={i18n.translate('xpack.securitySolution.autonomousSoc.health.failed', {
                defaultMessage: 'Failed',
              })}
              titleColor={health.failedCycles > 0 ? 'danger' : 'success'}
              titleSize="l"
            />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem grow={1}>
          <EuiPanel hasShadow={false} hasBorder paddingSize="l">
            <EuiStat
              title={health.skippedCycles}
              description={i18n.translate('xpack.securitySolution.autonomousSoc.health.skipped', {
                defaultMessage: 'Skipped (idle / locked)',
              })}
              titleColor="subdued"
              titleSize="l"
            />
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="l" />

      {health.trustScores.length > 0 && (
        <EuiPanel hasShadow={false} hasBorder>
          <EuiTitle size="xs">
            <h3>
              {i18n.translate('xpack.securitySolution.autonomousSoc.health.trustScores', {
                defaultMessage: 'Graduated Autonomy — Trust Scores by Tier',
              })}
            </h3>
          </EuiTitle>
          <EuiText size="xs" color="subdued">
            {i18n.translate('xpack.securitySolution.autonomousSoc.health.trustDesc', {
              defaultMessage:
                'Tiers with 90%+ approval rate over 5+ proposals become eligible for auto-approval, reducing human bottleneck while maintaining safety.',
            })}
          </EuiText>
          <EuiSpacer size="m" />
          <EuiBasicTable<TrustScore>
            items={health.trustScores}
            columns={[
              {
                field: 'tier',
                name: i18n.translate('xpack.securitySolution.autonomousSoc.trust.tier', {
                  defaultMessage: 'Tier',
                }),
                render: (tier: string) => <EuiBadge color="primary">{tier}</EuiBadge>,
                width: '200px',
              },
              {
                field: 'total_proposals',
                name: i18n.translate('xpack.securitySolution.autonomousSoc.trust.total', {
                  defaultMessage: 'Total',
                }),
                width: '80px',
              },
              {
                field: 'approval_rate',
                name: i18n.translate('xpack.securitySolution.autonomousSoc.trust.approvalRate', {
                  defaultMessage: 'Approval Rate',
                }),
                render: (rate: number) => (
                  <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                    <EuiFlexItem>
                      <EuiProgress
                        value={Math.round(rate * 100)}
                        max={100}
                        size="s"
                        color={rate >= 0.9 ? 'success' : rate >= 0.5 ? 'warning' : 'danger'}
                      />
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiText size="xs">{`${Math.round(rate * 100)}%`}</EuiText>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                ),
              },
              {
                field: 'auto_approve_eligible',
                name: i18n.translate('xpack.securitySolution.autonomousSoc.trust.autoApprove', {
                  defaultMessage: 'Auto-Approve',
                }),
                render: (eligible: boolean) => (
                  <EuiHealth color={eligible ? 'success' : 'subdued'}>
                    {eligible
                      ? i18n.translate('xpack.securitySolution.autonomousSoc.trust.eligible', {
                          defaultMessage: 'Eligible',
                        })
                      : i18n.translate('xpack.securitySolution.autonomousSoc.trust.notEligible', {
                          defaultMessage: 'Not yet',
                        })}
                  </EuiHealth>
                ),
                width: '140px',
              },
            ]}
          />
        </EuiPanel>
      )}

      <EuiSpacer size="l" />

      <EuiPanel hasShadow={false} hasBorder>
        <EuiTitle size="xs">
          <h3>
            {i18n.translate('xpack.securitySolution.autonomousSoc.health.recentCycles', {
              defaultMessage: 'Recent Pipeline Cycles',
            })}
          </h3>
        </EuiTitle>
        <EuiSpacer size="s" />
        {health.metrics.length > 0 ? (
          health.metrics.slice(0, 20).map((m) => (
            <div
              key={m.cycle_id ?? m['@timestamp']}
              css={css`
                margin-bottom: ${euiTheme.size.xs};
              `}
            >
              <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                <EuiFlexItem
                  grow={false}
                  css={css`
                    min-width: 170px;
                  `}
                >
                  <EuiText size="xs" color="subdued">
                    {formatTimestamp(m['@timestamp'])}
                  </EuiText>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiHealth
                    color={
                      m.status === 'success'
                        ? 'success'
                        : (m.status ?? '').startsWith('skipped')
                        ? 'subdued'
                        : 'danger'
                    }
                  >
                    {m.status ?? 'unknown'}
                  </EuiHealth>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiBadge color="hollow">
                    {i18n.translate('xpack.securitySolution.autonomousSoc.health.alertsCount', {
                      defaultMessage: '{count} alerts',
                      values: { count: m.alerts_processed ?? 0 },
                    })}
                  </EuiBadge>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiText size="xs">{m.stages_completed ?? '-'}</EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </div>
          ))
        ) : (
          <EuiText size="s" color="subdued">
            {i18n.translate('xpack.securitySolution.autonomousSoc.health.noCycles', {
              defaultMessage: 'No pipeline cycles recorded yet.',
            })}
          </EuiText>
        )}
      </EuiPanel>
    </>
  );
};

/* ── Main Dashboard Component ────────────────────────────────────── */
/* ── Expanded row detail for a single investigation ─────────── */
const InvestigationDetail: React.FC<{ inv: ResponseInvestigation; index: number }> = ({
  inv,
  index,
}) => {
  const { http } = useKibana().services;
  const invBasePath = http?.basePath?.get() ?? '';
  return (
    <EuiPanel
      hasShadow={false}
      hasBorder
      paddingSize="s"
      css={css`
        margin-bottom: 8px;
      `}
    >
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <EuiBadge color={classificationColor(inv.final_classification)}>
            {inv.final_classification ?? 'UNKNOWN'}
          </EuiBadge>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs">
            <strong>
              {i18n.translate('xpack.securitySolution.autonomousSoc.actions.confidence', {
                defaultMessage: 'Confidence: {pct}%',
                values: { pct: inv.final_confidence ?? 0 },
              })}
            </strong>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadge color="hollow">{inv.next_step ?? 'N/A'}</EuiBadge>
        </EuiFlexItem>
        {(inv.mitre_techniques ?? []).map((t) => (
          <EuiFlexItem grow={false} key={`${index}-${t}`}>
            <EuiBadge color="primary">{t}</EuiBadge>
          </EuiFlexItem>
        ))}
      </EuiFlexGroup>
      {inv.alert_id && (
        <EuiText
          size="xs"
          color="subdued"
          css={css`
            margin-top: 4px;
          `}
        >
          {'Alert: '}
          <EuiLink
            href={`${invBasePath}/app/security/alerts?query=(language:kuery,query:'_id: "${inv.alert_id}"')&timerange=(global:(linkTo:!(),timerange:(from:now-24h,to:now)))`}
            target="_blank"
          >
            {inv.alert_id}
          </EuiLink>
        </EuiText>
      )}
      {inv.findings && (
        <>
          <EuiSpacer size="xs" />
          <EuiText size="xs">{inv.findings}</EuiText>
        </>
      )}
    </EuiPanel>
  );
};

/* ── Expanded row content for a response action ────────────── */
const ActionExpandedRow: React.FC<{ action: ResponseAction }> = ({ action }) => {
  if (action.investigations.length === 0) {
    return (
      <EuiText
        size="s"
        color="subdued"
        css={css`
          padding: 8px 16px;
        `}
      >
        {i18n.translate('xpack.securitySolution.autonomousSoc.actions.noInvestigations', {
          defaultMessage: 'No investigation details available for this action.',
        })}
      </EuiText>
    );
  }

  const totalInv = action.investigations.length;
  const tpCount = action.investigations.filter(
    (inv) => inv.final_classification === 'TRUE_POSITIVE'
  ).length;
  const fpCount = action.investigations.filter(
    (inv) => inv.final_classification === 'FALSE_POSITIVE'
  ).length;

  return (
    <div
      css={css`
        padding: 8px 16px 16px;
      `}
    >
      <EuiDescriptionList
        type="inline"
        compressed
        listItems={[
          {
            title: i18n.translate('xpack.securitySolution.autonomousSoc.actions.totalInv', {
              defaultMessage: 'Investigations',
            }),
            description: String(totalInv),
          },
          {
            title: i18n.translate('xpack.securitySolution.autonomousSoc.actions.tp', {
              defaultMessage: 'True positives',
            }),
            description: String(tpCount),
          },
          {
            title: i18n.translate('xpack.securitySolution.autonomousSoc.actions.fp', {
              defaultMessage: 'False positives',
            }),
            description: String(fpCount),
          },
        ]}
      />
      <EuiSpacer size="s" />
      {action.investigations.map((inv, idx) => (
        <InvestigationDetail key={inv.alert_id ?? idx} inv={inv} index={idx} />
      ))}
    </div>
  );
};

/* ── Response Actions Panel with expandable rows ───────────── */
const ResponseActionsPanel: React.FC<{ data: SocData }> = ({ data }) => {
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

  const toggleRow = useCallback((idx: number) => {
    setExpandedRows((prev) => {
      const next = { ...prev };
      if (next[idx]) {
        delete next[idx];
      } else {
        next[idx] = true;
      }
      return next;
    });
  }, []);

  const itemIdToExpandedRowMap = useMemo(() => {
    const map: Record<number, React.ReactNode> = {};
    for (const idx of Object.keys(expandedRows)) {
      const numIdx = Number(idx);
      const action = data.responseActions[numIdx];
      if (action) {
        map[numIdx] = <ActionExpandedRow action={action} />;
      }
    }
    return map;
  }, [expandedRows, data.responseActions]);

  const items = useMemo(
    () => data.responseActions.map((a, idx) => ({ ...a, _idx: idx })),
    [data.responseActions]
  );

  return (
    <EuiPanel hasShadow={false} hasBorder>
      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h3>
              {i18n.translate('xpack.securitySolution.autonomousSoc.actions.title', {
                defaultMessage: 'Response Actions Log',
              })}
            </h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            {i18n.translate('xpack.securitySolution.autonomousSoc.actions.total', {
              defaultMessage: '{count} total actions',
              values: { count: data.counts.responseActions },
            })}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiHorizontalRule margin="s" />
      <EuiBasicTable<ResponseAction & { _idx: number }>
        items={items}
        itemId="_idx"
        itemIdToExpandedRowMap={itemIdToExpandedRowMap}
        noItemsMessage={i18n.translate('xpack.securitySolution.autonomousSoc.actions.noItems', {
          defaultMessage: 'No response actions recorded yet.',
        })}
        columns={[
          {
            width: '40px',
            isExpander: true,
            render: (item: ResponseAction & { _idx: number }) => (
              <EuiButtonIcon
                onClick={() => toggleRow(item._idx)}
                aria-label={
                  expandedRows[item._idx]
                    ? i18n.translate('xpack.securitySolution.autonomousSoc.actions.collapse', {
                        defaultMessage: 'Collapse',
                      })
                    : i18n.translate('xpack.securitySolution.autonomousSoc.actions.expand', {
                        defaultMessage: 'Expand',
                      })
                }
                iconType={expandedRows[item._idx] ? 'arrowDown' : 'arrowRight'}
              />
            ),
          },
          {
            field: '@timestamp',
            name: i18n.translate('xpack.securitySolution.autonomousSoc.column.timestamp', {
              defaultMessage: 'Timestamp',
            }),
            render: (ts: string) => formatTimestamp(ts),
            width: '170px',
          },
          {
            field: 'action_type',
            name: i18n.translate('xpack.securitySolution.autonomousSoc.column.actionType', {
              defaultMessage: 'Action Type',
            }),
            width: '140px',
          },
          {
            field: 'source',
            name: i18n.translate('xpack.securitySolution.autonomousSoc.column.sourceWorkflow', {
              defaultMessage: 'Source Workflow',
            }),
            width: '160px',
          },
          {
            field: 'investigations',
            name: i18n.translate('xpack.securitySolution.autonomousSoc.column.investigations', {
              defaultMessage: 'Investigations',
            }),
            render: (investigations: ResponseInvestigation[]) => {
              if (!investigations.length) return '-';
              const tp = investigations.filter(
                (inv) => inv.final_classification === 'TRUE_POSITIVE'
              ).length;
              const fp = investigations.filter(
                (inv) => inv.final_classification === 'FALSE_POSITIVE'
              ).length;
              return (
                <EuiFlexGroup gutterSize="xs" responsive={false} wrap>
                  <EuiFlexItem grow={false}>
                    <EuiBadge>
                      {i18n.translate('xpack.securitySolution.autonomousSoc.actions.alertCount', {
                        defaultMessage: '{count} alerts',
                        values: { count: investigations.length },
                      })}
                    </EuiBadge>
                  </EuiFlexItem>
                  {tp > 0 && (
                    <EuiFlexItem grow={false}>
                      <EuiBadge color="danger">
                        {i18n.translate('xpack.securitySolution.autonomousSoc.actions.tpCount', {
                          defaultMessage: '{count} TP',
                          values: { count: tp },
                        })}
                      </EuiBadge>
                    </EuiFlexItem>
                  )}
                  {fp > 0 && (
                    <EuiFlexItem grow={false}>
                      <EuiBadge color="default">
                        {i18n.translate('xpack.securitySolution.autonomousSoc.actions.fpCount', {
                          defaultMessage: '{count} FP',
                          values: { count: fp },
                        })}
                      </EuiBadge>
                    </EuiFlexItem>
                  )}
                </EuiFlexGroup>
              );
            },
            width: '200px',
          },
          {
            field: 'status',
            name: i18n.translate('xpack.securitySolution.autonomousSoc.column.status', {
              defaultMessage: 'Status',
            }),
            render: (s: string) => <EuiHealth color={statusHealth(s)}>{s ?? '-'}</EuiHealth>,
            width: '120px',
          },
        ]}
      />
    </EuiPanel>
  );
};

/* ── Health report expanded row detail ──────────────────────── */
const HealthReportDetail: React.FC<{ gap: CoverageGap }> = ({ gap }) => (
  <div
    css={css`
      padding: 8px 16px 16px;
    `}
  >
    {/* Agent statuses */}
    {gap.agents.length > 0 && (
      <>
        <EuiTitle size="xxs">
          <h4>
            {i18n.translate('xpack.securitySolution.autonomousSoc.coverage.agentStatuses', {
              defaultMessage: 'Agent Statuses',
            })}
          </h4>
        </EuiTitle>
        <EuiSpacer size="xs" />
        <EuiFlexGroup gutterSize="s" wrap responsive={false}>
          {gap.agents.map((a) => (
            <EuiFlexItem grow={false} key={a.agent_id}>
              <EuiHealth
                color={
                  a.status === 'ACTIVE' ? 'success' : a.status === 'STALLED' ? 'danger' : 'warning'
                }
              >
                <EuiText size="xs">
                  {i18n.translate('xpack.securitySolution.autonomousSoc.coverage.agentLabel', {
                    defaultMessage: '{id} ({status})',
                    values: { id: a.agent_id ?? '', status: a.status ?? '' },
                  })}
                </EuiText>
              </EuiHealth>
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
        <EuiSpacer size="m" />
      </>
    )}

    {/* Issues detected */}
    {gap.issues.length > 0 && (
      <>
        <EuiTitle size="xxs">
          <h4>
            {i18n.translate('xpack.securitySolution.autonomousSoc.coverage.issuesDetected', {
              defaultMessage: 'Issues Detected ({count})',
              values: { count: gap.issues.length },
            })}
          </h4>
        </EuiTitle>
        <EuiSpacer size="xs" />
        {gap.issues.map((issue, idx) => (
          <EuiPanel
            key={idx}
            hasShadow={false}
            hasBorder
            paddingSize="s"
            css={css`
              margin-bottom: 8px;
            `}
          >
            <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiBadge
                  color={
                    issue.severity === 'critical' || issue.type === 'STALLED'
                      ? 'danger'
                      : issue.severity === 'high'
                      ? 'warning'
                      : 'hollow'
                  }
                >
                  {issue.type ?? 'ISSUE'}
                </EuiBadge>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="xs" />
            <EuiText size="xs">{issue.description ?? '-'}</EuiText>
          </EuiPanel>
        ))}
        <EuiSpacer size="m" />
      </>
    )}

    {/* Technique gaps */}
    {gap.techniqueGaps.length > 0 && (
      <>
        <EuiTitle size="xxs">
          <h4>
            {i18n.translate('xpack.securitySolution.autonomousSoc.coverage.techniqueGaps', {
              defaultMessage: 'Coverage Gaps by Technique',
            })}
          </h4>
        </EuiTitle>
        <EuiSpacer size="xs" />
        <EuiFlexGroup gutterSize="s" wrap responsive={false}>
          {gap.techniqueGaps.map((tg) => (
            <EuiFlexItem grow={false} key={tg.technique_id}>
              <EuiToolTip
                content={i18n.translate(
                  'xpack.securitySolution.autonomousSoc.coverage.techniqueTooltip',
                  {
                    defaultMessage: '{id}: {occ} occurrences, avg confidence {conf}%',
                    values: {
                      id: tg.technique_id ?? '',
                      occ: tg.occurrences ?? 0,
                      conf: Math.round(tg.avg_confidence ?? 0),
                    },
                  }
                )}
              >
                <EuiBadge color="primary">
                  {i18n.translate('xpack.securitySolution.autonomousSoc.coverage.techniqueLabel', {
                    defaultMessage: '{id} ({count})',
                    values: { id: tg.technique_id ?? '', count: tg.occurrences ?? 0 },
                  })}
                </EuiBadge>
              </EuiToolTip>
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
        <EuiSpacer size="m" />
      </>
    )}

    {/* Summary */}
    {gap.summary && (
      <>
        <EuiTitle size="xxs">
          <h4>
            {i18n.translate('xpack.securitySolution.autonomousSoc.coverage.summaryTitle', {
              defaultMessage: 'Summary',
            })}
          </h4>
        </EuiTitle>
        <EuiSpacer size="xs" />
        <EuiText size="s">{gap.summary}</EuiText>
      </>
    )}
  </div>
);

/* ── Coverage Gaps Panel with expandable rows ──────────────── */
const CoverageGapsPanel: React.FC<{ data: SocData }> = ({ data }) => {
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

  const toggleRow = useCallback((idx: number) => {
    setExpandedRows((prev) => {
      const next = { ...prev };
      if (next[idx]) {
        delete next[idx];
      } else {
        next[idx] = true;
      }
      return next;
    });
  }, []);

  const items = useMemo(
    () => data.coverageGaps.map((g, idx) => ({ ...g, _idx: idx })),
    [data.coverageGaps]
  );

  const itemIdToExpandedRowMap = useMemo(() => {
    const map: Record<number, React.ReactNode> = {};
    for (const idx of Object.keys(expandedRows)) {
      const numIdx = Number(idx);
      const gap = data.coverageGaps[numIdx];
      if (gap) {
        map[numIdx] = <HealthReportDetail gap={gap} />;
      }
    }
    return map;
  }, [expandedRows, data.coverageGaps]);

  const issueColor = (issue: HealthIssue): 'danger' | 'warning' | 'subdued' => {
    if (issue.type === 'STALLED' || issue.severity === 'critical') return 'danger';
    if (issue.severity === 'high') return 'warning';
    return 'subdued';
  };

  return (
    <EuiPanel hasShadow={false} hasBorder>
      <EuiTitle size="xs">
        <h3>
          {i18n.translate('xpack.securitySolution.autonomousSoc.coverage.tuningTitle', {
            defaultMessage: 'Watchdog Health Reports',
          })}
        </h3>
      </EuiTitle>
      <EuiText size="xs" color="subdued">
        {i18n.translate('xpack.securitySolution.autonomousSoc.coverage.tuningDesc', {
          defaultMessage:
            'AI-generated health reports from the SOC watchdog including coverage analysis, agent health, and rule tuning recommendations.',
        })}
      </EuiText>
      <EuiHorizontalRule margin="s" />
      <EuiBasicTable<CoverageGap & { _idx: number }>
        items={items}
        itemId="_idx"
        itemIdToExpandedRowMap={itemIdToExpandedRowMap}
        noItemsMessage={i18n.translate('xpack.securitySolution.autonomousSoc.coverage.noGaps', {
          defaultMessage: 'No health reports generated yet.',
        })}
        columns={[
          {
            width: '40px',
            isExpander: true,
            render: (item: CoverageGap & { _idx: number }) => (
              <EuiButtonIcon
                onClick={() => toggleRow(item._idx)}
                aria-label={
                  expandedRows[item._idx]
                    ? i18n.translate('xpack.securitySolution.autonomousSoc.coverage.collapse', {
                        defaultMessage: 'Collapse',
                      })
                    : i18n.translate('xpack.securitySolution.autonomousSoc.coverage.expand', {
                        defaultMessage: 'Expand',
                      })
                }
                iconType={expandedRows[item._idx] ? 'arrowDown' : 'arrowRight'}
              />
            ),
          },
          {
            field: '@timestamp',
            name: i18n.translate('xpack.securitySolution.autonomousSoc.column.timestamp', {
              defaultMessage: 'Timestamp',
            }),
            render: (ts: string) => formatTimestamp(ts),
            width: '170px',
          },
          {
            field: 'status',
            name: i18n.translate('xpack.securitySolution.autonomousSoc.column.status', {
              defaultMessage: 'Status',
            }),
            render: (s: string) => <EuiHealth color={statusHealth(s)}>{s ?? 'unknown'}</EuiHealth>,
            width: '120px',
          },
          {
            field: 'agents',
            name: i18n.translate('xpack.securitySolution.autonomousSoc.column.agents', {
              defaultMessage: 'Agents',
            }),
            render: (agents: CoverageGap['agents']) => {
              if (!agents.length) return '-';
              const active = agents.filter((a) => a.status === 'ACTIVE').length;
              const stalled = agents.filter((a) => a.status === 'STALLED').length;
              return (
                <EuiFlexGroup gutterSize="xs" responsive={false} wrap>
                  {active > 0 && (
                    <EuiFlexItem grow={false}>
                      <EuiBadge color="success">
                        {i18n.translate(
                          'xpack.securitySolution.autonomousSoc.coverage.activeCount',
                          {
                            defaultMessage: '{count} active',
                            values: { count: active },
                          }
                        )}
                      </EuiBadge>
                    </EuiFlexItem>
                  )}
                  {stalled > 0 && (
                    <EuiFlexItem grow={false}>
                      <EuiBadge color="danger">
                        {i18n.translate(
                          'xpack.securitySolution.autonomousSoc.coverage.stalledCount',
                          {
                            defaultMessage: '{count} stalled',
                            values: { count: stalled },
                          }
                        )}
                      </EuiBadge>
                    </EuiFlexItem>
                  )}
                </EuiFlexGroup>
              );
            },
            width: '180px',
          },
          {
            field: 'issues',
            name: i18n.translate('xpack.securitySolution.autonomousSoc.column.issues', {
              defaultMessage: 'Issues',
            }),
            render: (issues: HealthIssue[]) => {
              if (!issues.length) return <EuiBadge color="success">{'0'}</EuiBadge>;
              return (
                <EuiFlexGroup gutterSize="xs" responsive={false} wrap>
                  {issues.slice(0, 3).map((iss, idx) => (
                    <EuiFlexItem grow={false} key={idx}>
                      <EuiToolTip content={iss.description ?? ''}>
                        <EuiBadge color={issueColor(iss)}>{iss.type ?? 'ISSUE'}</EuiBadge>
                      </EuiToolTip>
                    </EuiFlexItem>
                  ))}
                  {issues.length > 3 && (
                    <EuiFlexItem grow={false}>
                      <EuiBadge>
                        {i18n.translate(
                          'xpack.securitySolution.autonomousSoc.coverage.moreIssues',
                          {
                            defaultMessage: '+{count} more',
                            values: { count: issues.length - 3 },
                          }
                        )}
                      </EuiBadge>
                    </EuiFlexItem>
                  )}
                </EuiFlexGroup>
              );
            },
            width: '280px',
          },
          {
            field: 'techniqueGaps',
            name: i18n.translate('xpack.securitySolution.autonomousSoc.column.gaps', {
              defaultMessage: 'Technique Gaps',
            }),
            render: (gaps: CoverageGap['techniqueGaps']) => {
              if (!gaps.length) return '-';
              return (
                <EuiFlexGroup gutterSize="xs" responsive={false} wrap>
                  {gaps.map((g) => (
                    <EuiFlexItem grow={false} key={g.technique_id}>
                      <EuiBadge color="primary">{g.technique_id}</EuiBadge>
                    </EuiFlexItem>
                  ))}
                </EuiFlexGroup>
              );
            },
            width: '150px',
          },
        ]}
      />
    </EuiPanel>
  );
};

/* ── Recommendation Status Helpers ────────────────────────────────── */
const recStatusColor = (status?: RecommendationStatus): string => {
  switch (status) {
    case 'pending':
      return 'warning';
    case 'approved':
      return 'primary';
    case 'rejected':
      return 'danger';
    case 'applied':
      return 'success';
    case 'failed':
      return 'danger';
    default:
      return 'default';
  }
};

const recSourceLabel = (source?: string): string => {
  switch (source) {
    case 'soc-deteng':
      return 'Detection Eng.';
    case 'soc-meta-agent':
      return 'Meta Agent';
    case 'soc-arch-reviewer':
      return 'Arch. Review';
    case 'soc-gap-analyzer':
      return 'Gap Analyzer';
    default:
      return source ?? 'Unknown';
  }
};

const flatRecCategoryLabel = (category: FlatRecommendation['category']): string => {
  switch (category) {
    case 'rule_tuning':
      return 'Rule Tuning';
    case 'rule_creation':
      return 'New Rule';
    case 'rule_disabled':
      return 'Disable Rule';
    case 'agent_action':
      return 'Agent Action';
    case 'architecture_review':
      return 'Architecture';
    case 'capability_gap':
      return 'Capability Gap';
    default:
      return 'Unknown';
  }
};

const flatRecCategoryColor = (category: FlatRecommendation['category']): string => {
  switch (category) {
    case 'rule_tuning':
      return 'primary';
    case 'rule_creation':
      return 'success';
    case 'rule_disabled':
      return 'warning';
    case 'agent_action':
      return 'accent';
    case 'architecture_review':
      return 'hollow';
    case 'capability_gap':
      return 'danger';
    default:
      return 'default';
  }
};

/* ── Agent Action Detail — human-readable rendering for skills/workflows/agents ── */
const AgentActionDetail: React.FC<{
  rec: FlatRecommendation;
  basePath: string;
}> = ({ rec, basePath }) => {
  const action = rec.details.action as string | undefined;
  const skillDef = rec.details.skill_definition as Record<string, unknown> | undefined;
  const workflowDef = rec.details.workflow_definition as Record<string, unknown> | undefined;
  const agentDef = rec.details.agent_definition as Record<string, unknown> | undefined;
  const refinement = rec.details.refinement as Record<string, unknown> | undefined;

  if (skillDef && (action === 'create_skill' || action === 'update_skill')) {
    const content = (skillDef.content as string) ?? '';
    const toolIds = skillDef.tool_ids as string[] | undefined;
    return (
      <>
        <EuiDescriptionList
          type="column"
          compressed
          listItems={[
            { title: 'Skill ID', description: (skillDef.id as string) ?? '—' },
            { title: 'Name', description: (skillDef.name as string) ?? '—' },
            {
              title: 'Description',
              description: (skillDef.description as string) ?? '—',
            },
            ...(toolIds && toolIds.length > 0
              ? [
                  {
                    title: 'Tools',
                    description: toolIds.join(', '),
                  },
                ]
              : []),
          ].filter((item) => item.description !== '—')}
        />
        {content && (
          <>
            <EuiSpacer size="m" />
            <EuiTitle size="xxs">
              <h5>
                {i18n.translate('xpack.securitySolution.autonomousSoc.recs.skillContentLabel', {
                  defaultMessage: 'Skill Content (Runbook)',
                })}
              </h5>
            </EuiTitle>
            <EuiSpacer size="xs" />
            <EuiPanel
              hasShadow={false}
              hasBorder
              paddingSize="s"
              css={css`
                max-height: 300px;
                overflow-y: auto;
                white-space: pre-wrap;
                font-family: 'JetBrains Mono', monospace;
                font-size: 12px;
                line-height: 1.5;
              `}
            >
              {content}
            </EuiPanel>
          </>
        )}
      </>
    );
  }

  if (action === 'create_workflow') {
    const wfSource = workflowDef ?? rec.details;
    const yaml =
      (wfSource.yaml as string) ??
      (wfSource.workflow_yaml as string) ??
      (wfSource.content as string) ??
      '';
    const wfName = (wfSource.name as string) ?? (wfSource.workflow_name as string) ?? '';
    const wfId = (wfSource.id as string) ?? (wfSource.workflow_id as string) ?? '';
    const wfDesc = (wfSource.description as string) ?? (rec.details.summary as string) ?? '';
    const wfReasoning = (rec.details.reasoning as string) ?? '';

    const metaItems = [
      ...(wfId ? [{ title: 'Workflow ID', description: wfId }] : []),
      ...(wfName ? [{ title: 'Name', description: wfName }] : []),
      ...(wfDesc ? [{ title: 'Description', description: wfDesc }] : []),
    ];

    return (
      <>
        {metaItems.length > 0 && (
          <EuiDescriptionList type="column" compressed listItems={metaItems} />
        )}
        {wfReasoning && (
          <>
            <EuiSpacer size="m" />
            <EuiTitle size="xxs">
              <h5>
                {i18n.translate('xpack.securitySolution.autonomousSoc.recs.reasoningLabel', {
                  defaultMessage: 'Reasoning',
                })}
              </h5>
            </EuiTitle>
            <EuiSpacer size="xs" />
            <EuiText size="s">
              <p style={{ whiteSpace: 'pre-wrap' }}>{wfReasoning}</p>
            </EuiText>
          </>
        )}
        {yaml && (
          <>
            <EuiSpacer size="m" />
            <EuiTitle size="xxs">
              <h5>
                {i18n.translate('xpack.securitySolution.autonomousSoc.recs.workflowYamlLabel', {
                  defaultMessage: 'Workflow Definition',
                })}
              </h5>
            </EuiTitle>
            <EuiSpacer size="xs" />
            <EuiPanel
              hasShadow={false}
              hasBorder
              paddingSize="s"
              css={css`
                max-height: 400px;
                overflow-y: auto;
                white-space: pre-wrap;
                font-family: 'JetBrains Mono', monospace;
                font-size: 12px;
                line-height: 1.5;
              `}
            >
              {yaml}
            </EuiPanel>
          </>
        )}
      </>
    );
  }

  if (agentDef && action === 'create_agent') {
    const instructions = (agentDef.instructions as string) ?? '';
    return (
      <>
        <EuiDescriptionList
          type="column"
          compressed
          listItems={[
            { title: 'Agent ID', description: (agentDef.id as string) ?? '—' },
            { title: 'Name', description: (agentDef.name as string) ?? '—' },
            {
              title: 'Description',
              description: (agentDef.description as string) ?? '—',
            },
          ].filter((item) => item.description !== '—')}
        />
        {instructions && (
          <>
            <EuiSpacer size="m" />
            <EuiTitle size="xxs">
              <h5>
                {i18n.translate(
                  'xpack.securitySolution.autonomousSoc.recs.agentInstructionsLabel',
                  { defaultMessage: 'Agent Instructions' }
                )}
              </h5>
            </EuiTitle>
            <EuiSpacer size="xs" />
            <EuiPanel
              hasShadow={false}
              hasBorder
              paddingSize="s"
              css={css`
                max-height: 300px;
                overflow-y: auto;
                white-space: pre-wrap;
                font-size: 13px;
                line-height: 1.5;
              `}
            >
              {instructions}
            </EuiPanel>
          </>
        )}
      </>
    );
  }

  if (action === 'enrich_agent' || action === 'refine_agent') {
    const src = refinement ?? rec.details;
    const targetAgent =
      (src.target_agent_id as string) ?? (rec.details.target_agent_id as string) ?? '';
    const reasoning = (src.reasoning as string) ?? (rec.details.reasoning as string) ?? '';
    const patch =
      (src.updated_instructions as string) ??
      (src.instruction_patch as string) ??
      (rec.details.instruction_patch as string) ??
      (rec.details.updated_instructions as string) ??
      '';
    const summary = (rec.details.summary as string) ?? '';
    const tier = rec.details.tier as string | number | undefined;

    const metaItems = [
      ...(targetAgent ? [{ title: 'Target Agent', description: targetAgent }] : []),
      ...(tier != null ? [{ title: 'Tier', description: String(tier) }] : []),
      ...(summary ? [{ title: 'Summary', description: summary }] : []),
    ];

    return (
      <>
        {metaItems.length > 0 && (
          <EuiDescriptionList type="column" compressed listItems={metaItems} />
        )}
        {reasoning && (
          <>
            <EuiSpacer size="m" />
            <EuiTitle size="xxs">
              <h5>
                {i18n.translate('xpack.securitySolution.autonomousSoc.recs.enrichReasoningLabel', {
                  defaultMessage: 'Reasoning',
                })}
              </h5>
            </EuiTitle>
            <EuiSpacer size="xs" />
            <EuiText size="s" color="subdued">
              <p style={{ whiteSpace: 'pre-wrap' }}>{reasoning}</p>
            </EuiText>
          </>
        )}
        {patch && (
          <>
            <EuiSpacer size="m" />
            <EuiTitle size="xxs">
              <h5>
                {i18n.translate('xpack.securitySolution.autonomousSoc.recs.instructionPatchLabel', {
                  defaultMessage: 'Instruction Patch',
                })}
              </h5>
            </EuiTitle>
            <EuiSpacer size="xs" />
            <EuiPanel
              hasShadow={false}
              hasBorder
              paddingSize="s"
              css={css`
                max-height: 400px;
                overflow-y: auto;
                white-space: pre-wrap;
                font-size: 13px;
                line-height: 1.6;
              `}
            >
              {patch}
            </EuiPanel>
          </>
        )}
      </>
    );
  }

  const TUNING_ACTIONS = [
    'add_exception',
    'update_exception',
    'modify_exception',
    'raise_threshold',
    'lower_threshold',
  ];
  if (rec.category === 'rule_tuning' && action && TUNING_ACTIONS.includes(action)) {
    const ruleId = rec.details.rule_id as string | undefined;
    const beforeText = rec.details.before as string | undefined;
    const afterText = rec.details.after as string | undefined;
    const patchFields = rec.details.patch_fields as Record<string, unknown> | undefined;
    const isThreshold = action === 'raise_threshold' || action === 'lower_threshold';

    const proposedChanges: Array<{ title: string; description: NonNullable<React.ReactNode> }> = [];
    if (patchFields && Object.keys(patchFields).length > 0) {
      for (const [field, value] of Object.entries(patchFields)) {
        proposedChanges.push({
          title: `proposed ${field.replace(/_/g, ' ')}`,
          description: <EuiBadge color="accent">{String(value)}</EuiBadge>,
        });
      }
    } else if (isThreshold) {
      const PATCH_CANDIDATE_KEYS = ['query', 'risk_score', 'severity'] as const;
      for (const k of PATCH_CANDIDATE_KEYS) {
        const v = rec.details[k];
        if (v != null && v !== '') {
          proposedChanges.push({
            title: `proposed ${k.replace(/_/g, ' ')}`,
            description: <EuiBadge color="accent">{String(v)}</EuiBadge>,
          });
        }
      }
    }

    const hasConcreteChanges = proposedChanges.length > 0;

    return (
      <>
        <EuiDescriptionList
          type="column"
          compressed
          listItems={
            [
              ...(ruleId
                ? [
                    {
                      title: 'rule id' as const,
                      description: (
                        <EuiLink
                          href={`${basePath}/app/security/rules/id/${ruleId}`}
                          target="_blank"
                          external
                        >
                          {ruleId}
                        </EuiLink>
                      ),
                    },
                  ]
                : []),
              {
                title: 'action' as const,
                description: (
                  <EuiBadge color={isThreshold ? 'warning' : 'primary'}>
                    {action.replace(/_/g, ' ')}
                  </EuiBadge>
                ),
              },
            ] as Array<{ title: string; description: NonNullable<React.ReactNode> }>
          }
        />
        {hasConcreteChanges && (
          <>
            <EuiSpacer size="m" />
            <EuiTitle size="xxs">
              <h5>
                {i18n.translate('xpack.securitySolution.autonomousSoc.recs.proposedChangesLabel', {
                  defaultMessage: 'Proposed Changes',
                })}
              </h5>
            </EuiTitle>
            <EuiSpacer size="xs" />
            <EuiDescriptionList type="column" compressed listItems={proposedChanges} />
          </>
        )}
        {!hasConcreteChanges && isThreshold && (
          <>
            <EuiSpacer size="m" />
            <EuiCallOut
              size="s"
              color="warning"
              iconType="iInCircle"
              title={i18n.translate(
                'xpack.securitySolution.autonomousSoc.recs.noPatchFieldsTitle',
                {
                  defaultMessage:
                    'No concrete rule changes specified — review the before/after comparison and apply manually via the rule editor.',
                }
              )}
            />
          </>
        )}
        {(beforeText || afterText) && (
          <>
            <EuiSpacer size="m" />
            <EuiFlexGroup gutterSize="m" responsive>
              {beforeText && (
                <EuiFlexItem>
                  <EuiTitle size="xxs">
                    <h5>
                      <EuiIcon type="minusInCircle" color="danger" />{' '}
                      {i18n.translate('xpack.securitySolution.autonomousSoc.recs.beforeLabel', {
                        defaultMessage: 'Before (current)',
                      })}
                    </h5>
                  </EuiTitle>
                  <EuiSpacer size="xs" />
                  <EuiPanel
                    hasShadow={false}
                    hasBorder
                    paddingSize="s"
                    color="danger"
                    css={css`
                      max-height: 200px;
                      overflow-y: auto;
                      white-space: pre-wrap;
                      font-size: 13px;
                      line-height: 1.5;
                    `}
                  >
                    {beforeText}
                  </EuiPanel>
                </EuiFlexItem>
              )}
              {afterText && (
                <EuiFlexItem>
                  <EuiTitle size="xxs">
                    <h5>
                      <EuiIcon type="plusInCircle" color="success" />{' '}
                      {i18n.translate('xpack.securitySolution.autonomousSoc.recs.afterLabel', {
                        defaultMessage: 'After (proposed)',
                      })}
                    </h5>
                  </EuiTitle>
                  <EuiSpacer size="xs" />
                  <EuiPanel
                    hasShadow={false}
                    hasBorder
                    paddingSize="s"
                    color="success"
                    css={css`
                      max-height: 200px;
                      overflow-y: auto;
                      white-space: pre-wrap;
                      font-size: 13px;
                      line-height: 1.5;
                    `}
                  >
                    {afterText}
                  </EuiPanel>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          </>
        )}
      </>
    );
  }

  const skipKeys = new Set([
    'action',
    'tier',
    'skill_definition',
    'workflow_definition',
    'workflow_yaml',
    'workflow_name',
    'workflow_id',
    'agent_definition',
    'refinement',
    'before_state',
    'after_state',
    'rollback_action',
    'metrics_snapshot',
    'target_agent_id',
    'instruction_patch',
    'updated_instructions',
  ]);
  const filteredEntries = Object.entries(rec.details)
    .filter(([k, v]) => v != null && v !== '' && !skipKeys.has(k))
    .slice(0, 12);

  return (
    <EuiDescriptionList
      type="column"
      compressed
      listItems={filteredEntries.map(([k, v]) => ({
        title: k.replace(/_/g, ' '),
        description:
          k === 'rule_id' && typeof v === 'string' ? (
            <EuiLink href={`${basePath}/app/security/rules/id/${v}`} target="_blank" external>
              {v}
            </EuiLink>
          ) : typeof v === 'string' ? (
            v.length > 200 ? (
              `${v.slice(0, 200)}…`
            ) : (
              v
            )
          ) : (
            JSON.stringify(v, null, 2)
          ),
      }))}
    />
  );
};

/* ── Architecture Review Detail — structured display for arch review findings ── */
const ArchReviewDetail: React.FC<{
  rec: FlatRecommendation;
}> = ({ rec }) => {
  const signal = (rec.details.signal as string) ?? '';
  const component = (rec.details.component as string) ?? '';
  const finding = (rec.details.finding as string) ?? '';
  const recommendation = (rec.details.recommendation as string) ?? '';
  const justification = (rec.details.justification as string) ?? '';
  const priority = (rec.details.priority as string) ?? 'medium';
  const metrics = rec.details.metrics as Record<string, unknown> | undefined;

  const priorityColor =
    priority === 'high' ? 'danger' : priority === 'medium' ? 'warning' : 'default';

  return (
    <>
      <EuiDescriptionList
        type="column"
        compressed
        listItems={[
          { title: 'Signal', description: signal || '—' },
          { title: 'Component', description: component || '—' },
          {
            title: 'Recommendation',
            description: <EuiBadge color={priorityColor}>{recommendation}</EuiBadge>,
          },
          { title: 'Priority', description: <EuiBadge color={priorityColor}>{priority}</EuiBadge> },
        ]}
      />
      {finding && (
        <>
          <EuiSpacer size="m" />
          <EuiTitle size="xxs">
            <h5>{'Finding'}</h5>
          </EuiTitle>
          <EuiSpacer size="xs" />
          <EuiText size="s">
            <p style={{ whiteSpace: 'pre-wrap' }}>{finding}</p>
          </EuiText>
        </>
      )}
      {justification && (
        <>
          <EuiSpacer size="m" />
          <EuiTitle size="xxs">
            <h5>{'Justification'}</h5>
          </EuiTitle>
          <EuiSpacer size="xs" />
          <EuiText size="s" color="subdued">
            <p style={{ whiteSpace: 'pre-wrap' }}>{justification}</p>
          </EuiText>
        </>
      )}
      {metrics && Object.keys(metrics).length > 0 && (
        <>
          <EuiSpacer size="m" />
          <EuiTitle size="xxs">
            <h5>{'Metrics'}</h5>
          </EuiTitle>
          <EuiSpacer size="xs" />
          <EuiDescriptionList
            type="column"
            compressed
            listItems={Object.entries(metrics).map(([k, v]) => ({
              title: k.replace(/_/g, ' '),
              description: String(v),
            }))}
          />
        </>
      )}
    </>
  );
};

/* ── Capability Gap Detail — structured display for gap findings ── */
const CapabilityGapDetail: React.FC<{
  rec: FlatRecommendation;
}> = ({ rec }) => {
  const signal = (rec.details.signal as string) ?? '';
  const component = (rec.details.component as string) ?? '';
  const finding = (rec.details.finding as string) ?? '';
  const opportunity = (rec.details.opportunity as string) ?? '';
  const recommendedAction = (rec.details.recommended_action as string) ?? '';
  const effort = (rec.details.effort as string) ?? 'medium';
  const impact = (rec.details.impact as string) ?? 'medium';
  const priorityScore = rec.details.priority_score as number | undefined;
  const metrics = rec.details.metrics as Record<string, unknown> | undefined;

  const impactColor = impact === 'high' ? 'danger' : impact === 'medium' ? 'warning' : 'default';
  const effortColor = effort === 'low' ? 'success' : effort === 'medium' ? 'warning' : 'danger';

  const signalLabels: Record<string, string> = {
    unused_tool: 'Unused Tool',
    unused_data_source: 'Unused Data Source',
    kill_chain_gap: 'Kill Chain Gap',
    classification_blind_spot: 'Classification Blind Spot',
    response_gap: 'Response Gap',
    stale_baseline: 'Stale Baseline',
    rule_coverage_drift: 'Rule Coverage Drift',
    confidence_calibration: 'Confidence Calibration',
  };

  return (
    <>
      <EuiDescriptionList
        type="column"
        compressed
        listItems={
          [
            {
              title: 'Signal Type',
              description: <EuiBadge color="hollow">{signalLabels[signal] ?? signal}</EuiBadge>,
            },
            { title: 'Component', description: component || '—' },
            {
              title: 'Recommended Action',
              description: <EuiBadge>{recommendedAction.replace(/_/g, ' ')}</EuiBadge>,
            },
            { title: 'Impact', description: <EuiBadge color={impactColor}>{impact}</EuiBadge> },
            { title: 'Effort', description: <EuiBadge color={effortColor}>{effort}</EuiBadge> },
            ...(priorityScore !== undefined
              ? [
                  {
                    title: 'Priority Score',
                    description: String(Math.round(priorityScore * 100) / 100),
                  },
                ]
              : []),
          ] as Array<{ title: string; description: NonNullable<React.ReactNode> }>
        }
      />
      {opportunity && (
        <>
          <EuiSpacer size="m" />
          <EuiTitle size="xxs">
            <h5>{'Opportunity'}</h5>
          </EuiTitle>
          <EuiSpacer size="xs" />
          <EuiText size="s">
            <p style={{ whiteSpace: 'pre-wrap' }}>{opportunity}</p>
          </EuiText>
        </>
      )}
      {finding && (
        <>
          <EuiSpacer size="m" />
          <EuiTitle size="xxs">
            <h5>{'Finding'}</h5>
          </EuiTitle>
          <EuiSpacer size="xs" />
          <EuiText size="s" color="subdued">
            <p style={{ whiteSpace: 'pre-wrap' }}>{finding}</p>
          </EuiText>
        </>
      )}
      {metrics && Object.keys(metrics).length > 0 && (
        <>
          <EuiSpacer size="m" />
          <EuiTitle size="xxs">
            <h5>{'Metrics'}</h5>
          </EuiTitle>
          <EuiSpacer size="xs" />
          <EuiDescriptionList
            type="column"
            compressed
            listItems={Object.entries(metrics).map(([k, v]) => ({
              title: k.replace(/_/g, ' '),
              description: String(v),
            }))}
          />
        </>
      )}
    </>
  );
};

/* ── Recommendations Review Panel ────────────────────────────────── */
const RecommendationsPanel: React.FC<{
  data: SocData;
  onApproveAndApplySubItem: (
    docId: string,
    subIndex: number,
    totalCount: number
  ) => Promise<{ ok: boolean; error?: string }>;
  onRejectSubItem: (
    docId: string,
    subIndex: number,
    totalCount: number,
    reason: string
  ) => Promise<boolean>;
  onRevokeSubItem: (docId: string, subIndex: number, totalCount: number) => Promise<boolean>;
  onCreateEnableRuleAndApprove: (
    docId: string,
    subIndex: number,
    totalCount: number,
    details: Record<string, unknown>,
    ruleIdOverride?: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onDeleteRuleAndReject: (
    docId: string,
    subIndex: number,
    totalCount: number,
    ruleId: string,
    reason: string
  ) => Promise<{ ok: boolean; error?: string }>;
}> = ({
  data,
  onApproveAndApplySubItem,
  onRejectSubItem,
  onRevokeSubItem,
  onCreateEnableRuleAndApprove,
  onDeleteRuleAndReject,
}) => {
  const { euiTheme } = useEuiTheme();
  const { http } = useKibana().services;
  const basePath = http?.basePath?.get() ?? '';
  const [statusFilter, setStatusFilter] = useState<RecommendationStatus | 'all'>('all');
  const [rejectTarget, setRejectTarget] = useState<FlatRecommendation | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  const flatRecs = useMemo(
    () => data.flatRecommendations.filter((r) => (r.details.action as string) !== 'no_action'),
    [data.flatRecommendations]
  );

  const filteredRecs = useMemo(
    () => (statusFilter === 'all' ? flatRecs : flatRecs.filter((r) => r.status === statusFilter)),
    [flatRecs, statusFilter]
  );

  const flatRecKey = useCallback((r: FlatRecommendation) => `${r.parentId}:${r.subIndex}`, []);

  const siblingCount = useCallback(
    (parentId: string) => flatRecs.filter((r) => r.parentId === parentId).length,
    [flatRecs]
  );

  const toggleRow = useCallback((key: string) => {
    setExpandedRows((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = true;
      }
      return next;
    });
  }, []);

  const handleApprove = useCallback(
    async (rec: FlatRecommendation) => {
      const key = flatRecKey(rec);
      setActionInProgress(key);
      setApplyError(null);

      let result: { ok: boolean; error?: string };
      if (rec.category === 'rule_creation') {
        result = await onCreateEnableRuleAndApprove(
          rec.parentId,
          rec.subIndex,
          siblingCount(rec.parentId),
          rec.details,
          rec.ruleId
        );
      } else {
        result = await onApproveAndApplySubItem(
          rec.parentId,
          rec.subIndex,
          siblingCount(rec.parentId)
        );
      }

      if (!result.ok && result.error) {
        setApplyError(result.error);
      }
      setActionInProgress(null);
    },
    [onApproveAndApplySubItem, onCreateEnableRuleAndApprove, siblingCount, flatRecKey]
  );

  const handleRejectConfirm = useCallback(async () => {
    if (!rejectTarget) return;
    const key = flatRecKey(rejectTarget);
    setActionInProgress(key);
    setApplyError(null);

    if (rejectTarget.category === 'rule_creation' && rejectTarget.ruleId) {
      const result = await onDeleteRuleAndReject(
        rejectTarget.parentId,
        rejectTarget.subIndex,
        siblingCount(rejectTarget.parentId),
        rejectTarget.ruleId,
        rejectionReason
      );
      if (!result.ok && result.error) {
        setApplyError(result.error);
      }
    } else {
      await onRejectSubItem(
        rejectTarget.parentId,
        rejectTarget.subIndex,
        siblingCount(rejectTarget.parentId),
        rejectionReason
      );
    }

    setRejectTarget(null);
    setRejectionReason('');
    setActionInProgress(null);
  }, [
    rejectTarget,
    rejectionReason,
    onRejectSubItem,
    onDeleteRuleAndReject,
    siblingCount,
    flatRecKey,
  ]);

  const handleRevoke = useCallback(
    async (rec: FlatRecommendation) => {
      const key = flatRecKey(rec);
      setActionInProgress(key);
      await onRevokeSubItem(rec.parentId, rec.subIndex, siblingCount(rec.parentId));
      setActionInProgress(null);
    },
    [onRevokeSubItem, siblingCount, flatRecKey]
  );

  const itemIdToExpandedRowMap = useMemo(() => {
    const map: Record<string, React.ReactNode> = {};
    for (const key of Object.keys(expandedRows)) {
      const rec = flatRecs.find((r) => flatRecKey(r) === key);
      if (!rec) {
        /* skip missing entries */
      } else {
        map[key] = (
          <div
            css={css`
              padding: ${euiTheme.size.m} ${euiTheme.size.l};
            `}
          >
            {rec.description && (
              <>
                <EuiTitle size="xxs">
                  <h5>
                    {i18n.translate('xpack.securitySolution.autonomousSoc.recs.descriptionLabel', {
                      defaultMessage: 'Description',
                    })}
                  </h5>
                </EuiTitle>
                <EuiText size="s">
                  <p style={{ whiteSpace: 'pre-wrap' }}>{rec.description}</p>
                </EuiText>
                <EuiSpacer size="m" />
              </>
            )}
            {rec.rejection_reason && (
              <>
                <EuiCallOut
                  color="danger"
                  size="s"
                  iconType="cross"
                  title={i18n.translate(
                    'xpack.securitySolution.autonomousSoc.recs.rejectionLabel',
                    {
                      defaultMessage: 'Rejection Reason',
                    }
                  )}
                >
                  <p>{rec.rejection_reason}</p>
                </EuiCallOut>
                <EuiSpacer size="m" />
              </>
            )}
            <EuiTitle size="xxs">
              <h5>
                {rec.category === 'rule_creation'
                  ? i18n.translate('xpack.securitySolution.autonomousSoc.recs.ruleConfigLabel', {
                      defaultMessage: 'Proposed Rule Configuration',
                    })
                  : i18n.translate('xpack.securitySolution.autonomousSoc.recs.detailsLabel', {
                      defaultMessage: 'Details',
                    })}
              </h5>
            </EuiTitle>
            {rec.category === 'rule_creation' ? (
              <>
                <EuiDescriptionList
                  type="column"
                  compressed
                  listItems={[
                    { title: 'Name', description: (rec.details.name as string) ?? '—' },
                    {
                      title: 'Technique',
                      description: (rec.details.technique as string) ?? '—',
                    },
                    {
                      title: 'Query',
                      description: (rec.details.query as string) ?? 'process.name: *',
                    },
                    ...(rec.details.risk_score
                      ? [
                          {
                            title: 'Risk Score',
                            description: String(rec.details.risk_score),
                          },
                        ]
                      : []),
                    ...(rec.details.severity
                      ? [
                          {
                            title: 'Severity',
                            description: rec.details.severity as string,
                          },
                        ]
                      : []),
                    {
                      title: 'Status',
                      description: rec.kibanaRuleId ? (
                        <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                          <EuiFlexItem grow={false}>
                            <EuiBadge color="warning">{'Disabled — awaiting review'}</EuiBadge>
                          </EuiFlexItem>
                          <EuiFlexItem grow={false}>
                            <EuiLink
                              href={`${basePath}/app/security/rules/id/${rec.kibanaRuleId}`}
                              target="_blank"
                              external
                            >
                              {'View in Kibana'}
                            </EuiLink>
                          </EuiFlexItem>
                        </EuiFlexGroup>
                      ) : (
                        <EuiBadge color="hollow">
                          {(rec.details.status as string) ?? 'proposed'}
                        </EuiBadge>
                      ),
                    },
                    ...(rec.details.rule_id
                      ? [
                          {
                            title: 'Rule ID',
                            description: rec.details.rule_id as string,
                          },
                        ]
                      : []),
                  ].filter((item) => item.description !== '—')}
                />
                {(() => {
                  const q = ((rec.details.query as string) ?? '').trim();
                  const isCatchAll =
                    !q || /^\*$/i.test(q) || /^\*:\*$/i.test(q) || /^[\w.]+:\s*\*$/i.test(q);
                  return isCatchAll ? (
                    <>
                      <EuiSpacer size="s" />
                      <EuiCallOut
                        size="s"
                        color="danger"
                        iconType="warning"
                        title={i18n.translate(
                          'xpack.securitySolution.autonomousSoc.recs.catchAllQueryWarning',
                          {
                            defaultMessage:
                              'This rule has a catch-all query ({query}) that matches everything. The query does not implement the detection logic described above. Review and fix the query before enabling.',
                            values: { query: q || 'empty' },
                          }
                        )}
                      />
                    </>
                  ) : null;
                })()}
                {(rec.details.reasoning as string) && (
                  <>
                    <EuiSpacer size="m" />
                    <EuiTitle size="xxs">
                      <h5>
                        {i18n.translate(
                          'xpack.securitySolution.autonomousSoc.recs.ruleReasoningLabel',
                          { defaultMessage: 'Reasoning' }
                        )}
                      </h5>
                    </EuiTitle>
                    <EuiSpacer size="xs" />
                    <EuiText size="s" color="subdued">
                      <p style={{ whiteSpace: 'pre-wrap' }}>{rec.details.reasoning as string}</p>
                    </EuiText>
                  </>
                )}
              </>
            ) : rec.category === 'architecture_review' ? (
              <ArchReviewDetail rec={rec} />
            ) : rec.category === 'capability_gap' ? (
              <CapabilityGapDetail rec={rec} />
            ) : (
              <AgentActionDetail rec={rec} basePath={basePath} />
            )}
          </div>
        );
      }
    }
    return map;
  }, [expandedRows, flatRecs, euiTheme, flatRecKey, basePath]);

  return (
    <>
      <EuiPanel hasShadow={false} hasBorder>
        <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiTitle size="xs">
              <h3>
                {i18n.translate('xpack.securitySolution.autonomousSoc.recs.title', {
                  defaultMessage: 'AI Recommendations Review Queue',
                })}
              </h3>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="s" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiBadge color="warning">
                  {i18n.translate('xpack.securitySolution.autonomousSoc.recs.pendingCount', {
                    defaultMessage: '{count} pending',
                    values: { count: data.recommendationCounts.pending },
                  })}
                </EuiBadge>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiBadge color="success">
                  {i18n.translate('xpack.securitySolution.autonomousSoc.recs.appliedCount', {
                    defaultMessage: '{count} applied',
                    values: { count: data.recommendationCounts.applied },
                  })}
                </EuiBadge>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiBadge color="danger">
                  {i18n.translate('xpack.securitySolution.autonomousSoc.recs.rejectedCount', {
                    defaultMessage: '{count} rejected',
                    values: { count: data.recommendationCounts.rejected },
                  })}
                </EuiBadge>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="s" />

        <EuiFilterGroup>
          {(['all', 'pending', 'approved', 'rejected', 'applied', 'failed'] as const).map(
            (status) => (
              <EuiFilterButton
                key={status}
                hasActiveFilters={statusFilter === status}
                onClick={() => setStatusFilter(status)}
              >
                {status === 'all'
                  ? i18n.translate('xpack.securitySolution.autonomousSoc.recs.filterAll', {
                      defaultMessage: 'All ({count})',
                      values: { count: data.recommendationCounts.total },
                    })
                  : `${status.charAt(0).toUpperCase()}${status.slice(1)} (${
                      data.recommendationCounts[status]
                    })`}
              </EuiFilterButton>
            )
          )}
        </EuiFilterGroup>

        <EuiHorizontalRule margin="s" />

        {applyError && (
          <EuiCallOut
            title={i18n.translate('xpack.securitySolution.autonomousSoc.recs.applyErrorTitle', {
              defaultMessage: 'Failed to apply recommendation',
            })}
            color="danger"
            iconType="alert"
            size="s"
            onDismiss={() => setApplyError(null)}
          >
            <p>{applyError}</p>
          </EuiCallOut>
        )}

        <EuiBasicTable<FlatRecommendation>
          items={filteredRecs}
          itemId={flatRecKey}
          itemIdToExpandedRowMap={itemIdToExpandedRowMap}
          noItemsMessage={i18n.translate('xpack.securitySolution.autonomousSoc.recs.noItems', {
            defaultMessage:
              'No recommendations yet. The Detection Engineering and Meta Agent workflows will generate recommendations here.',
          })}
          columns={[
            {
              width: '40px',
              isExpander: true,
              render: (item: FlatRecommendation) => {
                const key = flatRecKey(item);
                return (
                  <EuiButtonIcon
                    onClick={() => toggleRow(key)}
                    aria-label={expandedRows[key] ? 'Collapse' : 'Expand'}
                    iconType={expandedRows[key] ? 'arrowDown' : 'arrowRight'}
                  />
                );
              },
            },
            {
              field: 'parentTimestamp',
              name: i18n.translate('xpack.securitySolution.autonomousSoc.column.timestamp', {
                defaultMessage: 'Timestamp',
              }),
              render: (ts: string) => formatTimestamp(ts),
              width: '140px',
            },
            {
              field: 'status',
              name: i18n.translate('xpack.securitySolution.autonomousSoc.recs.colStatus', {
                defaultMessage: 'Status',
              }),
              render: (s: RecommendationStatus) => (
                <EuiBadge color={recStatusColor(s)}>{s ?? 'unknown'}</EuiBadge>
              ),
              width: '100px',
            },
            {
              field: 'category',
              name: i18n.translate('xpack.securitySolution.autonomousSoc.recs.colType', {
                defaultMessage: 'Type',
              }),
              render: (c: FlatRecommendation['category']) => (
                <EuiBadge color={flatRecCategoryColor(c)}>{flatRecCategoryLabel(c)}</EuiBadge>
              ),
              width: '120px',
            },
            {
              field: 'parentSource',
              name: i18n.translate('xpack.securitySolution.autonomousSoc.recs.colSource', {
                defaultMessage: 'Source',
              }),
              render: (s: string) => recSourceLabel(s),
              width: '120px',
            },
            {
              field: 'title',
              name: i18n.translate('xpack.securitySolution.autonomousSoc.recs.colTitle', {
                defaultMessage: 'Title',
              }),
              render: (t: string, item: FlatRecommendation) => (
                <EuiFlexGroup gutterSize="xs" direction="column" responsive={false}>
                  <EuiFlexItem grow={false}>
                    <EuiToolTip content={t ?? '-'}>
                      <EuiText size="xs">
                        <strong>{truncateText(t, 70)}</strong>
                      </EuiText>
                    </EuiToolTip>
                  </EuiFlexItem>
                  <EuiFlexGroup gutterSize="xs" responsive={false} wrap>
                    {item.technique && (
                      <EuiFlexItem grow={false}>
                        <EuiBadge color="hollow">{item.technique}</EuiBadge>
                      </EuiFlexItem>
                    )}
                    {(item.kibanaRuleId || item.ruleId) && (
                      <EuiFlexItem grow={false}>
                        <EuiLink
                          href={
                            item.kibanaRuleId
                              ? `${basePath}/app/security/rules/id/${item.kibanaRuleId}`
                              : `${basePath}/app/security/rules/id/${item.ruleId}`
                          }
                          target="_blank"
                          external
                          css={css`
                            font-size: ${euiTheme.size.m};
                          `}
                        >
                          {i18n.translate('xpack.securitySolution.autonomousSoc.recs.viewRule', {
                            defaultMessage: 'View rule',
                          })}
                        </EuiLink>
                      </EuiFlexItem>
                    )}
                  </EuiFlexGroup>
                </EuiFlexGroup>
              ),
            },
            {
              field: 'parentConfidence',
              name: i18n.translate('xpack.securitySolution.autonomousSoc.recs.colConfidence', {
                defaultMessage: 'Confidence',
              }),
              render: (c: number) =>
                c != null ? (
                  <EuiToolTip content={`${c}%`}>
                    <EuiProgress value={c} max={100} size="s" color="primary" />
                  </EuiToolTip>
                ) : (
                  '-'
                ),
              width: '90px',
            },
            {
              name: i18n.translate('xpack.securitySolution.autonomousSoc.recs.colActions', {
                defaultMessage: 'Actions',
              }),
              width: '80px',
              render: (rec: FlatRecommendation) => {
                const key = flatRecKey(rec);
                const isProcessing = actionInProgress === key;
                if (rec.status === 'pending') {
                  const tuningAction = (rec.details.action as string) ?? '';
                  const EXCEPTION_ACTIONS = [
                    'add_exception',
                    'update_exception',
                    'modify_exception',
                  ];
                  const THRESHOLD_ACTIONS = ['raise_threshold', 'lower_threshold'];
                  const isExceptionApplyable =
                    rec.category === 'rule_tuning' &&
                    rec.ruleId &&
                    EXCEPTION_ACTIONS.includes(tuningAction);
                  const hasPatchFields =
                    rec.details.patch_fields != null &&
                    Object.keys(rec.details.patch_fields as Record<string, unknown>).length > 0;
                  const hasInlineFields =
                    rec.details.query != null ||
                    rec.details.risk_score != null ||
                    rec.details.severity != null;
                  const isThresholdApplyable =
                    rec.category === 'rule_tuning' &&
                    rec.ruleId &&
                    THRESHOLD_ACTIONS.includes(tuningAction) &&
                    (hasPatchFields || hasInlineFields);
                  const isAutoApplyable = isExceptionApplyable || isThresholdApplyable;
                  const isNewRule = rec.category === 'rule_creation';

                  let approveTooltip: string;
                  let approveIcon: string;
                  if (isNewRule) {
                    approveTooltip = rec.kibanaRuleId ? 'Enable Rule' : 'Create & Enable Rule';
                    approveIcon = rec.kibanaRuleId ? 'playFilled' : 'plusInCircleFilled';
                  } else if (isAutoApplyable) {
                    approveTooltip = 'Apply';
                    approveIcon = 'play';
                  } else {
                    approveTooltip = 'Approve';
                    approveIcon = 'check';
                  }

                  const rejectTooltip = isNewRule && rec.kibanaRuleId ? 'Delete Rule' : 'Reject';

                  return (
                    <EuiFlexGroup gutterSize="xs" responsive={false} alignItems="center">
                      <EuiFlexItem grow={false}>
                        <EuiToolTip content={approveTooltip}>
                          <EuiButtonIcon
                            display="base"
                            size="s"
                            color="success"
                            iconType={approveIcon}
                            isLoading={isProcessing}
                            onClick={() => handleApprove(rec)}
                            aria-label={approveTooltip}
                          />
                        </EuiToolTip>
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiToolTip content={rejectTooltip}>
                          <EuiButtonIcon
                            display="base"
                            size="s"
                            color="danger"
                            iconType="cross"
                            isLoading={isProcessing}
                            onClick={() => setRejectTarget(rec)}
                            aria-label={rejectTooltip}
                          />
                        </EuiToolTip>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  );
                }
                if (rec.status === 'approved' || rec.status === 'rejected') {
                  return (
                    <EuiButtonEmpty
                      size="xs"
                      iconType="refresh"
                      isLoading={isProcessing}
                      onClick={() => handleRevoke(rec)}
                    >
                      {i18n.translate(
                        'xpack.securitySolution.autonomousSoc.recs.reconsiderAction',
                        { defaultMessage: 'Reconsider' }
                      )}
                    </EuiButtonEmpty>
                  );
                }
                if (rec.status === 'applied') {
                  const appliedLabel =
                    rec.category === 'rule_creation'
                      ? i18n.translate(
                          'xpack.securitySolution.autonomousSoc.recs.ruleEnabledStatus',
                          { defaultMessage: 'Rule Enabled' }
                        )
                      : i18n.translate('xpack.securitySolution.autonomousSoc.recs.appliedStatus', {
                          defaultMessage: 'Applied',
                        });
                  return <EuiHealth color="success">{appliedLabel}</EuiHealth>;
                }
                if (rec.status === 'failed') {
                  return (
                    <EuiFlexGroup gutterSize="xs" responsive={false} alignItems="center">
                      <EuiFlexItem grow={false}>
                        <EuiHealth color="danger">
                          {i18n.translate(
                            'xpack.securitySolution.autonomousSoc.recs.failedStatus',
                            { defaultMessage: 'Failed' }
                          )}
                        </EuiHealth>
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiButtonEmpty
                          size="s"
                          iconType="refresh"
                          isLoading={isProcessing}
                          onClick={() => handleRevoke(rec)}
                        >
                          {i18n.translate('xpack.securitySolution.autonomousSoc.recs.retryAction', {
                            defaultMessage: 'Retry',
                          })}
                        </EuiButtonEmpty>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  );
                }
                return null;
              },
            },
          ]}
        />
      </EuiPanel>

      {rejectTarget && (
        <EuiConfirmModal
          title={i18n.translate('xpack.securitySolution.autonomousSoc.recs.rejectModalTitle', {
            defaultMessage: 'Reject Recommendation',
          })}
          onCancel={() => {
            setRejectTarget(null);
            setRejectionReason('');
          }}
          onConfirm={handleRejectConfirm}
          cancelButtonText={i18n.translate(
            'xpack.securitySolution.autonomousSoc.recs.rejectModalCancel',
            { defaultMessage: 'Cancel' }
          )}
          confirmButtonText={i18n.translate(
            'xpack.securitySolution.autonomousSoc.recs.rejectModalConfirm',
            { defaultMessage: 'Reject' }
          )}
          buttonColor="danger"
          defaultFocusedButton="confirm"
        >
          <EuiText size="s">
            <p>
              {i18n.translate('xpack.securitySolution.autonomousSoc.recs.rejectModalBody', {
                defaultMessage:
                  'Rejecting "{title}". The rejection reason will be fed back to the AI to improve future recommendations.',
                values: { title: rejectTarget.title ?? 'Recommendation' },
              })}
            </p>
          </EuiText>
          <EuiSpacer size="m" />
          <EuiTextArea
            placeholder={i18n.translate(
              'xpack.securitySolution.autonomousSoc.recs.rejectModalPlaceholder',
              { defaultMessage: 'Reason for rejection...' }
            )}
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={4}
            fullWidth
          />
        </EuiConfirmModal>
      )}
    </>
  );
};

const AGENT_BUILDER_BASE_PATH = '/app/agent_builder/agents';
const AGENT_BUILDER_SKILLS_PATH = '/app/agent_builder/manage/skills';
const WORKFLOWS_BASE_PATH = '/app/workflows';

/**
 * Action callbacks used to drive a recommendation through its lifecycle
 * (approve/apply, reject-with-reason, revoke, and the rule-creation variants).
 * Extracted so the same surface can be reused by the dedicated Recommendations
 * tab and by the inline review affordance embedded in the Evolution Log.
 */
interface RecommendationActionHandlers {
  onApproveAndApplySubItem: (
    docId: string,
    subIndex: number,
    totalCount: number
  ) => Promise<{ ok: boolean; error?: string }>;
  onRejectSubItem: (
    docId: string,
    subIndex: number,
    totalCount: number,
    reason: string
  ) => Promise<boolean>;
  onRevokeSubItem: (docId: string, subIndex: number, totalCount: number) => Promise<boolean>;
  onCreateEnableRuleAndApprove: (
    docId: string,
    subIndex: number,
    totalCount: number,
    details: Record<string, unknown>,
    ruleIdOverride?: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onDeleteRuleAndReject: (
    docId: string,
    subIndex: number,
    totalCount: number,
    ruleId: string,
    reason: string
  ) => Promise<{ ok: boolean; error?: string }>;
}

const recBadgeColor = (
  s: RecommendationStatus
): 'default' | 'hollow' | 'primary' | 'success' | 'warning' | 'danger' => {
  switch (s) {
    case 'applied':
    case 'approved':
      return 'success';
    case 'failed':
      return 'danger';
    case 'rejected':
      return 'warning';
    case 'pending':
    default:
      return 'hollow';
  }
};

/* ── Inline recommendation review (shown in Evolution Log) ─────────── */
const LinkedRecommendationReview: React.FC<{
  parentRec: Recommendation;
  flatRecs: FlatRecommendation[];
  handlers: RecommendationActionHandlers;
  /** Opens the confirm-with-reason modal owned by the parent panel. */
  onRequestReject: (rec: FlatRecommendation) => void;
  onOpenInRecommendations?: (parentRecId: string) => void;
  actionInProgressKey: string | null;
  setActionInProgressKey: (key: string | null) => void;
}> = ({
  parentRec,
  flatRecs,
  handlers,
  onRequestReject,
  onOpenInRecommendations,
  actionInProgressKey,
  setActionInProgressKey,
}) => {
  const { euiTheme } = useEuiTheme();
  const siblingCount = flatRecs.length;
  const keyOf = useCallback((f: FlatRecommendation) => `${f.parentId}:${f.subIndex}`, []);

  const handleApprove = useCallback(
    async (rec: FlatRecommendation) => {
      const key = keyOf(rec);
      setActionInProgressKey(key);
      if (rec.category === 'rule_creation') {
        await handlers.onCreateEnableRuleAndApprove(
          rec.parentId,
          rec.subIndex,
          siblingCount,
          rec.details,
          rec.ruleId
        );
      } else {
        await handlers.onApproveAndApplySubItem(rec.parentId, rec.subIndex, siblingCount);
      }
      setActionInProgressKey(null);
    },
    [handlers, siblingCount, setActionInProgressKey, keyOf]
  );

  const handleRevoke = useCallback(
    async (rec: FlatRecommendation) => {
      const key = keyOf(rec);
      setActionInProgressKey(key);
      await handlers.onRevokeSubItem(rec.parentId, rec.subIndex, siblingCount);
      setActionInProgressKey(null);
    },
    [handlers, siblingCount, setActionInProgressKey, keyOf]
  );

  return (
    <EuiPanel
      color="primary"
      hasShadow={false}
      hasBorder={false}
      paddingSize="m"
      css={css`
        margin-bottom: ${euiTheme.size.m};
      `}
    >
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <EuiIcon type="inspect" size="m" />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiTitle size="xxs">
            <h5>
              {i18n.translate('xpack.securitySolution.autonomousSoc.evolution.linkedRec.title', {
                defaultMessage: 'Linked recommendation',
              })}
            </h5>
          </EuiTitle>
          <EuiText size="xs" color="subdued">
            {parentRec.rec_id ?? parentRec._id}
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadge color={recBadgeColor(parentRec.status)}>{parentRec.status}</EuiBadge>
        </EuiFlexItem>
        {onOpenInRecommendations && (
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              size="xs"
              iconType="popout"
              onClick={() => onOpenInRecommendations(parentRec._id)}
            >
              {i18n.translate(
                'xpack.securitySolution.autonomousSoc.evolution.linkedRec.openInRecs',
                { defaultMessage: 'Open in Recommendations' }
              )}
            </EuiButtonEmpty>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>

      {parentRec.title && (
        <>
          <EuiSpacer size="xs" />
          <EuiText size="s">{parentRec.title}</EuiText>
        </>
      )}

      <EuiSpacer size="s" />

      {flatRecs.length === 0 ? (
        <EuiText size="xs" color="subdued">
          {i18n.translate('xpack.securitySolution.autonomousSoc.evolution.linkedRec.noSubItems', {
            defaultMessage: 'No actionable sub-items on this recommendation.',
          })}
        </EuiText>
      ) : (
        flatRecs.map((rec) => {
          const key = keyOf(rec);
          const busy = actionInProgressKey === key;
          const isPending = rec.status === 'pending';
          const canRevoke =
            rec.status === 'approved' ||
            rec.status === 'applied' ||
            rec.status === 'rejected' ||
            rec.status === 'failed';

          return (
            <EuiPanel
              key={key}
              hasShadow={false}
              hasBorder
              paddingSize="s"
              css={css`
                margin-bottom: ${euiTheme.size.s};
                background: ${euiTheme.colors.emptyShade};
              `}
            >
              <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
                <EuiFlexItem grow={false}>
                  <EuiBadge color="hollow">{rec.category}</EuiBadge>
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiText size="xs">
                    <strong>{rec.title}</strong>
                  </EuiText>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiBadge color={recBadgeColor(rec.status)}>{rec.status}</EuiBadge>
                </EuiFlexItem>
              </EuiFlexGroup>

              {rec.description && (
                <>
                  <EuiSpacer size="xs" />
                  <EuiText size="xs" color="subdued">
                    <p
                      css={css`
                        white-space: pre-wrap;
                        margin: 0;
                      `}
                    >
                      {rec.description.length > 280
                        ? `${rec.description.slice(0, 280)}…`
                        : rec.description}
                    </p>
                  </EuiText>
                </>
              )}

              {rec.rejection_reason && (
                <>
                  <EuiSpacer size="xs" />
                  <EuiCallOut
                    size="s"
                    color="danger"
                    iconType="cross"
                    title={i18n.translate(
                      'xpack.securitySolution.autonomousSoc.evolution.linkedRec.rejectionReasonLabel',
                      { defaultMessage: 'Rejection reason' }
                    )}
                  >
                    <p>{rec.rejection_reason}</p>
                  </EuiCallOut>
                </>
              )}

              <EuiSpacer size="xs" />

              <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
                {isPending && (
                  <>
                    <EuiFlexItem grow={false}>
                      <EuiToolTip
                        content={i18n.translate(
                          'xpack.securitySolution.autonomousSoc.evolution.linkedRec.approveTooltip',
                          { defaultMessage: 'Approve & apply' }
                        )}
                      >
                        <EuiButtonIcon
                          display="base"
                          size="s"
                          color="success"
                          iconType="check"
                          isLoading={busy}
                          onClick={() => handleApprove(rec)}
                          aria-label={i18n.translate(
                            'xpack.securitySolution.autonomousSoc.evolution.linkedRec.approveAria',
                            { defaultMessage: 'Approve and apply recommendation' }
                          )}
                        />
                      </EuiToolTip>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiToolTip
                        content={i18n.translate(
                          'xpack.securitySolution.autonomousSoc.evolution.linkedRec.rejectTooltip',
                          { defaultMessage: 'Reject with reason' }
                        )}
                      >
                        <EuiButtonIcon
                          display="base"
                          size="s"
                          color="danger"
                          iconType="cross"
                          isLoading={busy}
                          onClick={() => onRequestReject(rec)}
                          aria-label={i18n.translate(
                            'xpack.securitySolution.autonomousSoc.evolution.linkedRec.rejectAria',
                            { defaultMessage: 'Reject recommendation' }
                          )}
                        />
                      </EuiToolTip>
                    </EuiFlexItem>
                  </>
                )}
                {canRevoke && (
                  <EuiFlexItem grow={false}>
                    <EuiButtonEmpty
                      size="xs"
                      iconType="refresh"
                      isLoading={busy}
                      onClick={() => handleRevoke(rec)}
                    >
                      {i18n.translate(
                        'xpack.securitySolution.autonomousSoc.evolution.linkedRec.reconsiderAction',
                        { defaultMessage: 'Reconsider' }
                      )}
                    </EuiButtonEmpty>
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
            </EuiPanel>
          );
        })
      )}
    </EuiPanel>
  );
};

interface EvolutionEventLinkedReviewProps {
  linkedRec?: Recommendation;
  linkedFlatRecs: FlatRecommendation[];
  handlers?: RecommendationActionHandlers;
  onRequestReject?: (rec: FlatRecommendation) => void;
  onOpenInRecommendations?: (parentRecId: string) => void;
  actionInProgressKey: string | null;
  setActionInProgressKey: (key: string | null) => void;
}

/* ── Evolution event expanded row detail ────────────────────── */
const EvolutionEventDetail: React.FC<
  {
    evt: EvolutionEvent;
    basePath: string;
  } & EvolutionEventLinkedReviewProps
> = ({
  evt,
  basePath,
  linkedRec,
  linkedFlatRecs,
  handlers,
  onRequestReject,
  onOpenInRecommendations,
  actionInProgressKey,
  setActionInProgressKey,
}) => {
  const hasRuleChanges =
    evt.rulesTuned.length > 0 || evt.rulesCreated.length > 0 || evt.rulesDisabled.length > 0;

  const renderRuleSection = (
    title: string,
    rules: RuleTuning[],
    color: 'warning' | 'success' | 'danger'
  ) => {
    if (rules.length === 0) return null;
    return (
      <>
        <EuiText size="xs">
          <strong>{title}</strong>
        </EuiText>
        <EuiSpacer size="xs" />
        {rules.map((r, idx) => (
          <EuiPanel
            key={r.rule_id ?? idx}
            hasShadow={false}
            hasBorder
            paddingSize="s"
            css={css`
              margin-bottom: 6px;
            `}
          >
            <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
              <EuiFlexItem grow={false}>
                <EuiBadge color={color}>{r.action ?? 'change'}</EuiBadge>
              </EuiFlexItem>
              {r.rule_id && (
                <EuiFlexItem grow={false}>
                  <EuiText size="xs" color="subdued">
                    {r.rule_id}
                  </EuiText>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
            {r.before && (
              <>
                <EuiSpacer size="xs" />
                <EuiText size="xs">{r.before}</EuiText>
              </>
            )}
          </EuiPanel>
        ))}
        <EuiSpacer size="s" />
      </>
    );
  };

  return (
    <div
      css={css`
        padding: 8px 16px 16px;
      `}
    >
      {/* Inline recommendation review — lets operators approve/reject without
          leaving the Evolution Log. */}
      {linkedRec && handlers && onRequestReject && (
        <LinkedRecommendationReview
          parentRec={linkedRec}
          flatRecs={linkedFlatRecs}
          handlers={handlers}
          onRequestReject={onRequestReject}
          onOpenInRecommendations={onOpenInRecommendations}
          actionInProgressKey={actionInProgressKey}
          setActionInProgressKey={setActionInProgressKey}
        />
      )}

      {/* Agent link */}
      {evt.agentId && (
        <>
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiIcon type="productAgent" size="m" />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiLink
                href={`${basePath}${AGENT_BUILDER_BASE_PATH}/${encodeURIComponent(evt.agentId)}`}
                target="_blank"
              >
                <strong>{evt.agentName ?? evt.agentId}</strong>
              </EuiLink>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {evt.action === 'create_agent'
                  ? i18n.translate('xpack.securitySolution.autonomousSoc.evolution.agentCreated', {
                      defaultMessage: '(created)',
                    })
                  : i18n.translate('xpack.securitySolution.autonomousSoc.evolution.agentRefined', {
                      defaultMessage: '(refined)',
                    })}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="s" />
        </>
      )}

      {/* Skill link */}
      {evt.skillId && (
        <>
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiIcon type="sparkles" size="m" />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiLink
                href={`${basePath}${AGENT_BUILDER_SKILLS_PATH}/${encodeURIComponent(evt.skillId)}`}
                target="_blank"
              >
                <strong>{evt.skillName ?? evt.skillId}</strong>
              </EuiLink>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {evt.action === 'create_skill'
                  ? i18n.translate('xpack.securitySolution.autonomousSoc.evolution.skillCreated', {
                      defaultMessage: '(created)',
                    })
                  : i18n.translate('xpack.securitySolution.autonomousSoc.evolution.skillUpdated', {
                      defaultMessage: '(updated)',
                    })}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="s" />
        </>
      )}

      {/* Workflow link */}
      {evt.workflowId && (
        <>
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiIcon type="workflowsApp" size="m" />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiLink
                href={`${basePath}${WORKFLOWS_BASE_PATH}/${encodeURIComponent(evt.workflowId)}`}
                target="_blank"
              >
                <strong>{evt.workflowName ?? evt.workflowId}</strong>
              </EuiLink>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBadge
                color={
                  evt.result === 'success'
                    ? 'success'
                    : evt.result === 'failure'
                    ? 'danger'
                    : 'hollow'
                }
              >
                {evt.result ??
                  i18n.translate('xpack.securitySolution.autonomousSoc.evolution.recommended', {
                    defaultMessage: 'recommended',
                  })}
              </EuiBadge>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="s" />
        </>
      )}

      {/* Result status (for non-linked actions) */}
      {evt.result && !evt.workflowId && !evt.skillId && !evt.agentId && (
        <>
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiBadge
                color={
                  evt.result === 'success'
                    ? 'success'
                    : evt.result === 'failure'
                    ? 'danger'
                    : 'hollow'
                }
              >
                {evt.result}
              </EuiBadge>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="s" />
        </>
      )}

      {/* Refinement details */}
      {evt.refinement?.reasoning && (
        <>
          <EuiText size="xs">
            <strong>
              {i18n.translate('xpack.securitySolution.autonomousSoc.evolution.refinementReason', {
                defaultMessage: 'Refinement Reason',
              })}
            </strong>
          </EuiText>
          <EuiSpacer size="xs" />
          <EuiText size="xs">{evt.refinement.reasoning}</EuiText>
          <EuiSpacer size="m" />
        </>
      )}

      {/* Rule changes */}
      {hasRuleChanges && (
        <>
          {renderRuleSection(
            i18n.translate('xpack.securitySolution.autonomousSoc.evolution.rulesTuned', {
              defaultMessage: 'Rules Tuned ({count})',
              values: { count: evt.rulesTuned.length },
            }),
            evt.rulesTuned,
            'warning'
          )}
          {renderRuleSection(
            i18n.translate('xpack.securitySolution.autonomousSoc.evolution.rulesCreated', {
              defaultMessage: 'Rules Created ({count})',
              values: { count: evt.rulesCreated.length },
            }),
            evt.rulesCreated,
            'success'
          )}
          {renderRuleSection(
            i18n.translate('xpack.securitySolution.autonomousSoc.evolution.rulesDisabled', {
              defaultMessage: 'Rules Disabled ({count})',
              values: { count: evt.rulesDisabled.length },
            }),
            evt.rulesDisabled,
            'danger'
          )}
        </>
      )}

      {/* Reasoning */}
      {evt.reasoning && (
        <>
          <EuiText size="xs">
            <strong>
              {i18n.translate('xpack.securitySolution.autonomousSoc.evolution.reasoning', {
                defaultMessage: 'Reasoning',
              })}
            </strong>
          </EuiText>
          <EuiSpacer size="xs" />
          <EuiText size="xs">{evt.reasoning}</EuiText>
          <EuiSpacer size="s" />
        </>
      )}

      {/* Summary */}
      {evt.summary && (
        <>
          <EuiText size="xs">
            <strong>
              {i18n.translate('xpack.securitySolution.autonomousSoc.evolution.summaryLabel', {
                defaultMessage: 'Summary',
              })}
            </strong>
          </EuiText>
          <EuiSpacer size="xs" />
          <EuiText size="xs">{evt.summary}</EuiText>
        </>
      )}
    </div>
  );
};

/* ── Evolution Log Panel with expandable rows ──────────────── */
const EvolutionLogPanel: React.FC<{
  data: SocData;
  actionHandlers?: RecommendationActionHandlers;
  onOpenInRecommendations?: (parentRecId: string) => void;
}> = ({ data, actionHandlers, onOpenInRecommendations }) => {
  const { http } = useKibana().services;
  const basePath = http?.basePath?.get() ?? '';
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});
  const [rejectTarget, setRejectTarget] = useState<FlatRecommendation | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionInProgressKey, setActionInProgressKey] = useState<string | null>(null);

  const toggleRow = useCallback((idx: number) => {
    setExpandedRows((prev) => {
      const next = { ...prev };
      if (next[idx]) {
        delete next[idx];
      } else {
        next[idx] = true;
      }
      return next;
    });
  }, []);

  // Index recommendations by source_doc_id so each evolution-log row can
  // surface its linked recommendation inline.
  const recsByEvtId = useMemo(() => {
    const map = new Map<string, Recommendation>();
    for (const rec of data.recommendations) {
      if (rec.source_doc_id) {
        map.set(rec.source_doc_id, rec);
      }
    }
    return map;
  }, [data.recommendations]);

  const flatsByParent = useMemo(() => {
    const map = new Map<string, FlatRecommendation[]>();
    for (const flat of data.flatRecommendations) {
      // Filter out meta "no_action" rows the same way the Recommendations tab does.
      if ((flat.details.action as string) !== 'no_action') {
        const list = map.get(flat.parentId);
        if (list) {
          list.push(flat);
        } else {
          map.set(flat.parentId, [flat]);
        }
      }
    }
    return map;
  }, [data.flatRecommendations]);

  const findLinked = useCallback(
    (evt: EvolutionEvent) => {
      if (!evt._id) return { rec: undefined as Recommendation | undefined, flats: [] };
      const rec = recsByEvtId.get(evt._id);
      const flats = rec ? flatsByParent.get(rec._id) ?? [] : [];
      return { rec, flats };
    },
    [recsByEvtId, flatsByParent]
  );

  const items = useMemo(
    () => data.evolutionEvents.map((e, idx) => ({ ...e, _idx: idx })),
    [data.evolutionEvents]
  );

  const itemIdToExpandedRowMap = useMemo(() => {
    const map: Record<number, React.ReactNode> = {};
    for (const idx of Object.keys(expandedRows)) {
      const numIdx = Number(idx);
      const evt = data.evolutionEvents[numIdx];
      if (evt) {
        const { rec, flats } = findLinked(evt);
        map[numIdx] = (
          <EvolutionEventDetail
            evt={evt}
            basePath={basePath}
            linkedRec={rec}
            linkedFlatRecs={flats}
            handlers={actionHandlers}
            onRequestReject={setRejectTarget}
            onOpenInRecommendations={onOpenInRecommendations}
            actionInProgressKey={actionInProgressKey}
            setActionInProgressKey={setActionInProgressKey}
          />
        );
      }
    }
    return map;
  }, [
    expandedRows,
    data.evolutionEvents,
    basePath,
    findLinked,
    actionHandlers,
    onOpenInRecommendations,
    actionInProgressKey,
  ]);

  const handleRejectConfirm = useCallback(async () => {
    if (!rejectTarget || !actionHandlers) return;
    const siblings = flatsByParent.get(rejectTarget.parentId) ?? [];
    const key = `${rejectTarget.parentId}:${rejectTarget.subIndex}`;
    setActionInProgressKey(key);
    if (rejectTarget.category === 'rule_creation' && rejectTarget.ruleId) {
      await actionHandlers.onDeleteRuleAndReject(
        rejectTarget.parentId,
        rejectTarget.subIndex,
        siblings.length,
        rejectTarget.ruleId,
        rejectionReason
      );
    } else {
      await actionHandlers.onRejectSubItem(
        rejectTarget.parentId,
        rejectTarget.subIndex,
        siblings.length,
        rejectionReason
      );
    }
    setRejectTarget(null);
    setRejectionReason('');
    setActionInProgressKey(null);
  }, [rejectTarget, rejectionReason, actionHandlers, flatsByParent]);

  const actionColor = (action?: string): string => {
    if (!action || action === 'no_action') return 'hollow';
    if (action === 'refine_agent' || action === 'enrich_agent') return 'primary';
    if (action === 'create_agent') return 'success';
    if (action === 'create_skill') return 'success';
    if (action === 'update_skill') return 'primary';
    if (action === 'create_workflow') return 'success';
    return 'accent';
  };

  return (
    <EuiPanel hasShadow={false} hasBorder>
      <EuiTitle size="xs">
        <h3>
          {i18n.translate('xpack.securitySolution.autonomousSoc.evolution.title', {
            defaultMessage: 'System Evolution Log',
          })}
        </h3>
      </EuiTitle>
      <EuiText size="xs" color="subdued">
        {i18n.translate('xpack.securitySolution.autonomousSoc.evolution.description', {
          defaultMessage:
            'Track how the autonomous SOC evolves over time: new agents created by the meta-agent, workflows deployed, difficulty adjustments, and self-improvement decisions.',
        })}
      </EuiText>
      <EuiHorizontalRule margin="s" />
      <EuiBasicTable<EvolutionEvent & { _idx: number }>
        items={items}
        itemId="_idx"
        itemIdToExpandedRowMap={itemIdToExpandedRowMap}
        noItemsMessage={i18n.translate('xpack.securitySolution.autonomousSoc.evolution.noItems', {
          defaultMessage:
            'No evolution events yet. The meta-agent will log changes as the system self-improves.',
        })}
        columns={[
          {
            width: '40px',
            isExpander: true,
            render: (item: EvolutionEvent & { _idx: number }) => (
              <EuiButtonIcon
                onClick={() => toggleRow(item._idx)}
                aria-label={
                  expandedRows[item._idx]
                    ? i18n.translate('xpack.securitySolution.autonomousSoc.evolution.collapse', {
                        defaultMessage: 'Collapse',
                      })
                    : i18n.translate('xpack.securitySolution.autonomousSoc.evolution.expand', {
                        defaultMessage: 'Expand',
                      })
                }
                iconType={expandedRows[item._idx] ? 'arrowDown' : 'arrowRight'}
              />
            ),
          },
          {
            field: '@timestamp',
            name: i18n.translate('xpack.securitySolution.autonomousSoc.column.timestamp', {
              defaultMessage: 'Timestamp',
            }),
            render: (ts: string) => formatTimestamp(ts),
            width: '160px',
          },
          {
            field: 'event_type',
            name: i18n.translate('xpack.securitySolution.autonomousSoc.column.eventType', {
              defaultMessage: 'Event Type',
            }),
            render: (t: string) => <EuiBadge color="hollow">{t ?? '-'}</EuiBadge>,
            width: '150px',
          },
          {
            field: 'source',
            name: i18n.translate('xpack.securitySolution.autonomousSoc.column.source', {
              defaultMessage: 'Source',
            }),
            width: '130px',
          },
          {
            name: i18n.translate('xpack.securitySolution.autonomousSoc.evolution.changeColumn', {
              defaultMessage: 'Changes',
            }),
            width: '220px',
            render: (item: EvolutionEvent & { _idx: number }) => {
              const badges: React.ReactNode[] = [];
              if (item.action) {
                badges.push(
                  <EuiBadge key="action" color={actionColor(item.action)}>
                    {item.action}
                  </EuiBadge>
                );
              }
              if (item.agentId) {
                badges.push(
                  <EuiLink
                    key="agent"
                    href={`${basePath}${AGENT_BUILDER_BASE_PATH}/${encodeURIComponent(
                      item.agentId
                    )}`}
                    target="_blank"
                    css={css`
                      font-size: 12px;
                    `}
                  >
                    <EuiIcon type="productAgent" size="s" /> {item.agentName ?? item.agentId}
                  </EuiLink>
                );
              }
              if (item.skillId) {
                badges.push(
                  <EuiLink
                    key="skill"
                    href={`${basePath}${AGENT_BUILDER_SKILLS_PATH}/${encodeURIComponent(
                      item.skillId
                    )}`}
                    target="_blank"
                    css={css`
                      font-size: 12px;
                    `}
                  >
                    <EuiIcon type="sparkles" size="s" /> {item.skillName ?? item.skillId}
                  </EuiLink>
                );
              }
              if (item.workflowId) {
                badges.push(
                  <EuiLink
                    key="workflow"
                    href={`${basePath}${WORKFLOWS_BASE_PATH}/${encodeURIComponent(
                      item.workflowId
                    )}`}
                    target="_blank"
                    css={css`
                      font-size: 12px;
                    `}
                  >
                    <EuiIcon type="workflowsApp" size="s" /> {item.workflowName ?? item.workflowId}
                  </EuiLink>
                );
              }
              if (item.rulesTuned.length > 0) {
                badges.push(
                  <EuiBadge key="tuned" color="warning">
                    {i18n.translate('xpack.securitySolution.autonomousSoc.evolution.tunedCount', {
                      defaultMessage: '{count} tuned',
                      values: { count: item.rulesTuned.length },
                    })}
                  </EuiBadge>
                );
              }
              if (item.rulesCreated.length > 0) {
                badges.push(
                  <EuiBadge key="created" color="success">
                    {i18n.translate('xpack.securitySolution.autonomousSoc.evolution.createdCount', {
                      defaultMessage: '{count} created',
                      values: { count: item.rulesCreated.length },
                    })}
                  </EuiBadge>
                );
              }
              if (item.rulesDisabled.length > 0) {
                badges.push(
                  <EuiBadge key="disabled" color="danger">
                    {i18n.translate(
                      'xpack.securitySolution.autonomousSoc.evolution.disabledCount',
                      {
                        defaultMessage: '{count} disabled',
                        values: { count: item.rulesDisabled.length },
                      }
                    )}
                  </EuiBadge>
                );
              }
              const { rec: linkedRec, flats: linkedFlats } = findLinked(item);
              if (linkedRec) {
                const pendingCount = linkedFlats.filter((f) => f.status === 'pending').length;
                if (pendingCount > 0) {
                  badges.push(
                    <EuiBadge key="review" color="accent" iconType="inspect">
                      {i18n.translate(
                        'xpack.securitySolution.autonomousSoc.evolution.pendingReviewBadge',
                        {
                          defaultMessage: '{count} pending review',
                          values: { count: pendingCount },
                        }
                      )}
                    </EuiBadge>
                  );
                }
              }
              if (badges.length === 0) return '-';
              return (
                <EuiFlexGroup gutterSize="xs" responsive={false} wrap>
                  {badges.map((b, idx) => (
                    <EuiFlexItem grow={false} key={idx}>
                      {b}
                    </EuiFlexItem>
                  ))}
                </EuiFlexGroup>
              );
            },
          },
          {
            name: i18n.translate('xpack.securitySolution.autonomousSoc.column.summary', {
              defaultMessage: 'Summary',
            }),
            render: (item: EvolutionEvent & { _idx: number }) =>
              item.summary ? (
                <EuiToolTip content={item.summary}>
                  <EuiText size="xs">{truncateText(item.summary, 100)}</EuiText>
                </EuiToolTip>
              ) : (
                '-'
              ),
          },
        ]}
      />
      {rejectTarget && (
        <EuiConfirmModal
          title={i18n.translate(
            'xpack.securitySolution.autonomousSoc.evolution.linkedRec.rejectModalTitle',
            { defaultMessage: 'Reject Recommendation' }
          )}
          onCancel={() => {
            setRejectTarget(null);
            setRejectionReason('');
          }}
          onConfirm={handleRejectConfirm}
          cancelButtonText={i18n.translate(
            'xpack.securitySolution.autonomousSoc.evolution.linkedRec.rejectModalCancel',
            { defaultMessage: 'Cancel' }
          )}
          confirmButtonText={i18n.translate(
            'xpack.securitySolution.autonomousSoc.evolution.linkedRec.rejectModalConfirm',
            { defaultMessage: 'Reject' }
          )}
          buttonColor="danger"
          defaultFocusedButton="confirm"
        >
          <EuiText size="s">
            <p>
              {i18n.translate(
                'xpack.securitySolution.autonomousSoc.evolution.linkedRec.rejectModalBody',
                {
                  defaultMessage:
                    'Rejecting "{title}". The rejection reason will be fed back to the AI to improve future recommendations.',
                  values: { title: rejectTarget.title ?? 'Recommendation' },
                }
              )}
            </p>
          </EuiText>
          <EuiSpacer size="m" />
          <EuiTextArea
            placeholder={i18n.translate(
              'xpack.securitySolution.autonomousSoc.evolution.linkedRec.rejectModalPlaceholder',
              { defaultMessage: 'Reason for rejection...' }
            )}
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={4}
            fullWidth
          />
        </EuiConfirmModal>
      )}
    </EuiPanel>
  );
};

/* ── Pipeline run helpers ────────────────────────────────── */
const pipelineRunSource = (correlationId?: string): string => {
  if (!correlationId) return 'unknown';
  const prefix = correlationId.split('-')[0];
  switch (prefix) {
    case 'pipeline':
      return 'soc-alert-sweeper';
    case 'triage':
      return 'soc-triage';
    case 'case':
      return 'soc-case-creation';
    case 'response':
      return 'soc-response';
    default:
      return prefix || 'unknown';
  }
};

const RUN_WINDOW_MS = 2 * 60 * 1000;

const itemsInWindow = <T extends { '@timestamp': string }>(
  items: T[],
  centerTs: string,
  limit: number
): T[] => {
  const center = new Date(centerTs).getTime();
  if (Number.isNaN(center)) return [];
  return items
    .filter((it) => {
      const t = new Date(it['@timestamp']).getTime();
      return !Number.isNaN(t) && Math.abs(t - center) <= RUN_WINDOW_MS;
    })
    .slice(0, limit);
};

/**
 * Reasoning traces don't yet flow a correlation_id end-to-end (run_id and
 * outcome.correlation_id are produced by different workflows). To keep the
 * drill-down useful regardless, match by exact run_id first, then fall back
 * to any trace whose @timestamp lands inside the run window.
 */
const reasoningStepsForRun = (
  all: ReasoningTraceStep[],
  outcome: OutcomeRecord,
  limit = 200
): ReasoningTraceStep[] => {
  const exact = outcome.correlation_id
    ? all.filter((s) => s.run_id === outcome.correlation_id)
    : [];
  const picked = exact.length > 0 ? exact : itemsInWindow(all, outcome['@timestamp'], limit);
  return [...picked].sort((a, b) => {
    if (a.run_id !== b.run_id) return a.run_id.localeCompare(b.run_id);
    if (a.agent_id !== b.agent_id) return a.agent_id.localeCompare(b.agent_id);
    return a.step_index - b.step_index;
  });
};

const STEP_TYPE_COLOR: Record<ReasoningTraceStep['step_type'], string> = {
  thought: 'hollow',
  tool_call: 'primary',
  tool_result: 'success',
  decision: 'warning',
  recommendation: 'accent',
  run_summary: 'default',
};

const FINAL_STATUS_COLOR: Record<NonNullable<ReasoningTraceStep['final_status']>, string> = {
  success: 'success',
  failure: 'danger',
  aborted: 'warning',
};

const formatDurationMs = (ms: number | undefined): string => {
  if (ms == null || !Number.isFinite(ms)) return '-';
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s - m * 60);
  return `${m}m ${rem}s`;
};

/* ── Pipeline Run Details (expanded row body) ────────────── */
interface PipelineRunDetailsProps {
  outcome: OutcomeRecord;
  data: SocData;
}

const PipelineRunDetails: React.FC<PipelineRunDetailsProps> = ({ outcome, data }) => {
  const agents = (outcome.agents_involved ?? '')
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);
  const sourceWorkflow = pipelineRunSource(outcome.correlation_id);
  const relatedTriage = useMemo(
    () => itemsInWindow(data.triageClassifications, outcome['@timestamp'], 5),
    [data.triageClassifications, outcome]
  );
  const relatedActions = useMemo(
    () => itemsInWindow(data.responseActions, outcome['@timestamp'], 5),
    [data.responseActions, outcome]
  );
  const relatedAudit = useMemo(
    () => itemsInWindow(data.auditTrail, outcome['@timestamp'], 10),
    [data.auditTrail, outcome]
  );
  const relatedReasoning = useMemo(
    () => reasoningStepsForRun(data.reasoningTraces, outcome, 200),
    [data.reasoningTraces, outcome]
  );
  const reasoningSummaries = useMemo(
    () => relatedReasoning.filter((s) => s.step_type === 'run_summary'),
    [relatedReasoning]
  );
  const reasoningSteps = useMemo(
    () => relatedReasoning.filter((s) => s.step_type !== 'run_summary'),
    [relatedReasoning]
  );
  const [rawJson] = useMemo(() => prettyPrintJson(outcome), [outcome]);

  const metaItems = [
    {
      title: i18n.translate('xpack.securitySolution.autonomousSoc.runDetail.timestamp', {
        defaultMessage: 'Timestamp (ISO)',
      }),
      description: (
        <EuiText size="xs">
          <code>{outcome['@timestamp'] ?? '-'}</code>
        </EuiText>
      ),
    },
    {
      title: i18n.translate('xpack.securitySolution.autonomousSoc.runDetail.correlation', {
        defaultMessage: 'Correlation ID',
      }),
      description: (
        <EuiText size="xs">
          <code>{outcome.correlation_id ?? '-'}</code>
        </EuiText>
      ),
    },
    {
      title: i18n.translate('xpack.securitySolution.autonomousSoc.runDetail.source', {
        defaultMessage: 'Source workflow',
      }),
      description: <EuiBadge color="hollow">{sourceWorkflow}</EuiBadge>,
    },
    {
      title: i18n.translate('xpack.securitySolution.autonomousSoc.runDetail.disposition', {
        defaultMessage: 'Disposition',
      }),
      description: <EuiBadge color="hollow">{outcome.disposition ?? '-'}</EuiBadge>,
    },
    {
      title: i18n.translate('xpack.securitySolution.autonomousSoc.runDetail.complete', {
        defaultMessage: 'Pipeline complete',
      }),
      description: (
        <EuiHealth color={outcome.pipeline_complete ? 'success' : 'warning'}>
          {outcome.pipeline_complete
            ? i18n.translate('xpack.securitySolution.autonomousSoc.runDetail.yes', {
                defaultMessage: 'Yes',
              })
            : i18n.translate('xpack.securitySolution.autonomousSoc.runDetail.no', {
                defaultMessage: 'No',
              })}
        </EuiHealth>
      ),
    },
    {
      title: i18n.translate('xpack.securitySolution.autonomousSoc.runDetail.agents', {
        defaultMessage: 'Agents involved',
      }),
      description:
        agents.length > 0 ? (
          <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
            {agents.map((a) => (
              <EuiFlexItem key={a} grow={false}>
                <EuiBadge color="hollow">{a}</EuiBadge>
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>
        ) : (
          <EuiText size="xs" color="subdued">
            {'-'}
          </EuiText>
        ),
    },
  ];

  const windowLabel = i18n.translate('xpack.securitySolution.autonomousSoc.runDetail.windowLabel', {
    defaultMessage: '±2 min',
  });

  return (
    <EuiPanel color="subdued" hasBorder={false} paddingSize="m">
      <EuiDescriptionList type="column" compressed listItems={metaItems} />
      <EuiSpacer size="m" />

      <EuiTitle size="xxs">
        <h5>
          {i18n.translate('xpack.securitySolution.autonomousSoc.runDetail.triageHeader', {
            defaultMessage: 'Triage activity ({window})',
            values: { window: windowLabel },
          })}
        </h5>
      </EuiTitle>
      <EuiSpacer size="xs" />
      {relatedTriage.length > 0 ? (
        <EuiBasicTable<TriageClassification>
          compressed
          items={relatedTriage}
          columns={[
            {
              field: '@timestamp',
              name: i18n.translate('xpack.securitySolution.autonomousSoc.runDetail.col.timestamp', {
                defaultMessage: 'Timestamp',
              }),
              render: (t: string) => formatTimestamp(t),
              width: '170px',
            },
            {
              field: 'classification',
              name: i18n.translate(
                'xpack.securitySolution.autonomousSoc.runDetail.col.classification',
                { defaultMessage: 'Classification' }
              ),
              render: (c: string) => <EuiBadge color={classificationColor(c)}>{c ?? '-'}</EuiBadge>,
              width: '150px',
            },
            {
              field: 'alert_id',
              name: i18n.translate('xpack.securitySolution.autonomousSoc.runDetail.col.alertId', {
                defaultMessage: 'Alert ID',
              }),
              render: (id: string) => <EuiText size="xs">{id ?? '-'}</EuiText>,
            },
            {
              field: 'confidence',
              name: i18n.translate(
                'xpack.securitySolution.autonomousSoc.runDetail.col.confidence',
                { defaultMessage: 'Conf.' }
              ),
              render: (conf: number | undefined) => (
                <EuiText size="xs">{conf != null ? `${conf}` : '-'}</EuiText>
              ),
              width: '70px',
            },
          ]}
        />
      ) : (
        <EuiText size="xs" color="subdued">
          {i18n.translate('xpack.securitySolution.autonomousSoc.runDetail.noTriage', {
            defaultMessage: 'No triage records in this window.',
          })}
        </EuiText>
      )}

      <EuiSpacer size="m" />
      <EuiTitle size="xxs">
        <h5>
          {i18n.translate('xpack.securitySolution.autonomousSoc.runDetail.actionsHeader', {
            defaultMessage: 'Response actions ({window})',
            values: { window: windowLabel },
          })}
        </h5>
      </EuiTitle>
      <EuiSpacer size="xs" />
      {relatedActions.length > 0 ? (
        <EuiBasicTable<ResponseAction>
          compressed
          items={relatedActions}
          columns={[
            {
              field: '@timestamp',
              name: i18n.translate('xpack.securitySolution.autonomousSoc.runDetail.col.timestamp', {
                defaultMessage: 'Timestamp',
              }),
              render: (t: string) => formatTimestamp(t),
              width: '170px',
            },
            {
              field: 'stage',
              name: i18n.translate('xpack.securitySolution.autonomousSoc.runDetail.col.stage', {
                defaultMessage: 'Stage',
              }),
              width: '140px',
            },
            {
              field: 'action_type',
              name: i18n.translate('xpack.securitySolution.autonomousSoc.runDetail.col.action', {
                defaultMessage: 'Action',
              }),
              render: (a: string) => <EuiBadge color="hollow">{a ?? '-'}</EuiBadge>,
              width: '150px',
            },
            {
              field: 'status',
              name: i18n.translate('xpack.securitySolution.autonomousSoc.runDetail.col.status', {
                defaultMessage: 'Status',
              }),
              render: (s: string) => <EuiHealth color={statusHealth(s)}>{s ?? '-'}</EuiHealth>,
            },
          ]}
        />
      ) : (
        <EuiText size="xs" color="subdued">
          {i18n.translate('xpack.securitySolution.autonomousSoc.runDetail.noActions', {
            defaultMessage: 'No response actions in this window.',
          })}
        </EuiText>
      )}

      <EuiSpacer size="m" />
      <EuiTitle size="xxs">
        <h5>
          {i18n.translate('xpack.securitySolution.autonomousSoc.runDetail.auditHeader', {
            defaultMessage: 'Audit trail ({window})',
            values: { window: windowLabel },
          })}
        </h5>
      </EuiTitle>
      <EuiSpacer size="xs" />
      {relatedAudit.length > 0 ? (
        <EuiBasicTable<AuditEntry>
          compressed
          items={relatedAudit}
          columns={[
            {
              field: '@timestamp',
              name: i18n.translate('xpack.securitySolution.autonomousSoc.runDetail.col.timestamp', {
                defaultMessage: 'Timestamp',
              }),
              render: (t: string) => formatTimestamp(t),
              width: '170px',
            },
            {
              field: 'event_type',
              name: i18n.translate('xpack.securitySolution.autonomousSoc.runDetail.col.event', {
                defaultMessage: 'Event',
              }),
              render: (e: string) => <EuiBadge color="hollow">{e ?? '-'}</EuiBadge>,
              width: '170px',
            },
            {
              field: 'source',
              name: i18n.translate('xpack.securitySolution.autonomousSoc.runDetail.col.source', {
                defaultMessage: 'Source',
              }),
              width: '170px',
            },
            {
              field: 'details',
              name: i18n.translate('xpack.securitySolution.autonomousSoc.runDetail.col.details', {
                defaultMessage: 'Details',
              }),
              render: (d: string) => <DetailsCell value={d} />,
            },
          ]}
        />
      ) : (
        <EuiText size="xs" color="subdued">
          {i18n.translate('xpack.securitySolution.autonomousSoc.runDetail.noAudit', {
            defaultMessage: 'No audit entries in this window.',
          })}
        </EuiText>
      )}

      <EuiSpacer size="m" />
      <EuiTitle size="xxs">
        <h5>
          {i18n.translate('xpack.securitySolution.autonomousSoc.runDetail.reasoningHeader', {
            defaultMessage: 'Reasoning trace',
          })}
        </h5>
      </EuiTitle>
      <EuiSpacer size="xs" />
      {reasoningSummaries.length > 0 && (
        <>
          <EuiBasicTable<ReasoningTraceStep>
            compressed
            items={reasoningSummaries}
            columns={[
              {
                field: 'agent_id',
                name: i18n.translate(
                  'xpack.securitySolution.autonomousSoc.runDetail.col.reasoningAgent',
                  { defaultMessage: 'Agent' }
                ),
                render: (a: string) => <EuiBadge color="hollow">{a ?? '-'}</EuiBadge>,
                width: '200px',
              },
              {
                field: 'final_status',
                name: i18n.translate(
                  'xpack.securitySolution.autonomousSoc.runDetail.col.reasoningStatus',
                  { defaultMessage: 'Status' }
                ),
                render: (s: ReasoningTraceStep['final_status']) => (
                  <EuiBadge color={s ? FINAL_STATUS_COLOR[s] : 'default'}>
                    {s ?? 'unknown'}
                  </EuiBadge>
                ),
                width: '110px',
              },
              {
                field: 'total_steps',
                name: i18n.translate(
                  'xpack.securitySolution.autonomousSoc.runDetail.col.reasoningSteps',
                  { defaultMessage: 'Steps' }
                ),
                render: (n: number | undefined) => <EuiText size="xs">{n ?? '-'}</EuiText>,
                width: '80px',
              },
              {
                field: 'tool_call_count',
                name: i18n.translate(
                  'xpack.securitySolution.autonomousSoc.runDetail.col.reasoningTools',
                  { defaultMessage: 'Tool calls' }
                ),
                render: (n: number | undefined) => <EuiText size="xs">{n ?? '-'}</EuiText>,
                width: '100px',
              },
              {
                field: 'total_duration_ms',
                name: i18n.translate(
                  'xpack.securitySolution.autonomousSoc.runDetail.col.reasoningDuration',
                  { defaultMessage: 'Duration' }
                ),
                render: (n: number | undefined) => (
                  <EuiText size="xs">{formatDurationMs(n)}</EuiText>
                ),
                width: '110px',
              },
              {
                field: 'run_id',
                name: i18n.translate(
                  'xpack.securitySolution.autonomousSoc.runDetail.col.reasoningRun',
                  { defaultMessage: 'Run ID' }
                ),
                render: (id: string) => (
                  <EuiText size="xs">
                    <code>{id ?? '-'}</code>
                  </EuiText>
                ),
              },
            ]}
          />
          <EuiSpacer size="xs" />
        </>
      )}
      {reasoningSteps.length > 0 ? (
        <EuiBasicTable<ReasoningTraceStep>
          compressed
          items={reasoningSteps.slice(0, 50)}
          columns={[
            {
              field: '@timestamp',
              name: i18n.translate('xpack.securitySolution.autonomousSoc.runDetail.col.timestamp', {
                defaultMessage: 'Timestamp',
              }),
              render: (t: string) => formatTimestamp(t),
              width: '170px',
            },
            {
              field: 'step_index',
              name: i18n.translate(
                'xpack.securitySolution.autonomousSoc.runDetail.col.reasoningStepIdx',
                { defaultMessage: '#' }
              ),
              render: (n: number) => <EuiText size="xs">{n}</EuiText>,
              width: '40px',
            },
            {
              field: 'agent_id',
              name: i18n.translate(
                'xpack.securitySolution.autonomousSoc.runDetail.col.reasoningAgent',
                { defaultMessage: 'Agent' }
              ),
              render: (a: string) => <EuiBadge color="hollow">{a ?? '-'}</EuiBadge>,
              width: '200px',
            },
            {
              field: 'step_type',
              name: i18n.translate(
                'xpack.securitySolution.autonomousSoc.runDetail.col.reasoningStepType',
                { defaultMessage: 'Type' }
              ),
              render: (t: ReasoningTraceStep['step_type']) => (
                <EuiBadge color={STEP_TYPE_COLOR[t] ?? 'hollow'}>{t}</EuiBadge>
              ),
              width: '120px',
            },
            {
              name: i18n.translate(
                'xpack.securitySolution.autonomousSoc.runDetail.col.reasoningDetail',
                { defaultMessage: 'Detail' }
              ),
              render: (step: ReasoningTraceStep) => <ReasoningStepDetail step={step} />,
            },
          ]}
        />
      ) : (
        reasoningSummaries.length === 0 && (
          <EuiText size="xs" color="subdued">
            {i18n.translate('xpack.securitySolution.autonomousSoc.runDetail.noReasoning', {
              defaultMessage:
                'No reasoning trace captured for this run. Agents may not be emitting soc-reasoning-trace docs yet.',
            })}
          </EuiText>
        )
      )}

      <EuiSpacer size="m" />
      <EuiTitle size="xxs">
        <h5>
          {i18n.translate('xpack.securitySolution.autonomousSoc.runDetail.rawHeader', {
            defaultMessage: 'Raw outcome document',
          })}
        </h5>
      </EuiTitle>
      <EuiSpacer size="xs" />
      <EuiCodeBlock language="json" fontSize="s" paddingSize="s" isCopyable overflowHeight={220}>
        {rawJson}
      </EuiCodeBlock>
    </EuiPanel>
  );
};

/* ── Reasoning step detail cell ──────────────────────────── */
const ReasoningStepDetail: React.FC<{ step: ReasoningTraceStep }> = ({ step }) => {
  const { step_type: stepType, tool_name: toolName, content, tool_args: toolArgs } = step;
  if (stepType === 'tool_call') {
    const args = toolArgs ? JSON.stringify(toolArgs, null, 2).slice(0, 600) : '';
    return (
      <EuiText size="xs">
        <code>{toolName ?? 'unknown_tool'}</code>
        {args ? (
          <EuiCodeBlock
            language="json"
            fontSize="s"
            paddingSize="none"
            overflowHeight={120}
            transparentBackground
          >
            {args}
          </EuiCodeBlock>
        ) : null}
      </EuiText>
    );
  }
  if (stepType === 'tool_result') {
    return (
      <EuiText size="xs" color="subdued">
        {content ?? step.tool_result_ref ?? '-'}
      </EuiText>
    );
  }
  return (
    <EuiText size="xs" style={{ whiteSpace: 'pre-wrap' }}>
      {content ?? '-'}
    </EuiText>
  );
};

/* ── Pipeline Agents Panel with expandable rows ──────────── */
interface PipelineAgentsPanelProps {
  data: SocData;
}

const PipelineAgentsPanel: React.FC<PipelineAgentsPanelProps> = ({ data }) => {
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

  const toggleRow = useCallback((idx: number) => {
    setExpandedRows((prev) => {
      const next = { ...prev };
      if (next[idx]) {
        delete next[idx];
      } else {
        next[idx] = true;
      }
      return next;
    });
  }, []);

  const items = useMemo(
    () => data.outcomes.slice(0, 20).map((o, idx) => ({ ...o, _idx: idx })),
    [data.outcomes]
  );

  const itemIdToExpandedRowMap = useMemo(() => {
    const map: Record<number, React.ReactNode> = {};
    for (const idx of Object.keys(expandedRows)) {
      const numIdx = Number(idx);
      const outcome = items[numIdx];
      if (outcome) {
        map[numIdx] = <PipelineRunDetails outcome={outcome} data={data} />;
      }
    }
    return map;
  }, [expandedRows, items, data]);

  return (
    <EuiPanel hasShadow={false} hasBorder>
      <EuiTitle size="xs">
        <h3>
          {i18n.translate('xpack.securitySolution.autonomousSoc.agentHealth.detailTitle', {
            defaultMessage: 'Pipeline Agents',
          })}
        </h3>
      </EuiTitle>
      <EuiText size="xs" color="subdued">
        {i18n.translate('xpack.securitySolution.autonomousSoc.agentHealth.detailDescV2', {
          defaultMessage:
            'Agents involved in completed outcome pipelines. Expand a row to see the correlation ID, originating workflow, and related triage / response / audit activity recorded in the same window.',
        })}
      </EuiText>
      <EuiHorizontalRule margin="s" />
      <EuiBasicTable<OutcomeRecord & { _idx: number }>
        items={items}
        itemId="_idx"
        itemIdToExpandedRowMap={itemIdToExpandedRowMap}
        noItemsMessage={i18n.translate('xpack.securitySolution.autonomousSoc.agentHealth.noItems', {
          defaultMessage: 'No pipeline completions recorded yet.',
        })}
        columns={[
          {
            width: '40px',
            isExpander: true,
            render: (item: OutcomeRecord & { _idx: number }) => (
              <EuiButtonIcon
                onClick={() => toggleRow(item._idx)}
                aria-label={
                  expandedRows[item._idx]
                    ? i18n.translate('xpack.securitySolution.autonomousSoc.agentHealth.collapse', {
                        defaultMessage: 'Collapse',
                      })
                    : i18n.translate('xpack.securitySolution.autonomousSoc.agentHealth.expand', {
                        defaultMessage: 'Expand',
                      })
                }
                iconType={expandedRows[item._idx] ? 'arrowDown' : 'arrowRight'}
              />
            ),
          },
          {
            field: '@timestamp',
            name: i18n.translate('xpack.securitySolution.autonomousSoc.column.timestamp', {
              defaultMessage: 'Timestamp',
            }),
            render: (ts: string) => formatTimestamp(ts),
            width: '170px',
          },
          {
            field: 'disposition',
            name: i18n.translate('xpack.securitySolution.autonomousSoc.column.disposition', {
              defaultMessage: 'Disposition',
            }),
            render: (d: string) => <EuiBadge color="hollow">{d ?? '-'}</EuiBadge>,
            width: '130px',
          },
          {
            field: 'correlation_id',
            name: i18n.translate('xpack.securitySolution.autonomousSoc.column.source', {
              defaultMessage: 'Source',
            }),
            render: (cid: string) => <EuiBadge color="hollow">{pipelineRunSource(cid)}</EuiBadge>,
            width: '170px',
          },
          {
            field: 'agents_involved',
            name: i18n.translate('xpack.securitySolution.autonomousSoc.column.agents', {
              defaultMessage: 'Agents Involved',
            }),
            render: (agents: string) =>
              agents ? (
                <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
                  {agents.split(',').map((a) => (
                    <EuiFlexItem key={a} grow={false}>
                      <EuiBadge color="hollow">{a.trim()}</EuiBadge>
                    </EuiFlexItem>
                  ))}
                </EuiFlexGroup>
              ) : (
                <EuiText size="xs">{'-'}</EuiText>
              ),
          },
          {
            field: 'pipeline_complete',
            name: i18n.translate('xpack.securitySolution.autonomousSoc.column.complete', {
              defaultMessage: 'Complete',
            }),
            render: (c: boolean) => (
              <EuiHealth color={c ? 'success' : 'warning'}>
                {c
                  ? i18n.translate('xpack.securitySolution.autonomousSoc.yes', {
                      defaultMessage: 'Yes',
                    })
                  : i18n.translate('xpack.securitySolution.autonomousSoc.no', {
                      defaultMessage: 'No',
                    })}
              </EuiHealth>
            ),
            width: '100px',
          },
        ]}
      />
    </EuiPanel>
  );
};

const AutonomousSocDashboardComponent: React.FC = () => {
  const { euiTheme } = useEuiTheme();
  const { http } = useKibana().services;
  const basePath = http?.basePath?.get() ?? '';
  const {
    data,
    loading,
    error,
    lastUpdated,
    approveAndApplySubItem,
    rejectSubItem,
    revokeSubItem,
    createEnableRuleAndApprove,
    deleteRuleAndReject,
  } = useSocData();
  const [activeTab, setActiveTab] = React.useState<TabId>('overview');

  const tabs: Array<{ id: TabId; name: string; icon: string; badge?: number }> = useMemo(
    () => [
      {
        id: 'overview',
        name: i18n.translate('xpack.securitySolution.autonomousSoc.tab.overview', {
          defaultMessage: 'Overview',
        }),
        icon: 'visBarVerticalStacked',
      },
      {
        id: 'recommendations',
        name: i18n.translate('xpack.securitySolution.autonomousSoc.tab.recommendations', {
          defaultMessage: 'Recommendations',
        }),
        icon: 'listAdd',
        badge: data.recommendationCounts.pending,
      },
      {
        id: 'triage',
        name: i18n.translate('xpack.securitySolution.autonomousSoc.tab.triage', {
          defaultMessage: 'Triage Results',
        }),
        icon: 'securitySignal',
      },
      {
        id: 'actions',
        name: i18n.translate('xpack.securitySolution.autonomousSoc.tab.actions', {
          defaultMessage: 'Response Actions',
        }),
        icon: 'crosshairs',
      },
      {
        id: 'coverage',
        name: i18n.translate('xpack.securitySolution.autonomousSoc.tab.coverage', {
          defaultMessage: 'MITRE Coverage & Rule Tuning',
        }),
        icon: 'inspect',
      },
      {
        id: 'evolution',
        name: i18n.translate('xpack.securitySolution.autonomousSoc.tab.evolution', {
          defaultMessage: 'Evolution Log',
        }),
        icon: 'timeline',
      },
      {
        id: 'agents',
        name: i18n.translate('xpack.securitySolution.autonomousSoc.tab.agents', {
          defaultMessage: 'Agent Health',
        }),
        icon: 'heartbeat',
      },
      {
        id: 'system_health',
        name: i18n.translate('xpack.securitySolution.autonomousSoc.tab.systemHealth', {
          defaultMessage: 'System Health',
        }),
        icon: 'monitoringApp',
      },
      {
        id: 'audit',
        name: i18n.translate('xpack.securitySolution.autonomousSoc.tab.audit', {
          defaultMessage: 'Audit Trail',
        }),
        icon: 'document',
      },
    ],
    [data.recommendationCounts.pending]
  );

  const headerCss = useMemo(
    () => css`
      background: linear-gradient(
        135deg,
        ${euiTheme.colors.primaryText}08 0%,
        ${euiTheme.colors.backgroundBasePlain} 100%
      );
      border-bottom: 2px solid ${euiTheme.colors.primary};
      padding: ${euiTheme.size.l} ${euiTheme.size.xl};
    `,
    [euiTheme]
  );

  if (loading) {
    return (
      <SecuritySolutionPageWrapper>
        <EuiFlexGroup justifyContent="center" alignItems="center" style={{ minHeight: 400 }}>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup direction="column" alignItems="center" gutterSize="m">
              <EuiFlexItem>
                <EuiLoadingSpinner size="xl" />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiText size="s" color="subdued">
                  {i18n.translate('xpack.securitySolution.autonomousSoc.loading', {
                    defaultMessage: 'Loading Autonomous SOC telemetry...',
                  })}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </SecuritySolutionPageWrapper>
    );
  }

  const errorBanner = error ? (
    <>
      <EuiCallOut
        title={i18n.translate('xpack.securitySolution.autonomousSoc.fetchError', {
          defaultMessage: 'Data fetch error',
        })}
        color="danger"
        iconType="warning"
      >
        <p>{error}</p>
      </EuiCallOut>
      <EuiSpacer size="m" />
    </>
  ) : null;

  /* ── Overview Tab ──────────────────────────────────────────────── */
  const overviewContent = (
    <>
      <KPIHeroRow data={data} />
      <EuiSpacer size="l" />
      <EuiFlexGroup gutterSize="l">
        <EuiFlexItem grow={2}>
          <ActivitySparkline
            data={data.timelineData}
            color={euiTheme.colors.primary}
            title={i18n.translate('xpack.securitySolution.autonomousSoc.overview.triageVolume', {
              defaultMessage: 'Alert Triage Volume (hourly)',
            })}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={2}>
          <ActivitySparkline
            data={data.outcomeTimeline}
            color={euiTheme.colors.success}
            title={i18n.translate('xpack.securitySolution.autonomousSoc.overview.outcomes', {
              defaultMessage: 'Completed Outcomes (hourly)',
            })}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="l" />
      <EuiFlexGroup gutterSize="l">
        <EuiFlexItem grow={2}>
          <EuiPanel hasShadow={false} hasBorder>
            <EuiTitle size="xs">
              <h3>
                {i18n.translate('xpack.securitySolution.autonomousSoc.overview.classifications', {
                  defaultMessage: 'Classification Breakdown',
                })}
              </h3>
            </EuiTitle>
            <EuiSpacer size="s" />
            {data.classificationBreakdown.length > 0 ? (
              <>
                {data.classificationBreakdown.map((b) => {
                  const pct =
                    data.kpis.totalClassifications > 0
                      ? Math.round((b.doc_count / data.kpis.totalClassifications) * 100)
                      : 0;
                  return (
                    <div
                      key={b.key}
                      css={css`
                        margin-bottom: ${euiTheme.size.xs};
                      `}
                    >
                      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                        <EuiFlexItem
                          grow={false}
                          css={css`
                            min-width: 160px;
                          `}
                        >
                          <EuiBadge color={classificationColor(b.key)}>{b.key}</EuiBadge>
                        </EuiFlexItem>
                        <EuiFlexItem>
                          <EuiProgress
                            value={pct}
                            max={100}
                            size="s"
                            color={classificationColor(b.key)}
                          />
                        </EuiFlexItem>
                        <EuiFlexItem
                          grow={false}
                          css={css`
                            min-width: 60px;
                            text-align: right;
                          `}
                        >
                          <EuiText size="xs">{`${b.doc_count} (${pct}%)`}</EuiText>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </div>
                  );
                })}
              </>
            ) : (
              <EuiText size="s" color="subdued">
                {i18n.translate('xpack.securitySolution.autonomousSoc.overview.noTriageData', {
                  defaultMessage:
                    'No triage data yet. Start the SOC simulation to generate alerts.',
                })}
              </EuiText>
            )}
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem grow={1}>
          <MitreTechniquePanel techniques={data.techniqueBreakdown} />
        </EuiFlexItem>
        <EuiFlexItem grow={1}>
          <PipelineStatusGrid kpis={data.kpis} outcomeDispositions={data.outcomeDispositions} />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="l" />
      <EuiFlexGroup gutterSize="l">
        <EuiFlexItem grow={1}>
          <EuiPanel hasShadow={false} hasBorder>
            <EuiTitle size="xs">
              <h3>
                {i18n.translate('xpack.securitySolution.autonomousSoc.overview.agentWorkload', {
                  defaultMessage: 'Agent Workload',
                })}
              </h3>
            </EuiTitle>
            <EuiText size="xs" color="subdued">
              {i18n.translate('xpack.securitySolution.autonomousSoc.overview.agentWorkloadDesc', {
                defaultMessage: 'Alerts processed per source workflow',
              })}
            </EuiText>
            <EuiSpacer size="s" />
            {data.agentWorkload.length > 0 ? (
              (() => {
                const maxWorkload = Math.max(...data.agentWorkload.map((w) => w.doc_count), 1);
                return data.agentWorkload.map((a) => (
                  <div
                    key={a.key}
                    css={css`
                      margin-bottom: ${euiTheme.size.xs};
                    `}
                  >
                    <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                      <EuiFlexItem
                        grow={false}
                        css={css`
                          min-width: 180px;
                        `}
                      >
                        <EuiText size="xs">{a.key}</EuiText>
                      </EuiFlexItem>
                      <EuiFlexItem>
                        <EuiProgress
                          value={a.doc_count}
                          max={maxWorkload}
                          size="s"
                          color="primary"
                        />
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiText size="xs">{a.doc_count}</EuiText>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </div>
                ));
              })()
            ) : (
              <EuiText size="s" color="subdued">
                {i18n.translate('xpack.securitySolution.autonomousSoc.overview.noWorkload', {
                  defaultMessage: 'No workload data yet',
                })}
              </EuiText>
            )}
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="l" />
      <EuiFlexGroup gutterSize="l" wrap>
        <EuiFlexItem grow={1} style={{ minWidth: 200 }}>
          <EuiPanel hasShadow={false} hasBorder paddingSize="m">
            <EuiStat
              title={data.counts.responseActions}
              description={i18n.translate(
                'xpack.securitySolution.autonomousSoc.stat.responseActions',
                { defaultMessage: 'Response Actions' }
              )}
              titleColor="accent"
              titleSize="s"
            />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem grow={1} style={{ minWidth: 200 }}>
          <EuiPanel hasShadow={false} hasBorder paddingSize="m">
            <EuiStat
              title={data.counts.investigations}
              description={i18n.translate(
                'xpack.securitySolution.autonomousSoc.stat.investigations',
                { defaultMessage: 'Investigations' }
              )}
              titleColor="warning"
              titleSize="s"
            />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem grow={1} style={{ minWidth: 200 }}>
          <EuiPanel hasShadow={false} hasBorder paddingSize="m">
            <EuiStat
              title={data.counts.evolution}
              description={i18n.translate('xpack.securitySolution.autonomousSoc.stat.evolution', {
                defaultMessage: 'Evolution Events',
              })}
              titleColor="primary"
              titleSize="s"
            />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem grow={1} style={{ minWidth: 200 }}>
          <EuiPanel hasShadow={false} hasBorder paddingSize="m">
            <EuiStat
              title={data.counts.audit}
              description={i18n.translate('xpack.securitySolution.autonomousSoc.stat.audit', {
                defaultMessage: 'Audit Entries',
              })}
              titleSize="s"
            />
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  );

  /* ── Triage Tab ────────────────────────────────────────────────── */
  const triageContent = (
    <EuiPanel hasShadow={false} hasBorder>
      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h3>
              {i18n.translate('xpack.securitySolution.autonomousSoc.triage.title', {
                defaultMessage: 'Latest Triage Results',
              })}
            </h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            {i18n.translate('xpack.securitySolution.autonomousSoc.triage.showing', {
              defaultMessage: 'Showing {shown} classifications from {total} triage batches',
              values: { shown: data.triageClassifications.length, total: data.counts.triageDocs },
            })}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiHorizontalRule margin="s" />
      <EuiBasicTable<TriageClassification>
        items={data.triageClassifications}
        noItemsMessage={i18n.translate('xpack.securitySolution.autonomousSoc.triage.noItems', {
          defaultMessage: 'No triage results yet. Start the SOC simulation to generate alerts.',
        })}
        columns={[
          {
            field: '@timestamp',
            name: i18n.translate('xpack.securitySolution.autonomousSoc.column.timestamp', {
              defaultMessage: 'Timestamp',
            }),
            render: (ts: string, item: TriageClassification) =>
              item.alert_id ? (
                <EuiLink
                  href={`${basePath}/app/security/alerts?query=(language:kuery,query:'_id: "${item.alert_id}"')&timerange=(global:(linkTo:!(),timerange:(from:now-24h,to:now)))`}
                  target="_blank"
                >
                  {formatTimestamp(ts)}
                </EuiLink>
              ) : (
                formatTimestamp(ts)
              ),
            width: '170px',
            sortable: true,
          },
          {
            field: 'classification',
            name: i18n.translate('xpack.securitySolution.autonomousSoc.column.classification', {
              defaultMessage: 'Classification',
            }),
            render: (c: string) => (
              <EuiBadge color={classificationColor(c)}>{c ?? 'unknown'}</EuiBadge>
            ),
            width: '140px',
          },
          {
            field: 'confidence',
            name: i18n.translate('xpack.securitySolution.autonomousSoc.column.confidence', {
              defaultMessage: 'Confidence',
            }),
            render: (c: unknown) => {
              // Normalize: agents occasionally ship confidence as a 0–1 float
              // or a stringified number. Treat anything unparseable as "n/a".
              const n = typeof c === 'number' ? c : typeof c === 'string' ? Number(c) : NaN;
              if (!Number.isFinite(n)) {
                return (
                  <EuiText size="xs" color="subdued">
                    {i18n.translate('xpack.securitySolution.autonomousSoc.triage.confidenceNa', {
                      defaultMessage: 'n/a',
                    })}
                  </EuiText>
                );
              }
              const pct = n <= 1 ? Math.round(n * 100) : Math.round(n);
              const bounded = Math.max(0, Math.min(100, pct));
              return (
                <EuiToolTip content={`${bounded}% confidence`}>
                  <EuiProgress value={bounded} max={100} size="s" color="primary" />
                </EuiToolTip>
              );
            },
            width: '120px',
          },
          {
            field: 'mitre_techniques',
            name: i18n.translate('xpack.securitySolution.autonomousSoc.column.techniques', {
              defaultMessage: 'MITRE Techniques',
            }),
            render: (techniques: string[]) =>
              techniques?.length > 0 ? (
                <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
                  {techniques.map((t) => (
                    <EuiFlexItem key={t} grow={false}>
                      <EuiBadge color="hollow">{t}</EuiBadge>
                    </EuiFlexItem>
                  ))}
                </EuiFlexGroup>
              ) : (
                '-'
              ),
            width: '180px',
          },
          {
            field: 'disposition',
            name: i18n.translate('xpack.securitySolution.autonomousSoc.column.disposition', {
              defaultMessage: 'Disposition',
            }),
            // Derive from classification when the agent omits the richer
            // disposition so this column isn't a sea of dashes.
            render: (d: string | undefined, item: TriageClassification) => {
              const derived = d ?? dispositionFromClassification(item.classification);
              if (!derived) {
                return (
                  <EuiText size="xs" color="subdued">
                    {i18n.translate('xpack.securitySolution.autonomousSoc.triage.unknown', {
                      defaultMessage: 'unknown',
                    })}
                  </EuiText>
                );
              }
              const dispositionColors: Record<string, string> = {
                TRUE_POSITIVE: 'danger',
                BENIGN_TRUE_POSITIVE: 'warning',
                FALSE_POSITIVE: 'default',
                POLICY_VIOLATION: 'accent',
                INCONCLUSIVE: 'hollow',
                DUPLICATE: 'subdued',
              };
              const upper = derived.toUpperCase();
              return (
                <EuiToolTip
                  content={
                    d
                      ? i18n.translate(
                          'xpack.securitySolution.autonomousSoc.triage.dispositionReported',
                          { defaultMessage: 'Reported by agent' }
                        )
                      : i18n.translate(
                          'xpack.securitySolution.autonomousSoc.triage.dispositionDerived',
                          { defaultMessage: 'Derived from classification' }
                        )
                  }
                >
                  <EuiBadge color={dispositionColors[upper] ?? 'hollow'}>
                    {derived.replace(/_/g, ' ')}
                  </EuiBadge>
                </EuiToolTip>
              );
            },
            width: '150px',
          },
          {
            field: 'kill_chain_stage',
            name: i18n.translate('xpack.securitySolution.autonomousSoc.column.killChain', {
              defaultMessage: 'Kill Chain',
            }),
            // Surface "unknown" as a visible badge rather than a dash so
            // operators can distinguish "agent said unknown" from "no data".
            render: (stage: string | undefined) => {
              if (!stage) {
                return (
                  <EuiText size="xs" color="subdued">
                    {'–'}
                  </EuiText>
                );
              }
              if (stage === 'unknown' || stage === 'n/a') {
                return <EuiBadge color="hollow">{stage}</EuiBadge>;
              }
              const stageColors: Record<string, string> = {
                reconnaissance: '#6DCCB1',
                delivery: '#79AAD9',
                exploitation: '#E6C04E',
                installation: '#F5A623',
                c2: '#EE6352',
                actions_on_objectives: '#D64545',
              };
              return (
                <EuiBadge color={stageColors[stage] ?? 'hollow'}>
                  {stage.replace(/_/g, ' ')}
                </EuiBadge>
              );
            },
            width: '140px',
          },
          {
            field: 'threat_category',
            name: i18n.translate('xpack.securitySolution.autonomousSoc.column.threatType', {
              defaultMessage: 'Threat Type',
            }),
            render: (cat: string | undefined) => {
              if (!cat) {
                return (
                  <EuiText size="xs" color="subdued">
                    {'–'}
                  </EuiText>
                );
              }
              return <EuiBadge color="hollow">{cat.replace(/_/g, ' ')}</EuiBadge>;
            },
            width: '130px',
          },
          {
            field: 'next_step',
            name: i18n.translate('xpack.securitySolution.autonomousSoc.column.nextStep', {
              defaultMessage: 'Action Taken',
            }),
            render: (step: string) => {
              if (!step) return '-';
              const lower = step.toLowerCase();
              let color: string = 'hollow';
              if (
                lower.includes('escalat') ||
                lower.includes('case') ||
                lower.includes('investigat')
              ) {
                color = 'danger';
              } else if (
                lower.includes('close') ||
                lower.includes('dismiss') ||
                lower.includes('false_positive')
              ) {
                color = 'default';
              } else if (
                lower.includes('monitor') ||
                lower.includes('enrich') ||
                lower.includes('watch')
              ) {
                color = 'warning';
              }
              return (
                <EuiToolTip content={step}>
                  <EuiBadge color={color}>{truncateText(step, 30)}</EuiBadge>
                </EuiToolTip>
              );
            },
            width: '150px',
          },
          {
            field: 'reasoning',
            name: i18n.translate('xpack.securitySolution.autonomousSoc.column.reasoning', {
              defaultMessage: 'Reasoning',
            }),
            render: (r: string) => (
              <EuiToolTip content={r ?? '-'}>
                <EuiText size="xs">{truncateText(r, 80)}</EuiText>
              </EuiToolTip>
            ),
          },
        ]}
      />
    </EuiPanel>
  );

  /* ── Response Actions Tab ──────────────────────────────────────── */
  const actionsContent = <ResponseActionsPanel data={data} />;

  /* ── MITRE Coverage & Rule Tuning Tab ──────────────────────────── */
  const coverageContent = (
    <>
      {data.counts.coverageGaps > 0 && (
        <>
          <EuiCallOut
            title={i18n.translate('xpack.securitySolution.autonomousSoc.coverage.gapsDetected', {
              defaultMessage: 'SOC Health Reports Available',
            })}
            color="primary"
            iconType="iInCircle"
          >
            <p>
              {i18n.translate('xpack.securitySolution.autonomousSoc.coverage.gapsDescription', {
                defaultMessage:
                  'The autonomous SOC watchdog has generated {count} health reports with coverage analysis, recommendations, and tuning guidance.',
                values: { count: data.counts.coverageGaps },
              })}
            </p>
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      )}
      <MitreTechniquePanel techniques={data.techniqueBreakdown} />
      <EuiSpacer size="l" />
      <CoverageGapsPanel data={data} />
    </>
  );

  /* ── Evolution Log Tab ─────────────────────────────────────────── */
  const evolutionContent = (
    <EvolutionLogPanel
      data={data}
      actionHandlers={{
        onApproveAndApplySubItem: approveAndApplySubItem,
        onRejectSubItem: rejectSubItem,
        onRevokeSubItem: revokeSubItem,
        onCreateEnableRuleAndApprove: createEnableRuleAndApprove,
        onDeleteRuleAndReject: deleteRuleAndReject,
      }}
      onOpenInRecommendations={() => setActiveTab('recommendations')}
    />
  );

  /* ── Agent Health Tab ──────────────────────────────────────────── */
  const agentHealthContent = (
    <>
      <PipelineStatusGrid kpis={data.kpis} outcomeDispositions={data.outcomeDispositions} />
      <EuiSpacer size="l" />
      <PipelineAgentsPanel data={data} />
    </>
  );

  /* ── Audit Trail Tab ───────────────────────────────────────────── */
  const auditContent = (
    <EuiPanel hasShadow={false} hasBorder>
      <EuiTitle size="xs">
        <h3>
          {i18n.translate('xpack.securitySolution.autonomousSoc.audit.title', {
            defaultMessage: 'Full Audit Trail',
          })}
        </h3>
      </EuiTitle>
      <EuiText size="xs" color="subdued">
        {i18n.translate('xpack.securitySolution.autonomousSoc.audit.description', {
          defaultMessage:
            'Complete log of every action taken by the autonomous SOC — for compliance, forensics, and human oversight. Every AI decision is traceable.',
        })}
      </EuiText>
      <EuiHorizontalRule margin="s" />
      <EuiBasicTable<AuditEntry>
        items={data.auditTrail}
        noItemsMessage={i18n.translate('xpack.securitySolution.autonomousSoc.audit.noItems', {
          defaultMessage:
            'No audit entries yet. Actions will be logged here for compliance and traceability.',
        })}
        columns={[
          {
            field: '@timestamp',
            name: i18n.translate('xpack.securitySolution.autonomousSoc.column.timestamp', {
              defaultMessage: 'Timestamp',
            }),
            render: (ts: string) => formatTimestamp(ts),
            width: '170px',
          },
          {
            field: 'event_type',
            name: i18n.translate('xpack.securitySolution.autonomousSoc.column.eventType', {
              defaultMessage: 'Event Type',
            }),
            width: '160px',
          },
          {
            field: 'source',
            name: i18n.translate('xpack.securitySolution.autonomousSoc.column.source', {
              defaultMessage: 'Source',
            }),
            width: '160px',
          },
          {
            field: 'details',
            name: i18n.translate('xpack.securitySolution.autonomousSoc.column.details', {
              defaultMessage: 'Details',
            }),
            render: (d: string) => <DetailsCell value={d} />,
          },
        ]}
      />
    </EuiPanel>
  );

  /* ── Recommendations Tab ────────────────────────────────────────── */
  const recommendationsContent = (
    <RecommendationsPanel
      data={data}
      onApproveAndApplySubItem={approveAndApplySubItem}
      onRejectSubItem={rejectSubItem}
      onRevokeSubItem={revokeSubItem}
      onCreateEnableRuleAndApprove={createEnableRuleAndApprove}
      onDeleteRuleAndReject={deleteRuleAndReject}
    />
  );

  /* ── System Health Tab ───────────────────────────────────────────── */
  const systemHealthContent = <SystemHealthPanel health={data.systemHealth} />;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return overviewContent;
      case 'recommendations':
        return recommendationsContent;
      case 'triage':
        return triageContent;
      case 'actions':
        return actionsContent;
      case 'coverage':
        return coverageContent;
      case 'evolution':
        return evolutionContent;
      case 'agents':
        return agentHealthContent;
      case 'system_health':
        return systemHealthContent;
      case 'audit':
        return auditContent;
    }
  };

  return (
    <>
      <EuiScreenReaderOnly>
        <h1>{PAGE_TITLE}</h1>
      </EuiScreenReaderOnly>

      <SecuritySolutionPageWrapper>
        <div css={headerCss}>
          <EuiFlexGroup alignItems="center" gutterSize="m">
            <EuiFlexItem grow={false}>
              <EuiIcon type="logoSecurity" size="xl" />
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiTitle size="l">
                <h2>{PAGE_TITLE}</h2>
              </EuiTitle>
              <EuiText size="s" color="subdued">
                {i18n.translate('xpack.securitySolution.autonomousSoc.subtitle', {
                  defaultMessage:
                    'Live operational view of AI-driven triage, investigation, response, detection engineering, and self-improvement across your autonomous SOC agents.',
                })}
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiFlexGroup gutterSize="s" alignItems="center">
                <EuiFlexItem grow={false}>
                  <EuiToolTip
                    content={
                      lastUpdated
                        ? i18n.translate('xpack.securitySolution.autonomousSoc.lastUpdated', {
                            defaultMessage: 'Last updated: {time}',
                            values: { time: lastUpdated.toLocaleTimeString() },
                          })
                        : i18n.translate('xpack.securitySolution.autonomousSoc.waitingForFetch', {
                            defaultMessage: 'Waiting for first fetch...',
                          })
                    }
                  >
                    <EuiBadge color="hollow" iconType="clock">
                      {i18n.translate('xpack.securitySolution.autonomousSoc.autoRefresh', {
                        defaultMessage: 'Auto-refresh: 30s',
                      })}
                    </EuiBadge>
                  </EuiToolTip>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiBadge color="success" iconType="check">
                    {i18n.translate('xpack.securitySolution.autonomousSoc.pipelineActive', {
                      defaultMessage: '{count} outcomes',
                      values: { count: data.counts.outcomes },
                    })}
                  </EuiBadge>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          </EuiFlexGroup>
        </div>

        <EuiSpacer size="m" />

        <EuiTabs>
          {tabs.map((tab) => (
            <EuiTab
              key={tab.id}
              isSelected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              prepend={<EuiIcon type={tab.icon} size="s" />}
              append={
                tab.badge != null && tab.badge > 0 ? (
                  <EuiBadge color="warning">{tab.badge}</EuiBadge>
                ) : undefined
              }
            >
              {tab.name}
            </EuiTab>
          ))}
        </EuiTabs>

        <EuiSpacer size="l" />

        {errorBanner}
        {renderTabContent()}

        <EuiSpacer size="xl" />
      </SecuritySolutionPageWrapper>

      <SpyRoute pageName={SecurityPageName.autonomousSoc} />
    </>
  );
};

export const AutonomousSocDashboard = React.memo(AutonomousSocDashboardComponent);
