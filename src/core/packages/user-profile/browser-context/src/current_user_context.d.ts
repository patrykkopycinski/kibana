import type { CoreAuthenticationService } from '@kbn/core-security-browser';
import type { UserProfileService } from '@kbn/core-user-profile-browser';
export interface CurrentUserServices {
    /** Core's authentication service, i.e. `coreStart.security.authc`. */
    authc: CoreAuthenticationService;
    /**
     * The subset of `coreStart.userProfile` the current-user hook relies on: `getCurrent` to fetch
     * the profile and `getDataUpdates$` to re-fetch when it changes.
     */
    userProfile: Pick<UserProfileService, 'getCurrent' | 'getDataUpdates$'>;
}
export declare const CurrentUserContext: import("react").Context<CurrentUserServices | null>;
