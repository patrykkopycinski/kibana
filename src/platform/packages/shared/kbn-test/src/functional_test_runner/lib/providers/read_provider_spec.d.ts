export type ProviderConstructor = new (...args: any[]) => any;
export type ProviderFactory = (...args: any[]) => any;
export declare function isProviderConstructor(x: unknown): x is ProviderConstructor;
export type ProviderFn = ProviderConstructor | ProviderFactory;
export type Providers = ReturnType<typeof readProviderSpec>;
export type Provider = Providers extends Array<infer X> ? X : unknown;
export declare function readProviderSpec(type: string, providers: Record<string, ProviderFn>): {
    type: string;
    name: string;
    fn: ProviderFn;
}[];
