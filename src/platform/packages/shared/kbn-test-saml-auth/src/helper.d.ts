import type { Role, User } from './types';
export declare const readCloudUsersFromFile: (filePath: string) => Array<[Role, User]>;
export declare const isValidUrl: (value: string) => boolean;
export declare const isValidHostname: (value: string) => boolean;
