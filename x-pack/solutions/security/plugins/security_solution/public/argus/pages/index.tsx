/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import { EuiButton, EuiButtonEmpty } from '@elastic/eui';
import { useHistory, useLocation } from 'react-router-dom';

import { ArgusConsole, resolveTabId } from '@kbn/argus-console';
import type { ArgusConsoleTabId, ArgusPlaybookEntry } from '@kbn/argus-console';
import {
  ARGUS_CONSOLE_ALL_UI_CAPABILITY,
  type ArgusMutationFilter,
  type ArgusMutationWindow,
  type ArgusSynthesisWindow,
  type DecisionGraphNodeKind,
  type MutationLineageSubject,
  type ReasoningChainSubject,
} from '@kbn/argus-console-common';

type E2dWindow = '24h' | '7d';

const VALID_TABS: readonly string[] = [
  'command_center',
  'detection_pipeline',
  'coverage_threats',
  'governance',
  'playbooks',
  'overview',
  'mutations',
  'e2d',
  'proposals',
  'autonomy',
  'coverage',
  'corpus',
  'caldera',
  'decision_graph',
];
const VALID_NODE_KINDS: readonly DecisionGraphNodeKind[] = [
  'advisory',
  'intent',
  'outcome',
  'rule',
  'actor',
  'technique',
  'reasoning',
  'audit',
  'observation',
];

const asNodeKind = (v: string | null): DecisionGraphNodeKind | undefined =>
  v && (VALID_NODE_KINDS as readonly string[]).includes(v)
    ? (v as DecisionGraphNodeKind)
    : undefined;

/**
 * Accept `root=advisory:CVE-2024-27198` or the split-param form
 * `root_kind=advisory&root_id=CVE-2024-27198`. The split form wins when both
 * are present, matching how the in-page state updater writes the URL.
 */
const parseDecisionGraphRoot = (
  params: URLSearchParams
):
  | {
      readonly kind: DecisionGraphNodeKind;
      readonly id: string;
    }
  | undefined => {
  const splitKind = asNodeKind(params.get('root_kind'));
  const splitId = params.get('root_id') ?? undefined;
  if (splitKind && splitId) return { kind: splitKind, id: splitId };

  const compact = params.get('root');
  if (!compact) return undefined;
  const [rawKind, ...rest] = compact.split(':');
  const id = rest.join(':');
  const kind = asNodeKind(rawKind);
  if (kind && id) return { kind, id };
  return undefined;
};
const VALID_MUTATION_FILTERS: readonly ArgusMutationFilter[] = [
  'all',
  'applied',
  'rolled_back',
  'blocked',
];
const VALID_WINDOWS: readonly ArgusMutationWindow[] = ['24h', '7d'];

const asTabId = (v: string | null): ArgusConsoleTabId | undefined => {
  if (!v || !VALID_TABS.includes(v)) return undefined;
  return resolveTabId(v as ArgusConsoleTabId) ?? (v as ArgusConsoleTabId);
};

const asMutationFilter = (v: string | null): ArgusMutationFilter | undefined =>
  v && (VALID_MUTATION_FILTERS as readonly string[]).includes(v)
    ? (v as ArgusMutationFilter)
    : undefined;

const asWindow = (v: string | null): ArgusMutationWindow | undefined =>
  v && (VALID_WINDOWS as readonly string[]).includes(v) ? (v as ArgusMutationWindow) : undefined;

const asE2dWindow = (v: string | null): E2dWindow | undefined => {
  const win = asWindow(v);
  return win ?? undefined;
};

const asProposalsWindow = (v: string | null): ArgusSynthesisWindow | undefined => {
  const win = asWindow(v);
  return win ?? undefined;
};

import { useKibana } from '../../common/lib/kibana';
import { SpyRoute } from '../../common/utils/route/spy_routes';
import { APP_UI_ID, SECURITY_FEATURE_ID, SecurityPageName } from '../../../common/constants';
import { getRuleDetailsUrl } from '../../common/components/link_to/redirect_to_detection_engine';

/**
 * Saved-object id of the companion dashboard provisioned by
 * `soc-simulation/scripts/provision_argus_dashboards.sh`. Keep these in sync
 * with `soc-simulation/dashboards/argus_operations_overview.ndjson`.
 */
const ARGUS_OPS_DASHBOARD_ID = 'argus-operations-overview';
const ARGUS_UNIFIED_DATA_VIEW_ID = 'argus-all-soc-dv';

const ArgusPageComponent: React.FC = () => {
  const { services } = useKibana();
  const location = useLocation();
  const history = useHistory();

  // Capability gating matches the privileges wired into the base siemV5
  // feature — `ARGUS_CONSOLE_ALL_UI_CAPABILITY` grants the kill-switch toggle
  // and mutation approve/reject actions. The backend is still the source of
  // truth; this only avoids rendering dead affordances for read-only users.
  // Capabilities are exposed under the feature id (SECURITY_FEATURE_ID =
  // 'siemV5'), matching the `capabilities[SECURITY_FEATURE_ID]` pattern
  // used elsewhere in Security Solution.
  const capabilities = services.application?.capabilities;
  const canArgusWrite = Boolean(
    (capabilities?.[SECURITY_FEATURE_ID] as Record<string, unknown> | undefined)?.[
      ARGUS_CONSOLE_ALL_UI_CAPABILITY
    ]
  );

  const onWriteError = useCallback(
    (error: Error) => {
      services.notifications?.toasts.addError(error, {
        title: 'ARGUS write failed',
      });
    },
    [services.notifications]
  );

  // Deep-link from an Autonomy decision's Artifact column into the rule
  // details page (when the backend resolved `artifact_id` to a Kibana
  // saved-object UUID). When no UUID is available we fall back to the
  // rules list filtered by the logical id so operators still have a useful
  // landing page instead of a 404. Kept as a single `navigateToApp` call
  // so focus-mode, new-tab, and basepath handling all come from Kibana.
  const onOpenRule = useCallback(
    ({ artifactId, kibanaRuleId }: { artifactId: string; kibanaRuleId?: string }) => {
      if (kibanaRuleId) {
        services.application.navigateToApp(APP_UI_ID, {
          deepLinkId: SecurityPageName.rules,
          path: getRuleDetailsUrl(kibanaRuleId),
        });
        return;
      }
      services.application.navigateToApp(APP_UI_ID, {
        deepLinkId: SecurityPageName.rules,
        path: `?search=${encodeURIComponent(artifactId)}`,
      });
    },
    [services.application]
  );

  // Deep-link workflows to Workflows Management and skills to Agent
  // Builder chat. Both apps already exist in Kibana; we rely on their URL
  // conventions rather than a dedicated API.
  //
  // The Workflows Management URL convention is `/app/workflows/<id>` where
  // `<id>` is the Kibana saved-object id (typically `workflow-<uuid>`).
  // ARGUS surfaces workflows keyed by their registry slug (e.g.
  // `soc-argus-exploit-to-detection`), so navigating with the slug alone
  // 404s the detail page. We therefore prefer the resolved
  // `kibana_workflow_id` carried alongside each entry and fall back to the
  // list page filtered by the display name so the operator still lands on
  // a useful view when the resolver hasn't run yet.
  const onOpenPlaybook = useCallback(
    (entry: ArgusPlaybookEntry) => {
      if (entry.kind === 'workflow') {
        if (entry.id === 'workflows') {
          services.application.navigateToApp('workflows');
          return;
        }
        if (entry.kibana_workflow_id) {
          services.application.navigateToApp('workflows', { path: entry.kibana_workflow_id });
          return;
        }
        services.application.navigateToApp('workflows', {
          path: `?search=${encodeURIComponent(entry.name)}`,
        });
        return;
      }
      services.application.navigateToApp('agent_builder');
    },
    [services.application]
  );

  const {
    reasoningSubject,
    lineageSubject,
    initialTab,
    initialMutationsFilter,
    initialMutationsWindow,
    initialE2dCve,
    initialE2dWindow,
    initialProposalsCve,
    initialProposalsWindow,
    initialDecisionGraphRoot,
  } = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const alertId = params.get('alert_id') ?? undefined;
    const runId = params.get('run_id') ?? undefined;
    const ruleId = params.get('rule_id') ?? undefined;
    const cveId = params.get('cve') ?? undefined;

    const reasoning: ReasoningChainSubject | undefined = runId
      ? { kind: 'run', id: runId }
      : alertId
      ? { kind: 'alert', id: alertId }
      : undefined;

    const lineage: MutationLineageSubject | undefined = cveId
      ? { kind: 'cve', id: cveId }
      : ruleId
      ? { kind: 'rule', id: ruleId }
      : alertId
      ? { kind: 'alert', id: alertId }
      : undefined;

    const explicitTab = asTabId(params.get('tab'));
    const decisionGraphRoot = parseDecisionGraphRoot(params);
    const tab: ArgusConsoleTabId | undefined =
      explicitTab ?? (decisionGraphRoot ? 'governance' : cveId ? 'detection_pipeline' : undefined);

    // When landing directly on the Proposals tab, route the CVE param into
    // the proposals-initial slot; otherwise it still seeds the E2D tab.
    const proposalsCve = explicitTab === 'proposals' ? cveId : undefined;

    return {
      reasoningSubject: reasoning,
      lineageSubject: lineage,
      initialTab: tab,
      initialMutationsFilter: asMutationFilter(params.get('mutations_filter')),
      initialMutationsWindow: asWindow(params.get('mutations_window')),
      initialE2dCve: cveId,
      initialE2dWindow: asE2dWindow(params.get('e2d_window')),
      initialProposalsCve: proposalsCve,
      initialProposalsWindow: asProposalsWindow(params.get('proposals_window')),
      initialDecisionGraphRoot: decisionGraphRoot,
    };
  }, [location.search]);

  const onTabChange = useCallback(
    (tabId: ArgusConsoleTabId) => {
      const params = new URLSearchParams(location.search);
      params.set('tab', tabId);
      history.replace({ pathname: location.pathname, search: `?${params.toString()}` });
    },
    [history, location.pathname, location.search]
  );

  const onDecisionGraphRootChange = useCallback(
    ({
      rootKind,
      rootId,
    }: {
      readonly rootKind: DecisionGraphNodeKind | undefined;
      readonly rootId: string | undefined;
      readonly depth: number;
    }) => {
      const params = new URLSearchParams(location.search);
      params.set('tab', 'decision_graph');
      if (rootKind && rootId) {
        params.set('root_kind', rootKind);
        params.set('root_id', rootId);
      } else {
        params.delete('root_kind');
        params.delete('root_id');
      }
      params.delete('root');
      history.replace({ pathname: location.pathname, search: `?${params.toString()}` });
    },
    [history, location.pathname, location.search]
  );

  const openDashboard = useCallback(() => {
    services.application.navigateToApp('dashboards', {
      path: `#/view/${ARGUS_OPS_DASHBOARD_ID}`,
    });
  }, [services.application]);

  const openDiscover = useCallback(() => {
    // Pre-seed Discover with our unified .soc-* data view and a 24h window so
    // auditors land on an immediately useful query surface. Discover v2
    // expects the data view under `dataSource` (legacy `index:'…'` gets
    // silently ignored and Kibana auto-picks the first matching DV).
    const appState = `(dataSource:(type:dataView,dataViewId:'${ARGUS_UNIFIED_DATA_VIEW_ID}'))`;
    services.application.navigateToApp('discover', {
      path: `#/?_g=(time:(from:now-24h,to:now))&_a=${appState}`,
    });
  }, [services.application]);

  /**
   * "View in Discover" pivot on the shared artifact details flyout. The
   * flyout always knows the source `_index` + `_id` of the document it is
   * rendering, so we surface exactly that one Elasticsearch doc in Discover.
   * We widen the time window to 90d because the underlying artifact (a
   * mutation record, outcome, reasoning trace, …) can easily be older than
   * the 24h default used elsewhere in this page.
   */
  const onOpenDiscover = useCallback(
    ({ sourceIndex, sourceDocId }: { sourceIndex: string; sourceDocId: string }) => {
      const kql = `_index:"${sourceIndex}" and _id:"${sourceDocId}"`;
      const appState = `(dataSource:(type:dataView,dataViewId:'${ARGUS_UNIFIED_DATA_VIEW_ID}'),query:(language:kuery,query:'${kql}'))`;
      services.application.navigateToApp('discover', {
        path: `#/?_g=(time:(from:now-90d,to:now))&_a=${appState}`,
      });
    },
    [services.application]
  );

  const headerRightSideItems = useMemo(
    () => [
      <EuiButton
        key="argus-open-dashboard"
        iconType="dashboardApp"
        color="primary"
        onClick={openDashboard}
        data-test-subj="argusHeaderOpenDashboard"
      >
        {'Open in Dashboard'}
      </EuiButton>,
      <EuiButtonEmpty
        key="argus-open-discover"
        iconType="discoverApp"
        onClick={openDiscover}
        data-test-subj="argusHeaderOpenDiscover"
      >
        {'Audit in Discover'}
      </EuiButtonEmpty>,
    ],
    [openDashboard, openDiscover]
  );

  return (
    <>
      <ArgusConsole
        http={services.http}
        initialReasoningSubject={reasoningSubject}
        initialLineageSubject={lineageSubject}
        initialTab={initialTab}
        onTabChange={onTabChange}
        initialMutationsFilter={initialMutationsFilter}
        initialMutationsWindow={initialMutationsWindow}
        initialE2dCve={initialE2dCve}
        initialE2dWindow={initialE2dWindow}
        initialProposalsCve={initialProposalsCve}
        initialProposalsWindow={initialProposalsWindow}
        headerRightSideItems={headerRightSideItems}
        canArgusWrite={canArgusWrite}
        onWriteError={onWriteError}
        onOpenRule={onOpenRule}
        onOpenPlaybook={onOpenPlaybook}
        onOpenDiscover={onOpenDiscover}
        initialDecisionGraphRoot={initialDecisionGraphRoot}
        onDecisionGraphRootChange={onDecisionGraphRootChange}
      />
      <SpyRoute pageName={SecurityPageName.argus} />
    </>
  );
};

ArgusPageComponent.displayName = 'ARGUSPage';

export const ArgusPage = React.memo(ArgusPageComponent);
