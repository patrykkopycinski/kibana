/**
 * Host info
 */
export interface HostMetadata {
    architecture: string;
    hostname: string;
    os: OSMetadata;
}
/**
 * Operating system info
 */
export interface OSMetadata {
    platform: string;
    version: string;
    family: string;
}
/**
 * Information about the host this process is running on
 */
export declare const host: HostMetadata;
