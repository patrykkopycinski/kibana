/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ArgusKillSwitchResponse, ArgusKillSwitchState } from '../types/kill_switch';

export interface RawKillSwitchDoc {
  readonly autonomy_enabled?: unknown;
  readonly reason?: unknown;
  readonly set_by?: unknown;
  readonly previous_state?: unknown;
  readonly scope?: unknown;
  readonly artifact_type?: unknown;
  readonly '@timestamp'?: unknown;
}

export interface BuildKillSwitchArgs {
  /**
   * The raw `_source` of `/.soc-kill-switch/_doc/global`. Pass `undefined`
   * when the doc is missing (404) — the builder will emit the default
   * "bootstrap" state so the UI can render something instead of an error.
   */
  readonly source?: RawKillSwitchDoc;
}

export const buildKillSwitchState = ({ source }: BuildKillSwitchArgs): ArgusKillSwitchResponse => {
  if (!source) {
    return {
      state: { autonomy_enabled: true },
      bootstrap: true,
    };
  }

  const enabled = readBool(source.autonomy_enabled);
  const state: ArgusKillSwitchState = {
    // When the field is malformed we ERR ON THE SIDE OF CAUTION and treat
    // autonomy as DISABLED — unrecoverable kill-switch state should never
    // default to "letting things run".
    autonomy_enabled: enabled === undefined ? false : enabled,
    reason: readString(source.reason),
    set_by: readString(source.set_by),
    previous_state: readBool(source.previous_state),
    scope: readString(source.scope),
    artifact_type: readString(source.artifact_type),
    timestamp: readString(source['@timestamp']),
  };

  return { state, bootstrap: false };
};

const readString = (value: unknown): string | undefined => {
  if (value == null) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
};

const readBool = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase();
    if (s === 'true') return true;
    if (s === 'false') return false;
  }
  return undefined;
};
