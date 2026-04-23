/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import {
  EuiBadge,
  EuiCodeBlock,
  EuiDescriptionList,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiPanel,
  EuiSpacer,
  EuiStat,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

import type { ArgusArtifactDetails } from '@kbn/argus-console-common';

export interface DocumentNarrativeSummaryProps {
  readonly details: ArgusArtifactDetails | undefined;
  readonly dataTestSubj?: string;
}

/**
 * Render the rich textual content of an Argus `.soc-*` document in a
 * human-readable way.
 *
 * Most Argus panels persist their narrative payload as:
 * - `summary` — agent prose, frequently wrapped in a ```json … ``` fence,
 * - `details` — the agent's full structured output passed through `| json`,
 * - `reasoning`, `expected_impact`, `evidence`, `recommended_action` — misc.
 *
 * Dumping `JSON.stringify(raw_document)` into the flyout leaves the operator
 * staring at a wall of escaped `\n` / `\"`. This component auto-detects
 * fenced or inline JSON, lifts the structured parts into a finding / intent
 * table, turns expected-impact numbers into KPI chips, and falls back to
 * pre-wrapped plain text so nothing is ever dropped on the floor.
 */
export const DocumentNarrativeSummary: React.FC<DocumentNarrativeSummaryProps> = ({
  details,
  dataTestSubj = 'argusDocumentNarrativeSummary',
}) => {
  const parsed = useMemo(() => buildSections(details?.raw_document), [details]);

  if (!parsed || parsed.sections.length === 0) {
    return null;
  }

  return (
    <div data-test-subj={dataTestSubj}>
      {parsed.topBadges.length > 0 ? (
        <>
          <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
            {parsed.topBadges.map((badge) => (
              <EuiFlexItem grow={false} key={`${badge.label}-${badge.value}`}>
                <EuiBadge color={badge.color ?? 'hollow'}>
                  {badge.label ? `${badge.label}: ${badge.value}` : badge.value}
                </EuiBadge>
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>
          <EuiSpacer size="s" />
        </>
      ) : null}
      {parsed.sections.map((section, idx) => (
        <React.Fragment key={`${section.heading}-${idx}`}>
          {section.heading ? (
            <>
              <EuiTitle size="xxs">
                <h4>{section.heading}</h4>
              </EuiTitle>
              <EuiSpacer size="xs" />
            </>
          ) : null}
          {section.content}
          <EuiSpacer size="m" />
        </React.Fragment>
      ))}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Internals
// ────────────────────────────────────────────────────────────────────────────

interface BadgeDescriptor {
  readonly label?: string;
  readonly value: string;
  readonly color?: string;
}

interface Section {
  readonly heading?: string;
  readonly content: React.ReactNode;
}

interface ParsedSummary {
  readonly topBadges: readonly BadgeDescriptor[];
  readonly sections: readonly Section[];
}

const TOP_BADGE_FIELDS: ReadonlyArray<{
  readonly key: string;
  readonly label: string;
  readonly color?: string;
}> = [
  { key: 'status', label: 'Status', color: 'primary' },
  { key: 'track', label: 'Track', color: 'accent' },
  { key: 'type', label: 'Type', color: 'default' },
  { key: 'verdict', label: 'Verdict', color: 'warning' },
  { key: 'confidence', label: 'Confidence' },
];

const NARRATIVE_FIELDS: readonly string[] = [
  'summary',
  'reasoning',
  'recommended_action',
  'expected_impact',
];

const PATCH_FIELDS: readonly string[] = ['details', 'patch', 'evidence', 'intents', 'findings'];

/**
 * Fields that carry a synthesised rule body or a "this is what the rule
 * looks like" delta. When one of these is present on a `.soc-mutation-intents`
 * / `.soc-recommendations` / activity doc, we lift it into a dedicated rule
 * card at the top of the summary so the operator can see the actual query,
 * severity, and justification — not just metadata ids.
 */
const RULE_FIELDS: ReadonlyArray<{ readonly key: string; readonly heading: string }> = [
  { key: 'draft_rule', heading: 'Synthesised rule' },
  { key: 'new_definition', heading: 'New rule definition' },
  { key: 'proposed_rule_delta', heading: 'Proposed rule change' },
];

const buildSections = (raw: Readonly<Record<string, unknown>> | undefined): ParsedSummary | null => {
  if (!raw || typeof raw !== 'object') return null;

  const topBadges: BadgeDescriptor[] = [];
  for (const def of TOP_BADGE_FIELDS) {
    const value = raw[def.key];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'object') continue;
    const stringValue =
      def.key === 'confidence' && typeof value === 'number'
        ? `${Math.round(value <= 1 ? value * 100 : value)}%`
        : String(value);
    topBadges.push({ label: def.label, value: stringValue, color: def.color });
  }

  const sections: Section[] = [];
  const seen = new Set<string>(TOP_BADGE_FIELDS.map((t) => t.key));

  for (const { key, heading } of RULE_FIELDS) {
    if (!(key in raw)) continue;
    seen.add(key);
    const ruleSection = renderRuleField(key, heading, raw[key]);
    if (ruleSection) sections.push(ruleSection);
  }

  // `details.new_definition` is where the mutation-intent envelope stores
  // the full draft rule; surface it even when the top-level `draft_rule`
  // has been stripped to keep the doc small.
  if (!('draft_rule' in raw) && !('new_definition' in raw)) {
    const nested = (raw.details as Readonly<Record<string, unknown>> | undefined)?.new_definition;
    const nestedRule = renderRuleField('new_definition', 'New rule definition', nested);
    if (nestedRule) sections.push(nestedRule);
  }

  for (const key of NARRATIVE_FIELDS) {
    if (!(key in raw)) continue;
    seen.add(key);
    const content = renderNarrativeField(key, raw[key]);
    if (!content) continue;
    if (Array.isArray(content)) sections.push(...content);
    else sections.push(content);
  }

  for (const key of PATCH_FIELDS) {
    if (!(key in raw)) continue;
    seen.add(key);
    const content = renderPatchField(key, raw[key]);
    if (content) sections.push(content);
  }

  const metadata: Array<{ title: string; description: React.ReactNode }> = [];
  for (const [key, value] of Object.entries(raw)) {
    if (seen.has(key)) continue;
    if (key === 'title' || key === 'subtitle') continue;
    if (key === 'raw_document') continue;
    if (value === null || value === undefined || value === '') continue;
    if (key.startsWith('@') || key.startsWith('_')) continue;
    if (typeof value === 'object') continue;
    metadata.push({ title: toTitle(key), description: String(value) });
  }

  if (metadata.length > 0) {
    sections.push({
      heading: 'Metadata',
      content: <EuiDescriptionList compressed listItems={metadata} />,
    });
  }

  return { topBadges, sections };
};

const renderNarrativeField = (key: string, value: unknown): Section | Section[] | null => {
  if (value === null || value === undefined || value === '') return null;

  if (key === 'expected_impact' && typeof value === 'object' && !Array.isArray(value)) {
    return {
      heading: 'Expected impact',
      content: <ExpectedImpactStats stats={value as Readonly<Record<string, unknown>>} />,
    };
  }

  const parsed = tryParseStructured(value);
  if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return expandNarrativeObject(key, parsed as Readonly<Record<string, unknown>>);
  }
  if (parsed !== null) {
    return {
      heading: toTitle(key),
      content: <StructuredPayload value={parsed} />,
    };
  }

  if (typeof value === 'string') {
    return {
      heading: toTitle(key),
      content: (
        <EuiText size="s" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {value}
        </EuiText>
      ),
    };
  }

  return {
    heading: toTitle(key),
    content: (
      <EuiCodeBlock language="json" paddingSize="s" isCopyable fontSize="s" overflowHeight={260}>
        {JSON.stringify(value, null, 2)}
      </EuiCodeBlock>
    ),
  };
};

/**
 * When a narrative field like `summary` parses into a rich object (agent
 * output wrapped in a ```json fence), pull it apart into recognisable
 * sub-sections — a prose paragraph, a findings/intents list, an expected
 * impact KPI strip, a patch/details JSON block, and any leftover scalars
 * as metadata. Keeps everything scannable instead of nesting one giant
 * JSON tree under a "Summary" heading.
 */
const expandNarrativeObject = (
  parentKey: string,
  obj: Readonly<Record<string, unknown>>
): Section[] => {
  const out: Section[] = [];
  const consumed = new Set<string>();

  const narrativeString =
    typeof obj.summary === 'string' && obj.summary.length > 0
      ? obj.summary
      : typeof obj.message === 'string' && obj.message.length > 0
      ? obj.message
      : undefined;
  if (narrativeString) {
    consumed.add('summary');
    consumed.add('message');
    out.push({
      heading: toTitle(parentKey),
      content: (
        <EuiText size="s" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {narrativeString}
        </EuiText>
      ),
    });
  }

  for (const [listKey, heading] of [
    ['findings', 'Findings'],
    ['intents', 'Intents'],
    ['recommendations', 'Recommendations'],
  ] as const) {
    const value = obj[listKey];
    if (Array.isArray(value) && value.length > 0 && value.every((entry) => isFindingLike(entry))) {
      consumed.add(listKey);
      out.push({
        heading,
        content: (
          <FindingsList
            findings={value as ReadonlyArray<Readonly<Record<string, unknown>>>}
          />
        ),
      });
    }
  }

  if (
    obj.expected_impact &&
    typeof obj.expected_impact === 'object' &&
    !Array.isArray(obj.expected_impact)
  ) {
    consumed.add('expected_impact');
    out.push({
      heading: 'Expected impact',
      content: (
        <ExpectedImpactStats stats={obj.expected_impact as Readonly<Record<string, unknown>>} />
      ),
    });
  }

  for (const [nestedKey, heading] of [
    ['patch', 'Proposed patch'],
    ['details', 'Details'],
    ['evidence', 'Evidence'],
    ['track', 'Track'],
  ] as const) {
    if (!(nestedKey in obj)) continue;
    const value = obj[nestedKey];
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    consumed.add(nestedKey);
    out.push({ heading, content: <StructuredPayload value={value} /> });
  }

  const leftover: Array<{ title: string; description: React.ReactNode }> = [];
  for (const [key, value] of Object.entries(obj)) {
    if (consumed.has(key)) continue;
    if (value === null || value === undefined || value === '') continue;
    if (typeof value === 'object') continue;
    leftover.push({ title: toTitle(key), description: String(value) });
  }
  if (leftover.length > 0) {
    out.push({
      heading: 'Attributes',
      content: <EuiDescriptionList compressed listItems={leftover} />,
    });
  }

  if (out.length === 0) {
    out.push({ heading: toTitle(parentKey), content: <StructuredPayload value={obj} /> });
  }

  return out;
};

const renderRuleField = (key: string, heading: string, value: unknown): Section | null => {
  if (value === null || value === undefined) return null;
  const parsed = tryParseStructured(value);
  const payload = parsed !== null ? parsed : value;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const rule = payload as Readonly<Record<string, unknown>>;

  if (key === 'proposed_rule_delta') {
    return { heading, content: <RuleDeltaCard delta={rule} /> };
  }
  return { heading, content: <DraftRuleCard rule={rule} /> };
};

const severityColor = (severity: string | undefined): string => {
  switch ((severity ?? '').toLowerCase()) {
    case 'critical':
      return 'danger';
    case 'high':
      return 'danger';
    case 'medium':
      return 'warning';
    case 'low':
      return 'default';
    default:
      return 'hollow';
  }
};

const languageDisplay = (language: string | undefined): string => {
  switch ((language ?? '').toLowerCase()) {
    case 'esql':
      return 'ES|QL';
    case 'kuery':
    case 'kql':
      return 'KQL';
    case 'eql':
      return 'EQL';
    case 'lucene':
      return 'Lucene';
    case 'dsl':
    case 'es-dsl':
    case 'es_dsl':
      return 'ES DSL';
    default:
      return language ? language.toUpperCase() : 'Query';
  }
};

const queryCodeLanguage = (language: string | undefined): string => {
  const normalized = (language ?? '').toLowerCase();
  if (normalized === 'esql' || normalized === 'kuery' || normalized === 'kql' || normalized === 'eql') {
    return 'sql';
  }
  return 'json';
};

const formatQuery = (query: unknown, language: string | undefined): string => {
  if (typeof query === 'string') return query;
  if (!query || typeof query !== 'object') return String(query ?? '');
  const normalized = (language ?? '').toLowerCase();
  if (normalized === 'esql' || normalized === 'kuery' || normalized === 'kql' || normalized === 'eql') {
    const maybeString =
      (query as Readonly<Record<string, unknown>>).query ??
      (query as Readonly<Record<string, unknown>>).kuery ??
      (query as Readonly<Record<string, unknown>>).esql;
    if (typeof maybeString === 'string') return maybeString;
  }
  return JSON.stringify(query, null, 2);
};

const DraftRuleCard: React.FC<{ readonly rule: Readonly<Record<string, unknown>> }> = ({ rule }) => {
  const name = pickString(rule, 'name');
  const ruleId = pickString(rule, 'rule_id') ?? pickString(rule, 'id');
  const ruleVersion = pickString(rule, 'rule_version') ?? pickString(rule, 'version');
  const severity = pickString(rule, 'severity');
  const riskScore = rule.risk_score;
  const language = pickString(rule, 'language');
  const description = pickString(rule, 'description') ?? pickString(rule, 'summary');
  const mitre = Array.isArray(rule.mitre)
    ? (rule.mitre as ReadonlyArray<Readonly<Record<string, unknown>>>)
    : [];
  const query = rule.query ?? rule.rule_query ?? rule.body;
  const justification =
    rule.justification && typeof rule.justification === 'object'
      ? (rule.justification as Readonly<Record<string, unknown>>)
      : undefined;
  const advisoryExcerpts = Array.isArray(justification?.advisory_excerpts)
    ? (justification!.advisory_excerpts as readonly string[])
    : [];
  const observableSignals = Array.isArray(justification?.observable_signals)
    ? (justification!.observable_signals as readonly string[])
    : [];
  const precisionHypothesis = pickString(justification ?? {}, 'precision_hypothesis');

  return (
    <EuiPanel hasBorder paddingSize="m" color="subdued">
      {name ? (
        <EuiTitle size="xs">
          <h4>{name}</h4>
        </EuiTitle>
      ) : null}
      <EuiSpacer size="xs" />
      <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
        {severity ? (
          <EuiFlexItem grow={false}>
            <EuiBadge color={severityColor(severity)}>{`Severity: ${severity}`}</EuiBadge>
          </EuiFlexItem>
        ) : null}
        {typeof riskScore === 'number' ? (
          <EuiFlexItem grow={false}>
            <EuiBadge color="hollow">{`Risk score: ${riskScore}`}</EuiBadge>
          </EuiFlexItem>
        ) : null}
        {language ? (
          <EuiFlexItem grow={false}>
            <EuiBadge color="primary">{languageDisplay(language)}</EuiBadge>
          </EuiFlexItem>
        ) : null}
        {ruleVersion ? (
          <EuiFlexItem grow={false}>
            <EuiBadge color="hollow">{`v${ruleVersion}`}</EuiBadge>
          </EuiFlexItem>
        ) : null}
        {ruleId ? (
          <EuiFlexItem grow={false}>
            <EuiBadge color="hollow">
              <code>{ruleId}</code>
            </EuiBadge>
          </EuiFlexItem>
        ) : null}
      </EuiFlexGroup>

      {description ? (
        <>
          <EuiSpacer size="s" />
          <EuiText size="s" style={{ whiteSpace: 'pre-wrap' }}>
            {description}
          </EuiText>
        </>
      ) : null}

      {mitre.length > 0 ? (
        <>
          <EuiSpacer size="s" />
          <EuiTitle size="xxs">
            <h5>{'MITRE ATT&CK'}</h5>
          </EuiTitle>
          <EuiSpacer size="xs" />
          <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
            {mitre.map((entry, idx) => {
              const techniqueId = pickString(entry, 'technique_id') ?? `T?${idx}`;
              const techniqueName = pickString(entry, 'technique_name');
              const tactic = pickString(entry, 'tactic');
              const label = techniqueName
                ? `${techniqueId} · ${techniqueName}`
                : techniqueId;
              return (
                <EuiFlexItem grow={false} key={`${techniqueId}-${idx}`}>
                  <EuiBadge color="accent">
                    {tactic ? `${label} (${tactic})` : label}
                  </EuiBadge>
                </EuiFlexItem>
              );
            })}
          </EuiFlexGroup>
        </>
      ) : null}

      {query !== undefined && query !== null && query !== '' ? (
        <>
          <EuiSpacer size="s" />
          <EuiTitle size="xxs">
            <h5>{`Query (${languageDisplay(language)})`}</h5>
          </EuiTitle>
          <EuiSpacer size="xs" />
          <EuiCodeBlock
            language={queryCodeLanguage(language)}
            paddingSize="s"
            isCopyable
            fontSize="s"
            overflowHeight={320}
          >
            {formatQuery(query, language)}
          </EuiCodeBlock>
        </>
      ) : null}

      {advisoryExcerpts.length > 0 || observableSignals.length > 0 || precisionHypothesis ? (
        <>
          <EuiHorizontalRule margin="s" />
          <EuiTitle size="xxs">
            <h5>{'Justification'}</h5>
          </EuiTitle>
          <EuiSpacer size="xs" />
          {precisionHypothesis ? (
            <EuiText size="s" style={{ whiteSpace: 'pre-wrap' }}>
              <strong>{'Precision hypothesis: '}</strong>
              {precisionHypothesis}
            </EuiText>
          ) : null}
          {observableSignals.length > 0 ? (
            <>
              <EuiSpacer size="xs" />
              <EuiText size="xs" color="subdued">
                <strong>{'Observable signals'}</strong>
              </EuiText>
              <ul style={{ margin: '4px 0 0 16px' }}>
                {observableSignals.map((signal, idx) => (
                  <li key={`${signal}-${idx}`}>
                    <EuiText size="s">{signal}</EuiText>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {advisoryExcerpts.length > 0 ? (
            <>
              <EuiSpacer size="xs" />
              <EuiText size="xs" color="subdued">
                <strong>{'Advisory excerpts'}</strong>
              </EuiText>
              <ul style={{ margin: '4px 0 0 16px' }}>
                {advisoryExcerpts.map((excerpt, idx) => (
                  <li key={`${excerpt}-${idx}`}>
                    <EuiText size="s" style={{ whiteSpace: 'pre-wrap' }}>
                      {excerpt}
                    </EuiText>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      ) : null}
    </EuiPanel>
  );
};

const RuleDeltaCard: React.FC<{ readonly delta: Readonly<Record<string, unknown>> }> = ({
  delta,
}) => {
  const changeType = pickString(delta, 'change_type');
  const mitreTechnique = pickString(delta, 'mitre_technique');
  const severityBefore = pickString(delta, 'severity_before');
  const severityAfter = pickString(delta, 'severity_after');
  const thresholdBefore = delta.threshold_before;
  const thresholdAfter = delta.threshold_after;
  const queryBefore = pickString(delta, 'query_before');
  const queryAfter = pickString(delta, 'query_after');
  const languageBefore = pickString(delta, 'language_before') ?? pickString(delta, 'language');
  const languageAfter = pickString(delta, 'language_after') ?? pickString(delta, 'language');
  const rationale = pickString(delta, 'rationale');

  const deltaBadges: Array<{ label: string; before: string; after: string }> = [];
  if (severityBefore || severityAfter) {
    deltaBadges.push({
      label: 'Severity',
      before: severityBefore ?? '—',
      after: severityAfter ?? '—',
    });
  }
  if (thresholdBefore !== undefined || thresholdAfter !== undefined) {
    deltaBadges.push({
      label: 'Threshold',
      before: thresholdBefore !== undefined ? String(thresholdBefore) : '—',
      after: thresholdAfter !== undefined ? String(thresholdAfter) : '—',
    });
  }

  return (
    <EuiPanel hasBorder paddingSize="m" color="subdued">
      <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
        {changeType ? (
          <EuiFlexItem grow={false}>
            <EuiBadge color="primary">{`Change: ${changeType}`}</EuiBadge>
          </EuiFlexItem>
        ) : null}
        {mitreTechnique ? (
          <EuiFlexItem grow={false}>
            <EuiBadge color="accent">{mitreTechnique}</EuiBadge>
          </EuiFlexItem>
        ) : null}
      </EuiFlexGroup>

      {deltaBadges.length > 0 ? (
        <>
          <EuiSpacer size="s" />
          <EuiFlexGroup gutterSize="m" wrap responsive={false}>
            {deltaBadges.map((d) => (
              <EuiFlexItem grow={false} key={d.label}>
                <EuiText size="xs" color="subdued">
                  {d.label}
                </EuiText>
                <EuiText size="s">
                  <code>{d.before}</code> <span aria-hidden>{'→'}</span> <code>{d.after}</code>
                </EuiText>
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>
        </>
      ) : null}

      {queryBefore ? (
        <>
          <EuiSpacer size="s" />
          <EuiTitle size="xxs">
            <h5>{`Before (${languageDisplay(languageBefore)})`}</h5>
          </EuiTitle>
          <EuiSpacer size="xs" />
          <EuiCodeBlock
            language={queryCodeLanguage(languageBefore)}
            paddingSize="s"
            isCopyable
            fontSize="s"
            overflowHeight={200}
          >
            {queryBefore}
          </EuiCodeBlock>
        </>
      ) : null}

      {queryAfter ? (
        <>
          <EuiSpacer size="s" />
          <EuiTitle size="xxs">
            <h5>{`After (${languageDisplay(languageAfter)})`}</h5>
          </EuiTitle>
          <EuiSpacer size="xs" />
          <EuiCodeBlock
            language={queryCodeLanguage(languageAfter)}
            paddingSize="s"
            isCopyable
            fontSize="s"
            overflowHeight={200}
          >
            {queryAfter}
          </EuiCodeBlock>
        </>
      ) : null}

      {rationale ? (
        <>
          <EuiSpacer size="s" />
          <EuiText size="s" style={{ whiteSpace: 'pre-wrap' }}>
            <strong>{'Rationale: '}</strong>
            {rationale}
          </EuiText>
        </>
      ) : null}
    </EuiPanel>
  );
};

const renderPatchField = (key: string, value: unknown): Section | null => {
  if (value === null || value === undefined) return null;
  const parsed = tryParseStructured(value);
  const payload = parsed !== null ? parsed : value;

  if (Array.isArray(payload) && payload.every((entry) => isFindingLike(entry))) {
    return {
      heading: toTitle(key),
      content: <FindingsList findings={payload as ReadonlyArray<Readonly<Record<string, unknown>>>} />,
    };
  }

  if (Array.isArray(payload) && payload.length === 0) return null;

  return {
    heading: toTitle(key),
    content: <StructuredPayload value={payload} />,
  };
};

const isFindingLike = (entry: unknown): boolean => {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  const record = entry as Readonly<Record<string, unknown>>;
  const keys = Object.keys(record);
  const hints = ['rule_id', 'observation', 'classification', 'recommended_action', 'summary', 'title'];
  return hints.some((hint) => keys.includes(hint));
};

const FindingsList: React.FC<{
  readonly findings: ReadonlyArray<Readonly<Record<string, unknown>>>;
}> = ({ findings }) => (
  <EuiFlexGroup direction="column" gutterSize="s">
    {findings.map((finding, idx) => {
      const title =
        pickString(finding, 'rule_id') ??
        pickString(finding, 'title') ??
        pickString(finding, 'id') ??
        `Finding ${idx + 1}`;
      const classification = pickString(finding, 'classification');
      const observation = pickString(finding, 'observation') ?? pickString(finding, 'summary');
      const action = pickString(finding, 'recommended_action');
      const reason = pickString(finding, 'not_tuned_because') ?? pickString(finding, 'reason');
      return (
        <EuiFlexItem key={`${title}-${idx}`} grow={false}>
          <EuiPanel hasShadow={false} hasBorder paddingSize="s">
            <EuiFlexGroup alignItems="center" gutterSize="xs" wrap responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiBadge color="hollow">{title}</EuiBadge>
              </EuiFlexItem>
              {classification ? (
                <EuiFlexItem grow={false}>
                  <EuiBadge color={classificationColor(classification)}>{classification}</EuiBadge>
                </EuiFlexItem>
              ) : null}
              {action ? (
                <EuiFlexItem grow={false}>
                  <EuiBadge color={actionColor(action)}>{action}</EuiBadge>
                </EuiFlexItem>
              ) : null}
            </EuiFlexGroup>
            {observation ? (
              <>
                <EuiSpacer size="xs" />
                <EuiText size="s" style={{ whiteSpace: 'pre-wrap' }}>
                  {observation}
                </EuiText>
              </>
            ) : null}
            {reason ? (
              <>
                <EuiSpacer size="xs" />
                <EuiText size="xs" color="subdued" style={{ whiteSpace: 'pre-wrap' }}>
                  {reason}
                </EuiText>
              </>
            ) : null}
          </EuiPanel>
        </EuiFlexItem>
      );
    })}
  </EuiFlexGroup>
);

const ExpectedImpactStats: React.FC<{
  readonly stats: Readonly<Record<string, unknown>>;
}> = ({ stats }) => {
  const entries = Object.entries(stats).filter(
    ([, value]) => value !== null && value !== undefined && value !== ''
  );
  if (entries.length === 0) return null;
  return (
    <EuiFlexGroup gutterSize="m" wrap responsive={false}>
      {entries.map(([key, value]) => (
        <EuiFlexItem grow={false} key={key} style={{ minWidth: 120 }}>
          <EuiStat
            titleSize="s"
            title={formatStatValue(key, value)}
            description={toTitle(key)}
            textAlign="left"
          />
        </EuiFlexItem>
      ))}
    </EuiFlexGroup>
  );
};

const StructuredPayload: React.FC<{ readonly value: unknown }> = ({ value }) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    return (
      <EuiText size="s" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {value}
      </EuiText>
    );
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Readonly<Record<string, unknown>>;
    const entries = Object.entries(record).filter(
      ([, v]) => v !== null && v !== undefined && v !== ''
    );
    const scalars = entries.filter(([, v]) => typeof v !== 'object');
    const nested = entries.filter(([, v]) => typeof v === 'object');
    return (
      <>
        {scalars.length > 0 ? (
          <EuiDescriptionList
            compressed
            listItems={scalars.map(([key, v]) => ({
              title: toTitle(key),
              description: String(v),
            }))}
          />
        ) : null}
        {nested.length > 0 ? (
          <>
            {scalars.length > 0 ? <EuiHorizontalRule margin="s" /> : null}
            <EuiCodeBlock
              language="json"
              paddingSize="s"
              isCopyable
              fontSize="s"
              overflowHeight={320}
            >
              {JSON.stringify(Object.fromEntries(nested), null, 2)}
            </EuiCodeBlock>
          </>
        ) : null}
      </>
    );
  }
  return (
    <EuiCodeBlock language="json" paddingSize="s" isCopyable fontSize="s" overflowHeight={320}>
      {JSON.stringify(value, null, 2)}
    </EuiCodeBlock>
  );
};

const tryParseStructured = (value: unknown): unknown | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      return null;
    }
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  return null;
};

const pickString = (
  record: Readonly<Record<string, unknown>>,
  key: string
): string | undefined => {
  const value = record[key];
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
};

const classificationColor = (classification: string): string => {
  const normalized = classification.toLowerCase();
  if (normalized.includes('noisy') || normalized.includes('structurally')) return 'warning';
  if (normalized.includes('healthy') || normalized.includes('clean')) return 'success';
  if (normalized.includes('watchlist')) return 'accent';
  if (normalized.includes('gap') || normalized.includes('unknown')) return 'danger';
  return 'hollow';
};

const actionColor = (action: string): string => {
  const normalized = action.toLowerCase();
  if (normalized.startsWith('redesign')) return 'danger';
  if (normalized.startsWith('ignore') || normalized === 'none') return 'default';
  if (normalized.includes('none_this_cycle')) return 'default';
  if (normalized.includes('out_of_scope')) return 'default';
  return 'primary';
};

const formatStatValue = (key: string, value: unknown): string => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') {
    if (key.endsWith('_pct') || key.endsWith('_percent')) return `${value}%`;
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return String(value);
};

const toTitle = (key: string): string =>
  key
    .replace(/[_.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());
