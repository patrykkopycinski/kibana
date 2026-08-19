declare class EsTestConfig {
    getVersion(): string;
    getPort(): number;
    getUrl(): string;
    getBuildFrom(): string;
    getESServerlessImage(): string | undefined;
    getTransportPort(): string;
    getUrlParts(): {
        protocol: string | undefined;
        hostname: string | null;
        port: number;
        username: string | undefined;
        password: string | undefined;
        auth: string | null;
    };
}
export declare const esTestConfig: EsTestConfig;
export {};
