/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { InferenceChatModel } from '@kbn/inference-langchain';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import {
  DEFAULT_SCRIPTED_LLM_PROVIDER,
  type VariantCandidate,
  type VariantProvider,
  type VariantProviderInput,
} from '@kbn/argus-exploit-to-detection';

/**
 * `@kbn/argus-inference-variant-provider`
 *
 * Realises the `VariantProvider` interface from
 * `@kbn/argus-exploit-to-detection` against a real `@kbn/inference` chat model.
 *
 * Why this lives in its own package:
 *
 *   The `kbn-argus-exploit-to-detection` package is intentionally
 *   dependency-free of `@kbn/inference` (see `llm_variant_provider.ts:18-44`).
 *   That keeps the synthesis logic deterministic and unit-testable. To plug a
 *   real LLM in we need a place that can import both the package and
 *   `@kbn/inference`-langchain — that is this package.
 *
 *   The decision to keep this in a small, narrow package (rather than
 *   inlining it in `security_solution/server`) is recorded in
 *   `soc-simulation/docs/autodex/rfcs/B1-synthesis-driver.md` §3.2.
 *
 * Fail-closed contract:
 *
 *   The provider WILL fall back to the deterministic
 *   `DEFAULT_SCRIPTED_LLM_PROVIDER` whenever:
 *     - the LLM returns malformed JSON,
 *     - the LLM returns the wrong number of candidates,
 *     - the LLM throws (timeout, connector error, etc.),
 *     - any candidate is missing a required string field.
 *
 *   Every fallback is logged at `warn` level with the reason. This means the
 *   synthesis pipeline keeps producing variants — they just stop being
 *   real-LLM-driven for the affected (axis, platform) pair until the next
 *   tick.
 *
 *   Callers that need to detect "LLM unhealthy" should monitor the warn-level
 *   log emissions; they should NOT rely on this provider throwing.
 */

/**
 * Token used in `provider_name` traces emitted by `generateLlmVariants` when
 * this provider produced the variants. `scripted-llm` is reserved for the
 * deterministic fallback so a single trace stream can distinguish the two.
 */
export const INFERENCE_VARIANT_PROVIDER_NAME = 'kbn-inference';

const VARIANT_PROMPT_TEMPLATE = `You are a senior detection engineer producing an attack-emulation variant for a single rule. Your goal is to help the rule's evaluator measure how brittle vs. polymorphic the rule is on this dimension.

You are given:
- An advisory describing a vulnerability or attack technique.
- A *variant axis*: the single dimension you must vary in this batch (command_args, encoding_layers, process_ancestry, timing_jitter_ms, named_pipe_vs_stdout, or living_off_land). The semantics of the attack must NOT change; only the chosen axis varies.
- A *target platform*: windows, linux, macos, or kubernetes. The variant's process and parent fields must be plausible on this platform.
- A *budget*: the exact number of variants to return.

Hard constraints (the variant validator enforces these — failing produces a rejected variant):

1. \`process_name\` MUST be one of:
   - windows: powershell.exe, pwsh.exe, cmd.exe, wscript.exe, cscript.exe, mshta.exe
   - linux: bash, sh, zsh, dash, ksh, python3, perl
   - macos: zsh, bash, sh, osascript, python3
   - kubernetes: sh, bash, busybox, kubectl
   For axis=living_off_land, you may also use: certutil.exe, bitsadmin.exe, rundll32.exe, regsvr32.exe, mshta.exe, curl, wget.

2. The \`command_line\` MUST trip the axis marker:
   - command_args: must contain a flag/argument like \`-Foo\` or \`--bar\`.
   - encoding_layers: must contain one of \`-EncodedCommand\`, \`-enc\`, \`-e\`, \`base64\`, \`| iex\`, \`FromBase64String\`.
   - process_ancestry: any command line; the parent name carries the axis (see below).
   - timing_jitter_ms: any command line.
   - named_pipe_vs_stdout: must contain a windows named pipe (\`\\\\.\\pipe\\...\`) OR a unix tcp/fd redirect (\`>/dev/tcp/\` or \`>&N\`).
   - living_off_land: must reference one of certutil.exe, bitsadmin.exe, rundll32.exe, regsvr32.exe, mshta.exe, curl, wget.

3. For axis=process_ancestry, \`parent_name\` MUST be one of: svchost.exe, wmiprvse.exe, excel.exe, winword.exe, outlook.exe, explorer.exe, sshd, launchd, containerd-shim.

4. NEVER include real C2 hostnames, .top/.xyz/.ru domains, bitcoin wallet addresses, AWS access keys, or PEM private-key blocks. Use \`example.com\` for any URL/host placeholder.

5. \`command_line\` MUST be ≤ 2048 bytes.

You MUST return EXACTLY {budget} variants. Respond ONLY with a valid JSON array (no markdown fences, no extra text). Each item must match this schema:
{{
  "process_name": "string — process binary, see allow-list above",
  "process_executable": "string — absolute path to the binary",
  "command_line": "string — the full command line that trips the axis marker",
  "parent_name": "string — parent process name (see ancestry rules for axis=process_ancestry)",
  "parent_executable": "string — absolute path to the parent",
  "rationale": "string — one short sentence explaining why this variant tests the axis"
}}

**Advisory ({advisory_id}):**
- Title: {advisory_title}
- Summary: {advisory_summary}
- Primary technique: {primary_technique}

**Axis:** {axis}
**Platform:** {platform}
**Budget:** return exactly {budget} variants
**Corpus:** {corpus_id}
**Rule id:** {rule_id}

Respond with the JSON array of {budget} variants only.`;

const variantPrompt = ChatPromptTemplate.fromTemplate(VARIANT_PROMPT_TEMPLATE);

interface RawCandidate {
  readonly process_name?: unknown;
  readonly process_executable?: unknown;
  readonly command_line?: unknown;
  readonly parent_name?: unknown;
  readonly parent_executable?: unknown;
  readonly rationale?: unknown;
}

const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/**
 * Coerce a raw LLM response item into a `VariantCandidate`. Returns `null` if
 * any required field is missing or non-string. The caller substitutes a
 * deterministic-fallback variant when this returns null for any item.
 */
const coerceCandidate = (raw: unknown): VariantCandidate | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as RawCandidate;
  if (
    !isString(r.process_name) ||
    !isString(r.process_executable) ||
    !isString(r.command_line) ||
    !isString(r.parent_name) ||
    !isString(r.parent_executable)
  ) {
    return null;
  }
  return {
    process_name: r.process_name,
    process_executable: r.process_executable,
    command_line: r.command_line,
    parent_name: r.parent_name,
    parent_executable: r.parent_executable,
    rationale: isString(r.rationale)
      ? r.rationale
      : `kbn-inference: axis=${typeof raw} fallback rationale`,
  };
};

export interface CreateInferenceVariantProviderOpts {
  readonly chatModel: InferenceChatModel;
  readonly logger: Logger;
  /**
   * Provider used when the LLM call fails or returns malformed output.
   * Defaults to `DEFAULT_SCRIPTED_LLM_PROVIDER`. Override only in tests, where
   * you usually want a stricter assertion that the LLM path was taken.
   */
  readonly fallback?: VariantProvider;
}

/**
 * Compose the per-call prompt input. Pulled out of the closure so unit tests
 * can call it directly without having to mock the LangChain `pipe()` chain.
 */
export const buildPromptInput = (input: VariantProviderInput): Record<string, string> => {
  const primary = input.advisory.mitre[0];
  return {
    advisory_id: input.advisory.advisory_id,
    advisory_title: input.advisory.title,
    advisory_summary: input.advisory.summary,
    primary_technique: primary ? `${primary.technique_id} (${primary.tactic})` : 'unknown',
    axis: input.axis,
    platform: input.platform,
    budget: String(input.budget),
    corpus_id: input.corpus_id,
    rule_id: input.rule_id,
  };
};

/**
 * Build a `VariantProvider` that calls a real `@kbn/inference` chat model.
 *
 * The returned provider is safe to share across requests — it captures the
 * chat model and logger by reference and creates a fresh prompt + parser
 * chain per `generate()` call.
 */
export const createInferenceVariantProvider = ({
  chatModel,
  logger,
  fallback = DEFAULT_SCRIPTED_LLM_PROVIDER,
}: CreateInferenceVariantProviderOpts): VariantProvider => {
  return {
    async generate(input: VariantProviderInput): Promise<readonly VariantCandidate[]> {
      const promptInput = buildPromptInput(input);

      let raw: unknown;
      try {
        const jsonParser = new JsonOutputParser<unknown>();
        const chain = variantPrompt.pipe(chatModel).pipe(jsonParser);
        raw = await chain.invoke(promptInput);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        logger.warn(
          `[argus-inference-variant-provider] LLM call failed for advisory=${input.advisory.advisory_id} axis=${input.axis} platform=${input.platform}; falling back to scripted provider. Reason: ${reason}`
        );
        return fallback.generate(input);
      }

      if (!Array.isArray(raw)) {
        logger.warn(
          `[argus-inference-variant-provider] LLM returned non-array for advisory=${
            input.advisory.advisory_id
          } axis=${input.axis} platform=${input.platform} (got ${typeof raw}); falling back.`
        );
        return fallback.generate(input);
      }

      if (raw.length !== input.budget) {
        logger.warn(
          `[argus-inference-variant-provider] LLM returned ${raw.length} variants, expected ${input.budget} for advisory=${input.advisory.advisory_id} axis=${input.axis} platform=${input.platform}; falling back.`
        );
        return fallback.generate(input);
      }

      const coerced: VariantCandidate[] = [];
      const fallbackPool: VariantCandidate[] = [];
      for (let i = 0; i < raw.length; i++) {
        const candidate = coerceCandidate(raw[i]);
        if (candidate === null) {
          if (fallbackPool.length === 0) {
            // Lazy-load fallback variants only when we need them — keeps the
            // fast path free of an extra await.
            const fallbackVariants = await fallback.generate(input);
            fallbackPool.push(...fallbackVariants);
          }
          logger.warn(
            `[argus-inference-variant-provider] LLM variant ${i} for advisory=${input.advisory.advisory_id} axis=${input.axis} platform=${input.platform} was malformed; substituting scripted fallback for this slot.`
          );
          coerced.push(fallbackPool[i] ?? fallbackPool[0]);
        } else {
          coerced.push(candidate);
        }
      }

      return coerced;
    },
  };
};
