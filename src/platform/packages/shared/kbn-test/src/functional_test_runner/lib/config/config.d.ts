import type { ConfigModule } from './config_loading';
declare const $values: unique symbol;
interface Options {
    settings?: Record<string, any>;
    primary?: boolean;
    path: string;
    module: ConfigModule;
}
export declare class Config {
    readonly path: string;
    readonly module: ConfigModule;
    private [$values];
    constructor(options: Options);
    has(key: string | string[]): boolean;
    get(key: string | string[], defaultValue?: any): any;
    getAll(): any;
}
export {};
