import type { ToolingLog } from '@kbn/tooling-log';
import { KbnClientImportExport } from './kbn_client_import_export';
import { KbnClientPlugins } from './kbn_client_plugins';
import type { ReqOptions } from './kbn_client_requester';
import { KbnClientSavedObjects } from './kbn_client_saved_objects';
import { KbnClientSpaces } from './kbn_client_spaces';
import { KbnClientStatus } from './kbn_client_status';
import type { UiSettingValues } from './kbn_client_ui_settings';
import { KbnClientUiSettings } from './kbn_client_ui_settings';
import { KbnClientVersion } from './kbn_client_version';
export interface KbnClientOptions {
    url: string;
    certificateAuthorities?: Buffer[];
    log: ToolingLog;
    uiSettingDefaults?: UiSettingValues;
    importExportBaseDir?: string;
}
export declare class KbnClient {
    readonly status: KbnClientStatus;
    readonly plugins: KbnClientPlugins;
    readonly version: KbnClientVersion;
    readonly savedObjects: KbnClientSavedObjects;
    readonly spaces: KbnClientSpaces;
    readonly uiSettings: KbnClientUiSettings;
    readonly importExport: KbnClientImportExport;
    private readonly requester;
    private readonly log;
    private readonly uiSettingDefaults?;
    /**
     * Basic Kibana server client that implements common behaviors for talking
     * to the Kibana server from dev tooling.
     */
    constructor(options: KbnClientOptions);
    /**
     * Make a direct request to the Kibana server
     */
    request<T>(options: ReqOptions): Promise<import("@kbn/test").KbnClientResponse<T>>;
    resolveUrl(relativeUrl: string): string;
}
