export interface UrlParts {
    protocol?: string;
    hostname?: string;
    port?: number;
    auth?: string;
    username?: string;
    password?: string;
}
interface UserAuth {
    username: string;
    password: string;
}
export declare const kbnTestConfig: {
    getPort(): number | undefined;
    getUrlParts(user?: UserAuth): UrlParts;
    /**
     * Use to get `port:undefined` for assertions if the port is default for the
     * used protocol and thus would be stripped by the browser
     */
    getUrlPartsWithStrippedDefaultPort(user?: UserAuth): UrlParts;
};
export {};
