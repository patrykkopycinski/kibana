import type { SidebarSetup, SidebarStart } from '@kbn/core-chrome-sidebar';
import type { SidebarRegistryService } from './sidebar_registry_service';
import type { SidebarStateService } from './sidebar_state_service';
/** Composite service for sidebar: registry, UI state, and app state */
export declare class SidebarService {
    readonly registry: SidebarRegistryService;
    readonly state: SidebarStateService;
    private readonly storage;
    constructor(params: {
        basePath: string;
    });
    setup(): SidebarSetup;
    start(): SidebarStart;
    stop(): void;
    private getApp;
}
