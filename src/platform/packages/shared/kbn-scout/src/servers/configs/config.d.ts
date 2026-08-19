import type { ScoutServerConfig, ScoutTestConfig } from '../../types';
declare const $values: unique symbol;
export declare class Config {
    private [$values];
    constructor(data: ScoutServerConfig);
    has(key: string | string[]): boolean;
    get(key: string | string[], defaultValue?: any): any;
    getAll(): any;
    getScoutTestConfig(): ScoutTestConfig;
}
export {};
