/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  DispatchRequest,
  DispatchResult,
  MutationIntentSummary,
  SkillDispatcher,
} from './types';

export interface RestSkillDispatcherConfig {
  readonly kibana_url: string;
  readonly kibana_auth_header: string;
  readonly es_url: string;
  readonly es_auth_header: string;
  readonly fetchImpl?: typeof fetch;
}

/**
 * v1 REST dispatcher — wires an MCP/A2A skill call into the Kibana Agent
 * Builder `converse` endpoint, then writes the resulting recommendation to
 * `.soc-recommendations` so the `soc-argus-trust-gate` workflow can pick it
 * up on its next 2m tick.
 *
 * The Agent Builder endpoint already emits to `.soc-reasoning-trace` with
 * the OTEL GenAI-1.x vocabulary (R9), so we don't need to emit a second
 * top-level span from here — we just carry the returned trace_id through
 * to the caller's `DispatchResult.trace.reasoning_trace_id`.
 *
 * Kept deliberately thin: every failure raises and the core translates it
 * into an `isError: true` MCP response.
 */
export class RestSkillDispatcher implements SkillDispatcher {
  private readonly cfg: RestSkillDispatcherConfig;
  private readonly http: typeof fetch;

  constructor(cfg: RestSkillDispatcherConfig) {
    this.cfg = cfg;
    this.http = cfg.fetchImpl ?? fetch;
  }

  async dispatch(req: DispatchRequest): Promise<DispatchResult> {
    const converseResponse = await this.runSkill(req);
    const intents = await this.persistMutationIntents(req, converseResponse);
    return {
      skill_id: req.skill.id,
      summary: converseResponse.summary,
      structured_output: converseResponse.structured_output,
      trace: {
        reasoning_trace_id: converseResponse.reasoning_trace_id,
        gen_ai_operation: `argus.skill.${req.skill.id}`,
      },
      mutation_intents: intents,
    };
  }

  private async runSkill(req: DispatchRequest): Promise<RunSkillHttpResponse> {
    const url = `${this.cfg.kibana_url.replace(/\/$/, '')}/internal/agent_builder/converse`;
    const body = {
      connector_id: 'argus-default',
      agent_id: req.skill.id,
      input: {
        task: req.task,
        scope: req.scope,
        propose_only: req.propose_only,
        correlation_id: req.correlation_id,
      },
      metadata: {
        actor_id: `${req.principal.protocol}:${req.principal.client_id}`,
        profile: req.principal.profile,
        propose_only: req.propose_only,
        correlation_id: req.correlation_id,
      },
    };

    const res = await this.http(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'kbn-xsrf': 'argus-mcp',
        authorization: this.cfg.kibana_auth_header,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await safeText(res);
      throw new Error(
        `argus-mcp: kibana converse returned ${res.status} ${res.statusText}: ${text}`
      );
    }
    const raw = (await res.json()) as unknown;
    return parseRunSkillResponse(raw, req.skill.id);
  }

  private async persistMutationIntents(
    req: DispatchRequest,
    response: RunSkillHttpResponse
  ): Promise<readonly MutationIntentSummary[]> {
    if (response.mutation_intents.length === 0) return [];

    const actorId = `${req.principal.protocol}:${req.principal.client_id}`;
    const url = `${this.cfg.es_url.replace(/\/$/, '')}/.soc-recommendations/_bulk`;
    const lines: string[] = [];
    const summaries: MutationIntentSummary[] = [];

    for (const intent of response.mutation_intents) {
      const intentId = intent.intent_id ?? `${req.correlation_id}-${summaries.length}`;
      const status = req.propose_only ? 'pending_review' : intent.status ?? 'proposed';
      lines.push(JSON.stringify({ index: { _id: intentId } }));
      lines.push(
        JSON.stringify({
          '@timestamp': new Date().toISOString(),
          source: actorId,
          correlation_id: req.correlation_id,
          reasoning_trace_id: response.reasoning_trace_id,
          argus: {
            decision: {
              door_class: intent.door_class ?? 'two_way',
            },
          },
          expected_impact: {
            blast_tier: intent.blast_tier ?? 'small',
          },
          details: intent.details,
          status,
        })
      );
      summaries.push({
        intent_id: intentId,
        door_class: intent.door_class ?? 'two_way',
        blast_tier: intent.blast_tier ?? 'small',
        status,
      });
    }

    const res = await this.http(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-ndjson',
        authorization: this.cfg.es_auth_header,
      },
      body: `${lines.join('\n')}\n`,
    });
    if (!res.ok) {
      const text = await safeText(res);
      throw new Error(
        `argus-mcp: .soc-recommendations bulk returned ${res.status} ${res.statusText}: ${text}`
      );
    }
    return summaries;
  }
}

interface RunSkillHttpResponse {
  readonly summary: string;
  readonly structured_output: Record<string, unknown>;
  readonly reasoning_trace_id: string;
  readonly mutation_intents: ReadonlyArray<{
    intent_id?: string;
    door_class?: 'one_way' | 'two_way';
    blast_tier?: 'small' | 'medium' | 'large' | 'critical';
    status?: MutationIntentSummary['status'];
    details: Record<string, unknown>;
  }>;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

const parseRunSkillResponse = (raw: unknown, skillId: string): RunSkillHttpResponse => {
  if (!isObj(raw)) throw new Error(`argus-mcp: skill ${skillId} returned non-object response`);
  const summary = typeof raw.summary === 'string' ? raw.summary : '';
  const structured = isObj(raw.structured_output) ? raw.structured_output : {};
  const traceId =
    typeof raw.reasoning_trace_id === 'string' && raw.reasoning_trace_id.length > 0
      ? raw.reasoning_trace_id
      : 'unknown-trace';
  const intentsRaw = Array.isArray(raw.mutation_intents) ? raw.mutation_intents : [];
  const intents = intentsRaw.filter(isObj).map((i) => ({
    intent_id: typeof i.intent_id === 'string' ? i.intent_id : undefined,
    door_class: i.door_class === 'one_way' || i.door_class === 'two_way' ? i.door_class : undefined,
    blast_tier:
      i.blast_tier === 'small' ||
      i.blast_tier === 'medium' ||
      i.blast_tier === 'large' ||
      i.blast_tier === 'critical'
        ? i.blast_tier
        : undefined,
    status:
      i.status === 'proposed' ||
      i.status === 'auto_apply_ready' ||
      i.status === 'pending_review' ||
      i.status === 'applied' ||
      i.status === 'rejected'
        ? i.status
        : undefined,
    details: isObj(i.details) ? i.details : {},
  }));
  return {
    summary,
    structured_output: structured,
    reasoning_trace_id: traceId,
    mutation_intents: intents,
  };
};

const safeText = async (res: Response): Promise<string> => {
  try {
    const t = await res.text();
    return t.slice(0, 512);
  } catch {
    return '';
  }
};
