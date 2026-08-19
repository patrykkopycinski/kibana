export interface Options {
    /**
     * The path to the .text file if available.
     */
    path?: string;
    /**
     * The content of the .text file if available.
     */
    content?: string;
}
export interface SyncOptions extends Options {
    /** the content of the .text file to transform */
    content: string;
}
export interface Result {
    /**
     * The output of the .text-to-CommonJS transform
     */
    source: string;
}
