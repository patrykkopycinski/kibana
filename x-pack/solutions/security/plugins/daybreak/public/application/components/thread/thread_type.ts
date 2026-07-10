/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IconType } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { DaybreakThreadTypeTokens } from '../../theme';

/**
 * The five engagement kinds a Daybreak thread (the stage's per-Proposal
 * conversation/investigation surface) can represent (FR-013), ported from
 * the Throughline (NotDaybreak) prototype's thread taxonomy — see
 * `.ao/recon.md`'s shell → rail/nav/stage/composer; thread →
 * stream/msg/spine/inspector decomposition. The prototype source itself is
 * not vendored yet (`.ao/blocked.md`, FR-001), so the taxonomy is fixed here
 * ahead of the 1:1 port so downstream thread components (stream, spine,
 * inspector) can consume a single stable type rather than inlining string
 * literals per-component.
 */
export type ThreadType = 'case' | 'investigation' | 'hunt' | 'incident' | 'chat';

/** Every {@link ThreadType} value, in the prototype's declared order. */
export const THREAD_TYPES: readonly ThreadType[] = [
  'case',
  'investigation',
  'hunt',
  'incident',
  'chat',
];

interface ThreadTypeMeta {
  /** EUI icon rendered next to the thread type (rail item, stage header). */
  icon: IconType;
  /** Which {@link DaybreakThreadTypeTokens} key colors this thread type. */
  themeToken: keyof DaybreakThreadTypeTokens;
  /** Human-readable label. */
  label: () => string;
}

/**
 * Metadata per {@link ThreadType} — icon, theme token, and label. Colors are
 * drawn from `daybreakTheme.modes[mode].threadType` (FR-006) rather than
 * inlining hex values; callers resolve the actual color via
 * `daybreakTheme.modes[mode].threadType[meta.themeToken]`.
 */
export const THREAD_TYPE_META: Record<ThreadType, ThreadTypeMeta> = {
  case: {
    icon: 'casesApp',
    themeToken: 'entity',
    label: () => i18n.translate('xpack.daybreak.thread.type.case', { defaultMessage: 'Case' }),
  },
  investigation: {
    icon: 'magnifyWithExclamation',
    themeToken: 'alert',
    label: () =>
      i18n.translate('xpack.daybreak.thread.type.investigation', {
        defaultMessage: 'Investigation',
      }),
  },
  hunt: {
    icon: 'crosshairs',
    themeToken: 'query',
    label: () => i18n.translate('xpack.daybreak.thread.type.hunt', { defaultMessage: 'Hunt' }),
  },
  incident: {
    icon: 'alert',
    themeToken: 'external',
    label: () =>
      i18n.translate('xpack.daybreak.thread.type.incident', { defaultMessage: 'Incident' }),
  },
  chat: {
    icon: 'discuss',
    themeToken: 'timeline',
    label: () => i18n.translate('xpack.daybreak.thread.type.chat', { defaultMessage: 'Chat' }),
  },
};

/** Type guard narrowing an arbitrary string to a known {@link ThreadType}. */
export const isThreadType = (value: string): value is ThreadType =>
  (THREAD_TYPES as readonly string[]).includes(value);
