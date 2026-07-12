/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Id of the minimal Agent Builder agent used by the daybreak alert-analysis
 * worker Reason phase (ai.agent step). The agent is scoped to the
 * daybreak-alert-analysis skill and created at stack setup time via the
 * Kibana Agent Builder API.
 */
export const ALERT_ANALYSIS_AGENT_ID = 'daybreak-alert-analysis-agent';
