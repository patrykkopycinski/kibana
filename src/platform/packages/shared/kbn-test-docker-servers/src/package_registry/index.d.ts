export declare const fleetPackageRegistryDockerImage: string;
/**
 * This is used by CI to set the docker registry port
 * you can also define this environment variable locally when running tests which
 * will spin up a local docker package registry locally for you
 * if this is defined it takes precedence over the `packageRegistryOverride` variable
 */
export declare const dockerRegistryPort: string | undefined;
export declare const packageRegistryDocker: {
    enabled: boolean;
    image: string;
    portInContainer: number;
    port: string | undefined;
    args: string[];
    waitForLogLine: string;
    waitForLogLineTimeoutMs: number;
    preferCached: boolean;
};
