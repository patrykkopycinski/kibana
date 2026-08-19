import type { Observable } from 'rxjs';
import type { UserProfileData } from '@kbn/core-user-profile-common';
import type { UserProfileService } from './service';
export type CoreUserProfileDelegateContract = Omit<UserProfileService, 'getUserProfile$' | 'getEnabled$' | 'getDataUpdates$'> & {
    userProfile$: Observable<UserProfileData | null>;
    enabled$: Observable<boolean>;
    dataUpdates$: Observable<UserProfileData>;
};
