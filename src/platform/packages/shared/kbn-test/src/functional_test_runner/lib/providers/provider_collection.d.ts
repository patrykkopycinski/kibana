import type { ToolingLog } from '@kbn/tooling-log';
import type { Providers, ProviderFn } from './read_provider_spec';
export declare class ProviderCollection {
    private readonly log;
    private readonly providers;
    static callProviderFn(providerFn: ProviderFn, ctx: any): any;
    private readonly instances;
    constructor(log: ToolingLog, providers: Providers);
    getService: (name: string) => void | Promise<void>;
    hasService: (name: string) => boolean;
    getPageObject: (name: string) => void | Promise<void>;
    getPageObjects: (names: string[]) => Record<string, any>;
    loadExternalService(name: string, provider: (...args: any) => any): void | Promise<void>;
    loadAll(): Promise<void>;
    invokeProviderFn(provider: ProviderFn): any;
    private findProvider;
    private getProvider;
    private getInstance;
}
