export type { CodeOwnersEntry } from './src/code_owners';
export * as cli from './src/cli';
export { getCodeOwnersEntries, findCodeOwnersEntryForPath, getOwningTeamsForPath, } from './src/code_owners';
export { type CodeOwnerArea, CODE_OWNER_AREAS, getCodeOwnerAreaMappings, findAreaForCodeOwner, } from './src/code_owner_areas';
export { type Team, TEAMS_FILE, getTeams, getTeamById, getTeamByGithubHandle } from './src/teams';
