/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { REPO_ROOT } from '@kbn/repo-info';

/**
 * Direct client for TypeSafe's System One API, used to evaluate Jev before EIS serves it.
 *
 * - Off unless `JEV_ENABLED=1` and `JEV_ENABLED_PATHS` lists the calling path. Every call
 *   re-checks, so a spec that forgets to check still cannot send anything.
 * - One request per record carrying every question for it.
 * - Every call writes its payload, response and a meta file to `JEV_CAPTURE_DIR`, which must
 *   be outside the repository. The meta file records a key fingerprint, never the key.
 * - The transport is injectable so tests prove a disabled run makes zero requests.
 */

export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const JEV_PINNED_MODEL = 'jev-1.13.0';
export const MAX_JEV_CONCURRENCY = 8;

export type JevQuestion =
  | { type: 'noul'; instructions: string; criteria?: { true?: string; false?: string } }
  | { type: 'choice'; instructions: string; criteria: Record<string, string | null> }
  | { type: 'score'; instructions: string; criteria: string[] };

export type JevAnswer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> }
  | {
      type: 'score';
      score: number;
      confidence: number;
      probabilities: Record<string, number>;
    };

export interface JevResult {
  model: string;
  answers: Record<string, JevAnswer>;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  attempts: number;
  requestId?: string;
}

export interface TransportResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}

export interface JevTransport {
  post(url: string, body: string, headers: Record<string, string>): Promise<TransportResponse>;
}

/** `disabled`: refused before any request. `auth`: the credential was rejected (never retried). */
export type JevErrorCode = 'disabled' | 'auth';

export class JevError extends Error {
  constructor(public readonly code: JevErrorCode, message: string) {
    super(message);
    this.name = 'JevError';
  }
}

export const fetchTransport: JevTransport = {
  async post(url, body, headers) {
    const response = await fetch(url, {
      method: 'POST',
      body,
      headers,
      signal: AbortSignal.timeout(60_000),
    });
    return {
      status: response.status,
      body: await response.text(),
      headers: Object.fromEntries(response.headers.entries()),
    };
  },
};

/**
 * Transport for the Elasticsearch `decision` inference task, the production route the plugin
 * uses (`POST /_inference/decision/<id>`, questions as `task_settings.questions`). The caller
 * supplies the auth header, so the credential never appears in this file or in captures.
 *
 * The direct API and ES task use different wire formats for the same model. Questions are
 * translated noul->predicate (folding `criteria` into the instructions, which the ES shape
 * does not carry), choice `criteria`->`choices`. Answers are translated back predicate->noul
 * and the ES probability lists (keyed by `value` for choices, `label` for score levels) are
 * re-keyed into records. The captured `body.json` keeps the original ES body under
 * `source_body` so the production wire format stays inspectable.
 */
export const createEisTransport = ({
  url,
  inferenceId,
  authHeaders,
}: {
  url: string;
  inferenceId: string;
  authHeaders: Record<string, string>;
}): JevTransport => {
  const toEsQuestion = (question: JevQuestion): Record<string, unknown> => {
    switch (question.type) {
      case 'noul': {
        const criteria = question.criteria
          ? [
              question.criteria.true && `Answer true when: ${question.criteria.true}`,
              question.criteria.false && `Answer false when: ${question.criteria.false}`,
            ]
              .filter((line): line is string => Boolean(line))
              .join(' ')
          : '';
        return {
          type: 'predicate',
          instructions: `${question.instructions}${criteria ? ` ${criteria}` : ''}`,
        };
      }
      case 'choice':
        return {
          type: 'choice',
          instructions: question.instructions,
          choices: Object.fromEntries(
            Object.entries(question.criteria).map(([value, description]) => [
              value,
              description ?? '',
            ])
          ),
        };
      case 'score':
        return {
          type: 'score',
          instructions: question.instructions,
          levels: question.criteria.map((label) => ({ label })),
        };
    }
  };

  const toJevAnswer = (raw: unknown): JevAnswer => {
    const answer = raw as {
      type?: string;
      probability?: number;
      choice?: string;
      score?: number;
      confidence?: number;
      probabilities?: Array<{ value?: unknown; label?: unknown; probability: number }>;
    };
    switch (answer.type) {
      case 'predicate':
        return { type: 'noul', noul: answer.probability as number };
      case 'choice':
        return {
          type: 'choice',
          choice: answer.choice as string,
          confidence: answer.confidence as number,
          probabilities: Object.fromEntries(
            (answer.probabilities ?? []).map(({ value, probability }) => [
              String(value),
              probability,
            ])
          ),
        };
      case 'score':
        return {
          type: 'score',
          score: answer.score as number,
          confidence: answer.confidence as number,
          probabilities: Object.fromEntries(
            (answer.probabilities ?? []).map(({ label, probability }) => [
              String(label),
              probability,
            ])
          ),
        };
      default:
        throw new Error(`EIS decision answer has unknown type [${String(answer.type)}]`);
    }
  };

  return {
    async post(_directUrl, body, headers) {
      const {
        model: _model,
        state,
        questions,
      } = JSON.parse(body) as {
        model: string;
        state: string;
        questions: Record<string, JevQuestion>;
      };
      const response = await fetch(
        `${url}/_inference/decision/${encodeURIComponent(inferenceId)}`,
        {
          method: 'POST',
          body: JSON.stringify({
            input: state,
            task_settings: {
              questions: Object.fromEntries(
                Object.entries(questions).map(([name, q]) => [name, toEsQuestion(q)])
              ),
            },
          }),
          headers: { ...headers, ...authHeaders },
          signal: AbortSignal.timeout(60_000),
        }
      );
      const raw = await response.text();
      let out = raw;
      if (response.status === 200) {
        const parsed = JSON.parse(raw) as { decision?: { answers?: Record<string, unknown> } };
        out = JSON.stringify({
          model: inferenceId,
          answers: Object.fromEntries(
            Object.entries(parsed.decision?.answers ?? {}).map(([name, answer]) => [
              name,
              toJevAnswer(answer),
            ])
          ),
          usage: { input_tokens: 0, output_tokens: 0 },
          source_body: parsed,
        });
      }
      return {
        status: response.status,
        body: out,
        headers: Object.fromEntries(response.headers.entries()),
      };
    },
  };
};

export const keyFingerprint = (key: string): string =>
  key ? createHash('sha256').update(key).digest('hex').slice(0, 12) : 'none';

export const jevState = (
  pathId: string,
  env: NodeJS.ProcessEnv = process.env
): { enabled: boolean; reason: string } => {
  if (env.JEV_ENABLED !== '1') {
    return { enabled: false, reason: 'JEV_ENABLED is not 1' };
  }
  const allowed = (env.JEV_ENABLED_PATHS ?? '')
    .split(',')
    .map((id) => id.trim().toUpperCase())
    .filter(Boolean);
  if (!allowed.includes(pathId.toUpperCase())) {
    return { enabled: false, reason: `path ${pathId} is not in JEV_ENABLED_PATHS` };
  }
  return { enabled: true, reason: `enabled for ${pathId}` };
};

const isInside = (child: string, parent: string): boolean => {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

export const resolveCaptureDir = (env: NodeJS.ProcessEnv = process.env, repoRoot = REPO_ROOT) => {
  const dir = env.JEV_CAPTURE_DIR;
  if (!dir) {
    throw new JevError(
      'disabled',
      'JEV_CAPTURE_DIR is not set; refusing to call Jev without captures'
    );
  }
  const resolved = path.resolve(dir);
  if (isInside(resolved, path.resolve(repoRoot))) {
    throw new JevError('disabled', `JEV_CAPTURE_DIR (${resolved}) must be outside the repository`);
  }
  return resolved;
};

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504, 529]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseAnswers = (
  questions: Record<string, JevQuestion>,
  raw: Record<string, Partial<JevAnswer> & { type?: string }>
): Record<string, JevAnswer> =>
  Object.fromEntries(
    Object.entries(questions).map(([name, question]) => {
      const answer = raw[name] as Record<string, unknown> | undefined;
      if (!answer) throw new Error(`Jev response has no answer for [${name}]`);
      if (answer.type !== question.type) {
        throw new Error(`Jev answer [${name}] is [${answer.type}], expected [${question.type}]`);
      }
      const value =
        question.type === 'noul'
          ? answer.noul
          : question.type === 'choice'
          ? answer.choice
          : answer.score;
      if (value === undefined || value === null) {
        throw new Error(`Jev answer [${name}] has no [${question.type}] value`);
      }
      return [name, answer as unknown as JevAnswer];
    })
  );

export interface JevClientOptions {
  pathId: string;
  transport?: JevTransport;
  env?: NodeJS.ProcessEnv;
  model?: string;
  maxAttempts?: number;
  backoffMs?: number;
  repoRoot?: string;
}

export const createJevClient = ({
  pathId,
  transport = fetchTransport,
  env = process.env,
  model = JEV_PINNED_MODEL,
  maxAttempts = 4,
  backoffMs = 1000,
  repoRoot = REPO_ROOT,
}: JevClientOptions) => {
  let active = 0;
  const waiting: Array<() => void> = [];
  const acquire = async () => {
    if (active >= MAX_JEV_CONCURRENCY) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    active++;
  };
  const release = () => {
    active--;
    waiting.shift()?.();
  };

  const capture = (dir: string, label: string, files: Record<string, string>) => {
    fs.mkdirSync(dir, { recursive: true });
    const safe = label.replace(/[^a-zA-Z0-9._-]/g, '_');
    for (const [suffix, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, `${safe}.${suffix}`), content);
    }
  };

  const ask = async (
    state: string,
    questions: Record<string, JevQuestion>,
    label: string
  ): Promise<JevResult> => {
    const { enabled, reason } = jevState(pathId, env);
    if (!enabled) throw new JevError('disabled', `Jev is off (${reason}); no request made`);
    const captureDir = resolveCaptureDir(env, repoRoot);
    const key = env.TYPESAFE_API_KEY ?? '';
    // A custom transport owns its own auth (e.g. the EIS route); only the direct API needs
    // the TypeSafe credential, and an accidental direct run without it must fail closed.
    if (!key && transport === fetchTransport) {
      throw new JevError('disabled', 'TYPESAFE_API_KEY is not set; no request made');
    }

    const payload = JSON.stringify({ model, state, questions });
    await acquire();
    try {
      let attempts = 0;
      let response: TransportResponse | undefined;
      let latencyMs = 0;
      while (attempts < maxAttempts) {
        attempts++;
        const started = performance.now();
        const directHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        if (key) directHeaders.Authorization = `Bearer ${key}`;
        response = await transport.post(JEV_ENDPOINT, payload, directHeaders);
        latencyMs = performance.now() - started;
        if (!RETRYABLE.has(response.status) || attempts === maxAttempts) break;
        const retryAfter = Number(response.headers['retry-after']);
        await sleep(
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : backoffMs * 2 ** (attempts - 1)
        );
      }
      if (!response) throw new Error('Jev transport returned nothing');

      const requestId =
        response.headers['x-typesafe-request-id'] ?? response.headers['x-request-id'];
      capture(captureDir, `${pathId}-${label}`, {
        'payload.json': payload,
        'body.json': response.body,
        'meta.json': JSON.stringify(
          {
            pathId,
            label,
            status: response.status,
            attempts,
            latencyMs: Math.round(latencyMs),
            requestId,
            requestedModel: model,
            keyPresent: Boolean(key),
            keyLength: key.length,
            keyFingerprint: key ? keyFingerprint(key) : 'none',
            capturedAt: new Date().toISOString(),
          },
          null,
          2
        ),
      });

      if (response.status === 401 || response.status === 403) {
        throw new JevError('auth', `Jev rejected the credential (${response.status})`);
      }
      if (response.status !== 200) {
        throw new Error(
          `Jev request failed with ${response.status}: ${response.body.slice(0, 300)}`
        );
      }
      const body = JSON.parse(response.body);
      return {
        model: body.model,
        answers: parseAnswers(questions, body.answers ?? {}),
        inputTokens: body.usage?.input_tokens ?? 0,
        outputTokens: body.usage?.output_tokens ?? 0,
        latencyMs,
        attempts,
        requestId,
      };
    } finally {
      release();
    }
  };

  return { ask, pathId, model };
};

export type JevClient = ReturnType<typeof createJevClient>;

/** List price, USD per million input tokens; output tokens are free. */
export const JEV_INPUT_USD_PER_MTOK = 0.042;
export const jevCostUsd = (inputTokens: number): number =>
  (inputTokens / 1_000_000) * JEV_INPUT_USD_PER_MTOK;
