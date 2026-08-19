import type { Capabilities } from '@kbn/core-capabilities-common';
import type { IBasePath } from '@kbn/core-http-browser';
import type { MountPoint } from '@kbn/core-mount-utils-browser';
export declare function useBasePath(): IBasePath;
export declare function useCapabilities(): Capabilities;
/**
 * True when the current user can access the Integrations app.
 * Same signal used by Home and NoDataCard (`capabilities.navLinks.integrations`).
 */
export declare function useCanAccessIntegrations(): boolean;
export declare function useLegacyActionMenu(): MountPoint | undefined;
export declare function useHasLegacyActionMenu(): boolean;
