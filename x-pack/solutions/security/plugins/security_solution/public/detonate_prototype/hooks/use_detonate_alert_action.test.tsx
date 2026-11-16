/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Unit tests for the hash extraction the "Detonate file" alert action uses.
 */

import { act, renderHook } from '@testing-library/react';
import type { DataTableRecord } from '@kbn/discover-utils';

import {
  DETONATE_FILE_ACTION_ID,
  DETONATE_VIEW_REPORT_ACTION_ID,
} from '../../common/constants/action_ids';
import { useIsExperimentalFeatureEnabled } from '../../common/hooks/use_experimental_features';
import { useFlyoutApi } from '../../flyout_v2/use_flyout_api';
import { getDetonatableHash } from './detonatable_hash';
import { useDetonateAlertAction } from './use_detonate_alert_action';
import { useCompletedDetonationByHash } from './use_detonate';

jest.mock('../../common/hooks/use_experimental_features');
jest.mock('../../flyout_v2/use_flyout_api');
jest.mock('./use_detonate');
jest.mock('../components/submit_modal', () => ({ SubmitModal: () => null }));

const hitWith = (flattened: Record<string, unknown>): DataTableRecord =>
  ({ flattened, raw: {} } as unknown as DataTableRecord);

describe('getDetonatableHash', () => {
  it('prefers SHA-256 over the weaker digests, wherever it appears', () => {
    expect(
      getDetonatableHash(
        hitWith({
          'file.hash.sha256': 'a'.repeat(64),
          'file.hash.sha1': 'b'.repeat(40),
        })
      )
    ).toBe('a'.repeat(64));
  });

  it('falls back through the hash fields in preference order', () => {
    expect(
      getDetonatableHash(
        hitWith({
          'process.hash.sha256': 'c'.repeat(64),
          'file.hash.md5': 'd'.repeat(32),
        })
      )
    ).toBe('c'.repeat(64));
  });

  it('returns undefined when the document carries no hash', () => {
    expect(getDetonatableHash(hitWith({ 'source.ip': '10.0.0.1' }))).toBeUndefined();
  });

  it('skips empty string values rather than returning them', () => {
    expect(
      getDetonatableHash(hitWith({ 'file.hash.sha256': '', 'file.hash.md5': 'e'.repeat(32) }))
    ).toBe('e'.repeat(32));
  });

  it('takes the first entry of an array-valued field', () => {
    expect(
      getDetonatableHash(hitWith({ 'file.hash.sha256': ['f'.repeat(64), 'g'.repeat(64)] }))
    ).toBe('f'.repeat(64));
  });
});

describe('useDetonateAlertAction', () => {
  const hash = 'a'.repeat(64);
  const openDetonationFlyoutAsChild = jest.fn();
  const closePopover = jest.fn();

  const alertHit = (flattened: Record<string, unknown>, id = 'alert-1'): DataTableRecord =>
    ({ flattened, raw: { _id: id } } as unknown as DataTableRecord);

  const setup = (hit: DataTableRecord) =>
    renderHook(() => useDetonateAlertAction({ hit, closePopover }));

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useIsExperimentalFeatureEnabled).mockReturnValue(true);
    jest.mocked(useFlyoutApi).mockReturnValue({ openDetonationFlyoutAsChild } as never);
    jest.mocked(useCompletedDetonationByHash).mockReturnValue({ completedRun: undefined } as never);
  });

  it('returns no items and no modal when the feature flag is off', () => {
    jest.mocked(useIsExperimentalFeatureEnabled).mockReturnValue(false);
    const { result } = setup(alertHit({ 'file.hash.sha256': hash }));
    expect(result.current.detonateActionItems).toEqual([]);
    expect(result.current.detonateModal).toBeNull();
  });

  it('returns no items when the alert carries no hash', () => {
    const { result } = setup(alertHit({ 'source.ip': '10.0.0.1' }));
    expect(result.current.detonateActionItems).toEqual([]);
    expect(result.current.detonateModal).toBeNull();
  });

  it('does not render the modal until the action is clicked', () => {
    const { result } = setup(alertHit({ 'file.hash.sha256': hash }));
    expect(result.current.detonateModal).toBeNull();
  });

  it('opens the submit modal prefilled with the hash and the alert tag', () => {
    const { result } = setup(alertHit({ 'file.hash.sha256': hash }, 'doc-7'));

    expect(result.current.detonateActionItems.map((item) => item.key)).toEqual([
      DETONATE_FILE_ACTION_ID,
    ]);
    act(() => {
      result.current.detonateActionItems[0].onClick?.({} as never);
    });

    expect(closePopover).toHaveBeenCalledTimes(1);
    expect(result.current.detonateModal?.props).toEqual(
      expect.objectContaining({
        initialHash: hash,
        initialTags: ['alert:doc-7'],
        initialOrigin: { alert_ids: ['doc-7'] },
        source: 'alert_flyout',
      })
    );
  });

  it('passes the alert, host, user and file path as the submit origin', () => {
    const { result } = setup(
      alertHit(
        {
          'file.hash.sha256': hash,
          'host.name': 'win-01',
          'user.name': 'alice',
          'file.path': 'C:\\Temp\\bad.exe',
        },
        'doc-7'
      )
    );
    act(() => {
      result.current.detonateActionItems[0].onClick?.({} as never);
    });

    expect(result.current.detonateModal?.props.initialOrigin).toEqual({
      alert_ids: ['doc-7'],
      host_name: 'win-01',
      user_name: 'alice',
      file_path: 'C:\\Temp\\bad.exe',
    });
  });

  it('falls back to the process executable when the alert has no file path', () => {
    const { result } = setup(
      alertHit({ 'process.hash.sha256': hash, 'process.executable': '/tmp/dropper' })
    );
    act(() => {
      result.current.detonateActionItems[0].onClick?.({} as never);
    });

    expect(result.current.detonateModal?.props.initialOrigin).toEqual(
      expect.objectContaining({ file_path: '/tmp/dropper' })
    );
  });

  it('closes the modal and opens the result child once the sample is submitted', () => {
    const { result } = setup(alertHit({ 'file.hash.sha256': hash }));
    act(() => {
      result.current.detonateActionItems[0].onClick?.({} as never);
    });
    act(() => {
      result.current.detonateModal?.props.onSubmitted({ id: 'task-9' });
    });

    expect(openDetonationFlyoutAsChild).toHaveBeenCalledWith({ taskId: 'task-9' });
    expect(result.current.detonateModal).toBeNull();
  });

  it('closes the modal and opens the result child from the prior-run link', () => {
    const { result } = setup(alertHit({ 'file.hash.sha256': hash }));
    act(() => {
      result.current.detonateActionItems[0].onClick?.({} as never);
    });
    act(() => {
      result.current.detonateModal?.props.onViewTask('run-2');
    });

    expect(openDetonationFlyoutAsChild).toHaveBeenCalledWith({ taskId: 'run-2' });
    expect(result.current.detonateModal).toBeNull();
  });

  it('opens the result child for the completed run when one exists', () => {
    jest
      .mocked(useCompletedDetonationByHash)
      .mockReturnValue({ completedRun: { id: 'run-3' } } as never);

    const { result } = setup(alertHit({ 'file.hash.sha256': hash }));
    const items = result.current.detonateActionItems;

    expect(items.map((item) => item.key)).toEqual([
      DETONATE_VIEW_REPORT_ACTION_ID,
      DETONATE_FILE_ACTION_ID,
    ]);
    items[0].onClick?.({} as never);

    expect(closePopover).toHaveBeenCalledTimes(1);
    expect(openDetonationFlyoutAsChild).toHaveBeenCalledWith({ taskId: 'run-3' });
    expect(result.current.detonateModal).toBeNull();
  });
});
