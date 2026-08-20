import type { CodeOwnerArea } from './code_owner_areas';
/** Path to the canonical public team registry. */
export declare const TEAMS_FILE: string;
/**
 * Public identity of a Kibana contributing team.
 *
 * This is the public-only view of a team.
 */
export interface Team {
    /** Stable, unique identifier used to join with private team overlays. */
    id: string;
    /** Human-readable team name. */
    name: string;
    /**
     * Kibana solution/area(s) this team belongs to, when applicable.
     *
     * A team can belong to more than one area).
     */
    areas?: readonly CodeOwnerArea[];
    /** Optional longer description of the team. */
    description?: string;
    github: {
        /** GitHub team handle, e.g. `elastic/kibana-core`. */
        team?: string;
        /** GitHub issue label used to route work to this team. */
        label?: string;
    };
    /** Free-form list of areas this team is responsible for. */
    responsibilities?: readonly string[];
}
/**
 * Get the full list of teams from the public registry.
 *
 * The registry is read from disk once and memoized.
 */
export declare function getTeams(): readonly Team[];
/**
 * Find a team by its unique {@link Team.id}.
 *
 * @param id Team id to look up
 * @returns The matching team, or `undefined` if no team has the given id
 */
export declare function getTeamById(id: string): Team | undefined;
/**
 * Find a team by its GitHub team handle.
 *
 * A leading `@` is ignored, so both `@elastic/kibana-core` and
 * `elastic/kibana-core` resolve to the same team.
 *
 * @param handle GitHub team handle to look up
 * @returns The matching team, or `undefined` if no team has the given handle
 */
export declare function getTeamByGithubHandle(handle: string): Team | undefined;
