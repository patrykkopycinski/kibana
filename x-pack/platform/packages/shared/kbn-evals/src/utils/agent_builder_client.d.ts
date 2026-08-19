import type { HttpHandler } from '@kbn/core/public';
import type { ToolingLog } from '@kbn/tooling-log';
export interface ConverseStep {
    type?: string;
    tool_id?: string;
    tool_call_id?: string;
    params?: Record<string, unknown>;
    results?: unknown[];
    [k: string]: unknown;
}
export interface AgentBuilderConverseParams {
    /** Agent Builder agent id to invoke. */
    agentId: string;
    /**
     * The user message sent to the agent. Required when {@link promptResponses}
     * is not provided; ignored when answering pending prompts.
     */
    input?: string;
    /** Continue an existing conversation. */
    conversationId?: string;
    /**
     * Answers to prompts the agent is currently awaiting (e.g. `ask_user_question`),
     * keyed by prompt id. When provided the request answers those pending prompts
     * instead of sending a new free-text message via {@link input}.
     */
    promptResponses?: Record<string, unknown>;
}
export interface AgentBuilderClientResponse {
    /** The agent's final assistant message text. */
    message: string;
    /** Per-round trace of tool calls / results. */
    steps: ConverseStep[];
    /** Populated only when the agent ran with a schema; otherwise undefined on the public converse API. */
    structuredOutput?: unknown;
    conversationId?: string;
    traceId?: string;
    /**
     * Structured prompts the agent asked the user to answer (e.g. `ask_user_question`
     * or `confirmation`). Empty when the agent did not ask any prompts.
     */
    prompts: unknown[];
}
export interface AgentBuilderClient {
    converse(params: AgentBuilderConverseParams): Promise<AgentBuilderClientResponse>;
    /**
     * Loads a persisted conversation by id. Useful for evaluators that need the
     * authoritative transcript (rounds, attachments) rather than a harness-
     * synthesized message list.
     */
    getConversation<T = unknown>(conversationId: string): Promise<T>;
}
export declare function createAgentBuilderClient({ fetch, log, connectorId, }: {
    fetch: HttpHandler;
    log: ToolingLog;
    connectorId: string;
}): AgentBuilderClient;
