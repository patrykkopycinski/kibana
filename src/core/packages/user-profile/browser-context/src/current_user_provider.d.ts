import type { FC, PropsWithChildren } from 'react';
import type { CurrentUserServices } from './current_user_context';
export type CurrentUserProviderProps = CurrentUserServices;
/**
 * Supplies the Core services that `useCurrentUser` hook needs.
 *
 * Network requests are deduped by the underlying client caches, so no shared store is required.
 */
export declare const CurrentUserProvider: FC<PropsWithChildren<CurrentUserProviderProps>>;
