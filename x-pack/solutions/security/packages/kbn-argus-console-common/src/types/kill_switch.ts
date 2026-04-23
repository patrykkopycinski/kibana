/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Shape of the singleton `.soc-kill-switch/_doc/global` document. The
 * autonomous-applier reads this on every apply and refuses to mutate when
 * `autonomy_enabled` is `false`.
 *
 * This interface is intentionally strict about `autonomy_enabled` being a
 * boolean — the GET route coerces whatever it reads from ES so downstream
 * code never has to second-guess the type.
 */
export interface ArgusKillSwitchState {
  readonly autonomy_enabled: boolean;
  readonly reason?: string;
  readonly set_by?: string;
  readonly previous_state?: boolean;
  readonly scope?: string;
  readonly artifact_type?: string;
  readonly timestamp?: string;
}

export interface ArgusKillSwitchResponse {
  readonly state: ArgusKillSwitchState;
  /**
   * True when no document exists at `/_doc/global` yet. The UI treats this as
   * "autonomy enabled by default" (matching the bootstrap seed doc) but
   * surfaces a warning badge so operators know the cluster was never
   * initialised.
   */
  readonly bootstrap: boolean;
}

/**
 * Payload the console POSTs to toggle the kill-switch. `reason` is required
 * whenever `autonomy_enabled` goes from `true` to `false` — an audit trail
 * with no justification is worse than no audit trail at all.
 */
export interface ArgusKillSwitchToggleRequest {
  readonly autonomy_enabled: boolean;
  readonly reason?: string;
  readonly scope?: string;
  readonly artifact_type?: string;
}

export interface ArgusKillSwitchToggleResponse {
  readonly state: ArgusKillSwitchState;
  readonly audit_id: string;
  readonly bootstrap?: boolean;
}
