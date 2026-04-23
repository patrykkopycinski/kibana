/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useMemo } from 'react';
import { i18n } from '@kbn/i18n';

import { APP_UI_ID, ARGUS_PATH } from '../../../../../common/constants';
import { SecurityPageName } from '../../../../app/types';
import { useIsExperimentalFeatureEnabled } from '../../../../common/hooks/use_experimental_features';
import { useKibana } from '../../../../common/lib/kibana';

const SHOW_ARGUS_REASONING = i18n.translate(
  'xpack.securitySolution.argus.flyoutAction.showReasoningLabel',
  { defaultMessage: 'Show Argus reasoning' }
);

interface UseShowArgusReasoningActionProps {
  /**
   * Alert document id. When absent the action is disabled.
   */
  eventId: string | undefined;
  /**
   * Only show the action for detection alerts.
   */
  isAlert: boolean;
  /**
   * Invoked before navigation so callers can close the containing popover.
   */
  closePopover: () => void;
}

/**
 * Returns context-menu items that deep-link from an alert flyout to the Argus
 * Console, pre-populating the reasoning chain and mutation lineage panels with
 * the selected alert. Gated on the `argusConsoleEnabled` experimental flag.
 */
export const useShowArgusReasoningAction = ({
  eventId,
  isAlert,
  closePopover,
}: UseShowArgusReasoningActionProps) => {
  const argusConsoleEnabled = useIsExperimentalFeatureEnabled('argusConsoleEnabled');
  const {
    application: { navigateToApp },
  } = useKibana().services;

  const onClick = useCallback(() => {
    closePopover();
    if (!eventId) {
      return;
    }
    const query = new URLSearchParams({ alert_id: eventId }).toString();
    navigateToApp(APP_UI_ID, {
      deepLinkId: SecurityPageName.argus,
      path: `${ARGUS_PATH}?${query}`,
    });
  }, [closePopover, eventId, navigateToApp]);

  const showArgusReasoningActionItems = useMemo(
    () =>
      argusConsoleEnabled && isAlert
        ? [
            {
              key: 'show-argus-reasoning-action-item',
              'data-test-subj': 'show-argus-reasoning-action-item',
              disabled: !eventId,
              onClick,
              name: SHOW_ARGUS_REASONING,
            },
          ]
        : [],
    [argusConsoleEnabled, eventId, isAlert, onClick]
  );

  return { showArgusReasoningActionItems };
};
