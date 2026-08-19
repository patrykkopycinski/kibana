import type { UiSettingValues } from '@kbn/kbn-client';
export interface UiSettingsFixture {
    /**
     * Applies one or more UI settings
     * @param values (UiSettingValues): An object containing key-value pairs of UI settings to apply.
     * @returns A Promise that resolves once the settings are applied.
     */
    set: (values: UiSettingValues) => Promise<void>;
    /**
     * Resets specific UI settings to their default values.
     * @param values A list of UI setting keys to unset.
     * @returns A Promise that resolves after the settings are unset.
     */
    unset: (...values: string[]) => Promise<any>;
    /**
     * Sets the default time range for Kibana.
     * @from The start time of the default time range.
     * @to The end time of the default time range.
     * @returns A Promise that resolves once the default time is set.
     */
    setDefaultTime: ({ from, to }: {
        from: string;
        to: string;
    }) => Promise<void>;
    /**
     * Sets the Kibana timezone to UTC.
     */
    setKibanaTimeZoneToUTC: () => Promise<void>;
    /**
     * Resets the Kibana timezone to its default value.
     */
    resetKibanaTimeZone: () => Promise<void>;
}
export { uiSettingsFixture } from './single_thread';
