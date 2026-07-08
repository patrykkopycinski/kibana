/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// ---------------------------------------------------------------------------
// Plugin lifecycle contracts
// ---------------------------------------------------------------------------

/** Setup contract exposed to other plugins by the Daybreak plugin. */
export type DaybreakPluginSetup = Record<string, never>;

/** Start contract exposed to other plugins by the Daybreak plugin. */
export type DaybreakPluginStart = Record<string, never>;
