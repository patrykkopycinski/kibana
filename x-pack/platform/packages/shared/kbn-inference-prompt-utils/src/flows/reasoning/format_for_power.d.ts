/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { type Message, type ToolOptions } from '@kbn/inference-common';
import type { ReasoningPower } from './types';
/**
 * Formats a request for the LLM by:
 * - removing all system tool calls & responses, except the last if it is a system tool
 * - Replacing `reason` tool calls and responses with `next` if power == 'low'
 * - injecting the amount of stepsLeft in the last tool response
 */
export declare function formatMessages<TMessage extends Message>({}: {
  messages: TMessage[];
  power: ReasoningPower;
  stepsLeft: number;
}): TMessage[];
export declare function formatToolOptions<TToolOptions extends ToolOptions>(
  toolOptions: TToolOptions,
  power: ReasoningPower
): TToolOptions;
