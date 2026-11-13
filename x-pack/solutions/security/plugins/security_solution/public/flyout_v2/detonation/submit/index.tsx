/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { memo } from 'react';
import { EuiFlyoutBody, EuiFlyoutHeader } from '@elastic/eui';
import type { DetonateTask } from '../../../../common/detonate_prototype';
import { SubmitForm } from '../../../detonate_prototype/components/submit_form';
import { FlyoutHeaderActions } from '../../shared/components/flyout_header_actions';
import { FlyoutTitle } from '../../shared/components/flyout_title';
import { DETONATION_SUBMIT_TITLE } from '../../shared/constants/flyout_titles';
import { PREFIX } from '../../../flyout/shared/test_ids';

export const DETONATION_SUBMIT_TITLE_TEST_ID = `${PREFIX}DetonationSubmitTitle` as const;
export const DETONATION_SUBMIT_BODY_TEST_ID = `${PREFIX}DetonationSubmitBody` as const;

export interface DetonationSubmitProps {
  /**
   * Hash to prefill, e.g. the file hash of the alert the flyout was opened from
   */
  initialHash?: string;
  /**
   * Tags to prefill, e.g. the `alert:<id>` tag linking the run back to its alert
   */
  initialTags?: string[];
  /**
   * Called with the created run once the submission was accepted
   */
  onSubmitted: (task: DetonateTask) => void;
}

/**
 * Detonation submit system flyout content: the same submit form the Detonate page uses.
 */
export const DetonationSubmit: FC<DetonationSubmitProps> = memo(
  ({ initialHash, initialTags, onSubmitted }) => (
    <>
      <EuiFlyoutHeader>
        <FlyoutHeaderActions />
        <FlyoutTitle
          title={DETONATION_SUBMIT_TITLE}
          data-test-subj={DETONATION_SUBMIT_TITLE_TEST_ID}
        />
      </EuiFlyoutHeader>
      <EuiFlyoutBody data-test-subj={DETONATION_SUBMIT_BODY_TEST_ID}>
        <SubmitForm
          initialHash={initialHash}
          initialTags={initialTags}
          source="alert_flyout"
          onSubmitted={onSubmitted}
        />
      </EuiFlyoutBody>
    </>
  )
);

DetonationSubmit.displayName = 'DetonationSubmit';
