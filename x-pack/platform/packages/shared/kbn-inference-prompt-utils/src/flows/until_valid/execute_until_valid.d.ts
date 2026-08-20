/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  type Prompt,
  type PromptOptions,
  type ToolCallbacksOfToolOptions,
  type ToolChoice,
  type ToolNamesOf,
  type ToolOptionsOfPrompt,
  type UnboundPromptOptions,
} from '@kbn/inference-common';
import type { UntilValidPromptOptions, UntilValidPromptResponseOf } from './types';
export declare function executeUntilValid<
  TPrompt extends Prompt,
  TPromptOptions extends PromptOptions<TPrompt>,
  TToolCallbacks extends ToolCallbacksOfToolOptions<ToolOptionsOfPrompt<TPrompt>>,
  TFinalToolChoice extends ToolChoice<ToolNamesOf<ToolOptionsOfPrompt<TPrompt>>> | undefined =
    | ToolChoice<ToolNamesOf<ToolOptionsOfPrompt<TPrompt>>>
    | undefined
>(
  options: UnboundPromptOptions<TPrompt> &
    UntilValidPromptOptions & {
      prompt: TPrompt;
    } & {
      toolCallbacks: TToolCallbacks;
      finalToolChoice: TFinalToolChoice;
    }
): Promise<
  UntilValidPromptResponseOf<
    TPrompt,
    TPromptOptions & {
      toolChoice: TFinalToolChoice;
    },
    TToolCallbacks
  >
>;
